import { JSDOM } from 'jsdom';
import { htmlToText, normaliseText } from './htmlText';
import {
  captureHtml,
  deriveTextFromHtml,
  TEXT_EXTRACTION_VERSION,
  type DerivedText,
} from './captureDocument';
import {
  chromeTextVersion,
  isEmptyRuleset,
  type ChromeRuleset,
} from './chromeRuleset';

// ---------------------------------------------------------------------------
// LEVEL 4 — APPLYING a chrome ruleset. The half that costs a parser.
//
// Split from `chromeRuleset.ts` when the calibration service became the first
// real consumer of a ruleset's IDENTITY and inherited jsdom with it, failing
// every `unit` suite that imported it. A selector is structural, so honouring
// one needs a real parse and a regex over markup cannot do it — but NAMING a
// view does not, and the two had been in one file only because they were
// written in one sitting.
//
// One derivation, two entry points: the text is still produced by the single
// `deriveTextFromHtml`. This adds a step BEFORE it and a version string AFTER
// it, and copies nothing.
// ---------------------------------------------------------------------------

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

/**
 * The share of a capture's derived text a ruleset removed, in `[0, 1]`.
 *
 * ONE IMPORTABLE SYMBOL, and that is the whole reason it exists rather than
 * being two lines at each callsite. Four separate mechanisms read this number —
 * the deviation pause, the sample audit's ordering, the stored observation and
 * whatever the researcher is shown — and a fraction computed slightly
 * differently in two of them is a pause that fires against a baseline it does
 * not share. See [[gf-one-importable-name]].
 *
 * MEASURED OVER THE DERIVED TEXT, not the raw HTML, because that is the input
 * the explosion happens on: `text` is the novelty key. Markup weight varies by
 * an order of magnitude between a hand-written page and a framework's output,
 * so a fraction of the bytes would say nothing comparable across captures.
 *
 * Returns 0 when a capture derives to nothing at all — an empty page cannot have
 * had a share of it removed, and reporting `NaN` as a deviation would pause a
 * scan on a division rather than on a finding.
 */
export function chromeRemovalFraction(derived: DerivedText & { chrome: ChromeApplication }): number {
  const kept = derived.text.length;
  const removed = derived.chrome.removedText.length;
  const total = kept + removed;
  return total === 0 ? 0 : removed / total;
}
