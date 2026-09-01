import { JSDOM } from 'jsdom';
import { documentOutline, inertDocument } from '../../src/lib/chromeRulesetApply';

// ---------------------------------------------------------------------------
// LEVEL 4 — what the researcher clicks, and what is safe to render.
//
// IN test/extraction/ BECAUSE THE PARSER MUST BE REAL. A mocked jsdom would
// assert the stub: every claim below is about what an actual HTML parser does
// with actual markup — which selector is unique, what a document with no <body>
// tag turns into, what survives being made inert.
//
// THE SECURITY PROPERTY IS TESTED HERE AND NOWHERE ELSE. These are captures of
// real sites pulled from the Archive, carrying real analytics and advertising
// tags, and they are rendered in a researcher's authenticated origin. `sandbox=""`
// on the iframe is the primary defence; `inertDocument` is the second, and a
// second defence nobody tests is not a second defence.
// ---------------------------------------------------------------------------

const PAGE = `<!doctype html><html><body>
  <nav class="site-nav"><a href="/">Home</a></nav>
  <div class="promo" id="ad-slot"><span>Advert</span></div>
  <main><article>
    <h1>Vaccine safety information</h1>
    <p>The Ministry recommends vaccination for children from six months of age.</p>
  </article></main>
  <div class="row"><span>one</span></div>
  <div class="row"><span>two</span></div>
  <footer class="site-footer">Ministry of Health</footer>
</body></html>`;

interface FlatNode {
  selector: string;
  positional: boolean;
  textLength: number;
  tag: string;
  id: string | null;
  label: string;
  collapsedFrom: readonly string[];
  /** The node's own children, by selector — so a fold can be asserted on. */
  childSelectors: string[];
}

/** Every node in the tree, flattened — the tree is a shape, not an order. */
function flatten(node: ReturnType<typeof documentOutline>['root']): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (n: typeof node): void => {
    out.push({
      selector: n.selector,
      positional: n.positional,
      textLength: n.textLength,
      tag: n.tag,
      id: n.id,
      label: n.label,
      collapsedFrom: n.collapsedFrom,
      childSelectors: n.children.map((c) => c.selector),
    });
    for (const child of n.children) walk(child);
  };
  walk(node);
  return out;
}

describe('the selector a click produces', () => {
  const nodes = flatten(documentOutline(PAGE).root);
  const find = (tag: string, cls?: string) =>
    nodes.find((n) => n.tag === tag && (cls === undefined || n.selector.includes(cls)));

  it('prefers an id, because it survives a redesign best', () => {
    expect(find('div', 'ad-slot')?.selector).toBe('#ad-slot');
  });

  it('falls back to tag-with-classes when that is unique', () => {
    expect(find('nav')?.selector).toBe('nav.site-nav');
    expect(find('footer')?.selector).toBe('footer.site-footer');
  });

  it('marks a POSITIONAL selector as positional — it predicts the null check firing', () => {
    // `div.row` matches two elements, so uniqueness needs :nth-of-type. That is
    // the one kind of selector that silently stops meaning the same thing after
    // a redesign, which the researcher should see BEFORE committing rather than
    // diagnose months later as "matched nothing since".
    const rows = nodes.filter((n) => n.selector.includes('nth-of-type'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.positional)).toBe(true);
  });

  it('does not call a structural selector positional', () => {
    expect(find('div', 'ad-slot')?.positional).toBe(false);
    expect(find('nav')?.positional).toBe(false);
  });

  it('every selector it offers actually matches in the document it came from', () => {
    // The property that makes the tree usable at all: a selector the researcher
    // clicks must be one `applyChromeRuleset` can honour. Checked against the
    // real parser rather than assumed from how it was built.
    const doc = new JSDOM(PAGE).window.document;
    for (const node of nodes) {
      expect(doc.querySelectorAll(node.selector).length).toBeGreaterThan(0);
    }
  });
});

