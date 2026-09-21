import type { PagesFacetRow } from '@/types/corpus';

// ---------------------------------------------------------------------------
// A PAGE'S HELD INTERVAL, OR NOTHING — docs/gf-ui-flows.md §28 :882 (the facet's `first` and `last`), §4 :169
// ("a page is shown by its interval"). RULED 2026-09-21.
//
// THE FACET SENDS `string | null` AND ALWAYS HAS. `corpusReads.ts` :1070–:1071 types both fields nullable and
// :1307 sets them from `held.at(0) ?? null`, so a page whose captures have not been acquired yet answers
// `null` on both. The frontend required `string` and its parser called `text()`, which THROWS — one such page
// in the facet and the whole gated door's region 0 goes down, because it parses every surveyed page.
//
// IT IS ONE SURVEY AWAY AND NOT A CORNER: `walk/tools/surveyWaybackCaptures.ts` :149 creates the `TrackedUrl`
// and its work-list rows, and a later step acquires the captures. Every newly surveyed url sits in "surveyed,
// zero captures" until then.
//
// THE BACKEND DOES NOT MOVE, and that is the ruling rather than an economy. `null` is the TRUE statement
// about a page with no captures; an empty string or a stand-in date would be a lie the frontend could not
// detect, and the two regions that draw an interval would draw it from a value that names no capture.
//
// ONE FUNCTION FOR TWO REGIONS. The pages list's row and the page card ask the same question and must answer
// it the same way — the rule is "a page with no captures has no interval", and a rule spelled once in each
// region is this repository's dominant defect at the scale of two. The card additionally draws NO STRIP when
// this is null: `page.shape` is NOT null there — `shapeOf([], [])` returns empty arrays for the page a read
// NAMES (`corpusReads.ts` :1312) — so the strip's guard is the interval's absence and never the shape's.
// ---------------------------------------------------------------------------

/** The two endpoints a page actually holds, or `null` when it holds no captures at all. */
export function heldInterval(page: Pick<PagesFacetRow, 'first' | 'last'>): { first: string; last: string } | null {
  return page.first === null || page.last === null ? null : { first: page.first, last: page.last };
}
