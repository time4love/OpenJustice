import { createHash } from 'crypto';
import { JSDOM } from 'jsdom';
import { htmlToText, normaliseText } from './htmlText';
import {
  captureHtml,
  deriveTextFromHtml,
  TEXT_EXTRACTION_VERSION,
  type DerivedText,
} from './captureDocument';

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
 * What applying a ruleset to one capture did.
 *
 * `removedText` EXISTS FOR THE HUMAN, and it is the half that matters. A person
 * shown only the article that survived will approve a ruleset that quietly
 * swallowed a paragraph — over-matching is the dangerous direction and it is
 * invisible in the kept text. Whatever renders a capture for marking must show
 * this beside it.
 *
 * `matchCounts` is the NULL CHECK the design asks for, and the only automated
 * part of this level: a selector at 0 no longer matches the page, which is what
 * a redesign looks like. It is a count, not a judgement — nothing here decides
 * whether the ruleset is right.
 */
export interface ChromeApplication {
  html: string;
  /** Normalised text of everything removed. Empty string when nothing matched. */
  removedText: string;
  /** Elements matched, per selector, in the order the ruleset lists them. */
  matchCounts: Readonly<Record<string, number>>;
  /**
   * Selectors the parser rejected.
   *
   * Reported rather than thrown: a typo in one selector must not cost a capture,
   * and it must not silently behave as "matched nothing" either — those are
   * different facts and a caller may treat them differently. Distinguishing them
   * is why this is not folded into `matchCounts` as a zero.
   */
  invalidSelectors: readonly string[];
}

/**
 * Remove every element a ruleset selects, and report what went.
 *
 * PURE, and it parses the HTML rather than pattern-matching it: a selector is
 * structural by definition, and a regex over markup cannot honour one. The cost
 * is a parse per capture, paid only when a ruleset is non-empty.
 */
export function applyChromeRuleset(html: string, ruleset: ChromeRuleset): ChromeApplication {
  if (isEmptyRuleset(ruleset)) {
    return { html, removedText: '', matchCounts: {}, invalidSelectors: [] };
  }

  const dom = new JSDOM(html);
  const { document } = dom.window;
  const matchCounts: Record<string, number> = {};
  const invalidSelectors: string[] = [];
  const removedFragments: string[] = [];

  // Returns null for a selector the parser rejects, so the caller can tell a
  // BROKEN rule from one that matched nothing. Annotating the result as
  // `ReturnType<typeof document.querySelectorAll>` would name the whole
  // overloaded signature, whose last overload is deprecated — inference picks
  // the string overload, which is not.
  const tryQuery = (selector: string): Element[] | null => {
    try {
      return [...document.querySelectorAll(selector)];
    } catch {
      return null;
    }
  };

  for (const selector of ruleset.selectors) {
    const matched = tryQuery(selector);
    if (matched === null) {
      // A malformed selector. Recorded and skipped — see `invalidSelectors`.
      invalidSelectors.push(selector);
      continue;
    }
    matchCounts[selector] = matched.length;
    for (const element of matched) {
      // The element's own markup, so the removed text is derived by the SAME
      // path as the kept text. Reading `textContent` here instead would give the
      // reviewer a differently-derived string from the one the rules acted on.
      removedFragments.push(element.outerHTML);
      element.remove();
    }
  }

  return {
    html: dom.serialize(),
    removedText: normaliseText(removedFragments.map((f) => htmlToText(f)).join('\n\n')),
    matchCounts,
    invalidSelectors,
  };
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

/**
 * A capture's text, derived under a ruleset — the Level 4 entry point.
 *
 * LIVES HERE RATHER THAN IN `captureDocument` because it needs a real HTML
 * parser, and that module is imported by almost everything that touches a
 * capture. Putting `jsdom` behind it made every `unit` suite that transitively
 * reaches a capture fail to parse, since jsdom's dependency chain is ESM-only.
 * Only the scan and marking paths import this file, so only they pay for it.
 *
 * ONE DERIVATION, TWO ENTRY POINTS. The text itself is still produced by
 * `deriveTextFromHtml`, exactly as the un-ruled path produces it — this adds a
 * step BEFORE it and a version string AFTER it, and copies nothing.
 */
export function deriveTextUnderRuleset(
  bytes: Buffer,
  contentType: string | null | undefined,
  contentEncoding: string | null | undefined,
  ruleset: ChromeRuleset,
): DerivedText & { chrome: ChromeApplication } {
  const html = captureHtml({
    document: bytes,
    documentContentType: contentType ?? null,
    documentContentEncoding: contentEncoding ?? null,
  });
  const chrome = applyChromeRuleset(html, ruleset);
  return {
    ...deriveTextFromHtml(chrome.html, chromeTextVersion(TEXT_EXTRACTION_VERSION, ruleset)),
    chrome,
  };
}
