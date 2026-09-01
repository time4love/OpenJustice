// ---------------------------------------------------------------------------
// LEVEL 4 — the survival check, tested at the two seams that were wrong once.
//
// THE FIRST RUN OF THIS TOOL REPORTED `intact: 7` HAVING TESTED THREE. Both
// defects that produced it are held here: a comparison that could not fail being
// counted as a pass, and a selector whose anchor was never recorded going
// unrecovered — which is what emptied the suspect sets in the first place.
//
// `chromeRulesetApply` is mocked, not exercised: it brings jsdom, and this file
// is about the accounting rather than the extraction.
// ---------------------------------------------------------------------------

const mockDerive = jest.fn();
jest.mock('../src/lib/chromeRulesetApply', () => ({ deriveTextUnderRuleset: mockDerive }));

const mockReadRun = jest.fn();
jest.mock('../src/services/calibrationRun', () => ({ readCalibrationRun: mockReadRun }));

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    calibrationDecision: { findMany: jest.fn() },
    urlSnapshot: { findMany: jest.fn(), findUnique: jest.fn() },
  },
}));

import { prisma } from '../src/lib/prisma';
import { CalibrationDecisionType } from '@prisma/client';
import { checkRulesetSurvival } from '../src/services/rulesetSurvival';

const OLD = { id: 'snap-2020', snapshotDate: '2020-12-09' };
const NEW = { id: 'snap-2022', snapshotDate: '2022-05-23' };

function setup(options: { decisions: unknown[]; selectors: string[]; textByCount: Record<number, string> }) {
  mockReadRun.mockResolvedValue({ trackedUrlId: 'url-1', selectors: options.selectors });
  (prisma.calibrationDecision.findMany as jest.Mock).mockResolvedValue(options.decisions);
  (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue([OLD, NEW]);
  (prisma.urlSnapshot.findUnique as jest.Mock).mockResolvedValue({
    document: Buffer.from('<html></html>'),
    documentContentType: 'text/html',
    documentContentEncoding: 'utf-8',
  });
  mockDerive.mockImplementation((_d: unknown, _t: unknown, _e: unknown, ruleset: { selectors: string[] }) => ({
    text: options.textByCount[ruleset.selectors.length] ?? '',
    chrome: { removedSegments: [] },
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the survival check — a comparison that did not happen is not a pass', () => {
  // THE DEFECT THIS TEST EXISTS FOR. With no suspect selector the baseline IS the
  // current ruleset, so the check compares a capture with itself and finds it
  // identical — which it will do for any input, forever. Counting that as intact
  // is a check reporting safety it never looked for.
  it('does not count an untested capture as intact', async () => {
    setup({
      // Every selector anchored to the OLD capture, so the NEW one has no
      // untested selector and the OLD one has none from its future either.
      decisions: [
        { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad'], snapshotId: OLD.id },
      ],
      selectors: ['.ad'],
      textByCount: { 1: 'body text' },
    });

    const report = await checkRulesetSurvival('run-1');
    expect(report.capturesChecked).toBe(2);
    expect(report.notTested).toBe(2);
    expect(report.intact).toBe(0);
    expect(report.alerts).toBe(0);
    expect(report.captures.every((capture) => !capture.tested)).toBe(true);
  });

  it('counts a capture as intact only when something was actually tried against it', async () => {
    setup({
      decisions: [
        { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad'], snapshotId: OLD.id },
        { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad', '.share'], snapshotId: NEW.id },
      ],
      selectors: ['.ad', '.share'],
      // The 2022 selector removes nothing from the 2020 page: same text either way.
      textByCount: { 1: 'body text', 2: 'body text' },
    });

    const report = await checkRulesetSurvival('run-1');
    const old = report.captures.find((capture) => capture.snapshotDate === '2020-12-09');
    expect(old?.tested).toBe(true);
    expect(old?.suspectSelectors).toEqual([{ selector: '.share', anchoredTo: '2022-05-23' }]);
    expect(report.intact).toBe(1);
    expect(report.notTested).toBe(1);
  });

  it('alerts when a selector from a capture\'s future removes text from it', async () => {
    setup({
      decisions: [
        { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad'], snapshotId: OLD.id },
        { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad', '.share'], snapshotId: NEW.id },
      ],
      selectors: ['.ad', '.share'],
      textByCount: { 1: 'headline\nthe article body', 2: 'headline' },
    });

    const report = await checkRulesetSurvival('run-1');
    const old = report.captures.find((capture) => capture.snapshotDate === '2020-12-09');
    expect(old?.survived).toBe(false);
    expect(old?.noLongerKept).toEqual(['the article body']);
    expect(report.alerts).toBe(1);
  });

  // WHAT EMPTIED EVERY SUSPECT SET ON THE FIRST RUN. `RULESET_CORRECTED` was
  // forbidden to name a capture, so no selector had an anchor. It is recoverable
  // exactly: judge_article_capture promotes the correction and THEN records the
  // verdict for the same capture, so the anchor is the next decision that names
  // one.
  it('recovers the anchor of a correction written before corrections carried a capture', async () => {
    setup({
      decisions: [
        { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad'], snapshotId: OLD.id },
        { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad', '.share'], snapshotId: null },
        { type: CalibrationDecisionType.CAPTURE_ACCEPTED, selectors: ['.ad', '.share'], snapshotId: NEW.id },
      ],
      selectors: ['.ad', '.share'],
      textByCount: { 1: 'body text', 2: 'body text' },
    });

    const report = await checkRulesetSurvival('run-1');
    const old = report.captures.find((capture) => capture.snapshotDate === '2020-12-09');
    // Without recovery this is `anchoredTo: null`, the suspect set is empty, and
    // the capture is silently untested.
    expect(old?.suspectSelectors).toEqual([{ selector: '.share', anchoredTo: '2022-05-23' }]);
    expect(old?.tested).toBe(true);
  });
});
