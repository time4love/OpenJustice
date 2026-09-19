jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { apiCallsMade, renderPage, setAuthState, setPathname, setPublicBodies, textNodes, type Locale, type PageRender } from './render';
import { ID_SHAPES, requireSubjects } from './scan';
import { readCorpusFilters, writeCorpusQuery } from '../src/lib/corpusQuery';
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

/** The page rendered AS A STREAM — which means with a query, because a bare `/corpus` is the pages list. */
async function renderStream(searchParams: Record<string, string>, body: unknown = corpusStream): Promise<HTMLElement> {
  const path = `/api/corpus${new URLSearchParams(searchParams).toString() === '' ? '' : `?${new URLSearchParams(searchParams).toString()}`}`;
  setPublicBodies({ [path]: { status: 200, body } });
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
      copies: container.querySelectorAll('[data-capture-row] button').length,
      intervals: container.querySelectorAll('[data-interval]').length,
      // AWAITING DERIVATION IS A STATE, NOT AN ERROR (§24 region 4): the card says so where `current` is null.
      awaiting: container.querySelectorAll('[data-awaiting]').length,
      // The dates are FORMATTED — the 14-digit timestamp that names a capture is never read aloud (§4 :168).
      rawTimestamp: shown.includes('20211223211940'),
      formatted: shown.includes('23.12.2021'),
    }).toEqual({ captures: 2, diffs: 3, anchorMarks: 2, copies: 2, intervals: 3, awaiting: 1, rawTimestamp: false, formatted: true });
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

  it('AN EMPTY FILTERED STREAM IS A SENTENCE, NOT AN ERROR — which is also the 400 state (§24 region 5)', async () => {
    const container = await renderStream({ kind: 'CAPTURE' }, { entries: [], pages: [], nextCursor: null });
    expect({
      empty: container.querySelectorAll('[data-stream-empty]').length,
      rows: container.querySelectorAll('[data-entry]').length,
      hasWords: (container.querySelector('[data-stream-empty]')?.textContent ?? '').trim().length > 0,
    }).toEqual({ empty: 1, rows: 0, hasWords: true });
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
