import type { ChainAnswer } from '@/types/corpus';

// Hand-written from the appendix (plan §4 :880–:883). RE-WRITTEN 2026-09-19 alongside `chain.ts`.

/**
 * CHAIN_UNAVAILABLE — a verdict about the CHECK, never about the record (A4 :1115).
 *
 * THE WIRE SPELLING IS `{ error, code }` AT 503, which is what `parseChainAnswer` reads; `available: false`
 * is the FRONTEND's discriminant, produced by the parser and never sent by the route. The two are kept apart
 * deliberately: a fixture carrying `available` would let a parser that read that field look correct.
 */
export const chainUnavailable: ChainAnswer = { available: false, reason: 'CHAIN_UNAVAILABLE' };

/** The 503 body the route actually sends, which is what the parser is given (`toolRoute.ts`' refusal shape). */
export const chainUnavailableWire = { error: 'The registry could not be reached.', code: 'CHAIN_UNAVAILABLE' };
