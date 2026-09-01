// ---------------------------------------------------------------------------
// LEVEL 4 — THE ADAPTIVE HALF OF THE NEXT-CAPTURE POLICY.
//
// The stratified half was decided and built (`timelineSample.ts`): spread the
// sample across the whole history rather than taking the first N. This is the
// half the plan left open — *"reaching for captures likely to DISAGREE"* — and
// until 2026-09-01 it had no purpose beyond that sentence, because nobody knew
// what disagreement looked like.
//
// NOW IT DOES, AND THE PURPOSE IS SETTLED: find where a ruleset STOPS APPLYING.
//
// Measured that day on the Walla news page, one unchanged ruleset against three
// captures of the same document:
//
//     2020-12-09   19 of 21 selectors matched   74% removed   text correct
//     2020-12-18   16 of 21                     68%           text correct
//     2025-03-26    3 of 21                      1%           TEXT WRONG
//
// The decay is along the TIME axis, and it is not gradual — it is a boundary.
// So the policy is not "sample more" but "find the boundary", and the cheapest
// way to find a boundary in an ordered set is to reach for the point furthest
// from everything already known, then bisect.
//
// MAXIMIN DISTANCE, AND WHY IT IS THE RIGHT SHAPE. Pick the unjudged capture
// whose nearest judged neighbour is furthest away. With one capture judged that
// is the opposite end of the history — which is precisely the click that found
// this page's boundary. With both ends judged it is the midpoint, and each
// subsequent pick halves the widest unexplored interval. A researcher hunting a
// boundary by hand does exactly this; four clicks located one.
//
// NO PARSING, NO CLASSIFIER, NO CORPUS STATISTIC. The policy reads dates and
// nothing else. That matters: this level has twice rejected a corpus-derived
// frequency signal and a model confidence score, and an adaptive sampler that
// scored captures for "chrome-likeness" would be the third attempt at the same
// idea. Choosing WHERE TO LOOK is not choosing WHAT IS FURNITURE — the human
// still decides that, on every capture this returns.
// ---------------------------------------------------------------------------

/** A capture the policy may choose between. Ordered by `capturedAt` by the caller. */
export interface CandidateCapture {
  snapshotId: string;
  capturedAt: Date;
}

export interface NextCapturePick {
  snapshotId: string;
  /**
   * Why this one, in words the researcher reads.
   *
   * THE REASON TRAVELS WITH THE PICK because the researcher can overrule it. A
   * policy that says only "look at this one" is a policy nobody can disagree
   * with usefully — and the plan is explicit that which capture to examine
   * stays reviewable.
   */
  reason: 'FIRST' | 'FURTHEST_FROM_JUDGED' | 'ONLY_REMAINING';
  /** Days to the nearest already-judged capture. Zero when nothing is judged. */
  daysFromNearestJudged: number;
}

const DAY_MS = 86_400_000;

/**
 * The next capture worth a human's attention, or null when none is left.
 *
 * Returns null rather than throwing on an exhausted sample: "there is nothing
 * left to show" is an answer, and the caller reports it as one.
 */
export function chooseNextCapture(
  sample: readonly CandidateCapture[],
  judgedIds: readonly string[],
): NextCapturePick | null {
  // SCOPED TO THE SAMPLE, and it has to be. A run may hold verdicts on captures
  // outside the current sample — a researcher who jumped to a date directly, or
  // a sample recomputed after new captures were stored. Counting those as
  // "something is judged" sends the policy into maximin with no in-sample
  // neighbour to measure against, every distance comes back zero, and it
  // silently degrades to "the earliest capture" — the exact bias the FIRST
  // branch exists to avoid.
  const judged = new Set(sample.filter((c) => judgedIds.includes(c.snapshotId)).map((c) => c.snapshotId));
  const remaining = sample.filter((c) => !judged.has(c.snapshotId));
  const first = remaining.at(0);
  if (first === undefined) return null;

  // THE MIDDLE, NOT THE EARLIEST, when nothing has been judged — the same
  // reasoning `stratifiedSample` uses for a sample of one. The first capture is
  // the page's earliest era, possibly a template that no longer exists, and
  // starting there biases the whole run toward a layout the page has left.
  if (judged.size === 0) {
    const middle = remaining.at(Math.floor((remaining.length - 1) / 2));
    /* istanbul ignore next -- `remaining` is non-empty, so the index is in range. */
    if (middle === undefined) return null;
    return { snapshotId: middle.snapshotId, reason: 'FIRST', daysFromNearestJudged: 0 };
  }

  if (remaining.length === 1) {
    return {
      snapshotId: first.snapshotId,
      reason: 'ONLY_REMAINING',
      daysFromNearestJudged: nearestJudgedDistance(first, sample, judged),
    };
  }

  // Maximin: the candidate whose nearest judged neighbour is furthest away.
  // Ties break toward the EARLIER capture, so the choice is deterministic and a
  // run can be replayed — the property `stratifiedSample` is also held to.
  let best = first;
  let bestDistance = -1;
  for (const candidate of remaining) {
    const distance = nearestJudgedDistance(candidate, sample, judged);
    if (distance > bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return {
    snapshotId: best.snapshotId,
    reason: 'FURTHEST_FROM_JUDGED',
    daysFromNearestJudged: bestDistance,
  };
}

/** Whole days from a candidate to the nearest judged capture in the sample. */
function nearestJudgedDistance(
  candidate: CandidateCapture,
  sample: readonly CandidateCapture[],
  judged: ReadonlySet<string>,
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const other of sample) {
    if (!judged.has(other.snapshotId)) continue;
    const gap = Math.abs(candidate.capturedAt.getTime() - other.capturedAt.getTime());
    if (gap < nearest) nearest = gap;
  }
  return nearest === Number.POSITIVE_INFINITY ? 0 : Math.round(nearest / DAY_MS);
}
