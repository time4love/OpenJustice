import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { ARCHIVED_CAPTURES_ONLY, requireArchived } from '../lib/archivedCaptures';
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
 * REMOVED 2026-08-29, and replaced by the containment rule below.
 *
 * The rationale was sound and the instrument was wrong. A short string
 * ("החיסון בטוח") does recur incidentally across unrelated passages, so its
 * presence says nothing about a specific assertion — but LENGTH does not
 * identify which claims that happens to, and the corpus proved it:
 *
 *   independent claims spanned 12-37 characters
 *   derivative claims spanned 11-37 characters
 *
 * The two sets OVERLAP across the whole range, so no value of this constant
 * separated them. It was non-separating, not merely imprecise — and the claim it
 * cost was `לדיווח על תופעות לוואי >` (24 chars), the removal of the page's own
 * adverse-event reporting link, which is the finding this platform exists for.
 * It had no trajectory at all while this constant stood.
 *
 * Measured on both corpora: `forensics:measure-claim-length`, and
 * [[gf-claim-length-threshold-measured]].
 */
export const MIN_CLAIM_LENGTH_REMOVED_IN = 'v2-containment-not-length';

/**
 * Shortest quote matched to a trajectory BY CONTAINMENT rather than by identity.
 *
 * THE LAST LENGTH HEURISTIC IN THE TRAJECTORY PATH, and it is unmeasured. It
 * guards a genuinely different operation from the one the sweep measured: that
 * one asked whether a claim's own presence signal was real, and length turned out
 * non-separating for it. This one asks whether a diff item and a trajectory claim
 * are the SAME ASSERTION when their text merely overlaps.
 *
 * Kept because removing it fails in the direction that LOSES a finding — a false
 * containment match reports a classified item as covered when it is not. Exact
 * hash matching is unaffected and needs no floor: a hash match is identity, not
 * resemblance. If this is ever revisited, measure it first;
 * `forensics:measure-claim-length` is the tool for that shape.
 *
 * IT LIVES HERE, NOT AT ITS USE SITE, AND THAT PLACEMENT IS THE POINT.
 *
 * `MIN_CLAIM_LENGTH` was retired safely only because it was a shared exported
 * symbol: deleting it made the COMPILER name every dependent, and that is how
 * `trajectoryContext` — which carried the same 40 and would have hidden the
 * recovered reporting-link trajectory from every agent — was found at all. A
 * private literal at the use site would have been invisible to that.
 *
 * So the rule this file keeps is: a heuristic gets exactly ONE IMPORTABLE NAME.
 * Not merely one implementation — one SYMBOL, because a symbol is what the
 * compiler can enumerate. Two implementations of a rule are findable; two
 * anonymous literals of it are not.
 */
export const CONTAINMENT_MATCH_MIN_LENGTH = 40;

/**
 * Transitions required before a trajectory is stored.
 *
 * One transition is an ordinary removal or addition, already fully visible as a
 * diff — storing it would duplicate what the timeline shows. Two or more means
 * the claim came back, or went and returned and went again, which is the
 * pattern no single diff can express.
 */
export const MIN_TRANSITIONS = 2;

