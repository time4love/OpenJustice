import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { flagged } from '../../services/evidencePredicates';
import { assess, projectionOf, type PublicationAssessorOutput } from '../../services/publicationAssessor';
import { evaluatePublication, publishabilityOf, rowsOf, type ThesisCheck } from '../../services/publicationEvaluation';
import { assessorMaterial } from '../../services/publishedThesis';
import { trajectoryCurrent } from '../../services/thesisPredicates';
import { resolveTrajectoryCitations, type TrajectoryCurrency } from '../../services/trajectoryCitation';
import { answer, refusal, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// check_publication_readiness({ thesisId, rationale? })
// GATED · PAID IFF A RATIONALE · WRITES NOTHING — docs/gf-thesis-flows.md T5 :736–:770, A4 :1506–:1508, A6 :1584–:1612.
//
// "Every check of A6 with pass/fail, what it examined, and the failure's subject; with a rationale, the assessor's
// verdict in advance; writes nothing." The refusal order is `test/thesis/contract.ts` TOOLS': NO_THESIS alone — a GATED
// read answers without an identity (interaction A5 :1037–:1038).
//
// ONE EVALUATION (the R49 sketch §b1, R9): `evaluatePublication` once, and the rows and the verdict are `rowsOf` and
// `publishabilityOf` over that one value — never `thesisChecks` beside a second evaluation.
//
// THE DRAW, ONLY WITH A RATIONALE: the assessor is asked once, outside any transaction, and its answer is returned
// LABELLED as its opinion (GATED, D15). The spend is UNATTRIBUTED — a paid read writes no row (the researcher's ruling,
// 2026-09-14, Q3). A draw that throws propagates, and nothing was written either way.
//
// AFTER PUBLICATION NOTHING RE-RUNS (A6 :1610–:1611): on a head that IS its published version, FLAGGED and
// STALE_TRAJECTORY are reported as INFORMATION, each read from its own predicate — `flagged` per EVIDENCE citation,
// `trajectoryCurrent` over the ONE resolver's currency — never from the rows of checks 5–10 or 12 (D2).
// ---------------------------------------------------------------------------

export const checkPublicationReadinessSchema = {
  thesisId: z.string().describe('The thesis whose HEAD version is checked'),
  rationale: z
    .string()
    .optional()
    .describe('The argued case for publishing THIS version — given, the publication assessor judges it in advance (a paid call)'),
};

export interface CheckPublicationReadinessInput {
  thesisId: string;
  rationale?: string;
}

/** What a published head's citations have since become — information, gating nothing. */
interface Information {
  FLAGGED: { name: string; reasons: readonly string[] }[];
  STALE_TRAJECTORY: { name: string; currency: TrajectoryCurrency }[];
}

interface Readiness {
  thesisId: string;
  versionId: string;
  checks: ThesisCheck[];
  publishable: boolean;
  assessment: ({ labelled: string } & PublicationAssessorOutput) | null;
  information: Information | null;
}

export async function checkPublicationReadinessHandler(input: CheckPublicationReadinessInput): Promise<string> {
  return answer(async (): Promise<Readiness | Refusal> => {
    const thesis = await prisma.thesis.findUnique({
      where: { id: input.thesisId },
      select: { id: true, provision: true, headVersionId: true, publishedVersionId: true },
    });
    if (thesis === null) {
      return refusal('NO_THESIS', `No thesis ${input.thesisId}. list_theses names the theses you can read.`);
    }
    const head = thesis.headVersionId;
    if (head === null) {
      // A LOUD GUARD (D1): `create_thesis` writes the thesis, its first version and the head in ONE transaction, so a
      // thesis with no head is a malformed row — never a state to grade.
      throw new Error(`checkPublicationReadiness: thesis ${thesis.id} has no head version — a malformed thesis, not a check.`);
    }

    const rationale = input.rationale;
    const assessed =
      rationale === undefined || rationale.trim() === '' ? null : await assess(await assessorMaterial(thesis, head, rationale));

    const evaluation = await evaluatePublication(head, assessed === null ? null : projectionOf(assessed));

    return {
      thesisId: thesis.id,
      versionId: head,
      checks: rowsOf(evaluation),
      publishable: publishabilityOf(evaluation).publishable,
      assessment: assessed === null ? null : { labelled: "the publication assessor's opinion", ...assessed },
      information: head === thesis.publishedVersionId ? await informationOn(head) : null,
    };
  });
}

/** FLAGGED(m) for each EVIDENCE citation and TRAJECTORY_CURRENT for each TRAJECTORY citation of the published head. */
async function informationOn(versionId: string): Promise<Information> {
  const mentions = await prisma.thesisMention.findMany({ where: { versionId }, select: { id: true, kind: true, name: true } });

  const FLAGGED: Information['FLAGGED'] = [];
  for (const mention of mentions.filter((m) => m.kind === 'EVIDENCE')) {
    const report = await flagged(mention.id);
    if (report.flagged) FLAGGED.push({ name: mention.name, reasons: report.reasons });
  }

  const { resolved } = await resolveTrajectoryCitations(mentions.filter((m) => m.kind === 'TRAJECTORY').map((m) => m.name));
  const STALE_TRAJECTORY = resolved
    .filter((t) => !trajectoryCurrent(t.currency))
    .map((t) => ({ name: t.id, currency: t.currency }));

  return { FLAGGED, STALE_TRAJECTORY };
}
