// ---------------------------------------------------------------------------
// LEVEL 4, build order step 10 — WHERE A DETECTION BECOMES A DECISION.
//
// The two answers are deliberately asymmetric and the tests hold that:
// only REDESIGN creates anything, and no number of bad captures adds up to a
// structural claim.
// ---------------------------------------------------------------------------

const mockAppend = jest.fn();
jest.mock('../src/services/captureMarking', () => ({
  appendDecisionWithObservation: mockAppend,
}));

// `articleRuleTools` statically imports a chain reaching `archiveText` and so
// jsdom, whose dependency chain is ESM-only. The existing tool suite mocks the
// same module for the same reason.
jest.mock('../src/services/fetchContentForRelevanceCheck', () => ({
  fetchContentForRelevanceCheck: jest.fn(),
}));

const mockDescribe = jest.fn();
jest.mock('../src/services/calibrationRun', () => ({
  describeCalibrationRun: mockDescribe,
}));

import { CalibrationDecisionType } from '@prisma/client';
import { resolveEraBoundaryHandler } from '../src/mcp/tools/articleRuleTools';

const RUN = 'run-1';
const SNAP = 'snap-2021';

function openRun(selectors: string[] = ['.ad', '.footer']) {
  mockDescribe.mockResolvedValue({
    state: { status: 'OPEN', version: 7, selectors },
  });
}

const parse = (json: string) => JSON.parse(json) as Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockAppend.mockResolvedValue({});
});

describe('resolve_era_boundary — the only way an era comes into existence', () => {
  it('REDESIGN writes an ERA_BOUNDARY naming the capture', async () => {
    openRun();
    const out = parse(await resolveEraBoundaryHandler({ runId: RUN, snapshotId: SNAP, resolution: 'REDESIGN' }));

    expect(mockAppend).toHaveBeenCalledWith(RUN, 7, {
      type: CalibrationDecisionType.ERA_BOUNDARY,
      snapshotId: SNAP,
    });
    expect(out['recorded']).toBe('REDESIGN');
    expect(out['eraOpened']).toBe(true);
  });

  // THE ASYMMETRY. A truncated archive page and a redesign look identical to a
  // match rate, and only one of them is a structural claim about the page.
  it('BAD_CAPTURE writes a SKIP and opens no era', async () => {
    openRun();
    const out = parse(
      await resolveEraBoundaryHandler({
        runId: RUN,
        snapshotId: SNAP,
        resolution: 'BAD_CAPTURE',
        reason: 'truncated archive capture',
      }),
    );

    expect(mockAppend).toHaveBeenCalledWith(RUN, 7, {
      type: CalibrationDecisionType.CAPTURE_SKIPPED,
      snapshotId: SNAP,
      reason: 'truncated archive capture',
    });
    expect(out['eraOpened']).toBe(false);
  });

  // No number of bad captures adds up to a boundary — an archive outage is a real
  // pattern, and an earlier draft would have declared a redesign after k of them.
  it('however many consecutive bad captures occur, none of them opens an era', async () => {
    openRun();
    for (let i = 0; i < 5; i += 1) {
      await resolveEraBoundaryHandler({
        runId: RUN,
        snapshotId: `snap-${String(i)}`,
        resolution: 'BAD_CAPTURE',
        reason: 'paywall redirect',
      });
    }
    const types = mockAppend.mock.calls.map((call) => (call[2] as { type: string }).type);
    expect(types).toEqual(Array(5).fill(CalibrationDecisionType.CAPTURE_SKIPPED));
    expect(types).not.toContain(CalibrationDecisionType.ERA_BOUNDARY);
  });

  // A SILENT HOLE IN THE RECORD IS THE ONE OUTCOME THIS CORPUS DOES NOT PERMIT.
  it('refuses BAD_CAPTURE with no reason, and with a blank one', async () => {
    openRun();
    for (const reason of [undefined, '   ']) {
      const out = parse(
        await resolveEraBoundaryHandler({ runId: RUN, snapshotId: SNAP, resolution: 'BAD_CAPTURE', reason }),
      );
      expect(out['error']).toContain('reason');
    }
    expect(mockAppend).not.toHaveBeenCalled();
  });

  // THE TOOL DERIVES NOTHING. An earlier design seeded the new era with the
  // selectors that still matched — a ruleset nobody approved, sitting in the log
  // looking exactly like one that had. After a boundary the rules have not
  // changed; the PAGE has.
  it('never supplies selectors, so the log carries the previous era forward untouched', async () => {
    openRun(['.ad', '.footer', '.share']);
    await resolveEraBoundaryHandler({ runId: RUN, snapshotId: SNAP, resolution: 'REDESIGN' });
    expect(mockAppend.mock.calls[0]?.[2]).not.toHaveProperty('selectors');
  });

  it('refuses a run that is no longer open', async () => {
    mockDescribe.mockResolvedValue({ state: { status: 'COMMITTED', version: 9, selectors: [] } });
    const out = parse(await resolveEraBoundaryHandler({ runId: RUN, snapshotId: SNAP, resolution: 'REDESIGN' }));
    expect(out['error']).toContain('COMMITTED');
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it('reports a missing run as a missing run, not as a failed write', async () => {
    mockDescribe.mockRejectedValue(new Error('not found'));
    const out = parse(await resolveEraBoundaryHandler({ runId: RUN, snapshotId: SNAP, resolution: 'REDESIGN' }));
    expect(out['error']).toContain('No calibration run');
    expect(mockAppend).not.toHaveBeenCalled();
  });
});
