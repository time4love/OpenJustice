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

  it('„N מוסתרים" IS THE WINDOW`S FIGURE ON A SINGLE-PAGE VIEW TOO — reverted 2026-09-21, and the page`s figure is the rival', async () => {
    // THE LINE IS A CONTROL, AND ITS NUMBER IS WHAT THE TAP REVEALS (§24 :684: "a hidden row that announces
    // itself can be audited; one that does not, cannot"). For one day this line read the PAGE's figure from
    // the facet's shape while the tap went on revealing the WINDOW's rows — a line naming three whose tap
    // shows two. That is the promise the element exists to make, broken by the element itself.
    //
    // AND THE PAGE FIGURE WAS WRONG BY CONSTRUCTION, which is the ground that closed it. `bin.passed` is ANY
    // (`corpusReads.ts` :1123) and the sum ran over bins where `!passed`, so A BIN HOLDING ONE FLAGGED AND
    // ONE HIDDEN DIFF CONTRIBUTES ZERO. The real corpus has 24 diffs in 24 distinct bins, so nothing collides
    // today and the number was right BY LUCK. Page-level suppression stays visible where §24 puts it: the
    // dimmed bars of ruling (g) on region 3's strip, which the case above holds.
    //
    // THE FIXTURE STILL MAKES THE TWO DISAGREE, and that is what keeps this an assertion: the page hides
    // THREE and this window holds TWO of them, so the rival value is present and named below.
    const container = await render({ page: PAGE }, withCursor);
    const shape = withCursor.pages.at(0)?.shape;
    if (shape === undefined || shape === null) throw new Error('the page-named fixture carries no shape');
    const announced = Number((container.querySelector('[data-hidden-count]')?.textContent ?? '').replace(/\D/gu, '') || 0);
    expect({
      announced,
      // THE WINDOW'S OWN GATED ROWS, counted here from the body so the number is grounded and not copied.
      windowHides: withCursor.entries.filter((entry) => entry.kind === 'DIFF' && entry.opinion !== null && !entry.opinion.legallySignificant && entry.opinion.categories.length === 0).length,
      // THE RIVAL, STATED: the figure the reverted spelling gave. The assertion is against a value that
      // exists and differs, never against a vacuum.
      pageHides: shape.diffs.filter((bin) => !bin.passed).reduce((n, bin) => n + bin.count, 0),
      // AND THE TAP REVEALS EXACTLY WHAT THE LINE NAMED — the control's whole point, and the seam's end.
      rowsBefore: container.querySelectorAll('[data-entry]').length,
    }).toEqual({ announced: 2, windowHides: 2, pageHides: 3, rowsBefore: 4 });
  });

  it('THE TAP REVEALS AS MANY ROWS AS THE LINE NAMED — the half that made the page`s figure a broken promise', async () => {
    // THE CASE THE SEAM COULD NOT PASS. With the page's figure the line said THREE and this tap added TWO;
    // with the window's the two numbers are one number, and that is the property „announces itself" means.
    const { act } = await import('react');
    const { fireEvent } = await import('@testing-library/react');
    const container = await render({ page: PAGE }, withCursor);
    const before = container.querySelectorAll('[data-entry]').length;
    const control = container.querySelector('[data-hidden-count]');
    if (control === null) throw new Error('the gate hid rows and drew no control to reveal them');
    const announced = Number((control.textContent ?? '').replace(/\D/gu, '') || 0);
    await act(async () => {
      fireEvent.click(control);
      await Promise.resolve();
    });
    const after = container.querySelectorAll('[data-entry]').length;
    expect({
      announced,
      revealed: after - before,
      // A FLOOR ON BOTH: a line naming zero and a tap adding zero would satisfy the equality above.
      nonZero: announced > 0 && after > before,
    }).toEqual({ announced: 2, revealed: 2, nonZero: true });
  });

  it('ACROSS PAGES THE LINE IS THE WINDOW`S TOO — the same number at the other scope', async () => {
    // KEPT THROUGH THE REVERT, and its reason changed with it. It used to be the OTHER half of a two-scope
    // rule; it is now the second example of a one-scope one, and it is worth keeping because a future seat
    // reintroducing a shape-derived figure would have to defeat this arm as well as the one above.
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
