jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { join } from 'node:path';
import { apiCallsMade, renderPage, setAuthState, setPathname, setPublicBodies, textNodes, type Locale, type PageRender } from './render';
import { FRONTEND, ID_SHAPES, importClosureOf, requireSubjects, stringsIn } from './scan';
import { rowsForScope } from '../src/components/corpus/PagesList';
import { corpusStream } from './fixtures/corpus/stream';

// ---------------------------------------------------------------------------
// pages-list-reads-public-only — docs/gf-ui-flows.md §24 :676–:682 (region 0 and its only legal source),
// §28 :792 ("no public read lists pages — `list_pages` is GATED, and rightly: a public list of surveyed pages
// is the §9.5 leak"), §27 (the gated twin), §4 :167–:178 (no id as text).
//
// THIS IS A DISCLOSURE RULE AND NOT A UI PREFERENCE. The `pages` facet at `public` is exactly the OPENED pages
// — those a published thesis cites — and it "reveals nothing the thesis pages' links do not already reveal".
// `list_pages`, or the same facet at `all`, is every SURVEYED page: publishing it tells a stranger what is under
// investigation BEFORE it is published. The three cases below are the three ways that could happen, and each has
// its own decoy because no one of them catches the others:
//
//   · the page reaches for a GATED read (`list_pages`, `/api/research/pages`) — caught on the SOURCE, because a
//     second read would be issued on the server and a render case would only see its result;
//   · the page asks the right read at the WRONG SCOPE (`all`) — also source, same reason;
//   · the page reads correctly and the RENDERER draws a row whose `public` is false — caught on the VALUE,
//     because the first two are green in exactly that case.
//
// THE SUBJECT SET IS THE PAGE'S OWN IMPORT CLOSURE, not a hand-listed set of files: a read added in a component
// the page imports is the page's read, and a scan that only read `page.tsx` would miss it.
// ---------------------------------------------------------------------------

const LOCALE: Locale = 'he';
const corpusPage = () => import('../src/app/[locale]/corpus/page');

/** The reads no public page may issue (§28 :792; §31's `filter-is-a-query`). */
const GATED_READS = ['/api/research/', 'list_pages', 'research/pages'];

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/corpus');
});
afterEach(() => {
  setPublicBodies(undefined);
  setAuthState(undefined);
  setPathname(undefined);
});

const CORPUS_PAGE = 'src/app/[locale]/corpus/page.tsx';

/**
 * THE PAGE ITSELF AND EVERY MODULE IT REACHES, through the vacuity guard.
 *
 * `importClosureOf` answers what a file IMPORTS and does not include the file itself — measured here, by a
 * control that failed: the scan found no `/api/corpus` anywhere, because the only module that names it is
 * `page.tsx`, which the closure had left out. A gated read written DIRECTLY in the page would have been
 * invisible to all three cases below. The root is prepended for that reason and not for tidiness.
 */
function closure(): string[] {
  const reached = importClosureOf(join(FRONTEND, CORPUS_PAGE)).filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
  return [...requireSubjects('the corpus page and its import closure', [CORPUS_PAGE, ...reached])];
}

function containerOf(rendered: PageRender): HTMLElement {
  if (rendered.notFound) throw new Error('/corpus answered the one 404, not a body');
  return rendered.container;
}

async function renderCorpus(pages: unknown): Promise<HTMLElement> {
  setPublicBodies({ '/api/corpus': { status: 200, body: { entries: [], pages, nextCursor: null } } });
  return containerOf(await renderPage((await corpusPage()).default, { locale: LOCALE }, { locale: LOCALE }));
}

