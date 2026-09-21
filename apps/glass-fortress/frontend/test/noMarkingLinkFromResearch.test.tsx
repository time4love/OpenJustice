jest.mock('../src/context/AuthContext', () => jest.requireActual<typeof import('./render')>('./render').authContextDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { renderResearchCorpus, setAuthState, setPathname, snapshotResearchClaims, snapshotResearchCorpus, snapshotResearchDashboard, type Locale } from './render';
import { FRONTEND, importClosureOf, jsxTagsIn, requireSubjects, sourceFiles, stringsIn } from './scan';
import { articleRules } from './fixtures/research/reads';

// ---------------------------------------------------------------------------
// no-marking-link-from-research — docs/gf-ui-flows.md §31 :925–:926 ("no anchor under the research pages
// targets `/article-rules/…`; the pending stop renders as text"), §27 :874–:876; interaction MARKING
// :576–:578 ("Claude gives the instructions BEFORE handing over the URL … the conversation continues with the
// page open"); UI plan UI-8 :786.
//
// THE ABSENCE IS OVER SOMETHING, AND THAT IS THE WHOLE POINT. `get_article_rules` SENDS `markingUrl` inside
// `pendingStop` (A5 :1199, and the fixture carries it — the first case below proves that before anything
// else is asserted). An instrument written over a body with no marking URL in it would be green about a page
// that had nothing to link to, which is a tautology rather than a control.
//
// TWO SIDES, BECAUSE A RENDER ALONE IS NOT ENOUGH. The RENDER holds that no anchor is drawn on the pages a
// researcher actually meets, with the extraction sheet OPEN — the one surface the URL reaches. The SOURCE
// holds that no module of the research tree, nor anything in its import closure, writes such an href at all:
// a link behind a condition no fixture reaches would pass the render and ship.
//
// WHY THE RULE EXISTS, so the assertion cannot outlive it: the marking page is reached from the CHAT, which
// gives the instruction — which element, by the text it begins with, and whether to mark or unmark — before
// it hands over the URL. A link from the read view would put a researcher on that page with no instruction,
// which is the one thing :576–:578 rules out.
// ---------------------------------------------------------------------------

const LOCALE: Locale = 'he';
const MARKING = '/article-rules/';

const ROOTS = ['src/app/[locale]/research', 'src/components/research'] as const;

/** The research tree's own files, and every local module they import, transitively. */
function subjects(): string[] {
  const own = ROOTS.flatMap((root) => sourceFiles(join(FRONTEND, root), ['.ts', '.tsx'])).map((file) => relative(FRONTEND, file));
  const reached = own.flatMap((file) => importClosureOf(join(FRONTEND, file))).filter((module) => module.endsWith('.ts') || module.endsWith('.tsx'));
  return [...requireSubjects('the research tree and its import closure', [...new Set([...own, ...reached])])].sort();
}

beforeEach(() => {
  setAuthState('approved-researcher');
  window.localStorage.clear();
});
afterEach(() => {
  setAuthState(undefined);
  setPathname(undefined);
  window.localStorage.clear();
});

describe('no-marking-link-from-research', () => {
  it('THE POSITIVE CONTROL: the body a research page reads CARRIES a marking URL, so the absence below is over something', () => {
    expect({
      pendingStop: articleRules.pendingStop !== null,
      markingUrl: articleRules.pendingStop?.markingUrl ?? '',
      namesTheMarkingRoute: (articleRules.pendingStop?.markingUrl ?? '').includes(MARKING),
    }).toEqual({
      pendingStop: true,
      markingUrl: 'https://example.test/he/article-rules/page-two/20220502120000',
      namesTheMarkingRoute: true,
    });
  });

  it('NO ANCHOR TO THE MARKING PAGE on any research page a reader meets — at EVERY level of the sheet', async () => {
    const pages = [
      { name: '/research', container: await snapshotResearchDashboard(LOCALE) },
      { name: '/research/corpus (region 0)', container: await snapshotResearchCorpus(LOCALE) },
      // EVERY DEPTH, BECAUSE THE PANE SHOWS ONE LAYER AT A TIME (§9 :1070). Read at depth 3 alone, this case
      // examines the HISTORY panel and nothing else — and the marking URL lives on the RULES panel, one level
      // above. A decoy that drew it as an anchor reddened two other cases here and NOT this one, which is
      // exactly what a blind probe is for; the fix is to stand at each level rather than only the deepest.
      { name: '/research/corpus (the extraction sheet)', container: await snapshotResearchCorpus(LOCALE, { searchParams: { page: 'page-one' }, depth: 1 }) },
      { name: '/research/corpus (the rules in force)', container: await snapshotResearchCorpus(LOCALE, { searchParams: { page: 'page-one' }, depth: 2 }) },
      { name: '/research/corpus (the rule`s history)', container: await snapshotResearchCorpus(LOCALE, { searchParams: { page: 'page-one' }, depth: 3 }) },
      { name: '/research/corpus/claims', container: await snapshotResearchClaims(LOCALE) },
    ];
    // THE FLOOR, NAMED: six surfaces, and every level the URL could reach is one of them.
    expect(pages.map(({ name }) => name)).toEqual([
      '/research',
      '/research/corpus (region 0)',
      '/research/corpus (the extraction sheet)',
      '/research/corpus (the rules in force)',
      '/research/corpus (the rule`s history)',
      '/research/corpus/claims',
    ]);
    const offenders = pages.flatMap(({ name, container }) =>
      [...requireSubjects(`anchors of ${name}`, [...container.querySelectorAll('a[href]')])]
        .map((anchor) => anchor.getAttribute('href') ?? '')
        .filter((href) => href.includes(MARKING))
        .map((href) => `${name}: ${href}`),
    );
    expect(offenders).toEqual([]);
  });

  it('THE PENDING STOP RENDERS AS TEXT — the approved sentence, in a span, with no anchor inside it', async () => {
    const rules = await renderResearchCorpus(LOCALE, { searchParams: { page: 'page-one' }, depth: 2 });
    const facets = await renderResearchCorpus(LOCALE);
    const onTheSheet = rules.querySelector('[data-stop-pending]');
    const onTheRow = facets.querySelector('[data-stop-pending]');
    expect({
      sheetDrawn: (onTheSheet?.textContent ?? '').trim(),
      sheetAnchors: onTheSheet?.querySelectorAll('a').length,
      rowDrawn: (onTheRow?.textContent ?? '').trim(),
      rowAnchors: onTheRow?.querySelectorAll('a').length,
    }).toEqual({
      sheetDrawn: 'עצירה ממתינה; היא נפתרת בשיחה',
      sheetAnchors: 0,
      rowDrawn: 'עצירה ממתינה; היא נפתרת בשיחה',
      rowAnchors: 0,
    });
  });

  it('NO SOURCE of the research tree or its closure writes an <a>, a Link or a literal naming the marking route', () => {
    const files = requireSubjects('the research tree and its closure', subjects());
    // THE FLOOR: the closure really ran and the sheet that HOLDS the marking URL is in the set — a subject
    // builder that returned the two directories alone would scan over a set that cannot contain the href.
    expect(files).toContain('src/components/research/ExtractionSheet.tsx');
    expect(files).toContain('src/components/corpus/Stream.tsx');
    expect(files.length).toBeGreaterThanOrEqual(15);

    const offenders = files.flatMap((file) => {
      const path = join(FRONTEND, file);
      const tags = jsxTagsIn(path)
        .filter((tag) => (tag.tag === 'a' || tag.tag === 'Link') && (tag.attributes.href ?? '').includes(MARKING))
        .map((tag) => `${file}:${String(tag.line)} <${tag.tag} href>`);
      const literals = stringsIn(path)
        .filter((found) => found.text.includes(MARKING))
        .map((found) => `${file}:${String(found.line)} '${found.text}'`);
      return [...tags, ...literals];
    });
    expect(offenders).toEqual([]);
  });

  it('THE `markingUrl` FIELD REACHES NO COMPONENT — only the TYPE that declares it and the PARSER that reads it', () => {
    // COMMENTS ARE STRIPPED FIRST, and that is not a nicety: a probe that patched a COMMENT would look blind
    // (the R67 trap), and this file's own header explains why the field is never rendered — so a scan over raw
    // bytes would count its own prose as a reader and be satisfied by anything.
    const withoutComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/(^|[^:])\/\/[^\n]*/gu, '$1 ');
    const readers = requireSubjects('the research tree and its closure', subjects()).filter((file) =>
      /\bmarkingUrl\b/u.test(withoutComments(readFileSync(join(FRONTEND, file), 'utf8'))),
    );
    // TWO FILES, AND NEITHER DRAWS ANYTHING. `types/research.ts` DECLARES the field because A5 :1199 says the
    // route sends it, and `lib/researchBody.ts` READS it because a parser that dropped a member the envelope
    // names would be written to a body the route does not send. No component is in this list, which is the
    // strongest form of "rendered as no anchor": the value never reaches one.
    expect(readers).toEqual(['src/lib/researchBody.ts', 'src/types/research.ts']);
  });
});
