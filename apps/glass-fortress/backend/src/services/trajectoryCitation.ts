import { prisma } from '../lib/prisma';
import { changeSpans, type Observation, type Trajectory } from './claimTrajectory';

// ---------------------------------------------------------------------------
// Resolving a cited claim trajectory (docs/gf-trajectory-citation-dev-plan.md).
//
// A thesis cites a ClaimTrajectory.id, which belongs to exactly one detection
// pass. That pins the citation: it resolves permanently to what was cited, even
// after the archive grows and the page is scanned again. claimHash would have
// been the obvious key and is the wrong one — it follows the claim across
// recomputations, so a thesis saying "removed and never restored" would quietly
// become false the day a later scan found the claim back.
//
// But pinning alone is not honest. So every resolution ALSO looks forward: it
// finds the newest computation for the same page and reports whether that pass
// still agrees with the one cited. Pinned for integrity, current for honesty,
// and both labelled — a superseded trajectory is a fact about the archive
// changing, not a defect in the thesis.
// ---------------------------------------------------------------------------

/**
 * What a rendered trajectory citation is allowed to claim.
 *
 * Trajectories are computed over UrlSnapshot.fullText, which is a Readability
 * extraction of the archived page, not the page. It discards a substantial
 * fraction of the document (measured at 31% of one real capture), mixing
 * boilerplate it is meant to drop with substantive sentences it is not. Two
 * consequences, and both are why this string exists:
 *
 *   - a change inside a discarded region is invisible to detection;
 *   - because Readability's boundaries follow page structure, a trajectory can
 *     show a flip that is a LAYOUT change rather than a content change.
 *
 * So a citation says what the extraction contained and links the capture, and
 * never says what the page contained. Getting this wrong would give an
 * extraction artifact the authority of a forensic finding, on the one layer the
 * platform presents as requiring no trust.
 */
export const TRAJECTORY_EXTRACTION_CAVEAT =
  'Computed by string search over the archived TEXT EXTRACTION of each capture, not over the page ' +
  'itself. The extraction discards part of every page, so a claim can be absent from it while ' +
  'present on the page, and a flip can reflect a layout change rather than an edit. Open the ' +
  'linked capture and check the page before relying on this.';

/** One presence flip: the snapshot at which the claim appeared or disappeared. */
export interface Flip {
  waybackTimestamp: string;
  snapshotDate: string;
  present: boolean;
}

export type TrajectoryCurrency =
  /** The cited pass is still the newest pass for this page. */
  | { state: 'PINNED_IS_LATEST'; computedAt: string }
  /** A newer pass exists and tells the same story. */
  | { state: 'RECOMPUTED_AGREES'; latestComputationId: string; latestComputedAt: string; latestSnapshotsExamined: number }
  /** A newer pass exists and tells a different one. Advisory — the researcher decides. */
  | {
      state: 'RECOMPUTED_DISAGREES';
      latestComputationId: string;
      latestComputedAt: string;
      latestSnapshotsExamined: number;
      /** Plain statement of what changed, for a check summary or a chip. */
      difference: string;
      latestFinalState: 'PRESENT' | 'REMOVED';
      latestFlips: Flip[];
    }
  /**
   * A newer pass exists but does not follow this claim at all — candidate
   * discovery no longer surfaces it (a reclassification can do this). Silence,
   * not disagreement: the newer pass makes no statement to contradict the
   * cited one.
   */
  | { state: 'NOT_FOLLOWED_BY_LATEST'; latestComputationId: string; latestComputedAt: string };

export interface ResolvedTrajectoryCitation {
  /** The cited ClaimTrajectory.id. */
  id: string;
  claimHash: string;
  claimText: string;
  url: string;
  trackedUrlId: string;
  /** Every snapshot examined, in order — the absences are half the finding. */
  observations: Observation[];
  /** The flips only; the stretches between them are where nothing happened. */
  changes: Observation[];
  transitions: number;
  firstSeen: string;
  lastSeen: string;
  finalState: 'PRESENT' | 'REMOVED';
  /** The pass this citation is pinned to. */
  computation: {
    id: string;
    sourceStateHash: string;
    detectionVersion: string;
    computedAt: string;
    snapshotsExamined: number;
  };
  /**
   * The claims that moved identically to this one within the pinned pass — the
   * co-movement, which is the stronger evidentiary claim. Regrouped at read
   * time by the same pure function used at detection; nothing unstable is
   * stored, because patternHash changes whenever a snapshot is added.
   */
  coMovement: {
    patternHash: string;
    claimCount: number;
    members: { id: string; claimText: string; cited: boolean }[];
  };
  currency: TrajectoryCurrency;
  caveat: string;
}

