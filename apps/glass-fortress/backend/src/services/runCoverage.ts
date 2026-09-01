import { CalibrationDecisionType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { readCalibrationRun } from './calibrationRun';
import { CAPTURE_SAMPLE, stratifiedSample } from '../lib/timelineSample';
import { chooseNextCapture, type NextCapturePick } from '../lib/nextCapture';

// ---------------------------------------------------------------------------
// LEVEL 4 — coverage, and what to look at next.
//
// ITS OWN MODULE, AND NOT `captureMarking.ts`, FOR ONE REASON: THE PARSER.
// `captureMarking` renders a capture and derives text under a ruleset, so it
// imports `chromeRulesetApply` and through it jsdom, whose dependency chain is
// ESM-only. Anything importing it inherits that — which is exactly the split
// `chromeRuleset.ts` was made for when the calibration service "became the first
// real consumer of a ruleset's IDENTITY and inherited jsdom with it, failing
// every `unit` suite that imported it."
//
// This was rediscovered the hard way on 2026-09-01 by appending these functions
// to `captureMarking` and watching `articleRuleTools.test.ts` stop parsing. None
// of the work here needs a parser: it reads dates, folds a decision log and
// applies a pure policy.
// ---------------------------------------------------------------------------

export interface CoverageRow {
  snapshotId: string;
  /** `YYYY-MM-DD` — a chat table is unreadable keyed by cuid. */
  date: string;
  /** The verdict recorded for this capture, or null when it has not been judged. */
  verdict: CalibrationDecisionType | null;
}

export interface RunCoverage {
  /** The sample the researcher is working through. */
  rows: CoverageRow[];
  /** Captures stored for this page, of which the sample is a part. */
  storedCaptures: number;
  /**
   * DISTINCT captures judged — the number that leads, always.
   *
   * The marking page once reported two judgements of ONE capture as coverage of
   * two, which is the vacuity this level demotes everywhere else. Coverage is
   * about how many DIFFERENT documents the rules were tested against; episodes
   * are a different fact and are reported separately.
   */
  distinctJudged: number;
  next: NextCapturePick | null;
}

/**
 * What has been covered, and what to look at next.
 *
 * The sample is recomputed from the same `stratifiedSample` the browser's
 * capture list uses, so the tool and the page cannot disagree about what the
 * sample is — which matters, because the policy chooses WITHIN it.
 */
export async function describeRunCoverage(runId: string): Promise<RunCoverage> {
  const state = await readCalibrationRun(runId);
  const all = await prisma.urlSnapshot.findMany({
    where: { trackedUrlId: state.trackedUrlId },
    select: { id: true, capturedAt: true, snapshotDate: true },
    orderBy: { capturedAt: 'asc' },
  });
  const sample = stratifiedSample(all, CAPTURE_SAMPLE);

  const verdicts = new Map(state.judgedCaptures.map((j) => [j.snapshotId, j.verdict]));
  const rows: CoverageRow[] = sample.map((s) => ({
    snapshotId: s.id,
    date: s.snapshotDate,
    verdict: verdicts.get(s.id) ?? null,
  }));

  return {
    rows,
    storedCaptures: all.length,
    // Counted over the SAMPLE, not over every verdict the run holds: coverage is
    // a statement about the set being worked through.
    distinctJudged: rows.filter((r) => r.verdict !== null).length,
    next: chooseNextCapture(
      sample.map((s) => ({ snapshotId: s.id, capturedAt: s.capturedAt })),
      [...verdicts.keys()],
    ),
  };
}
