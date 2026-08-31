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

/** Every node in the tree, flattened — the tree is a shape, not an order. */
function flatten(node: ReturnType<typeof documentOutline>['root']): { selector: string; positional: boolean; textLength: number; tag: string }[] {
  const out: { selector: string; positional: boolean; textLength: number; tag: string }[] = [];
  const walk = (n: typeof node): void => {
    out.push({ selector: n.selector, positional: n.positional, textLength: n.textLength, tag: n.tag });
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
    const deep = `<html><body>${'<div>'.repeat(20)}x${'</div>'.repeat(20)}</body></html>`;
    expect(documentOutline(deep, { maxDepth: 3 }).truncated).toBe(true);
  });

  it('says so when the node cap cuts it short', () => {
    const wide = `<html><body>${'<p>x</p>'.repeat(50)}</body></html>`;
    expect(documentOutline(wide, { maxNodes: 10 }).truncated).toBe(true);
  });

  it('carries the subtree text length, which the next-capture policy reads', () => {
    const nodes = flatten(documentOutline(PAGE).root);
    const article = nodes.find((n) => n.tag === 'article');
    const nav = nodes.find((n) => n.tag === 'nav');
    expect(article?.textLength).toBeGreaterThan(nav?.textLength ?? 0);
  });

  it('always has a root, because the HTML parser always makes a body', () => {
    // Not an optional root: jsdom parses as text/html, and the parser inserts a
    // <body> even for input that is not HTML at all. An optional root would be a
    // case no caller could ever reach.
    expect(documentOutline('not markup at all').root.tag).toBe('body');
    expect(documentOutline('').root.tag).toBe('body');
  });
});

describe('inertDocument — the second layer, tested because an untested layer is not one', () => {
  const HOSTILE = `<!doctype html><html><body>
    <script>window.stolen = document.cookie;</script>
    <img src="x" onerror="window.stolen = 1">
    <div onclick="alert(1)" class="keep">visible text</div>
    <iframe src="https://tracker.example/pixel"></iframe>
    <object data="x.swf"></object>
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
    // from the real one; this copy exists only to be looked at. A selector
    // matching a <script> therefore still works — it just has nothing to show.
    const nodes = flatten(documentOutline(HOSTILE).root);
    expect(nodes.some((n) => n.tag === 'script')).toBe(true);
  });
});
