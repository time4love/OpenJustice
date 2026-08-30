import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { ARCHIVED_CAPTURES_ONLY, requireArchived } from '../lib/archivedCaptures';
import { parseDiffItems, parseRawChunks } from '../lib/diffItems';
import { diffChunkPair, DIFF_INPUT_VERSION } from '../lib/diffChunking';
import { TEXT_EXTRACTION_VERSION } from '../lib/captureDocument';
import { sentencesOf } from '../lib/textSegments';

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

/**
 * What a detection pass READS. Deliberately WITHOUT `sourceStateHash`.
 *
 * `detect` needs a corpus and a candidate set. `persistComputation` needs one
 * thing more — the identity of a state the corpus is actually in — and the two
 * requirements are separated HERE, in the types, rather than by a comment asking
 * a caller not to cache an experiment.
 *
 * The hazard is specific and it is not hypothetical. `compareCandidateSources`
 * runs four candidate sets over one corpus; each would hash to a different
 * `sourceStateHash`, and three of them describe states no scan ever produced.
 * Writing one would put a computation in the cache that claims to describe the
 * corpus, and the next `getClaimTrajectories` would serve it. A comment cannot
 * stop that. A type can: experimental inputs carry `sourceStateHash: null`, the
 * writer demands `string`, and the compiler refuses the call.
 */
type DetectionInputs = Omit<Awaited<ReturnType<typeof loadDetectionInputs>>, 'sourceStateHash'>;

/** Detection inputs that MAY be cached: the hash describes a real corpus state. */
type CacheableDetectionInputs = DetectionInputs & { readonly sourceStateHash: string };

/**
 * Detection inputs for a MEASUREMENT. Structurally unable to reach the writer.
 *
 * `null` rather than absent, and that is the point: an optional field would make
 * these assignable to the cacheable type the moment someone widened a signature.
 * `null` is not `string`, so the refusal survives refactoring.
 */
type ExperimentalDetectionInputs = DetectionInputs & { readonly sourceStateHash: null };

/** The expensive half: pull archived text and search it. Only ever runs on a miss. */
// ---------------------------------------------------------------------------
// WHICH TEXT OF A CAPTURE PRESENCE IS TESTED AGAINST.
//
// One rule, one home — the same treatment `anchoredCaptureHash` gave "which hash
// does the chain attest to", and for the same reason: Level 6 moves this, and the
// move must be ONE line rather than a hunt through every query that happens to
// select a text column.
//
//   EXTRACTION  `fullText` — Readability's article. What detection reads today,
//               and what the differ that produced the candidates reads too, so
//               the two agree. It discards ~31% of the page, hrefs included.
//   DOCUMENT    `text` — derived from the payload as served. The whole page,
//               losing only link targets.
//
// The constant below is NOT flipped yet, deliberately. `text` and `fullText` are
// produced by DIFFERENT RENDERERS — Readability and `htmlToText` — so the same
// sentence is not guaranteed to be the same string in both, and a candidate
// extracted from one may simply not be found in the other. Flipping first and
// measuring second would bump `DETECTION_VERSION`, recompute every trajectory,
// and only then reveal whether the platform's central finding survived the move.
// `compareDetectionLayers` measures it first, and writes nothing.
// ---------------------------------------------------------------------------

/** Which text of a capture a presence test reads. */
export type DetectionLayer = 'EXTRACTION' | 'DOCUMENT';

/** The layer production detection reads. Level 6 moves this to `DOCUMENT`. */
export const DETECTION_LAYER: DetectionLayer = 'EXTRACTION';

/** A capture's text under one layer. Named so no caller picks a column itself. */
export function presenceText(row: { fullText: string; text: string }, layer: DetectionLayer): string {
  return layer === 'EXTRACTION' ? row.fullText : row.text;
}

