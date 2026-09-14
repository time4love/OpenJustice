import { listThesisReviews, type ThesisReviewList } from '../../services/thesisReviews';
import { requireResearcher } from './openFraming';
import { answer, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// list_thesis_reviews({}) — GATED read — docs/gf-thesis-flows.md T6 :863–:882, A4 :1523–:1525; thesis step 24.
//
// "REVIEWS(caller), oldest first, each with its material and one command; an empty list is an answer." It REFUSES
// NO_RESEARCHER alone, answered from context BEFORE ANY QUERY: REVIEWS(caller) has no subject without a caller.
//
// GATED, LIKE `list_evidence_reviews`: it names the draft citations of an author's unpublished theses — working state a
// public read never reveals. A READ THAT RETURNS WORK AND CHANGES NOTHING.
// ---------------------------------------------------------------------------

/** A4 gives it no parameters: it is every thing the caller owes on the theses they author. */
export const listThesisReviewsSchema = {};

export async function listThesisReviewsHandler(): Promise<string> {
  return answer(async (): Promise<ThesisReviewList | Refusal> => {
    const researcher = requireResearcher('Reading what an author owes');
    if ('error' in researcher) return researcher;
    return listThesisReviews(researcher.researcherId);
  });
}
