import type { CorpusScope, EntryKind } from '@/types/corpus';

// ---------------------------------------------------------------------------
// THE CORPUS QUERY — chips ↔ URL ↔ the one read's parameters.
//
// GROUND: docs/gf-ui-flows.md §24 :674–:686 (region 0's rule and region 2's chips), §8 (a filter is a
// parameter of the ONE read and never a second read), §6.1 :237 (`list_corpus`' parameters), A1 :1004–:1005
// (a filter is a query parameter and never a path segment).
//
// THE LIST-OR-STREAM RULE IS FORCED, NOT CHOSEN, and it is this module's reason to exist. `/corpus` with no
// query parameter is the PAGES LIST; `?page=` · `?since=` · `?until=` · `?kind=` · `?cited=1` are the
// STREAM. The thesis page's `/corpus?page=<trackedUrlId>` is specified in four places and must land on the
// stream filtered to that page — so the BARE url could be given to the list without one existing link
// changing meaning. Region 0 is the default state AND the fourth lens.
//
// AN UNKNOWN PARAMETER IS NOT A FILTER, and this is the one place the code is narrower than §24's prose.
// The block's sentence reads "ANY QUERY PARAMETER MEANS THE STREAM" and then enumerates exactly five. Taken
// literally, `?utm_source=x` or a locale-switcher's leftover would silently turn the list into an empty
// stream — a page changing identity because something appended a tracking parameter. Only the five KNOWN
// parameters switch the view; everything else is ignored and the view stays the list. This narrowing is
// REPORTED as a question, not settled here.
//
// THIS MODULE IS PURE (memory, `gf-step-18-rulings-2026-09-10.md`: a pure module never gains a dependency).
// It reads a `URLSearchParams` and nothing else: no fetch, no React, no `window`, no `next/navigation`. Its
// only import is a TYPE. That is what lets the whole rule be held without rendering anything.
// ---------------------------------------------------------------------------

/**
 * The five parameters that mean THE STREAM (§24 :682–:686), in the order the chips are drawn (§24 :688–:690).
 * A parameter not in this list does not change the view.
 */
export const STREAM_PARAMETERS = ['page', 'since', 'until', 'kind', 'cited'] as const;

export type StreamParameter = (typeof STREAM_PARAMETERS)[number];

/** The chips, as the URL carries them. Every field is optional; all absent is the LIST. */
export interface CorpusFilters {
  /** A `trackedUrlId`. The PAGE chip, and the thesis page's `/corpus?page=` link. */
  page?: string;
  since?: string;
  until?: string;
  kind?: EntryKind;
  /** The RECORDS lens (§25 :699). Present only as `true`: `?cited=1`. */
  cited?: true;
}

/** What `/corpus` is showing: region 0, or regions 1–5 with the filters that made it so. */
export type CorpusView = { view: 'list' } | { view: 'stream'; filters: CorpusFilters };

/**
 * THE TWO DOORS, AND THE ONLY PLACE EITHER BASE IS SPELLED — docs/gf-ui-flows.md §24 :657 ("`/corpus` and
 * `/research/corpus` are ONE page rendered from one read at two scopes") and §27; UI plan :750–:760.
 *
 * `one-stream-two-doors` says the two doors "render from one component and differ only by scope, the NOT
 * PUBLIC mark and the extraction sheet". Every href the corpus components mint — a page row, the page card's
 * claims entry, every filter chip, the lens control — is a path under one of these two bases, and the scope
 * is the ONLY thing that chooses between them. Written at each call site instead, the base would be a second
 * rule with six implementations, and the one spelled wrong would send a researcher out of the gated door.
 *
 * IT IS PURE AND IT IS A LOOKUP, not a concatenation at the call site: a caller cannot compose `/research` +
 * `/corpus` wrongly if it never composes at all.
 */
const DOORS: Record<CorpusScope, string> = { public: '/corpus', all: '/research/corpus' };

/** The stream/list door for a scope: `/corpus` at `public`, `/research/corpus` at `all`. */
export function corpusPath(scope: CorpusScope): string {
  return DOORS[scope];
}

/** The claims door for a scope — the same base with §25's one segment, never spelled twice. */
export function claimsPath(scope: CorpusScope): string {
  return `${DOORS[scope]}/claims`;
}

/** `list_corpus`' parameters (§6.1 :237) — the read's own spelling, which is not always the URL's. */
export interface CorpusReadParameters {
  scope: CorpusScope;
  page?: string;
  since?: string;
  until?: string;
  kind?: EntryKind;
  /** The read takes a BOOLEAN; the URL carries `1`. The two spellings meet here and nowhere else. */
  cited?: boolean;
  cursor?: string;
  limit?: number;
}

