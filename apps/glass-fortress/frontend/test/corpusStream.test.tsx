jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { apiCallsMade, renderPage, setAuthState, setPathname, setPublicBodies, textNodes, type Locale, type PageRender } from './render';
import { ID_SHAPES, requireSubjects } from './scan';
import { readCorpusFilters, readCorpusQuery, toReadParameters, writeCorpusQuery, writeReadQuery } from '../src/lib/corpusQuery';
import { flaggedByClassifier, partitionBySignificance } from '../src/lib/corpusSignificance';
import { corpusAtPageOne, corpusStream } from './fixtures/corpus/stream';

// ---------------------------------------------------------------------------
// corpus-stream — docs/gf-ui-flows.md §24 regions 1, 2, 4 and 5 (:748–:767) and :660–:666 (the two weights);
// §25 :770 and :783 (the lens set is TWO); §8 (a filter is a parameter of the ONE read, never a second read);
// evidence A4 :1080–:1093.
//
// THE GATE IS HELD BY VALUE AND NOT BY PROPERTY NAME, which is the whole reason this fixture grew. Of 21
// diffs on the real corpus 20 are editorial and EIGHT of those are ALSO legally significant, so a gate
// written on `editorial` would hide exactly the rows the page exists to surface — and a case that only
// asserted "the gate reads `legallySignificant`" would pass over that implementation while a reader lost
// eight changes. The fixture therefore carries a diff that is editorial AND significant beside one that is
// editorial only, and the cases assert WHICH ROWS ARE DRAWN.
//
// WHAT THESE CASES CANNOT HOLD, said rather than implied: jsdom computes no layout, so nothing here witnesses
// the opinion's two-line clamp or that the chip row scrolls horizontally. Those are browser readings at
// 375 px and they live in the step's dated doc.
// ---------------------------------------------------------------------------

const LOCALE: Locale = 'he';
const corpusPage = () => import('../src/app/[locale]/corpus/page');

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

/**
 * The page rendered AS A STREAM — which means with a query, because a bare `/corpus` is the pages list.
 *
 * THE BODY IS STAGED AT THE WIRE PATH, WHICH IS NOT THE CASE'S URL. This helper used to compose the staged path
 * from `searchParams` — the very URL the case passed — so the double answered whatever the page asked for and
 * a page that built a path the backend REFUSES was indistinguishable from one that built a good one. The CITED
 * lens shipped that way: every case here was green while `/he/corpus?cited=1` rendered a 500 on the real
 * backend. A fixture keyed by the page's own path cannot witness a wrong path.
 *
 * `writeReadQuery` is CALLED for the wire path rather than re-spelled here, and `filter-is-a-query` is the file
 * that holds that serialiser against the values measured from the running backend. The division is deliberate:
 * this file asserts what the stream DRAWS, that one asserts what it SENDS, and neither may quietly become the
 * other's authority.
 */
async function renderStream(searchParams: Record<string, string>, body: unknown = corpusStream): Promise<HTMLElement> {
  const wire = writeReadQuery(toReadParameters(readCorpusFilters(new URLSearchParams(searchParams)), 'public')).toString();
  const path = `/api/corpus${wire === '' ? '' : `?${wire}`}`;
  setPublicBodies({ [path]: { status: 200, body } });
  return containerOf(await renderPage((await corpusPage()).default, { locale: LOCALE }, { locale: LOCALE, searchParams }));
}

/** The page rendered when the route REFUSES the filters — A2's 400, which region 5 draws as its filtered state. */
async function renderRefused(searchParams: Record<string, string>): Promise<HTMLElement> {
  const wire = writeReadQuery(toReadParameters(readCorpusFilters(new URLSearchParams(searchParams)), 'public')).toString();
  setPublicBodies({ [`/api/corpus${wire === '' ? '' : `?${wire}`}`]: { status: 400 } });
  return containerOf(await renderPage((await corpusPage()).default, { locale: LOCALE }, { locale: LOCALE, searchParams }));
}

const shownText = (container: HTMLElement): string =>
  textNodes(container)
    .map((node) => node.data)
    .join(' ');

