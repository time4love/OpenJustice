import type { PageShape } from '@/types/corpus';

// ---------------------------------------------------------------------------
// REGION 3'S GEOMETRY — docs/gf-ui-flows.md §24 region 3, rulings (b) to (g), 2026-09-19.
//
// PURE, AND IT GAINS NO DEPENDENCY. Nothing here renders, reads or fetches: it turns one page's SHAPE into
// marks with positions, so every ruling below is assertable without a DOM — which matters because jsdom
// computes no layout and the strip is nothing BUT layout. What a case can hold is the arithmetic; what it
// cannot is that the arithmetic reached the screen, and that is a browser reading.
//
// ITS INPUT IS THE PAGE'S SHAPE AND NEVER THE VIEW'S ENTRIES (§24 :755, ruled 2026-09-21). It took
// `CorpusEntry[]` until this round, which is the array a FILTER narrows and a CURSOR slices — so the strip
// said one thing while the card's own line, read from the same facet, said another. The facet's `shape` is
// computed before both, so the narrowing cannot reach here; and the significance gate is no longer called in
// this module at all, because a bin arrives carrying `passed` from the backend's own `flaggedByClassifier`.
//
// THE BINS' COUNTS ARE RECORDS AND THE MARKS' COUNTS MUST STAY RECORDS. `grouped` merges MARKS, so a merged
// mark's count is the SUM of its group's `count`, never the number of bins in the group — the one arithmetic
// this change could silently break, and it changes a number a reader sees.
//
// THE FOUR RULINGS THIS MODULE IMPLEMENTS, each where it bites:
//   (d) TRUE ELAPSED TIME, gaps included — `xOf` is a linear map of the DATE, never of the index. 78% of the
//       real page's 376 days are voids of 20+ days and they are drawn as voids.
//   (e) MARKS CLOSER THAN 5px MERGE, never the axis. One day is 0.85px here, so five pairs of the real page's
//       captures sit 0.8px apart and a 2.2px dot draws May 2022 as a smear. A merged dot carries its COUNT and
//       is ringed when ANY capture under it is cited. The same rule merges bars.
//   (f) A BAR'S HEIGHT IS THE SQUARE ROOT of the chunk count — not linear, and never a floor. A floor draws 1,
//       3 and 6 chunks at one height, lying about the number (b) chose to show; a root is monotonic, so "the
//       height is the chunk count" still holds.
//   (g) ALL the page's diffs are drawn, the gate's hidden ones included, DIMMED. De-emphasise, never hide.
//       The gate itself is the BACKEND's `flaggedByClassifier`, read off the bin's `passed`: one rule, one
//       implementation, and this module no longer holds a second reading of the classifier at all.
//
// MEASURED, from the real body, and these are the figures the cases are written against: 319px drawable at
// 375px, 376 days, 0.85px per day, 22 captures, 21 diffs, chunk counts 1…125, 8 diffs past the gate, and the
// three cited captures 20220628073145 · 20220805053301 · 20220906232435.
// ---------------------------------------------------------------------------

/** Marks closer than this many pixels are one mark (e). */
export const MERGE_PX = 5;

/** The tallest a bar may draw; the root scale is normalised to the page's own largest change (f). */
export const MAX_BAR_PX = 40;

export interface Dot {
  /** Pixels from the strip's start. */
  x: number;
  /**
   * How many CAPTURES this mark stands for — the sum of its bins' counts.
   *
   * It is not the number of bins: two captures on one day are ONE bin of count 2, and (e) may then merge that
   * bin with a neighbour. Counting marks instead of records would under-report a busy week as a quiet one.
   */
  count: number;
  /** Ringed when ANY capture under it carries its own `evidence` (c, e). */
  ringed: boolean;
}

export interface Bar {
  x: number;
  /** Pixels tall, the square root of the chunk count scaled to the page's largest (f). */
  height: number;
  /** How many DIFFS this mark stands for — the sum of its bins' counts, for `Dot.count`'s reason. */
  count: number;
  /** Drawn in the gate's light tone — true only when NO diff under it passed the gate (g). */
  dim: boolean;
}

export interface Strip {
  dots: Dot[];
  bars: Bar[];
}

export interface MonthTick {
  x: number;
  /** The first day of that month or year, as an ISO date — the component formats it for the reader's locale. */
  iso: string;
  /**
   * WHICH WORD THE COMPONENT SHOULD ASK FOR — the granularity is arithmetic and therefore this module's, while
   * the WORD is the reader's locale and therefore the component's. A component that decided the granularity
   * itself would be a second place where the strip's scale lives.
   */
  unit: 'month' | 'year';
}

/**
 * Past this many months a strip labels YEARS (RULED 2026-09-21, the researcher, ui §24 :754).
 *
 * MEASURED, NOT CHOSEN: walla's page spans 42 months, and a tick per month drew 41 labels across a 319-unit
 * viewBox — under 8 units each, which smeared every word into one grey line and said less than no labels at
 * all. Thirteen months still fit, which is why the boundary is above a year rather than at it.
 */
export const MONTHS_BEFORE_YEARS = 15;

/**
 * A DAY, as the number of days since the epoch.
 *
 * It takes the FIRST EIGHT CHARACTERS and ignores the rest, so it reads the facet's `YYYYMMDD` bins and the
 * card's own 14-digit `first`/`last` interval with one spelling — which is why the wire sends days: the
 * instrument throws the instant away anyway.
 */
