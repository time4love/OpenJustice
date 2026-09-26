import type { VerifiedReport } from '../src/services/evidencePredicates';

// ---------------------------------------------------------------------------
// THE SERVED `notEvaluable` UNION — evidence A4 :1106 as CONFORMED 2026-09-26 (the researcher, R84 Q12): TWO reasons.
// `resolve_record` serves `verified()`'s reason to a stranger, and the frontend narrows the same two
// (`frontend/src/types/corpus.ts` NOT_EVALUABLE_REASONS). A third member would be a word the page cannot render.
//
// HELD BY THE COMPILER, in its own file so the failure is this file's and sinks no behavioural case: `Record<Served,
// true>` must name EVERY member — a union that gains one fails to compile here, and one that loses one does too.
// ---------------------------------------------------------------------------

type Served = Extract<VerifiedReport, { evaluable: false }>['reason'];

describe('the served notEvaluable union (evidence A4 :1106)', () => {
  it('is exactly NOT_PROMOTED and MALFORMED_RECORD_KEY — CHAIN_NOT_ASKED is a conjunct reason, never served', () => {
    const every: Record<Served, true> = { NOT_PROMOTED: true, MALFORMED_RECORD_KEY: true };
    expect(Object.keys(every).sort()).toEqual(['MALFORMED_RECORD_KEY', 'NOT_PROMOTED']);
  });
});