describe('the outline reports its own limits', () => {
  it('is not truncated on an ordinary page', () => {
    expect(documentOutline(PAGE).truncated).toBe(false);
  });

  it('says so when depth cuts it short — never silently', () => {
    // A tree truncated silently is a researcher marking against a document they
    // cannot see all of: the same class of error as the diff truncated at eight
    // chunks that this whole rebuild descends from.
    //
    // THE FIXTURE BRANCHES AT EVERY LEVEL, and it has to. This was twenty nested
    // single-child <div>s, which is now exactly the shape the outline FOLDS: it
    // collapses to one node holding all the text, nothing is out of reach, and
    // `truncated: false` became the right answer. A depth fixture made of
    // pass-through wrappers no longer tests depth.
    const branching = (levels: number): string =>
      levels === 0 ? '<p>leaf</p>' : `<div><span>sibling</span>${branching(levels - 1)}</div>`;
    const deep = `<html><body>${branching(20)}</body></html>`;
    expect(documentOutline(deep, { maxDepth: 3 }).truncated).toBe(true);
  });

  it('reports HOW MUCH text a cut put out of reach, not just that it cut', () => {
    // `truncated: true` alone is what the MOH page reported while hiding 76% of
    // itself. The number is what tells a researcher whether the cut mattered.
    const branching = (levels: number): string =>
      levels === 0 ? '<p>leaf</p>' : `<div><span>sibling</span>${branching(levels - 1)}</div>`;
    const cut = documentOutline(`<html><body>${branching(20)}</body></html>`, { maxDepth: 3 });
    expect(cut.unreachableTextLength).toBeGreaterThan(0);
    expect(documentOutline(PAGE).unreachableTextLength).toBe(0);
  });

  it('says so when the node cap cuts it short', () => {
    const wide = `<html><body>${'<p>x</p>'.repeat(50)}</body></html>`;
    expect(documentOutline(wide, { maxNodes: 10 }).truncated).toBe(true);
  });

  it('carries the subtree text length, which the next-capture policy reads', () => {
    const nodes = flatten(documentOutline(PAGE).root);
    // `main` rather than `article`: <main> wraps <article> alone, so they remove
    // identical text and are folded into one node carrying the outer, semantic
    // selector. The text length is the same either way — which is precisely why
    // offering both was never a choice.
    const content = nodes.find((n) => n.tag === 'main');
    const nav = nodes.find((n) => n.tag === 'nav');
    expect(content?.textLength).toBeGreaterThan(nav?.textLength ?? 0);
  });

  it('always has a root, because the HTML parser always makes a body', () => {
    // Not an optional root: jsdom parses as text/html, and the parser inserts a
    // <body> even for input that is not HTML at all. An optional root would be a
    // case no caller could ever reach.
    expect(documentOutline('not markup at all').root.tag).toBe('body');
    expect(documentOutline('').root.tag).toBe('body');
  });
});

// ---------------------------------------------------------------------------
// F1 — THE OUTLINE HAS TO REACH THE CONTENT.
//
// Measured on the MOH vaccine page, 2026-08-31: under `maxDepth: 6`, depth-first,
// `div.articles-block` held 3,587 of the document's 4,731 characters — 76% — and
// arrived as an unopenable leaf, while `maxNodes: 400` never came near binding
// at ~40 emitted nodes. The page asked the researcher to mark TIMESTAMPS and put
// every timestamp out of reach.
//
// The template below is that page's shape: five single-child wrappers between
// <body> and the article.
// ---------------------------------------------------------------------------

const GOVERNMENT_TEMPLATE = `<!doctype html><html><body class="rtl">
  <div id="wrapper"><div><div id="main"><div><div class="article-page">
    <div class="banner-section">banner</div>
    <div class="articles-block">
      <h1>Vaccines</h1>
      <div class="meta"><time>Updated 3 March</time></div>
      <p>Three vaccines are approved for use in Israel.</p>
    </div>
    <div class="related-content">related pages</div>
  </div></div></div></div></div>
  <footer id="footer">Ministry of Health</footer>
</body></html>`;

describe('the outline reaches the content — the defect that stopped the first walk', () => {
  const outline = documentOutline(GOVERNMENT_TEMPLATE);
  const nodes = flatten(outline.root);
  const bySelector = (s: string) => nodes.find((n) => n.selector === s);

  it('folds the wrapper chain instead of spending depth on it', () => {
    // Every element from #wrapper down to .article-page removes identical text,
    // so they are one choice, not five levels of nesting to descend.
    expect(bySelector('div.articles-block')).toBeDefined();
    expect(outline.truncated).toBe(false);
    expect(outline.unreachableTextLength).toBe(0);
  });

  it('reaches INSIDE the article block, where the timestamps live', () => {
    // The exact thing the page's own instruction asks for — mark "navigation,
    // ads, footers and TIMESTAMPS" — and the exact thing the old bound made
    // impossible, since `div.articles-block` arrived as a leaf.
    //
    // The <time> element is not its OWN row: `div.meta` wraps it alone, so the
    // two remove identical text and are folded into one choice. Reachability is
    // the property, not node count — and the label is what makes it findable.
    const meta = bySelector('div.meta');
    expect(meta).toBeDefined();
    expect(meta?.label).toContain('Updated 3 March');
  });

  it('never trades a stable id for a positional path when folding', () => {
    // #wrapper's only child is a bare <div> whose selector is :nth-of-type. The
    // fold must keep the id — a positional selector is the kind that silently
    // stops meaning the same thing after a redesign.
    const folded = nodes.find((n) => n.id === 'wrapper');
    expect(folded?.selector).toBe('#wrapper');
    expect(folded?.positional).toBe(false);
  });

  it('describes the node its SELECTOR points at, not the end of the chain', () => {
    // A node reading `#wrapper` while calling itself the tag of some deeper
    // element describes neither element.
    const folded = nodes.find((n) => n.id === 'wrapper');
    expect(folded?.tag).toBe('div');
    // ...and it is EXPANDED from the end of the chain: that is the whole point.
    expect(folded?.childSelectors).toContain('div.articles-block');
  });

  it('says which levels it folded rather than losing them quietly', () => {
    const folded = nodes.find((n) => n.id === 'wrapper');
    expect(folded?.collapsedFrom.length).toBeGreaterThan(0);
    // #main is inside the folded chain, so it is named there rather than shown.
    expect(folded?.collapsedFrom.some((s) => s.includes('#main'))).toBe(true);
  });

  it('every selector still matches, folding included', () => {
    const doc = new JSDOM(GOVERNMENT_TEMPLATE).window.document;
    for (const node of nodes) {
      expect(doc.querySelectorAll(node.selector).length).toBeGreaterThan(0);
    }
  });
});

