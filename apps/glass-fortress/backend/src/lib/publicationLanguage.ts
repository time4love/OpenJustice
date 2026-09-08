// ---------------------------------------------------------------------------
// WHAT MAKES A PUBLIC-INTEREST STATEMENT ONE, AND NOTHING ELSE.
//
// THE HEDGING HALF LEFT THIS MODULE AT EVIDENCE STEP 11a, in the thesis half of
// the legacy switch. `HEDGE_MARKERS`, `checkFiguresHedged`, `splitSentences`,
// `FigureSentence`, `HedgeCheckResult` and `MAX_SENTENCE_LENGTH` implemented
// check 7 — COMPLIANCE.md Rules 1 and 4 as a per-sentence rule about how a NAMED
// FIGURE may be written about — and they go with the figure: thesis flows T2
// retires `KeyFigure`, and what a record does is the argument, not a role. They
// were legacy twice over besides, walking a TipTap document that thesis A2
// removes in favour of Markdown with citation tokens.
//
// WHAT SURVIVES IS CHECK 8, AND IT SURVIVES WITH NO CALLER until thesis step 23
// rebuilds the gate over A3's predicates. That is deliberate rather than dead
// code: thesis plan §5 tags this file KEEP for exactly this group, and deleting
// it would mean deriving the same rule again, from the same reasoning, six steps
// from now.
// ---------------------------------------------------------------------------

/** The minimum a Rule 5 public-interest statement must be to count as present. */
export const MIN_PUBLIC_INTEREST_STATEMENT_LENGTH = 40;


/**
 * Check 8: the Rule 5 public-interest anchor is present and non-trivial.
 * Structural: a dedicated field, not a phrase hunted for in the body.
 */
export function checkPublicInterestStatement(statement: string | null | undefined): {
  passed: boolean;
  reason: string | null;
} {
  const trimmed = (statement ?? '').trim();
  if (trimmed === '') {
    return { passed: false, reason: 'publicInterestStatement is not set.' };
  }
  if (trimmed.length < MIN_PUBLIC_INTEREST_STATEMENT_LENGTH) {
    return {
      passed: false,
      reason: `publicInterestStatement is ${String(trimmed.length)} characters; at least ${String(MIN_PUBLIC_INTEREST_STATEMENT_LENGTH)} are required to state a public interest.`,
    };
  }
  return { passed: true, reason: null };
}
