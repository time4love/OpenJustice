jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { apiCallsMade, renderPage, setAuthState, setPathname, setPublicBodies, type Locale, type PageRender } from './render';
import { requireSubjects } from './scan';
import { readCorpusFilters, readCorpusQuery, readCursor, toReadParameters, writeReadQuery } from '../src/lib/corpusQuery';
import { corpusAtPageOne } from './fixtures/corpus/stream';

// ---------------------------------------------------------------------------
// cursor-is-the-read's — docs/gf-ui-flows.md §24 region 4 ("cursor-paginated on the read's own cursor, oldest
// first within the range"); §6.1 (`list_corpus`' `cursor` and `limit`); §8.
//
// THIS CLOSED A SILENCE, NOT A GAP IN A FEATURE. `CORPUS_READ_LIMIT` is 100 and the page's ONLY mention of
// `nextCursor` was the empty fallback: the parser read the field, the page discarded it, and past the
// hundredth record the stream AND region 3 lost the rest with nothing on screen to say so. A corpus that
// drops evidence quietly is the one failure this platform cannot have.
//
// MEASURED ON THE RUNNING BACKEND before any of it was built, and the numbers are why the cases read as they
// do: `?page=<id>` at the default limit returns 43 entries and `nextCursor: null`, so THE CONTROL CANNOT BE
// DEMONSTRATED ON THE REAL BODY WITHOUT `limit` — the same shape as F10, where the live corpus had no
// instance of the state. At `?page=<id>&limit=10` the read returns a real base64url cursor and the window
// runs 23.12.2021 → 17.3.2022: OLDEST FIRST, so the cursor advances toward NEWER and the forward control is
// „טען חדשים יותר" at the FOOT of the stream.
//
// THE FLOOR IS TWO-SIDED BY CONSTRUCTION: every case runs against a body WITH a cursor and a body WITHOUT
// one. A control drawn always and a control drawn never both satisfy "there is a condition", and the second
// of those is exactly the silence this file exists to end.
// ---------------------------------------------------------------------------

const LOCALE: Locale = 'he';
const PAGE = 'page-one';
/** A cursor the READ issued — base64url of the last entry's key, the shape `encodeCursor` produces. */
const CURSOR = 'eyJ0IjoiMjAyMjAzMTcwOTM3NTUiLCJrIjoiQ0FQVFVSRSJ9';

// THE BODY OF A READ THAT NAMES page-one — every case here sends `?page=`, and only a page-named read carries
// §28's `shape`. Its facet counts TEN records where the window holds six, which is the real corpus's own
// relation (43 against a window of 32) and what the last case in this file is written on.
const withCursor = { ...corpusAtPageOne, nextCursor: CURSOR };
const withoutCursor = { ...corpusAtPageOne, nextCursor: null };

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/corpus');
});
afterEach(() => {
  setPublicBodies(undefined);
  setAuthState(undefined);
  setPathname(undefined);
});

function containerOf(rendered: PageRender): HTMLElement {
  if (rendered.notFound) throw new Error('/corpus answered the one 404, not a body');
  return rendered.container;
}

/** Staged at the WIRE path, which is what the page builds — including the cursor when the URL carries one. */
async function render(searchParams: Record<string, string>, body: unknown): Promise<HTMLElement> {
  const params = new URLSearchParams(searchParams);
  const wire = writeReadQuery(toReadParameters(readCorpusFilters(params), 'public', readCursor(params))).toString();
  setPublicBodies({ [`/api/corpus${wire === '' ? '' : `?${wire}`}`]: { status: 200, body } });
  return containerOf(await renderPage((await import('../src/app/[locale]/corpus/page')).default, { locale: LOCALE }, { locale: LOCALE, searchParams }));
}

