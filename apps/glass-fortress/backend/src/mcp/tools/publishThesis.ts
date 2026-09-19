import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asJsonColumn } from '../../lib/jsonColumn';
import { publicPage } from '../../services/evidencePredicates';
import { assess, projectionOf } from '../../services/publicationAssessor';
import { evaluatePublication, publishabilityOf, rowsOf, type PublicationEvaluation } from '../../services/publicationEvaluation';
import { assessorMaterial } from '../../services/publishedThesis';
import { WRITE_TRANSACTION } from '../../walk/pageLog';
import { requireResearcher } from './openFraming';
import { answer, refusal, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// publish_thesis({ thesisId, rationale, publicInterestStatement? })
// WRITE · PAID, ONCE — docs/gf-thesis-flows.md T5 :772–:789, A4 :1510–:1514, §12 :1135 and :1141; thesis step 23.
//
// "readiness · → the assessor · a PublicationAttempt, refused or not · the pin." The refusal order is
// `test/thesis/contract.ts` TOOLS':
//
//   NO_RESEARCHER · NO_THESIS · NOT_AUTHOR · REASON_REQUIRED · NOTHING_NEW · NOT_PUBLISHABLE
//
// NOTHING BEFORE THE FIVE (the R49 sketch §0e): a refusal decided before the assessor answers writes nothing and spends
// nothing — an attempt's `assessment` is non-null (A2 :1334). A thesis with NO head is a LOUD GUARD after REASON_REQUIRED
// (D3), never NOTHING_NEW: `create_thesis` writes the head with the thesis.
//
// THE STATEMENT BEFORE THE GATE (the researcher's ruling, 2026-09-14, Q5): past the five refusals and before the draw, so a
// refused attempt keeps the approved words — and a draw that throws leaves them stored (D4).
//
// EVERY CALL PAST THE FIVE SPENDS ONCE AND WRITES ONE ATTEMPT (§12 :1141; FOUND 2026-09-14). The draw sits outside any
// transaction; ONE evaluation decides the rows and the verdict (R9); `opened` is read BEFORE the write (D13). Then THE WRITE,
// ONE transaction, ALWAYS (the researcher's §9-4 (c), R10):
//
//   the gate refused      → ONE REFUSED attempt, `refusedBy` the HARD failures in A6's order
//   publishable           → the pin's COMPARE-AND-SET FIRST, on the head AND the pin as this call read them
//       matched             → ONE PUBLISHED attempt beside the pin, `publishedAt`, `publishedById`
//       matched nothing     → ONE REFUSED attempt, `refusedBy: ['HEAD_VERSION']` — the premise the race broke
//
// The callback RETURNS on every arm, so every arm COMMITS its attempt: a lost race is a refusal that writes its record,
// unlike the version write's thrown `Lost`, which must write nothing. THE ONE WRITER OF THE PIN (`invariants.test.ts` row
// 6); its one nuller is `unpublish_thesis`. NO CHAIN WRITE — publication anchors nothing (T5 :791–:800).
// ---------------------------------------------------------------------------

export const publishThesisSchema = {
  thesisId: z.string().describe('The thesis whose HEAD version is published — yours'),
  rationale: z.string().describe('The argued case for publishing THIS version, in the words you approved'),
  publicInterestStatement: z
    .string()
    .optional()
    .describe('The public-interest statement, as approved — stored on the thesis before the gate is asked'),
};

export interface PublishThesisInput {
  thesisId: string;
  rationale: string;
  publicInterestStatement?: string;
}

interface Published {
  thesisId: string;
  publishedVersionId: string;
  contentHash: string;
  publishedAt: Date;
  overObjection: boolean;
  opened: string[];
}

type Outcome = 'PUBLISHED' | 'REFUSED_BY_THE_GATE' | 'LOST_THE_RACE';

export async function publishThesisHandler(input: PublishThesisInput): Promise<string> {
  return answer(async (): Promise<Published | Refusal> => {
    const researcher = requireResearcher('Publishing a thesis');
    if ('error' in researcher) return researcher;

    const thesis = await prisma.thesis.findUnique({
      where: { id: input.thesisId },
      select: { id: true, provision: true, createdById: true, headVersionId: true, publishedVersionId: true, publicInterestStatement: true },
    });
    if (thesis === null) {
      return refusal('NO_THESIS', `No thesis ${input.thesisId}. list_theses names your theses.`);
    }
    if (thesis.createdById !== researcher.researcherId) {
      return refusal('NOT_AUTHOR', `Thesis ${thesis.id} is not yours. A thesis is published by its author.`);
    }
    if (input.rationale.trim() === '') {
      return refusal(
        'REASON_REQUIRED',
        'Publishing records the argued case for publishing THIS version — what it claims, what it rests on, where it ' +
          'stops. Nothing was written and nothing was spent.',
      );
    }
    const head = thesis.headVersionId;
    if (head === null) {
      throw new Error(`publishThesis: thesis ${thesis.id} has no head version — a malformed thesis, not a refusal.`);
    }
    if (head === thesis.publishedVersionId) {
      return refusal(
        'NOTHING_NEW',
        `Version ${head} is already the published version of thesis ${thesis.id}. Write a new version to publish again. ` +
          'Nothing was written and nothing was spent.',
      );
    }

    // A BLANK STATEMENT IS NOT GIVEN (the ruling on R49 chunk 3, M3): it never overwrites the approved words stored.
    const statement = input.publicInterestStatement;
    if (statement !== undefined && statement.trim() !== '' && statement !== thesis.publicInterestStatement) {
      await prisma.thesis.update({ where: { id: thesis.id }, data: { publicInterestStatement: statement } });
    }

    // THE PAID DRAW — once, outside any transaction, after every refusal that spends nothing.
    const assessed = await assess(await assessorMaterial(thesis, head, input.rationale));

    const evaluation = await evaluatePublication(head, projectionOf(assessed));
    const { publishable, failed } = publishabilityOf(evaluation);
    const opened = publishable ? await pagesOpenedBy(evaluation) : [];

    const now = new Date();
    const verdict = assessed.verdict === 'NOT_REACHED' ? null : assessed.verdict;
    const attempt = {
      thesisId: thesis.id,
      versionId: head,
      rationale: input.rationale,
      assessment: asJsonColumn(assessed),
      verdict,
      researcherId: researcher.researcherId,
      // ONE INSTANT for the act: the PUBLISHED attempt and the pin's `publishedAt` agree by construction.
      createdAt: now,
    };

    const outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
      if (!publishable) {
        await tx.publicationAttempt.create({ data: { ...attempt, outcome: 'REFUSED', refusedBy: failed }, select: { id: true } });
        return 'REFUSED_BY_THE_GATE';
      }
      const { count } = await tx.thesis.updateMany({
        where: { id: thesis.id, headVersionId: head, publishedVersionId: thesis.publishedVersionId },
        data: { publishedVersionId: head, publishedAt: now, publishedById: researcher.researcherId },
      });
      if (count === 1) {
        await tx.publicationAttempt.create({ data: { ...attempt, outcome: 'PUBLISHED', refusedBy: [] }, select: { id: true } });
        return 'PUBLISHED';
      }
      await tx.publicationAttempt.create({
        data: { ...attempt, outcome: 'REFUSED', refusedBy: ['HEAD_VERSION'] },
        select: { id: true },
      });
      return 'LOST_THE_RACE';
    }, WRITE_TRANSACTION);

    if (outcome === 'REFUSED_BY_THE_GATE') return refusal('NOT_PUBLISHABLE', gateRefusal(evaluation, failed));
    if (outcome === 'LOST_THE_RACE') return refusal('NOT_PUBLISHABLE', await raceRefusal(thesis.id, head));

    return {
      thesisId: thesis.id,
      publishedVersionId: head,
      contentHash: evaluation.headed.head.version.contentHash,
      publishedAt: now,
      overObjection: verdict === 'DISPUTES',
      opened,
    };
  });
}

