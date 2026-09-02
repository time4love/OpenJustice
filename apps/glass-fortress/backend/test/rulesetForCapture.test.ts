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
    calibrationReset: { findFirst: jest.fn() },
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
  (prisma.calibrationReset.findFirst as jest.Mock).mockResolvedValue(null);
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

// ---------------------------------------------------------------------------
// A RESET DRAWS A LINE, AND NOTHING BEFORE IT GOVERNS.
//
// The fold's filter is a `createdAt` comparison, so these tests drive it through
// the query rather than asserting on the query: the mock returns only what the
// filter would have returned, and the assertions are about the ERAS produced.
// ---------------------------------------------------------------------------
describe('a reset ends the authority of everything before it', () => {
  it('with no reset, every committed decision governs', async () => {
    setup(
      [{ id: 'run-1', status: CalibrationRunStatus.COMMITTED }],
      [D('run-1', CalibrationDecisionType.RULESET_CORRECTED, ['.old'], 'a')],
    );
    expect(await rulesetForCapture('url-1', '2021-01-01')).toEqual(['.old']);
  });

  it('filters the decision query by the newest reset, not the first', async () => {
    setup([{ id: 'run-1', status: CalibrationRunStatus.COMMITTED }], []);
    const newest = new Date('2026-09-02T12:00:00Z');
    (prisma.calibrationReset.findFirst as jest.Mock).mockResolvedValue({ createdAt: newest });

    await governingEras('url-1');

    // A second reset supersedes the first exactly as it supersedes everything
    // else, so the query orders by `createdAt` DESC and takes one.
    const resetQuery = (prisma.calibrationReset.findFirst as jest.Mock).mock.calls[0]?.[0] as {
      orderBy: { createdAt: string };
    };
    expect(resetQuery.orderBy).toEqual({ createdAt: 'desc' });

    const decisionQuery = (prisma.calibrationDecision.findMany as jest.Mock).mock.calls[0]?.[0] as {
      where: { createdAt?: { gt: Date } };
    };
    expect(decisionQuery.where.createdAt).toEqual({ gt: newest });
  });

  // ERA BOUNDARIES DO NOT SURVIVE A RESET, and this is the case that separates a
  // reset from an abandoned run. A boundary outlives an abandoned RUN because a
  // session is not a page; a reset is often reached for BECAUSE the era structure
  // is wrong, so sparing boundaries would preserve the corruption it was called
  // for. Here the pre-reset log held a boundary and the fold sees one era.
  it('an era boundary recorded before the reset does not survive it', async () => {
    setup([{ id: 'run-1', status: CalibrationRunStatus.COMMITTED }], []);
    (prisma.calibrationReset.findFirst as jest.Mock).mockResolvedValue({
      createdAt: new Date('2026-09-02T12:00:00Z'),
    });
    // The filtered query returns nothing: the boundary and its rules are both
    // behind the line.
    const eras = await governingEras('url-1');
    expect(eras).toEqual([{ startDate: null, selectors: [] }]);
  });

  it('decisions recorded after the reset govern normally', async () => {
    setup(
      [{ id: 'run-2', status: CalibrationRunStatus.COMMITTED }],
      [
        D('run-2', CalibrationDecisionType.RULESET_CORRECTED, ['.fresh'], 'a'),
        D('run-2', CalibrationDecisionType.ERA_BOUNDARY, ['.fresh'], 'b'),
      ],
      { b: '2022-05-23' },
    );
    (prisma.calibrationReset.findFirst as jest.Mock).mockResolvedValue({
      createdAt: new Date('2026-09-02T12:00:00Z'),
    });
    const eras = await governingEras('url-1');
    expect(eras).toEqual([
      { startDate: null, selectors: ['.fresh'] },
      { startDate: '2022-05-23', selectors: ['.fresh'] },
    ]);
  });
});
