// ---------------------------------------------------------------------------
// MEASURE THE THRESHOLD BEFORE MOVING IT.
//
// `MIN_CLAIM_LENGTH = 40` is carried in the plan as "the same
// length-as-significance assumption that had to be removed from the diff
// classifier". The code and the truncation plan both disagree, and they are
// right: the diff floor discarded changes for being SHORT, which is
// significance; this one exists because a short string is an unreliable
// SUBSTRING PROBE. "החיסון בטוח" appearing in a later capture may be four words
// inside an unrelated sentence. Precision, not significance — and the two
// license different fixes.
//
// So the sweep answers "what does the corpus hold below 40?", and these cases
// hold the two things that make its answer trustworthy: the baseline it is
// measured against, and the fact that it never writes.
// ---------------------------------------------------------------------------

jest.mock('../src/services/claimTrajectory', () => {
  const actual = jest.requireActual('../src/services/claimTrajectory') as Record<string, unknown>;
  return { ...actual, detectAtClaimLength: jest.fn() };
});

import { MIN_CLAIM_LENGTH, MIN_TRANSITIONS, detectAtClaimLength } from '../src/services/claimTrajectory';
import { isDerivative, measureClaimLength } from '../src/services/measureClaimLength';

const detect = detectAtClaimLength as jest.MockedFunction<typeof detectAtClaimLength>;

/** A trajectory as `detect` returns it, with presence spelled out per capture. */
function trajectory(claimText: string, presence: readonly boolean[]) {
  let transitions = 0;
  for (let i = 1; i < presence.length; i++) {
    if (presence[i] !== presence[i - 1]) transitions++;
  }
  return {
    claimHash: `hash:${claimText}`,
    claimText,
    observations: presence.map((present, i) => ({
      snapshotDate: `2022-01-0${String(i + 1)}`,
      waybackTimestamp: `2022010${String(i + 1)}000000`,
      snapshotUrl: 'https://example.test',
      present,
    })),
    transitions,
    firstSeen: '2022-01-01',
    lastSeen: '2022-01-04',
    finalState: (presence[presence.length - 1] === true ? 'PRESENT' : 'REMOVED') as
      | 'PRESENT'
      | 'REMOVED',
  };
}

/** Oscillates twice, so it surfaces at MIN_TRANSITIONS. */
const OSCILLATES = [true, false, true, false] as const;
/** Never moves, so it is detected and never surfaces. */
const CONSTANT = [true, true, true, true] as const;

const LONG = 'a claim comfortably longer than the production threshold of forty characters';
const SHORT = 'החיסון בטוח';

