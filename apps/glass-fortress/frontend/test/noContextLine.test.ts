jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Locale, type PageRender, renderPage, setPublicBodies, snapshotResearchClaims, snapshotResearchCorpus, snapshotResearchDashboard, snapshotResearchThesis, textNodes } from './render';
import { FRONTEND, declarationsOf, importsOf, jsxTagsIn, publicThesisModules, requireSubjects, stringsIn } from './scan';
import published from './fixtures/thesis/published.json';
import callLive from './fixtures/thesis/call-live.json';
import versionPrevious from './fixtures/thesis/version-previous.json';

// ---------------------------------------------------------------------------
// no-context-line — docs/gf-ui-flows.md §4 :159 and §17 :531, both as amended 2026-09-18;
// docs/gf-thesis-flows.md A2 :1268 (`title` is REMOVED — "the claim is the heading").
//
// THE STICKY CONTEXT LINE IS RETIRED, AND NOT AS A DISPLAY DECISION. The pattern is real — a short title
// bar once the heading scrolls past — and it has ONE precondition: A SHORT NAME. This platform has none,
// so the line was handed the CLAIM and showed 640px of 3,497 (18% of a 558-character sentence, cut
// mid-clause), identifying nothing. It also MOUNTED on scroll rather than rendering and sticking, so it
// inserted 29px into the flow under a reader's eye. It returns when a thesis has a name; until then
// nothing may re-add it, and before this file NOTHING HELD THAT.
//
// THE ELEMENT HAS TWO WAYS BACK, AND THEY NEED DIFFERENT READERS.
//
//   (a) THE SAME COMPONENT RETURNS — restored under its own name, re-imported, drawing `data-context-line`
//       or wearing `.sticky-line`. The SOURCE is where this is observable, and it is observable ONLY
//       there: the retired component returned `null` until an `IntersectionObserver` reported the heading
//       gone, and jsdom has no `IntersectionObserver`, so it rendered nothing here even while it was
//       landed. A render case asserting "no [data-context-line] in the tree" would have been GREEN on the
//       code that still shipped the line — the exact "green over an unexercised property" shape
//       `test/render.tsx` :148–:151 names.
//
//   (b) A TITLE BAR RETURNS UNDER ANOTHER NAME — a new component, no retired spelling anywhere, simply
//       `className="sticky top-0"` over the claim. Nothing in (a) sees it: the file is not `ContextLine`,
//       the marker is not `data-context-line`, the rule is not `.sticky-line`. This is the LIKELIER
//       return, because it is what §17 :531's amendment itself calls the correct pattern — RENDERED AND
//       STUCK rather than mounted on scroll — and being unconditional it is exactly what jsdom CAN see.
//
// SO THE FILE READS BOTH, AND NEITHER ARM SUBSUMES THE OTHER. The source arm below catches (a) and the
// spelled-out half of (b); the render arm catches (b) as a reader meets it, through the same three pages
// `no-door-before-it-exists` renders, on the same two-sided reasoning. An earlier draft of this file
// carried the source arm alone and argued in this docblock that no honourable render arm existed. That
// was right about (a)'s decoy and wrong as a general claim, and it is corrected here rather than left
// standing: a file that argues against its own case teaches the next reader to delete the case.
//
// "NEITHER ARM SUBSUMES THE OTHER" IS A MEASUREMENT, NOT AN ARGUMENT, and it was not one when first
// written. Both decoys that produced this file were planted in `components/thesis/`, which IS inside
// `publicThesisModules()`, so each arm caught both and the claim was never probed in the direction that
// carries it. The reviewer's decoy did: a bar planted OUTSIDE the 34-module subject set (`src/components/`)
// and rendered into the page reddened **the render arm alone** — the source arm cannot see a module it
// does not read. That is the case for two arms, and it is why neither may be folded into the other.
//
// WHAT THE ARMS DO NOT HOLD, stated so it is not mistaken for covered: jsdom computes no cascade, so a
// class named anything at all whose `position: sticky` lives in a stylesheet rule is invisible to the
// render arm, and `globals.css` is not a member of `publicThesisModules()` so the source arm does not read
// it either. The two `globals.css` cases below close that — `.sticky-line` by name, and every OTHER
// selector by the allow-list — and nothing else does.
//
// EVERY CASE CARRIES ITS OWN POSITIVE CONTROL. An absence case is satisfied by a reader that sees
// nothing at all, so each one below asserts, with the SAME reader, something the tree genuinely holds:
// a file that does exist, markers that are there, a rule that is declared, four files that really do
// position an element `sticky`. A reader blinded by a bad path or a changed helper then fails here
// rather than passing everywhere.
// ---------------------------------------------------------------------------