describe('pages-list-reads-public-only', () => {
  it('NO MODULE THE PAGE REACHES NAMES A GATED READ — and the same reader finds the read it DOES issue', () => {
    const offenders: string[] = [];
    let sawTheLegalRead = false;
    for (const moduleName of closure()) {
      for (const found of stringsIn(join(FRONTEND, moduleName))) {
        for (const gated of GATED_READS) {
          if (found.text.includes(gated)) offenders.push(`${moduleName}:${String(found.line)} names '${gated}'`);
        }
        if (found.text.includes('/api/corpus')) sawTheLegalRead = true;
      }
    }
    // The control asserts a string this chunk actually wrote, so a reader blinded by a changed closure or a
    // broken `stringsIn` fails HERE rather than reporting no offences.
    expect({ offenders, sawTheLegalRead, closureIsReal: closure().length > 3 }).toEqual({
      offenders: [],
      sawTheLegalRead: true,
      closureIsReal: true,
    });
  });

  it("THE PAGE MAKES EXACTLY ONE READ AND IT IS `/api/corpus` — asserted on the READ, not on a string", async () => {
    // THIS ARM WAS REWRITTEN BECAUSE ITS FIRST FORM DID NOT CATCH ITS OWN DECOY. It began as a regex for
    // `scope: 'all'` over the closure's string literals; the decoy that flipped `toReadParameters({}, 'public')`
    // to `'all'` left it GREEN, because the scope is an ARGUMENT and not a string the pattern could see (the
    // other cases reddened only incidentally, because the URL changed and the staged body no longer matched —
    // a catch by accident is not a catch). `apiCallsMade` records the read the page actually issued, so the
    // scope, a gated path and a second read for a filter (§8) are all one assertion on the thing itself.
    await renderCorpus(corpusStream.pages);
    const calls = requireSubjects('reads made by /corpus', apiCallsMade());
    expect({
      paths: calls.map((call) => call.path),
      // Every public read is narrowed at the boundary (§8 :331–:333); a read with no parser is a body nothing
      // checked, which is how a drift reaches the screen.
      everyOneParsed: calls.every((call) => call.parsed),
    }).toEqual({ paths: ['/api/corpus'], everyOneParsed: true });
  });

  it('A ROW WHOSE `public` IS FALSE IS NOT DRAWN AT `public` — the leak the two source cases cannot see', async () => {
    // The case for a page that reads correctly and renders wrongly. The facet below is what a CORRECT read
    // would never return at `public`, and the component must drop it anyway: a renderer that trusted its input
    // would publish whatever a future refactor handed it.
    const facet = [
      { trackedUrlId: 'open-one', url: 'https://example.gov/one/', public: true, first: '20211223211940', last: '20220211120000', entries: 4 },
      { trackedUrlId: 'surveyed-not-open', url: 'https://example.gov/secret/', public: false, first: '20220101090000', last: '20220301090000', entries: 9 },
    ];
    const container = await renderCorpus(facet);
    const shown = textNodes(container)
      .map((node) => node.data)
      .join(' ');
    expect({
      rows: container.querySelectorAll('[data-page-row]').length,
      leaksTheSurveyedUrl: shown.includes('example.gov/secret'),
      showsTheOpenedUrl: shown.includes('example.gov/one'),
      // The pure half, held directly so the rule is readable without a render too.
      pureFilter: rowsForScope(facet, 'public').map((page) => page.trackedUrlId),
      atAllEverythingIsDrawn: rowsForScope(facet, 'all').map((page) => page.trackedUrlId),
    }).toEqual({
      rows: 1,
      leaksTheSurveyedUrl: false,
      showsTheOpenedUrl: true,
      pureFilter: ['open-one'],
      atAllEverythingIsDrawn: ['open-one', 'surveyed-not-open'],
    });
  });
});

