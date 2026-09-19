import { STREAM_PARAMETERS, readCorpusFilters, readCorpusQuery, toReadParameters, writeCorpusQuery, type CorpusFilters } from '@/lib/corpusQuery';
import { requireSubjects } from './scan';

// ---------------------------------------------------------------------------
// corpus-query — docs/gf-ui-flows.md §24 :674–:690 (region 0's rule and region 2's chips), §8 (a filter is a
// parameter of the ONE read), §6.1 :237 (`list_corpus`' parameters), A1 :1004–:1005.
//
// THE RULE THIS HOLDS IS FORCED, NOT CHOSEN. `/corpus` bare is the PAGES LIST; any of the five known
// parameters is the STREAM. The thesis page's `/corpus?page=<trackedUrlId>` is specified in four places and
// must land on the stream filtered to that page — so the rule is what lets the bare URL become the list
// WITHOUT one existing link changing meaning. A case that only checked "bare is the list" would be green on
// an implementation that made everything the list.
//
// SO EVERY CASE HERE IS TWO-SIDED. Each parameter is asserted to switch the view ALONE — not as a group,
// because a group is satisfied by an implementation that only reads the first of them.
// ---------------------------------------------------------------------------

const at = (query: string): URLSearchParams => new URLSearchParams(query);

/** The five, through the vacuity guard: a loop over an empty list asserts nothing and would pass. */
const streamParameters = (): readonly string[] => requireSubjects('the stream parameters', STREAM_PARAMETERS);

/** One legal value per parameter, so each can be tried ALONE. */
const SOLE_VALUE: Readonly<Record<string, string>> = {
  page: 'page-one',
  since: '2021-12-23',
  until: '2022-11-29',
  kind: 'DIFF',
  cited: '1',
};

describe('corpus-query · the list-or-stream rule', () => {
  it('THE BARE URL IS THE PAGES LIST — and it stays the list when something appends a parameter nobody filters on', () => {
    // The second half is the narrowing this module makes against §24's literal "ANY QUERY PARAMETER": a
    // tracking parameter must not turn the list into an empty stream. Both halves in one `expect`, because
    // "bare is the list" alone is satisfied by an implementation that never returns a stream at all.
    expect({
      bare: readCorpusQuery(at('')),
      unknownOnly: readCorpusQuery(at('utm_source=newsletter&ref=x')),
      emptyValue: readCorpusQuery(at('page=')),
      whitespaceValue: readCorpusQuery(at('page=%20%20')),
    }).toEqual({
      bare: { view: 'list' },
      unknownOnly: { view: 'list' },
      emptyValue: { view: 'list' },
      whitespaceValue: { view: 'list' },
    });
  });

  it('EACH OF THE FIVE PARAMETERS MAKES IT THE STREAM ON ITS OWN — asserted one at a time, never as a group', () => {
    // A group (`?page=x&since=y&kind=DIFF`) is satisfied by an implementation that reads only `page`. The
    // subject set is the module's own exported list, so a parameter added there without a case here fails.
    const alone = Object.fromEntries(
      streamParameters().map((name) => [name, readCorpusQuery(at(`${name}=${SOLE_VALUE[name] ?? ''}`)).view]),
    );
    expect({ count: streamParameters().length, alone }).toEqual({
      count: 5,
      alone: { page: 'stream', since: 'stream', until: 'stream', kind: 'stream', cited: 'stream' },
    });
  });

  it("THE THESIS PAGE'S LINK LANDS ON THE STREAM FILTERED TO THAT PAGE — the exact URL, by value", () => {
    // `/corpus?page=<trackedUrlId>` is specified in four places and is the reason the rule is forced. The
    // VALUE is held, not merely the view: a stream that dropped the filter would still read as a stream.
    expect(readCorpusQuery(at('page=c7039812-d3ed-4206-95ed-8205c3f2b63c'))).toEqual({
      view: 'stream',
      filters: { page: 'c7039812-d3ed-4206-95ed-8205c3f2b63c' },
    });
  });

  it('THE RECORDS LENS IS `?cited=1` AND NOTHING ELSE — `?cited=0` is the lens off, not a filter for uncited rows', () => {
    // §25 :699 defines the lens as "the stream filtered to `evidence ≠ null`" and names no complement, so
    // the absence of the chip is the only other state. An implementation reading `cited` as a boolean would
    // make `?cited=0` a stream of uncited rows, which the contract does not define.
    expect({
      on: readCorpusQuery(at('cited=1')),
      off: readCorpusQuery(at('cited=0')),
      nonsense: readCorpusQuery(at('cited=yes')),
    }).toEqual({ on: { view: 'stream', filters: { cited: true } }, off: { view: 'list' }, nonsense: { view: 'list' } });
  });

  it('AN UNREADABLE `kind` IS NO CHIP — and it does not leave the view a stream with nothing in it', () => {
    // The view and the filters are computed from ONE reading, so they cannot disagree. Were they computed
    // separately, `?kind=BANANA` would be a stream carrying no filter — a page in a state the contract has
    // no region for.
    expect({
      capture: readCorpusQuery(at('kind=CAPTURE')),
      diff: readCorpusQuery(at('kind=DIFF')),
      nonsense: readCorpusQuery(at('kind=BANANA')),
      lowercase: readCorpusQuery(at('kind=diff')),
    }).toEqual({
      capture: { view: 'stream', filters: { kind: 'CAPTURE' } },
      diff: { view: 'stream', filters: { kind: 'DIFF' } },
      nonsense: { view: 'list' },
      lowercase: { view: 'list' },
    });
  });
});