/** What the retired element was called, in each spelling a re-addition could use. */
const RETIRED_COMPONENT = 'ContextLine';
const RETIRED_MARKER = 'data-context-line';
const RETIRED_RULE = '.sticky-line';

/** Markers the public thesis surface genuinely draws — the positive control for the two node readers. */
const MARKERS_THAT_ARE_THERE = ['data-thesis-text', 'data-intake', 'data-preface'];

/**
 * Four modules OUTSIDE the public thesis surface that genuinely position an element `sticky` — the positive
 * control for the sticky reader, and the proof that the idiom is reachable in this codebase rather than
 * hypothetical. They are NOT offences: the retirement scopes itself to the public thesis and call pages
 * (§4 :159), and §11/§13/§14's context line — the researcher's gated view — is neither retired nor built.
 */
const STICKY_OUTSIDE_THE_SURFACE: readonly string[] = [
  'src/app/[locale]/article-rules/[trackedUrlId]/[capture]/MarkingClient.tsx',
  'src/app/[locale]/figures/page.tsx',
  'src/app/[locale]/submit/page.tsx',
  'src/app/[locale]/theses/[id]/edit/page.tsx',
];

/**
 * Selectors in `globals.css` that MAY declare `position: sticky`. Empty today, and it is a LIST rather than a
 * prohibition on purpose.
 *
 * A blanket "no rule declares `position: sticky`" is true now and FALSE AT THE CORPUS STEP:
 * `docs/gf-ui-refactor-plan.md` :531 specifies "sticky month headers in the stream" for `/corpus` §24. A case
 * that must be DELETED by whoever builds a planned feature is exactly the case this file's own docblock warns
 * against — it teaches the next reader that the case is in the way. As a SET EQUALS A NAMED LIST, the corpus
 * step adds one line with its reason and the case keeps holding everything else.
 *
 * WHAT EARNS A LINE: a selector not reachable from the PUBLIC THESIS READ — the thesis page, the call page and a
 * previous version — named with the step that introduced it. The retired context line would not have earned one:
 * it was reachable from exactly those pages, which is what retired it.
 */
const STICKY_RULES_ALLOWED: readonly string[] = [];

/**
 * The positive control for the selector scanner: a selector it MUST find, and a FLOOR on how many it finds.
 *
 * IT IS A FLOOR AND A CONTAINMENT, NOT THE EXACT SET, and the distinction was measured rather than assumed. An
 * earlier draft asserted the four `position: fixed` selectors by value; that made a case about STICKY redden
 * whenever anyone added an unrelated FIXED rule — the same "a case that must be edited by whoever builds the
 * next feature" defect that `STICKY_RULES_ALLOWED` above exists to avoid, one level down. A blinded scanner
 * still fails here: it returns nothing, so neither the containment nor the floor holds. `.sheet`'s value is
 * held BY VALUE by the `.sticky-line` case; this control's job is only to prove THIS scanner reads real
 * selectors, and duplicating the value assertion would be a second implementation of one rule.
 */
const FIXED_SELECTOR_SEEN = '.sheet';
const FIXED_SELECTOR_FLOOR = 4;

const LOCALE: Locale = 'he';

const modules = (): string[] => [...requireSubjects('public thesis modules', publicThesisModules())];

/**
 * Every `sticky` POSITIONING token in a class string, and no other token.
 *
 * THE PREDICATE IS THE CASE. `sticky-line` must NOT match — it is the retired rule's own name and the case
 * above owns it, so matching it here would make this arm green for the wrong reason and red on the wrong
 * decoy. A variant prefix must match: Tailwind writes `md:sticky` and `sm:sticky`, and a re-addition that
 * only sticks at width is the same element. An arbitrary-value spelling must match too, since
 * `[position:sticky]` is the documented way to write the property when the utility is unavailable.
 *
 * CONSIDERED AND UNREACHABLE TODAY: an object-keyed conditional class, `clsx({ sticky: isStuck })`, splits to
 * the token `sticky:` whose text after the last colon is empty, so this predicate does NOT see it. Reaching
 * that shape needs a class-name helper this app does not have — no `clsx`, `classnames`, `tailwind-merge` or
 * `cva` in `package.json` or under `src/` — so adding one is its own change, and this note is here to meet
 * whoever makes it.
 */