export interface TrajectoryCitationResolution {
  resolved: ResolvedTrajectoryCitation[];
  /** Cited ids that no longer exist. A stale citation, and the gate says so. */
  missing: string[];
}

/** The presence flips, as (snapshot, present) pairs. */
export function flipSequence(observations: readonly Observation[]): Flip[] {
  return changeSpans(observations).map((o) => ({
    waybackTimestamp: o.waybackTimestamp,
    snapshotDate: o.snapshotDate,
    present: o.present,
  }));
}

/**
 * Does a later pass still tell the same story as the cited one?
 *
 * The comparison is the FLIP SEQUENCE, not patternHash. patternHash is a hash of
 * the presence vector, so it changes the moment a capture is added — comparing
 * it would report "recomputed since cited" on every scan, including the ordinary
 * case where a new capture simply continues an unchanged history. An advisory
 * that fires every time is an advisory nobody reads.
 *
 * Agreement therefore means BOTH of:
 *
 *   - the cited flip sequence is a PREFIX of the later one — the history up to
 *     the point that was cited is unchanged; and
 *   - the final states match — the claim has not come back (or gone away) since.
 *
 * Appending a capture where nothing changed adds no flip, so it agrees. A claim
 * that returns adds a flip and changes the final state, so it disagrees. A
 * capture backfilled into the middle of the history, or a re-fetch that changes
 * an old presence, breaks the prefix, so it disagrees — which is right: that is
 * the history itself being rewritten.
 */
export function trajectoriesAgree(
  cited: { observations: readonly Observation[]; finalState: 'PRESENT' | 'REMOVED' },
  latest: { observations: readonly Observation[]; finalState: 'PRESENT' | 'REMOVED' },
): { agrees: true } | { agrees: false; difference: string } {
  const citedFlips = flipSequence(cited.observations);
  const latestFlips = flipSequence(latest.observations);

  const isPrefix =
    citedFlips.length <= latestFlips.length &&
    citedFlips.every(
      (f, i) => f.waybackTimestamp === latestFlips[i].waybackTimestamp && f.present === latestFlips[i].present,
    );

  if (!isPrefix) {
    return {
      agrees: false,
      difference:
        'The history up to the cited point is no longer the same: the later pass reports different ' +
        'flips, so a capture was backfilled or a snapshot re-fetched. The cited pass still stands as ' +
        'a record of what the archive said when it was cited.',
    };
  }

  if (cited.finalState !== latest.finalState) {
    const extra = latestFlips.slice(citedFlips.length);
    const when = extra[0]?.snapshotDate;
    return {
      agrees: false,
      difference:
        `The claim was ${cited.finalState} when cited and is ${latest.finalState} in the latest pass` +
        (when ? `, changing at the ${when} capture.` : '.'),
    };
  }

  return { agrees: true };
}

/** Rows of one computation, shaped for grouping. */
function toTrajectory(row: {
  id: string;
  claimHash: string;
  claimText: string;
  observations: string;
  transitions: number;
  firstSeen: string;
  lastSeen: string;
  finalState: 'PRESENT' | 'REMOVED';
}): Trajectory {
  return {
    id: row.id,
    claimHash: row.claimHash,
    claimText: row.claimText,
    observations: JSON.parse(row.observations) as Observation[],
    transitions: row.transitions,
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
    finalState: row.finalState,
  };
}

interface LatestComputation {
  id: string;
  computedAt: Date;
  snapshotsExamined: number;
}

/** A sibling as the co-movement needs it: who it is, and how it moved. */
interface SiblingRow {
  id: string;
  claimText: string;
  patternHash: string;
}

/**
 * The members of one computation, memoised.
 *
 * Deliberately WITHOUT observations. Grouping used to recompute each row's
 * presence vector hash at read time, which meant loading every sibling's
 * eighty-three entry blob — 58 rows on the first real thesis — to answer "how
 * many claims moved as one unit". patternHash is now written once at detection
 * time by the same function grouping used, so the answer is a projection of
 * three short columns.
 *
 * Safe to cache without invalidation for the reason the schema note gives: a
 * computation is never updated in place, so its rows are fixed the moment it
 * exists. Bounded because a thesis cites a handful of passes and a process is
 * restarted on every deploy; the oldest entry is dropped rather than letting the
 * map grow without limit.
 */