async function detect(inputs: DetectionInputs, layer: DetectionLayer = DETECTION_LAYER) {
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
      // BOTH columns, and the layer chooses between them in memory rather than
      // in the query. A `select` built from a variable collapses Prisma's
      // inference to a union with neither column in it, and the two obvious
      // escapes are worse: a cast would silence the compiler on the one line that
      // decides what a trajectory IS, and a per-layer query would be two
      // implementations of the rule this symbol exists to keep single.
      //
      // The cost is real and small: detection runs only on a cache miss, and a
      // miss now loads ~2x the text of one. That buys the flip being one constant.
      select: {
        snapshotDate: true,
        waybackTimestamp: true,
        snapshotUrl: true,
        fullText: true,
        text: true,
      },
    })
  ).map((row) => requireArchived(row, 'claimTrajectory.detect'));

  const snapshots = rows.map((r) => ({
    snapshotDate: r.snapshotDate,
    waybackTimestamp: r.waybackTimestamp,
    snapshotUrl: r.snapshotUrl,
    normalisedText: normaliseClaim(presenceText(r, layer)),
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

/**
 * WHAT WOULD CHANGE IF DETECTION READ THE DOCUMENT INSTEAD OF THE EXTRACTION.
 *
 * READ-ONLY AND IT NEVER PERSISTS, for the same reason `detectAtClaimLength`
 * does not: a computation written for a layer production does not read would fill
 * the cache with answers no read can be served, and — worse — rows whose
 * `sourceStateHash` claims to describe a state the corpus is not in.
 *
 * IT EXISTS TO PRODUCE ONE NUMBER THAT CAN VETO THE CHANGE IT PRECEDES.
 * `lostByMoving` is that number. `text` and `fullText` come from DIFFERENT
 * RENDERERS — `htmlToText` and Readability — so the same sentence is not
 * guaranteed to be the same string in both, and a claim with a trajectory today
 * may have none after the move. Anything above zero must be explained before
 * `DETECTION_VERSION` is bumped and every trajectory recomputed.
 *
 * `changedShape` is the subtler half and is deliberately reported separately: a
 * claim that keeps a trajectory but changes its TRANSITION COUNT has changed the
 * finding, and counting it as "survived" would hide that behind a set membership.
 */
export interface DetectionLayerComparison {
  url: string;
  candidatesConsidered: number;
  perLayer: Record<
    DetectionLayer,
    { trajectories: number; unmatched: number; snapshotsExamined: number }
  >;
  /** THE GATE: a trajectory under EXTRACTION and none under DOCUMENT. */
  lostByMoving: { claimText: string; transitions: number }[];
  /** The gain: a trajectory the extraction could never have seen. */
  gainedByMoving: { claimText: string; transitions: number }[];
  /** Kept by both layers, but the trajectory is not the same shape. */
  changedShape: { claimText: string; extraction: number; document: number }[];
}

export async function compareDetectionLayers(url: string): Promise<DetectionLayerComparison> {
  // ONE candidate set, detected twice. Loading the inputs once is what makes the
  // two runs comparable: a second `loadDetectionInputs` could observe a different
  // corpus if a scan landed between them, and the difference would be read as a
  // property of the layer.
  const cacheable = await loadDetectionInputs(url);
  // STRIPPED OF ITS HASH BEFORE EITHER ARM RUNS, and this is not decoration.
  //
  // `sourceStateHash` covers the snapshots, the candidates and DETECTION_VERSION
  // — it does NOT name the layer. A DOCUMENT-layer detection persisted under it
  // would be indistinguishable from the EXTRACTION one production reads: a cache
  // entry describing a state the corpus is not in.
  //
  // Nothing here calls the writer today. That was equally true of this file
  // before `compareCandidateSources` existed, and protecting only the new path
  // would leave the two instruments disagreeing about whether the hazard is real
  // — fixing one side is what creates the divergence.
  const inputs: ExperimentalDetectionInputs = { ...cacheable, sourceStateHash: null };
  const extraction = await detect(inputs, 'EXTRACTION');
  const document = await detect(inputs, 'DOCUMENT');

  const index = (ts: readonly DetectedTrajectory[]): Map<string, DetectedTrajectory> =>
    new Map(ts.map((t) => [t.claimHash, t]));
  const e = index(extraction.trajectories);
  const d = index(document.trajectories);

  const lostByMoving = [...e.values()]
    .filter((t) => !d.has(t.claimHash))
    .map((t) => ({ claimText: t.claimText, transitions: t.transitions }));
  const gainedByMoving = [...d.values()]
    .filter((t) => !e.has(t.claimHash))
    .map((t) => ({ claimText: t.claimText, transitions: t.transitions }));
  const changedShape = [...e.values()]
    .filter((t) => {
      const other = d.get(t.claimHash);
      return other !== undefined && other.transitions !== t.transitions;
    })
    .map((t) => ({
      claimText: t.claimText,
      extraction: t.transitions,
      // `.at`-free: the filter above already proved this key is present, and a
      // second lookup returning undefined would be a Map contract violation
      // rather than a case to handle.
      document: d.get(t.claimHash)?.transitions ?? -1,
    }));

  return {
    url,
    candidatesConsidered: inputs.candidates.size,
    perLayer: {
      EXTRACTION: {
        trajectories: extraction.trajectories.length,
        unmatched: extraction.unmatched,
        snapshotsExamined: extraction.snapshotsExamined,
      },
      DOCUMENT: {
        trajectories: document.trajectories.length,
        unmatched: document.unmatched,
        snapshotsExamined: document.snapshotsExamined,
      },
    },
    lostByMoving,
    gainedByMoving,
    changedShape,
  };
}

// ---------------------------------------------------------------------------
// WHERE CANDIDATES COME FROM — the axis that was never varied.
//
// `compareDetectionLayers` varies WHICH TEXT presence is tested against and
// holds the candidate set fixed. That is why its gain arm can only ever return
// "same or worse": candidates are discovered from diff items, the differ runs on
// `fullText`, so every candidate is a string the extraction already contained.
// Searching a superset for a subset of strings cannot find a new one. The plan
// calls this "zero BY CONSTRUCTION"; this type is that sentence made adjustable.
//
// THE POINT OF MEASURING IT HERE IS THAT IT COSTS NOTHING. Moving the differ for
// real means a `diffInputVersion` bump and re-classifying every diff — hundreds
// of model calls. But the raw `fullText` chunks are already stored, the payloads
// are already stored, and detection is deterministic and free. So what the move
// would make REACHABLE can be computed before a single call is paid for.
//
// WHAT THIS CAN AND CANNOT SETTLE, and the asymmetry is the whole caveat:
// `DOCUMENT_CHUNKS` bounds the candidate set a re-classification could draw
// from, not the one it would actually produce — the classifier samples and
// merges. So a claim absent from every document chunk cannot be produced by any
// re-classification (a genuine veto), while a claim present in one merely COULD
// be (never an approval). This instrument can cancel the spend. It can never
// justify it.
// ---------------------------------------------------------------------------

/** Where a detection pass discovers the claims it will look for. */
export type CandidateSource =
  /** `deletedText`/`addedText` — the classifier's quotes. What production reads. */
  | 'CLASSIFIED'
  /** Those quotes, split by `sentencesOf`. Level 5's fix, one layer up. */
  | 'CLASSIFIED_SENTENCES'
  /**
   * The same sentences, tested against the DOCUMENT — the outsider's check.
   *
   * A NAMED COMBINATION, NOT A LOOSENED PINNING. Sentence candidates are
   * compute-only, but they are discovered from Readability's article and have
   * only ever been tested against it. A stranger searches the RENDERED page, so
   * `CLASSIFIED_SENTENCES`' zero broken probes cannot fail by construction and
   * says nothing about outsider-verifiability. This arm is the only thing that
   * can show the free option standing on its own, and it is the one question
   * whose answer changes which option comes first.
   */
  | 'CLASSIFIED_SENTENCES_AT_DOCUMENT'
  /** `rawDeletedText`/`rawAddedText` — the chunks the classifier was FED. */
  | 'RAW_CHUNKS'
  /** Chunks re-derived from the payloads with the differ moved to `text`. */
  | 'DOCUMENT_CHUNKS';

/** The source production detection reads. 6.2c moves this to `DOCUMENT_CHUNKS`. */
export const CANDIDATE_SOURCE: CandidateSource = 'CLASSIFIED';

/**
 * The presence layer each source MUST be detected against — NOT a free flag.
 *
 * Four sources times two layers is eight combinations and only four of them mean
 * anything. Candidates derived from `text` and tested against `fullText` measure
 * the cross-renderer mismatch that the arm exists to REMOVE, and the number that
 * came back would be read as the effect. Pairing is therefore a property of the
 * arm, decided here once, rather than two arguments a caller can combine wrongly.
 */
export const ARM_LAYER: Readonly<Record<CandidateSource, DetectionLayer>> = {
  CLASSIFIED: 'EXTRACTION',
  CLASSIFIED_SENTENCES: 'EXTRACTION',
  CLASSIFIED_SENTENCES_AT_DOCUMENT: 'DOCUMENT',
  RAW_CHUNKS: 'EXTRACTION',
  DOCUMENT_CHUNKS: 'DOCUMENT',
};

/**
 * The arm that isolates ONE axis from another arm — its control.
 *
 * `DOCUMENT_CHUNKS` differs from `CLASSIFIED` in two ways at once, renderer and
 * granularity. `RAW_CHUNKS` holds granularity constant, so what the LAYER buys is
 * the set difference between their gains — not the difference of their counts.
 * Subtracting counts assumes one gain set contains the other, which nothing
 * establishes and which the probe-broken column already contradicts.
 */
export const ARM_CONTROL: Readonly<Partial<Record<CandidateSource, CandidateSource>>> = {
  DOCUMENT_CHUNKS: 'RAW_CHUNKS',
  // Identical candidates, different layer — so the difference is the LAYER alone,
  // for a candidate set that costs no model calls.
  CLASSIFIED_SENTENCES_AT_DOCUMENT: 'CLASSIFIED_SENTENCES',
};

/**
 * Whether this arm's `trajectories` and `unmatched` are GUARANTEED rather than measured.
 *
 * A chunk arm takes its candidates from the very text presence is then tested
 * against, so every candidate is a substring of at least one capture and matches
 * by construction: `unmatched` is 0 and `trajectories` equals `candidates`, always.
 *
 * THIS IS THE DEFECT THIS INSTRUMENT WAS BUILT TO STUDY, REPRODUCED INSIDE IT —
 * candidates and presence drawn from the same renderer, so matching cannot fail.
 * It is not a reason to change the arms: a chunk arm has nowhere else to get
 * candidates. It is a reason to REFUSE TO REPORT those two cells as findings,
 * which is what this flag makes the output do.
 *
 * `CLASSIFIED_SENTENCES` is NOT structural: its candidates come from the
 * classifier, which paraphrases, so a sentence of a quote need not appear
 * anywhere. `CLASSIFIED`'s own 5 unmatched are the proof that it can fail.
 */
export const ARM_PRESENCE_IS_STRUCTURAL: Readonly<Record<CandidateSource, boolean>> = {
  CLASSIFIED: false,
  CLASSIFIED_SENTENCES: false,
  // Candidates come from Readability's article and presence is tested against the
  // document — DIFFERENT texts, so matching can genuinely fail. That is the point.
  CLASSIFIED_SENTENCES_AT_DOCUMENT: false,
  RAW_CHUNKS: true,
  DOCUMENT_CHUNKS: true,
};

/** Every arm, in the order they are reported. CLASSIFIED first: it is the datum. */
export const CANDIDATE_SOURCES: readonly CandidateSource[] = [
  'CLASSIFIED',
  'CLASSIFIED_SENTENCES',
  'CLASSIFIED_SENTENCES_AT_DOCUMENT',
  'RAW_CHUNKS',
  'DOCUMENT_CHUNKS',
];

/** Why a snapshot pair cannot serve as input to the chunk arms. */
export type PairExclusion =
  /**
   * The row's stored chunks are UNDERSTATED, so it is not a clean baseline.
   *
   * `diffInputVersion` null or below current means the row was written under the
   * 8-chunk cap that discarded 55% of detected changes before the write. Using
   * such a row in `RAW_CHUNKS` would shrink the control arm — making the
   * granularity change look smaller than it is, which argues AGAINST the very
   * change being measured. A measurement that quietly favours the cheaper
   * decision is the one to be most suspicious of.
   */
  | 'CHUNKS_UNDERSTATED'
  /**
   * The two captures' `text` came from different derivations.
   *
   * `text` is a cached derivation carrying its own version. Diffing across a
   * version boundary compares text that was never comparable and reports the
   * derivation change as a page change — exactly the case Level 5 introduced
   * `UNCHECKABLE` for, one layer down.
   */
  | 'TEXT_VERSION_MISMATCH';

// THERE IS NO 'PAIR_INCOMPLETE'. `beforeSnapshotId` and `afterSnapshotId` are
// NOT NULL with required relations, so a diff cannot exist without both captures
// — the guard would be an assertion that cannot fail, and this repository has
// eight of those written down. The no-unnecessary-condition ratchet refused the
// first draft of this file for exactly that, which is the ratchet working.

/** A pair both chunk arms can read, with everything either of them needs. */
interface EligiblePair {
  diffId: string;
  classified: readonly string[];
  rawChunks: readonly string[];
  /** True when the classifier recorded quotes the raw columns do not account for. */
  rawAbsentDespiteClassification: boolean;
  beforeText: string;
  afterText: string;
}

/**
 * The pair universe all four arms share.
 *
 * ONE ELIGIBLE SET, NOT ONE PER ARM, and this is the part that is easy to get
 * wrong. Gating `RAW_CHUNKS` on `diffInputVersion` and `DOCUMENT_CHUNKS` on
 * `textExtractionVersion` is individually correct and jointly useless: the arms
 * would run over different populations, so their difference would carry a
 * population change as well as the renderer change, and the control would no
 * longer control anything. Both gates apply to both arms.
 *
 * `CLASSIFIED` and `CLASSIFIED_SENTENCES` are held to the same set for the same
 * reason. Production's real, whole-corpus candidate count is reported separately
 * and labelled as a baseline rather than as an arm.
 */
async function loadArmUniverse(trackedUrlId: string): Promise<{
  eligible: EligiblePair[];
  excluded: Record<PairExclusion, number>;
  totalPairs: number;
}> {
  const rows = await prisma.urlVersionDiff.findMany({
    where: { trackedUrlId },
    select: {
      id: true,
      diffInputVersion: true,
      deletedText: true,
      addedText: true,
      rawDeletedText: true,
      rawAddedText: true,
      beforeSnapshot: { select: { text: true, textExtractionVersion: true } },
      afterSnapshot: { select: { text: true, textExtractionVersion: true } },
    },
  });

  const excluded: Record<PairExclusion, number> = {
    CHUNKS_UNDERSTATED: 0,
    TEXT_VERSION_MISMATCH: 0,
  };
  const eligible: EligiblePair[] = [];

  for (const row of rows) {
    if (row.diffInputVersion !== DIFF_INPUT_VERSION) {
      excluded.CHUNKS_UNDERSTATED++;
      continue;
    }
    const before = row.beforeSnapshot;
    const after = row.afterSnapshot;
    if (
      before.textExtractionVersion !== TEXT_EXTRACTION_VERSION ||
      after.textExtractionVersion !== TEXT_EXTRACTION_VERSION
    ) {
      excluded.TEXT_VERSION_MISMATCH++;
      continue;
    }

    const classified = [row.deletedText, row.addedText].flatMap((raw) =>
      parseDiffItems(raw).map((item) => item.exactQuote),
    );
    const rawChunks = [row.rawDeletedText, row.rawAddedText].flatMap(parseRawChunks);

    eligible.push({
      diffId: row.id,
      classified,
      rawChunks,
      // AN EMPTY RAW COLUMN MEANS TWO DIFFERENT THINGS AND LOOKS THE SAME.
      //
      // `[]` is what a genuinely unchanged pair stores AND what a row whose raw
      // columns were never written stores. On an eligible row the current writer
      // always writes both, so classified quotes beside empty raw columns is a
      // contradiction rather than a quiet zero — and a quiet zero here would
      // shrink an arm and read as "nothing lost".
      rawAbsentDespiteClassification: rawChunks.length === 0 && classified.length > 0,
      beforeText: before.text,
      afterText: after.text,
    });
  }

  return { eligible, excluded, totalPairs: rows.length };
}

/**
 * The candidate strings one arm discovers from one pair.
 *
 * Normalisation and admission are deliberately NOT applied here — they belong to
 * the caller, which applies `loadDetectionInputs`'s exact rule to every arm. An
 * arm that filtered its own candidates differently would be measuring its filter.
 */
function armCandidateStrings(source: CandidateSource, pair: EligiblePair): string[] {
  switch (source) {
    case 'CLASSIFIED':
      return [...pair.classified];
    case 'CLASSIFIED_SENTENCES':
    case 'CLASSIFIED_SENTENCES_AT_DOCUMENT':
      // IDENTICAL CANDIDATES ON PURPOSE. The two arms differ only in the layer
      // they are tested against, which is what makes their difference readable.
      return pair.classified.flatMap(sentencesOf);
    case 'RAW_CHUNKS':
      return [...pair.rawChunks];
    case 'DOCUMENT_CHUNKS': {
      // THE MOVE ITSELF, and the only line of 6.2c that is actually in question.
      // Nothing is written: the chunks live for the length of this comparison.
      const { removed, added } = diffChunkPair(pair.beforeText, pair.afterText);
      return [...removed, ...added];
    }
  }
}

/**
 * One arm's candidate set, admitted by production's exact rule.
 *
 * `normaliseClaim` then dedupe by `claimHash` — the same two steps
 * `loadDetectionInputs` applies, including its lack of an emptiness filter. Not
 * tidying that up here is deliberate: an arm that dropped empty candidates while
 * the baseline kept them would differ from production in a second way, and the
 * difference would be attributed to the axis under test.
 */
function armCandidates(source: CandidateSource, pairs: readonly EligiblePair[]): Map<string, string> {
  const candidates = new Map<string, string>();
  for (const pair of pairs) {
    for (const text of armCandidateStrings(source, pair)) {
      const normalised = normaliseClaim(text);
      candidates.set(claimHash(normalised), normalised);
    }
  }
  return candidates;
}

/**
 * A claim in a comparison set. `transitions` travels WITH it, never separately.
 *
 * A set size is not a finding count. `MIN_TRANSITIONS` is a read filter applied
 * in `shape()`, which no comparison calls, so an unfiltered set includes strings
 * present in EVERY capture — the opposite of a finding. Carrying the count on
 * each member is what lets a reader apply the threshold to any set here.
 */
export interface ComparedClaim {
  claimText: string;
  transitions: number;
}

/**
 * A claim in one arm's gains and not the other's, and whether that is REAL.
 *
 * `claimHash` is SHA-256 of the normalised string, so identity is EXACT. The arms
 * read different renderings of the same page: a paragraph with a heading sitting
 * inside or beside it is a DIFFERENT STRING in `text` than in `fullText`, so it
 * lands in a set difference while being the same finding in substance.
 *
 * `respellingOf` names a counterpart in the other set that contains this claim or
 * is contained by it BY AT LEAST `CONTAINMENT_MATCH_MIN_LENGTH` characters.
 * Non-null means the difference is a re-spelling and the finding is not new; null
 * means nothing in the other set meaningfully overlaps it, which for the layer
 * arms is what a heading Readability discards looks like.
 *
 * THE FLOOR IS NOT OPTIONAL AND THE CONSTANT IS NOT A NEW ONE. Bare containment
 * on short strings matches by accident, and a false match here classifies a
 * genuinely-new claim as a re-spelling and SUBTRACTS IT FROM THE PURCHASE — the
 * direction that loses a finding, which is the same direction `trajectoryContext`
 * already gates for with the same constant and the same reasoning. The claims at
 * stake are short: `קישורים למידע נוסף` is 18 characters and is the whole of what
 * moving the differ buys.
 *
 * COMPUTED, NOT EYEBALLED. Judging this by reading a sample is how "the layer-only
 * claims are headings" becomes a belief rather than a measurement.
 */
export type DifferenceVerdict =
  /** Nothing in the other set contains it or is contained by it. MEASURED. */
  | 'UNIQUE'
  /** Covered by a counterpart, on an overlap long enough to mean it. MEASURED. */
  | 'RESPELLING'
  /**
   * A containment relation EXISTS but rests on fewer than
   * `CONTAINMENT_MATCH_MIN_LENGTH` characters, so it cannot be told from an
   * accident. NOT MEASURED — and counted as neither bought nor discounted.
   *
   * THIS CATEGORY IS WHY THE FLOOR DID NOT SIMPLY MOVE THE BIAS. A two-way split
   * would put these with the genuinely-new ones, making "new" true by
   * construction for every short claim — the cannot-fail shape this instrument
   * already had to mark once, one level up. A short claim that overlaps NOTHING
   * is still a measurement; only a short claim that overlaps SOMETHING is not.
   */
  | 'OVERLAP_BELOW_FLOOR';

export interface DifferedClaim extends ComparedClaim {
  verdict: DifferenceVerdict;
  /** The counterpart, for RESPELLING and OVERLAP_BELOW_FLOOR alike. */
  respellingOf: string | null;
}

/** Members of a set that clear `MIN_TRANSITIONS` — the ones that are findings. */
export function findingsIn(claims: readonly ComparedClaim[]): ComparedClaim[] {
  return claims.filter((c) => c.transitions >= MIN_TRANSITIONS);
}

/** Members that overlap nothing in the other set — genuinely new, and MEASURED. */
export function unique(claims: readonly DifferedClaim[]): DifferedClaim[] {
  return claims.filter((c) => c.verdict === 'UNIQUE');
}

/** Members the floor cannot rule on. Neither bought nor discounted — reported apart. */
export function unclassifiable(claims: readonly DifferedClaim[]): DifferedClaim[] {
  return claims.filter((c) => c.verdict === 'OVERLAP_BELOW_FLOOR');
}

/**
 * One direction of a set difference, with each member classified.
 *
 * BOTH DIRECTIONS ARE ALWAYS REPORTED BY THE CALLER. Printing only
 * `mine \\ theirs` and letting a reader infer the reverse is the count-subtraction
 * mistake one level up: the sets are not nested, so the net is not recoverable
 * from one direction and a threshold applied per-side makes it worse — the same
 * claim can clear MIN_TRANSITIONS in one arm and not the other.
 */
/**
 * Whether a claim is covered by anything in the other set, and whether we can tell.
 *
 * The overlap IS the shorter string, since one contains the other. Below the
 * floor the relation is real but uninterpretable: `containmentOf`'s constant
 * exists because a short string is a substring of unrelated text by accident.
 * Reporting that as coverage discounts a finding; reporting it as new invents
 * one. It gets its own verdict instead.
 */
function classifyOverlap(
  text: string,
  others: readonly string[],
): { verdict: DifferenceVerdict; respellingOf: string | null } {
  const overlapping = others.filter((o) => o.includes(text) || text.includes(o));
  const solid = overlapping.find(
    (o) => Math.min(o.length, text.length) >= CONTAINMENT_MATCH_MIN_LENGTH,
  );
  if (solid !== undefined) return { verdict: 'RESPELLING', respellingOf: solid };
  const weak = overlapping.at(0);
  if (weak !== undefined) return { verdict: 'OVERLAP_BELOW_FLOOR', respellingOf: weak };
  return { verdict: 'UNIQUE', respellingOf: null };
}

function differenceWithRespelling(
  mine: ReadonlyMap<string, ComparedClaim>,
  theirs: ReadonlyMap<string, ComparedClaim>,
): DifferedClaim[] {
  const theirTexts = [...theirs.values()].map((c) => c.claimText);
  return [...mine.entries()]
    .filter(([hash]) => !theirs.has(hash))
    .map(([, claim]) => ({
      ...claim,
      // Exact identity needs no floor and is already excluded — these are the
      // members whose HASH is absent from the other set. Only containment is left,
      // and containment on a short overlap is the accident the floor exists for.
      // The overlap IS the shorter string, since one contains the other.
      ...classifyOverlap(claim.claimText, theirTexts),
    }));
}

/** One arm's result. `layer` is reported so a reader can see the pairing held. */
export interface CandidateSourceArm {
  source: CandidateSource;
  layer: DetectionLayer;
  candidates: number;
  /**
   * GUARANTEED, NOT MEASURED, when `presenceIsStructural`. See
   * ARM_PRESENCE_IS_STRUCTURAL — these two cells can only read one way.
   */
  trajectories: number;
  unmatched: number;
  presenceIsStructural: boolean;
  /** The arm that holds granularity constant, when one exists. */
  controlSource: CandidateSource | null;
  /**
   * Gained by THIS arm and not by its control — what the isolated axis buys.
   *
   * A SET DIFFERENCE OVER CLAIM HASHES, never a difference of counts. Empty when
   * the arm has no control.
   */
  gainedNotInControl: DifferedClaim[];
  /**
   * Gained by the CONTROL and not by this arm — what the isolated axis COSTS.
   *
   * THE REVERSE DIRECTION, REPORTED RATHER THAN LEFT TO ARITHMETIC. The sets are
   * not nested, and per-side thresholding means the intersection does not even
   * have one size: a claim can clear MIN_TRANSITIONS in one arm and not the
   * other. A reader handed only the forward difference infers a net that the
   * data does not support — which is the count-subtraction error wearing a set's
   * clothes.
   */
  controlGainsNotHere: DifferedClaim[];
  /** Trajectories this arm has that CLASSIFIED does not. Empty for CLASSIFIED. */
  gainedVsClassified: ComparedClaim[];
  /**
   * THE VETO NUMBER. A claim CLASSIFIED follows that is NOT FINDABLE under this
   * arm's layer — tested directly, so its absence is the probe failing rather
   * than the candidate never being offered.
   *
   * This is evidence breaking. A stranger who opens the archived page and
   * searches for the claim finds nothing, which is the check the whole platform
   * rests on.
   */
  lostProbeBroken: ComparedClaim[];
  /**
   * A claim this arm's differ did not re-discover, though it WOULD still have a
   * trajectory under this layer if asked.
   *
   * SEPARATED FROM THE ABOVE BECAUSE THEY IMPLY OPPOSITE THINGS, and a single
   * "lost" count cannot tell them apart. Different chunk boundaries produce
   * different quotes; the claim is intact and a re-classification over the new
   * chunks may well quote it again. Counting this as breakage would veto the
   * move for doing exactly what moving the differ means.
   */
  lostNotRediscovered: ComparedClaim[];
}

export interface CandidateSourceComparison {
  url: string;
  snapshotsExamined: number;
  totalPairs: number;
  eligiblePairs: number;
  excluded: Record<PairExclusion, number>;
  /**
   * CLASSIFIED over the WHOLE corpus — what production actually detects from.
   *
   * Reported for context and NOT comparable to any arm: the arms run over the
   * eligible subset. Printing it as a fifth arm is precisely how a population
   * difference gets read as an effect.
   */
  productionBaselineCandidates: number;
  arms: CandidateSourceArm[];
  /**
   * Why the run cannot be believed. Non-empty means the script must exit non-zero.
   *
   * An arm that yields nothing reports "0 lost", and 0 lost reads as no loss —
   * failure and success sharing a representation, which is the rule this session
   * established after four reassuring answers in one day. So an arm that CANNOT
   * have measured anything says so instead of scoring well.
   */
  refusals: string[];
}

/**
 * What each candidate source would make detectable, measured before it is paid for.
 *
 * READ-ONLY AND UNCACHEABLE BY CONSTRUCTION — the arms carry
 * `sourceStateHash: null`, so `persistComputation` will not accept them and the
 * compiler, not a reviewer, is what enforces it.
 */
export async function compareCandidateSources(url: string): Promise<CandidateSourceComparison> {
  // ONE load for the corpus, exactly as compareDetectionLayers does it: a second
  // one could observe a different snapshot set if a scan landed between them, and
  // the difference would be read as a property of the arm.
  const base = await loadDetectionInputs(url);
  const { eligible, excluded, totalPairs } = await loadArmUniverse(base.trackedUrlId);

  const refusals: string[] = [];
  if (eligible.length === 0) {
    refusals.push(
      `No pair is eligible for the chunk arms (${String(totalPairs)} pairs, all excluded). ` +
        'Nothing was measured; the zeroes below are absence of input, not absence of effect.',
    );
  }
  const contradicted = eligible.filter((p) => p.rawAbsentDespiteClassification);
  if (contradicted.length > 0) {
    refusals.push(
      `${String(contradicted.length)} eligible pair(s) hold classifier quotes but no raw chunks, ` +
        'which the current writer cannot produce. RAW_CHUNKS is understated by an unknown amount: ' +
        contradicted.slice(0, 5).map((p) => p.diffId).join(', '),
    );
  }

  /** One arm's inputs. `sourceStateHash: null` is what bars them from the cache. */
  const inputsFor = (candidates: Map<string, string>): ExperimentalDetectionInputs => ({
    trackedUrlId: base.trackedUrlId,
    snapshotMeta: base.snapshotMeta,
    candidates,
    sourceStateHash: null,
  });

  const noteEmpty = (source: CandidateSource, size: number): void => {
    if (size > 0) return;
    refusals.push(
      `Arm ${source} discovered no candidates. It cannot lose or gain a trajectory, ` +
        'so its zeroes carry no information about the change.',
    );
  };

  // THE DATUM. Computed before the loop rather than inside it: reading it out of
  // a variable the loop also assigns made the comparison depend on array order,
  // and the order of an exported constant is not a thing to depend on.
  const classifiedCandidates = armCandidates('CLASSIFIED', eligible);
  noteEmpty('CLASSIFIED', classifiedCandidates.size);
  const classifiedDetected = await detect(inputsFor(classifiedCandidates), ARM_LAYER.CLASSIFIED);
  const classifiedIndex = new Map(classifiedDetected.trajectories.map((t) => [t.claimHash, t]));

  /** One arm before the control comparison, which needs every arm's gains first. */
  interface ArmDraft {
    arm: CandidateSourceArm;
    gainedHashes: Map<string, ComparedClaim>;
  }

  const asClaim = (t: DetectedTrajectory): ComparedClaim => ({
    claimText: t.claimText,
    transitions: t.transitions,
  });

  const drafts: ArmDraft[] = [
    {
      arm: {
        source: 'CLASSIFIED',
        layer: ARM_LAYER.CLASSIFIED,
        candidates: classifiedCandidates.size,
        trajectories: classifiedDetected.trajectories.length,
        unmatched: classifiedDetected.unmatched,
        presenceIsStructural: ARM_PRESENCE_IS_STRUCTURAL.CLASSIFIED,
        controlSource: ARM_CONTROL.CLASSIFIED ?? null,
        gainedNotInControl: [],
        controlGainsNotHere: [],
        gainedVsClassified: [],
        lostProbeBroken: [],
        lostNotRediscovered: [],
      },
      gainedHashes: new Map(),
    },
  ];

  for (const source of CANDIDATE_SOURCES.filter((x) => x !== 'CLASSIFIED')) {
    const layer = ARM_LAYER[source];
    const candidates = armCandidates(source, eligible);
    noteEmpty(source, candidates.size);
    const detected = await detect(inputsFor(candidates), layer);
    const index = new Map(detected.trajectories.map((t) => [t.claimHash, t]));

    // WHY A SECOND PASS. A claim missing from `index` is missing for one of two
    // reasons that mean opposite things — the differ did not offer it, or the
    // page no longer contains it. Detecting the DATUM'S candidates against THIS
    // arm's layer separates them: whatever survives here is still findable, so
    // its absence above is a chunking difference and not evidence breaking.
    //
    // Free, deterministic, and it reuses `detect` rather than reimplementing the
    // presence test — which is the rule that keeps this file's answers single.
    const probe = await detect(inputsFor(classifiedCandidates), layer);
    const stillFindable = new Set(probe.trajectories.map((t) => t.claimHash));

    const missing = [...classifiedIndex.values()].filter((t) => !index.has(t.claimHash));
    const gainedHashes = new Map(
      [...index.values()]
        .filter((t) => !classifiedIndex.has(t.claimHash))
        .map((t) => [t.claimHash, asClaim(t)] as const),
    );

    drafts.push({
      gainedHashes,
      arm: {
        source,
        layer,
        candidates: candidates.size,
        trajectories: detected.trajectories.length,
        unmatched: detected.unmatched,
        presenceIsStructural: ARM_PRESENCE_IS_STRUCTURAL[source],
        controlSource: ARM_CONTROL[source] ?? null,
        // Filled in the second pass — every arm's gains must exist first.
        gainedNotInControl: [],
        controlGainsNotHere: [],
        gainedVsClassified: [...gainedHashes.values()],
        lostProbeBroken: missing.filter((t) => !stillFindable.has(t.claimHash)).map(asClaim),
        lostNotRediscovered: missing.filter((t) => stillFindable.has(t.claimHash)).map(asClaim),
      },
    });
  }

  // THE ISOLATED AXIS, AS A SET DIFFERENCE OVER CLAIM HASHES.
  //
  // `gained(DOCUMENT_CHUNKS).length - gained(RAW_CHUNKS).length` would only mean
  // something if one set contained the other, and nothing establishes that — the
  // arms already disagree about which probes break, so they are known to diverge.
  // The difference of the SETS is what the layer buys; the difference of the
  // counts is an arithmetic accident that happens to look like an answer.
  const bySource = new Map(drafts.map((d) => [d.arm.source, d]));
  for (const draft of drafts) {
    const control = draft.arm.controlSource;
    if (control === null) continue;
    const controlGains = bySource.get(control)?.gainedHashes;
    if (!controlGains) continue;
    draft.arm.gainedNotInControl = differenceWithRespelling(draft.gainedHashes, controlGains);
    draft.arm.controlGainsNotHere = differenceWithRespelling(controlGains, draft.gainedHashes);
  }

  const arms = drafts.map((d) => d.arm);

  // A STRUCTURAL INVARIANT, NOT A THRESHOLD. `sentencesOf` returns at least one
  // part for every non-empty input, so splitting a quote set can only hold or
  // grow it. Fewer sentences than quotes means the splitter or the admission rule
  // is dropping candidates, and every "lost" it then reports is an artefact.
  //
  // Preferred over "materially smaller than CLASSIFIED", which would need a
  // percentage nobody has measured — and this repository has already paid for one
  // unmeasured constant that looked reasonable (MIN_CLAIM_LENGTH, 40, which hid
  // the reporting-link claim). The ratios are printed instead, for a human.
  const sentences = arms.find((a) => a.source === 'CLASSIFIED_SENTENCES');
  if (sentences && sentences.candidates < classifiedCandidates.size) {
    refusals.push(
      `CLASSIFIED_SENTENCES yielded fewer candidates (${String(sentences.candidates)}) than ` +
        `CLASSIFIED (${String(classifiedCandidates.size)}), which sentence splitting cannot do. ` +
        'Candidates are being dropped somewhere in this instrument.',
    );
  }

  return {
    url,
    snapshotsExamined: base.snapshotMeta.length,
    totalPairs,
    eligiblePairs: eligible.length,
    excluded,
    productionBaselineCandidates: base.candidates.size,
    arms,
    refusals,
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

async function readComputation(inputs: CacheableDetectionInputs) {
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
  inputs: CacheableDetectionInputs,
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