describe('corpus-stream', () => {
  it('A QUERY PARAMETER IS THE STREAM AND A BARE URL IS THE LIST — the page reads `searchParams`, which chunk 2 did not', async () => {
    const stream = await renderStream({ kind: 'DIFF' });
    expect({
      stream: stream.querySelectorAll('[data-stream]').length,
      rowsDrawn: stream.querySelectorAll('[data-entry]').length > 0,
      noPagesList: stream.querySelectorAll('[data-pages-list]').length,
    }).toEqual({ stream: 1, rowsDrawn: true, noPagesList: 0 });
  });

  it('TWO WEIGHTS OF ROW — a CAPTURE is a thin row with its anchor mark and a COPY; a DIFF is a card with its interval and size', async () => {
    const container = await renderStream({ kind: 'DIFF' });
    const shown = shownText(container);
    expect({
      captures: container.querySelectorAll('[data-capture-row]').length,
      diffs: container.querySelectorAll('[data-diff-card]').length,
      anchorMarks: container.querySelectorAll('[data-anchor-mark]').length,
      // THE COPY CONTROL BY ITS OWN MARKER, not by counting buttons. Counting every button in the row was a
      // loose proxy that became wrong the moment the row gained its open-record tap at 5b(b) — it reported 4
      // where the row has 2 copies and 2 taps. A count of "controls" is not a count of THE control.
      copies: container.querySelectorAll('[data-capture-row] [data-copy]').length,
      // And the new surface, asserted beside it so the two are never confused again.
      rowTaps: container.querySelectorAll('[data-capture-row] [data-open-record]').length,
      intervals: container.querySelectorAll('[data-interval]').length,
      // AWAITING DERIVATION IS A STATE, NOT AN ERROR (§24 region 4): the card says so where `current` is null.
      awaiting: container.querySelectorAll('[data-awaiting]').length,
      // The dates are FORMATTED — the 14-digit timestamp that names a capture is never read aloud (§4 :168).
      rawTimestamp: shown.includes('20211223211940'),
      formatted: shown.includes('23.12.2021'),
    }).toEqual({ captures: 2, diffs: 3, anchorMarks: 2, copies: 2, rowTaps: 2, intervals: 3, awaiting: 1, rawTimestamp: false, formatted: true });
  });

  it('THE GATE HIDES BY `legallySignificant` AND NEVER BY `editorial` — asserted on WHICH ROWS, not on a field name', () => {
    // THE PURE HALF, by identity. The fixture's editorial-AND-significant diff is the row the measurement is
    // about: an `editorial` gate would hide it, and hiding it is the defect the amendment exists to prevent.
    const entries = requireSubjects('the fixture entries', corpusStream.entries);
    const { shown, hidden } = partitionBySignificance(entries);
    const nameOf = (entry: (typeof entries)[number]) => (entry.kind === 'CAPTURE' ? `capture ${entry.capture}` : `diff ${entry.before}`);
    expect({
      shown: shown.map(nameOf),
      hidden: hidden.map(nameOf),
      // The two rows the gate must treat as UNJUDGED rather than insignificant (the researcher, 2026-09-19).
      captureIsNeverGated: entries.filter((entry) => entry.kind === 'CAPTURE').every(flaggedByClassifier),
      noOpinionIsNeverGated: entries.filter((entry) => entry.kind === 'DIFF' && entry.opinion === null).every(flaggedByClassifier),
    }).toEqual({
      shown: ['capture 20211223211940', 'capture 20220105090000', 'diff 20211223211940', 'diff 20220105090000', 'diff 20220415080000'],
      hidden: ['diff 20220301080000', 'diff 20220520080000'],
      captureIsNeverGated: true,
      noOpinionIsNeverGated: true,
    });
  });

  it('THE COUNT LINE STATES THE TRUE HIDDEN NUMBER AND ONE TAP REVEALS THEM — both halves, because hiding alone is what §24 forbids', async () => {
    const container = await renderStream({ kind: 'DIFF' });
    const before = container.querySelectorAll('[data-entry]').length;
    const announcement = container.querySelector('[data-hidden-count]');
    expect({
      drawnBefore: before,
      announces: (announcement?.textContent ?? '').includes('2'),
      // The announcement is a CONTROL, not a sentence: a line that said how many were hidden without offering
      // them would be the half that cannot be audited.
      isAControl: announcement?.tagName,
    }).toEqual({ drawnBefore: 5, announces: true, isAControl: 'BUTTON' });
  });

  it('A CHIP CHANGES ITS OWN PARAMETER AND KEEPS THE OTHERS — which is what makes a filtered view linkable', async () => {
    // ADDED AFTER A DECOY REDDENED NOTHING (2026-09-19): a chip built from `{ page }` alone, dropping the
    // filters already in the URL, passed every other arm of this suite — the round trip was still an
    // identity, the chip was still a query, the active chip was still marked. §24 :750–:751 is what it broke:
    // "the URL carries them, so a filtered view is linkable". A reader filtering to one page inside a date
    // range would have silently lost the range.
    const container = await renderStream({ kind: 'DIFF', cited: '1' });
    const hrefs = [...container.querySelectorAll('[data-chip]')].map((chip) => chip.getAttribute('href') ?? '');
    const carried = hrefs.map((raw) => {
      const held = readCorpusFilters(new URLSearchParams(raw.split('?').at(1) ?? ''));
      // Every chip that is not the KIND chip must still carry `kind`, and every chip that is not the CITED
      // chip must still carry `cited`; the chips that DO own those parameters are the ones that remove them.
      return { raw, keepsKind: held.kind === 'DIFF', keepsCited: held.cited === true };
    });
    // THE WHOLE SET, BY VALUE, AND THE WORDS AS LITERALS (R63: a case that reads the catalogue drifts WITH
    // it, so approved copy is pinned rather than looked up). Written first as three booleans, one of which was true by
    // construction and therefore asserted nothing — the vacuity this repository names as its own. The pairs
    // below say the same thing and cannot be satisfied by an expression that happens to short-circuit.
    expect({
      // THREE CHIPS, NOT FIVE (board ט·ב, 2026-09-21): the PAGE PICKER is gone — a chip per page put the
      // whole corpus in a scrolling row, and a page is chosen in region 0.
      pairs: [...container.querySelectorAll('[data-chip]')].map((chip) => [chip.textContent, chip.getAttribute('href')]),
      // And the two operations are still one: a chip that OWNS a parameter removes it, and every other chip
      // carries it forward.
      someChipRemovesKind: carried.some((one) => !one.keepsKind),
      someChipRemovesCited: carried.some((one) => !one.keepsCited),
    }).toEqual({
      pairs: [
        // CAPTURE owns neither: it sets its own kind and CARRIES `cited`.
        ['צילומים', '/he/corpus?kind=CAPTURE&cited=1'],
        // DIFF is the kind in force, so pressing it REMOVES `kind` — and keeps `cited`.
        ['שינויים', '/he/corpus?cited=1'],
        // CITED is in force, so pressing it removes `cited` — and keeps `kind`.
        ['מצוטטות', '/he/corpus?kind=DIFF'],
      ],
      someChipRemovesKind: true,
      someChipRemovesCited: true,
    });
  });

  it('EVERY CHIP IS A QUERY PARAMETER, AND THE ROUND TRIP IS AN IDENTITY — `lib/corpusQuery.ts` is CALLED, never re-spelled', async () => {
    // A FILTER IS IN FORCE, and it has to be: since board ט·ב removed the page picker, `?page=` alone draws
    // three chips of which NONE is active — so this case read as "no chip marks itself" and would have been
    // satisfied by a page that never marks one. `cited=1` gives it a chip to find.
    const container = await renderStream({ page: 'page-one', cited: '1' }, corpusAtPageOne);
    const chips = [...container.querySelectorAll('[data-chip]')];
    const hrefs = chips.map((chip) => chip.getAttribute('href') ?? '');
    // THE IDENTITY: every chip's own query, read back through the pure module and written out again, is the
    // string it started as. A chip that built its own query string drifts from the read on its first edge case.
    const roundTrips = hrefs.map((raw) => {
      const query = raw.split('?').at(1) ?? '';
      return writeCorpusQuery(readCorpusFilters(new URLSearchParams(query))).toString() === query;
    });
    expect({
      chips: chips.length > 0,
      everyChipIsAQuery: hrefs.every((raw) => raw.startsWith('/he/corpus')),
      roundTripsAreIdentities: roundTrips.every(Boolean),
      // The ACTIVE chip is the one the URL carries, and pressing it again REMOVES it — which is how §24's
      // region 5 shows "the filters … for removal".
      activeChips: container.querySelectorAll('[data-chip-active]').length,
      // Pressing the ACTIVE chip again removes ITS parameter and keeps the page, which is what a single-page
      // view's filter row is for: the page is the subject and only the row filters come and go.
      removesOnSecondPress: hrefs.some((raw) => raw === '/he/corpus?page=page-one'),
      // AND THE PAGE ITSELF IS REMOVED BY THE ONE LINK, not by a chip (board ט·ב): back to region 0, where a
      // page is chosen. A query on it would land on the stream, which is not region 0.
      allPages: container.querySelector('[data-all-pages]')?.getAttribute('href'),
      pageIsNotAChip: [...container.querySelectorAll('[data-chip]')].every((chip) => !(chip.textContent ?? '').includes('דף')),
    }).toEqual({
      chips: true,
      everyChipIsAQuery: true,
      roundTripsAreIdentities: true,
      activeChips: 1,
      removesOnSecondPress: true,
      allPages: '/he/corpus',
      pageIsNotAChip: true,
    });
  });

  it('AN ACTIVE CHIP LOOKS ACTIVE — a VISIBLE difference, and the lens control`s own token (§24 :717)', async () => {
    // F2. `Chip`'s `className` was byte-identical whether `active` was true or false, and the only thing that
    // moved was `data-chip-active` — a TEST HOOK that three cases read and that no reader can see. §24 :717
    // calls this row "the ACTIVE filters as chips", so a chip nobody can tell from an inactive one is the
    // control not drawn; and the lens control in the SAME component already marks its current item, which
    // made it two controls in one file disagreeing about how to say "this one is on".
    //
    // ASSERTED ON WHAT A READER MEETS — the class the chip carries and the `aria-current` a screen reader
    // hears — and NEVER on `data-chip-active`, which is exactly the attribute that could not see the defect.
    const container = await renderStream({ page: 'page-one', cited: '1' }, corpusAtPageOne);
    const chips = requireSubjects('the chips of a filtered view', [...container.querySelectorAll('[data-chip]')]);
    const on = chips.filter((chip) => chip.getAttribute('data-chip-active') === 'true');
    const off = chips.filter((chip) => chip.getAttribute('data-chip-active') === null);
    // THE LENS IS READ FROM A CROSS-PAGE VIEW, because board ט·ב does not draw the lens control inside a
    // single-page view at all — so the token this chip is meant to match has to be fetched where it lives.
    const lens = (await renderStream({ cited: '1' })).querySelector('[data-lens][aria-current]');
    expect({
      // TWO-SIDED BY CONSTRUCTION: one chip is on and the others are not, so "they all look the same" fails
      // whichever way the sameness falls.
      activeCount: on.length,
      inactiveCount: off.length > 0,
      // THE CLASSES DIFFER, and they differ in the token that carries the difference.
      activeIsInked: on.every((chip) => (chip.getAttribute('class') ?? '').includes('text-ink') && !(chip.getAttribute('class') ?? '').includes('text-ink-muted')),
      inactiveIsMuted: off.every((chip) => (chip.getAttribute('class') ?? '').includes('text-ink-muted')),
      // THE DEFECT, STATED AS THE PROPERTY IT BROKE: no two chips of different states carry the same class.
      sameClassEitherWay: on.some((chip) => off.some((other) => other.getAttribute('class') === chip.getAttribute('class'))),
      // AND IT IS ANNOUNCED, not only drawn.
      activeAriaCurrent: on.map((chip) => chip.getAttribute('aria-current')),
      inactiveAriaCurrent: off.map((chip) => chip.getAttribute('aria-current')),
      // NO NEW COLOUR AND NO NEW TOKEN: the chip uses the one the lens control in the same component uses.
      lensToken: (lens?.getAttribute('class') ?? '').includes('text-ink'),
    }).toEqual({
      activeCount: 1,
      inactiveCount: true,
      activeIsInked: true,
      inactiveIsMuted: true,
      sameClassEitherWay: false,
      activeAriaCurrent: ['true'],
      inactiveAriaCurrent: [null, null],
      lensToken: true,
    });
  });

  it('THE LENS SET IS TWO — PAGES · CITED — and the SCOPE LABEL does not return', async () => {
    const container = await renderStream({ cited: '1' });
    const shown = shownText(container);
    expect({
      lenses: [...container.querySelectorAll('[data-lens]')].map((lens) => lens.getAttribute('data-lens')),
      current: [...container.querySelectorAll('[data-lens][aria-current="page"]')].map((lens) => lens.getAttribute('data-lens')),
      // §25 :783: there is no bare `/corpus/claims`, so no lens may offer one.
      noClaimsLens: shown.includes('/corpus/claims'),
      // The retired scope label, by its own words.
      noScopeLabel: shown.includes('דפים פתוחים'),
      count: container.querySelectorAll('[data-corpus-count]').length,
    }).toEqual({ lenses: ['pages', 'cited'], current: ['cited'], noClaimsLens: false, noScopeLabel: false, count: 1 });
  });

  it('THE PAGE MAKES EXACTLY ONE READ AND THE FILTERS ARE ITS PARAMETERS — §8, never a second read', async () => {
    await renderStream({ page: 'page-one', kind: 'DIFF' }, corpusAtPageOne);
    const calls = requireSubjects('reads made by the stream', apiCallsMade());
    expect({
      count: calls.length,
      path: calls.at(0)?.path,
      parsed: calls.every((call) => call.parsed),
    }).toEqual({ count: 1, path: '/api/corpus?page=page-one&kind=DIFF', parsed: true });
  });

  it('A ROW TAP OPENS THE RECORD AS A RIGHT-PANE TAB — new surface at 5b(b), where no row was a link at all', async () => {
    // §24 region 4 and §26: the row opens THE RECORD, and since the shell gained a pane it is a TAB and not a
    // sheet of its own. Held as a value — WHICH record each row opens — because a tap that opened the same
    // record from every row would satisfy any count.
    const container = await renderStream({ page: 'page-one' }, corpusAtPageOne);
    const taps = requireSubjects('row taps', [...container.querySelectorAll('[data-open-record]')]);
    const ids = taps.map((tap) => tap.getAttribute('data-open-record') ?? '');
    expect({
      // Every row has exactly one, captures and diffs alike — both weights open a record.
      tapsPerRow: [container.querySelectorAll('[data-capture-row] [data-open-record]').length, container.querySelectorAll('[data-diff-card] [data-open-record]').length],
      // DISTINCT: four rows, four different records.
      distinct: new Set(ids).size === ids.length,
      // IT IS A BUTTON AND NOT AN ANCHOR. The record is a pane tab, not a route, and an anchor would promise
      // a URL this act does not produce — the `no-door-before-it-exists` shape, one chunk early.
      allButtons: taps.every((tap) => tap.tagName === 'BUTTON'),
      // NEVER AN ID AS TEXT: the identity is an attribute, and no row reads it aloud.
      idNotShown: !(container.textContent ?? '').includes('capture:page-one'),
      // EACH TAP NAMES THE RECORD ITS OWN ROW SHOWS — added after a decoy that made every row open the SAME
      // record reddened NOTHING. Matching the attribute against the row's OWN rendered date is what links the
      // two; a `distinct` count alone passed that decoy, because the attribute was right and the handler was
      // not. The residual — what the click HANDLER passes — is unobservable here and is named in the report.
      tapMatchesItsOwnRow: [...container.querySelectorAll('[data-capture-row]')].every((row) => {
        const id = row.querySelector('[data-open-record]')?.getAttribute('data-open-record') ?? '';
        const shownDate = [...row.querySelectorAll('bdi')].map((node) => node.textContent ?? '').find((text) => /^\d/.test(text)) ?? '';
        const day = id.split(':').at(-1)?.slice(0, 8) ?? '';
        const asShown = `${day.slice(6, 8).replace(/^0/, '')}.${day.slice(4, 6).replace(/^0/, '')}.${day.slice(0, 4)}`;
        return shownDate === asShown;
      }),
      // NO NESTED CONTROL — the copy and the „קרא עוד" reveal stay OUTSIDE the tap, because a control inside a
      // control is what `valid-nesting` refuses and what a browser resolves by guessing.
      noControlInsideTap: taps.every((tap) => tap.querySelector('button, a') === null),
      // TWO CAPTURES AND TWO DIFFS: the page-named body holds this page's rows only, and the gate hides two
      // of its four diffs — which is also why the count line below has something to announce.
    }).toEqual({ tapsPerRow: [2, 2], distinct: true, allButtons: true, idNotShown: true, tapMatchesItsOwnRow: true, noControlInsideTap: true });
  });

  it('AN UNPARSEABLE DATE IS NOT A FILTER — it is DROPPED before the wire, as `kind=BOGUS` already was', async () => {
    // §24 region 0, ruled round 3: "neither is a value the page cannot parse". `kind` was read that way from
    // the start and the two dates were not, and that asymmetry was the ONLY way a reader could put a value on
    // the wire that the route refuses — measured, `?since=garbage` earned a 400 and the page rendered a 500
    // before `readPublic` carried the state. The shape is the backend's own `DAY`, copied with its source named.
    const container = await renderStream({ page: 'page-one', since: 'garbage' }, corpusAtPageOne);
    expect({
      // The bad value never reaches the read; the good filter beside it still does.
      wire: apiCallsMade().at(0)?.path,
      // A DROPPED value is not a chip either, so nothing offers to remove a filter that is not in force —
      // and since board ט·ב the PAGE is not a chip at all, so a view filtered to one page with a garbage
      // date has NO active chip. The way back to region 0 is the link, asserted below.
      activeChips: [...container.querySelectorAll('[data-chip][data-chip-active="true"]')].length,
      allPages: container.querySelector('[data-all-pages]')?.getAttribute('href'),
      // TWO-SIDED: a WELL-FORMED date is kept, so this is a parser and not a deletion.
      keepsAGoodDate: readCorpusFilters(new URLSearchParams({ since: '2022-01-01' })).since,
      dropsABadOne: readCorpusFilters(new URLSearchParams({ since: 'garbage' })).since,
      // THE SHAPE IS STRICT, AND THIS ARM EXISTS BECAUSE A LAX DECOY REDDENED NOTHING. `garbage` is refused by
      // any shape at all, so testing it alone could not tell the backend's `/^\d{4}-\d{2}-\d{2}$/` from a
      // loose `/^\d{4}-\d{1,2}-\d{1,2}$/` — and the loose one passes `2022-1-1` STRAIGHT TO A ROUTE THAT
      // REFUSES IT, which is the whole defect the drop was ruled to prevent. Zero-padding is the difference.
      dropsAnUnpaddedDay: readCorpusFilters(new URLSearchParams({ since: '2022-1-1' })).since,
      dropsAnUnpaddedMonth: readCorpusFilters(new URLSearchParams({ until: '2022-1-01' })).until,
      dropsATimestamp: readCorpusFilters(new URLSearchParams({ since: '20220101' })).since,
      // And with nothing else in the URL, an unparseable date leaves the LIST rather than an empty stream.
      aloneItIsTheList: readCorpusQuery(new URLSearchParams({ since: 'garbage' })).view,
    }).toEqual({
      wire: '/api/corpus?page=page-one',
      activeChips: 0,
      allPages: '/he/corpus',
      keepsAGoodDate: '2022-01-01',
      dropsABadOne: undefined,
      dropsAnUnpaddedDay: undefined,
      dropsAnUnpaddedMonth: undefined,
      dropsATimestamp: undefined,
      aloneItIsTheList: 'list',
    });
  });

  it('REGION 3 IS DRAWN ONLY WHEN `page` IS SET — and a filter with no page carries no card at all (a)', async () => {
    // Ruling (a): the card is ONE page's shape, so a stream reached by `?cited=1`, `?since=` or `?until=`
    // alone has no "the page" and begins under the chips. Two-sided, because a card drawn always and a card
    // drawn never both satisfy "there is a condition".
    const withPage = await renderStream({ page: 'page-one' }, corpusAtPageOne);
    const withoutPage = await renderStream({ kind: 'DIFF' });
    const cited = await renderStream({ cited: '1' });
    expect({
      pageFilterDrawsIt: withPage.querySelectorAll('[data-page-card]').length,
      stripIsInIt: withPage.querySelectorAll('[data-time-strip]').length,
      kindFilterDoesNot: withoutPage.querySelectorAll('[data-page-card]').length,
      citedLensDoesNot: cited.querySelectorAll('[data-page-card]').length,
      // The card names the page the way §4 requires and never by its id. IT IS `PageUrl`'s ELEMENT as of
      // chunk 6 (`data-page-url`, one emitter under `src/`), located by the card that contains it — WHICH url
      // a reader is looking at is said by the ancestor, never by a third name for the element itself.
      showsUrlNotId: (withPage.querySelector('[data-page-card] [data-page-url]')?.textContent ?? '').includes('example.gov'),
      noIdInCard: !(withPage.querySelector('[data-page-card]')?.textContent ?? '').includes('page-one'),
    }).toEqual({
      pageFilterDrawsIt: 1,
      stripIsInIt: 1,
      kindFilterDoesNot: 0,
      citedLensDoesNot: 0,
      showsUrlNotId: true,
      noIdInCard: true,
    });
  });

  it('A ROW NAMES ITS PAGE ONLY WHEN THE VIEW SPANS PAGES (§24 :763 as amended 2026-09-21) — three arms', async () => {
    // THE RETIRED CLAUSE said "a page label tap adds the PAGE filter" and was never built; board ט·ב made it
    // contradictory, because a page is CHOSEN in region 0 and NAMED by region 3. What replaced it is the rule
    // this case holds. MEASURED on the real corona body: 43 rows repeating one url under a card that already
    // said it.
    //
    // THREE ARMS, BECAUSE ONE SATISFIES BOTH DEFECTS. A row that never names its page passes the single-page
    // arm alone, and leaves a reader of `?cited=1` — which carries NO card — with no page named anywhere.
    //
    // AND A THIRD ARM, ADDED AFTER A DECOY PASSED THE FIRST TWO (2026-09-21). `spansPages` derived from the
    // ENTRIES — `new Set(entries.map((e) => e.page.trackedUrlId)).size > 1` — satisfied both arms above,
    // because this fixture's cross-page window happens to hold two pages and the single-page one holds one.
    // The rule is about the VIEW and not about what a window happened to return: a cross-page view carries NO
    // card (ruling (a)), so a window of it that returns rows of one page would name that page NOWHERE.
    const single = await renderStream({ page: 'page-one' }, corpusAtPageOne);
    const across = await renderStream({ kind: 'DIFF' });
    const narrow = await renderStream({ cited: '1' }, { ...corpusStream, entries: corpusStream.entries.filter((entry) => entry.page.trackedUrlId === 'page-one') });
    const urlsIn = (container: HTMLElement, selector: string) => [...container.querySelectorAll(selector)].map((one) => one.textContent ?? '');
    const rowUrls = (container: HTMLElement) => urlsIn(container, '[data-capture-row] [data-page-url], [data-diff-card] [data-page-url]');
    expect({
      // (a) A SINGLE-PAGE VIEW: the card names the page ONCE and no row repeats it.
      singleRows: single.querySelectorAll('[data-entry]').length,
      singleRowUrls: rowUrls(single).length,
      singleCardUrls: urlsIn(single, '[data-page-card] [data-page-url]'),
      // (b) ACROSS PAGES: there is no card, so EVERY row names its own page — and the rows really do belong
      // to more than one page, which is the floor that makes „spans pages" a fact about this body and not a
      // word. A count alone would be satisfied by five rows of one page.
      acrossRows: across.querySelectorAll('[data-entry]').length,
      acrossRowUrls: rowUrls(across).length,
      acrossDistinct: [...new Set(rowUrls(across))].sort(),
      acrossCards: across.querySelectorAll('[data-page-card]').length,
      // (c) A CROSS-PAGE VIEW WHOSE WINDOW HOLDS ONE PAGE still names it on every row — there is no card.
      narrowRows: narrow.querySelectorAll('[data-entry]').length,
      narrowRowUrls: rowUrls(narrow).length,
      narrowDistinct: [...new Set(rowUrls(narrow))],
      narrowCards: narrow.querySelectorAll('[data-page-card]').length,
    }).toEqual({
      singleRows: 4,
      singleRowUrls: 0,
      singleCardUrls: ['example.gov/one/'],
      acrossRows: 5,
      acrossRowUrls: 5,
      acrossDistinct: ['example.gov/one/', 'example.gov/two/'],
      acrossCards: 0,
      narrowRows: 4,
      narrowRowUrls: 4,
      narrowDistinct: ['example.gov/one/'],
      narrowCards: 0,
    });
  });

  it('THE STRIP IS THE PAGE`S SHAPE AND NOT THE VIEW`S — four filters, one strip, measured on the real corpus (c, e, g)', async () => {
    // THE DEFECT, MEASURED LIVE ON 2026-09-21 AND RULED THE SAME DAY (§24 :755). The card's text line came
    // from the unfiltered facet while its strip was built from the filtered, cursor-windowed entries, so ONE
    // ELEMENT CONTRADICTED ITSELF:
    //
    //   ?page=<corona>            „43 רשומות"   16 dots + 16 bars
    //   …&kind=CAPTURE            „43 רשומות"   16 dots +  0 bars
    //   …&kind=DIFF               „43 רשומות"    0 dots + 16 bars
    //   …&kind=DIFF&cited=1       „43 רשומות"    0 dots +  0 bars
    //
    // THE CASE IS THAT TABLE. Each arm stages the body a real read answers — the entries NARROWED by the chip,
    // the facet row carrying the page's whole `shape`, because the facet is computed before the filter — and
    // the strip must come out the SAME every time. A strip built from `answer.entries` reproduces the table
    // above; one built from the shape cannot, whatever the chip.
    const shaped = (entries: typeof corpusAtPageOne.entries) => ({ ...corpusAtPageOne, entries });
    const captures = corpusAtPageOne.entries.filter((entry) => entry.kind === 'CAPTURE');
    const diffs = corpusAtPageOne.entries.filter((entry) => entry.kind === 'DIFF');
    const strip = (container: HTMLElement) => ({
      dots: [...container.querySelectorAll('[data-strip-dot]')].map((dot) => [dot.getAttribute('data-strip-count'), dot.getAttribute('data-strip-ringed')]),
      bars: [...container.querySelectorAll('[data-strip-bar]')].map((bar) => [bar.getAttribute('data-strip-count'), bar.getAttribute('data-strip-dim')]),
      // THE LINE AND THE STRIP ARE READ TOGETHER, because the defect was never "the strip is wrong" — it was
      // the two disagreeing. A case reading only the marks would pass a page that drew the right strip under
      // a count taken from somewhere else.
      records: container.querySelector('[data-page-card] span')?.textContent?.includes('10 רשומות'),
    });

    const whole = strip(await renderStream({ page: 'page-one' }, corpusAtPageOne));
    const capturesOnly = strip(await renderStream({ page: 'page-one', kind: 'CAPTURE' }, shaped(captures)));
    const diffsOnly = strip(await renderStream({ page: 'page-one', kind: 'DIFF' }, shaped(diffs)));
    const nothing = strip(await renderStream({ page: 'page-one', kind: 'DIFF', cited: '1' }, shaped([])));

    // THE PAGE'S OWN MARKS, from `PAGE_ONE_SHAPE`: four capture bins holding 2 + 1 + 1 + 1 and four diff bins
    // holding 1 + 1 + 1 + 2, the second capture bin cited and the last two diff bins below the gate. The
    // counts are written as the DOM carries them — a count of one is not drawn at all (e).
    const PAGE = {
      dots: [['2', null], [null, 'true'], [null, null], [null, null]],
      bars: [[null, null], [null, null], [null, 'true'], ['2', 'true']],
      records: true,
    };
    expect({ whole, capturesOnly, diffsOnly, nothing }).toEqual({ whole: PAGE, capturesOnly: PAGE, diffsOnly: PAGE, nothing: PAGE });

    // AND THE WINDOWS REALLY DID DIFFER, so the equality above is an assertion and not four readings of one
    // body. Without this arm a page that ignored its own filters would satisfy every line of it.
    expect({
      wholeWindow: corpusAtPageOne.entries.length,
      capturesWindow: captures.length,
      diffsWindow: diffs.length,
      emptyWindow: 0,
      // TWO-SIDED ON THE MARKS THEMSELVES: the strip is neither all-dim nor all-full, neither all-ringed nor
      // all-plain, so „the same strip four times" is not the same BLANK strip four times.
      someDim: PAGE.bars.some(([, dim]) => dim === 'true'),
      someFull: PAGE.bars.some(([, dim]) => dim === null),
      someRinged: PAGE.dots.some(([, ringed]) => ringed === 'true'),
      somePlain: PAGE.dots.some(([, ringed]) => ringed === null),
    }).toEqual({ wholeWindow: 6, capturesWindow: 2, diffsWindow: 4, emptyWindow: 0, someDim: true, someFull: true, someRinged: true, somePlain: true });
  });

  it('THE CARD OF A PAGE WITH NO CAPTURES DRAWS NO INTERVAL AND NO STRIP — and its `shape` is NOT null', async () => {
    // THE TRAP, AND IT IS WHY THIS IS A SEPARATE CASE FROM THE ONE BELOW. `corpusReads.ts` :1312 gives the
    // page a read NAMES a shape WHATEVER it holds — `shape: page.id === named ? shapeOf(…) : null` — so a
    // surveyed page with nothing acquired arrives as `{ captures: [], diffs: [] }` and NOT as `null`. A card
    // that guarded its strip on the shape alone would therefore have drawn a bare axis between two dates that
    // do not exist, which is the "silent half" region 3's own rule refuses. THE INTERVAL IS THE GUARD.
    const empty = {
      ...corpusAtPageOne,
      entries: [],
      pages: [{ trackedUrlId: 'page-one', url: 'https://example.gov/one/', public: true, first: null, last: null, entries: 0, shape: { captures: [], diffs: [] } }],
    };
    const container = await renderStream({ page: 'page-one' }, empty);
    const card = container.querySelector('[data-page-card]');
    if (card === null) throw new Error('the card is drawn from the facet row, and the row is present');
    expect({
      // THE CARD IS STILL DRAWN — the page is named, so the view still says what it is about.
      url: card.querySelector('[data-page-url]')?.textContent,
      // AND IT SAYS ONLY WHAT IT KNOWS: the count, and no interval.
      said: textNodes(card).map((node) => node.data.trim()).filter((text) => text !== ''),
      // NO STRIP, AND THE SHAPE IS NOT WHAT DECIDED IT — stated here so the case cannot be satisfied by a
      // body whose `shape` was null after all, which is the reading this case exists to refuse.
      strips: container.querySelectorAll('[data-time-strip]').length,
      shapeIsNull: empty.pages.at(0)?.shape === null,
    }).toEqual({
      url: 'example.gov/one/',
      said: ['example.gov/one/', '0 רשומות', 'הטענות בדף הזה'],
      strips: 0,
      shapeIsNull: false,
    });
  });

  it('A FACET ROW WITH NO `shape` DRAWS NO STRIP — a loud absence, never a half-drawn one', async () => {
    // §28: `shape` is null on every row of a read that names no page, because region 0 draws no strip. The
    // card itself is ruled by (a) — `page` set — so the two conditions are different questions and this holds
    // the second: given a card, a row with nothing to draw draws NOTHING, rather than an empty axis with its
    // month labels, which would read as "this page never changed" — a claim about the corpus.
    const shapeless = { ...corpusAtPageOne, pages: corpusAtPageOne.pages.map((row) => ({ ...row, shape: null })) };
    const container = await renderStream({ page: 'page-one' }, shapeless);
    expect({
      card: container.querySelectorAll('[data-page-card]').length,
      strip: container.querySelectorAll('[data-time-strip]').length,
      months: container.querySelectorAll('[data-month-tick]').length,
      marks: container.querySelectorAll('[data-strip-dot], [data-strip-bar]').length,
      // THE CONTROL: the very same staging WITH a shape draws all four, so the zeroes above are the rule and
      // not a page that failed to render.
      withShape: (await renderStream({ page: 'page-one' }, corpusAtPageOne)).querySelectorAll('[data-time-strip]').length,
    }).toEqual({ card: 1, strip: 0, months: 0, marks: 0, withShape: 1 });
  });

  it('A CITED CAPTURE ROW DRAWS THE CITED MARK — by the capture`s OWN `evidence`, which is what region 3 rings', async () => {
    // §24 names the CITED mark among a row's marks, and the capture row did not draw it. The 2026-09-19 ruling
    // on region 3 is what made the omission matter rather than merely incomplete: the strip rings a capture dot
    // by the capture's own `evidence`, so without this the strip would ring three dots whose rows say nothing.
    // Held by VALUE — WHICH rows are marked — and not by counting a selector, because a mark drawn on every row
    // would satisfy a count and destroy the meaning.
    const container = await renderStream({ kind: 'CAPTURE' });
    const rows = requireSubjects('capture rows', [...container.querySelectorAll('[data-capture-row]')]);
    expect({
      rows: rows.length,
      // TWO-SIDED: the marked set is neither empty nor everything, so a mark on all and a mark on none both fail.
      marked: rows.map((row) => row.querySelector('[data-cited-mark]') !== null),
      // The fixture's own ground, asserted so the case cannot silently become vacuous if the fixture changes.
      fixtureHasBoth: [
        corpusStream.entries.filter((one) => one.kind === 'CAPTURE' && one.evidence !== null).length,
        corpusStream.entries.filter((one) => one.kind === 'CAPTURE' && one.evidence === null).length,
      ],
    }).toEqual({ rows: 2, marked: [false, true], fixtureHasBoth: [1, 1] });
  });

  it('NO ID IS RENDERED AS TEXT ANYWHERE IN THE STREAM — it carries `trackedUrlId`, `fileHash` and two timestamps per diff', async () => {
    const container = await renderStream({ kind: 'DIFF' });
    const shown = requireSubjects('text nodes of the stream', textNodes(container))
      .map((node) => node.data)
      .join(' ');
    expect({
      idShapes: ID_SHAPES.filter(({ pattern }) => pattern.test(shown)).map(({ name }) => name),
      // The control: the same reader DOES match when a value is present, so an empty stream is not a blind one.
      shapesWork: ID_SHAPES.filter(({ pattern }) => pattern.test(`${corpusStream.entries[0]?.fileHash ?? ''} 20211223211940`)).map(({ name }) => name),
    }).toEqual({ idShapes: [], shapesWork: ['64-hex', '14-digit timestamp'] });
  });

  it('AN EMPTY FILTERED STREAM IS A SENTENCE, NOT AN ERROR — region 5, on a body that came back with no rows', async () => {
    // RE-POINTED. This title used to end "— which is also the 400 state", which it never asserted: the case
    // stages a 200 with no entries and says nothing about a refusal. A title that claims more than its
    // assertion is the defect R60 found and this round has now paid for a third time, so the claim moved to
    // the case below, which stages the refusal itself.
    const container = await renderStream({ kind: 'CAPTURE' }, { entries: [], pages: [], nextCursor: null });
    expect({
      empty: container.querySelectorAll('[data-stream-empty]').length,
      rows: container.querySelectorAll('[data-entry]').length,
      hasWords: (container.querySelector('[data-stream-empty]')?.textContent ?? '').trim().length > 0,
    }).toEqual({ empty: 1, rows: 0, hasWords: true });
  });

  it('A REFUSED FILTER IS A STATE AND NOT A STACK TRACE — A2\'s 400 renders region 5 with the chips still there for removal', async () => {
    // The state A2's table gives the public door, and the one the page could not reach until `readPublic`
    // carried a 400: every non-200 that was not the one 404 became a throw, so the route's refusal of a
    // malformed parameter reached the reader as a 500. Measured on the running backend, four spellings earn
    // one — `kind=BOGUS`, `since=garbage`, `limit=abc` and an unknown key — and `cited=1` earned it until the
    // wire spelling was corrected.
    // RE-POINTED. This case first asserted `[data-chip].length > 0`, which is satisfied by a page with NO
    // filter active at all: KIND and CITED are drawn unconditionally, so the count is never zero and the
    // assertion could not fail. Proved by differencing — a decoy that removed EVERY chip's active state left
    // this case GREEN and reddened a different one — and on the real body, where `?page=…&since=garbage`
    // drew 3 chips with `data-chip-active` = 0 and every href carrying `since=garbage` forward.
    // What A2 requires is not "some chips"; it is the filters IN FORCE, each removable.
    // THE DATE IS NOW A VALID ONE, and that is a consequence of this round rather than a weakening. Until
    // `readCorpusFilters` validated the day, `since=garbage` was how a reader reached a 400 at all; it is now
    // DROPPED before the wire (§24 region 0), so this case stages the refusal directly and asserts the state
    // the page renders when the route refuses filters it did send. The 400 is defensive now, not reachable —
    // said plainly, because a case whose provocation no longer exists should say so rather than look the same.
    const container = await renderRefused({ page: 'page-one', since: '2022-01-01' });
    const chips = [...container.querySelectorAll('[data-chip]')];
    const active = chips.filter((chip) => chip.getAttribute('data-chip-active') === 'true');
    const hrefOf = (chip: Element): string => chip.getAttribute('href') ?? '';
    expect({
      empty: container.querySelectorAll('[data-stream-empty]').length,
      rows: container.querySelectorAll('[data-entry]').length,
      // BOTH filters that were SENT are marked, and only those two — a two-sided floor, so a page marking
      // everything active passes no more than one marking nothing.
      // Since board ט·ב the PAGE is not a chip, so only the FILTER that was sent is marked — and the page's
      // own removal is the link, asserted below.
      activeCount: active.length,
      allPages: container.querySelector('[data-all-pages]')?.getAttribute('href'),
      // Each one's link REMOVES its own parameter, which is what "for removal" means. The `since` chip's
      // href must not carry `since`, or pressing it re-sends the value that earned the 400.
      sinceChipDropsSince: active.some((chip) => !hrefOf(chip).includes('since=')),
      // The `since` that IS sent survives the round trip, so the chip above is removing a real filter.
      sinceReachedTheWire: apiCallsMade().at(0)?.path.includes('since=2022-01-01') === true,
      pageIsNotAChip: chips.every((chip) => !(chip.textContent ?? '').includes('דף')),
      // NO ID AS TEXT: the page the facet could not return is labelled by the catalogue, never by its id.
      noIdInChips: chips.every((chip) => !(chip.textContent ?? '').includes('page-one')),
      hasWords: (container.querySelector('[data-stream-empty]')?.textContent ?? '').trim().length > 0,
    }).toEqual({
      empty: 1,
      rows: 0,
      activeCount: 1,
      allPages: '/he/corpus',
      sinceChipDropsSince: true,
      sinceReachedTheWire: true,
      pageIsNotAChip: true,
      noIdInChips: true,
      hasWords: true,
    });
  });
});