function stickyTokensIn(source: string): string[] {
  return source
    .split(/[\s'"`(){},]+/)
    .filter((token) => token !== '')
    .filter((token) => /\[position:\s*sticky\]/.test(token) || token.slice(token.lastIndexOf(':') + 1) === 'sticky');
}

/**
 * Every selector in `globals.css` whose own block declares `<property>: <value>`, sorted.
 *
 * IT IS A SECOND READER OF THAT FILE AND NOT A SECOND COPY OF ONE. `declarationsOf` answers "what does THIS
 * selector declare?" and cannot answer "which selectors declare THIS?" — the allow-list case needs the second
 * question, and inverting the first would mean knowing every selector in advance, which is the enumeration the
 * case exists to avoid. Comments are stripped before any block is read, for `declarationsOf`'s own measured
 * reason: a sentence inside a rule reads as a declaration otherwise. `[^{}]` matches the INNERMOST block, so a
 * rule nested in an at-rule is read as itself and the at-rule's own text is not mistaken for a selector.
 */
function selectorsDeclaring(property: string, value: string): string[] {
  const css = readFileSync(join(FRONTEND, 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const declares = new RegExp(`(^|;)\\s*${property}\\s*:\\s*${value}\\s*(;|$)`);
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((rule) => declares.test(rule[2] ?? ''))
    .map((rule) => (rule[1] ?? '').trim().split(/\s*\n\s*/).at(-1) ?? '')
    .sort();
}

/** The same reader, over one module's source: every place it positions something `sticky`, with its line. */
function stickySourceOffences(moduleName: string): string[] {
  const file = join(FRONTEND, moduleName);
  const offences: string[] = [];
  for (const tag of jsxTagsIn(file)) {
    const className = tag.attributes['className'] ?? '';
    if (stickyTokensIn(className).length > 0) offences.push(`${moduleName}:${String(tag.line)} <${tag.tag} className>`);
    if (/position:\s*['"`]?sticky/.test(tag.attributes['style'] ?? '')) offences.push(`${moduleName}:${String(tag.line)} <${tag.tag} style>`);
  }
  // A class string reaches an element through a constant or a helper as often as through the attribute, so
  // the literals are read too — a tag-only reader would be blind to `const BAR = 'sticky top-0'`.
  for (const found of stringsIn(file)) {
    if (stickyTokensIn(found.text).length > 0 || /position:\s*sticky/.test(found.text)) {
      offences.push(`${moduleName}:${String(found.line)} '${found.text.trim().slice(0, 48)}'`);
    }
  }
  return offences;
}

/** The three public pages rendered, each with its container — the subjects of the render arm. */
async function renderedPublicPages(): Promise<{ name: string; container: HTMLElement }[]> {
  setPublicBodies({
    [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
    [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
    [`/api/thesis/${published.thesisId}/versions/${versionPrevious.versionId}`]: { status: 200, body: versionPrevious },
  });
  // EACH PAGE IS RENDERED BY ITS OWN CALL, and that is not repetition to be folded away. `renderPage` is
  // GENERIC in its page's `params` (`{ locale, id }` is not `{ locale, thesisId }`), so a loop over an array
  // of three pages unifies the three signatures into one and TS then matches every page against every
  // shape. `no-door-before-it-exists` spells them out for the same reason.
  const body = (name: string, result: PageRender): { name: string; container: HTMLElement } => {
    if (result.notFound) throw new Error(`${name} answered the one 404, not a body`);
    return { name, container: result.container };
  };
  const thesis = (await import('../src/app/[locale]/theses/[id]/page')).default;
  const call = (await import('../src/app/[locale]/call/[thesisId]/page')).default;
  const version = (await import('../src/app/[locale]/theses/[id]/versions/[v]/page')).default;
  const rendered = [
    body('/theses/[id]', await renderPage(thesis, { locale: LOCALE, id: published.thesisId }, { locale: LOCALE })),
    body('/call/[thesisId]', await renderPage(call, { locale: LOCALE, thesisId: published.thesisId }, { locale: LOCALE })),
    body(
      '/theses/[id]/versions/[v]',
      await renderPage(version, { locale: LOCALE, id: published.thesisId, v: versionPrevious.versionId }, { locale: LOCALE }),
    ),
    // UI-8 chunk 4: `/research` joins the render arm. §11 :399's ruling is that the working view's context
    // line is NOT sticky; the DOOR has no context line at all, and nothing held that until now. It is also
    // the first page in this set whose tree is CLIENT-rendered, which is why it comes through the one helper.
    { name: '/research', container: await snapshotResearchDashboard(LOCALE) },
    // UI-8 chunk 5: the corpus's own context line is region 1 of §24 and has never been sticky; the gated
    // twin renders the SAME component, so a `position: sticky` added to it would reach both doors at once and
    // this is where that is caught.
    { name: '/research/corpus', container: await snapshotResearchCorpus(LOCALE, { searchParams: { page: 'page-one' } }) },
    { name: '/research/corpus/claims', container: await snapshotResearchClaims(LOCALE) },
    // UI-8 chunk 7a: §11 :395–:399's ruling is about THIS page — the working view's context block is NOT
    // sticky, because no thesis has a short name and the block carries the claim. Until now the ruling had no
    // subject: the page it names did not exist.
    { name: '/research/theses/[thesisId]', container: await snapshotResearchThesis(LOCALE) },
  ];
  return [...requireSubjects('rendered public pages', rendered)];
}

/** The same reader, over one rendered tree: every element a reader would meet stuck to the viewport. */
function stickyRenderOffences(name: string, container: HTMLElement): string[] {
  const offences: string[] = [];
  for (const element of container.querySelectorAll('*')) {
    const classAttribute = element.getAttribute('class') ?? '';
    if (stickyTokensIn(classAttribute).length > 0) offences.push(`${name}: <${element.tagName.toLowerCase()} class="${classAttribute.slice(0, 40)}">`);
    if (/position:\s*sticky/i.test(element.getAttribute('style') ?? '')) offences.push(`${name}: <${element.tagName.toLowerCase()} style position:sticky>`);
  }
  return offences;
}

afterEach(() => {
  setPublicBodies(undefined);
});

describe('no-context-line', () => {
  it('the component file is gone — and the reader can see a file of the same surface that is not', () => {
    const componentDir = 'src/components/thesis';
    expect({
      retired: existsSync(join(FRONTEND, componentDir, `${RETIRED_COMPONENT}.tsx`)),
      // The control: a sibling that MUST exist, so a wrong directory fails here instead of reading as absence.
      control: existsSync(join(FRONTEND, componentDir, 'Appeals.tsx')),
    }).toEqual({ retired: false, control: true });
  });

  it('no module of the public thesis surface imports a context line', () => {
    const offenders = modules().flatMap((moduleName) =>
      importsOf(join(FRONTEND, moduleName))
        .filter(({ specifier, module: resolved }) => (resolved ?? specifier).includes(RETIRED_COMPONENT))
        .map(({ specifier }) => `${moduleName} imports '${specifier}'`),
    );
    expect(offenders).toEqual([]);
  });

  it('no source of the public thesis surface draws the marker or names the rule — and the same readers find markers that ARE drawn', () => {
    const offenders: string[] = [];
    const seen = new Set<string>();
    for (const moduleName of modules()) {
      const file = join(FRONTEND, moduleName);
      for (const tag of jsxTagsIn(file)) {
        for (const attribute of Object.keys(tag.attributes)) {
          if (attribute === RETIRED_MARKER) offenders.push(`${moduleName}:${String(tag.line)} <${tag.tag} ${attribute}>`);
          if (MARKERS_THAT_ARE_THERE.includes(attribute)) seen.add(attribute);
        }
        const className = tag.attributes['className'] ?? '';
        if (className.includes(RETIRED_RULE.slice(1))) offenders.push(`${moduleName}:${String(tag.line)} className names ${RETIRED_RULE}`);
      }
      for (const found of stringsIn(file)) {
        if (found.text.includes(RETIRED_MARKER) || found.text.includes(RETIRED_RULE.slice(1))) {
          offenders.push(`${moduleName}:${String(found.line)} '${found.text.trim().slice(0, 48)}'`);
        }
      }
    }
    // The control is asserted in the SAME expect as the offences: a reader that found no marker at all
    // has not proved an absence, and reporting that separately is how a blinded scan reads as a pass.
    expect({ offenders, controlsSeen: [...seen].sort() }).toEqual({ offenders: [], controlsSeen: [...MARKERS_THAT_ARE_THERE].sort() });
  });

  it('NO SOURCE OF THE PUBLIC THESIS SURFACE POSITIONS ANYTHING STICKY, UNDER ANY NAME — and the same reader sees the four modules that do', () => {
    const offenders = modules().flatMap((moduleName) => stickySourceOffences(moduleName));
    // THE CONTROL IS PROVED, NOT ASSERTED, and it is in the same expect as the offences. These four really do
    // position an element sticky; a predicate that stopped matching — narrowed to `sticky-line`, broken by a
    // changed helper, or reading an attribute shape `jsxTagsIn` no longer returns — empties this list and
    // fails HERE, rather than reporting an absence it was no longer able to see.
    const controlsThatSeeSticky = STICKY_OUTSIDE_THE_SURFACE.filter((moduleName) => stickySourceOffences(moduleName).length > 0).sort();
    expect({ offenders, controlsThatSeeSticky }).toEqual({ offenders: [], controlsThatSeeSticky: [...STICKY_OUTSIDE_THE_SURFACE].sort() });
  });

  it('NO RENDERED PUBLIC PAGE CARRIES A CONTEXT LINE OR A STUCK ELEMENT — over pages that really rendered', async () => {
    const pages = await renderedPublicPages();
    // THE FLOOR, MOVED UP BY ONE AT UI-8 chunk 4 AND AGAIN AT 7a, with each page NAMED.
    expect(pages.length).toBeGreaterThanOrEqual(5);
    expect(pages.map(({ name }) => name)).toContain('/research');
    // THE WORKING VIEW IS THIS SCAN'S ONLY REAL SUBJECT, and that is why it is named rather than counted:
    // §11 :399's NOT-STICKY ruling had NO SUBJECT AT ALL until this page existed — it is the one page whose
    // context block carries a CLAIM, which is the reason the ruling gives. Added to the list in chunk 7a and
    // blind until now: deleting the line left this case green, measured 2026-09-21.
    expect(pages.map(({ name }) => name)).toContain('/research/theses/[thesisId]');
    const offenders = pages.flatMap(({ name, container }) => [
      ...stickyRenderOffences(name, container),
      ...[...container.querySelectorAll(`[${RETIRED_MARKER}]`)].map(() => `${name}: [${RETIRED_MARKER}]`),
    ]);
    // NON-VACUITY, PER PAGE AND BY VALUE. `textNodes` throws on an empty tree, so a page that rendered
    // nothing fails before it can pass; the element floor is asserted as well, because a page reduced to a
    // single error string would still carry text nodes and would still draw no sticky element.
    const rendered = pages.map(({ name, container }) => ({
      name,
      words: textNodes(container).length > 20,
      elements: container.querySelectorAll('*').length > 20,
    }));
    expect({ offenders, rendered }).toEqual({
      offenders: [],
      rendered: pages.map(({ name }) => ({ name, words: true, elements: true })),
    });
  });

  it('globals.css declares no sticky-line rule — and the reader is not blind: it still reads a rule that IS declared', () => {
    expect(() => declarationsOf(RETIRED_RULE)).toThrow(`globals.css declares no \`${RETIRED_RULE}\` rule at all`);
    expect(declarationsOf('.sheet').get('position')).toBe('fixed');
  });

  it('EVERY STICKY RULE IN globals.css IS ON THE ALLOW-LIST — which is empty, and the same scanner reads the rules that ARE declared', () => {
    // BOTH HALVES IN ONE `expect`, because the allow-list half is an ABSENCE and an absence proves nothing on
    // its own: a scanner broken by a changed path, a stripped comment or a regex that matches no block at all
    // would report "no sticky rules" and read as a pass. The control is asserted BY VALUE and by this scanner,
    // not by `declarationsOf` — a control run through a different helper proves the OTHER helper works.
    const fixed = selectorsDeclaring('position', 'fixed');
    expect({
      sticky: selectorsDeclaring('position', 'sticky'),
      controlFindsASelector: fixed.includes(FIXED_SELECTOR_SEEN),
      controlMeetsItsFloor: fixed.length >= FIXED_SELECTOR_FLOOR,
    }).toEqual({ sticky: [...STICKY_RULES_ALLOWED], controlFindsASelector: true, controlMeetsItsFloor: true });
  });

  it("THE SCROLLER SURVIVES ITS REASON: `html, body` still declares all three values, though the line that justified them is gone", () => {
    // The retirement's one real hazard. `html, body { overflow: hidden }` was written for TWO bugs
    // (globals.css :145–:165): the sidebar riding up over a band of empty paper, and the sticky line
    // resolving against a scrollport that slid off the top. Only the SECOND subject was retired. With
    // its comment now saying so, a later reader could take the whole rule for the retired line's
    // leftover — so the values are held BY VALUE here, not merely declared (R59 · chunk 3: a stated
    // limit on a value the board fixes is a debt, not a note).
    const declared = declarationsOf('html, body');
    expect({
      overflow: declared.get('overflow'),
      maxWidth: declared.get('max-width'),
      height: declared.get('height'),
    }).toEqual({ overflow: 'hidden', maxWidth: '100vw', height: '100%' });
  });
});