function result(trajectories: ReturnType<typeof trajectory>[], candidates: number) {
  return {
    minClaimLength: 0,
    candidatesConsidered: candidates,
    candidatesUnmatched: 0,
    snapshotsExamined: 4,
    trajectories,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('what a lower threshold would admit', () => {
  it('admits a SHORT oscillating claim that the production threshold hides', async () => {
    detect.mockImplementation((_url, min) =>
      Promise.resolve(
        min < MIN_CLAIM_LENGTH
          ? result([trajectory(LONG, OSCILLATES), trajectory(SHORT, OSCILLATES)], 2)
          : result([trajectory(LONG, OSCILLATES)], 1),
      ),
    );

    const report = await measureClaimLength('https://example.test', [0, MIN_CLAIM_LENGTH]);
    const lowest = report.measurements[0];

    expect(lowest?.minClaimLength).toBe(0);
    // Kept as a strict equality rather than a partial match: this is the one
    // case that pins the WHOLE admitted shape, so a field added later cannot
    // slip in unasserted.
    expect(lowest?.admitted).toEqual([
      {
        claim: SHORT,
        length: SHORT.length,
        transitions: 3,
        presentIn: 2,
        finalState: 'REMOVED',
        containedInCandidates: 0,
        capturesWhereIndependent: 2,
      },
    ]);
  });

  it('does not admit a claim that already surfaces at the production threshold', async () => {
    detect.mockResolvedValue(result([trajectory(LONG, OSCILLATES)], 1));

    const report = await measureClaimLength('https://example.test', [0, MIN_CLAIM_LENGTH]);
    expect(report.measurements[0]?.admitted).toEqual([]);
  });

  it('does not admit a claim that never moves — detected is not surfacing', async () => {
    // A short string present in every capture is exactly what the threshold was
    // written to keep out, and it is not a trajectory either way: zero
    // transitions. Counting it as admitted would inflate the case for lowering.
    detect.mockImplementation((_url, min) =>
      Promise.resolve(
        min < MIN_CLAIM_LENGTH
          ? result([trajectory(LONG, OSCILLATES), trajectory(SHORT, CONSTANT)], 2)
          : result([trajectory(LONG, OSCILLATES)], 1),
      ),
    );

    const report = await measureClaimLength('https://example.test', [0, MIN_CLAIM_LENGTH]);
    expect(report.measurements[0]?.admitted).toEqual([]);
    expect(report.measurements[0]?.trajectoriesDetected).toBe(2);
    expect(report.measurements[0]?.surfacing).toBe(1);
  });

  it('reports presence, so the incidental-match signature is readable', async () => {
    // Present in every capture but still flipping cannot happen; present in
    // nearly all of them while flipping is the shape that says the words recur
    // in unrelated passages. The count is what makes that visible at all.
    detect.mockImplementation((_url, min) =>
      Promise.resolve(
        min < MIN_CLAIM_LENGTH
          ? result([trajectory(SHORT, [true, true, false, true])], 1)
          : result([], 0),
      ),
    );

    const report = await measureClaimLength('https://example.test', [0, MIN_CLAIM_LENGTH]);
    expect(report.measurements[0]?.admitted[0]).toMatchObject({
      presentIn: 3,
      transitions: 2,
      finalState: 'PRESENT',
    });
  });
});

describe('the baseline the measurement is made against', () => {
  it('is the PRODUCTION threshold, not whichever threshold was swept first', async () => {
    // THE MUTATION THAT MATTERS. Deriving the baseline from the first swept
    // threshold makes `admitted` mean "new since the lowest value the caller
    // happened to pass", which is nothing — sweep [10, 20] and every claim short
    // enough to appear at 10 silently stops counting as admitted.
    detect.mockImplementation((_url, min) =>
      Promise.resolve(
        min < MIN_CLAIM_LENGTH
          ? result([trajectory(LONG, OSCILLATES), trajectory(SHORT, OSCILLATES)], 2)
          : result([trajectory(LONG, OSCILLATES)], 1),
      ),
    );

    // Note: MIN_CLAIM_LENGTH is NOT among the swept values here.
    const report = await measureClaimLength('https://example.test', [10, 20]);

    expect(report.measurements.map((m) => m.minClaimLength)).toEqual([10, 20]);
    for (const m of report.measurements) {
      expect(m.admitted.map((a) => a.claim)).toEqual([SHORT]);
    }
    // The production threshold was measured anyway, to be the baseline.
    expect(detect).toHaveBeenCalledWith('https://example.test', MIN_CLAIM_LENGTH);
  });

  it('measures the production threshold exactly once when it is also swept', async () => {
    // Re-running it would pull ~2 MB of archived text a second time for a
    // byte-identical answer, on a script that already runs a full sweep.
    detect.mockResolvedValue(result([trajectory(LONG, OSCILLATES)], 1));

    await measureClaimLength('https://example.test', [MIN_CLAIM_LENGTH]);

    const atProduction = detect.mock.calls.filter((c) => c[1] === MIN_CLAIM_LENGTH);
    expect(atProduction).toHaveLength(1);
  });

  it('sweeps in ascending order however the thresholds are given', async () => {
    detect.mockResolvedValue(result([], 0));
    const report = await measureClaimLength('https://example.test', [40, 0, 20]);
    expect(report.measurements.map((m) => m.minClaimLength)).toEqual([0, 20, 40]);
  });

  it('carries the thresholds a reader needs to interpret the numbers', async () => {
    detect.mockResolvedValue(result([], 0));
    const report = await measureClaimLength('https://example.test', [0]);
    expect(report.productionThreshold).toBe(MIN_CLAIM_LENGTH);
    expect(report.minTransitions).toBe(MIN_TRANSITIONS);
  });
});

// ---------------------------------------------------------------------------
// CONTAINMENT — the hazard the length threshold only approximates.
//
// Presence is a verbatim substring search over each capture. So when one
// candidate is a substring of another, the shorter one is "present" every time
// the longer is — not because it was asserted, but because its characters are
// inside the other's text. Its trajectory then reports movement belonging to
// something else.
//
// Being contained is NOT the verdict, and that is the whole point of the second
// number. A claim that appears in even one capture where no container does is
// carrying its own signal, however short it is and however many phrases embed it
// elsewhere. Only "contained AND never independent" is derivative.
// ---------------------------------------------------------------------------

const CONTAINER = 'מי יכולים לקבל חיסון רביעי';
const CONTAINED = 'חיסון רביעי';

describe('containment, and whether a claim ever speaks for itself', () => {
  it('marks a claim DERIVATIVE when every sighting sits inside a container', async () => {
    // Identical presence vectors: the short claim is never seen without the long
    // one, so nothing about its trajectory is its own.
    detect.mockImplementation((_url, min) =>
      Promise.resolve(
        min < MIN_CLAIM_LENGTH
          ? result(
              [trajectory(CONTAINER, OSCILLATES), trajectory(CONTAINED, OSCILLATES)],
              2,
            )
          : result([trajectory(CONTAINER, OSCILLATES)], 1),
      ),
    );

    const report = await measureClaimLength('https://example.test', [0, MIN_CLAIM_LENGTH]);
    const admitted = report.measurements[0]?.admitted ?? [];

    expect(admitted).toHaveLength(1);
    expect(admitted[0]).toMatchObject({
      claim: CONTAINED,
      containedInCandidates: 1,
      capturesWhereIndependent: 0,
    });
    expect(isDerivative(admitted[0]!)).toBe(true);
  });

  it('does NOT mark it derivative when it appears where no container does', async () => {
    // One capture holds the short claim and not the long one. That single
    // observation is the claim speaking for itself, and it is the difference
    // between an artifact and a finding.
    detect.mockImplementation((_url, min) =>
      Promise.resolve(
        min < MIN_CLAIM_LENGTH
          ? result(
              [
                trajectory(CONTAINER, [true, false, false, false]),
                trajectory(CONTAINED, [true, false, true, false]),
              ],
              2,
            )
          : result([trajectory(CONTAINER, [true, false, false, false])], 1),
      ),
    );

    const report = await measureClaimLength('https://example.test', [0, MIN_CLAIM_LENGTH]);
    const admitted = report.measurements[0]?.admitted ?? [];

    expect(admitted[0]).toMatchObject({
      claim: CONTAINED,
      containedInCandidates: 1,
      capturesWhereIndependent: 1,
    });
    expect(isDerivative(admitted[0]!)).toBe(false);
  });

  it('an uncontained short claim is never derivative — the reporting-link shape', async () => {
    // `לדיווח על תופעות לוואי >` is 24 characters and nothing in the corpus
    // contains it. Length filters it out; containment does not, and that is the
    // entire argument for measuring the right thing.
    detect.mockImplementation((_url, min) =>
      Promise.resolve(
        min < MIN_CLAIM_LENGTH
          ? result([trajectory(LONG, CONSTANT), trajectory(SHORT, OSCILLATES)], 2)
          : result([trajectory(LONG, CONSTANT)], 1),
      ),
    );

    const report = await measureClaimLength('https://example.test', [0, MIN_CLAIM_LENGTH]);
    const admitted = report.measurements[0]?.admitted ?? [];

    expect(admitted[0]).toMatchObject({ containedInCandidates: 0, capturesWhereIndependent: 2 });
    expect(isDerivative(admitted[0]!)).toBe(false);
  });

  it('counts containers that never move — a still container still explains a sighting', async () => {
    // The container has zero transitions, so it never surfaces as a trajectory.
    // Measuring containment against surfacing claims only would miss it entirely
    // and report the contained claim as independent.
    detect.mockImplementation((_url, min) =>
      Promise.resolve(
        min < MIN_CLAIM_LENGTH
          ? result([trajectory(CONTAINER, CONSTANT), trajectory(CONTAINED, OSCILLATES)], 2)
          : result([], 0),
      ),
    );

    const report = await measureClaimLength('https://example.test', [0, MIN_CLAIM_LENGTH]);
    const admitted = report.measurements[0]?.admitted ?? [];

    expect(admitted[0]).toMatchObject({
      claim: CONTAINED,
      containedInCandidates: 1,
      // Present in captures 0 and 2; the container is present in all four.
      capturesWhereIndependent: 0,
    });
  });

  it('does not treat a claim as containing itself', async () => {
    detect.mockImplementation((_url, min) =>
      Promise.resolve(
        min < MIN_CLAIM_LENGTH
          ? result([trajectory(SHORT, OSCILLATES)], 1)
          : result([], 0),
      ),
    );

    const report = await measureClaimLength('https://example.test', [0, MIN_CLAIM_LENGTH]);
    expect(report.measurements[0]?.admitted[0]?.containedInCandidates).toBe(0);
  });
});
