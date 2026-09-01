// ---------------------------------------------------------------------------
// LEVEL 4 — the three tools, tested at the seams that can actually be wrong.
//
// The tools are thin over one service, so this file does not re-test the fold.
// What it tests is what only exists HERE: which precondition each tool enforces,
// that the confirmation sentence is RENDERED rather than authored, and that a
// null correction rate survives the trip to the model as null.
//
// THE PRECONDITIONS ARE THE WHOLE REASON THERE ARE THREE TOOLS. "A wrong enum
// value is representable, a wrong tool is not" only holds if each tool actually
// refuses the case that belongs to the other one.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn() },
    calibrationRun: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    articleRuleset: { findUnique: jest.fn() },
    urlSnapshot: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    rulesetObservation: { findMany: jest.fn() },
  },
}));

const mockAdmitUrl = jest.fn();
jest.mock('../src/services/admitUrl', () => ({ admitUrl: mockAdmitUrl }));
jest.mock('../src/services/fetchContentForRelevanceCheck', () => ({
  fetchContentForRelevanceCheck: jest.fn(),
}));

const mockResearcherId = jest.fn();
jest.mock('../src/context/researcherContext', () => ({ getResearcherId: mockResearcherId }));

// ONLY THE TWO CLOSERS ARE MOCKED. `describeCalibrationRun` stays real, so every
// assertion below still runs against the actual fold over a decision log — the
// thing that can be wrong. What is stubbed is the write these tools delegate to,
// which `calibrationRun.test.ts` already covers.
const mockCommit = jest.fn();
const mockAbandon = jest.fn();
jest.mock('../src/services/calibrationRun', () => ({
  ...jest.requireActual('../src/services/calibrationRun'),
  commitCalibrationRuleset: (...args: unknown[]) => mockCommit(...args),
  abandonCalibrationRun: (...args: unknown[]) => mockAbandon(...args),
}));