const SIBLING_CACHE_LIMIT = 8;
const siblingCache = new Map<string, SiblingRow[]>();

async function loadSiblings(computationId: string): Promise<SiblingRow[]> {
  const cached = siblingCache.get(computationId);
  if (cached) return cached;

  const siblings = await prisma.claimTrajectory.findMany({
    where: { computationId },
    select: { id: true, claimText: true, patternHash: true },
  });

  if (siblingCache.size >= SIBLING_CACHE_LIMIT) {
    const oldest = siblingCache.keys().next().value;
    if (oldest !== undefined) siblingCache.delete(oldest);
  }
  siblingCache.set(computationId, siblings);
  return siblings;
}

const TRAJECTORY_ROW = {
  id: true,
  claimHash: true,
  claimText: true,
  observations: true,
  transitions: true,
  firstSeen: true,
  lastSeen: true,
  finalState: true,
} as const;

/**
 * Resolve cited ClaimTrajectory ids into everything a renderer or a check needs.
 *
 * Never returns a bare id for a client to resolve: a citation that arrives as an
 * opaque string is one the caller will render as an opaque string, and the whole
 * point of §3.3 is that the wording around a trajectory is load-bearing.
 */
export async function resolveTrajectoryCitations(ids: readonly string[]): Promise<TrajectoryCitationResolution> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { resolved: [], missing: [] };

  // The cited rows, with their observations: these are the ones actually
  // rendered, and they are the only blobs this path still reads.
  const rows = await prisma.claimTrajectory.findMany({
    where: { id: { in: unique } },
    select: {
      ...TRAJECTORY_ROW,
      patternHash: true,
      trackedUrlId: true,
      computation: {
        select: {
          id: true,
          sourceStateHash: true,
          detectionVersion: true,
          computedAt: true,
          snapshotsExamined: true,
        },
      },
      trackedUrl: { select: { url: true } },
    },
  });

  const found = new Set(rows.map((r) => r.id));
  const missing = unique.filter((id) => !found.has(id));

  // One read per cited computation, not per cited claim: a thesis citing an
  // eight-claim co-movement cites eight rows of the same pass. Memoised,
  // because a computation is immutable by construction — new state means a new
  // computation, never an edited one — so the grouping derived from it can
  // never go stale.
  const siblingsByComputation = new Map<string, SiblingRow[]>();
  for (const computationId of new Set(rows.map((r) => r.computation.id))) {
    siblingsByComputation.set(computationId, await loadSiblings(computationId));
  }

  // The newest pass per page, as METADATA ONLY.
  //
  // This used to pull every trajectory of the latest computation along with it —
  // fifty-eight rows, each carrying an eighty-three entry observations blob —
  // before discovering that the latest pass is usually the one being cited and
  // none of it was needed. Measured at 2.7s of the 8.5s a single thesis page
  // spent here. The rows are now fetched only when the passes actually differ,
  // and only for the claims the thesis cites.
  const latestByTrackedUrl = new Map<string, LatestComputation | null>();
  for (const trackedUrlId of new Set(rows.map((r) => r.trackedUrlId))) {
    const latest = await prisma.claimTrajectoryComputation.findFirst({
      where: { trackedUrlId },
      orderBy: { computedAt: 'desc' },
      select: { id: true, computedAt: true, snapshotsExamined: true },
    });
    latestByTrackedUrl.set(trackedUrlId, latest);
  }

  // Counterparts, only where the cited pass is not the newest one.
  const citedComputationIds = new Set(rows.map((r) => r.computation.id));
  const staleTrackedUrlIds = [...latestByTrackedUrl.entries()]
    .filter(([, latest]) => latest !== null && !citedComputationIds.has(latest.id))
    .map(([trackedUrlId]) => trackedUrlId);
  const counterpartsByComputation = new Map<string, Map<string, Trajectory>>();
  for (const trackedUrlId of staleTrackedUrlIds) {
    const latest = latestByTrackedUrl.get(trackedUrlId);
    if (!latest) continue;
    const citedHashes = rows.filter((r) => r.trackedUrlId === trackedUrlId).map((r) => r.claimHash);
    const counterparts = await prisma.claimTrajectory.findMany({
      where: { computationId: latest.id, claimHash: { in: citedHashes } },
      select: TRAJECTORY_ROW,
    });
    counterpartsByComputation.set(
      latest.id,
      new Map(counterparts.map((c) => [c.claimHash, toTrajectory(c)])),
    );
  }

  const citedIds = new Set(unique);

  const resolved = rows.map((row): ResolvedTrajectoryCitation => {
    const self = toTrajectory(row);
    const siblings = siblingsByComputation.get(row.computation.id) ?? [];
    // The co-movement is every row of this pass sharing this row's movement —
    // read from the stored hash rather than recomputed from everyone's blobs.
    const members = siblings.filter((sibling) => sibling.patternHash === row.patternHash);

    return {
      id: row.id,
      claimHash: row.claimHash,
      claimText: row.claimText,
      url: row.trackedUrl.url,
      trackedUrlId: row.trackedUrlId,
      observations: self.observations,
      changes: changeSpans(self.observations),
      transitions: row.transitions,
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      finalState: row.finalState,
      computation: {
        id: row.computation.id,
        sourceStateHash: row.computation.sourceStateHash,
        detectionVersion: row.computation.detectionVersion,
        computedAt: row.computation.computedAt.toISOString(),
        snapshotsExamined: row.computation.snapshotsExamined,
      },
      coMovement: {
        patternHash: row.patternHash,
        claimCount: members.length || 1,
        members: (members.length > 0 ? members : [{ id: row.id, claimText: row.claimText }]).map((m) => ({
          id: m.id,
          claimText: m.claimText,
          cited: citedIds.has(m.id),
        })),
      },
      currency: currencyOf(
        self,
        { id: row.computation.id, computedAt: row.computation.computedAt.toISOString() },
        latestByTrackedUrl.get(row.trackedUrlId) ?? null,
        counterpartsByComputation,
      ),
      caveat: TRAJECTORY_EXTRACTION_CAVEAT,
    };
  });

  return { resolved, missing };
}