/** Collapses whitespace so re-indented or re-wrapped text still matches itself. */
export function normaliseClaim(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function claimHash(normalised: string): string {
  return createHash('sha256').update(normalised, 'utf8').digest('hex');
}

/**
 * Bump this on ANY change to how detection works.
 *
 * Deliberately NOT a list of named parameters. The first version of this
 * enumerated `normaliseClaim` and `MIN_CLAIM_LENGTH` — and missed the presence
 * test itself (`normalisedText.includes(normalisedClaim)`), which is detection
 * logic just as much as they are: swap it for fuzzy or positional matching and
 * every stored trajectory changes while an enumerating hash stays identical.
 *
 * Enumerating knobs is exactly the drift `classifierPromptHash` exists to
 * prevent one layer down, so this takes the same shape: one version covering the
 * whole detection procedure, bumped by whoever changes any part of it.
 *
 * Covers: normaliseClaim · the presence test · candidate eligibility · the
 * containment rule · anything else that decides what a trajectory IS.
 *
 * HELD BY `test/detectionVersionPinned.test.ts`, which hashes the bodies of the
 * functions that decide what a trajectory is. Changing any of them without
 * bumping this string fails the suite and names what moved. It cannot force a
 * CORRECT version — someone can update the pin without thinking — but it turns a
 * silent omission into a deliberate act, which is the same bargain
 * `classifierPromptHash` makes one layer down.
 *
 * v2 retired the length filter for `isDerivativeTrajectory`. Every stored v1
 * trajectory was decided by a rule that excluded `לדיווח על תופעות לוואי >`
 * outright, so no v1 computation describes the corpus under v2 — which is what
 * this version string is for. Old computations are NOT rewritten: a cited
 * trajectory still resolves to what was cited.
 */
export const DETECTION_VERSION = 'v2-collapse-ws-containment-substring-presence';

/**
 * The identity of the state a detection pass ran against.
 *
 * Three inputs, each of which can change without the others:
 *   - the ordered snapshot set   (a scan)
 *   - the candidate claim set    (a scan OR a reclassification)
 *   - the normaliser             (a deploy)
 *
 * Keying only on "has this URL been scanned" would serve stale trajectories
 * straight through a reclassification, which rewrites diff extraction without
 * touching the archive — the same class of error as deriving from a transition
 * rather than from state.
 */
export function computeSourceStateHash(input: {
  waybackTimestamps: readonly string[];
  candidateHashes: readonly string[];
  detectionVersion: string;
}): string {
  const payload = [
    `detection=${input.detectionVersion}`,
    `snapshots=${input.waybackTimestamps.join(',')}`,
    // Sorted: candidate discovery order is an artifact of diff iteration, not
    // part of the state. Two passes finding the same claims must hash alike.
    `candidates=${[...input.candidateHashes].sort().join(',')}`,
  ].join('\n');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export interface Observation {
  snapshotDate: string;
  waybackTimestamp: string;
  snapshotUrl: string;
  present: boolean;
}

/**
 * A trajectory as DETECTED — before it has been written, so before it has an id.
 *
 * Separate from `Trajectory` on purpose. A citation names a `ClaimTrajectory.id`
 * (docs/gf-trajectory-citation-dev-plan.md §3.1), so anything that leaves this
 * module must carry one; splitting the types makes an id-less result impossible
 * to shape rather than merely unlikely. The fresh-compute path used to return
 * exactly that, which is why `get_claim_trajectories` could not offer a citable
 * identifier at all.
 */
export interface DetectedTrajectory {
  claimHash: string;
  claimText: string;
  observations: Observation[];
  transitions: number;
  firstSeen: string;
  lastSeen: string;
  finalState: 'PRESENT' | 'REMOVED';
}

/** A detected trajectory that has been stored, and can therefore be cited. */
export interface Trajectory extends DetectedTrajectory {
  /**
   * ClaimTrajectory.id — the citable identity, belonging to exactly one
   * detection pass. NOT claimHash, which is stable across passes and would let
   * a citation silently change meaning when the archive grows.
   */
  id: string;
}

/**
 * IS THIS TRAJECTORY REPORTING MOVEMENT THAT BELONGS TO SOMETHING ELSE?
 *
 * Presence is a verbatim substring search, so when one candidate sits inside
 * another the shorter is "present" every time the longer is — not because it was
 * asserted, but because its characters are inside the other's text. Its
 * observations are then the UNION of its containers', and its flips are theirs.
 *
 * BEING CONTAINED IS NOT THE VERDICT, and that distinction is the whole rule. A
 * claim appearing in even ONE capture where no container does is carrying its own
 * signal, however short it is and however many phrases embed it elsewhere. Only
 * contained AND never independent is derivative.
 *
 * Measured: this admits 6 real claims that length excluded — the reporting link
 * among them — and excludes 12 artifacts that length admitted or excluded by
 * accident. The two sets overlap on length across the whole range, so no
 * character count could have done both.
 *
 * KEYED ON THE CAPTURE, not on position: lining two observation arrays up by
 * index assumes every trajectory was built over the same captures in the same
 * order, which is true today and enforced by nothing.
 */
export interface Containment {
  /** Other candidates whose text contains this claim's. */
  containers: DetectedTrajectory[];
  /** Captures where the claim appears and no container does. */
  capturesWhereIndependent: number;
}

export function containmentOf(
  claim: DetectedTrajectory,
  all: readonly DetectedTrajectory[],
): Containment {
  const containers = all.filter(
    (other) => other.claimHash !== claim.claimHash && other.claimText.includes(claim.claimText),
  );

  const capturesWithContainer = new Set<string>();
  for (const container of containers) {
    for (const observation of container.observations) {
      if (observation.present) capturesWithContainer.add(observation.waybackTimestamp);
    }
  }

  let capturesWhereIndependent = 0;
  for (const observation of claim.observations) {
    if (observation.present && !capturesWithContainer.has(observation.waybackTimestamp)) {
      capturesWhereIndependent++;
    }
  }

  return { containers, capturesWhereIndependent };
}

/**
 * The VERDICT, expressed over the measurement above so the two cannot drift.
 * `forensics:measure-claim-length` reports the numbers; detection reads the
 * boolean; both come from `containmentOf`.
 */
export function isDerivativeTrajectory(
  claim: DetectedTrajectory,
  all: readonly DetectedTrajectory[],
): boolean {
  const { containers, capturesWhereIndependent } = containmentOf(claim, all);
  return containers.length > 0 && capturesWhereIndependent === 0;
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
): DetectedTrajectory | null {
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

/**
 * Claims that moved as a unit — identical presence across every snapshot.
 *
 * Page edits happen in blocks, not paragraph by paragraph, so a section that is
 * added and later removed produces one trajectory per paragraph inside it. The
 * first real run reported 47 trajectories that were only 15 events: ten claims
 * shared a single pattern, and a reader had no way to tell that from ten
 * independent findings.
 *
 * Grouping is not merely noise reduction. "Eight assertions about infant
 * vaccination safety appeared together on 5 August and vanished together on
 * 6 September" is a materially harder thing to explain as routine editing than
 * eight separate paragraph removals — the co-movement IS the finding.
 */
export interface TrajectoryGroup {
  /** SHA-256 of the presence vector. Identical movement gives an identical id. */
  patternHash: string;
  /** The shared shape: the flips, each carrying how long its state held. */
  changes: ChangeSpan[];
  transitions: number;
  firstSeen: string;
  lastSeen: string;
  finalState: 'PRESENT' | 'REMOVED';
  /**
   * Every member of the group, each with its citable id.
   *
   * A thesis citing this co-movement cites ALL of these ids: the group itself
   * has no stable identity to cite, because patternHash is a hash of the
   * presence vector and changes the moment a snapshot is added.
   */
  claims: { id: string; claimHash: string; claimText: string }[];
}

export interface TrajectoryProvenance {
  /** Identity of the snapshot/candidate/normaliser state this was computed against. */
  sourceStateHash: string;
  detectionVersion: string;
  /** When the underlying detection pass ran — NOT when this call was served. */
  computedAt: string;
  /** False only on the pass that actually did the string searching. */
  fromCache: boolean;
}

export interface ComputeResult {
  url: string;
  snapshotsExamined: number;
  candidatesConsidered: number;
  /** Candidate quotes that appear in no snapshot — usually paraphrased extractions. */
  candidatesUnmatched: number;
  /**
   * Claims dropped because every sighting sat inside another claim's text.
   *
   * Surfaced, not swallowed: a reader comparing `candidatesConsidered` against
   * the trajectories returned would otherwise have an unexplained gap, and an
   * unexplained gap is how a filter comes to look like an absence of findings.
   */
  candidatesDerivative: number;
  trajectories: Trajectory[];
  /** The same trajectories, collapsed by shared movement. This is the finding count. */
  groups: TrajectoryGroup[];
  provenance: TrajectoryProvenance;
}

/**
 * The capture ordering trajectory detection depends on, defined once.
 *
 * ORDER IS SEMANTIC HERE, not presentational. buildTrajectory walks captures in
 * sequence to decide when a claim was present and when it was absent, so the
 * order of the rows IS the trajectory; and sourceStateHash is computed over the
 * resulting ordered array, so an unstable order makes the cache key unstable too.
 *
 * capturedAt, not snapshotDate. snapshotDate is a day-granular string, so every
 * capture sharing a day sorts EQUAL and Postgres may return them in any order.
 * That was survivable only because same-day captures with different text could
 * not exist: the scanner discarded any capture whose digest it had seen before,
 * which is precisely why staging's eight same-day groups all hold exactly one
 * distinct text today.
 *
 * Removing that discard (Level 1) removes the accident protecting this. The
 * tracked page returned to an earlier state twice within six hours on
 * 2022-06-22, so a rescan stores three captures with at least two distinct texts
 * under one snapshotDate — and detection could then walk them present→absent
 * →present or the reverse, giving different transition counts between runs while
 * the cache key claimed the state had not moved.
 */
const TRAJECTORY_CAPTURE_SCAN = { orderBy: { capturedAt: 'asc' } } as const;

/**
 * Everything needed to identify the state, WITHOUT touching snapshot fullText.
 *
 * Deliberately cheap: the whole point of the cache is that the ~2 MB of archived
 * page text and the thousands of substring searches over it are skipped when the
 * state has not moved. Loading fullText here to decide whether we need fullText
 * would defeat it.
 */
/**
 * `minClaimLength` DEFAULTS TO ZERO — production applies no length filter since
 * v2. It survives as a parameter only so `forensics:measure-claim-length` can
 * still ask what the retired rule would have done, through this code path rather
 * than a copy of it.
 *
 * It deliberately does NOT reach `sourceStateHash`'s inputs as a named field:
 * DETECTION_VERSION already covers candidate eligibility, and enumerating knobs
 * there is the mistake that hash's own comment records.
 */
async function loadDetectionInputs(url: string, minClaimLength = 0) {
  const tracked = await prisma.trackedUrl.findUnique({
    where: { url },
    select: { id: true },
  });
  if (!tracked) throw new Error(`No tracked URL found for: ${url}`);

  // Archived captures only. Trajectories key their sourceStateHash and their
  // stored points on the Archive timestamp, so widening this would change
  // DETECTION_VERSION's meaning and silently invalidate every cached
  // trajectory. Bringing non-archived captures into trajectory detection is
  // Level 6's decision, taken with a version bump and a full recomputation.
  const snapshotMeta = (
    await prisma.urlSnapshot.findMany({
      where: { trackedUrlId: tracked.id, ...ARCHIVED_CAPTURES_ONLY },
      ...TRAJECTORY_CAPTURE_SCAN,
      select: { snapshotDate: true, waybackTimestamp: true, snapshotUrl: true },
    })
  ).map((row) => requireArchived(row, 'claimTrajectory.loadDetectionInputs'));

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
        if (normalised.length < minClaimLength) continue;
        candidates.set(claimHash(normalised), normalised);
      }
    }
  }

  const sourceStateHash = computeSourceStateHash({
    waybackTimestamps: snapshotMeta.map((s) => s.waybackTimestamp),
    candidateHashes: [...candidates.keys()],
    detectionVersion: DETECTION_VERSION,
  });

  return { trackedUrlId: tracked.id, snapshotMeta, candidates, sourceStateHash };
}