describe("cursor-is-the-read's", () => {
  it('A BODY WITH A NEXT CURSOR DRAWS THE CONTROL, ONE WITHOUT DRAWS NONE — the two-sided floor', async () => {
    const more = await render({ page: PAGE }, withCursor);
    const end = await render({ page: PAGE }, withoutCursor);
    expect({
      drawnWhenThereIsMore: more.querySelectorAll('[data-load-newer]').length,
      // `nextCursor === null` IS the end. The retired `/evidence` carried a second `hasMore` beside it; two
      // fields for one fact is two fields that can disagree, and this read has only the one.
      notDrawnAtTheEnd: end.querySelectorAll('[data-load-newer]').length,
      words: more.querySelector('[data-load-newer]')?.textContent,
    }).toEqual({ drawnWhenThereIsMore: 1, notDrawnAtTheEnd: 0, words: 'טען חדשים יותר' });
  });

  it('THE CONTROL CARRIES THE READ`S OWN CURSOR AND KEEPS EVERY FILTER — a window is linkable, as region 2 requires', async () => {
    const container = await render({ page: PAGE, kind: 'DIFF' }, withCursor);
    const href = container.querySelector('[data-load-newer]')?.getAttribute('href') ?? '';
    expect({
      // The cursor is the one the READ issued, echoed back unchanged — never composed by the page.
      carriesTheCursor: href.includes(`cursor=${encodeURIComponent(CURSOR)}`) || href.includes(`cursor=${CURSOR}`),
      // AND KEEPS THE FILTERS: a control that dropped them would page through a different question.
      keepsPage: href.includes(`page=${PAGE}`),
      keepsKind: href.includes('kind=DIFF'),
      // It is a LINK and not a button: the window is a URL, which is what makes it shareable.
      isALink: container.querySelector('[data-load-newer]')?.tagName,
    }).toEqual({ carriesTheCursor: true, keepsPage: true, keepsKind: true, isALink: 'A' });
  });

  it('THE CURSOR REACHES THE READ — the URL carries it, the wire sends it, and it is NOT one of the five', async () => {
    await render({ page: PAGE, cursor: CURSOR }, withCursor);
    const calls = requireSubjects('reads made', apiCallsMade());
    expect({
      // THE DEFECT THIS CATCHES: a control that linked to a cursor the page then ignored would render the
      // SAME window for ever, and look like it worked. The wire is the assertion.
      wire: calls.at(0)?.path,
      reads: calls.length,
      // A CURSOR IS NOT A FILTER (§24 region 0's five). Alone it changes nothing and the view stays the LIST —
      // a cursor with no filter has nothing to page through.
      aloneItIsTheList: readCorpusQuery(new URLSearchParams({ cursor: CURSOR })).view,
      // And it is not a chip either, so removing filters never carries a stale cursor along.
      notAFilter: Object.keys(readCorpusFilters(new URLSearchParams({ cursor: CURSOR }))).length,
    }).toEqual({ wire: `/api/corpus?page=${PAGE}&cursor=${CURSOR}`, reads: 1, aloneItIsTheList: 'list', notAFilter: 0 });
  });

  it('REGION 3 DRAWS THE PAGE AND THE STREAM DRAWS THE WINDOW — and the card says which it is speaking for', async () => {
    // THIS CASE ASSERTED THE OPPOSITE UNTIL 2026-09-21, and the rule it held is the defect the researcher
    // ruled on: "the strip and the rows are ONE array, so they cannot disagree". They cannot disagree only
    // while a page fits one window — and the moment it does not, "one page's shape" quietly becomes "the
    // shape of what has loaded so far" while the card's own count line, read from the facet, goes on naming
    // the page. Measured on the real corpus: „43 רשומות" over sixteen dots.
    //
    // WHAT REPLACES IT IS THE SAME INSTINCT AT THE RIGHT SCOPE: two regions, two sources, and each says which
    // it speaks for. The strip is the FACET's `shape` — the page, computed before the filter and before this
    // cursor — and the stream is the window this cursor returned.
    const container = await render({ page: PAGE }, withCursor);
    const marks = [...container.querySelectorAll('[data-strip-dot]')].reduce((n, dot) => n + Number(dot.getAttribute('data-strip-count') ?? 1), 0);
    const bars = [...container.querySelectorAll('[data-strip-bar]')].reduce((n, bar) => n + Number(bar.getAttribute('data-strip-count') ?? 1), 0);
    const shape = withCursor.pages.at(0)?.shape;
    if (shape === undefined || shape === null) throw new Error('the page-named fixture carries no shape to compare against');
    const rows = container.querySelectorAll('[data-entry]').length;
    expect({
      // EVERY RECORD THE PAGE HAS REACHES A MARK — the shape's own totals, not the window's.
      dotsCoverThePage: marks === shape.captures.reduce((n, bin) => n + bin.count, 0),
      barsCoverThePage: bars === shape.diffs.reduce((n, bin) => n + bin.count, 0),
      // AND THE PAGE IS BIGGER THAN THE WINDOW, which is what makes the two lines above assertions: a fixture
      // whose window held the whole page would satisfy them with either source.
      pageCaptures: marks,
      windowCaptures: container.querySelectorAll('[data-capture-row]').length,
      pageDiffs: bars,
      windowRows: rows,
      // THE FLOOR: none of these is zero, so the equalities are not two blanks agreeing.
      nonEmpty: marks > 0 && bars > 0 && rows > 0,
    }).toEqual({
      dotsCoverThePage: true,
      barsCoverThePage: true,
      pageCaptures: 5,
      windowCaptures: 2,
      pageDiffs: 5,
      windowRows: 4,
      nonEmpty: true,
    });
  });

  it('„N מוסתרים" IS THE PAGE`S FIGURE ON A SINGLE-PAGE VIEW, and the WINDOW`S where there is no page', async () => {
    // THE SAME RULE ONE REGION DOWN (§24 :755): region 4's count line was computed from the window and reads
    // as the page's — "honest only while a page fits one". With a page in force the figure is the shape's:
    // the sum of `count` over the diff bins that did not pass the gate.
    //
    // THE FIXTURE MAKES THE TWO DISAGREE ON PURPOSE. The page hides THREE changes and this window holds only
    // TWO of them, so a line reading `hidden.length` says 2 and a line reading the shape says 3 — and no
    // arithmetic accident joins them.
    const container = await render({ page: PAGE }, withCursor);
    const shape = withCursor.pages.at(0)?.shape;
    if (shape === undefined || shape === null) throw new Error('the page-named fixture carries no shape');
    const announced = Number((container.querySelector('[data-hidden-count]')?.textContent ?? '').replace(/\D/gu, '') || 0);
    expect({
      announced,
      pageHides: shape.diffs.filter((bin) => !bin.passed).reduce((n, bin) => n + bin.count, 0),
      // THE NUMBER THE OLD SPELLING GAVE, stated so the assertion is against a rival value and not a vacuum.
      windowHides: withCursor.entries.filter((entry) => entry.kind === 'DIFF' && entry.opinion !== null && !entry.opinion.legallySignificant && entry.opinion.categories.length === 0).length,
      // AND THE TAP STILL REVEALS THE WINDOW'S, which is the seam this ruling leaves and which the component
      // states in words: the control exists only while the window really hides something.
      hiddenRowsBefore: container.querySelectorAll('[data-entry]').length,
    }).toEqual({ announced: 3, pageHides: 3, windowHides: 2, hiddenRowsBefore: 4 });
  });

  it('ACROSS PAGES THE LINE IS THE WINDOW`S — there is no page, so there is no shape to read', async () => {
    // The other half, and without it "the line is the page's" would be a rule with one example. A stream
    // reached by a KIND chip names no page: §28 sends no shape, so the only figure the view has is its own.
    const { corpusStream } = await import('./fixtures/corpus/stream');
    const container = await render({ kind: 'DIFF' }, corpusStream);
    const announced = Number((container.querySelector('[data-hidden-count]')?.textContent ?? '').replace(/\D/gu, '') || 0);
    expect({
      announced,
      // The cross-page fixture's own gated rows, counted here so the number is grounded and not copied.
      windowHides: corpusStream.entries.filter((entry) => entry.kind === 'DIFF' && entry.opinion !== null && !entry.opinion.legallySignificant && entry.opinion.categories.length === 0).length,
      noShape: corpusStream.pages.every((row) => row.shape === null),
    }).toEqual({ announced: 2, windowHides: 2, noShape: true });
  });
});
