jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { apiCallsMade, renderPage, setAuthState, setPathname, setPublicBodies, type Locale } from './render';
import { requireSubjects } from './scan';
import { readCorpusFilters, toReadParameters, writeCorpusQuery, writeReadQuery } from '../src/lib/corpusQuery';
import { corpusStream } from './fixtures/corpus/stream';
import { captureRead } from './fixtures/corpus/capture';
import { diffInput } from './fixtures/corpus/diffInput';
import { resolvedCaptureRecord } from './fixtures/corpus/record';

// ---------------------------------------------------------------------------
// filter-is-a-query — docs/gf-ui-flows.md §31's named instrument, and §8 (a filter is a parameter of the ONE
// read, never a second read); §24 regions 1, 2 and 4; A2's 400 state.
//
// THE URL'S SPELLING AND THE WIRE'S SPELLING ARE DIFFERENT, AND BOTH ARE PINNED HERE. The URL carries text, so
// the CITED lens is `?cited=1`; the read takes values, so the wire carries `cited=true`. `lib/corpusQuery.ts`
// says this in `toReadParameters`' own note — "`cited` changes spelling here and only here" — and the page then
// re-spelled it back, which is the defect this file exists for.
//
// MEASURED AGAINST THE RUNNING BACKEND, 2026-09-19, and written here as VALUES because a case that held the
// property name would pass over every one of them:
//
//     GET /api/corpus?cited=1      -> 400  cited: Invalid input: expected boolean, received string
//     GET /api/corpus?cited=TRUE   -> 400  (the coercion is case-SENSITIVE)
//     GET /api/corpus?cited=True   -> 400
//     GET /api/corpus?cited=true   -> 200
//     GET /api/corpus?cited=false  -> 200
//     GET /api/corpus?kind=DIFF    -> 200
//     GET /api/corpus?scope=public -> 400  Unrecognized key: "scope"
//
// `booleanParam` in the backend's `toolRoute` preprocesses the two words and passes anything else through for
// the tool's own shape to refuse. A reader pressing „רשומות מצוטטות" therefore got a 500, because `readPublic`
// turns a non-200 that is not the one 404 into a throw.
//
// THE PATHS BELOW ARE HAND-WRITTEN FROM THAT MEASUREMENT AND ARE NEVER COMPOSED FROM THE PAGE'S OWN SERIALISER.
// That is the whole method of this file. `corpusStream`'s harness staged the body at the path built from the
// CASE's url, so the double answered whatever the page asked for and 273 green cases said nothing about a page
// that 500s on the real backend — the shape `corpus/page.tsx` already records happening once on `?scope=`.
// A fixture keyed by the page's own wrong path cannot witness a wrong path.
// ---------------------------------------------------------------------------

const LOCALE: Locale = 'he';
const corpusPage = () => import('../src/app/[locale]/corpus/page');

/** What the BACKEND accepts, by measurement. Not derived from anything under `src/`. */
const WIRE = {
  cited: '/api/corpus?cited=true',
  pageAndCited: '/api/corpus?page=page-one&cited=true',
  kind: '/api/corpus?kind=DIFF',
} as const;

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/corpus');
});
afterEach(() => {
  setPublicBodies(undefined);
  setAuthState(undefined);
  setPathname(undefined);
});

/**
 * Render at a URL, staging ONLY the wire paths the case names.
 *
 * The render is allowed to fail: the api double refuses a path no case staged, and before the wire spelling was
 * corrected that refusal WAS the defect. The assertion is taken from `apiCallsMade`, which records the call
 * before the double answers it — so the case reads the path the page actually built either way, and a red says
 * which path it built rather than only that something threw.
 */
async function pathBuiltFor(searchParams: Record<string, string>, staged: Record<string, unknown>): Promise<string | undefined> {
  setPublicBodies(Object.fromEntries(Object.entries(staged).map(([path, body]) => [path, { status: 200 as const, body }])));
  try {
    await renderPage((await corpusPage()).default, { locale: LOCALE }, { locale: LOCALE, searchParams });
  } catch {
    // Swallowed on purpose: the recorded call is the subject, not the render's outcome.
  }
  return requireSubjects('reads made by the page', apiCallsMade()).at(0)?.path;
}

