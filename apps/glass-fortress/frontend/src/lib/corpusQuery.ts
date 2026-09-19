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
  const since = given(params.get('since'));
  if (since !== undefined) filters.since = since;
  const until = given(params.get('until'));
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