describe('a node that can never remove text is not offered', () => {
  // The Walla news page hangs 36 empty <script> tags directly off <body>, ahead
  // of the article. The researcher opened the rebuilt tree and reported having
  // nothing to click — while looking at a wall of rows none of which could have
  // done anything if clicked. `textLength` is the whole subtree's text, so zero
  // means a rule against it removes nothing, in every capture, by construction.
  const NOISY = `<!doctype html><html><body>
    <script>var a = 1;</script>
    <noscript><iframe src="x"></iframe></noscript>
    <style>.a{color:red}</style>
    <div id="empty-ad-slot"></div>
    <div id="root"><article><h1>The headline</h1><p>The body.</p></article></div>
    <script>var b = 2;</script>
  </body></html>`;

  const outline = documentOutline(NOISY);
  const nodes = flatten(outline.root);

  it('omits scripts, styles and empty containers entirely', () => {
    expect(nodes.some((n) => n.tag === 'script')).toBe(false);
    expect(nodes.some((n) => n.tag === 'style')).toBe(false);
    expect(nodes.some((n) => n.tag === 'noscript')).toBe(false);
    expect(nodes.some((n) => n.id === 'empty-ad-slot')).toBe(false);
  });

  it('leaves the content as the FIRST thing under the body', () => {
    // The whole point: the article was behind 36 rows of noise.
    expect(outline.root.children).toHaveLength(1);
    expect(outline.root.children.at(0)?.textLength).toBeGreaterThan(0);
  });

  it('folds a wrapper chain that is only a chain once the noise is gone', () => {
    // #root wraps <article> alone — but by RAW child count neither is a
    // pass-through while the empty siblings are still counted. The two rules
    // have to agree about what a child is, or the spine stays deep for nothing.
    const labels = nodes.map((n) => n.label);
    expect(labels.some((l) => l.includes('The headline'))).toBe(true);
    expect(nodes.length).toBeLessThan(8);
  });

  it('still offers a container that DOES carry text', () => {
    const withText = `<html><body><div class="promo">Sponsored</div><p>Article.</p></body></html>`;
    const kept = flatten(documentOutline(withText).root);
    expect(kept.some((n) => n.selector === 'div.promo')).toBe(true);
  });
});

describe('a cut removes DEPTH, never a sibling', () => {
  // Depth-first spent the whole budget on the first subtree, so a truncated
  // outline lost the FOOTER — a whole section of furniture the researcher needs
  // — rather than losing detail. Level-order cannot do that.
  const WIDE = `<!doctype html><html><body>
    <nav><ul><li>one</li><li>two</li><li>three</li><li>four</li></ul></nav>
    <main><article><p>a</p><p>b</p><p>c</p><p>d</p></article></main>
    <footer id="the-footer"><span>Ministry</span><span>Contact</span></footer>
  </body></html>`;

  it('keeps every top-level section when the budget runs out', () => {
    const tight = documentOutline(WIDE, { maxNodes: 6 });
    const top = tight.root.children.map((c) => c.tag);
    expect(top).toEqual(['nav', 'main', 'footer']);
    expect(tight.truncated).toBe(true);
  });

  it('still reaches the footer, which depth-first truncation used to eat', () => {
    const tight = documentOutline(WIDE, { maxNodes: 6 });
    expect(flatten(tight.root).some((n) => n.selector === '#the-footer')).toBe(true);
  });
});

