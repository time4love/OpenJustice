import {
  MIN_CLAIM_LENGTH,
  MIN_TRANSITIONS,
  detectAtClaimLength,
  type DetectedTrajectory,
} from './claimTrajectory';

// ---------------------------------------------------------------------------
// WHAT WOULD `MIN_CLAIM_LENGTH` COST, AND WHAT WOULD IT BUY?
//
// The plan carries this constant forward as "the same length-as-significance
// assumption that had to be removed from the diff classifier". THE CODE AND THE
// TRUNCATION PLAN BOTH DISAGREE, and they are right: the diff floor discarded
// changes for being short, which is significance; this one exists because a
// short string is an UNRELIABLE SUBSTRING PROBE. "החיסון בטוח" occurring in a
// later capture says nothing about whether the specific assertion survived — it
// may be four words inside an unrelated sentence. That is precision, not
// significance, and the two license different fixes.
//
// So the question is not "is 40 principled?" but "what does the corpus actually
// hold below it?" — and the answer has to be measured. Level 4 sits deferred in
// this same plan because its rationale was falsified by exactly this kind of
// pass: the mechanism it named turned out to be 13% and 21% of the contradicted
// excerpts, and every variant measured WORSE than leaving it alone. Lowering a
// threshold first and measuring second would repeat that in a subsystem where
// the change also bumps DETECTION_VERSION and recomputes every trajectory.
//
// WHAT THIS REPORTS, AND WHY THE LAST COLUMN IS THE POINT. Counts alone cannot
// settle it: "27 more trajectories" is not evidence they are real. So every
// newly surfacing claim is printed VERBATIM with the two numbers that separate
// the failure mode from the finding —
//
//   presentIn ≈ every capture, yet transitions > 0
//        the incidental-match signature: the words recur in unrelated passages
//        and presence flickers with the surrounding prose
//   presentIn a contiguous run, then absent
//        a real withdrawal, which is exactly what this platform exists to catch
//
// A researcher reads those and decides. This tool does not lower the threshold,
// does not recommend a value, and writes nothing.
// ---------------------------------------------------------------------------

/** A claim that surfaces at a lower threshold and does not at the current one. */
export interface AdmittedClaim {
  claim: string;
  length: number;
  transitions: number;
  /** Captures whose archived text contains it. */
  presentIn: number;
  /** Where it ends up — a REMOVED short claim is the case worth reading first. */
  finalState: 'PRESENT' | 'REMOVED';
}

export interface ThresholdMeasurement {
  minClaimLength: number;
  candidatesConsidered: number;
  /** Extracted quotes matching no capture — usually a paraphrase, never stored. */
  candidatesUnmatched: number;
  /** Trajectories detected at all, including 0- and 1-transition ones. */
  trajectoriesDetected: number;
  /** Those a reader would actually see, at MIN_TRANSITIONS. */
  surfacing: number;
  /** Surfacing here and NOT at the production threshold. Empty at or above it. */
  admitted: AdmittedClaim[];
}

export interface ClaimLengthReport {
  url: string;
  snapshotsExamined: number;
  productionThreshold: number;
  minTransitions: number;
  measurements: ThresholdMeasurement[];
}

/** The thresholds swept when none are named. */
export const DEFAULT_THRESHOLDS: readonly number[] = [0, 10, 20, 30, 40];

function surfacingHashes(trajectories: readonly DetectedTrajectory[]): Set<string> {
  // `claimHash` is carried on the trajectory rather than recomputed — the hash
  // is the claim's identity across passes, and hashing the text again here would
  // be a second definition of that identity.
  return new Set(
    trajectories.filter((t) => t.transitions >= MIN_TRANSITIONS).map((t) => t.claimHash),
  );
}

export async function measureClaimLength(
  url: string,
  thresholds: readonly number[] = DEFAULT_THRESHOLDS,
): Promise<ClaimLengthReport> {
  // The BASELINE is the production threshold, measured first and always —
  // "admitted" means nothing without the set it is admitted against, and
  // deriving that set from whichever threshold happened to be swept first would
  // silently change what the column means.
  const baseline = await detectAtClaimLength(url, MIN_CLAIM_LENGTH);
  const baselineSurfacing = surfacingHashes(baseline.trajectories);

  const measurements: ThresholdMeasurement[] = [];
  let snapshotsExamined = baseline.snapshotsExamined;

  for (const threshold of [...thresholds].sort((a, b) => a - b)) {
    const at =
      threshold === MIN_CLAIM_LENGTH ? baseline : await detectAtClaimLength(url, threshold);
    snapshotsExamined = at.snapshotsExamined;

    const surfacing = at.trajectories.filter((t) => t.transitions >= MIN_TRANSITIONS);
    measurements.push({
      minClaimLength: threshold,
      candidatesConsidered: at.candidatesConsidered,
      candidatesUnmatched: at.candidatesUnmatched,
      trajectoriesDetected: at.trajectories.length,
      surfacing: surfacing.length,
      admitted: surfacing
        .filter((t) => !baselineSurfacing.has(t.claimHash))
        .map((t) => ({
          claim: t.claimText,
          length: t.claimText.length,
          transitions: t.transitions,
          presentIn: t.observations.filter((o) => o.present).length,
          finalState: t.finalState,
        }))
        .sort((a, b) => a.length - b.length),
    });
  }

  return {
    url,
    snapshotsExamined,
    productionThreshold: MIN_CLAIM_LENGTH,
    minTransitions: MIN_TRANSITIONS,
    measurements,
  };
}
