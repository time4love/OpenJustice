import { evaluatePublication, rowsOf, type PublicationAssessment, type ThesisCheck } from './publicationEvaluation';

// ---------------------------------------------------------------------------
// THE GATE — docs/gf-thesis-flows.md A6 :1584–:1612, T5 :736–:770; thesis step 23.
//
// IT MAPS ONE EVALUATION AND LOADS NOTHING. `evaluatePublication` is PUBLISHABLE(v)'s one evaluation (the R49 sketch §6 R9);
// this module renders it as A6's rows through `rowsOf`, the same rows `publishableVersion`'s verdict is folded from. It
// imports no client, names no delegate and declares no predicate (`test/thesis/scans.test.ts`, one-symbol).
//
// THE PUBLICATION ASSESSOR'S ANSWER IS AN INPUT — null when no rationale was given — so the gate asks no model. After
// publication nothing re-runs (A6 :1610): a reader asking again on a published head reads its rows, and writes nothing.
// ---------------------------------------------------------------------------

/** A6's checks for one version, in A6's order — the seventeen, then document A6 :1535's check 18 (document step 33). */
export async function thesisChecks(versionId: string, assessment: PublicationAssessment | null): Promise<ThesisCheck[]> {
  return rowsOf(await evaluatePublication(versionId, assessment));
}