import { CalibrationDecisionType, CalibrationRunStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import {
  calibrateArticleRulesHandler,
  correctArticleRulesHandler,
  getArticleRulesHandler,
  nextArticleCaptureHandler,
  judgeArticleCaptureHandler,
  openArticleCaptureHandler,
  commitArticleRulesHandler,
  abandonArticleRulesHandler,
} from '../src/mcp/tools/articleRuleTools';
import { calibrationEffect, renderApprovalEffect } from '../src/services/approvalEffect';
import { chromeRulesetId } from '../src/lib/chromeRuleset';

interface CoverageShape {
  distinctCapturesJudged?: number;
  judgements?: number;
  sampleSize?: number;
  captures?: { date: string; snapshotId: string; verdict: string | null }[];
}

interface Parsed {
  error?: string;
  removedSample?: { selector: string; sample: string; fullLength: number }[];
  captureUrl?: string;
  rulesStillMatching?: string;
  alreadyJudged?: string | null;
  whatTheNumbersDoNotSay?: string;
  recorded?: string;
  next?: string;
  coverage?: CoverageShape;
  nextCapture?: { date?: string; why?: string; daysFromNearestJudged?: number } | null;
  stopping?: string;
  message?: string;
  status?: string;
  rulesetId?: string;
  capturesRederived?: number;
  applied?: string;
  keptRecord?: string;
  hint?: string;
  runId?: string;
  markingUrl?: string;
  storedCaptures?: number;
  effect?: string;
  correctionRate?: number | null;
  stoppingIndicator?: string;
  selectors?: string[];
  staleSelectors?: { selector: string }[];
}

function decisions(types: CalibrationDecisionType[], selectors: string[] = []) {
  return types.map((type, i) => ({
    id: `d${String(i)}`,
    calibrationRunId: 'run-1',
    sequence: i + 1,
    type,
    selectors,
    rulesetId: chromeRulesetId({ selectors }),
    snapshotId: null,
    waybackTimestamp: null,
    observationId: null,
    reason: null,
    createdAt: new Date('2026-08-31T00:00:00Z'),
  }));
}

function armRun(types: CalibrationDecisionType[], selectors: string[] = []) {
  (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue({
    id: 'run-1',
    trackedUrlId: 'url-1',
    researcherId: 'res-1',
    status: CalibrationRunStatus.OPEN,
    seededFromRulesetId: null,
    committedRulesetId: null,
    createdAt: new Date(),
    closedAt: null,
    decisions: decisions(types, selectors),
  });
}

beforeEach(() => {
  mockCommit.mockReset();
  mockAbandon.mockReset();
  mockResearcherId.mockReturnValue('res-1');
  (prisma.calibrationRun.create as jest.Mock).mockResolvedValue({ id: 'run-1' });
  // `discardCalibrationDraft` clears the draft after promoting it. Unmocked, it
  // throws and the verdict never lands — which is how this was first caught.
  (prisma.calibrationRun.update as jest.Mock).mockResolvedValue({
    draftSelectors: [],
    draftSnapshotId: null,
    draftReturnedAt: null,
  });
  (prisma.articleRuleset.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.urlSnapshot.count as jest.Mock).mockResolvedValue(0);
  // Coverage reads the snapshots to build the sample. Empty by default: these
  // tests are about the tools' seams, not about the sampler.
  (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.rulesetObservation.findMany as jest.Mock).mockResolvedValue([]);
  armRun([CalibrationDecisionType.RUN_OPENED]);
});

describe('calibrate_article_rules — the tool for a page not yet in the corpus', () => {
  it('admits the URL first, because this tool can bring one into the corpus', async () => {
    mockAdmitUrl.mockResolvedValue({ admitted: true, trackedUrlId: 'url-1', alreadyTracked: false });
    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue({
      id: 'url-1',
      activeArticleRuleset: null,
    });

    const out = JSON.parse(await calibrateArticleRulesHandler({ url: 'https://example.gov/a' })) as Parsed;

    // The mission gate must be on the researcher's path, not only the website's.
    expect(mockAdmitUrl).toHaveBeenCalled();
    expect(out.runId).toBe('run-1');
    expect(out.markingUrl).toContain('/article-rules/run-1');
  });

  it('refuses an off-mission URL without opening a run', async () => {
    mockAdmitUrl.mockResolvedValue({ admitted: false, verdict: 'OFF_MISSION', reason: 'unrelated' });

    const out = JSON.parse(await calibrateArticleRulesHandler({ url: 'https://example.com/x' })) as Parsed;

    expect(out.error).toMatch(/not relevant/i);
    expect(prisma.calibrationRun.create).not.toHaveBeenCalled();
  });

  it('refuses when no researcher is in context — a mark is an attributed judgement', async () => {
    mockResearcherId.mockReturnValue(null);
    const out = JSON.parse(await calibrateArticleRulesHandler({ url: 'https://example.gov/a' })) as Parsed;
    expect(out.error).toMatch(/attributed to a researcher/i);
    expect(mockAdmitUrl).not.toHaveBeenCalled();
  });
});

describe('correct_article_rules — the tool for a page already scanned', () => {
  it('DOES NOT re-admit a URL already in the corpus', async () => {
    (prisma.trackedUrl.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'url-1', _count: { snapshots: 12 } })
      .mockResolvedValueOnce({ id: 'url-1', activeArticleRuleset: null });
    (prisma.urlSnapshot.count as jest.Mock).mockResolvedValue(12);

    const out = JSON.parse(await correctArticleRulesHandler({ url: 'https://example.gov/a' })) as Parsed;

    // Re-admitting spends a fetch and a model call to write a second verdict
    // about a page whose admission was never in question.
    expect(mockAdmitUrl).not.toHaveBeenCalled();
    expect(out.runId).toBe('run-1');
    expect(out.storedCaptures).toBe(12);
  });

  it('refuses a URL that is not in the corpus, and names the other tool', async () => {
    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue(null);

    const out = JSON.parse(await correctArticleRulesHandler({ url: 'https://example.gov/new' })) as Parsed;

    expect(out.error).toMatch(/calibrate_article_rules/);
    expect(prisma.calibrationRun.create).not.toHaveBeenCalled();
  });

  it('refuses a tracked URL that holds NO captures — there is nothing to mark against', async () => {
    // The precondition that makes this a different tool rather than a different
    // enum value. Correcting rules against nothing is vacuity.
    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue({
      id: 'url-1',
      _count: { snapshots: 0 },
    });

    const out = JSON.parse(await correctArticleRulesHandler({ url: 'https://example.gov/a' })) as Parsed;

    expect(out.error).toMatch(/nothing to mark against/i);
    expect(out.storedCaptures).toBe(0);
    expect(prisma.calibrationRun.create).not.toHaveBeenCalled();
  });
});

describe('the confirmation is RENDERED from the declaration, never authored beside it', () => {
  it('says what committing writes, and that it is reversible', async () => {
    mockAdmitUrl.mockResolvedValue({ admitted: true, trackedUrlId: 'url-1', alreadyTracked: true });
    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue({
      id: 'url-1',
      activeArticleRuleset: null,
    });
    (prisma.urlSnapshot.count as jest.Mock).mockResolvedValue(40);

    const out = JSON.parse(await calibrateArticleRulesHandler({ url: 'https://example.gov/a' })) as Parsed;

    // Byte-for-byte the renderer's output: nobody composed a second sentence.
    expect(out.effect).toBe(renderApprovalEffect(calibrationEffect(40)));
    expect(out.effect).toContain('40 stored captures');
    expect(out.effect).toContain('Reversible');
  });

  it('never claims a capture is written — calibration writes none', async () => {
    mockAdmitUrl.mockResolvedValue({ admitted: true, trackedUrlId: 'url-1', alreadyTracked: true });
    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue({
      id: 'url-1',
      activeArticleRuleset: null,
    });
    (prisma.urlSnapshot.count as jest.Mock).mockResolvedValue(3);

    const out = JSON.parse(await calibrateArticleRulesHandler({ url: 'https://example.gov/a' })) as Parsed;

    // The difference a researcher is entitled to see stated rather than inferred.
    expect(out.effect).not.toMatch(/write \d+ captures?/);
    expect(out.effect).toContain('save the ruleset');
  });
});

describe('get_article_rules', () => {
  it('passes a null correction rate through AS NULL, and says what null means', async () => {
    armRun([CalibrationDecisionType.RUN_OPENED]);
    const out = JSON.parse(await getArticleRulesHandler({ runId: 'run-1' })) as Parsed;

    expect(out.correctionRate).toBeNull();
    expect(out.stoppingIndicator).toMatch(/says nothing about the rules/i);
  });

  it('warns that a clean streak is only informative on an adversarial sample', async () => {
    armRun([
      CalibrationDecisionType.RUN_OPENED,
      CalibrationDecisionType.CAPTURE_SHOWN,
      CalibrationDecisionType.CAPTURE_ACCEPTED,
    ]);
    const out = JSON.parse(await getArticleRulesHandler({ runId: 'run-1' })) as Parsed;

    expect(out.correctionRate).toBe(0);
    expect(out.stoppingIndicator).toMatch(/chosen to disagree/i);
  });

  it('answers a missing run rather than throwing a 500 at the model', async () => {
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue(null);
    const out = JSON.parse(await getArticleRulesHandler({ runId: 'nope' })) as Parsed;
    expect(out.error).toMatch(/No calibration run/i);
  });

  it('reports a selector that has stopped matching — what a redesign looks like', async () => {
    armRun([CalibrationDecisionType.RUN_OPENED], ['.ad', 'nav']);
    (prisma.articleRuleset.findUnique as jest.Mock).mockResolvedValue({ id: 'ars-1' });
    (prisma.rulesetObservation.findMany as jest.Mock).mockResolvedValue([
      { matchCounts: { '.ad': 0, nav: 2 }, observedAt: new Date('2026-08-31T00:00:00Z') },
      { matchCounts: { '.ad': 3, nav: 2 }, observedAt: new Date('2026-01-01T00:00:00Z') },
    ]);

    const out = JSON.parse(await getArticleRulesHandler({ runId: 'run-1' })) as Parsed;

    expect(out.staleSelectors?.map((s) => s.selector)).toEqual(['.ad']);
  });
});

// ---------------------------------------------------------------------------
// COMMITTING IS A RESEARCH ACT, AND IT IS APPROVED HERE.
//
// It saves a versioned ruleset and re-derives every stored capture under it.
// Until these tools existed it was reachable only from a web page, which made it
// the one consequential act in this platform authorised somewhere other than the
// researcher's own surface.
// ---------------------------------------------------------------------------

describe('commit_article_rules', () => {
  it('answers rather than throwing when the run does not exist', async () => {
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue(null);

    const out = JSON.parse(await commitArticleRulesHandler({ runId: 'gone' })) as Parsed;

    expect(out.error).toContain('No calibration run');
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it('refuses a run that is already closed, and names its status', async () => {
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header']);
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue({
      ...(await (prisma.calibrationRun.findUnique as jest.Mock)()),
      status: CalibrationRunStatus.COMMITTED,
    });

    const out = JSON.parse(await commitArticleRulesHandler({ runId: 'run-1' })) as Parsed;

    expect(out.status).toBe(CalibrationRunStatus.COMMITTED);
    expect(out.error).toContain('COMMITTED');
    // The refusal must not reach the writer at all.
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it('reads the version itself, because a researcher approving in chat has none', async () => {
    armRun(
      [CalibrationDecisionType.RUN_OPENED, CalibrationDecisionType.CAPTURE_SHOWN],
      ['#header'],
    );
    mockCommit.mockResolvedValue({ rulesetId: 'abc123', articleRulesetId: 'ars-1' });

    await commitArticleRulesHandler({ runId: 'run-1' });

    // Version 2: the newest decision's sequence. The caller supplied nothing.
    expect(mockCommit).toHaveBeenCalledWith('run-1', 2);
  });

  it('reports what was applied, including how many captures were re-derived', async () => {
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header', '#footer']);
    (prisma.urlSnapshot.count as jest.Mock).mockResolvedValue(83);
    mockCommit.mockResolvedValue({ rulesetId: 'abc123', articleRulesetId: 'ars-1' });

    const out = JSON.parse(await commitArticleRulesHandler({ runId: 'run-1' })) as Parsed;

    expect(out.status).toBe('COMMITTED');
    expect(out.rulesetId).toBe('abc123');
    expect(out.capturesRederived).toBe(83);
    expect(out.selectors).toEqual(['#header', '#footer']);
    // RENDERED from the declaration, never authored beside it.
    expect(out.applied).toBe(renderApprovalEffect(calibrationEffect(83)));
  });

  it('surfaces a stale-version refusal as an answer with a way forward', async () => {
    // Another writer moved the run between the read and the write. A silent
    // overwrite is exactly wrong here: somebody else changed the rules.
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header']);
    mockCommit.mockRejectedValue(new Error('Calibration run run-1 is at version 9, not 1.'));

    const out = JSON.parse(await commitArticleRulesHandler({ runId: 'run-1' })) as Parsed;

    expect(out.error).toContain('version 9');
    expect(out.hint).toContain('get_article_rules');
  });
});

describe('abandon_article_rules', () => {
  it('says the RULESET was not saved, never that nothing was', async () => {
    // "Close without saving" was the marking page's own label and it was a lie:
    // accepting a capture DOES save a decision. What abandoning does not save is
    // the ruleset, and the two must not be described as the same thing.
    armRun(
      [
        CalibrationDecisionType.RUN_OPENED,
        CalibrationDecisionType.CAPTURE_SHOWN,
        CalibrationDecisionType.CAPTURE_ACCEPTED,
      ],
      ['#header'],
    );
    mockAbandon.mockResolvedValue({});

    const out = JSON.parse(await abandonArticleRulesHandler({ runId: 'run-1' })) as Parsed;

    expect(out.status).toBe('ABANDONED');
    expect(out.keptRecord).toContain('remain in the log');
    expect(out.applied).toContain('No ruleset was saved');
  });

  it('refuses a closed run without calling the writer', async () => {
    armRun([CalibrationDecisionType.RUN_OPENED]);
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue({
      ...(await (prisma.calibrationRun.findUnique as jest.Mock)()),
      status: CalibrationRunStatus.ABANDONED,
    });

    const out = JSON.parse(await abandonArticleRulesHandler({ runId: 'run-1' })) as Parsed;

    expect(out.error).toContain('ABANDONED');
    expect(mockAbandon).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// next_article_capture — the adaptive half, at the seam between policy and run.
//
// The policy itself is pure and tested in `nextCapture.test.ts`. What only
// exists here is the JOIN: dates rather than cuids, coverage that leads with
// DISTINCT captures, and a stopping rule that is reported rather than enforced.
// ---------------------------------------------------------------------------

function armSnapshots(rows: { id: string; date: string }[]) {
  (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue(
    rows.map((r) => ({
      id: r.id,
      capturedAt: new Date(`${r.date}T00:00:00Z`),
      snapshotDate: r.date,
    })),
  );
}

describe('next_article_capture', () => {
  it('answers rather than throwing when the run does not exist', async () => {
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue(null);
    const out = JSON.parse(await nextArticleCaptureHandler({ runId: 'gone' })) as Parsed;
    expect(out.error).toContain('No calibration run');
  });

  it('reports coverage by DATE, because a chat table keyed by cuid is unreadable', async () => {
    armSnapshots([
      { id: 's1', date: '2020-12-09' },
      { id: 's2', date: '2022-05-23' },
      { id: 's3', date: '2025-03-26' },
    ]);
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header']);

    const out = JSON.parse(await nextArticleCaptureHandler({ runId: 'run-1' })) as Parsed;

    // The ID travels with the date: `open_article_capture` names a capture by
    // snapshotId, so a coverage table without ids can be read and not acted on.
    expect(out.coverage?.captures).toEqual([
      { date: '2020-12-09', snapshotId: 's1', verdict: null },
      { date: '2022-05-23', snapshotId: 's2', verdict: null },
      { date: '2025-03-26', snapshotId: 's3', verdict: null },
    ]);
  });

  it('leads with DISTINCT captures judged, reporting judgements separately', async () => {
    // The page once showed two judgements of ONE capture as coverage of two.
    // Coverage is about how many DIFFERENT documents the rules were tested
    // against; episodes are a different fact and sit behind it.
    armSnapshots([
      { id: 's1', date: '2020-12-09' },
      { id: 's2', date: '2025-03-26' },
    ]);
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue({
      id: 'run-1',
      trackedUrlId: 'url-1',
      researcherId: 'res-1',
      status: CalibrationRunStatus.OPEN,
      seededFromRulesetId: null,
      committedRulesetId: null,
      createdAt: new Date(),
      closedAt: null,
      decisions: [
        ...decisions([CalibrationDecisionType.RUN_OPENED], ['#header']),
        // The SAME capture shown and judged twice.
        { ...decisions([CalibrationDecisionType.CAPTURE_SHOWN], ['#header'])[0], sequence: 2, snapshotId: 's1' },
        { ...decisions([CalibrationDecisionType.CAPTURE_ACCEPTED], ['#header'])[0], sequence: 3, snapshotId: 's1' },
        { ...decisions([CalibrationDecisionType.CAPTURE_SHOWN], ['#header'])[0], sequence: 4, snapshotId: 's1' },
        { ...decisions([CalibrationDecisionType.CAPTURE_ACCEPTED], ['#header'])[0], sequence: 5, snapshotId: 's1' },
      ],
    });

    const out = JSON.parse(await nextArticleCaptureHandler({ runId: 'run-1' })) as Parsed;

    expect(out.coverage?.distinctCapturesJudged).toBe(1);
    expect(out.coverage?.judgements).toBe(2);
  });

  it('recommends the capture furthest from anything judged, and says why', async () => {
    armSnapshots([
      { id: 's1', date: '2020-12-09' },
      { id: 's2', date: '2022-05-23' },
      { id: 's3', date: '2025-03-26' },
    ]);
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue({
      id: 'run-1',
      trackedUrlId: 'url-1',
      researcherId: 'res-1',
      status: CalibrationRunStatus.OPEN,
      seededFromRulesetId: null,
      committedRulesetId: null,
      createdAt: new Date(),
      closedAt: null,
      decisions: [
        ...decisions([CalibrationDecisionType.RUN_OPENED], ['#header']),
        { ...decisions([CalibrationDecisionType.CAPTURE_SHOWN], ['#header'])[0], sequence: 2, snapshotId: 's1' },
        { ...decisions([CalibrationDecisionType.CAPTURE_ACCEPTED], ['#header'])[0], sequence: 3, snapshotId: 's1' },
      ],
    });

    const out = JSON.parse(await nextArticleCaptureHandler({ runId: 'run-1' })) as Parsed;

    // The far end — where a ruleset built on 2020 is likeliest to have stopped
    // applying. This is the click that found the news page's boundary.
    expect(out.nextCapture?.date).toBe('2025-03-26');
    expect(out.nextCapture?.why).toContain('furthest in time');
    expect(out.nextCapture?.daysFromNearestJudged).toBeGreaterThan(1500);
  });

  it('reports the sample exhausted, and points at the two closing tools', async () => {
    armSnapshots([]);
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header']);

    const out = JSON.parse(await nextArticleCaptureHandler({ runId: 'run-1' })) as Parsed;

    expect(out.nextCapture).toBeNull();
    expect(out.message).toContain('commit_article_rules');
    expect(out.message).toContain('abandon_article_rules');
  });

  it('REPORTS the stopping rule rather than enforcing it', async () => {
    // Three clean captures satisfies "no corrections on the last three" — and it
    // still returns a next capture. The researcher decides when to stop.
    armSnapshots([
      { id: 's1', date: '2020-12-09' },
      { id: 's2', date: '2021-06-12' },
      { id: 's3', date: '2022-05-23' },
      { id: 's4', date: '2025-03-26' },
    ]);
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue({
      id: 'run-1',
      trackedUrlId: 'url-1',
      researcherId: 'res-1',
      status: CalibrationRunStatus.OPEN,
      seededFromRulesetId: null,
      committedRulesetId: null,
      createdAt: new Date(),
      closedAt: null,
      decisions: ['s1', 's2', 's3'].flatMap((snapshotId, i) => [
        { ...decisions([CalibrationDecisionType.CAPTURE_SHOWN], ['#header'])[0], sequence: i * 2 + 1, snapshotId },
        { ...decisions([CalibrationDecisionType.CAPTURE_ACCEPTED], ['#header'])[0], sequence: i * 2 + 2, snapshotId },
      ]),
    });

    const out = JSON.parse(await nextArticleCaptureHandler({ runId: 'run-1' })) as Parsed;

    expect(out.stopping).toContain('stopping rule is satisfied');
    expect(out.nextCapture).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// judge_article_capture — the piece that made the redesign inconsistent.
//
// Sequencing moved to `next_article_capture` and approval to
// `commit_article_rules`, while the VERDICT — the actual judgement — was still
// written by the browser. The researcher noticed on the first session that used
// the new flow: "aren't we supposed to be using MCP tools now?" They were right;
// there was nothing to call.
//
// The append itself is reached through a DYNAMIC import, because recording a
// verdict records an observation, which needs the HTML parser. These tests
// therefore exercise only the seams that live in the tool: the guards, the
// version read, and what it says about what happens next.
// ---------------------------------------------------------------------------

jest.mock('../src/services/captureMarking', () => ({
  appendDecisionWithObservation: (...args: unknown[]) => mockAppend(...args),
  previewUnderSelectors: (...args: unknown[]) => mockPreview(...args),
}));
const mockAppend = jest.fn();
const mockPreview = jest.fn();

describe('judge_article_capture', () => {
  beforeEach(() => {
    mockAppend.mockReset();
    mockAppend.mockResolvedValue({ observationId: 'obs-1' });
    armSnapshots([{ id: 's1', date: '2020-12-09' }]);
  });

  it('refuses SKIPPED without a reason — a silent hole is not permitted', async () => {
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header']);

    const out = JSON.parse(
      await judgeArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1', verdict: 'SKIPPED' }),
    ) as Parsed;

    expect(out.error).toContain('reason');
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it('answers rather than throwing when the run does not exist', async () => {
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue(null);

    const out = JSON.parse(
      await judgeArticleCaptureHandler({ runId: 'gone', snapshotId: 's1', verdict: 'ACCEPTED' }),
    ) as Parsed;

    expect(out.error).toContain('No calibration run');
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it('refuses a closed run without writing', async () => {
    armRun([CalibrationDecisionType.RUN_OPENED]);
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue({
      ...(await (prisma.calibrationRun.findUnique as jest.Mock)()),
      status: CalibrationRunStatus.COMMITTED,
    });

    const out = JSON.parse(
      await judgeArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1', verdict: 'ACCEPTED' }),
    ) as Parsed;

    expect(out.error).toContain('COMMITTED');
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it('reads the version itself and records the verdict against the capture', async () => {
    armRun(
      [CalibrationDecisionType.RUN_OPENED, CalibrationDecisionType.CAPTURE_SHOWN],
      ['#header'],
    );

    const out = JSON.parse(
      await judgeArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1', verdict: 'ACCEPTED' }),
    ) as Parsed;

    expect(mockAppend).toHaveBeenCalledWith('run-1', 2, {
      type: CalibrationDecisionType.CAPTURE_ACCEPTED,
      snapshotId: 's1',
    });
    expect(out.recorded).toBe('ACCEPTED');
  });

  it('does NOT advance on a rejection — it routes back to calibration', async () => {
    // The plan is explicit: "reject routes back to calibration, it never skips a
    // capture." The researcher fixes the rules and judges the SAME capture again.
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header']);

    const out = JSON.parse(
      await judgeArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1', verdict: 'REJECTED' }),
    ) as Parsed;

    expect(out.next).toContain('judge this capture again');
    expect(out.next).not.toContain('next_article_capture');
  });

  it('points at the next capture after an acceptance', async () => {
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header']);

    const out = JSON.parse(
      await judgeArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1', verdict: 'ACCEPTED' }),
    ) as Parsed;

    expect(out.next).toContain('next_article_capture');
  });

  it('surfaces a stale-version refusal with a way forward', async () => {
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header']);
    mockAppend.mockRejectedValue(new Error('Calibration run run-1 is at version 9, not 1.'));

    const out = JSON.parse(
      await judgeArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1', verdict: 'ACCEPTED' }),
    ) as Parsed;

    expect(out.error).toContain('version 9');
    expect(out.hint).toContain('get_article_rules');
  });
});

// ---------------------------------------------------------------------------
// open_article_capture — the tool that spawns the UI.
//
// It returns a DEEP LINK to one capture, because a tool that names a capture and
// then sends the researcher to a page listing twelve dates has not finished its
// sentence. And it reports match counts WITH the caveat that they say only
// whether the rules still MATCH — a rule that has swallowed a paragraph reports
// a healthy percentage.
// ---------------------------------------------------------------------------

describe('open_article_capture', () => {
  beforeEach(() => {
    mockPreview.mockReset();
    mockPreview.mockResolvedValue({
      matchCounts: { '#header': 1, '#footer': 0 },
      removalFraction: 0.68,
      removedSegments: [{ selector: '#header', text: 'Home  News\n\n Sport' }],
    });
    (prisma.urlSnapshot.findFirst as jest.Mock).mockResolvedValue({
      id: 's1',
      snapshotDate: '2022-05-23',
      waybackTimestamp: '20220523123302',
    });
  });

  it('deep-links to the capture, not to the run', async () => {
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header', '#footer']);

    const out = JSON.parse(
      await openArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1' }),
    ) as Parsed;

    expect(out.captureUrl).toContain('/article-rules/run-1/capture/s1');
  });

  it('reports how many selectors still match', async () => {
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header', '#footer']);

    const out = JSON.parse(
      await openArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1' }),
    ) as Parsed;

    // `#footer` matched zero, so one of two.
    expect(out.rulesStillMatching).toBe('1 of 2 selectors');
  });

  it('carries the caveat WITH the numbers, because they invite one wrong reading', async () => {
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header']);

    const out = JSON.parse(
      await openArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1' }),
    ) as Parsed;

    expect(out.whatTheNumbersDoNotSay).toContain('do NOT say whether what was removed is furniture');
  });

  it('says when the capture has already been judged', async () => {
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue({
      id: 'run-1',
      trackedUrlId: 'url-1',
      researcherId: 'res-1',
      status: CalibrationRunStatus.OPEN,
      seededFromRulesetId: null,
      committedRulesetId: null,
      createdAt: new Date(),
      closedAt: null,
      decisions: [
        ...decisions([CalibrationDecisionType.RUN_OPENED], ['#header']),
        { ...decisions([CalibrationDecisionType.CAPTURE_SHOWN], ['#header'])[0], sequence: 2, snapshotId: 's1' },
        { ...decisions([CalibrationDecisionType.CAPTURE_REJECTED], ['#header'])[0], sequence: 3, snapshotId: 's1' },
      ],
    });

    const out = JSON.parse(
      await openArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1' }),
    ) as Parsed;

    expect(out.alreadyJudged).toBe(CalibrationDecisionType.CAPTURE_REJECTED);
  });

  it('refuses a capture belonging to another page', async () => {
    // Scoped to the run's tracked URL: a snapshot id from elsewhere would open a
    // capture this ruleset was never about.
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header']);
    (prisma.urlSnapshot.findFirst as jest.Mock).mockResolvedValue(null);

    const out = JSON.parse(
      await openArticleCaptureHandler({ runId: 'run-1', snapshotId: 'elsewhere' }),
    ) as Parsed;

    expect(out.error).toContain('no such capture');
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('answers rather than throwing when the run does not exist', async () => {
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue(null);

    const out = JSON.parse(
      await openArticleCaptureHandler({ runId: 'gone', snapshotId: 's1' }),
    ) as Parsed;

    expect(out.error).toContain('No calibration run');
  });
});

// ---------------------------------------------------------------------------
// THE DRAFT — the page's output, and the one thing it writes.
//
// The researcher's ruling: the UI takes a ruleset in and returns a corrected
// one, deciding nothing. `judge_article_capture` is where that draft becomes a
// decision, and the ORDER matters — a verdict is ABOUT a ruleset, so judging
// before promoting would attach the judgement to the rules as they were before
// the corrections it is a judgement of.
// ---------------------------------------------------------------------------

describe('judge_article_capture promotes the draft', () => {
  beforeEach(() => {
    mockAppend.mockReset();
    mockAppend.mockResolvedValue({ observationId: 'obs-1' });
    armSnapshots([{ id: 's1', date: '2020-12-09' }]);
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header']);
  });

  const armDraft = (draft: {
    selectors: string[];
    snapshotId: string;
    returnedAt: Date | null;
  } | null) => {
    (prisma.calibrationRun.findUnique as jest.Mock).mockImplementation(
      (args: { select?: Record<string, boolean> }) =>
        args.select?.['draftSelectors'] === true
          ? Promise.resolve(
              draft === null
                ? { draftSelectors: [], draftSnapshotId: null, draftReturnedAt: null }
                : {
                    draftSelectors: draft.selectors,
                    draftSnapshotId: draft.snapshotId,
                    draftReturnedAt: draft.returnedAt,
                  },
            )
          : Promise.resolve({
              id: 'run-1',
              trackedUrlId: 'url-1',
              researcherId: 'res-1',
              status: CalibrationRunStatus.OPEN,
              seededFromRulesetId: null,
              committedRulesetId: null,
              createdAt: new Date(),
              closedAt: null,
              decisions: decisions([CalibrationDecisionType.RUN_OPENED], ['#header']),
            }),
    );
  };

  it('records the CORRECTION before the verdict, never after', async () => {
    armDraft({ selectors: ['#header', '#footer'], snapshotId: 's1', returnedAt: new Date() });

    await judgeArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1', verdict: 'ACCEPTED' });

    const types = mockAppend.mock.calls.map((c) => (c[2] as { type: string }).type);
    expect(types).toEqual([
      CalibrationDecisionType.RULESET_CORRECTED,
      CalibrationDecisionType.CAPTURE_ACCEPTED,
    ]);
    // And the second append carries the NEXT version, since the first consumed one.
    expect(mockAppend.mock.calls[0]?.[1]).toBe(1);
    expect(mockAppend.mock.calls[1]?.[1]).toBe(2);
  });

  it('does NOT promote a draft that was never handed back', async () => {
    // Still being edited. Promoting an autosave records rules the researcher was
    // in the middle of changing.
    armDraft({ selectors: ['#header', '#footer'], snapshotId: 's1', returnedAt: null });

    await judgeArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1', verdict: 'ACCEPTED' });

    const types = mockAppend.mock.calls.map((c) => (c[2] as { type: string }).type);
    expect(types).toEqual([CalibrationDecisionType.CAPTURE_ACCEPTED]);
  });

  it('does NOT promote a draft belonging to a different capture', async () => {
    armDraft({ selectors: ['#header', '#footer'], snapshotId: 'other', returnedAt: new Date() });

    await judgeArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1', verdict: 'ACCEPTED' });

    const types = mockAppend.mock.calls.map((c) => (c[2] as { type: string }).type);
    expect(types).toEqual([CalibrationDecisionType.CAPTURE_ACCEPTED]);
  });

  it('does NOT record a correction that corrects nothing', async () => {
    // Same rules, different order. A `RULESET_CORRECTED` recording no correction
    // is the vacuity this level demotes everywhere else.
    armDraft({ selectors: ['#header'], snapshotId: 's1', returnedAt: new Date() });

    await judgeArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1', verdict: 'ACCEPTED' });

    const types = mockAppend.mock.calls.map((c) => (c[2] as { type: string }).type);
    expect(types).toEqual([CalibrationDecisionType.CAPTURE_ACCEPTED]);
  });
});

// ---------------------------------------------------------------------------
// THE EVIDENCE HAS TO REACH THE CONVERSATION.
//
// A researcher on claude.ai has an MCP connector and nothing else — no developer
// tools, no way for the assistant to read the page. Reporting "68% removed" and
// nothing about WHAT left the only record of an approval as the word "accepted",
// with no trace of what was inspected.
//
// TRUNCATED ON PURPOSE. Enough to spot prose among furniture; not enough to
// substitute for looking, and not a whole document handed to something that is
// not supposed to be judging it.
// ---------------------------------------------------------------------------

describe('open_article_capture returns a sample of what was removed', () => {
  beforeEach(() => {
    mockPreview.mockReset();
    (prisma.urlSnapshot.findFirst as jest.Mock).mockResolvedValue({
      id: 's1',
      snapshotDate: '2020-12-18',
      waybackTimestamp: '20201218044603',
    });
    armRun([CalibrationDecisionType.RUN_OPENED], ['#header']);
  });

  it('carries each block with the rule that removed it', async () => {
    mockPreview.mockResolvedValue({
      matchCounts: { '#header': 1 },
      removalFraction: 0.68,
      removedSegments: [{ selector: '#header', text: 'Home News Sport' }],
    });

    const out = JSON.parse(
      await openArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1' }),
    ) as Parsed;

    expect(out.removedSample).toEqual([
      { selector: '#header', sample: 'Home News Sport', fullLength: 15 },
    ]);
  });

  it('collapses whitespace, so the budget is spent on words', async () => {
    mockPreview.mockResolvedValue({
      matchCounts: { '#header': 1 },
      removalFraction: 0.1,
      removedSegments: [{ selector: '#header', text: '  Home\n\n\n  •  \n News  ' }],
    });

    const out = JSON.parse(
      await openArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1' }),
    ) as Parsed;

    expect(out.removedSample?.[0]?.sample).toBe('Home • News');
  });

  it('truncates a long block and reports its FULL length', async () => {
    // A truncated block must not read as a short one — the same reason the
    // outline reports `truncated` rather than silently stopping.
    const long = 'x'.repeat(900);
    mockPreview.mockResolvedValue({
      matchCounts: { '#header': 1 },
      removalFraction: 0.9,
      removedSegments: [{ selector: '#header', text: long }],
    });

    const out = JSON.parse(
      await openArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1' }),
    ) as Parsed;

    const sample = out.removedSample?.[0];
    expect(sample?.sample.endsWith('…')).toBe(true);
    expect(sample?.sample.length).toBeLessThanOrEqual(201);
    expect(sample?.fullLength).toBe(900);
  });

  it('is empty when the rules removed nothing', async () => {
    mockPreview.mockResolvedValue({
      matchCounts: {},
      removalFraction: 0,
      removedSegments: [],
    });

    const out = JSON.parse(
      await openArticleCaptureHandler({ runId: 'run-1', snapshotId: 's1' }),
    ) as Parsed;

    expect(out.removedSample).toEqual([]);
  });
});