describe('the pages list itself', () => {
  it('A ROW CARRIES THE URL, THE INTERVAL AND THE COUNT — and NO time strip, no search, no count over the list', async () => {
    const container = await renderCorpus(corpusStream.pages);
    const shown = textNodes(container)
      .map((node) => node.data)
      .join(' ');
    expect({
      rows: container.querySelectorAll('[data-page-row]').length,
      url: shown.includes('example.gov/one/'),
      // THE INTERVAL IS A DATE, NEVER THE 14 DIGITS. The facet carries wayback timestamps (read from the
      // running backend), so this asserts the FORMATTED form is present and the raw form is not — the defect a
      // browser reading found on the built page while this suite was green over an ISO-dated fixture.
      interval: shown.includes('23.12.2021') || shown.includes('23/12/2021'),
      rawTimestampShown: shown.includes('20211223211940'),
      // §24 :677–:679: nothing else on a row, and nothing above the list.
      timeStrips: container.querySelectorAll('[data-time-strip]').length,
      searchBoxes: container.querySelectorAll('input, form').length,
    }).toEqual({ rows: 2, url: true, interval: true, rawTimestampShown: false, timeStrips: 0, searchBoxes: 0 });
  });

  it('THE EMPTY STATE IS A SENTENCE, NOT AN ERROR — a corpus with no opened page is region 5, not a 404', async () => {
    const container = await renderCorpus([]);
    expect({
      empty: container.querySelectorAll('[data-corpus-empty]').length,
      rows: container.querySelectorAll('[data-page-row]').length,
      // The sentence is drawn, whatever its approved words turn out to be.
      hasWords: (container.querySelector('[data-corpus-empty]')?.textContent ?? '').trim().length > 0,
    }).toEqual({ empty: 1, rows: 0, hasWords: true });
  });

  it('NO ID IS RENDERED AS TEXT on this page — the facet carries `trackedUrlId` and the row composes its label from the url', async () => {
    // THE PLANT IS THE PRODUCTION SHAPE. A `trackedUrlId` is a UUID on the real corpus
    // (`c7039812-d3ed-4206-95ed-8205c3f2b63c`), and until this chunk `ID_SHAPES` knew only 64-hex, cuid and the
    // 14-digit timestamp — so a page printing one passed `no-id-as-text` everywhere. The shape was added to
    // `test/scan.ts` here, measured safe across the whole suite first.
    const facet = [
      { trackedUrlId: 'c7039812-d3ed-4206-95ed-8205c3f2b63c', url: 'https://example.gov/one/', public: true, first: '20211223211940', last: '20220211120000', entries: 4 },
    ];
    const container = await renderCorpus(facet);
    const shown = requireSubjects('text nodes of /corpus', textNodes(container))
      .map((node) => node.data)
      .join(' ');
    expect({
      idShapes: ID_SHAPES.filter(({ pattern }) => pattern.test(shown)).map(({ name }) => name),
      // The control: the shapes DO match when the value is there, so an empty list is not a blind reader. Both
      // the id this page receives and the one the thesis pages carry are named, so a shape quietly dropped
      // from `ID_SHAPES` fails HERE rather than going unnoticed across four suites.
      shapesWork: ID_SHAPES.filter(({ pattern }) => pattern.test('c7039812-d3ed-4206-95ed-8205c3f2b63c cmu0yyflb00028861pp46alwq')).map(({ name }) => name),
    }).toEqual({ idShapes: [], shapesWork: ['cuid', 'uuid'] });
  });

  it('NO CONTEXT LINE AND NO LENS CONTROL ARE DRAWN — a control of one is not a control, and a scope needs two', async () => {
    // AN ABSENCE CASE, AND AN ABSENCE IS THE EASIEST THING IN THE WORLD TO ASSERT BY ACCIDENT. Its predecessor
    // asserted `drawn`, `noStreamLens` and `othersAreLinks` over the DRAWN set — and with nothing drawn every one
    // of those is `[].every(…)`, which is TRUE of a page that rendered nothing at all. So this case holds the
    // absence BY QUERY, carries the POSITIVE CONTROL in the same `expect()` (the `shapesWork` shape, :187), and
    // states a FLOOR on the rows, so it cannot pass over a page that failed to render.
    //
    // WHY THE REGION IS GONE RATHER THAN HELD: a lens set of one is not a control — `?cited=1` reached a page
    // declaring no `searchParams`, so pressing „מצוטטות" re-rendered the identical page and did not even mark
    // itself current — and „דפים פתוחים" names a scope against a second scope this door does not have. Both
    // return at chunk 5 with the stream, as PAGES · CITED — §24 :718, §25 :770 and :783, plan :575.
    const container = await renderCorpus(corpusStream.pages);
    // The control: the three selectors run against a fragment that HAS all three, so a query blinded by a typo or
    // a renamed attribute fails HERE rather than reporting the region absent.
    const control = document.createElement('div');
    control.innerHTML = '<div data-corpus-context><nav data-corpus-lenses><span data-lens="pages"></span></nav></div>';
    expect({
      contextLine: container.querySelector('[data-corpus-context]'),
      lensNav: container.querySelector('[data-corpus-lenses]'),
      lenses: container.querySelectorAll('[data-lens]').length,
      // The FLOOR, two-sided: the page did render its list, so "nothing found" is a fact about the region and not
      // about the render. The fixture's two rows are both `public`, so `public` scope draws both.
      rows: container.querySelectorAll('[data-page-row]').length,
      selectorsWork: [
        control.querySelector('[data-corpus-context]') !== null,
        control.querySelector('[data-corpus-lenses]') !== null,
        control.querySelectorAll('[data-lens]').length,
      ],
    }).toEqual({
      contextLine: null,
      lensNav: null,
      lenses: 0,
      rows: 2,
      selectorsWork: [true, true, 1],
    });
  });
});
