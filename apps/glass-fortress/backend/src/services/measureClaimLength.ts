import {
  MIN_TRANSITIONS,
  detectAtClaimLength,
  containmentOf,
  type DetectedTrajectory,
} from './claimTrajectory';

/**
 * The length threshold production used until DETECTION_VERSION v2 retired it.
 *
 * Kept HERE and nowhere else: this tool exists to say what that rule cost, so it
 * needs the number, and no production path may read it again.
 */
const RETIRED_LENGTH_THRESHOLD = 40;

// ---------------------------------------------------------------------------
// WHAT WOULD `RETIRED_LENGTH_THRESHOLD` COST, AND WHAT WOULD IT BUY?
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
  /**
   * OTHER CANDIDATES THAT CONTAIN THIS ONE AS A SUBSTRING.
   *
   * The precise form of the hazard `RETIRED_LENGTH_THRESHOLD` approximates. A contained
   * claim is found by the presence probe whenever any containing phrase is
   * present, so its observations are the UNION of theirs and its trajectory can
   * be an artifact of movement that belongs to something else.
   */
  containedInCandidates: number;
  /**
   * CAPTURES WHERE IT APPEARS AND NO CONTAINING CANDIDATE DOES.
   *
   * The measure that actually decides it, and the reason counting containers is
   * not enough. Being contained is only a hazard if every observation is
   * explained by a container: a claim that shows up somewhere none of them do is
   * carrying its own signal, however short it is and however many phrases
   * happen to embed it elsewhere.
   *
   * Zero here, with containers present, means the trajectory is DERIVATIVE —
   * every sighting is inside another claim's text.
   */
  capturesWhereIndependent: number;
}

/** True when every sighting of a contained claim is inside a container's text. */
export function isDerivative(c: AdmittedClaim): boolean {
  return c.containedInCandidates > 0 && c.capturesWhereIndependent === 0;
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
  const baseline = await detectAtClaimLength(url, RETIRED_LENGTH_THRESHOLD);
  const baselineSurfacing = surfacingHashes(baseline.trajectories);

  const measurements: ThresholdMeasurement[] = [];
  let snapshotsExamined = baseline.snapshotsExamined;

  for (const threshold of [...thresholds].sort((a, b) => a - b)) {
    const at =
      threshold === RETIRED_LENGTH_THRESHOLD ? baseline : await detectAtClaimLength(url, threshold);
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
        // Containment is measured against EVERY detected candidate at this
        // threshold, not only the surfacing ones: a container that never moves
        // still explains a sighting, and is exactly the case that makes a short
        // claim's flicker look like movement of its own.
        .map((t) => admittedClaim(t, at.trajectories))
        .sort((a, b) => a.length - b.length),
    });
  }

  return {
    url,
    snapshotsExamined,
    productionThreshold: RETIRED_LENGTH_THRESHOLD,
    minTransitions: MIN_TRANSITIONS,
    measurements,
  };
}


function admittedClaim(
  claim: DetectedTrajectory,
  all: readonly DetectedTrajectory[],
): AdmittedClaim {
  // THE PRODUCTION RULE, not a copy of it. Detection filters on
  // `isDerivativeTrajectory`, which is defined over this same function — so this
  // tool cannot report one thing while the pipeline does another.
  const { containers, capturesWhereIndependent } = containmentOf(claim, all);

  return {
    claim: claim.claimText,
    length: claim.claimText.length,
    transitions: claim.transitions,
    presentIn: claim.observations.filter((o) => o.present).length,
    finalState: claim.finalState,
    containedInCandidates: containers.length,
    capturesWhereIndependent,
  };
}

/**
 * ONE CLAIM, AND THE CAPTURES WHERE IT SPEAKS FOR ITSELF.
 *
 * The sweep reports `capturesWhereIndependent` as a count, which settles every
 * case but one: `למפת מוקדי החיסון >` is independent in exactly 1 capture of 56,
 * on both corpora. A single observation is not wrong, it is WEAK, and no
 * threshold decides it honestly — a bar anywhere between 2 and 17 partitions
 * this corpus identically, so the number would be doing no work.
 *
 * So this names the capture instead. The output is a Wayback URL and a claim: an
 * outsider can open it and search, which is the standard the whole trajectory
 * subsystem exists to meet. It also distinguishes the two readings a count
 * cannot — a genuine independent sighting, versus a truncated capture where the
 * container is missing because half the page is.
 */
export interface ClaimInspection {
  claim: string;
  presentIn: number;
  /** Every other candidate containing this claim, with how often it appears. */
  containers: { claim: string; presentIn: number }[];
  /** The captures where the claim appears and no container does. */
  independentCaptures: { snapshotDate: string; snapshotUrl: string }[];
}

export async function inspectClaim(
  url: string,
  claimText: string,
): Promise<ClaimInspection | null> {
  // Threshold 0: the claim under inspection is by definition below the
  // production one, and its containers may be any length.
  const at = await detectAtClaimLength(url, 0);
  const claim = at.trajectories.find((t) => t.claimText === claimText);
  if (claim === undefined) return null;

  const { containers } = containmentOf(claim, at.trajectories);
  const capturesWithContainer = new Set<string>();
  for (const container of containers) {
    for (const observation of container.observations) {
      if (observation.present) capturesWithContainer.add(observation.waybackTimestamp);
    }
  }

  return {
    claim: claim.claimText,
    presentIn: claim.observations.filter((o) => o.present).length,
    containers: containers.map((c) => ({
      claim: c.claimText,
      presentIn: c.observations.filter((o) => o.present).length,
    })),
    independentCaptures: claim.observations
      .filter((o) => o.present && !capturesWithContainer.has(o.waybackTimestamp))
      .map((o) => ({ snapshotDate: o.snapshotDate, snapshotUrl: o.snapshotUrl })),
  };
}
