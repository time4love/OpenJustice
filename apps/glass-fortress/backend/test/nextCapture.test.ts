import { chooseNextCapture, type CandidateCapture } from '../src/lib/nextCapture';

// ---------------------------------------------------------------------------
// LEVEL 4 — the adaptive half of the next-capture policy.
//
// Its purpose was settled by measurement on 2026-09-01: one unchanged ruleset
// matched 19 of 21 selectors at 2020-12-09, 16 of 21 nine days later, and 3 of
// 21 after 4.3 years. The decay is a BOUNDARY along the time axis, so the job is
// to find that boundary rather than to sample evenly — and the cheapest way to
// find one in an ordered set is to reach for the point furthest from everything
// known, then bisect.
//
// PURE ON PURPOSE. The policy reads dates and nothing else: no parse, no
// classifier, no corpus statistic. This level has twice rejected a frequency
// signal and a confidence score, and a sampler that scored captures for
// "chrome-likeness" would be the third attempt at that idea. Choosing WHERE TO
// LOOK is not choosing WHAT IS FURNITURE.
// ---------------------------------------------------------------------------

const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

/** The Walla news page's seven stored captures — the run this policy was designed against. */
const WALLA: CandidateCapture[] = [
  { snapshotId: 'a', capturedAt: day('2020-12-09') },
  { snapshotId: 'b', capturedAt: day('2020-12-18') },
  { snapshotId: 'c', capturedAt: day('2021-06-12') },
  { snapshotId: 'd', capturedAt: day('2022-05-23') },
  { snapshotId: 'e', capturedAt: day('2024-05-20') },
  { snapshotId: 'f', capturedAt: day('2025-02-19') },
  { snapshotId: 'g', capturedAt: day('2025-03-26') },
];

describe('with nothing judged yet', () => {
  it('starts in the MIDDLE, not at the earliest capture', () => {
    // The earliest capture is the page's oldest era — possibly a template the
    // site has left entirely. Starting there biases the whole run toward a
    // layout that no longer exists, which is the same reasoning
    // `stratifiedSample` uses when asked for a sample of one.
    const pick = chooseNextCapture(WALLA, []);
    expect(pick?.snapshotId).toBe('d');
    expect(pick?.reason).toBe('FIRST');
  });

  it('reports zero distance, because there is nothing to be distant from', () => {
    expect(chooseNextCapture(WALLA, [])?.daysFromNearestJudged).toBe(0);
  });
});

describe('finding the boundary', () => {
  it('reaches for the far end once one capture is judged', () => {
    // THE CLICK THAT FOUND THIS PAGE'S BOUNDARY. Having marked 2020-12-09, the
    // capture that can most disagree is the newest one — and it did: 3 of 21
    // selectors matching, 1% removed, text wrong.
    const pick = chooseNextCapture(WALLA, ['a']);
    expect(pick?.snapshotId).toBe('g');
    expect(pick?.reason).toBe('FURTHEST_FROM_JUDGED');
    expect(pick?.daysFromNearestJudged).toBeGreaterThan(1500);
  });

  it('bisects the widest unexplored interval once both ends are known', () => {
    // With 2020-12-09 and 2025-03-26 judged, the boundary lies between them. The
    // pick is the capture furthest from either end — which halves the search.
    const pick = chooseNextCapture(WALLA, ['a', 'g']);
    expect(pick?.snapshotId).toBe('d');
    expect(pick?.reason).toBe('FURTHEST_FROM_JUDGED');
  });

  it('keeps halving as the boundary narrows', () => {
    const pick = chooseNextCapture(WALLA, ['a', 'd', 'g']);
    // Between 2022-05-23 and 2025-03-26 lies 2024-05-20, the wider gap.
    expect(pick?.snapshotId).toBe('e');
  });

  it('does not re-offer a capture already judged', () => {
    const judged = ['a', 'b', 'c', 'd', 'e', 'f'];
    const pick = chooseNextCapture(WALLA, judged);
    expect(pick?.snapshotId).toBe('g');
    expect(pick?.reason).toBe('ONLY_REMAINING');
  });
});

describe('the ending, and the awkward inputs', () => {
  it('returns null when every capture has been judged — an answer, not a throw', () => {
    expect(chooseNextCapture(WALLA, WALLA.map((c) => c.snapshotId))).toBeNull();
  });

  it('returns null for an empty sample', () => {
    expect(chooseNextCapture([], [])).toBeNull();
  });

  it('ignores judged ids that are not in the sample', () => {
    // A run may hold verdicts on captures outside the current sample; they must
    // not remove anything from consideration or skew the distances.
    const pick = chooseNextCapture(WALLA, ['not-in-sample']);
    expect(pick?.snapshotId).toBe('d');
    expect(pick?.reason).toBe('FIRST');
  });

  it('is deterministic, so a run can be replayed', () => {
    // Ties break toward the earlier capture. Two captures EXACTLY equidistant
    // from the single judged one must not depend on iteration luck.
    //
    // The dates are genuinely symmetric — 31 days either side. An earlier
    // version of this fixture used Jan/Jun/Nov, which is 152 days one way and
    // 153 the other: not a tie at all, so it asserted nothing about tie-breaking
    // and failed for the right reason.
    const symmetric: CandidateCapture[] = [
      { snapshotId: 'early', capturedAt: day('2020-05-01') },
      { snapshotId: 'mid', capturedAt: day('2020-06-01') },
      { snapshotId: 'late', capturedAt: day('2020-07-02') },
    ];
    const first = chooseNextCapture(symmetric, ['mid']);
    for (let i = 0; i < 5; i += 1) {
      expect(chooseNextCapture(symmetric, ['mid'])?.snapshotId).toBe(first?.snapshotId);
    }
    expect(first?.snapshotId).toBe('early');
  });
});
