import { listEvidenceReviews, type ReviewsList } from '../../services/evidenceReviews';
import { answer, type EvidenceWriteCode, type Refusal } from './evidenceRefusals';
import { requireResearcher } from './openDebate';

// ---------------------------------------------------------------------------
// list_evidence_reviews({}) — GATED read — docs/gf-evidence-flows.md §6 and A4.
//
// "REFUSES NOTHING BUT NO_RESEARCHER" (A4), and that one answered FROM MEMORY
// BEFORE ANY QUERY: an anonymous call costs no round trip and learns nothing
// from the difference between two refusals.
//
// GATED, LIKE `get_debate` AND THE WALK'S THREE READS. It is a researcher's
// working state, and it names DRAFT citations of unpublished theses — which is
// precisely the citation a REAFFIRM protects, and precisely what a corpus read
// may never reveal (§5). It is not public and it never will be.
//
// A READ THAT RETURNS WORK, NOT A TOOL THAT CHANGES ANYTHING. Nothing here
// writes; `test/reviews.test.ts` observes the double's write log empty after a
// call. NO AUTOMATIC RE-AFFIRMATION, EVER: this tool cannot decide anything, and
// the two commands it hands back are the researcher's to paste.
// ---------------------------------------------------------------------------

/** A4 gives it no parameters: it is every NEEDS_REVIEW record across the corpus. */
export const listEvidenceReviewsSchema = {};

export async function listEvidenceReviewsHandler(): Promise<string> {
  return answer(async (): Promise<ReviewsList | Refusal<EvidenceWriteCode>> => {
    const researcher = requireResearcher('Reading what a researcher owes');
    if ('error' in researcher) return researcher;
    return listEvidenceReviews();
  });
}
