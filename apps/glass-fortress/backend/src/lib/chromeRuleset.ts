import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// LEVEL 4 — THE VIEW. What counts as the document, before it becomes text.
//
// `htmlToText` strips MARKUP, not FURNITURE: it removes script/style bodies and
// then strips every remaining tag while keeping its text, and `nav`, `header`
// and `footer` are on its newline list. So `text` carries advertising,
// navigation, footers and timestamps — and `text` is the novelty key, which
// decides whether a capture becomes a row at all. On a page with a rotating
// block, every capture differs from its predecessor and every capture is stored.
//
// The fix cannot live in the novelty rule, which is CORRECT given its input:
// loosening it would also drop a four-word safety edit, which is smaller than a
// swapped advertisement. So the rule stands and its INPUT changes — this module
// is that change, and it acts on the HTML, before any tag is stripped, because a
// mark must be structural to generalise from a handful of sampled pages to
// thousands.
//
// THE INSTRUMENT IS A HUMAN. A corpus-derived frequency signal was measured on
// 2026-08-29 and it loses real changes: a block held for 80 of 83 captures and
// then genuinely removed scores 96%, so a 95% threshold classifies it chrome and
// the removal disappears — 29 real changes lost on staging, 84 at 80%. Nothing
// here classifies anything. It applies selectors a person chose.
//
// THIS MODULE IS PARSER-FREE, AND THAT IS LOAD-BEARING. A ruleset's IDENTITY is
// a hash over strings; APPLYING one needs a real HTML parser. Keeping them apart
// means a caller that only needs to name a view — the calibration service, an
// MCP tool, a route — does not drag jsdom's ESM-only dependency chain in behind
// it. `chromeRulesetApply.ts` is where the parser lives, and the same mistake in
// `captureDocument` broke every unit suite that transitively reached a capture.
//
// IT REMOVES FROM A VIEW, NEVER FROM THE RECORD. `document` is stored whole and
// is what the anchor commits to (`anchoredCaptureHash` returns `documentHash`),
// so a wrong ruleset produces a wrong view that is re-derived from bytes already
// held. That is what makes a human's mark safe to act on.
// ---------------------------------------------------------------------------

/**
 * The selectors a person marked as furniture on one tracked page.
 *
 * Deliberately not a class, not a model, and not derived from anything: a
 * ruleset is a decision, and this is the shape a decision is stored in.
 */
export interface ChromeRuleset {
  readonly selectors: readonly string[];
}

/** No rules. Deriving under this must be byte-identical to deriving without one. */
export const EMPTY_CHROME_RULESET: ChromeRuleset = { selectors: [] };

/** True when a ruleset would do nothing, so callers can skip parsing entirely. */
export function isEmptyRuleset(ruleset: ChromeRuleset | null | undefined): boolean {
  return !ruleset || ruleset.selectors.length === 0;
}

/**
 * A ruleset's identity — sha256 over its selectors, first 8 hex.
 *
 * ORDER- AND DUPLICATE-INSENSITIVE, because `['a','b']` and `['b','a','b']`
 * remove exactly the same elements and must not produce two version strings for
 * one view. A version that changes without the view changing would report every
 * stored verdict stale for nothing.
 */
export function chromeRulesetId(ruleset: ChromeRuleset): string {
  const canonical = [...new Set(ruleset.selectors.map((s) => s.trim()))].sort().join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 8);
}

/**
 * The extraction version a ruleset produces, given the base rule's version.
 *
 * An EMPTY ruleset returns the base version UNCHANGED, and that is the property
 * the whole corpus depends on: every capture derived so far stays exactly as it
 * is, comparable to every other, with no recompute and no stale verdict.
 *
 * A non-empty ruleset appends its identity, so `survivalTextVersion` can do what
 * it already does — a diff whose two sides were derived under different rules is
 * UNCHECKABLE rather than silently compared. The first diff spanning the
 * un-ruled era and a ruled one will read UNCHECKABLE, which is that state
 * working, not a defect to explain away.
 */
export function chromeTextVersion(baseVersion: string, ruleset: ChromeRuleset | null): string {
  // Narrowed by hand rather than through `isEmptyRuleset`, so no non-null
  // assertion is needed — the two lint ratchets forbid `!` and would forbid the
  // guard that replaces it. See [[gf-two-lint-ratchets]].
  if (ruleset === null || ruleset.selectors.length === 0) return baseVersion;
  return `${baseVersion}+chrome-${chromeRulesetId(ruleset)}`;
}
