/**
 * NORMALISE — thesis flows A1 :1247–:1250: whitespace collapsed to one space, trimmed.
 *
 * ONE IMPORTABLE SYMBOL, IN A MODULE THAT IMPORTS NOTHING. The thesis layer's substring checks, the gap id, the
 * trajectory probe and the presence checks all call it, and a second spelling of it is a scan failure (thesis
 * A7's `one-symbol`). It lives here rather than in the trajectory service because a pure module never gains a
 * dependency: the module that holds a database client depends on this one, never the reverse — A1 as amended
 * at thesis step 18. `test/thesisGuards.test.ts` holds that this file imports nothing.
 */

/** Collapses whitespace so re-indented or re-wrapped text still matches itself. */
export function normaliseClaim(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
