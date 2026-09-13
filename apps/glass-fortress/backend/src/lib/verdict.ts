import { normaliseClaim } from './normalise';

/**
 * THE ONE VERDICT RULE — thesis flows T1 `:258–:262`, as document flows amends it.
 *
 * "The phrase it attributes to the record, checked against that record's CURRENT content by the
 * ONE verdict rule — never a second spelling." Document flows `:359–:365` states the third value
 * and why it exists: "Against a version whose content is the bytes there is no text to search, and
 * the rule returns neither: the assertion is recorded UNCHECKED, with the reason, and shown as such
 * — never silently PRESENT, never a model reading an image to grade another model."
 *
 * BUILT HERE, AT THESIS STEP 19, BY A PLAN STEP. `docs/gf-document-refactor-plan.md:56` and `:162`
 * place the three values at this step; `:411` names the callers — this audit, the critic's audit
 * (step 22), the publication assessor's (23) and `PassageVerdict` (document 29) — and assigns the
 * one-spelling SCAN to document step 29, not here.
 *
 * IT IS NOT `audit_thesis_claims`' RULE, AND THAT TOOL IS UNTOUCHED. `quoteVerdict`
 * (`services/thesisClaimAudit.ts`) folds FETCHED ARCHIVE captures, by the dates a sentence names,
 * into FIVE values. It does not spell PRESENT | ABSENT | UNCHECKED, so it is not a second spelling
 * of this symbol, and "audit_thesis_claims is unchanged" (thesis T5 `:767`, A4 `:1529–:1531`,
 * evidence `:1233`) holds literally — of the code, not merely of the behaviour.
 *
 * PURE, AND IT IMPORTS ONLY THE PURE MODULE. Thesis A1 `:1247–:1250` as amended at step 18: a
 * module that holds a database client depends on the pure one, never the reverse. The shape is
 * `lib/htmlText.ts`' `normaliseForPresence` — a CALL of `normaliseClaim`, never a second
 * `replace(/\s+/g, ' ')`, which thesis A7's `one-symbol` scan would catch.
 */
export type Verdict = 'PRESENT' | 'ABSENT' | 'UNCHECKED';

/**
 * Is `phrase` present in `text`, with whitespace collapsed on both sides?
 *
 * `text` is null where the content cannot be searched at all — a document whose version is bytes
 * (document flows `:359–:365`), or an assertion naming a record the caller never supplied. Null is
 * NOT an empty string: an empty text is a text that has been read and contains nothing, and a
 * phrase is genuinely ABSENT from it.
 */
export function verdict(phrase: string, text: string | null): Verdict {
  if (text === null) return 'UNCHECKED';
  return normaliseClaim(text).includes(normaliseClaim(phrase)) ? 'PRESENT' : 'ABSENT';
}
