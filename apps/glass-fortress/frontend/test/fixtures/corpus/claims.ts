import type { TrajectoryAnswer } from '@/types/corpus';

// The ENVELOPE is docs/gf-ui-flows.md §6.1 :248 as written 2026-09-20, whose sources are `corpusReads.ts`'
// `TrajectoryFinding` + `EntryPage`, `claimTrajectory.ts`' `ChangeSpan` and `TrajectoryGroup.captures`, and
// `listTrajectories.ts`' `TrajectoryList`. The VALUES are invented (plan §4 :960–:963). Both are TYPED, so
// `tsc` checks them against `types/corpus.ts` — which the file this replaces was not: `claims.json` was
// untyped JSON, and it carried `transitions: 3` over three spans and two ADJACENT ABSENT spans, neither of
// which the wire can produce. It was UI-2's and no page ever read it.
//
// THE SET SPANS THE CONTRACT, because one body cannot show it. RB-7 asserts every arm is present before it
// reads any, so deleting one is a red case and not a quieter suite:
//   A  removed and never restored — the row §25 :789 puts FIRST
//   B  present in the latest capture — the other `finalState`
//   C  a multi-flip row, and the one `days: null` (a date that would not parse — a missing figure, never 0)
//   D  a GROUP, `claimCount` 3 — 13 of the real page's 26 rows are groups, from 2 to 45 claims
//   +  a page in `undetected`, with `entries: []` — the EMPTY state, which is not a 404
//
// THE ORDER IS THE READ'S, and it is reproduced here rather than assumed: by the date the claim LAST LEFT
// (`corpusReads.ts`' `leftAt` — the last absent span after the first), latest first, then the page's url,
// then `patternHash`. C left at the last capture, A and D at the fifth (tie broken by hash, `aaaa` before
// `dddd`), B at the second. `lastSeen` is NOT that key: B's is the newest of the four and it sorts last.
//
// THE THREE WIRE INVARIANTS HOLD ON EVERY ROW, and RB-7 is what says so: `changes.length` is
// `transitions + 1`; adjacent spans alternate; the spans' capture counts sum to `captures.length`.
//
// NAMED LIMIT (gf-a-fixture-that-does-not-match-reality): the shape below was confirmed against ONE real
// body — staging's single page, 26 rows, `transitions` 2–6, both `finalState` values, `undetected: []` and
// `nextCursor: null`. A NON-NULL cursor and a populated `undetected` are therefore held by the appendix and
// by the backend's own types, NOT by a live body.

const PAGE = { trackedUrlId: 'page-one', url: 'https://example.gov/one/', public: true };
const OTHER_PAGE = { trackedUrlId: 'page-two', url: 'https://example.gov/two/', public: true };

/** The six captures every row below was observed at, in capture order. */
const AT = [
  { snapshotDate: '2021-12-23', waybackTimestamp: '20211223211940' },
  { snapshotDate: '2022-01-05', waybackTimestamp: '20220105113501' },
  { snapshotDate: '2022-03-06', waybackTimestamp: '20220306141507' },
  { snapshotDate: '2022-05-29', waybackTimestamp: '20220529034526' },
  { snapshotDate: '2022-08-05', waybackTimestamp: '20220805053301' },
  { snapshotDate: '2023-01-03', waybackTimestamp: '20230103003746' },
] as const;

/** The vector: one entry per capture, in capture order — `present` says where the claim stood at each. */
const vector = (presence: readonly boolean[]): TrajectoryAnswer['entries'][number]['captures'] =>
  AT.map((at, index) => ({ ...at, present: presence[index] === true }));

/** A span, written at the capture it STARTS on — the archive address is the wire's, not composed here. */
const span = (
  index: number,
  present: boolean,
  captures: number,
  days: number | null,
  openEnded = false,
): TrajectoryAnswer['entries'][number]['changes'][number] => ({
  ...AT[index],
  snapshotUrl: `https://web.archive.org/web/${AT[index].waybackTimestamp}/https://example.gov/one/`,
  present,
  captures,
  days,
  openEnded,
});

