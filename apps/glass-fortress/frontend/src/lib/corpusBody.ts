import type { PagesFacetRow } from '@/types/corpus';

// ---------------------------------------------------------------------------
// THE CORPUS BODY AT THE BOUNDARY — docs/gf-ui-flows.md §8 :331–:333 ("bytes, not views"), §28 :792;
// UI plan §4 :880–:883 (fixture drift: the fixtures come from the appendix, so a route body that drifts from it
// passes the suite and breaks the page).
//
// A body is NARROWED here, at the read, or it is not rendered — `lib/thesisBody.ts`' discipline, applied to the
// corpus. The failure a drift produces is then LOUD and names the field, never a region that silently renders
// nothing, which a reader cannot tell from "there is nothing to show".
//
// THIS CHUNK PARSES THE FACET AND NOTHING ELSE. The pages list reads `pages` and never `entries`, so narrowing
// `entries` here would be a parser for a body no caller in this chunk holds — and a parser nothing exercises is
// a parser nothing proves. The stream's rows are narrowed when the stream lands.
// ---------------------------------------------------------------------------

class CorpusBodyError extends Error {}

const fail = (at: string, want: string, got: unknown): never => {
  throw new CorpusBodyError(`corpus body: ${at} expected ${want}, got ${JSON.stringify(got) ?? 'undefined'}`);
};

const object = (value: unknown, at: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : fail(at, 'an object', value);

const text = (value: unknown, at: string): string => (typeof value === 'string' ? value : fail(at, 'a string', value));
const flag = (value: unknown, at: string): boolean => (typeof value === 'boolean' ? value : fail(at, 'a boolean', value));
const count = (value: unknown, at: string): number => (typeof value === 'number' && Number.isFinite(value) ? value : fail(at, 'a number', value));
const list = (value: unknown, at: string): unknown[] => (Array.isArray(value) ? value : fail(at, 'an array', value));

/**
 * One row of the `pages` facet (§28 :792).
 *
 * `public` IS NARROWED AS A REQUIRED BOOLEAN AND NOT DEFAULTED. UI-2 added it so the gated door can mark a row
 * of a page not yet opened without a second read, and it is "always true at `public`". A missing `public` must
 * therefore FAIL rather than default to `false` (a row silently dropped from a public list) or to `true` (a row
 * shown that the scope may not have meant) — either default would decide a DISCLOSURE question by accident.
 */
function pagesFacetRow(value: unknown, at: string): PagesFacetRow {
  const row = object(value, at);
  return {
    trackedUrlId: text(row.trackedUrlId, `${at}.trackedUrlId`),
    url: text(row.url, `${at}.url`),
    public: flag(row.public, `${at}.public`),
    first: text(row.first, `${at}.first`),
    last: text(row.last, `${at}.last`),
    entries: count(row.entries, `${at}.entries`),
  };
}

/** The `pages` facet of `list_corpus`' answer — the pages list's ONLY legal source (§24 :680–:681, §28). */
export function parseCorpusPages(body: unknown): PagesFacetRow[] {
  const answer = object(body, 'the answer');
  return list(answer.pages, 'pages').map((row, index) => pagesFacetRow(row, `pages[${String(index)}]`));
}