type DetectionInputs = Awaited<ReturnType<typeof loadDetectionInputs>>;

/** The expensive half: pull archived text and search it. Only ever runs on a miss. */
async function detect(inputs: DetectionInputs) {
  // Archived captures only, in the same order — detect() searches the set that
  // sourceStateHash was computed over, so a wider or differently-ordered set
  // here would search text the cache key never saw. Both queries spread the
  // same TRAJECTORY_CAPTURE_SCAN rather than restating it, because "these must
  // stay identical" enforced by a comment is the control this repository has
  // now been burned by four times.
  const rows = (
    await prisma.urlSnapshot.findMany({
      where: { trackedUrlId: inputs.trackedUrlId, ...ARCHIVED_CAPTURES_ONLY },
      ...TRAJECTORY_CAPTURE_SCAN,
      select: { snapshotDate: true, waybackTimestamp: true, snapshotUrl: true, fullText: true },
    })
  ).map((row) => requireArchived(row, 'claimTrajectory.detect'));

  const snapshots = rows.map((r) => ({
    snapshotDate: r.snapshotDate,
    waybackTimestamp: r.waybackTimestamp,
    snapshotUrl: r.snapshotUrl,
    normalisedText: normaliseClaim(r.fullText),
  }));

  const trajectories: DetectedTrajectory[] = [];
  let unmatched = 0;

  for (const normalised of inputs.candidates.values()) {
    const trajectory = buildTrajectory(normalised, snapshots);
    // A claim matching no snapshot is not a trajectory — usually the extracted
    // quote was paraphrased rather than verbatim. Counted, never stored.
    if (!trajectory) {
      unmatched++;
      continue;
    }
    // EVERY detected trajectory is kept, including 0- and 1-transition ones.
    // minTransitions is a read filter; storing only what the current threshold
    // returns would make the cache depend on the query, so lowering the
    // threshold later would serve a silently incomplete answer from cache.
    trajectories.push(trajectory);
  }

  return { trajectories, unmatched, snapshotsExamined: snapshots.length };
}

