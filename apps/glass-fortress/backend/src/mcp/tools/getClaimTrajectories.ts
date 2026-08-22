import { z } from 'zod';
import { computeClaimTrajectories } from '../../services/claimTrajectory';

// ---------------------------------------------------------------------------
// get_claim_trajectories
//
// Every claim on a tracked page that was added and removed more than once.
//
// This is the finding no individual diff can express. A diff compares two
// snapshots; a trajectory follows one assertion across all of them, so a claim
// that was removed, restored and removed again reads as a pattern rather than
// as three unrelated edits.
//
// Computed on demand rather than read from storage. Detection is a string search
// against archived page text — deterministic, fast, and free — so precomputing
// would only create a second copy that could fall behind the snapshots it
// describes.
//
// Every result is checkable without trusting this platform: each observation
// carries the archived snapshot URL, so a reader can open it and search for the
// claim themselves. That is a different order of claim from a model asserting
// that something oscillated, and it is why detection was deliberately kept out
// of the LLM.
// ---------------------------------------------------------------------------

export const getClaimTrajectoriesSchema = {
  url: z.string().url().describe('The tracked URL to follow claims across'),
  minTransitions: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe(
      'How many times presence must flip before a claim is reported. Default 2 — one flip is an ' +
        'ordinary removal, already fully visible in the forensic timeline. Pass 1 to include those too.',
    ),
};

export async function getClaimTrajectoriesHandler(input: {
  url: string;
  minTransitions?: number;
}): Promise<string> {
  let result;
  try {
    result = await computeClaimTrajectories(input.url, {
      ...(input.minTransitions ? { minTransitions: input.minTransitions } : {}),
    });
  } catch (err) {
    return JSON.stringify({
      error: 'NOT_TRACKED',
      message: err instanceof Error ? err.message : String(err),
      explanation: 'Nothing has scanned this page. Run start_forensic_scan first.',
    });
  }

  return JSON.stringify({
    url: result.url,
    snapshotsExamined: result.snapshotsExamined,
    candidatesConsidered: result.candidatesConsidered,
    // Reported rather than hidden: candidates the archive never contained are
    // usually paraphrased extractions, and silently dropping them would make a
    // thin result look thorough.
    candidatesNotFoundInArchive: result.candidatesUnmatched,
    trajectoryCount: result.trajectories.length,
    explanation:
      result.trajectories.length > 0
        ? 'Each trajectory lists every archived snapshot examined and whether the claim was present. ' +
          'Verify any of them by opening the snapshot URLs and searching for the claim text — this is ' +
          'computed by string search, with no AI judgment involved.'
        : 'No claim on this page appeared and disappeared more than once. Pass minTransitions: 1 to see single removals.',
    trajectories: result.trajectories.map((t) => ({
      claimHash: t.claimHash,
      claimText: t.claimText,
      transitions: t.transitions,
      firstSeen: t.firstSeen,
      lastSeen: t.lastSeen,
      finalState: t.finalState,
      // Only the flips. The unchanged stretches between them are where nothing
      // happened, and listing all 80-odd snapshots per claim would bury the shape.
      changes: t.observations.filter((o, i) => i === 0 || o.present !== t.observations[i - 1].present),
    })),
  });
}
