// ---------------------------------------------------------------------------
// LEVEL 4, build order step 2 — WHICH RULES GOVERN A CAPTURE.
//
// Two researcher rulings are held here, and they are not the same rule:
// eras fold across RUNS, and a BOUNDARY survives its run being abandoned while
// the RULES do not.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    calibrationRun: { findMany: jest.fn() },
    calibrationDecision: { findMany: jest.fn() },
    urlSnapshot: { findMany: jest.fn() },
  },
}));

import { prisma } from '../src/lib/prisma';
import { CalibrationDecisionType, CalibrationRunStatus } from '@prisma/client';
import { governingEras, rulesetForCapture } from '../src/services/rulesetForCapture';

const D = (
  calibrationRunId: string,
  type: CalibrationDecisionType,
  selectors: string[],
  snapshotId: string | null = null,
) => ({ calibrationRunId, type, selectors, snapshotId });

function setup(runs: { id: string; status: CalibrationRunStatus }[], decisions: unknown[], dates: Record<string, string> = {}) {
  (prisma.calibrationRun.findMany as jest.Mock).mockResolvedValue(runs);
  (prisma.calibrationDecision.findMany as jest.Mock).mockResolvedValue(decisions);
  (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue(
    Object.entries(dates).map(([id, snapshotDate]) => ({ id, snapshotDate })),
  );
}

beforeEach(() => { jest.clearAllMocks(); });

describe('governingEras — a run is a session, an era is a property of the page', () => {
  it('an uncalibrated URL has no eras, and no rules', async () => {
    setup([], []);
    expect(await governingEras('url-1')).toEqual([]);
    expect(await rulesetForCapture('url-1', '2020-12-09')).toEqual([]);
  });

  // ERAS FOLD ACROSS RUNS. If an era were a run, abandoning one and reopening it
  // would destroy or create an era — a scheduling artefact deciding which rules
  // apply to evidence.
  it('folds decisions from several committed runs into one timeline', async () => {
    setup(
      [
        { id: 'run-1', status: CalibrationRunStatus.COMMITTED },
        { id: 'run-2', status: CalibrationRunStatus.COMMITTED },
      ],
      [
        D('run-1', CalibrationDecisionType.RULESET_CORRECTED, ['.ad'], 'a'),
        D('run-2', CalibrationDecisionType.ERA_BOUNDARY, ['.ad'], 'b'),
        D('run-2', CalibrationDecisionType.RULESET_CORRECTED, ['.ad', '.share'], 'b'),
      ],
      { b: '2022-05-23' },
    );
    const eras = await governingEras('url-1');
    expect(eras).toEqual([
      { startDate: null, selectors: ['.ad'] },
      { startDate: '2022-05-23', selectors: ['.ad', '.share'] },
    ]);
  });

  // THE RULES OF AN UNCOMMITTED RUN ARE NOT IN FORCE. Only committing puts them
  // there — the same reason `activeArticleRulesetId` moves only on commit.
  it('ignores the corrections of an OPEN or ABANDONED run', async () => {
    setup(
      [
        { id: 'run-1', status: CalibrationRunStatus.COMMITTED },
        { id: 'run-2', status: CalibrationRunStatus.OPEN },
        { id: 'run-3', status: CalibrationRunStatus.ABANDONED },
      ],
      [
        D('run-1', CalibrationDecisionType.RULESET_CORRECTED, ['.ad'], 'a'),
        D('run-2', CalibrationDecisionType.RULESET_CORRECTED, ['.ad', '.draft'], 'a'),
        D('run-3', CalibrationDecisionType.RULESET_CORRECTED, ['.ad', '.abandoned'], 'a'),
      ],
    );
    expect(await rulesetForCapture('url-1', '2021-01-01')).toEqual(['.ad']);
  });

  // A BOUNDARY IS NOT A RULE. Abandoning says "do not apply these rules"; it does
  // not un-observe that the page was redesigned on that date.
  it('keeps an ERA_BOUNDARY recorded by a run that was later abandoned', async () => {
    setup(
      [
        { id: 'run-1', status: CalibrationRunStatus.COMMITTED },
        { id: 'run-2', status: CalibrationRunStatus.ABANDONED },
      ],
      [
        D('run-1', CalibrationDecisionType.RULESET_CORRECTED, ['.ad'], 'a'),
        D('run-2', CalibrationDecisionType.ERA_BOUNDARY, [], 'b'),
        D('run-2', CalibrationDecisionType.RULESET_CORRECTED, ['.nope'], 'b'),
      ],
      { b: '2022-05-23' },
    );
    const eras = await governingEras('url-1');
    expect(eras).toHaveLength(2);
    expect(eras[1]?.startDate).toBe('2022-05-23');
    // The boundary survived; the abandoned run's RULES did not, so the new era
    // carries only what the boundary itself recorded.
    expect(eras[1]?.selectors).toEqual([]);
    // And the era before it is untouched.
    expect(await rulesetForCapture('url-1', '2021-01-01')).toEqual(['.ad']);
  });

  it('selects by date, so a capture before the boundary keeps the old rules', async () => {
    setup(
      [{ id: 'run-1', status: CalibrationRunStatus.COMMITTED }],
      [
        D('run-1', CalibrationDecisionType.RULESET_CORRECTED, ['.old'], 'a'),
        D('run-1', CalibrationDecisionType.ERA_BOUNDARY, ['.new'], 'b'),
      ],
      { b: '2022-05-23' },
    );
    expect(await rulesetForCapture('url-1', '2022-05-22')).toEqual(['.old']);
    expect(await rulesetForCapture('url-1', '2022-05-23')).toEqual(['.new']);
  });
});