/** A value that is present, non-empty and not whitespace — `?page=` with no value is a chip REMOVED. */
function given(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * `?since=` and `?until=` are a DAY, and anything else is not a date — an unreadable chip is no chip.
 *
 * §24 region 0: a parameter the page cannot parse is not a filter, and neither is a value it cannot parse.
 * `kind` has always been read that way; these two were not, and the asymmetry was the only reason a reader
 * could put a value on the wire that the route refuses. Measured before the change: `?since=garbage` reached
 * `/api/corpus` and earned a 400.
 *
 * THE SHAPE IS THE BACKEND'S OWN, copied and not invented: `corpusReads.ts`' `DAY`, `/^\d{4}-\d{2}-\d{2}$/`,
 * whose refusal message is "a day, YYYY-MM-DD". Re-spelling a validator is the defect this repository names,
 * and the honest alternative — importing the backend's — is the cross-workspace coupling the researcher
 * refused on 2026-09-19. So it is copied WITH ITS SOURCE NAMED, and the report batches the shape for a ruling.
 *
 * IT VALIDATES THE SHAPE AND NEVER THE CALENDAR. `2022-13-45` passes here and the route refuses it, which is
 * correct: the page's job is to not send nonsense, not to become a second authority on what a day is.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function readDay(value: string | undefined): string | undefined {
  return value !== undefined && DAY.test(value) ? value : undefined;
}

/** `?kind=` is one of two words, and anything else is not a kind — an unreadable chip is no chip. */
function readKind(value: string | undefined): EntryKind | undefined {
  if (value === 'CAPTURE' || value === 'DIFF') return value;
  return undefined;
}

/**
 * The filters a URL carries, with unknown and unreadable parameters dropped.
 *
 * It is exported because the view and the read both need it and neither may re-spell it: a second reading of
 * `?cited=` is exactly the "one rule, two implementations" shape this repository names as its dominant defect.
 */
export function readCorpusFilters(params: URLSearchParams): CorpusFilters {
  const filters: CorpusFilters = {};
  const page = given(params.get('page'));
  if (page !== undefined) filters.page = page;
  const since = readDay(given(params.get('since')));
  if (since !== undefined) filters.since = since;
  const until = readDay(given(params.get('until')));
  if (until !== undefined) filters.until = until;
  const kind = readKind(given(params.get('kind')));
  if (kind !== undefined) filters.kind = kind;
  // `cited` is the RECORDS lens and has one legal value. `?cited=0` is the lens OFF, not a filter for
  // uncited rows — §25 :699 defines the lens as "the stream filtered to `evidence ≠ null`" and names no
  // complement, so the absence of the chip is the only other state there is.
  if (given(params.get('cited')) === '1') filters.cited = true;
  return filters;
}

/**
 * THE CURSOR THE URL CARRIES, AND IT IS NOT A FILTER.
 *
 * `toReadParameters`' own note already says it: `cursor` and `limit` are the read's OPERATIONAL parameters
 * and never chips, because no filter in §24 names them. So this is read SEPARATELY from `readCorpusFilters`
 * and deliberately does NOT join the five that mean the stream — a bare `?cursor=` is ignored exactly as
 * `?utm_source=` is, and region 0's rule is untouched. A cursor with no filter has nothing to page through.
 *
 * ITS SHAPE IS NOT VALIDATED HERE. The read issues it (`encodeCursor`, base64url of the last entry's key) and
 * the route refuses anything it did not issue, by a `refine` that decodes it. A second decoder here would be
 * a second authority on a value this page only ever echoes back — the same reasoning that keeps the day's
 * validation to a SHAPE. What this does check is that it is present and non-empty.
 */
export function readCursor(params: URLSearchParams): string | undefined {
  return given(params.get('cursor'));
}

/**
 * THE RULE: no known parameter is the LIST; any one of the five is the STREAM.
 *
 * Both halves are derived from ONE reading of the URL, so "which view" and "which filters" can never
 * disagree — a view computed from the raw parameters and filters computed from the cleaned ones would drift
 * the moment an unreadable value appeared (`?kind=BANANA` would be a stream with no kind).
 */
export function readCorpusQuery(params: URLSearchParams): CorpusView {
  const filters = readCorpusFilters(params);
  return Object.keys(filters).length === 0 ? { view: 'list' } : { view: 'stream', filters };
}

/**
 * The URL a set of chips makes — the inverse of `readCorpusFilters`, and the link a chip press produces.
 * Written in `STREAM_PARAMETERS`' order so the same chips always make the same string, which is what lets a
 * round trip be asserted as an identity rather than as a set comparison.
 */
export function writeCorpusQuery(filters: CorpusFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set('page', filters.page);
  if (filters.since !== undefined) params.set('since', filters.since);
  if (filters.until !== undefined) params.set('until', filters.until);
  if (filters.kind !== undefined) params.set('kind', filters.kind);
  if (filters.cited === true) params.set('cited', '1');
  return params;
}

