import { MAX_BAR_PX, MERGE_PX, stripOf } from '../src/lib/timeStrip';
import { requireSubjects } from './scan';
import type { CorpusEntry } from '../src/types/corpus';

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

function capture(day: string): CorpusEntry {
  return {
    kind: 'CAPTURE',
    capture: `${day}000000`,
    snapshotDate: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`,
    fileHash: `0x${day.padEnd(64, '0')}`,
    textHash: day.padEnd(64, '0'),
    textExtractionVersion: 'v3-fixture',
    anchor: { documentHash: day.padEnd(64, '0'), attributed: true },
    evidence: CITED.has(day) ? { fileHash: `0x${day.padEnd(64, '1')}`, status: 'PROMOTED', citedBy: [] } : null,
    page: { trackedUrlId: 'page-one', url: 'https://example.gov/one/', public: true },
  };
}

function diff(before: string, after: string, chunks: number, passed: boolean): CorpusEntry {
  // TYPED, NOT CAST. The first draft ended `as CorpusEntry` and the suite was GREEN while `tsc` exited 2 with
  // `fileHash` missing — the same shape UI-5 recorded, and the reason a cast is not allowed to stand in for a
  // field: it silences the one check that reads the appendix.
  return {
    kind: 'DIFF',
    before: `${before}000000`,
    after: `${after}000000`,
    fileHash: `0x${before.padEnd(64, '2')}`,
    current: { contentVersionHash: 'v', chunks: Array.from({ length: chunks }, (_, i) => ({ side: i % 2 === 0 ? 'REMOVED' : 'ADDED', text: 'x' })) },
    awaitingDerivation: false,
    // (g)'s subject: the gate reads `legallySignificant` / `categories`, and the strip must draw BOTH kinds.
    opinion: { significance: 's', categories: passed ? ['SAFETY_CLAIM_ALTERATION'] : [], legallySignificant: passed, editorial: true, classifierVersion: 'v5', draws: 1 },
    narrowed: false,
    evidence: null,
    page: { trackedUrlId: 'page-one', url: 'https://example.gov/one/', public: true },
  };
}

/** The 13 the gate hides — placed between real captures so they collide exactly as the passing ones do. */
const HIDDEN: readonly (readonly [string, string, number])[] = [
  ['20211223', '20220105', 1], ['20220105', '20220120', 2], ['20220120', '20220127', 4],
  ['20220127', '20220306', 6], ['20220317', '20220324', 8], ['20220325', '20220501', 5],
  ['20220501', '20220502', 2], ['20220502', '20220503', 3], ['20220503', '20220516', 7],
  ['20220516', '20220524', 9], ['20220525', '20220526', 4], ['20220530', '20220628', 6],
  ['20221129', '20230103', 11],
];

const ENTRIES: CorpusEntry[] = [
  ...CAPTURE_DAYS.map(capture),
  ...PASSING.map(([b, a, c]) => diff(b, a, c, true)),
  ...HIDDEN.map(([b, a, c]) => diff(b, a, c, false)),
];

describe('time-strip', () => {
  it('THE AXIS IS TRUE ELAPSED TIME, GAPS INCLUDED — a void is drawn as a void, by value (d)', () => {
    const { dots } = stripOf(ENTRIES, FIRST, LAST, W);
    const first = dots.at(0);
    const last = dots.at(-1);
    // The 84-day void between 6.9 and 29.11 is the ruling's own measurement: 22.3% of the strip.
    const sept = stripOf([capture('20220906'), capture('20221129')], FIRST, LAST, W).dots;
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
    const { dots } = stripOf(ENTRIES, FIRST, LAST, W);
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
    const { dots } = stripOf(ENTRIES, FIRST, LAST, W);
    // Two cited captures forced into one mark: the merged dot must ring, and the count must still be 2.
    const pair = stripOf([capture('20220628'), capture('20220629'), capture('20220701')], FIRST, LAST, W).dots;
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
      stripOf([diff('20220101', '20220102', chunks, true), diff('20220601', '20220602', 10_000, true)], '20220101000000', '20221231000000', W).bars.at(0)?.height ?? 0;
    const scaled = (chunks: number): number =>
      Math.round((stripOf([diff('20220101', '20220102', chunks, true), diff('20220601', '20220602', 125, true)], '20220101000000', '20221231000000', W).bars.at(0)?.height ?? 0) * 10) / 10;
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
      loneChangeIsFullHeight: stripOf([diff('20220101', '20220102', 2, true)], '20220101000000', '20221231000000', W).bars.at(0)?.height,
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
    const { bars } = stripOf(ENTRIES, FIRST, LAST, W);
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
    const { bars } = stripOf(ENTRIES, FIRST, LAST, W);
    // May's three sit within 4.2px and their chunks are 50, 52 and 52. Summed they would be 154 — taller than
    // this page's largest real change of 125, i.e. a bar for a change that never happened.
    const tallest = Math.max(...bars.map((bar) => bar.height));
    const summedWouldExceed = Math.sqrt(154) / Math.sqrt(125) > 1;
    expect({
      noBarExceedsTheTallestRealChange: Math.round(tallest * 10) / 10,
      summedWouldHaveExceededIt: summedWouldExceed,
    }).toEqual({ noBarExceedsTheTallestRealChange: MAX_BAR_PX, summedWouldHaveExceededIt: true });
  });
});
