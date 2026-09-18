import type { ChainAnswer } from '@/types/corpus';

// Hand-written from the appendix (plan §4 :880–:883), never captured from a live response, so the fixture
// asserts what the CONTRACT says rather than what one environment answered on one day. Each is TYPED, so
// `tsc` checks it against `types/corpus.ts` — a fixture that drifts from the appendix fails the build.

/** CHAIN_UNAVAILABLE — a verdict about the CHECK, never about the record (A4 :1115). */
export const chainUnavailable: ChainAnswer = {
  "available": false,
  "reason": "CHAIN_UNAVAILABLE"
};
