import { flaggedByClassifier } from '@/lib/corpusSignificance';
import type { CorpusEntry } from '@/types/corpus';

// ---------------------------------------------------------------------------
// REGION 3'S GEOMETRY — docs/gf-ui-flows.md §24 region 3, rulings (b) to (g), 2026-09-19.
//
// PURE, AND IT GAINS NO DEPENDENCY. Nothing here renders, reads or fetches: it turns one page's entries into
// marks with positions, so every ruling below is assertable without a DOM — which matters because jsdom
// computes no layout and the strip is nothing BUT layout. What a case can hold is the arithmetic; what it
// cannot is that the arithmetic reached the screen, and that is a browser reading.
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
  /** How many captures this mark stands for — 1 unless (e) merged it. */
  count: number;
  /** Ringed when ANY capture under it carries its own `evidence` (c, e). */
  ringed: boolean;
}

export interface Bar {
  x: number;
  /** Pixels tall, the square root of the chunk count scaled to the page's largest (f). */
  height: number;
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
  /** The first day of that month, as an ISO date — the component formats it for the reader's locale. */
  iso: string;
}

/** A 14-digit wayback timestamp as a day. Only the date part positions a mark; the strip's unit is days. */
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

/** The chunk count of a diff, by side, from `current` — null while it awaits derivation, which counts as 0. */
function chunksOf(entry: Extract<CorpusEntry, { kind: 'DIFF' }>): number {
  return entry.current?.chunks.length ?? 0;
}

/**
 * ONE PAGE'S SHAPE OVER TIME.
 *
 * `first` and `last` are the interval the strip spans — the page's own, from the facet, so the axis does not
 * change when a filter narrows what is returned. A page whose interval is a single day has no span to divide
 * by and draws every mark at 0.
 */
export function stripOf(entries: readonly CorpusEntry[], first: string, last: string, width: number): Strip {
  const start = dayOf(first);
  const span = dayOf(last) - start;
  const xOf = (timestamp: string): number => (span <= 0 ? 0 : ((dayOf(timestamp) - start) / span) * width);

  const captures = entries
    .filter((entry): entry is Extract<CorpusEntry, { kind: 'CAPTURE' }> => entry.kind === 'CAPTURE')
    .map((entry) => ({ x: xOf(entry.capture), cited: entry.evidence !== null }))
    .sort((one, two) => one.x - two.x);

  const diffs = entries
    .filter((entry): entry is Extract<CorpusEntry, { kind: 'DIFF' }> => entry.kind === 'DIFF')
    // (b) THE MIDPOINT OF THE INTERVAL, and a width would be a second axis the diff does not have.
    .map((entry) => ({
      x: (xOf(entry.before) + xOf(entry.after)) / 2,
      chunks: chunksOf(entry),
      // (g) THE GATE'S OWN PREDICATE IS CALLED, NEVER RE-SPELLED, and this line is why the rule exists. It
      // first read `opinion?.legallySignificant === true || (opinion?.categories.length ?? 0) > 0` — which
      // looks like the same test and is not: on a diff with NO opinion it answers false, so the strip dimmed a
      // row the researcher ruled is NEVER gated, because a classifier that has not spoken has not judged it
      // insignificant. `flaggedByClassifier` already holds that, and a render case caught the divergence.
      passed: flaggedByClassifier(entry),
    }))
    .sort((one, two) => one.x - two.x);

  // (f) the root is normalised to the page's OWN largest change, so a page of small changes still uses the
  // full height and a page with one huge change does not flatten the rest to nothing.
  const tallest = Math.max(...diffs.map((diff) => diff.chunks), 0);
  const heightOf = (chunks: number): number => (tallest <= 0 ? 0 : (Math.sqrt(chunks) / Math.sqrt(tallest)) * MAX_BAR_PX);

  return {
    dots: grouped(captures).map((group) => ({
      x: group[0]?.x ?? 0,
      count: group.length,
      ringed: group.some((capture) => capture.cited),
    })),
    // A MERGED BAR TAKES ITS GROUP'S LARGEST CHUNK COUNT, NOT THEIR SUM. (e) merges the MARK and not the data,
    // and summing would invent a magnitude no change has — May's three would read 154 against a page whose
    // largest real change is 125, drawing a bar taller than anything that happened. The count says there are
    // more; the height still says a change of that size occurred here.
    bars: grouped(diffs).map((group) => ({
      x: group[0]?.x ?? 0,
      height: heightOf(Math.max(...group.map((diff) => diff.chunks))),
      count: group.length,
      dim: !group.some((diff) => diff.passed),
    })),
  };
}

/**
 * THE MONTH BOUNDARIES INSIDE THE INTERVAL, positioned on the same true-time axis as every other mark.
 *
 * They are what makes a void legible: 71px of blank strip says nothing on its own, and the same 71px between
 * „ספט" and „נוב" says eighty-four days. (d) is only honest if a reader can read the distance.
 *
 * A tick is emitted for every month start strictly inside the span, never for the endpoints, which the card's
 * own interval line already names. The LABEL is not composed here — this module is pure and formats nothing;
 * it hands the component an ISO date and the component asks the reader's locale for the word.
 */
export function monthsOf(first: string, last: string, width: number): MonthTick[] {
  const start = dayOf(first);
  const span = dayOf(last) - start;
  if (span <= 0) return [];
  const ticks: MonthTick[] = [];
  const from = new Date(start * 86_400_000);
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const end = start + span;
  while (cursor.getTime() / 86_400_000 < end) {
    const day = cursor.getTime() / 86_400_000;
    ticks.push({ x: ((day - start) / span) * width, iso: cursor.toISOString().slice(0, 10) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return ticks;
}