const SPENT = "This call's assessment was spent, and its attempt was recorded, refused.";

/**
 * The pages this act makes PUBLIC_PAGE (T5 :788, :837–:838): each distinct page of the head's EVIDENCE records for which
 * PUBLIC_PAGE — CALLED — is false before the write. True after the commit by construction: the attempt is PUBLISHED and
 * every publishable citation is a PROMOTED record. Unlocked: a same-instant publication elsewhere reports it too (D13).
 */
async function pagesOpenedBy(evaluation: PublicationEvaluation): Promise<string[]> {
  const pages = new Map(evaluation.headed.head.records.map(({ record }) => [record.page.id, record.page.url]));
  const opened: string[] = [];
  for (const [pageId, url] of pages) {
    if (!(await publicPage(pageId))) opened.push(url);
  }
  return opened;
}

/**
 * NOT_PUBLISHABLE from the gate: each check the FOLD failed — `publishabilityOf(…).failed`, the ids the attempt's
 * `refusedBy` records — with its row's subjects (§0g); or, for an evidence half that cannot be graded, which citations.
 * Which rows fail is never decided here: the hard-FAIL rule is spelled once, in `publicationEvaluation.ts`.
 */
function gateRefusal(evaluation: PublicationEvaluation, failed: readonly string[]): string {
  const rows = rowsOf(evaluation);
  const failures = failed.map((id) => {
    const row = rows.find((r) => r.id === id);
    if (row === undefined) {
      throw new Error(`publishThesis: the fold failed ${id}, which no row of the same evaluation carries — a malformed fold.`);
    }
    return `${id}: ${row.failures.map((f) => JSON.stringify(f)).join('; ')}`;
  });
  const ungraded =
    evaluation.report.evaluable
      ? []
      : [`the evidence half cannot be graded (${evaluation.report.reason}): ${evaluation.report.notEvaluable.map((m) => m.fileHash).join(', ')}`];
  return (
    `Version ${evaluation.versionId} is not publishable. ${[...failures, ...ungraded].join(' · ')}. ` +
    `check_publication_readiness shows every check. ${SPENT}`
  );
}

/** NOT_PUBLISHABLE from a lost compare-and-set — WHY, read after the commit (A6 :1592: HEAD_VERSION's premise broke). */
async function raceRefusal(thesisId: string, head: string): Promise<string> {
  const after = await prisma.thesis.findUnique({ where: { id: thesisId }, select: { headVersionId: true, publishedVersionId: true } });
  if (after === null) {
    // A LOUD GUARD: nothing deletes a thesis (RESTRICT), and this call just committed an attempt naming it.
    throw new Error(`publishThesis: thesis ${thesisId} is gone after its attempt committed — a malformed state, not a race.`);
  }
  const why =
    after.headVersionId !== head
      ? `the head moved to ${String(after.headVersionId)} while this call was being assessed`
      : after.publishedVersionId === head
        ? `version ${head} was already published by another call while this one was being assessed`
        : `the published version moved to ${String(after.publishedVersionId)} while this call was being assessed`;
  return `Version ${head} was not published: ${why}. ${SPENT} Read the thesis again before publishing.`;
}
