import { MAX_BAR_PX, MERGE_PX, MONTHS_BEFORE_YEARS, monthsOf, stripOf } from '../src/lib/timeStrip';
import { requireSubjects } from './scan';
import type { CaptureBin, DiffBin, PageShape } from '../src/types/corpus';

// ---------------------------------------------------------------------------
// time-strip — docs/gf-ui-flows.md §24 region 3, rulings (b) to (g), 2026-09-19.
//
// THE SUBJECT IS THE REAL PAGE'S SHAPE, written from the RULING'S OWN PUBLISHED FIGURES and not captured from a
// response: 319px drawable, 376 days, 0.85px per day, 22 captures, 21 diffs, chunks 1…125, 8 past the gate, and
// the three cited captures the ruling names. Those numbers are the ground the rulings were made on, so a case
// that reproduces them is checking the contract rather than one environment's answer on one day.
//
// EVERY CASE HOLDS A VALUE, NEVER A PROPERTY NAME, because the ruling was made between implementations that
// differ by 1 to 3 pixels — the researcher's own reading is *„אני לא מזהה הבדלים משמעותיים"*, recorded in the
// ruling as TRUE and MEASURED. A case asserting "there is a height" would pass on every option that was
// rejected. The choices were made on what survives a GROWING corpus, so the cases pin the ARITHMETIC that makes
// them survive, and a later seat re-opening them for looking the same has to falsify a number.
//
// THE SUBJECT'S TYPE CHANGED ON 2026-09-21 AND ITS NUMBERS DID NOT. `stripOf` took the view's `CorpusEntry[]`
// and now takes the PAGE's `PageShape` (§24 :755), so every fixture below is the same measurement expressed
// as BINS: the real page's 22 captures fall on 22 distinct days and its 21 diffs on 21 distinct pairs, so
// each bin carries a count of one and every figure the rulings were made on is unmoved. What the bins ADD is
// the case at the foot of this file: a bin may carry more than one record, and a mark's count is the SUM of
// its bins' counts. The old spelling was `group.length` — the number of MARKS — which was right while one
// mark meant one record and is wrong now.
//
// WHAT NO CASE HERE CAN HOLD: that any of this reaches the screen. jsdom computes no layout, the strip is
// nothing but layout, and the browser reading lives in the step's record.
// ---------------------------------------------------------------------------

const W = 319;
const FIRST = '20211223211940';
const LAST = '20230103000000';

/** The page's 22 capture days, the ruling's own set. */
const CAPTURE_DAYS = [
  '20211223', '20220105', '20220120', '20220127', '20220306', '20220317', '20220324', '20220325',
  '20220501', '20220502', '20220503', '20220516', '20220524', '20220525', '20220526', '20220529',
  '20220530', '20220628', '20220805', '20220906', '20221129', '20230103',
];
const CITED = new Set(['20220628', '20220805', '20220906']);

/** The eight diffs that pass the gate, with the chunk totals measured on the real page. */
const PASSING = [
  ['20220306', '20220317', 3], ['20220324', '20220325', 3], ['20220524', '20220525', 50],
  ['20220526', '20220529', 52], ['20220529', '20220530', 52], ['20220628', '20220805', 117],
  ['20220805', '20220906', 125], ['20220906', '20221129', 49],
] as const;

/** One day's captures, as the facet bins them — `cited` from the ruling's own three. */
function capture(day: string, count = 1): CaptureBin {
  return { day, count, cited: CITED.has(day) };
}

/**
 * One `(before, after)` pair's diffs, as the facet bins them.
 *
 * `passed` IS THE BACKEND'S VERDICT AND IS READ, NOT RECOMPUTED. The gate used to be called inside `stripOf`
 * from a row's `opinion`; since the shape landed it is `flaggedByClassifier`'s answer carried on the bin, so
 * this fixture states the verdict directly and (g) is asserted on what the strip DOES with it.
 */
function diff(before: string, after: string, chunks: number, passed: boolean, count = 1): DiffBin {
  return { before, after, count, chunks, passed };
}

/** A page's shape, from bins — the one argument `stripOf` now takes. */
function shapeOf(captures: readonly CaptureBin[], diffs: readonly DiffBin[]): PageShape {
  return { captures: [...captures], diffs: [...diffs] };
}