function dayOf(timestamp: string): number {
  const year = Number(timestamp.slice(0, 4));
  const month = Number(timestamp.slice(4, 6));
  const day = Number(timestamp.slice(6, 8));
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/**
 * Marks at the same position, merged — the ONE place (e) is implemented, for dots and bars alike.
 *
 * It walks marks already in position order and opens a new group whenever the next one is `MERGE_PX` or more
 * from the group's FIRST member. Measuring from the first rather than from the previous is deliberate: chaining
 * from the previous would let a run of 4px steps merge an arbitrarily wide span into one mark, which would
 * compress time by the back door — and (d) forbids that however it is spelled.
 */
function grouped<T extends { x: number }>(marks: readonly T[]): T[][] {
  const groups: T[][] = [];
  for (const mark of marks) {
    const open = groups.at(-1);
    if (open === undefined || mark.x - (open[0]?.x ?? 0) >= MERGE_PX) groups.push([mark]);
    else open.push(mark);
  }
  return groups;
}

/** How many RECORDS a group of marks stands for — the sum of its bins' counts, never the number of bins. */
function recordsIn(group: readonly { count: number }[]): number {
  return group.reduce((total, mark) => total + mark.count, 0);
}

/**
 * ONE PAGE'S SHAPE OVER TIME.
 *
 * `first` and `last` are the interval the strip spans — the page's own, from the facet, so the axis does not
 * change when a filter narrows what is returned. A page whose interval is a single day has no span to divide
 * by and draws every mark at 0.
 *
 * `shape` IS THE PAGE'S TOO, from the same facet row, so nothing here can be the view's: a filter and a
 * cursor both act on `entries`, and `entries` is not an argument of this function any more.
 */
export function stripOf(shape: PageShape, first: string, last: string, width: number): Strip {
  const start = dayOf(first);
  const span = dayOf(last) - start;
  const xOf = (day: string): number => (span <= 0 ? 0 : ((dayOf(day) - start) / span) * width);

  const captures = shape.captures
    .map((bin) => ({ x: xOf(bin.day), count: bin.count, cited: bin.cited }))
    .sort((one, two) => one.x - two.x);

  const diffs = shape.diffs
    // (b) THE MIDPOINT OF THE INTERVAL, and a width would be a second axis the diff does not have. The bins
    // arrive in `(before, after)` order, which is NOT midpoint order, so they are sorted by the position they
    // will actually be drawn at — `grouped` walks marks in position order or it merges the wrong ones.
    .map((bin) => ({ x: (xOf(bin.before) + xOf(bin.after)) / 2, count: bin.count, chunks: bin.chunks, passed: bin.passed }))
    .sort((one, two) => one.x - two.x);

  // (f) the root is normalised to the page's OWN largest change, so a page of small changes still uses the
  // full height and a page with one huge change does not flatten the rest to nothing.
  const tallest = Math.max(...diffs.map((diff) => diff.chunks), 0);
  const heightOf = (chunks: number): number => (tallest <= 0 ? 0 : (Math.sqrt(chunks) / Math.sqrt(tallest)) * MAX_BAR_PX);

  return {
    dots: grouped(captures).map((group) => ({
      x: group[0]?.x ?? 0,
      count: recordsIn(group),
      ringed: group.some((capture) => capture.cited),
    })),
    // A MERGED BAR TAKES ITS GROUP'S LARGEST CHUNK COUNT, NOT THEIR SUM. (e) merges the MARK and not the data,
    // and summing would invent a magnitude no change has — May's three would read 154 against a page whose
    // largest real change is 125, drawing a bar taller than anything that happened. The count says there are
    // more; the height still says a change of that size occurred here.
    bars: grouped(diffs).map((group) => ({
      x: group[0]?.x ?? 0,
      height: heightOf(Math.max(...group.map((diff) => diff.chunks))),
      count: recordsIn(group),
      dim: !group.some((diff) => diff.passed),
    })),
  };
}

/**
 * THE TIME BOUNDARIES INSIDE THE INTERVAL, positioned on the same true-time axis as every other mark.
 *
 * They are what makes a void legible: 71px of blank strip says nothing on its own, and the same 71px between
 * „ספט" and „נוב" says eighty-four days. (d) is only honest if a reader can read the distance.
 *
 * MONTHS, OR YEARS ON A LONG PAGE (ruled 2026-09-21, ui §24 :754). The rule is the same either way — a tick at
 * every boundary strictly INSIDE the span, never at the endpoints, which the card's own interval line already
 * names — and only the STEP changes. A 42-month page labelled by month drew 41 words into 319 units and read
 * as a grey smear; by year it draws three.
 *
 * THE LABEL IS NOT COMPOSED HERE. This module is pure and formats nothing: it hands the component an ISO date
 * and the unit to ask for, and the component asks the reader's locale for the word.
 */
export function monthsOf(first: string, last: string, width: number): MonthTick[] {
  const start = dayOf(first);
  const span = dayOf(last) - start;
  if (span <= 0) return [];
  const from = new Date(start * 86_400_000);
  const to = new Date((start + span) * 86_400_000);
  // WHOLE MONTHS BETWEEN THE ENDPOINTS, from the calendar rather than from a day count: a 30-day February and
  // a 31-day March are one month each, and dividing days by 30.44 would put the boundary in a different place
  // depending on which months the page happens to span.
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  const unit: MonthTick['unit'] = months > MONTHS_BEFORE_YEARS ? 'year' : 'month';

  const ticks: MonthTick[] = [];
  const cursor =
    unit === 'year'
      ? new Date(Date.UTC(from.getUTCFullYear() + 1, 0, 1))
      : new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const end = start + span;
  while (cursor.getTime() / 86_400_000 < end) {
    const day = cursor.getTime() / 86_400_000;
    ticks.push({ x: ((day - start) / span) * width, iso: cursor.toISOString().slice(0, 10), unit });
    if (unit === 'year') cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return ticks;
}