/** `GET /api/corpus/claims?page=page-one` — four rows, in the read's own order, with a cursor to follow. */
export const claimsAnswer: TrajectoryAnswer = {
  entries: [
    {
      // C — six flips of one sentence; it left at the LAST capture, so it reads first.
      patternHash: 'cccc111111111111111111111111111111111111111111111111111111111111',
      sourceStateHash: 'dddd111111111111111111111111111111111111111111111111111111111111',
      transitions: 5,
      firstSeen: '2021-12-23',
      lastSeen: '2022-08-05',
      finalState: 'REMOVED',
      claimCount: 1,
      captures: vector([true, false, true, false, true, false]),
      changes: [
        span(0, true, 1, 13),
        span(1, false, 1, 60),
        span(2, true, 1, 84),
        // THE ONE `days: null` — the backend returns it when a capture date will not parse, and a page that
        // read it as 0 would print a duration nobody measured.
        span(3, false, 1, null),
        span(4, true, 1, 151),
        span(5, false, 1, 0, true),
      ],
      claims: [
        {
          trajectoryId: 'trajectory-c',
          claimHash: 'e1e1111111111111111111111111111111111111111111111111111111111111',
          claimText: 'החיסון מונע הדבקה',
        },
      ],
      page: PAGE,
    },
    {
      // A — REMOVED AND NEVER RESTORED: it appeared, held for three captures, and has been absent since.
      patternHash: 'aaaa111111111111111111111111111111111111111111111111111111111111',
      sourceStateHash: 'dddd111111111111111111111111111111111111111111111111111111111111',
      transitions: 2,
      firstSeen: '2022-01-05',
      lastSeen: '2022-05-29',
      finalState: 'REMOVED',
      claimCount: 1,
      captures: vector([false, true, true, true, false, false]),
      changes: [span(0, false, 1, 13), span(1, true, 3, 208), span(4, false, 2, 151, true)],
      claims: [
        {
          trajectoryId: 'trajectory-a',
          claimHash: 'e2e2111111111111111111111111111111111111111111111111111111111111',
          claimText: 'למפת מוקדי החיסון',
        },
      ],
      page: PAGE,
    },
    {
      // D — A GROUP: three sentences that moved as one unit, which is the finding a row of one would hide.
      patternHash: 'dddd222222222222222222222222222222222222222222222222222222222222',
      sourceStateHash: 'dddd111111111111111111111111111111111111111111111111111111111111',
      transitions: 2,
      firstSeen: '2022-03-06',
      lastSeen: '2022-05-29',
      finalState: 'REMOVED',
      claimCount: 3,
      captures: vector([false, false, true, true, false, false]),
      changes: [span(0, false, 2, 73), span(2, true, 2, 68), span(4, false, 2, 151, true)],
      claims: [
        {
          trajectoryId: 'trajectory-d1',
          claimHash: 'e3e3111111111111111111111111111111111111111111111111111111111111',
          claimText: 'החיסון מומלץ לגילאי חצי שנה ומעלה',
        },
        {
          trajectoryId: 'trajectory-d2',
          claimHash: 'e4e4111111111111111111111111111111111111111111111111111111111111',
          claimText: 'לא נמצאו אותות בטיחות חריגים',
        },
        {
          trajectoryId: 'trajectory-d3',
          claimHash: 'e5e5111111111111111111111111111111111111111111111111111111111111',
          claimText: 'ירידה בשיעור האשפוזים בקרב המחוסנים',
        },
      ],
      page: PAGE,
    },
    {
      // E — A GROUP OF EXACTLY TWO, so `alsoMoved`'s `one` branch has a subject: the word counts the OTHERS,
      // and a set whose only group is three would render the `other` form twice and hold the plural's first
      // branch by nothing. It left at the FOURTH capture, which puts it between D and B.
      patternHash: 'eeee111111111111111111111111111111111111111111111111111111111111',
      sourceStateHash: 'dddd111111111111111111111111111111111111111111111111111111111111',
      transitions: 2,
      firstSeen: '2022-01-05',
      lastSeen: '2022-05-29',
      finalState: 'REMOVED',
      claimCount: 2,
      captures: vector([false, true, true, false, false, false]),
      changes: [span(0, false, 1, 13), span(1, true, 2, 144), span(3, false, 3, 219, true)],
      claims: [
        {
          trajectoryId: 'trajectory-e1',
          claimHash: 'e7e7111111111111111111111111111111111111111111111111111111111111',
          claimText: 'החיסון בטוח לנשים בהיריון',
        },
        {
          trajectoryId: 'trajectory-e2',
          claimHash: 'e8e8111111111111111111111111111111111111111111111111111111111111',
          claimText: 'לא נדרשת המתנה בין החיסונים',
        },
      ],
      page: PAGE,
    },
    {
      // B — PRESENT in the latest capture; it left once, early, and came back.
      patternHash: 'bbbb111111111111111111111111111111111111111111111111111111111111',
      sourceStateHash: 'dddd111111111111111111111111111111111111111111111111111111111111',
      transitions: 2,
      firstSeen: '2021-12-23',
      lastSeen: '2023-01-03',
      finalState: 'PRESENT',
      claimCount: 1,
      captures: vector([true, false, true, true, true, true]),
      changes: [span(0, true, 1, 13), span(1, false, 1, 60), span(2, true, 4, 303, true)],
      claims: [
        {
          trajectoryId: 'trajectory-b',
          claimHash: 'e6e6111111111111111111111111111111111111111111111111111111111111',
          claimText: 'מידע על תופעות לוואי',
        },
      ],
      page: PAGE,
    },
  ],
  undetected: [],
  nextCursor: 'eyJsIjoiMjAyMjAxMDUxMTM1MDEifQ',
};

/**
 * `GET /api/corpus/claims?page=page-two` — THE EMPTY STATE, and it is not a 404.
 *
 * A page in scope whose current state no stored pass describes is NAMED in `undetected` (§6.1 :248), so the
 * view says "nothing was tracked here" rather than showing an empty list a reader cannot tell from a
 * missing page.
 */
export const claimsUndetected: TrajectoryAnswer = {
  entries: [],
  undetected: [OTHER_PAGE],
  nextCursor: null,
};
