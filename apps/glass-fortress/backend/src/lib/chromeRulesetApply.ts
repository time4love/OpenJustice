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
  /**
   * What this element IS, in words a person can act on.
   *
   * THE TREE WAS UNUSABLE WITHOUT THIS. The first researcher to see it reported
   * that the structure was "very technical, using cryptic code, and it is very
   * hard to understand what to click" — and they were right: a selector is what
   * the SYSTEM needs to act, not what a HUMAN needs to choose. Level 4 rests on
   * marking being a PERCEPTION task, and a page's furniture is not perceivable
   * through `div.footer-top > div:nth-of-type(1)`.
   *
   * Derived, in order, from: the landmark role a semantic tag or `role`
   * attribute declares, an `aria-label`, and finally a short preview of the
   * element's own text. The selector is still carried, and is still the thing a
   * mark is made of — it just stops being the only thing on offer.
   */
  label: string;
  /**
   * Selectors of the single-child wrapper elements folded into this node.
   *
   * NOT HIDDEN, BECAUSE COLLAPSING IS STILL A CHOICE MADE FOR THE RESEARCHER.
   * Marking a pass-through wrapper and marking its only child remove exactly
   * the same characters, so offering both is noise — but the researcher is
   * entitled to know which levels the tree skipped on their behalf. Empty for
   * the overwhelming majority of nodes.
   */
  collapsedFrom: readonly string[];
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
  /**
   * Text characters sitting inside nodes whose children were NOT expanded.
   *
   * `truncated` says the tree was cut; this says how much of the document the
   * cut put out of reach, which is the number that tells a researcher whether
   * the cut mattered. On the MOH vaccine page the old depth bound made this
   * 3,587 of 4,731 characters — 76% — while reporting only a bare `true`.
   */
  unreachableTextLength: number;
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
 * Landmark tags that describe themselves, and need no text preview.
 *
 * The value type says `| undefined` because a LOOKUP CAN MISS — most tags are
 * not landmarks. Without it the indexed read types as `string`, the `??` after
 * it becomes unreachable, and the debt ratchet correctly calls the guard dead:
 * the condition was real and the type was lying about it.
 */
const LANDMARKS: Readonly<Record<string, string | undefined>> = {
  nav: 'navigation',
  header: 'header',
  footer: 'footer',
  main: 'main content',
  aside: 'sidebar',
  article: 'article',
  section: 'section',
  form: 'form',
  table: 'table',
  figure: 'figure',
};

/** The longest text preview a label carries. Enough to recognise, not to read. */
const LABEL_PREVIEW = 60;

/**
 * What to call this element on screen.
 *
 * A LANDMARK BEATS A PREVIEW, because "navigation" is what the researcher is
 * looking for and the nav's first link is not. Falls through to the element's
 * own text only when nothing has declared what it is.
 */
function labelFor(el: Element, text: string): string {
  const tag = el.tagName.toLowerCase();
  const aria = el.getAttribute('aria-label')?.trim();
  const role = el.getAttribute('role')?.trim().toLowerCase();
  const landmark = LANDMARKS[tag] ?? (role !== undefined && role !== '' ? role : undefined);

  if (aria !== undefined && aria !== '') {
    return landmark === undefined ? aria : `${landmark} — ${aria}`;
  }
  if (landmark !== undefined) return landmark;

  const preview = text.trim().slice(0, LABEL_PREVIEW);
  if (preview === '') return `<${tag}>`;
  return text.trim().length > LABEL_PREVIEW ? `${preview}…` : preview;
}

/**
 * A pass-through wrapper: exactly one element child, and no text of its own.
 *
 * Marking it and marking its child remove IDENTICAL characters, so it is not a
 * distinct choice — it is a level of nesting the researcher has to descend for
 * nothing. Government templates are built almost entirely of these: the MOH
 * vaccine page spends five of them getting from `<body>` to the article.
 */
function isPassThrough(el: Element, text: string): boolean {
  if (el.children.length !== 1) return false;
  // `.item(0)` rather than `[0]`: the DOM types an indexed read on an
  // HTMLCollection as `Element`, which makes the guard below look dead, while
  // `item()` is `Element | null` by specification. Same shape as the `.at(0)`
  // rule the two debt ratchets forced everywhere else — the spelling that is
  // honest about absence is the one that satisfies both.
  const only = el.children.item(0);
  if (only === null) return false;
  return normaliseText(htmlToText(only.outerHTML)).length === text.length;
}

/**
 * Follow a chain of pass-through wrappers to the element that actually branches.
 *
 * Returns that element and the selectors skipped on the way, so the tree can
 * say which levels it folded rather than quietly losing them.
 */