describe('the label — what the researcher reads instead of a selector', () => {
  it('names a landmark by what it is, AND by which one it is', () => {
    // A landmark name QUALIFIES the preview rather than replacing it. Replacing
    // was fine on a page with one <nav> and one <footer>, and useless on the
    // news page with nine <section>s — every row read "section", and the
    // researcher could not tell them apart without clicking each one.
    const nodes = flatten(documentOutline(PAGE).root);
    expect(nodes.find((n) => n.tag === 'nav')?.label).toBe('navigation · Home');
    expect(nodes.find((n) => n.tag === 'footer')?.label).toBe('footer · Ministry of Health');
  });

  it('tells two same-tag landmarks apart', () => {
    // The defect, as a fixture: without the preview both of these read "section".
    const two = `<html><body>
      <section><h2>Vaccine eligibility</h2></section>
      <section><h2>Reporting side effects</h2></section>
    </body></html>`;
    const labels = flatten(documentOutline(two).root)
      .filter((n) => n.tag === 'section')
      .map((n) => n.label);
    expect(labels).toHaveLength(2);
    expect(new Set(labels).size).toBe(2);
    expect(labels.every((l) => l.startsWith('section · '))).toBe(true);
  });

  it('falls back to the bare landmark when it has no text to preview', () => {
    const empty = `<html><body><nav></nav><p>text</p></body></html>`;
    // The <nav> carries no text, so it is not in the tree at all — a landmark
    // with nothing in it is not a choice. The rule is asserted on `role`, which
    // survives on an element that does have text.
    const roled = `<html><body><div role="banner">Site name</div></body></html>`;
    expect(flatten(documentOutline(empty).root).some((n) => n.tag === 'nav')).toBe(false);
    expect(flatten(documentOutline(roled).root).find((n) => n.tag === 'div')?.label).toBe(
      'banner · Site name',
    );
  });

  it('prefers an aria-label, and says what the element is as well', () => {
    const labelled = `<html><body><nav aria-label="Main menu"><a href="/">x</a></nav></body></html>`;
    const nodes = flatten(documentOutline(labelled).root);
    expect(nodes.find((n) => n.tag === 'nav')?.label).toBe('navigation — Main menu');
  });

  it('falls back to a text preview when nothing declares what it is', () => {
    const nodes = flatten(documentOutline(GOVERNMENT_TEMPLATE).root);
    expect(nodes.find((n) => n.selector === 'div.banner-section')?.label).toBe('banner');
  });

  it('truncates a long preview rather than shipping a paragraph as a label', () => {
    const wordy = `<html><body><div class="x">${'y'.repeat(500)}</div></body></html>`;
    const node = flatten(documentOutline(wordy).root).find((n) => n.selector === 'div.x');
    expect(node?.label.length).toBeLessThanOrEqual(61);
    expect(node?.label.endsWith('…')).toBe(true);
  });

  it('never returns an empty label, because a blank row cannot be clicked', () => {
    const empty = `<html><body><div class="a"></div><div class="b"></div></body></html>`;
    for (const node of flatten(documentOutline(empty).root)) {
      expect(node.label.length).toBeGreaterThan(0);
    }
  });
});

describe('inertDocument — the second layer, tested because an untested layer is not one', () => {
  const HOSTILE = `<!doctype html><html><body>
    <script>window.stolen = document.cookie;</script>
    <img src="x" onerror="window.stolen = 1">
    <div onclick="alert(1)" class="keep">visible text</div>
    <iframe src="https://tracker.example/pixel"></iframe>
    <object data="x.swf">Legacy player notice</object>
    <p>the article</p>
  </body></html>`;

  const inert = inertDocument(HOSTILE);

  it('removes script, iframe, object and embed elements', () => {
    expect(inert).not.toContain('<script');
    expect(inert).not.toContain('<iframe');
    expect(inert).not.toContain('<object');
    expect(inert).not.toContain('document.cookie');
    expect(inert).not.toContain('tracker.example');
  });

  it('strips every on* handler attribute, not just the ones we thought of', () => {
    expect(inert).not.toContain('onerror');
    expect(inert).not.toContain('onclick');
    expect(/\son[a-z]+=/i.test(inert)).toBe(false);
  });

  it('KEEPS the content — the researcher has to be able to see the page', () => {
    expect(inert).toContain('visible text');
    expect(inert).toContain('the article');
    expect(inert).toContain('class="keep"');
  });

  it('does NOT change what the rules act on', () => {
    // The ruleset is applied to the stored document and the outline is built
    // from the real one; this copy exists only to be looked at.
    //
    // THE WITNESS CHANGED, THE PROPERTY DID NOT. This used to assert that the
    // outline contained <script> nodes, because `inertDocument` strips them —
    // but the outline now omits every element whose subtree carries no text, for
    // an unrelated reason, so a missing <script> no longer tells the two copies
    // apart. `<object>` does the job instead: `inertDocument` removes it, and
    // its fallback text means the outline keeps it.
    expect(inert).not.toContain('Legacy player notice');
    const nodes = flatten(documentOutline(HOSTILE).root);
    expect(nodes.some((n) => n.tag === 'object')).toBe(true);
  });
});
