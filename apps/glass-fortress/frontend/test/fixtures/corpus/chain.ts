import type { ChainAnswer } from '@/types/corpus';

// Hand-written from the appendix (plan §4 :880–:883), never captured from a live response, so the fixture
// asserts what the CONTRACT says rather than what one environment answered on one day. Each is TYPED, so
// `tsc` checks it against `types/corpus.ts` — a fixture that drifts from the appendix fails the build.

/** `check_on_chain_status`' answer for a registered, attributed capture (A4 :1111–:1115). */
export const chainAnswer: ChainAnswer = {
  "available": true,
  "isRegistered": true,
  "attributed": true,
  "anchoredHash": "3333333333333333333333333333333333333333333333333333333333333333",
  "documentHash": "3333333333333333333333333333333333333333333333333333333333333333",
  "verdict": "VERIFIED",
  "verdictVersion": "verdict-fixture-1"
};