describe('filter-is-a-query · the wire', () => {
  it('THE CITED LENS SENDS `cited=true` ON THE WIRE — the value the backend accepts, not the `1` the URL carries', async () => {
    expect(await pathBuiltFor({ cited: '1' }, { [WIRE.cited]: corpusStream })).toEqual(WIRE.cited);
  });

  it('A LENS BESIDE A FILTER SENDS BOTH IN THE READ`S OWN ORDER — pressing CITED while a PAGE is set keeps the page', async () => {
    expect(await pathBuiltFor({ page: 'page-one', cited: '1' }, { [WIRE.pageAndCited]: corpusStream })).toEqual(WIRE.pageAndCited);
  });

  it('A FILTER THAT IS ALREADY TEXT IS SENT UNCHANGED — `kind` is a word on both sides and must not gain a spelling', async () => {
    expect(await pathBuiltFor({ kind: 'DIFF' }, { [WIRE.kind]: corpusStream })).toEqual(WIRE.kind);
  });

  it('THE URL KEEPS `cited=1` — the wire changed and the link did not, so every chip a reader shares still reads', () => {
    const filters = { page: 'page-one', cited: true } as const;
    const url = writeCorpusQuery(filters);
    expect({
      url: url.toString(),
      roundTrip: readCorpusFilters(url),
      wire: writeReadQuery(toReadParameters(filters, 'public')).toString(),
    }).toEqual({
      url: 'page=page-one&cited=1',
      roundTrip: { page: 'page-one', cited: true },
      wire: 'page=page-one&cited=true',
    });
  });

  it('THE SCOPE IS THE ROUTE AND NEVER REACHES THE WIRE — the backend answers 400 to the key, measured', () => {
    const wire = writeReadQuery(toReadParameters({ cited: true }, 'public'));
    expect({ scope: wire.get('scope'), keys: [...wire.keys()] }).toEqual({ scope: null, keys: ['cited'] });
  });

  it('EVERY VALUE THE SERIALISER EMITS IS ONE THE BACKEND ACCEPTS — booleans as the two words, numbers as digits', () => {
    const wire = writeReadQuery({ scope: 'public', page: 'p', since: '2022-01-01', until: '2022-12-31', kind: 'DIFF', cited: true, cursor: 'c', limit: 50 });
    // A two-sided floor: the set is stated in full, so a parameter silently dropped fails here as loudly as one
    // spelled wrong. `scope` is absent by the rule above and is the one key that must NOT appear.
    expect(Object.fromEntries(wire)).toEqual({
      page: 'p',
      since: '2022-01-01',
      until: '2022-12-31',
      kind: 'DIFF',
      cited: 'true',
      cursor: 'c',
      limit: '50',
    });
  });
});

// ---------------------------------------------------------------------------
// THE RECORD PAGES' ARM (UI-7 chunk (c)) — §8 :344: "a filter is a query on one read, never a second read."
//
// A RECORD PAGE HAS NO FILTERS AT ALL, which makes the property sharper here than on `/corpus`: the page must
// make its ONE read and no other. The reads it must not make are named as VALUES and not as a pattern —
// `/api/pages/:id/findings` is the page's whole timeline, which the capture page used to be pointed at before
// the 2026-09-19 re-point, and `/api/research/pages` is the gated twin a public page may never touch.
// ---------------------------------------------------------------------------

const TRACKED = 'page-one';
const CAPTURE = '20211223211940';
const CAPTURE_PATH = `/api/pages/${TRACKED}/captures/${CAPTURE}`;

/** Reads a record page may NEVER make — spelled out, because a regex over `/findings` would miss the twin. */
const FORBIDDEN = ['/api/pages/page-one/findings', '/api/research/pages', '/api/corpus', '/api/mcp'] as const;