function shape(
  url: string,
  all: readonly Trajectory[],
  counts: {
    snapshotsExamined: number;
    candidatesConsidered: number;
    candidatesUnmatched: number;
    candidatesDerivative: number;
  },
  provenance: TrajectoryProvenance,
  minTransitions: number,
): ComputeResult {
  const trajectories = all
    .filter((t) => t.transitions >= minTransitions)
    .sort((a, b) => b.transitions - a.transitions);

  return { url, ...counts, trajectories, groups: groupByMovement(trajectories), provenance };
}

/**
 * Trajectories for a tracked URL from STORED STATE ONLY. Never computes, never
 * writes. Returns null when this state has not been detected yet.
 *
 * Exists as a separate function rather than a boolean option because the
 * distinction is the whole security question: a cache miss on the writing path
 * inserts rows, so a caller that must not write needs a name that says so. The
 * first version of this change shipped one function that wrote on a miss and
 * left `get_claim_trajectories` classified as a read tool — an unauthenticated
 * caller could write to the database, and the classification guard could not
 * see it because it checks that every tool is classified exactly once, never
 * that a classification still matches what the tool does.
 */
export async function getStoredClaimTrajectories(
  url: string,
  opts: { minTransitions?: number } = {},
): Promise<ComputeResult | null> {
  const minTransitions = opts.minTransitions ?? MIN_TRANSITIONS;
  const inputs = await loadDetectionInputs(url);
  const cached = await readComputation(inputs);
  if (!cached) return null;
  return shape(url, cached.all, cached.counts, cached.provenance, minTransitions);
}

