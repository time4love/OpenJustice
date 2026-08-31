import { z } from 'zod';
import {
  CalibrationDecisionType,
  CalibrationRunStatus,
  type CalibrationDecision,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
// `chromeRuleset` and NOT `chromeRulesetApply`: naming a view is a hash over
// strings, and this service must not inherit a parser to do it.
import { chromeRulesetId, type ChromeRuleset } from '../lib/chromeRuleset';

// ---------------------------------------------------------------------------
// LEVEL 4 — the calibration loop's service. Modes 1 and 3 of three.
//
// The design is `docs/gf-factual-layer-rebuild-dev-plan.md`, Level 4,
// `##### THE DATA MODEL`. Two properties from it govern everything below:
//
//   THE RUN HOLDS NO SELECTORS. Its decision log does, and the current ruleset
//   is the newest decision's. So every read here is a FOLD, never a cached
//   column, and resumption six months later is the same fold.
//
//   `sequence` IS THE VERSION. It is unique per run, so an append carrying a
//   stale expected version collides on the constraint rather than overwriting —
//   the "two browsers on one session" failure mode answered by the database
//   instead of by a read-modify-write that can interleave.
//
// NOTHING HERE WRITES A SNAPSHOT, AN ANCHOR OR AN EVIDENCE RECORD, and nothing
// here is reachable from the derivation path yet. Level 4's UI rule is that the
// browser writes DECISIONS and the backend applies EFFECTS; this module is the
// decision side, and the effects arrive with the scanner in step 2b.
// ---------------------------------------------------------------------------

/** An append lost the race, or the caller was working from a stale read. */
export class StaleCalibrationVersionError extends Error {
  constructor(runId: string, expected: number, actual: number) {
    super(
      `Calibration run ${runId} is at version ${String(actual)}, not ${String(expected)}. ` +
        'Re-read the run before appending.',
    );
    this.name = 'StaleCalibrationVersionError';
  }
}

/** A run that has already committed or been abandoned takes no more decisions. */
export class CalibrationRunClosedError extends Error {
  constructor(runId: string, status: CalibrationRunStatus) {
    super(`Calibration run ${runId} is ${status} and accepts no further decisions.`);
    this.name = 'CalibrationRunClosedError';
  }
}

/**
 * Which capture a decision or an observation is about.
 *
 * EXACTLY ONE IDENTITY. A capture we hold is named by its snapshot, which
 * already carries its timestamp; a capture fetched for marking and deliberately
 * not persisted has no snapshot and is named by the timestamp alone. Both, or
 * neither, is a caller that has not decided which it has.
 */
export type CaptureSubject = { snapshotId: string } | { waybackTimestamp: string };

/**
 * The guard that holds the one-identity rule, and it THROWS.
 *
 * A silent filter would drop the subject from the pass and report it as nothing
 * to check — the failure this repository names as worse than the crash. There is
 * no CHECK constraint behind this: Prisma does not model them, and whether one
 * added by raw SQL registers as drift cannot be established without a shadow
 * database, so breaking `db:check-drift` for every future migration is the price
 * of finding out. A loud guard plus a test is the pattern this project already
 * uses for exactly that trade.
 */
export function requireObservationSubject(subject: {
  snapshotId?: string | null;
  waybackTimestamp?: string | null;
}): CaptureSubject {
  const snapshotId = subject.snapshotId ?? null;
  const waybackTimestamp = subject.waybackTimestamp ?? null;
  if (snapshotId !== null && waybackTimestamp !== null) {
    throw new Error(
      'A capture is identified by its snapshot OR by a wayback timestamp, never both: ' +
        `snapshotId=${snapshotId}, waybackTimestamp=${waybackTimestamp}.`,
    );
  }
  if (snapshotId !== null) return { snapshotId };
  if (waybackTimestamp !== null) return { waybackTimestamp };
  throw new Error(
    'A capture must be identified by a snapshotId or a wayback timestamp; neither was given.',
  );
}

/** `matchCounts` is `Json` in the database, so it is validated on the way out. */
const MATCH_COUNTS = z.record(z.string(), z.number().int().nonnegative());

export function parseMatchCounts(value: Prisma.JsonValue): Record<string, number> {
  return MATCH_COUNTS.parse(value);
}

// ---------------------------------------------------------------------------
// The fold. Everything a caller can know about a run is computed from its log.
// ---------------------------------------------------------------------------

/** A selector the current ruleset holds that no longer matches anything. */
export interface StaleSelector {
  selector: string;
  /** When it last matched at least one element, or null if it never has. */
  lastMatchedAt: Date | null;
}

export interface CalibrationRunState {
  runId: string;
  trackedUrlId: string;
  /** Who is marking. Every judgement this platform acts on names who made it. */
  researcherId: string;
  status: CalibrationRunStatus;
  /** The newest decision's sequence. An append must carry this value. */
  version: number;
  /** The rules in force right now — the newest decision's, never a cached column. */
  selectors: readonly string[];
  rulesetId: string;
  capturesShown: number;
  corrections: number;
  /**
   * Corrections per capture shown — **null when no capture has been shown yet**.
   *
   * NULL IS NOT ZERO, and conflating them is the vacuity shape this repository
   * demotes below "never run": a rate of 0 from an empty denominator reads as a
   * ruleset that has been tested and never needed fixing, which is the opposite
   * of the truth. Every consumer must handle null as "this says nothing".
   */
  correctionRate: number | null;
  /**
   * Captures shown most recently, in a row, that needed no correction.
   *
   * The stopping indicator — Level 4: *"No corrections on the last three
   * versions."* It measures the instrument against the only ground truth there
   * is, and it needs no calibration of its own, which a model's confidence
   * score would.
   *
   * INFORMATIVE ONLY WHEN THE SAMPLE WAS ADVERSARIAL. Three similar pages
   * produce no corrections and test nothing; that is the next-capture policy's
   * job, and it is why this number is reported beside `capturesShown` rather
   * than on its own.
   */
  consecutiveCleanCaptures: number;
}

/** The current rules: the newest decision's, by sequence. */
function foldSelectors(decisions: readonly CalibrationDecision[]): readonly string[] {
  // `.at()` rather than `[n]` — `noUncheckedIndexedAccess` and
  // `no-unnecessary-condition` rule out both spellings of an indexed read
  // between them, and `.at()` is typed `T | undefined` unconditionally.
  return decisions.at(-1)?.selectors ?? [];
}

/**
 * Trailing captures with no correction against them.
 *
 * An episode opens at each CAPTURE_SHOWN and runs to the next one. It is dirty
 * if the rules were corrected inside it — which is what a rejection produces,
 * since a rejection means the RULES are wrong rather than that the capture is
 * bad, and routes back to marking.
 */
function foldEpisodes(decisions: readonly CalibrationDecision[]): boolean[] {
  const clean: boolean[] = [];
  for (const decision of decisions) {
    if (decision.type === CalibrationDecisionType.CAPTURE_SHOWN) {
      clean.push(true);
      continue;
    }
    if (decision.type === CalibrationDecisionType.RULESET_CORRECTED && clean.length > 0) {
      clean[clean.length - 1] = false;
    }
  }
  return clean;
}

function trailingClean(episodes: readonly boolean[]): number {
  let count = 0;
  for (let i = episodes.length - 1; i >= 0; i -= 1) {
    if (episodes.at(i) !== true) break;
    count += 1;
  }
  return count;
}

/**
 * Selectors in the current ruleset that no longer match anything.
 *
 * THE ONLY AUTOMATED PART OF THIS LEVEL, and it is a null check rather than a
 * signal: a selector either matches or it does not. No threshold, no
 * calibration, and nothing that can silently drift — which is precisely what
 * disqualified the frequency signal this level rejected twice.
 *
 * It is NECESSARY AND INSUFFICIENT. It catches a selector matching ZERO nodes;
 * the dangerous direction is a selector matching TOO MUCH, which leaves
 * something clean and plausible on screen and never fires this. That is what
 * `removalFraction` and showing the removed text are for.
 */
export function findStaleSelectors(
  selectors: readonly string[],
  observations: readonly { matchCounts: Prisma.JsonValue; observedAt: Date }[],
): StaleSelector[] {
  if (observations.length === 0) return [];

  // Parsed ONCE, and the newest observation computed ONCE. The earlier version
  // did both inside the per-selector loop: a scan holding 3,000 observations of
  // a ten-selector ruleset would have run 30,000 zod parses to answer a question
  // about ten selectors.
  const parsed = observations.map((o) => ({
    counts: parseMatchCounts(o.matchCounts),
    observedAt: o.observedAt,
  }));
  const newest = parsed.reduce<Date>(
    (acc, o) => (o.observedAt > acc ? o.observedAt : acc),
    // Safe: the empty case returned above, so there is at least one element.
    parsed[0]?.observedAt ?? new Date(0),
  );

  const stale: StaleSelector[] = [];
  for (const selector of selectors) {
    let lastMatchedAt: Date | null = null;
    for (const observation of parsed) {
      const matched = observation.counts[selector] ?? 0;
      if (matched > 0 && (lastMatchedAt === null || observation.observedAt > lastMatchedAt)) {
        lastMatchedAt = observation.observedAt;
      }
    }
    if (lastMatchedAt === null || lastMatchedAt < newest) {
      stale.push({ selector, lastMatchedAt });
    }
  }
  return stale;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Everything a caller can know about a run, folded from its log.
 *
 * DELIBERATELY CHEAP. Level 4 names "the model polling this on a timer" as a
 * failure mode to design against: one indexed query and an in-memory fold over
 * tens of rows, with no capture fetched and nothing derived.
 */
export async function readCalibrationRun(runId: string): Promise<CalibrationRunState> {
  const run = await prisma.calibrationRun.findUnique({
    where: { id: runId },
    include: { decisions: { orderBy: { sequence: 'asc' } } },
  });
  if (!run) throw new Error(`Calibration run ${runId} not found.`);

  const selectors = foldSelectors(run.decisions);
  const episodes = foldEpisodes(run.decisions);
  const corrections = run.decisions.filter(
    (d) => d.type === CalibrationDecisionType.RULESET_CORRECTED,
  ).length;

  // RECOMPUTED, AND CHECKED AGAINST WHAT WAS STORED. The column exists so a
  // scan can identify "the approved set" in SQL without folding every run; this
  // read derives the same value from the selectors instead. Two routes to one
  // fact can disagree only through a bug in the writer, and a ruleset id that
  // silently disagreed would send a deviation baseline to the wrong set of
  // captures. So the disagreement is made loud rather than left possible.
  const rulesetId = chromeRulesetId({ selectors });
  const stored = run.decisions.at(-1)?.rulesetId;
  if (stored !== undefined && stored !== rulesetId) {
    throw new Error(
      `Calibration run ${runId} decision ${String(run.decisions.at(-1)?.sequence)} stores ` +
        `rulesetId ${stored}, but its selectors hash to ${rulesetId}.`,
    );
  }

  return {
    runId: run.id,
    trackedUrlId: run.trackedUrlId,
    researcherId: run.researcherId,
    status: run.status,
    version: run.decisions.at(-1)?.sequence ?? 0,
    selectors,
    rulesetId,
    capturesShown: episodes.length,
    corrections,
    correctionRate: episodes.length === 0 ? null : corrections / episodes.length,
    consecutiveCleanCaptures: trailingClean(episodes),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Materialise the identity of a set of selectors.
 *
 * A ROW HERE IS NOT A CLAIM THAT THE RULES ARE IN FORCE. It is content-addressed
 * and idempotent — the same selectors always resolve to the same row — so a
 * ruleset under construction can be named, and observations can hang from it,
 * long before anybody decides it is right. What is in force is
 * `TrackedUrl.activeArticleRulesetId`, and only committing sets that.
 *
 * NOT EXPORTED, DELIBERATELY. A ruleset is produced BY a calibration, and every
 * route to one runs through this file: opening a run, correcting the rules, and
 * committing. A second caller elsewhere would be a ruleset that no decision log
 * accounts for — attributed to a researcher who never marked anything.
 */
async function ensureArticleRuleset(
  client: Prisma.TransactionClient,
  input: { trackedUrlId: string; selectors: readonly string[]; researcherId: string },
): Promise<{ id: string; rulesetId: string }> {
  const ruleset: ChromeRuleset = { selectors: input.selectors };
  const rulesetId = chromeRulesetId(ruleset);
  const row = await client.articleRuleset.upsert({
    where: { trackedUrlId_rulesetId: { trackedUrlId: input.trackedUrlId, rulesetId } },
    // A recommit of an identical view is the SAME row. Nothing to update:
    // the selectors are what the key is computed from, so they cannot differ.
    update: {},
    create: {
      trackedUrlId: input.trackedUrlId,
      rulesetId,
      selectors: [...input.selectors],
      createdById: input.researcherId,
    },
  });
  return { id: row.id, rulesetId };
}

/**
 * Open a run, seeded from the rules already in force for the page.
 *
 * MODE 1 AND MODE 3 ARE THIS SAME CALL. "Mode 1 is mode 3 with a fetch" is
 * exact: a page with no ruleset seeds from nothing and a page with one seeds
 * from it, and neither the run nor this function needs to know which happened.
 */
export async function openCalibrationRun(input: {
  trackedUrlId: string;
  researcherId: string;
}): Promise<CalibrationRunState> {
  const trackedUrl = await prisma.trackedUrl.findUnique({
    where: { id: input.trackedUrlId },
    include: { activeArticleRuleset: true },
  });
  if (!trackedUrl) throw new Error(`TrackedUrl ${input.trackedUrlId} not found.`);

  const seed = trackedUrl.activeArticleRuleset;
  const selectors = seed?.selectors ?? [];

  const run = await prisma.calibrationRun.create({
    data: {
      trackedUrlId: input.trackedUrlId,
      researcherId: input.researcherId,
      seededFromRulesetId: seed?.id ?? null,
      decisions: {
        create: {
          sequence: 1,
          type: CalibrationDecisionType.RUN_OPENED,
          selectors,
          rulesetId: chromeRulesetId({ selectors }),
        },
      },
    },
  });
  return readCalibrationRun(run.id);
}

/** What the browser appends. The effects stay on this side of the wire. */
export interface CalibrationDecisionInput {
  type: Exclude<CalibrationDecisionType, 'RUN_OPENED' | 'RUN_CLOSED'>;
  /** Required on RULESET_CORRECTED; ignored otherwise — the rules do not change. */
  selectors?: readonly string[];
  snapshotId?: string;
  waybackTimestamp?: string;
  observationId?: string;
  reason?: string;
}

/**
 * The decision types that are ABOUT a capture, and therefore must name one.
 *
 * THE GUARD THAT ASKED THE WRONG QUESTION. An earlier version enforced the
 * one-identity rule only when the caller had supplied an identity — so a
 * CAPTURE_SHOWN carrying NEITHER passed, and the run recorded that a capture was
 * shown without recording which. That is the silent hole this level forbids
 * everywhere else, and it would have corrupted `capturesShown`, the correction
 * rate computed from it, and the audit trail, all without an error.
 *
 * The rule is a property of the TYPE, so it is stated as one.
 */
const CAPTURE_BEARING: ReadonlySet<CalibrationDecisionType> = new Set([
  CalibrationDecisionType.CAPTURE_SHOWN,
  CalibrationDecisionType.CAPTURE_ACCEPTED,
  CalibrationDecisionType.CAPTURE_REJECTED,
  CalibrationDecisionType.CAPTURE_SKIPPED,
]);

function requireSubjectForType(input: CalibrationDecisionInput): void {
  const named = input.snapshotId !== undefined || input.waybackTimestamp !== undefined;
  if (CAPTURE_BEARING.has(input.type)) {
    // Throws unless EXACTLY one identity is present.
    requireObservationSubject(input);
    return;
  }
  if (named) {
    throw new Error(
      `${input.type} is not about a capture and must not name one. A decision that names a ` +
        'capture it is not about makes the log answer a question it was never asked.',
    );
  }
}

/**
 * Append one decision, or refuse.
 *
 * THE UNIQUE INDEX IS THE COMPARE-AND-SET. Two browsers folding the same run
 * both compute version N and both insert sequence N+1; one wins and the other
 * takes a constraint violation, which becomes `StaleCalibrationVersionError`.
 * The read below is a courtesy that gives a better message — it is not what
 * makes this safe, because a check-then-write can always interleave.
 */
export async function appendCalibrationDecision(
  runId: string,
  expectedVersion: number,
  input: CalibrationDecisionInput,
): Promise<CalibrationRunState> {
  const current = await readCalibrationRun(runId);
  if (current.status !== CalibrationRunStatus.OPEN) {
    throw new CalibrationRunClosedError(runId, current.status);
  }
  if (current.version !== expectedVersion) {
    throw new StaleCalibrationVersionError(runId, expectedVersion, current.version);
  }
  if (input.type === CalibrationDecisionType.CAPTURE_SKIPPED && !input.reason) {
    throw new Error(
      'A skipped capture is recorded with its reason. A silent hole in the record is the ' +
        'one outcome this corpus does not permit.',
    );
  }
  if (input.type === CalibrationDecisionType.RULESET_CORRECTED && input.selectors === undefined) {
    throw new Error('RULESET_CORRECTED carries the selectors it corrected the rules to.');
  }
  requireSubjectForType(input);

  // A correction is the only decision that changes what the rules are; every
  // other one restates the rules in force so the fold never has to look back.
  const selectors =
    input.type === CalibrationDecisionType.RULESET_CORRECTED
      ? (input.selectors ?? [])
      : current.selectors;

  await sequencedWrite(runId, expectedVersion, () =>
    prisma.calibrationDecision.create({
      data: {
        calibrationRunId: runId,
        sequence: expectedVersion + 1,
        type: input.type,
        selectors: [...selectors],
        rulesetId: chromeRulesetId({ selectors }),
        snapshotId: input.snapshotId ?? null,
        waybackTimestamp: input.waybackTimestamp ?? null,
        observationId: input.observationId ?? null,
        reason: input.reason ?? null,
      },
    }),
  );

  // A correction names a new view, so give it an identity immediately — the
  // observations taken under it have to hang from something.
  if (input.type === CalibrationDecisionType.RULESET_CORRECTED) {
    await ensureArticleRuleset(prisma, {
      trackedUrlId: current.trackedUrlId,
      selectors,
      researcherId: current.researcherId,
    });
  }

  return readCalibrationRun(runId);
}

/**
 * Record what one ruleset did to one capture.
 *
 * THE ONE SHARED WRITE OF THIS LEVEL. The headless scan calls this too, and that
 * is the point: the null check, the deviation baseline, the audit sample's
 * ordering and the next-capture policy all read the same rows, so they cannot
 * disagree about what a ruleset removed.
 */
export async function recordRulesetObservation(input: {
  articleRulesetId: string;
  snapshotId?: string;
  waybackTimestamp?: string;
  matchCounts: Record<string, number>;
  removalFraction: number;
  derivedTextLength: number;
}): Promise<{ id: string }> {
  const subject = requireObservationSubject(input);
  const data = {
    articleRulesetId: input.articleRulesetId,
    matchCounts: input.matchCounts,
    removalFraction: input.removalFraction,
    derivedTextLength: input.derivedTextLength,
    observedAt: new Date(),
  };
  // Two identities means two unique keys, and Prisma's upsert takes one. The
  // branch is on which identity the caller HAS, which `requireObservationSubject`
  // has already reduced to exactly one.
  if ('snapshotId' in subject) {
    return prisma.rulesetObservation.upsert({
      where: {
        articleRulesetId_snapshotId: {
          articleRulesetId: input.articleRulesetId,
          snapshotId: subject.snapshotId,
        },
      },
      update: data,
      create: { ...data, snapshotId: subject.snapshotId },
      select: { id: true },
    });
  }
  return prisma.rulesetObservation.upsert({
    where: {
      articleRulesetId_waybackTimestamp: {
        articleRulesetId: input.articleRulesetId,
        waybackTimestamp: subject.waybackTimestamp,
      },
    },
    update: data,
    create: { ...data, waybackTimestamp: subject.waybackTimestamp },
    select: { id: true },
  });
}

/**
 * Close the run by putting its rules IN FORCE for the page.
 *
 * THE EFFECT IS THE POINTER MOVE, and nothing else here. Re-deriving the stored
 * captures under the new rules is the scanner's, in step 2b — Level 4's rule is
 * that the UI writes decisions and the backend applies effects, and a commit
 * that also rewrote a thousand rows inline would be this service quietly
 * becoming the scanner.
 *
 * ONE PATH FOR BOTH MODES. A page with stored captures gets them re-derived
 * later; a page with none gets a no-op. That is why there is no mode enum: the
 * effect does not branch, so nothing needed to be told which mode it was.
 */
export async function commitCalibrationRuleset(
  runId: string,
  expectedVersion: number,
): Promise<{ state: CalibrationRunState; articleRulesetId: string; rulesetId: string }> {
  const current = await readCalibrationRun(runId);
  if (current.status !== CalibrationRunStatus.OPEN) {
    throw new CalibrationRunClosedError(runId, current.status);
  }
  if (current.version !== expectedVersion) {
    throw new StaleCalibrationVersionError(runId, expectedVersion, current.version);
  }

  const committed = await sequencedWrite(runId, expectedVersion, () =>
    prisma.$transaction(async (tx) => {
      const ruleset = await ensureArticleRuleset(tx, {
        trackedUrlId: current.trackedUrlId,
        selectors: current.selectors,
        researcherId: current.researcherId,
      });
      await tx.calibrationDecision.create({
        data: {
          calibrationRunId: runId,
          sequence: expectedVersion + 1,
          type: CalibrationDecisionType.RUN_CLOSED,
          selectors: [...current.selectors],
          rulesetId: ruleset.rulesetId,
        },
      });
      await tx.calibrationRun.update({
        where: { id: runId },
        data: {
          status: CalibrationRunStatus.COMMITTED,
          committedRulesetId: ruleset.id,
          closedAt: new Date(),
        },
      });
      await tx.trackedUrl.update({
        where: { id: current.trackedUrlId },
        data: { activeArticleRulesetId: ruleset.id },
      });
      return ruleset;
    }),
  );

  return {
    state: await readCalibrationRun(runId),
    articleRulesetId: committed.id,
    rulesetId: committed.rulesetId,
  };
}

/**
 * Close the run without committing.
 *
 * ABANDONED IS NOT COMMITTED-WITH-NOTHING. A run that produced no ruleset is a
 * fact about the calibration — the researcher looked and decided the rules were
 * not ready — and the page's rules stay exactly as they were.
 */
export async function abandonCalibrationRun(
  runId: string,
  expectedVersion: number,
): Promise<CalibrationRunState> {
  const current = await readCalibrationRun(runId);
  if (current.status !== CalibrationRunStatus.OPEN) {
    throw new CalibrationRunClosedError(runId, current.status);
  }
  if (current.version !== expectedVersion) {
    throw new StaleCalibrationVersionError(runId, expectedVersion, current.version);
  }
  await sequencedWrite(runId, expectedVersion, () =>
    prisma.$transaction(async (tx) => {
      await tx.calibrationDecision.create({
        data: {
          calibrationRunId: runId,
          sequence: expectedVersion + 1,
          type: CalibrationDecisionType.RUN_CLOSED,
          selectors: [...current.selectors],
          rulesetId: current.rulesetId,
        },
      });
      await tx.calibrationRun.update({
        where: { id: runId },
        data: { status: CalibrationRunStatus.ABANDONED, closedAt: new Date() },
      });
    }),
  );
  return readCalibrationRun(runId);
}

/**
 * Prisma's unique-constraint failure, without importing its error class shape.
 *
 * NO ASSERTION AFTER THE `in` NARROWING. `'code' in err` already gives `err` a
 * `code` of type `unknown`, so casting to `{ code: unknown }` re-states what the
 * compiler has just proved — and `no-unnecessary-type-assertion` is type-aware,
 * so it saw that in CI while this laptop's eslint reported nothing at all. See
 * [[gf-lint-baseline-is-cis-not-the-laptops]]: the local pass goes SILENT on
 * type-aware rules rather than disagreeing, which is why the baseline is never
 * updated from here.
 */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

/**
 * Run a write that claims sequence `expectedVersion + 1`, translating the
 * collision into the error that says what actually happened.
 *
 * ONE RULE, ONE IMPLEMENTATION. Three write paths claim a sequence — appending a
 * decision, committing and abandoning — and an earlier version translated the
 * collision in only the first. The other two would have surfaced a raw Prisma
 * P2002 to a researcher whose browser was simply a version behind, which is the
 * shape this repository names as its dominant defect: one rule with as many
 * implementations as there are callers, and the one that got it wrong is the one
 * nobody exercised.
 */
async function sequencedWrite<T>(
  runId: string,
  expectedVersion: number,
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const actual = await readCalibrationRun(runId);
    // ONLY IF THE VERSION ACTUALLY MOVED. A commit also upserts an
    // `ArticleRuleset`, whose own unique key can collide for reasons that have
    // nothing to do with this run's sequence — and reporting "you are a version
    // behind" for that would be an accurate-sounding sentence answering a
    // question nobody asked, which is how a real cause gets buried. If the
    // sequence did not move, the original error is the true one.
    if (actual.version !== expectedVersion) {
      throw new StaleCalibrationVersionError(runId, expectedVersion, actual.version);
    }
    throw err;
  }
}
