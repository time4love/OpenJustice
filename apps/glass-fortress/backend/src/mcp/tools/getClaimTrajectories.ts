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
// Results are grouped by shared movement. Page edits happen in blocks, so a
// section added and later removed yields one trajectory per paragraph inside it:
// the first real run on corona.health.gov.il reported 47 trajectories that were
// only 15 events, ten of them sharing a single pattern. Reporting them
// separately would let a reader mistake one block edit for ten findings.
//
// The grouping is also the stronger claim. "Eight assertions about infant
// vaccination safety appeared together on 5 August and vanished together on
// 6 September" is much harder to explain as routine editing than eight
// unrelated paragraph removals.
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
    // The finding count is the number of GROUPS. claimsTracked is how many
    // individual assertions those groups contain, and is much larger because
    // pages are edited in blocks.
    findingCount: result.groups.length,
    claimsTracked: result.trajectories.length,
    explanation:
      result.groups.length > 0
        ? 'Each finding is a set of claims that moved as a unit — identical presence across every ' +
          'archived snapshot. Only the flips are listed; the stretches between them are unchanged. ' +
          'Verify any of it by opening the snapshot URLs and searching for the claim text: this is ' +
          'computed by string search over the archived pages, with no AI judgment involved.'
        : 'No claim on this page appeared and disappeared more than once. Pass minTransitions: 1 to see single removals.',
    findings: result.groups.map((g) => ({
      patternHash: g.patternHash,
      transitions: g.transitions,
      firstSeen: g.firstSeen,
      lastSeen: g.lastSeen,
      finalState: g.finalState,
      claimCount: g.claims.length,
      changes: g.changes,
      claims: g.claims,
    })),
  });
}