describe('filter-is-a-query — the record pages', () => {
  it('THE CAPTURE PAGE MAKES ITS ONE READ AND NO SECOND ONE — not the page`s findings, not the research twin', async () => {
    setPublicBodies({ [CAPTURE_PATH]: { status: 200, body: captureRead } });
    const page = (await import('@/app/[locale]/pages/[trackedUrlId]/captures/[capture]/page')).default;
    const rendered = await renderPage(page, { locale: LOCALE, trackedUrlId: TRACKED, capture: CAPTURE }, { locale: LOCALE });
    expect(rendered.notFound).toBe(false);

    const reads = requireSubjects('reads the capture page made', apiCallsMade());
    // EXACTLY ONE, and it is the resource read — not a superset filtered in the page.
    expect(reads.map((call) => call.path)).toEqual([CAPTURE_PATH]);
    // AND IT WAS PARSED: a body read without a guard at its boundary has no witness at all.
    expect(reads.at(0)?.parsed).toBe(true);
    for (const forbidden of requireSubjects('the forbidden reads', FORBIDDEN)) {
      expect(reads.filter((call) => call.path.startsWith(forbidden))).toEqual([]);
    }
  });

  it('THE DIFF PAGE MAKES ITS ONE READ TOO — and its 409 state makes no second read to find the links', async () => {
    const AFTER = '20220105090000';
    const PAIR = `/api/pages/${TRACKED}/diffs/${CAPTURE}/${AFTER}`;
    const page = (await import('@/app/[locale]/pages/[trackedUrlId]/diffs/[before]/[after]/page')).default;

    setPublicBodies({ [PAIR]: { status: 200, body: diffInput } });
    const shown = await renderPage(page, { locale: LOCALE, trackedUrlId: TRACKED, before: CAPTURE, after: AFTER }, { locale: LOCALE });
    expect(shown.notFound).toBe(false);
    expect(requireSubjects('reads the diff page made', apiCallsMade()).map((call) => call.path)).toEqual([PAIR]);

    // AND IN THE 409 STATE. The capture links are composed from the URL's own segments, so a page that went
    // looking for them would make a SECOND read precisely where the first one had nothing to give it — the
    // exact shape §8 :344 forbids, and the one a reader would never notice.
    setPublicBodies({ [PAIR]: { status: 409 } });
    const awaiting = await renderPage(page, { locale: LOCALE, trackedUrlId: TRACKED, before: CAPTURE, after: AFTER }, { locale: LOCALE });
    expect(awaiting.notFound).toBe(false);
    expect(requireSubjects('reads the awaiting diff page made', apiCallsMade()).map((call) => call.path)).toEqual([PAIR]);
  });

  it('THE RECORDS PAGE MAKES ITS ONE READ — it resolves a NAME and never browses the page it belongs to', async () => {
    const RECORD = `/api/records/${resolvedCaptureRecord.fileHash}`;
    setPublicBodies({ [RECORD]: { status: 200, body: resolvedCaptureRecord } });
    const page = (await import('@/app/[locale]/records/[fileHash]/page')).default;
    const rendered = await renderPage(page, { locale: LOCALE, fileHash: resolvedCaptureRecord.fileHash }, { locale: LOCALE });
    expect(rendered.notFound).toBe(false);

    const reads = requireSubjects('reads the records page made', apiCallsMade());
    expect(reads.map((call) => call.path)).toEqual([RECORD]);
    expect(reads.at(0)?.parsed).toBe(true);
    // IT HOLDS `page.trackedUrlId` FROM THIS READ, which is the whole reason the id was ruled onto the
    // envelope — a page that fetched the timeline to find it would be the second read §8 :344 forbids.
    for (const forbidden of requireSubjects('the forbidden reads', FORBIDDEN)) {
      expect(reads.filter((call) => call.path.startsWith(forbidden))).toEqual([]);
    }
  });
});