/**
 * The chips as `list_corpus`' parameters (§6.1 :237) — the ONE read, never a second (§8).
 *
 * `cited` changes spelling here and only here: the URL carries `1` because a URL carries text, the read takes
 * a boolean because a tool takes values. `cursor` and `limit` are the read's operational parameters (A8) and
 * are never chips: no filter in §24 :688–:690 names them, and `limit` "is an operational parameter, never a
 * judgement" (§6.1 :241).
 */
/**
 * THE READ'S PARAMETERS AS THE WIRE CARRIES THEM — the one place a value becomes text on its way to the route.
 *
 * It exists because the page hand-rolled this and got it wrong. `toReadParameters` turns the URL's `1`
 * into a BOOLEAN, exactly as its own note says; the page then serialised that boolean back to `1`, and the route's
 * `booleanParam` coerces the two words and nothing else — so the CITED lens answered 400 and the page rendered
 * a 500. Measured against the running backend: `cited=1` and `cited=TRUE` are refused, `cited=true` and
 * `cited=false` are accepted. A boolean therefore spells itself, and no caller chooses.
 *
 * THE SCOPE IS THE ROUTE AND IS NEVER A PARAMETER, so it is the one field of the read that this drops: the
 * public door is `/api/corpus` and the route answers 400 to a `scope` key at all. Dropping it here rather than
 * at each caller is what makes that a property of the serialiser instead of a thing to remember.
 *
 * `cursor` and `limit` are carried because the read has them; the stream's "load older" and "load newer" are
 * the callers that will set them, and a serialiser that silently dropped them would move the same defect one
 * chunk later.
 */
export function writeReadQuery(read: CorpusReadParameters): URLSearchParams {
  const query = new URLSearchParams();
  if (read.page !== undefined) query.set('page', read.page);
  if (read.since !== undefined) query.set('since', read.since);
  if (read.until !== undefined) query.set('until', read.until);
  if (read.kind !== undefined) query.set('kind', read.kind);
  if (read.cited !== undefined) query.set('cited', read.cited ? 'true' : 'false');
  if (read.cursor !== undefined) query.set('cursor', read.cursor);
  if (read.limit !== undefined) query.set('limit', String(read.limit));
  return query;
}

/**
 * NEXT'S `searchParams` AS `URLSearchParams`, which is what everything above reads.
 *
 * A REPEATED PARAMETER TAKES ITS FIRST VALUE. Next hands `?page=a&page=b` to a page as an ARRAY and the reads
 * take one page; taking the first is the same answer a browser's own `URLSearchParams.get` gives, so a page
 * agrees with every other reader of the same URL.
 *
 * It lives here, in the pure module, because TWO pages now read a query — `/corpus` and `/corpus/claims` —
 * and the second copy of eight lines is the second spelling this repository names as its dominant defect.
 */
export function queryOf(searchParams: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const one = Array.isArray(value) ? value.at(0) : value;
    if (one !== undefined) params.set(key, one);
  }
  return params;
}

/**
 * `list_trajectories`' parameters (§6.1 :247) — and they are NOT `list_corpus`'.
 *
 * `page` IS REQUIRED HERE AND OPTIONAL THERE, which is the whole of §25 :783 expressed in a type: the claims
 * view has no meaning without one, so a caller cannot build this object without naming a page. `kind` and
 * `cited` are absent because the read has neither, and the route answers 400 `Unrecognized key` to a
 * parameter it does not take — so a serialiser that carried the stream's five would turn a working filter
 * into a refusal the moment a reader arrived from `/corpus?cited=1`.
 */
export interface ClaimsReadParameters {
  page: string;
  since?: string;
  until?: string;
  cursor?: string;
  limit?: number;
}

/** The claims read's parameters as the wire carries them — the scope is the route, so it is never a key. */
export function writeClaimsQuery(read: ClaimsReadParameters): URLSearchParams {
  const query = new URLSearchParams();
  query.set('page', read.page);
  if (read.since !== undefined) query.set('since', read.since);
  if (read.until !== undefined) query.set('until', read.until);
  if (read.cursor !== undefined) query.set('cursor', read.cursor);
  if (read.limit !== undefined) query.set('limit', String(read.limit));
  return query;
}

export function toReadParameters(filters: CorpusFilters, scope: CorpusScope, cursor?: string, limit?: number): CorpusReadParameters {
  const read: CorpusReadParameters = { scope };
  if (filters.page !== undefined) read.page = filters.page;
  if (filters.since !== undefined) read.since = filters.since;
  if (filters.until !== undefined) read.until = filters.until;
  if (filters.kind !== undefined) read.kind = filters.kind;
  if (filters.cited === true) read.cited = true;
  if (cursor !== undefined) read.cursor = cursor;
  if (limit !== undefined) read.limit = limit;
  return read;
}
