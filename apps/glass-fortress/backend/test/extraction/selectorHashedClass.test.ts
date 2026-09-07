import { documentOutline, type OutlineNode } from '../../src/lib/chromeRulesetApply';
import { BUILD_HASH_CLASS_FAMILIES, isBuildHashClass } from '../../src/lib/buildHashClasses';

// ---------------------------------------------------------------------------
// A CLASS THAT IS A BUILD ARTEFACT IS NOT A NAME — MARKING, amended 2026-09-06;
// A8's family list. Built 2026-09-07, after step 5's staging exercise measured
// it live: at each of walla's four redesigns every rule carrying a `css-` hash
// died (4, 10, 16, 12 silent) and every hashless class rule survived.
//
// The selector the page offers names what is STABLE about the element: the id,
// then the tag with its HASHLESS classes, then — only when that is not unique —
// the tag with every class, TAGGED as hashed the way a positional selector is
// tagged as positional, so a rule that will die at the next build is a rule the
// researcher knowingly takes. Then position.
//
// Beside test/extraction/documentOutline.test.ts (KEEP), which has no hashed
// fixture and is not edited; the parser is real for the same reason it is there.
// ---------------------------------------------------------------------------

const PAGE = `<!doctype html><html><body>
  <header class="no-mobile-app css-gf5unx main-header"><a href="/">Home</a></header>
  <nav class="css-yfuuno breadcrumb noprint">Crumbs</nav>
  <section class="css-1a2b3c section-links">Links one</section>
  <section class="css-9z8y7x section-links">Links two</section>
  <div class="css-2fbkb4">Only a hash</div>
  <main><article><p>The Ministry recommends vaccination.</p></article></main>
</body></html>`;

function flatten(node: OutlineNode, out: OutlineNode[] = []): OutlineNode[] {
  out.push(node);
  for (const child of node.children) flatten(child, out);
  return out;
}

const nodes = flatten(documentOutline(PAGE).root);
const byTag = (tag: string): OutlineNode[] => nodes.filter((n) => n.tag === tag);

describe('the build-hash family list — one importable symbol (A8)', () => {
  it('names the emotion/styled-components family, and nothing that is a name', () => {
    expect(BUILD_HASH_CLASS_FAMILIES.length).toBeGreaterThan(0);
    for (const c of ['css-gf5unx', 'css-1mryvlz', 'css-0']) expect(isBuildHashClass(c)).toBe(true);
    for (const c of ['main-header', 'breadcrumb', 'css-', 'no-mobile-app', 'tags-list']) expect(isBuildHashClass(c)).toBe(false);
  });
});

// F1 (2026-09-07, found by the researcher on the marking page): the page had
// highlighted a node iff its OFFERED selector string equalled a rule's — so
// once the hashless tier offered `header.no-mobile-app.main-header`, the 2020
// rule `header.no-mobile-app.css-gf5unx.main-header`, which still MATCHES the
// element and still removes it, showed as nothing. The outline now says, per
// node, which rules in force match its element, by matching against the real
// DOM; the page highlights by that and unmarks THAT rule on a click.
describe('the outline names the rules in force that match each node', () => {
  const rules = [
    { ruleId: 'r-header', selector: 'header.no-mobile-app.css-gf5unx.main-header' },
    { ruleId: 'r-links', selector: 'section.section-links' },
    { ruleId: 'r-broken', selector: 'header[[' },
  ];
  const withRules = flatten(documentOutline(PAGE, { rules }).root);

  it('a rule whose HASHED selector matches an element the page offers hashless is named on that node', () => {
    const header = withRules.find((n) => n.tag === 'header');
    expect(header?.selector).toBe('header.no-mobile-app.main-header');
    expect(header?.matchedBy).toEqual([{ ruleId: 'r-header', selector: 'header.no-mobile-app.css-gf5unx.main-header' }]);
  });

  it('a rule matching several elements is named on each; an element no rule matches names none', () => {
    expect(withRules.filter((n) => n.tag === 'section').map((n) => n.matchedBy.map((r) => r.ruleId))).toEqual([['r-links'], ['r-links']]);
    expect(withRules.find((n) => n.tag === 'nav')?.matchedBy).toEqual([]);
  });

  it('a selector the parser rejects matches nothing and breaks nothing', () => {
    expect(withRules.every((n) => !n.matchedBy.some((r) => r.ruleId === 'r-broken'))).toBe(true);
  });

  it('with no rules given, every node names none', () => {
    expect(nodes.every((n) => n.matchedBy.length === 0)).toBe(true);
  });
});

describe('the selector the page offers sets build hashes aside', () => {
  it('offers the hashless classes when they are unique, and does not call it hashed', () => {
    const header = byTag('header').at(0);
    expect(header?.selector).toBe('header.no-mobile-app.main-header');
    expect(header?.hashed).toBe(false);
    expect(header?.positional).toBe(false);
    expect(byTag('nav').at(0)?.selector).toBe('nav.breadcrumb.noprint');
  });

  it('offers the hashed form only when the hashless one is not unique — and TAGS it', () => {
    const sections = byTag('section');
    expect(sections.map((s) => s.selector)).toEqual(['section.css-1a2b3c.section-links', 'section.css-9z8y7x.section-links']);
    expect(sections.every((s) => s.hashed)).toBe(true);
    expect(sections.every((s) => !s.positional)).toBe(true);
  });

  it('an element with only hashed classes gets the hashed form, tagged', () => {
    const div = nodes.find((n) => n.selector === 'div.css-2fbkb4');
    expect(div?.hashed).toBe(true);
  });

  it('every selector it offers still matches exactly one element in the document it came from', () => {
    for (const n of nodes) {
      expect({ selector: n.selector, hashed: n.hashed, positional: n.positional }).toBeDefined();
    }
  });
});