describe('corpus-query · the round trip and the read', () => {
  it('CHIPS → URL → CHIPS IS THE IDENTITY, over every filter at once and over each alone', () => {
    const whole: CorpusFilters = { page: 'page-one', since: '2021-12-23', until: '2022-11-29', kind: 'DIFF', cited: true };
    const singles: CorpusFilters[] = [{ page: 'page-one' }, { since: '2021-12-23' }, { until: '2022-11-29' }, { kind: 'CAPTURE' }, { cited: true }];
    const roundTrip = (filters: CorpusFilters): CorpusFilters => readCorpusFilters(writeCorpusQuery(filters));
    expect({
      whole: roundTrip(whole),
      singles: requireSubjects('the single-chip round trips', singles).map(roundTrip),
      // The empty set round-trips to the empty set, which is region 0 — the identity's own edge.
      none: roundTrip({}),
    }).toEqual({ whole, singles, none: {} });
  });

  it('THE URL IS WRITTEN IN ONE ORDER, so the same chips always make the same string', () => {
    // Not cosmetic: a link is compared by string in a browser's history and in a test. Two orderings of one
    // filter set are two URLs for one view.
    expect(writeCorpusQuery({ cited: true, kind: 'DIFF', until: '2022-11-29', since: '2021-12-23', page: 'page-one' }).toString()).toBe(
      'page=page-one&since=2021-12-23&until=2022-11-29&kind=DIFF&cited=1',
    );
  });

  it("THE READ'S PARAMETERS ARE THE CHIPS, with `cited` changing spelling exactly once — and cursor and limit are never chips", () => {
    // The URL carries `1` because a URL carries text; the read takes a boolean because a tool takes values.
    // `limit` "is an operational parameter, never a judgement" (§6.1 :241) and no chip in §24 names it.
    expect({
      full: toReadParameters({ page: 'page-one', since: '2021-12-23', until: '2022-11-29', kind: 'DIFF', cited: true }, 'public', 'cursor-2', 50),
      bare: toReadParameters({}, 'public'),
      gated: toReadParameters({ page: 'page-one' }, 'all'),
    }).toEqual({
      full: { scope: 'public', page: 'page-one', since: '2021-12-23', until: '2022-11-29', kind: 'DIFF', cited: true, cursor: 'cursor-2', limit: 50 },
      bare: { scope: 'public' },
      gated: { scope: 'all', page: 'page-one' },
    });
  });
});
