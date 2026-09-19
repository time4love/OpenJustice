jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { apiCallsMade, renderPage, setAuthState, setPathname, setPublicBodies, textNodes, type Locale, type PageRender } from './render';
import { ID_SHAPES, requireSubjects } from './scan';
import { readCorpusFilters, readCorpusQuery, toReadParameters, writeCorpusQuery, writeReadQuery } from '../src/lib/corpusQuery';
import { flaggedByClassifier, partitionBySignificance } from '../src/lib/corpusSignificance';
import { corpusStream } from './fixtures/corpus/stream';

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
      // chip must still carry `cited`; the two chips that DO own those parameters are the ones that remove them.
      return { raw, keepsKind: held.kind === 'DIFF', keepsCited: held.cited === true };
    });
    expect({
      chips: hrefs.length,
      // The PAGE chips own neither parameter, so they must keep both — that is the whole property.
      pageChipsKeepBoth: carried.slice(0, 2).every((one) => one.keepsKind && one.keepsCited),
      // And the owning chips still remove their own: the two operations are the same one, with the field dropped.
      someChipRemovesKind: carried.some((one) => !one.keepsKind),
      someChipRemovesCited: carried.some((one) => !one.keepsCited),
    }).toEqual({ chips: 5, pageChipsKeepBoth: true, someChipRemovesKind: true, someChipRemovesCited: true });
  });

  it('EVERY CHIP IS A QUERY PARAMETER, AND THE ROUND TRIP IS AN IDENTITY — `lib/corpusQuery.ts` is CALLED, never re-spelled', async () => {
    const container = await renderStream({ page: 'page-one' });
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
      removesOnSecondPress: hrefs.some((raw) => raw === '/he/corpus'),
    }).toEqual({ chips: true, everyChipIsAQuery: true, roundTripsAreIdentities: true, activeChips: 1, removesOnSecondPress: true });
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
    await renderStream({ page: 'page-one', kind: 'DIFF' });
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
    const container = await renderStream({ page: 'page-one' });
    const taps = requireSubjects('row taps', [...container.querySelectorAll('[data-open-record]')]);
    const ids = taps.map((tap) => tap.getAttribute('data-open-record') ?? '');
    expect({
      // Every row has exactly one, captures and diffs alike — both weights open a record.
      tapsPerRow: [container.querySelectorAll('[data-capture-row] [data-open-record]').length, container.querySelectorAll('[data-diff-card] [data-open-record]').length],
      // DISTINCT: five rows, five different records.
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
    }).toEqual({ tapsPerRow: [2, 3], distinct: true, allButtons: true, idNotShown: true, tapMatchesItsOwnRow: true, noControlInsideTap: true });
  });

  it('AN UNPARSEABLE DATE IS NOT A FILTER — it is DROPPED before the wire, as `kind=BOGUS` already was', async () => {
    // §24 region 0, ruled round 3: "neither is a value the page cannot parse". `kind` was read that way from
    // the start and the two dates were not, and that asymmetry was the ONLY way a reader could put a value on
    // the wire that the route refuses — measured, `?since=garbage` earned a 400 and the page rendered a 500
    // before `readPublic` carried the state. The shape is the backend's own `DAY`, copied with its source named.
    const container = await renderStream({ page: 'page-one', since: 'garbage' });
    expect({
      // The bad value never reaches the read; the good filter beside it still does.
      wire: apiCallsMade().at(0)?.path,
      // A DROPPED value is not a chip either, so nothing offers to remove a filter that is not in force.
      activeChips: [...container.querySelectorAll('[data-chip][data-chip-active="true"]')].length,
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
      activeChips: 1,
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
    const withPage = await renderStream({ page: 'page-one' });
    const withoutPage = await renderStream({ kind: 'DIFF' });
    const cited = await renderStream({ cited: '1' });
    expect({
      pageFilterDrawsIt: withPage.querySelectorAll('[data-page-card]').length,
      stripIsInIt: withPage.querySelectorAll('[data-time-strip]').length,
      kindFilterDoesNot: withoutPage.querySelectorAll('[data-page-card]').length,
      citedLensDoesNot: cited.querySelectorAll('[data-page-card]').length,
      // The card names the page the way §4 requires and never by its id.
      showsUrlNotId: (withPage.querySelector('[data-page-card-url]')?.textContent ?? '').includes('example.gov'),
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

  it('THE STRIP DRAWS EVERY DIFF THE PAGE HAS, THE GATED ONES DIMMED, AND RINGS THE CITED CAPTURE (c, e, g)', async () => {
    // The rendered half of what `time-strip` holds as arithmetic: that the marks reach the DOM at all, and
    // that the gate's hidden rows are DRAWN here while they are hidden below. `de-emphasise, never hide`.
    const container = await renderStream({ page: 'page-one' });
    const bars = [...container.querySelectorAll('[data-strip-bar]')];
    const dots = requireSubjects('strip dots', [...container.querySelectorAll('[data-strip-dot]')]);
    const hiddenBelow = container.querySelector('[data-hidden-count]') !== null;
    expect({
      // The fixture's five diffs all reach the strip; the stream below hides the ones the gate catches.
      barsDrawn: bars.length,
      dimBars: bars.filter((bar) => bar.getAttribute('data-strip-dim') === 'true').length,
      fullBars: bars.filter((bar) => bar.getAttribute('data-strip-dim') === null).length,
      // The gate is still doing its job below, which is what makes "drawn above, hidden below" the assertion.
      gateStillHidesBelow: hiddenBelow,
      ringedDots: dots.filter((dot) => dot.getAttribute('data-strip-ringed') === 'true').length,
      // TWO-SIDED on the ring: the fixture has one cited capture and one uncited.
      unringedDots: dots.filter((dot) => dot.getAttribute('data-strip-ringed') === null).length,
    }).toEqual({ barsDrawn: 5, dimBars: 2, fullBars: 3, gateStillHidesBelow: true, ringedDots: 1, unringedDots: 1 });
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
      activeCount: active.length,
      // Each one's link REMOVES its own parameter, which is what "for removal" means. The `since` chip's
      // href must not carry `since`, or pressing it re-sends the value that earned the 400.
      sinceChipDropsSince: active.some((chip) => !hrefOf(chip).includes('since=')),
      // The `since` that IS sent survives the round trip, so the chip above is removing a real filter.
      sinceReachedTheWire: apiCallsMade().at(0)?.path.includes('since=2022-01-01') === true,
      pageChipDropsPage: active.some((chip) => !hrefOf(chip).includes('page=')),
      // NO ID AS TEXT: the page the facet could not return is labelled by the catalogue, never by its id.
      noIdInChips: chips.every((chip) => !(chip.textContent ?? '').includes('page-one')),
      hasWords: (container.querySelector('[data-stream-empty]')?.textContent ?? '').trim().length > 0,
    }).toEqual({
      empty: 1,
      rows: 0,
      activeCount: 2,
      sinceChipDropsSince: true,
      sinceReachedTheWire: true,
      pageChipDropsPage: true,
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