function currencyOf(
  cited: Trajectory,
  citedComputation: { id: string; computedAt: string },
  latest: LatestComputation | null,
  counterpartsByComputation: ReadonlyMap<string, ReadonlyMap<string, Trajectory>>,
): TrajectoryCurrency {
  // `latest` is null only if the cited row's own computation vanished between
  // the two reads. The cited pass is then the only pass we have, and its own
  // timestamp is the honest answer — never an empty date.
  if (!latest || latest.id === citedComputation.id) {
    return { state: 'PINNED_IS_LATEST', computedAt: citedComputation.computedAt };
  }

  const latestComputedAt = latest.computedAt.toISOString();
  const counterpart = counterpartsByComputation.get(latest.id)?.get(cited.claimHash);
  if (!counterpart) {
    return { state: 'NOT_FOLLOWED_BY_LATEST', latestComputationId: latest.id, latestComputedAt };
  }

  const comparison = trajectoriesAgree(cited, counterpart);
  if (comparison.agrees) {
    return {
      state: 'RECOMPUTED_AGREES',
      latestComputationId: latest.id,
      latestComputedAt,
      latestSnapshotsExamined: latest.snapshotsExamined,
    };
  }

  return {
    state: 'RECOMPUTED_DISAGREES',
    latestComputationId: latest.id,
    latestComputedAt,
    latestSnapshotsExamined: latest.snapshotsExamined,
    difference: comparison.difference,
    latestFinalState: counterpart.finalState,
    latestFlips: flipSequence(counterpart.observations),
  };
}

/**
 * Labels for trajectory chips, and the ids that do not exist.
 *
 * A draft tool checks `unknown` before writing. A citation naming a row that
 * was never there is a typo, and catching it at publication time — where the
 * gate would — means the mistake is found long after the paragraph that made it
 * was written.
 */
export async function loadTrajectoryCitationLabels(
  ids: readonly string[],
): Promise<{ labels: Map<string, string>; unknown: string[] }> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { labels: new Map(), unknown: [] };

  const rows = await prisma.claimTrajectory.findMany({
    where: { id: { in: unique } },
    select: { id: true, claimText: true },
  });

  const labels = new Map(rows.map((r) => [r.id, r.claimText.slice(0, 40)]));
  return { labels, unknown: unique.filter((id) => !labels.has(id)) };
}