/**
 * Trajectories for a tracked URL — served from stored state, computed on a miss.
 *
 * WRITES on a miss. Callers must be authorised to do so; see
 * getStoredClaimTrajectories for the read-only path.
 *
 * Detection used to run on every call: ~2 MB of archived text out of Postgres and
 * thousands of substring searches, taking 3-5 seconds to produce a byte-identical
 * answer, on an endpoint that answers anonymously. It is a pure function of state
 * that only changes on a scan or a reclassification, so it is computed once per
 * state and read thereafter.
 *
 * A computation is NEVER updated in place. New state means a new row, so a
 * trajectory that has been cited still resolves to what was cited — see the
 * schema note on ClaimTrajectoryComputation.
 */
/**
 * WHAT DETECTION WOULD FIND AT A DIFFERENT CANDIDATE-LENGTH THRESHOLD.
 *
 * `MIN_CLAIM_LENGTH = 40` buys precision at the cost of missing terse claims,
 * and its own comment calls that "a trade worth revisiting once there are real
 * trajectories to look at". There are now real trajectories, so this exists to
 * look at them — and to make the revisit a MEASUREMENT rather than an argument.
 * Level 4 is deferred in this same plan because its rationale was falsified by
 * exactly this kind of pass; changing the constant first and measuring second
 * would repeat that in a subsystem with a recompute cascade attached.
 *
 * READ-ONLY AND IT NEVER PERSISTS. `getClaimTrajectories` writes a
 * ClaimTrajectoryComputation for the state it computed; a sweep over hypothetical
 * thresholds must not, or it would fill the cache with answers no production read
 * can ever be served — and, worse, rows whose `sourceStateHash` claims to
 * describe a state the corpus is not in.
 */