function collapseWrappers(
  el: Element,
  doc: Document,
): {
  /** Whose CHILDREN the folded node shows: the end of the chain. */
  target: Element;
  /** Whose IDENTITY it carries — tag, id, classes, label — and whose selector. */
  identity: Element;
  skipped: string[];
  selector: string;
  positional: boolean;
} {
  const chain: Element[] = [el];
  let current = el;
  // Bounded by the DOM itself: each step strictly descends, so it terminates.
  while (isPassThrough(current, normaliseText(htmlToText(current.outerHTML)))) {
    const only = current.children.item(0);
    if (only === null) break;
    current = only;
    chain.push(current);
  }

  // THE BEST SELECTOR IN THE CHAIN, not the first or the last. Every element in
  // it removes the same text, so the one worth offering is the one most likely
  // to survive a redesign — and collapsing must never trade a stable id for a
  // positional path just because the positional one sits deeper.
  // THE OUTERMOST NON-POSITIONAL ONE. Outer elements in a pass-through chain are
  // the semantic containers — `nav`, `#main`, `#wrapper` — and inner ones are
  // the generic `<div>`s and `<a>`s they wrap. Preferring the DEEPEST match
  // instead once folded `<nav aria-label="Main menu">` away into its only link,
  // which is the opposite of what a label is for. Falling back to the outermost
  // keeps the node the caller actually asked about.
  const scored = chain.map((c) => ({ el: c, ...selectorFor(c, doc) }));
  const best = scored.find((c) => !c.positional) ?? scored.at(0);
  /* istanbul ignore next -- chain always holds at least `el`. */
  if (best === undefined) {
    return { target: current, identity: current, skipped: [], ...selectorFor(current, doc) };
  }

  // IDENTITY AND CHILDREN COME FROM DIFFERENT ENDS, ON PURPOSE. The node is
  // DESCRIBED by the element its selector points at — a node reading `#ad-slot`
  // while calling itself a `<span>` describes neither element — and it is
  // EXPANDED from the end of the chain, which is the whole point of folding.
  // Every element between them removes identical text, so this is one choice
  // presented once, not two choices merged.
  return {
    target: current,
    identity: best.el,
    skipped: scored.filter((c) => c.el !== best.el).map((c) => c.selector),
    selector: best.selector,
    positional: best.positional,
  };
}

/**
 * The document's element structure, bounded.
 *
 * BOUNDED, AND IT SAYS WHEN IT CUT. A page with ten thousand elements would
 * otherwise produce a tree nobody can use inside a response nobody can send —
 * and a tree truncated SILENTLY would be a researcher marking against a document
 * they cannot see all of, which is the same class of error as the diff truncated
 * at eight chunks that this whole rebuild descends from.
 *
 * ---------------------------------------------------------------------------
 * EXPANDED BREADTH-FIRST, AND DEPTH IS NO LONGER THE BINDING CONSTRAINT.
 *
 * The first version walked depth-first under `maxDepth: 6`. On the MOH vaccine
 * page that made `div.articles-block` — 3,587 of the document's 4,731
 * characters — an unopenable leaf, while `maxNodes: 400` never came close to
 * binding at roughly 40 emitted nodes. The researcher was asked to mark
 * timestamps and handed a tree in which every timestamp was out of reach.
 *
 * Two changes, and the second matters more than the first:
 *
 * 1. Pass-through wrappers are FOLDED, so nesting that carries no choice costs
 *    no budget. This alone recovers five levels on that page.
 * 2. Expansion is BREADTH-FIRST against the node budget. Depth-first spends the
 *    whole budget on the first subtree, so a truncated outline loses the FOOTER
 *    — a whole section of furniture — rather than losing detail. Level-order
 *    means a cut can only ever remove depth, never a sibling: whatever the
 *    budget, the researcher always sees the complete top-level shape of the
 *    page and can descend where it matters.
 *
 * `maxDepth` survives only as a guard against pathological nesting; `maxNodes`
 * is the real bound, and `unreachableTextLength` reports what a cut cost.
 */
export function documentOutline(
  html: string,
  options: { maxDepth?: number; maxNodes?: number } = {},
): DocumentOutline {
  // MEASURED ON THE TWO REAL PAGES THIS CORPUS HOLDS, not chosen for roundness.
  // The MOH vaccine page needs depth 9 and 294 nodes; the Walla news page —
  // which carries real ad slots and is the harder shape — needs depth 16 and
  // 878. Both are then fully reachable, `unreachableTextLength: 0`. At the old
  // `maxNodes: 400` the news page would have hidden 5,347 of its 6,426
  // characters, so the cap that "never came near binding" on one page was the
  // binding constraint on the other. Headroom above the measurement, and a
  // breadth-first cut plus `unreachableTextLength` to make an overflow honest.
  const maxDepth = options.maxDepth ?? 16;
  const maxNodes = options.maxNodes ?? 1200;
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  let truncated = false;
  let unreachableTextLength = 0;

  const build = (el: Element): { node: OutlineNode; element: Element } => {
    const { target, identity, skipped, selector, positional } = collapseWrappers(el, doc);
    // Identical for every element in a pass-through chain, by its definition.
    const text = normaliseText(htmlToText(target.outerHTML));
    return {
      element: target,
      node: {
        selector,
        tag: identity.tagName.toLowerCase(),
        id: identity.getAttribute('id'),
        classes: [...identity.classList],
        textLength: text.length,
        positional,
        label: labelFor(identity, text),
        collapsedFrom: skipped,
        children: [],
      },
    };
  };

  const rootPair = { node: build(doc.body).node, element: doc.body };
  // The body is never folded away: it is the tree's root and the researcher's
  // frame of reference, even when it wraps a single element.
  rootPair.node = {
    ...rootPair.node,
    selector: selectorFor(doc.body, doc).selector,
    tag: 'body',
    collapsedFrom: [],
  };

  let nodes = 1;
  let frontier: { node: OutlineNode; element: Element }[] = [rootPair];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
    const next: { node: OutlineNode; element: Element }[] = [];
    let exhausted = false;

    for (const { node, element } of frontier) {
      if (element.children.length === 0) continue;
      if (exhausted || nodes + element.children.length > maxNodes) {
        // Not expanded. Recorded rather than silently dropped, and the text it
        // holds is what the researcher cannot reach.
        exhausted = true;
        truncated = true;
        unreachableTextLength += node.textLength;
        continue;
      }
      for (const child of element.children) {
        const pair = build(child);
        node.children.push(pair.node);
        next.push(pair);
        nodes += 1;
      }
    }
    frontier = next;
  }

  // Whatever the depth guard left unexpanded is unreachable too.
  for (const { node, element } of frontier) {
    if (element.children.length > 0) {
      truncated = true;
      unreachableTextLength += node.textLength;
    }
  }

  return { root: rootPair.node, truncated, unreachableTextLength };
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
