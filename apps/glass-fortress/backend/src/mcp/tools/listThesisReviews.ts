import { z } from 'zod';
import type { ListScope } from '../../services/thesisPredicates';
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
//
// `scope` — docs/gf-ui-flows.md §7.1 :320–:324, A4 :1523 as amended (UI-2, 2026-09-15): `mine`, the default, is today's
// answer byte for byte; `all` is REVIEWS over every thesis, each entry with its author and `mine`. NO_RESEARCHER at
// either scope, before any query: REVIEWS(caller) has no subject without a caller, and `all` has no identity either.
// ---------------------------------------------------------------------------

/** ONE optional parameter (§7.1 :320–:321); with none, what the caller owes on the theses they author. */
export const listThesisReviewsSchema = {
  scope: z
    .enum(['mine', 'all'])
    .optional()
    .describe("mine (default) — what you owe on your own theses; all — what every author owes, each entry with its author and whether it is yours"),
};

export interface ListThesisReviewsInput {
  scope?: ListScope;
}

/** THE ONE FUNCTION behind the tool and `GET /api/research/reviews` (UI-3). */
export async function thesisReviewsOf(input: ListThesisReviewsInput = {}): Promise<ThesisReviewList | Refusal<'NO_RESEARCHER'>> {
  const researcher = requireResearcher('Reading what an author owes');
  if ('error' in researcher) return researcher;
  return listThesisReviews(researcher.researcherId, input.scope ?? 'mine');
}

export async function listThesisReviewsHandler(input: ListThesisReviewsInput = {}): Promise<string> {
  return answer(() => thesisReviewsOf(input));
}