export async function detectAtClaimLength(
  url: string,
  minClaimLength: number,
): Promise<{
  minClaimLength: number;
  candidatesConsidered: number;
  candidatesUnmatched: number;
  snapshotsExamined: number;
  trajectories: DetectedTrajectory[];
}> {
  const inputs = await loadDetectionInputs(url, minClaimLength);
  const detected = await detect(inputs);
  return {
    minClaimLength,
    candidatesConsidered: inputs.candidates.size,
    candidatesUnmatched: detected.unmatched,
    snapshotsExamined: detected.snapshotsExamined,
    trajectories: detected.trajectories,
  };
}

export async function getClaimTrajectories(
  url: string,
  opts: { minTransitions?: number; forceRecompute?: boolean } = {},
): Promise<ComputeResult> {
  const minTransitions = opts.minTransitions ?? MIN_TRANSITIONS;
  const inputs = await loadDetectionInputs(url);

  if (!opts.forceRecompute) {
    const cached = await readComputation(inputs);
    if (cached) return shape(url, cached.all, cached.counts, cached.provenance, minTransitions);
  }

  const detected = await detect(inputs);

  // THE CONTAINMENT FILTER, applied after detection rather than at candidate
  // discovery — it needs per-capture presence, which only detection produces.
  // Length could be applied earlier and that convenience is exactly what made it
  // attractive; it is not a reason to keep filtering on the wrong thing.
  const derivative = detected.trajectories.filter((t) =>
    isDerivativeTrajectory(t, detected.trajectories),
  );
  const derivativeHashes = new Set(derivative.map((t) => t.claimHash));
  const kept = detected.trajectories.filter((t) => !derivativeHashes.has(t.claimHash));

  const counts = {
    snapshotsExamined: detected.snapshotsExamined,
    candidatesConsidered: inputs.candidates.size,
    candidatesUnmatched: detected.unmatched,
    // COUNTED, NEVER SILENT. A filter that reports nothing is how the 8-chunk
    // cap discarded 159 of 290 changes without a line of output, and how this
    // very rule hid the reporting-link claim for months. The number is stored on
    // the computation so a reader can see what the pass declined to keep.
    candidatesDerivative: derivative.length,
  };

  let persisted: { computedAt: string; stored: Trajectory[] };
  try {
    persisted = await persistComputation(inputs, kept, counts);
  } catch (err) {
    // Two concurrent misses race to write the same state. The loser reads the
    // winner's rows rather than failing: the answer is identical by
    // construction, since both computed against the same sourceStateHash.
    if (!isUniqueViolation(err)) throw err;
    const cached = await readComputation(inputs);
    if (!cached) throw err;
    return shape(url, cached.all, cached.counts, cached.provenance, minTransitions);
  }

  return shape(
    url,
    persisted.stored,
    counts,
    {
      sourceStateHash: inputs.sourceStateHash,
      detectionVersion: DETECTION_VERSION,
      computedAt: persisted.computedAt,
      fromCache: false,
    },
    minTransitions,
  );
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

async function readComputation(inputs: DetectionInputs) {
  const computation = await prisma.claimTrajectoryComputation.findUnique({
    where: {
      trackedUrlId_sourceStateHash: {
        trackedUrlId: inputs.trackedUrlId,
        sourceStateHash: inputs.sourceStateHash,
      },
    },
    include: { trajectories: true },
  });
  if (!computation) return null;

  const all: Trajectory[] = computation.trajectories.map((row) => ({
    id: row.id,
    claimHash: row.claimHash,
    claimText: row.claimText,
    observations: JSON.parse(row.observations) as Observation[],
    transitions: row.transitions,
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
    finalState: row.finalState,
  }));

  return {
    all,
    counts: {
      snapshotsExamined: computation.snapshotsExamined,
      candidatesConsidered: computation.candidatesConsidered,
      candidatesUnmatched: computation.candidatesUnmatched,
      candidatesDerivative: computation.candidatesDerivative,
    },
    provenance: {
      sourceStateHash: computation.sourceStateHash,
      detectionVersion: computation.detectionVersion,
      computedAt: computation.computedAt.toISOString(),
      fromCache: true,
    } satisfies TrajectoryProvenance,
  };
}

/**
 * Write the pass and its rows, and return the rows WITH their ids.
 *
 * createManyAndReturn rather than createMany: the ids are the point. A citation
 * names a ClaimTrajectory.id, so a fresh detection pass that returned only a
 * count would leave the caller holding an uncitable answer until something
 * happened to re-read it from cache — the same finding presented as citable or
 * not depending on whether it had been asked for before.
 */
async function persistComputation(
  inputs: DetectionInputs,
  trajectories: readonly DetectedTrajectory[],
  counts: {
    snapshotsExamined: number;
    candidatesConsidered: number;
    candidatesUnmatched: number;
    candidatesDerivative: number;
  },
): Promise<{ computedAt: string; stored: Trajectory[] }> {
  return prisma.$transaction(async (tx) => {
    const computation = await tx.claimTrajectoryComputation.create({
      data: {
        trackedUrlId: inputs.trackedUrlId,
        sourceStateHash: inputs.sourceStateHash,
        detectionVersion: DETECTION_VERSION,
        ...counts,
      },
    });

    const rows =
      trajectories.length > 0
        ? await tx.claimTrajectory.createManyAndReturn({
            data: trajectories.map((t) => ({
              computationId: computation.id,
              trackedUrlId: inputs.trackedUrlId,
              claimHash: t.claimHash,
              claimText: t.claimText,
              observations: JSON.stringify(t.observations),
              patternHash: presencePatternHash(t.observations),
              transitions: t.transitions,
              firstSeen: t.firstSeen,
              lastSeen: t.lastSeen,
              finalState: t.finalState,
            })),
            select: { id: true, claimHash: true },
          })
        : [];

    // Keyed by claimHash rather than by position: unique per computation
    // (@@unique([computationId, claimHash])), so it cannot collide, and it does
    // not assume the driver returns rows in insertion order.
    const idByClaimHash = new Map(rows.map((r) => [r.claimHash, r.id]));
    const stored = trajectories.map((t) => {
      const id = idByClaimHash.get(t.claimHash);
      if (!id) throw new Error(`Stored trajectory for claim ${t.claimHash} came back without an id.`);
      return { ...t, id };
    });

    return { computedAt: computation.computedAt.toISOString(), stored };
  });
}

/**
 * A flip, plus how long the state it starts then held.
 *
 * The flips alone were not enough. Rendered as bare dates, a one-capture absence
 * and a nine-capture absence are the same two arrows, and four consecutive
 * critiques treated a 4-day gap and a 44-day gap as one phenomenon — the
 * distinction that answers the strongest counter-argument in the corpus was one
 * subtraction away, in data already in front of the model, and no agent ever did
 * it. Arithmetic a reader must perform is arithmetic that does not happen.
 */
export interface ChangeSpan extends Observation {
  /** Consecutive captures observed in this state, counted from this one. */
  captures: number;
  /**
   * Days from this capture to the one that ENDS the state — the first observed
   * to hold the opposite value — or to the last capture examined when nothing
   * ends it. The true change point lies inside that window, never outside it,
   * which is why this is a bound and not a duration.
   *
   * `null` when a capture date cannot be parsed. A missing figure degrades the
   * block to the capture count; a `NaN` would be a number an agent reasons with.
   */
  days: number | null;
  /** No later capture holds the opposite value: the state is still running. */
  openEnded: boolean;
}

/** Whole days between two `YYYY-MM-DD` capture dates, or null if either is not one. */
function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * The flips only — the unchanged stretches between them are where nothing
 * happened, but how LONG nothing happened for is the finding.
 */
export function changeSpans(observations: readonly Observation[]): ChangeSpan[] {
  const spans: ChangeSpan[] = [];

  for (let i = 0; i < observations.length; i++) {
    const start = observations[i];
    if (i > 0 && start.present === observations[i - 1].present) continue;

    let end = i + 1;
    while (end < observations.length && observations[end].present === start.present) end++;

    // Bounded by the capture that ends the state, or by the last one examined.
    const openEnded = end === observations.length;
    const boundary = observations[openEnded ? end - 1 : end];

    spans.push({
      ...start,
      captures: end - i,
      days: daysBetween(start.snapshotDate, boundary.snapshotDate),
      openEnded,
    });
  }

  return spans;
}

/**
 * Collapse trajectories that share an identical presence vector.
 *
 * The vector is every snapshot's presence, not just the flips: two claims that
 * flip on the same dates but differ anywhere in between did NOT move together,
 * and merging them would assert a co-movement that did not happen.
 */
/**
 * The identity of a MOVEMENT: SHA-256 of the presence vector.
 *
 * Exported and used by both the grouping below and the write path, so the value
 * stored on a row cannot drift from the value grouping computes. Two functions
 * producing "the same" hash independently is how a stored derived column
 * silently stops meaning what its name says.
 *
 * Unstable ACROSS computations by construction — adding a capture lengthens the
 * vector — which is why a group has no citable identity and a thesis cites every
 * member instead (docs/gf-trajectory-citation-dev-plan.md §3.2). Within one
 * computation it is fixed, and that is what makes it storable.
 */
export function presencePatternHash(observations: readonly Observation[]): string {
  return claimHash(observations.map((o) => (o.present ? '1' : '0')).join(''));
}

export function groupByMovement(trajectories: readonly Trajectory[]): TrajectoryGroup[] {
  const byPattern = new Map<string, Trajectory[]>();

  for (const t of trajectories) {
    const pattern = presencePatternHash(t.observations);
    const bucket = byPattern.get(pattern);
    if (bucket) bucket.push(t);
    else byPattern.set(pattern, [t]);
  }

  const groups: TrajectoryGroup[] = [...byPattern.entries()].map(([patternHash, members]) => ({
    patternHash,
    changes: changeSpans(members[0].observations),
    transitions: members[0].transitions,
    firstSeen: members[0].firstSeen,
    lastSeen: members[0].lastSeen,
    finalState: members[0].finalState,
    claims: members.map((m) => ({ id: m.id, claimHash: m.claimHash, claimText: m.claimText })),
  }));

  // Largest blocks first: a section that moved as a unit is the stronger finding.
  groups.sort((a, b) => b.claims.length - a.claims.length || b.transitions - a.transitions);
  return groups;
}