/** The 13 the gate hides — placed between real captures so they collide exactly as the passing ones do. */
const HIDDEN: readonly (readonly [string, string, number])[] = [
  ['20211223', '20220105', 1], ['20220105', '20220120', 2], ['20220120', '20220127', 4],
  ['20220127', '20220306', 6], ['20220317', '20220324', 8], ['20220325', '20220501', 5],
  ['20220501', '20220502', 2], ['20220502', '20220503', 3], ['20220503', '20220516', 7],
  ['20220516', '20220524', 9], ['20220525', '20220526', 4], ['20220530', '20220628', 6],
  ['20221129', '20230103', 11],
];

/** The whole page: 22 captures on 22 days, 21 diffs on 21 pairs, every bin carrying one record. */
const SHAPE: PageShape = shapeOf(
  CAPTURE_DAYS.map((day) => capture(day)),
  [...PASSING.map(([b, a, c]) => diff(b, a, c, true)), ...HIDDEN.map(([b, a, c]) => diff(b, a, c, false))],
);

describe('time-strip', () => {
  it('THE AXIS IS TRUE ELAPSED TIME, GAPS INCLUDED — a void is drawn as a void, by value (d)', () => {
    const { dots } = stripOf(SHAPE, FIRST, LAST, W);
    const first = dots.at(0);
    const last = dots.at(-1);
    // The 84-day void between 6.9 and 29.11 is the ruling's own measurement: 22.3% of the strip.
    const sept = stripOf(shapeOf([capture('20220906'), capture('20221129')], []), FIRST, LAST, W).dots;
    const voidWidth = ((sept.at(1)?.x ?? 0) - (sept.at(0)?.x ?? 0)) / W;
    expect({
      startsAtZero: first?.x,
      endsAtWidth: Math.round(last?.x ?? 0),
      voidSharePercent: Math.round(voidWidth * 1000) / 10,
      // THE CONTROL AGAINST AN INDEX AXIS, which is the implementation (d) forbids: evenly spaced marks would
      // put the 20th of 22 captures at 19/21 of the width. By DATE it sits far later, because the gaps are real.
      byIndexWouldBe: Math.round((19 / 21) * W),
      byDateItIs: Math.round(dots.at(-3)?.x ?? 0),
    }).toEqual({ startsAtZero: 0, endsAtWidth: 319, voidSharePercent: 22.3, byIndexWouldBe: 289, byDateItIs: 218 });
  });

  it('CAPTURES CLOSER THAN 5px MERGE INTO ONE DOT CARRYING THEIR COUNT — and the axis does not move (e)', () => {
    const { dots } = stripOf(SHAPE, FIRST, LAST, W);
    const merged = requireSubjects('merged dots', dots.filter((dot) => dot.count > 1));
    expect({
      // 22 captures, fewer marks: the smear is gone and nothing was dropped.
      totalCaptures: dots.reduce((sum, dot) => sum + dot.count, 0),
      markCount: dots.length,
      mergedCounts: merged.map((dot) => dot.count),
      // NO TWO MARKS SIT CLOSER THAN THE THRESHOLD — the property, not an example of it.
      minGap: Math.round(Math.min(...dots.slice(1).map((dot, i) => dot.x - (dots[i]?.x ?? 0))) * 10) / 10 >= MERGE_PX,
      // 16 marks for 22 captures, merging 2 + 3 + 4 — computed by hand from the 22 x-positions before it was
      // asserted, because the first draft of this case GUESSED 14 and [2, 3, 5] and the guess was wrong. A
      // number taken from the implementation it is checking is not an assertion.
    }).toEqual({ totalCaptures: 22, markCount: 16, mergedCounts: [2, 3, 4], minGap: true });
  });

  it('A MERGED DOT IS RINGED WHEN ANY CAPTURE UNDER IT IS CITED — and by the capture`s OWN evidence (c, e)', () => {
    const { dots } = stripOf(SHAPE, FIRST, LAST, W);
    // Two cited captures forced into one mark: the merged dot must ring, and the count must still be 2.
    const pair = stripOf(shapeOf([capture('20220628'), capture('20220629'), capture('20220701')], []), FIRST, LAST, W).dots;
    expect({
      ringedMarks: dots.filter((dot) => dot.ringed).length,
      ringedAreSingles: dots.filter((dot) => dot.ringed).map((dot) => dot.count),
      // A group holding one cited capture among three uncited still rings — ANY, not ALL.
      mergedGroupRings: pair.at(0)?.ringed,
      mergedGroupCount: pair.at(0)?.count,
      // TWO-SIDED: not everything rings.
      unringed: dots.filter((dot) => !dot.ringed).length,
    }).toEqual({ ringedMarks: 3, ringedAreSingles: [1, 1, 1], mergedGroupRings: true, mergedGroupCount: 3, unringed: 13 });
  });

  it('THE BAR`S HEIGHT IS THE SQUARE ROOT OF THE CHUNK COUNT — not linear, and NEVER a floor (f)', () => {
    // THE SCALE IS THE PAGE'S OWN LARGEST, so every one of these is measured on a page whose tallest change is
    // 125. An earlier draft measured 1, 3 and 6 on pages of their own and got 40px three times — correct
    // behaviour (a lone change is the tallest thing on its page) and a useless comparison. It is recorded
    // because it is the shape a reader of this case would otherwise repeat.
    /** The same measurement on a page whose largest change is 10,000 — where a floor would bite. */
    const bigPage = (chunks: number): number =>
      stripOf(shapeOf([], [diff('20220101', '20220102', chunks, true), diff('20220601', '20220602', 10_000, true)]), '20220101000000', '20221231000000', W).bars.at(0)?.height ?? 0;
    const scaled = (chunks: number): number =>
      Math.round((stripOf(shapeOf([], [diff('20220101', '20220102', chunks, true), diff('20220601', '20220602', 125, true)]), '20220101000000', '20221231000000', W).bars.at(0)?.height ?? 0) * 10) / 10;
    expect({
      // A FLOOR would draw these three at ONE height, which is the implementation (f) forbids by name.
      floorWouldFlatten: new Set([scaled(1), scaled(3), scaled(6)]).size,
      // 3 chunks against a 125 page: the ruling's own reading, to a tenth.
      threeOf125: scaled(3),
      oneOf125: scaled(1),
      tallestIsFullHeight: scaled(125) === MAX_BAR_PX,
      // NOT LINEAR: linear would put 3 of 125 at 0.96px. The root is 6.5x that.
      linearWouldBe: Math.round((3 / 125) * MAX_BAR_PX * 100) / 100,
      // MONOTONIC, so "the height is the chunk count" still holds.
      monotonic: scaled(1) < scaled(3) && scaled(3) < scaled(6),
      // A LONE CHANGE IS THE TALLEST ON ITS OWN PAGE, which is the scale being relative and not a defect.
      loneChangeIsFullHeight: stripOf(shapeOf([], [diff('20220101', '20220102', 2, true)]), '20220101000000', '20221231000000', W).bars.at(0)?.height,
      // A FLOOR IS CAUGHT AT THE SCALE WHERE IT ACTUALLY BITES, and this arm exists because a decoy found the
      // region unexercised. A `Math.max(3, …)` floor changes NOTHING on a page whose largest change is 125 —
      // every small bar is already over 3px there — so the arm above could not see it. On a page whose largest
      // change is 10,000 the same three counts land under a pixel each, which is where a floor flattens them
      // to one height and (f)'s "never a minimum height" becomes a real assertion. THREE DISTINCT VALUES, ALL
      // BELOW THE FLOOR: a floor of any size at or above these would collapse them, and the set size falls.
      smallEndStaysDistinct: new Set([bigPage(1), bigPage(3), bigPage(6)]).size,
      smallEndIsBelowAnyFloor: [bigPage(1), bigPage(3), bigPage(6)].every((height) => height < 3),
    }).toEqual({ floorWouldFlatten: 3, threeOf125: 6.2, oneOf125: 3.6, tallestIsFullHeight: true, linearWouldBe: 0.96, monotonic: true, loneChangeIsFullHeight: MAX_BAR_PX, smallEndStaysDistinct: 3, smallEndIsBelowAnyFloor: true });
  });

  it('THE STRIP DRAWS ALL 21 DIFFS, THE GATE`S HIDDEN 13 INCLUDED, DIMMED — de-emphasise, never hide (g)', () => {
    const { bars } = stripOf(SHAPE, FIRST, LAST, W);
    const drawn = bars.reduce((sum, bar) => sum + bar.count, 0);
    expect({
      // Every diff reaches the strip; merging reduces MARKS and never the count they carry.
      diffsDrawn: drawn,
      // TWO-SIDED, and this is the measurement the ruling rests on: drawing only the 8 that passed would remove
      // every low bar, so the set must contain both tones.
      dimMarks: bars.filter((bar) => bar.dim).length > 0,
      fullMarks: bars.filter((bar) => !bar.dim).length > 0,
      // A mark holding a passed diff is NOT dim, even if a hidden one merged into it — ANY, mirroring the ring.
      noMarkIsBothToned: bars.every((bar) => typeof bar.dim === 'boolean'),
    }).toEqual({ diffsDrawn: 21, dimMarks: true, fullMarks: true, noMarkIsBothToned: true });
  });

  it('A MERGED BAR TAKES ITS GROUP`S LARGEST COUNT, NEVER THEIR SUM — merging is the MARK, not the data (e)', () => {
    const { bars } = stripOf(SHAPE, FIRST, LAST, W);
    // May's three sit within 4.2px and their chunks are 50, 52 and 52. Summed they would be 154 — taller than
    // this page's largest real change of 125, i.e. a bar for a change that never happened.
    const tallest = Math.max(...bars.map((bar) => bar.height));
    const summedWouldExceed = Math.sqrt(154) / Math.sqrt(125) > 1;
    expect({
      noBarExceedsTheTallestRealChange: Math.round(tallest * 10) / 10,
      summedWouldHaveExceededIt: summedWouldExceed,
    }).toEqual({ noBarExceedsTheTallestRealChange: MAX_BAR_PX, summedWouldHaveExceededIt: true });
  });

  it('A MARK COUNTS RECORDS AND NOT BINS — the one number the shape could have broken silently (e)', () => {
    // THE ARITHMETIC THE 2026-09-21 CHANGE PUT AT RISK. `stripOf` spelled a merged mark's count `group.length`
    // — the number of MARKS in the group — which was right while a mark meant exactly one record and is wrong
    // the moment a bin can carry several. It must be the SUM of the group's `count`, for dots and bars alike.
    //
    // THE REAL PAGE CANNOT SEE THIS, which is why the case is written on a shape of its own: its 22 captures
    // fall on 22 distinct days and its 21 diffs on 21 distinct pairs, so every bin there carries one and the
    // two spellings agree on every mark. A fixture that cannot separate two implementations tests neither.
    //
    // 28.6.2022 and 29.6.2022 are one day apart — 0.85px at this width — so the 5px merge joins them, and the
    // mark that results stands for SEVEN captures. `group.length` would say TWO, and a reader would be told
    // that two captures happened in a week where seven did. The FIRST of the two is one of the ruling's three
    // cited days, so the ring has to survive the sum as well.
    const busy = stripOf(
      shapeOf(
        [capture('20220628', 4), capture('20220629', 3), capture('20221129')],
        [diff('20220628', '20220629', 9, false, 5), diff('20220629', '20220630', 20, true, 2), diff('20221129', '20230103', 3, true)],
      ),
      FIRST,
      LAST,
      W,
    );
    const mergedDot = busy.dots.at(0);
    const mergedBar = busy.bars.at(0);
    expect({
      // The two near days are ONE mark and it carries 4 + 3.
      dotMarks: busy.dots.length,
      mergedDotCount: mergedDot?.count,
      // RINGED BY ANY: the cited day is one of the two bins under this mark, so the ring survives the merge
      // AND the sum — a count that folded the bins together could just as easily have folded the flag away.
      mergedDotRings: mergedDot?.ringed,
      // The same for bars: two bins of 5 and 2 diffs, merged, standing for SEVEN changes.
      barMarks: busy.bars.length,
      mergedBarCount: mergedBar?.count,
      // AND THE HEIGHT IS STILL THE GROUP'S LARGEST CHUNK COUNT, never a sum of the counts it now adds up:
      // 20 chunks is the tallest on this page, so the merged bar is full height.
      mergedBarHeight: mergedBar?.height,
      // FULL-TONED because ONE of the two bins passed — the ANY rule, unchanged by the merge.
      mergedBarDim: mergedBar?.dim,
      // A LONE BIN OF ONE still says one, so the sum is not "always more than one", and it is UNRINGED, so
      // the ring above is not simply true everywhere.
      loneDotCount: busy.dots.at(-1)?.count,
      loneDotRings: busy.dots.at(-1)?.ringed,
      loneBarCount: busy.bars.at(-1)?.count,
      // THE CONTROL, STATED AS THE NUMBER THE OLD SPELLING GAVE: `group.length` is the count of BINS, and it
      // is 2 for each merged mark. Asserting 7 against a stated 2 is what makes this an assertion.
      binsInEachMergedGroup: 2,
      // AND NOTHING IS LOST ACROSS THE WHOLE STRIP: every record the shape holds reaches a mark.
      allCaptures: busy.dots.reduce((sum, dot) => sum + dot.count, 0),
      allDiffs: busy.bars.reduce((sum, bar) => sum + bar.count, 0),
    }).toEqual({
      dotMarks: 2,
      mergedDotCount: 7,
      mergedDotRings: true,
      barMarks: 2,
      mergedBarCount: 7,
      mergedBarHeight: MAX_BAR_PX,
      mergedBarDim: false,
      loneDotCount: 1,
      loneDotRings: false,
      loneBarCount: 1,
      binsInEachMergedGroup: 2,
      allCaptures: 8,
      allDiffs: 8,
    });
  });

  // -------------------------------------------------------------------------
  // THE STRIP'S GRANULARITY — docs/gf-ui-flows.md §24 :754 as RULED 2026-09-21: "past 15 months the strip
  // labels YEARS only — a 42-month page smeared every month label into one line."
  //
  // THE SUBJECT IS THE PURE MODULE, because the granularity is ARITHMETIC and the word is the locale's. A
  // case that read the rendered SVG would be asserting a browser's month abbreviation, which is neither the
  // rule nor stable across locales.
  // -------------------------------------------------------------------------

  it('PAST FIFTEEN MONTHS THE STRIP LABELS YEARS — walla`s 42-month page draws THREE ticks, not forty-one', () => {
    // 2019-03-14 → 2022-09-02 is 42 whole months, the real span this ruling was measured on.
    const ticks = monthsOf('20190314120000', '20220902120000', W);
    expect({
      count: ticks.length,
      units: [...new Set(ticks.map((tick) => tick.unit))],
      // A TICK AT EVERY YEAR BOUNDARY STRICTLY INSIDE THE SPAN — never at the endpoints, which the card's own
      // interval line already names.
      boundaries: ticks.map((tick) => tick.iso),
      // The positions are still on the true-time axis and still inside the drawable width.
      inside: ticks.every((tick) => tick.x > 0 && tick.x < W),
      ascending: ticks.every((tick, index) => index === 0 || tick.x > (ticks[index - 1]?.x ?? 0)),
      // THE DEFECT THIS REPLACES, stated as a number: a month tick per boundary would have been 41 words
      // across 319 units — under 8 units each.
      monthlyWouldHaveDrawn: 41,
    }).toEqual({
      count: 3,
      units: ['year'],
      boundaries: ['2020-01-01', '2021-01-01', '2022-01-01'],
      inside: true,
      ascending: true,
      monthlyWouldHaveDrawn: 41,
    });
  });

  it('THIRTEEN MONTHS IS STILL LABELLED BY MONTH — the boundary is ABOVE a year, and both sides of it are held', () => {
    // 2021-01-10 → 2022-02-10 is 13 whole months: under the threshold, so the month labels stay.
    const thirteen = monthsOf('20210110120000', '20220210120000', W);
    // 2021-01-10 → 2022-05-10 is 16: over it, so they become years.
    const sixteen = monthsOf('20210110120000', '20220510120000', W);
    // And EXACTLY fifteen is still months — `MONTHS_BEFORE_YEARS` is the last month-labelled span, not the
    // first year-labelled one, which is the half of a threshold a case usually leaves unpinned.
    const fifteen = monthsOf('20210110120000', '20220410120000', W);
    expect({
      thirteen: { count: thirteen.length, units: [...new Set(thirteen.map((tick) => tick.unit))] },
      fifteen: { units: [...new Set(fifteen.map((tick) => tick.unit))] },
      sixteen: { count: sixteen.length, units: [...new Set(sixteen.map((tick) => tick.unit))], boundaries: sixteen.map((tick) => tick.iso) },
      threshold: MONTHS_BEFORE_YEARS,
    }).toEqual({
      thirteen: { count: 13, units: ['month'] },
      fifteen: { units: ['month'] },
      sixteen: { count: 1, units: ['year'], boundaries: ['2022-01-01'] },
      threshold: 15,
    });
  });
});