describe('opinion-labelled-on-corpus · the corpus-wide arm', () => {
  it('EVERY RENDERED OPINION FIELD DESCENDS FROM THE CONTAINER, and no OTHER model field is on the page', async () => {
    // THE ARM CHUNK 4 COULD NOT WRITE, because it had no page that renders an opinion. It does now, so the
    // subject set is taken AS A VALUE and the case fails on an empty one: a scan that examined nothing is the
    // vacuity this repository names as its own dominant defect.
    const container = await renderStream({ kind: 'DIFF' });
    const boxes = [...container.querySelectorAll('[data-labelled-opinion]')];
    const opinions = requireSubjects(
      'diffs carrying an opinion',
      corpusStream.entries.filter((entry) => entry.kind === 'DIFF' && entry.opinion !== null),
    );
    // Every word the model wrote, from the fixture — its significance, and the version that names what judged it.
    const modelWords = opinions.flatMap((entry) =>
      entry.kind === 'DIFF' && entry.opinion !== null ? [entry.opinion.significance, entry.opinion.classifierVersion] : [],
    );
    const escaped = textNodes(container)
      .filter((node) => modelWords.some((word) => node.data.includes(word)))
      .filter((node) => !boxes.some((box) => box.contains(node)))
      .map((node) => node.data.slice(0, 48));
    // AND NO OTHER MODEL FIELD IS RENDERED AT ALL: `editorial` and `draws` are the classifier's too, and §24
    // :690 allows exactly the labelled significance on a public page — "nothing else".
    // `editorial` and `draws` are the classifier's too — a BOOLEAN and a NUMBER (corrected 2026-09-19 from
    // the live body). §24 :690 allows exactly the labelled significance on a public page and "nothing else",
    // so what this asserts is that NO element carries either as its own text.
    const otherModelFields = ['data-editorial', 'data-draws'];
    expect({
      escaped,
      otherFieldsRendered: otherModelFields.filter((marker) => container.querySelectorAll(`[${marker}]`).length > 0),
      // THE FLOOR, two-sided: the page really did draw opinions, so "nothing escaped" is a fact about
      // placement and not about a render that produced nothing.
      containersDrawn: boxes.length,
      opinionsExamined: opinions.length,
    }).toEqual({ escaped: [], otherFieldsRendered: [], containersDrawn: 2, opinionsExamined: 4 });
  });
});
