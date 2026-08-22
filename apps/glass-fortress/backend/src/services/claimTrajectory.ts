import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { parseDiffItems } from '../lib/diffItems';

// ---------------------------------------------------------------------------
// Following one claim across a page's whole archived history.
//
// A diff compares two snapshots. A trajectory follows a single assertion across
// all of them, which is the only way a pattern like "removed, restored, removed,
// restored, removed, never returned" becomes visible — every diff containing
// that claim sees just its own step.
//
// Detection is DETERMINISTIC on purpose. No model is involved, and that is the
// point: the result is reproducible (unlike everything else in this pipeline,
// which we measured drifting 10 findings to 5 on identical input), complete (it
// sees the whole timeline where a per-diff prompt sees one vantage point), free,
// and — most importantly — verifiable by an outsider. "Open these archived
// snapshots and search for this string" is a check anyone can run, which is a
// different order of claim from a model asserting that something oscillated.
//
// Presence is therefore tested against UrlSnapshot.fullText, the archived page
// text, NOT against AI-extracted diff items. Extracted items would make a
// trajectory depend on extraction quality and drift whenever that prompt
// changed. Extraction is used only to DISCOVER which claims are worth
// following; the trajectory itself is a string search.
// ---------------------------------------------------------------------------

/**
 * Claims shorter than this are not followed.
 *
 * A short string ("החיסון בטוח") recurs incidentally across unrelated passages,
 * so its presence says nothing about a specific assertion surviving or being
 * withdrawn. The threshold buys precision at the cost of missing terse claims —
 * a trade worth revisiting once there are real trajectories to look at.
 */
const MIN_CLAIM_LENGTH = 40;

/**
 * Transitions required before a trajectory is stored.
 *
 * One transition is an ordinary removal or addition, already fully visible as a
 * diff — storing it would duplicate what the timeline shows. Two or more means
 * the claim came back, or went and returned and went again, which is the
 * pattern no single diff can express.
 */
const MIN_TRANSITIONS = 2;

/** Collapses whitespace so re-indented or re-wrapped text still matches itself. */
export function normaliseClaim(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function claimHash(normalised: string): string {
  return createHash('sha256').update(normalised, 'utf8').digest('hex');
}

export interface Observation {
  snapshotDate: string;
  waybackTimestamp: string;
  snapshotUrl: string;
  present: boolean;
}

export interface Trajectory {
  claimHash: string;
  claimText: string;
  observations: Observation[];
  transitions: number;
  firstSeen: string;
  lastSeen: string;
  finalState: 'PRESENT' | 'REMOVED';
}

/** Counts how many times presence flips across the ordered observations. */
function countTransitions(observations: readonly Observation[]): number {
  let transitions = 0;
  for (let i = 1; i < observations.length; i++) {
    if (observations[i].present !== observations[i - 1].present) transitions++;
  }
  return transitions;
}

export function buildTrajectory(
  normalisedClaim: string,
  snapshots: readonly { snapshotDate: string; waybackTimestamp: string; snapshotUrl: string; normalisedText: string }[],
): Trajectory | null {
  const observations: Observation[] = snapshots.map((s) => ({
    snapshotDate: s.snapshotDate,
    waybackTimestamp: s.waybackTimestamp,
    snapshotUrl: s.snapshotUrl,
    present: s.normalisedText.includes(normalisedClaim),
  }));

  const present = observations.filter((o) => o.present);
  // A claim that never appears in any archived snapshot is not a trajectory. It
  // usually means the extracted quote was paraphrased rather than verbatim.
  if (present.length === 0) return null;

  return {
    claimHash: claimHash(normalisedClaim),
    claimText: normalisedClaim,
    observations,
    transitions: countTransitions(observations),
    firstSeen: present[0].snapshotDate,
    lastSeen: present[present.length - 1].snapshotDate,
    finalState: observations[observations.length - 1].present ? 'PRESENT' : 'REMOVED',
  };
}

export interface ComputeResult {
  url: string;
  snapshotsExamined: number;
  candidatesConsidered: number;
  /** Candidate quotes that appear in no snapshot — usually paraphrased extractions. */
  candidatesUnmatched: number;
  trajectories: Trajectory[];
}

export async function computeClaimTrajectories(
  url: string,
  opts: { persist?: boolean; minTransitions?: number } = {},
): Promise<ComputeResult> {
  const minTransitions = opts.minTransitions ?? MIN_TRANSITIONS;

  const tracked = await prisma.trackedUrl.findUnique({
    where: { url },
    select: { id: true },
  });
  if (!tracked) throw new Error(`No tracked URL found for: ${url}`);

  const snapshotRows = await prisma.urlSnapshot.findMany({
    where: { trackedUrlId: tracked.id },
    orderBy: { snapshotDate: 'asc' },
    select: { snapshotDate: true, waybackTimestamp: true, snapshotUrl: true, fullText: true },
  });

  const snapshots = snapshotRows.map((s) => ({
    snapshotDate: s.snapshotDate,
    waybackTimestamp: s.waybackTimestamp,
    snapshotUrl: s.snapshotUrl,
    normalisedText: normaliseClaim(s.fullText),
  }));

  // Candidate discovery: every verbatim quote the classifier extracted, deduped
  // by content. This is the only place extraction is trusted, and only to decide
  // WHAT to look for — never whether it is there.
  const diffs = await prisma.urlVersionDiff.findMany({
    where: { trackedUrlId: tracked.id },
    select: { deletedText: true, addedText: true },
  });

  const candidates = new Map<string, string>();
  for (const diff of diffs) {
    for (const raw of [diff.deletedText, diff.addedText]) {
      for (const item of parseDiffItems(raw)) {
        const normalised = normaliseClaim(item.exactQuote);
        if (normalised.length < MIN_CLAIM_LENGTH) continue;
        candidates.set(claimHash(normalised), normalised);
      }
    }
  }

  const trajectories: Trajectory[] = [];
  let unmatched = 0;

  for (const normalised of candidates.values()) {
    const trajectory = buildTrajectory(normalised, snapshots);
    if (!trajectory) {
      unmatched++;
      continue;
    }
    if (trajectory.transitions < minTransitions) continue;
    trajectories.push(trajectory);
  }

  trajectories.sort((a, b) => b.transitions - a.transitions);

  if (opts.persist) {
    for (const t of trajectories) {
      // Identity is (trackedUrlId, claimHash) and both are content-derived, so
      // recomputation updates in place rather than accumulating duplicates.
      await prisma.claimTrajectory.upsert({
        where: { trackedUrlId_claimHash: { trackedUrlId: tracked.id, claimHash: t.claimHash } },
        update: {
          claimText: t.claimText,
          observations: JSON.stringify(t.observations),
          transitions: t.transitions,
          firstSeen: t.firstSeen,
          lastSeen: t.lastSeen,
          finalState: t.finalState,
        },
        create: {
          trackedUrlId: tracked.id,
          claimHash: t.claimHash,
          claimText: t.claimText,
          observations: JSON.stringify(t.observations),
          transitions: t.transitions,
          firstSeen: t.firstSeen,
          lastSeen: t.lastSeen,
          finalState: t.finalState,
        },
      });
    }
  }

  return {
    url,
    snapshotsExamined: snapshots.length,
    candidatesConsidered: candidates.size,
    candidatesUnmatched: unmatched,
    trajectories,
  };
}
