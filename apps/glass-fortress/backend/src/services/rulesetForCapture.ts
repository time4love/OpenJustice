import { prisma } from '../lib/prisma';
import { CalibrationDecisionType, CalibrationRunStatus } from '@prisma/client';
import { deriveEras, eraForDate, type FoldableDecision } from '../lib/calibrationFold';

/**
 * WHICH RULES GOVERN A CAPTURE — the question every derivation has to answer and
 * nothing could answer until now.
 *
 * A ruleset was marked, corrected, approved and versioned, and then applied to
 * nothing: `deriveTextUnderRuleset` had three callers and all of them were the
 * marking page or a check, while `recordCapture` derived with no ruleset at all
 * and `TrackedUrl.activeArticleRulesetId` was written and never read (I16).
 * This is the lookup that connects the two.
 *
 * TWO RULES DECIDED BY THE RESEARCHER 2026-09-01, and they are not the same rule:
 *
 * ERAS FOLD OVER THE URL'S DECISIONS ACROSS RUNS, not per run. A run is a
 * WORKING SESSION and an era is a property of the PAGE. If an era were a run,
 * abandoning one and reopening it would destroy or create an era — a scheduling
 * artefact deciding which rules apply to evidence, which is the same error as
 * counting showings as coverage.
 *
 * A BOUNDARY SURVIVES ITS RUN BEING ABANDONED; the RULES do not. Abandoning says
 * "do not apply these rules" — but a boundary is not a rule. It is the
 * researcher's observation that the page was redesigned on that date, and that
 * stays true whether or not the calibration that noticed it was ever finished.
 *
 * So the fold sees: every decision of a COMMITTED run, plus every `ERA_BOUNDARY`
 * from any run whatsoever. An OPEN run's corrections are excluded for the same
 * reason an abandoned one's are — only committing puts rules in force.
 */

/** An era, reduced to what governance needs. Deliberately no `confirmed`. */
export interface GoverningEra {
  /** `null` on the first era, which extends backwards to the start of time. */
  startDate: string | null;
  selectors: readonly string[];
}

/**
 * The eras governing a URL, oldest first.
 *
 * IT RETURNS NO `confirmed` FLAG, ON PURPOSE. This folds a FILTERED log — an
 * open run's judgements are not here — so a streak computed over it would be a
 * number that looks like the run view's and disagrees with it. A field that
 * cannot mean what its name says is worse than an absent one.
 */
export async function governingEras(trackedUrlId: string): Promise<GoverningEra[]> {
  const runs = await prisma.calibrationRun.findMany({
    where: { trackedUrlId },
    select: { id: true, status: true },
  });
  if (runs.length === 0) return [];

  const committed = new Set(
    runs.filter((run) => run.status === CalibrationRunStatus.COMMITTED).map((run) => run.id),
  );

  const decisions = await prisma.calibrationDecision.findMany({
    where: { calibrationRunId: { in: runs.map((run) => run.id) } },
    // ACROSS RUNS, SO `sequence` IS NOT ENOUGH — it restarts per run. `createdAt`
    // orders the URL's whole history and `sequence` breaks ties within a run.
    orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }],
    select: { type: true, selectors: true, snapshotId: true, calibrationRunId: true },
  });

  const governing: FoldableDecision[] = decisions
    .filter(
      (decision) =>
        decision.type === CalibrationDecisionType.ERA_BOUNDARY ||
        committed.has(decision.calibrationRunId),
    )
    .map(({ type, selectors, snapshotId }) => ({ type, selectors, snapshotId }));

  const eras = deriveEras(governing);

  // The log names captures; only the capture knows its date.
  const startIds = eras.map((era) => era.startsAtSnapshotId).filter((id) => id !== null);
  const dates = new Map(
    startIds.length === 0
      ? []
      : (
          await prisma.urlSnapshot.findMany({
            where: { id: { in: startIds } },
            select: { id: true, snapshotDate: true },
          })
        ).map((snapshot) => [snapshot.id, snapshot.snapshotDate]),
  );

  return eras.map((era) => ({
    startDate: era.startsAtSnapshotId === null ? null : (dates.get(era.startsAtSnapshotId) ?? null),
    selectors: era.selectors,
  }));
}

/**
 * The selectors governing one capture, by its date.
 *
 * EMPTY IS A REAL ANSWER AND NOT A FAILURE: a URL with no committed calibration
 * has no rules, and deriving under an empty ruleset is exactly what the pipeline
 * did before this existed. `applyChromeRuleset` short-circuits on it, so an
 * uncalibrated URL costs nothing and behaves as it always has.
 */
export async function rulesetForCapture(
  trackedUrlId: string,
  snapshotDate: string,
): Promise<readonly string[]> {
  return eraForDate(await governingEras(trackedUrlId), snapshotDate)?.selectors ?? [];
}
