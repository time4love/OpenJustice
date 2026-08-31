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

// ---------------------------------------------------------------------------
// THE OUTLINE — what the researcher clicks, instead of the page itself.
//
// Marking is a perception task, so the capture is rendered for LOOKING. But a
// click-to-select overlay inside an archived document needs `allow-scripts` on
// the iframe, and these are captures of real sites carrying real analytics and
// advertising tags: that permission runs their code in the researcher's
// authenticated origin. So the render is sandboxed and inert, and SELECTION
// happens against this structure, which executes nothing anywhere.
// ---------------------------------------------------------------------------

/** One element, and the selector that would mark it. */
export interface OutlineNode {
  /** A CSS selector matching this element in this document. */
  selector: string;
  tag: string;
  id: string | null;
  classes: readonly string[];
  /** Normalised text length of this element's whole subtree. */
  textLength: number;
  /**
   * True when the selector needed `:nth-of-type` to be unique.
   *
   * SURFACED BECAUSE IT PREDICTS FAILURE. A mark must generalise from a handful
   * of sampled pages to thousands, and only STRUCTURE can. A positional selector
   * is the kind that silently stops meaning the same thing after a redesign —
   * which the null check would later report as "matched nothing since", long
   * after the fact. Better the researcher sees it before committing.
   */
  positional: boolean;
  children: OutlineNode[];
}

export interface DocumentOutline {
  /**
   * Never null: jsdom parses as `text/html`, and the HTML parser inserts a
   * `<body>` even for input that is not HTML at all. An optional root would be
   * a case no caller can ever reach, which the debt ratchet correctly refuses.
   */
  root: OutlineNode;
  /** True when depth or node count cut the tree short. NEVER silent. */
  truncated: boolean;
}

const SAFE_NAME = /^[A-Za-z_-][\w-]*$/;

/**
 * A selector for one element, preferring the structural over the positional.
 *
 * Order is id, then tag-with-classes, then a positional fallback — the order in
 * which they survive a redesign. Names that are not plain identifiers are
 * skipped rather than escaped: an unescaped selector throwing at match time
 * would cost a capture, and this module has no business shipping a hand-rolled
 * CSS escaper.
 */
function selectorFor(el: Element, doc: Document): { selector: string; positional: boolean } {
  const tag = el.tagName.toLowerCase();
  const id = el.getAttribute('id');
  if (id !== null && SAFE_NAME.test(id) && doc.querySelectorAll(`#${id}`).length === 1) {
    return { selector: `#${id}`, positional: false };
  }

  const classes = [...el.classList].filter((c) => SAFE_NAME.test(c));
  if (classes.length > 0) {
    const candidate = `${tag}.${classes.join('.')}`;
    if (doc.querySelectorAll(candidate).length === 1) {
      return { selector: candidate, positional: false };
    }
  }

  // Positional, and said so. Counted among siblings of the SAME TAG rather than
  // all siblings, so an inserted comment or text node cannot shift it.
  const siblings = [...(el.parentElement?.children ?? [])].filter((c) => c.tagName === el.tagName);
  const index = siblings.indexOf(el) + 1;
  const parent = el.parentElement;
  const parentPart =
    parent && parent.tagName !== 'HTML' ? `${selectorFor(parent, doc).selector} > ` : '';
  return { selector: `${parentPart}${tag}:nth-of-type(${String(index)})`, positional: true };
}

/**
 * The document's element structure, bounded.
 *
 * BOUNDED, AND IT SAYS WHEN IT CUT. A page with ten thousand elements would
 * otherwise produce a tree nobody can use inside a response nobody can send —
 * and a tree truncated SILENTLY would be a researcher marking against a document
 * they cannot see all of, which is the same class of error as the diff truncated
 * at eight chunks that this whole rebuild descends from.
 */
export function documentOutline(
  html: string,
  options: { maxDepth?: number; maxNodes?: number } = {},
): DocumentOutline {
  const maxDepth = options.maxDepth ?? 6;
  const maxNodes = options.maxNodes ?? 400;
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  let nodes = 0;
  let truncated = false;

  const walk = (el: Element, depth: number): OutlineNode => {
    nodes += 1;
    const { selector, positional } = selectorFor(el, doc);
    const node: OutlineNode = {
      selector,
      tag: el.tagName.toLowerCase(),
      id: el.getAttribute('id'),
      classes: [...el.classList],
      textLength: normaliseText(htmlToText(el.outerHTML)).length,
      positional,
      children: [],
    };
    if (depth >= maxDepth) {
      if (el.children.length > 0) truncated = true;
      return node;
    }
    for (const child of el.children) {
      if (nodes >= maxNodes) {
        truncated = true;
        break;
      }
      node.children.push(walk(child, depth + 1));
    }
    return node;
  };

  return { root: walk(doc.body, 0), truncated };
}

/**
 * The document with its executable content removed, for rendering.
 *
 * DEFENCE IN DEPTH, NOT THE DEFENCE. `sandbox=""` on the iframe is what actually
 * stops scripts running; this removes the single point of failure rather than
 * replacing it, because one attribute forgotten in one render is all it takes.
 *
 * IT IS NOT WHAT THE RULES ACT ON. The ruleset is applied to the stored
 * document, and the outline above is built from the real one. A selector
 * matching a `<script>` therefore still works — it simply has nothing to show.
 */
export function inertDocument(html: string): string {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  for (const el of document.querySelectorAll('script, iframe, object, embed')) {
    el.remove();
  }
  for (const el of document.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    }
  }
  return dom.serialize();
}
