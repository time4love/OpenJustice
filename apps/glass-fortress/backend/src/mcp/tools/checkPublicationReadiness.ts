import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { assess, projectionOf, type PublicationAssessorOutput } from '../../services/publicationAssessor';
import { evaluatePublication, publishabilityOf, rowsOf, type ThesisCheck } from '../../services/publicationEvaluation';
import { documentVerificationOf } from '../../services/documentStanding';
import { assessorMaterial } from '../../services/publishedThesis';
import { flaggedCitations, staleTrajectories } from '../../services/thesisPredicates';
import type { TrajectoryCurrency } from '../../services/trajectoryCitation';
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
// `publishabilityOf` over that one value — never `thesisChecks` beside a second evaluation. VERIFIED(d) for the head's
// documents is read from the chain and handed in (document step 34, the researcher's Q1) — a read, free.
//
// THE DRAW, ONLY WITH A RATIONALE: the assessor is asked once, outside any transaction, and its answer is returned
// LABELLED as its opinion (GATED, D15). The spend is UNATTRIBUTED — a paid read writes no row (the researcher's ruling,
// 2026-09-14, Q3). A draw that throws propagates, and nothing was written either way.
//
// AFTER PUBLICATION NOTHING RE-RUNS (A6 :1610–:1611): on a head that IS its published version, FLAGGED and
// STALE_TRAJECTORY are reported as INFORMATION, each read from its own predicate — `flagged` per EVIDENCE citation,
// `trajectoryCurrent` over the ONE resolver's currency — never from the rows of checks 5–10 or 12 (D2). Both through the
// two readings REVIEWS owes them by, `flaggedCitations` and `staleTrajectories` (thesis step 24, the R50 sketch §6-D16).
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

    const evaluation = await evaluatePublication(
      head,
      assessed === null ? null : projectionOf(assessed),
      await documentVerificationOf(head),
    );

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

/**
 * FLAGGED(m) for each EVIDENCE citation and TRAJECTORY_CURRENT for each TRAJECTORY citation of the published head.
 *
 * A trajectory NO stored pass holds is not STALE_TRAJECTORY and is not listed here — and it is not silent: the SAME reply
 * carries the gate's rows over this head, and check 11 TRAJECTORIES_RESOLVE names it as its failure's subject.
 */
async function informationOn(versionId: string): Promise<Information> {
  const FLAGGED = (await flaggedCitations(versionId)).map((citation) => ({ name: citation.name, reasons: citation.reasons }));
  const { stale } = await staleTrajectories(versionId);
  return { FLAGGED, STALE_TRAJECTORY: stale.map((t) => ({ name: t.id, currency: t.currency })) };
}
