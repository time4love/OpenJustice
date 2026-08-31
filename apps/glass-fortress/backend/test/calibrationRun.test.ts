// ---------------------------------------------------------------------------
// LEVEL 4 — the calibration loop, tested where it can actually be wrong.
//
// The run holds no selectors and no version column: both are FOLDED from the
// decision log, so every property this file asserts is a property of that fold.
// A cached column would have made these tests pass trivially and the system
// wrong six months later, on the first resumption after a restart.
//
// THE VACUITY CASE IS THE IMPORTANT ONE. `correctionRate` must be null — never
// 0 — before any capture has been shown. A rate of zero from an empty
// denominator reads as "the ruleset was tested and never needed fixing", which
// is the opposite of the truth, and it is the shape this repository already
// demoted below "never run" once, in the integrity board's VACUOUS score.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => {
  const client: Record<string, unknown> = {
    calibrationRun: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    calibrationDecision: { create: jest.fn() },
    articleRuleset: { upsert: jest.fn() },
    trackedUrl: { findUnique: jest.fn(), update: jest.fn() },
    rulesetObservation: { upsert: jest.fn() },
  };
  // Assigned after the literal, not inside it: a self-referencing initialiser
  // has no inferable type and `any` is not available here. The transaction runs
  // its callback against the SAME mocked client, so writes inside a transaction
  // are observable exactly like the ones outside — which is the only way the
  // commit path can be tested at all.
  client['$transaction'] = jest.fn((fn: (tx: unknown) => unknown) => fn(client));
  return { prisma: client };
});

import { CalibrationDecisionType, CalibrationRunStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import {
  abandonCalibrationRun,
  appendCalibrationDecision,
  commitCalibrationRuleset,
  openCalibrationRun,
  recordRulesetObservation,
  findStaleSelectors,
  parseMatchCounts,
  readCalibrationRun,
  requireObservationSubject,
  CalibrationRunClosedError,
  StaleCalibrationVersionError,
} from '../src/services/calibrationRun';
import { chromeRulesetId } from '../src/lib/chromeRuleset';

type DecisionSeed = {
  type: CalibrationDecisionType;
  selectors?: string[];
  /** Which capture the decision is about, when the assertion turns on it. */
  snapshotId?: string;
};

/** Build a decision log the way the service would have written it. */
function log(seeds: DecisionSeed[]) {
  let selectors: string[] = [];
  return seeds.map((seed, i) => {
    if (seed.selectors !== undefined) selectors = seed.selectors;
    return {
      id: `d${String(i)}`,
      calibrationRunId: 'run-1',
      sequence: i + 1,
      type: seed.type,
      selectors: [...selectors],
      rulesetId: chromeRulesetId({ selectors }),
      snapshotId: seed.snapshotId ?? null,
      waybackTimestamp: null,
      observationId: null,
      reason: null,
      createdAt: new Date('2026-08-31T00:00:00Z'),
    };
  });
}

function runRow(seeds: DecisionSeed[], status: CalibrationRunStatus = CalibrationRunStatus.OPEN) {
  return {
    id: 'run-1',
    trackedUrlId: 'url-1',
    researcherId: 'res-1',
    status,
    seededFromRulesetId: null,
    committedRulesetId: null,
    createdAt: new Date(),
    closedAt: null,
    decisions: log(seeds),
  };
}

function mockRun(seeds: DecisionSeed[], status: CalibrationRunStatus = CalibrationRunStatus.OPEN) {
  const row = runRow(seeds, status);
  (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue(row);
  return row.decisions;
}

beforeEach(() => {
  // `clearMocks: true` resets recorded CALLS, not IMPLEMENTATIONS — so a
  // `mockRejectedValue` set in one test leaks into every test after it, and the
  // failure surfaces somewhere unrelated. Re-arm the defaults explicitly.
  (prisma.calibrationDecision.create as jest.Mock).mockResolvedValue({});
  (prisma.articleRuleset.upsert as jest.Mock).mockResolvedValue({ id: 'ars-default' });
  (prisma.rulesetObservation.upsert as jest.Mock).mockResolvedValue({ id: 'obs-default' });
  (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
});

const OPENED: DecisionSeed = { type: CalibrationDecisionType.RUN_OPENED, selectors: [] };
const SHOWN: DecisionSeed = { type: CalibrationDecisionType.CAPTURE_SHOWN };
const ACCEPTED: DecisionSeed = { type: CalibrationDecisionType.CAPTURE_ACCEPTED };

describe('the fold — the run holds no state its log does not', () => {
  it('reports the newest decision’s selectors as the rules in force', async () => {
    mockRun([
      OPENED,
      SHOWN,
      { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad', 'nav'] },
      ACCEPTED,
      SHOWN,
      { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad', 'nav', 'footer'] },
    ]);
    const state = await readCalibrationRun('run-1');
    expect(state.selectors).toEqual(['.ad', 'nav', 'footer']);
    expect(state.rulesetId).toBe(chromeRulesetId({ selectors: ['.ad', 'nav', 'footer'] }));
  });

  it('carries the rules forward across decisions that do not change them', async () => {
    mockRun([
      OPENED,
      { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad'] },
      SHOWN,
      ACCEPTED,
      { type: CalibrationDecisionType.CAPTURE_SKIPPED },
    ]);
    // Every decision restates the rules in force, so the fold never looks back
    // past the last row — which is what makes resumption a single read.
    const state = await readCalibrationRun('run-1');
    expect(state.selectors).toEqual(['.ad']);
  });

  it('takes the version from the newest sequence, not from a column', async () => {
    mockRun([OPENED, SHOWN, ACCEPTED]);
    const state = await readCalibrationRun('run-1');
    expect(state.version).toBe(3);
  });
});

describe('the stopping indicator', () => {
  it('reports correctionRate NULL, never 0, before any capture has been shown', async () => {
    mockRun([OPENED]);
    const state = await readCalibrationRun('run-1');

    expect(state.capturesShown).toBe(0);
    // THE ASSERTION THIS FILE EXISTS FOR. `toBeNull` rather than `toBeFalsy`:
    // 0 is falsy too, and 0 is precisely the wrong answer.
    expect(state.correctionRate).toBeNull();
    expect(state.correctionRate).not.toBe(0);
  });

  it('counts an episode dirty when the rules were corrected against it', async () => {
    mockRun([
      OPENED,
      SHOWN,
      { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad'] },
      ACCEPTED,
      SHOWN,
      ACCEPTED,
      SHOWN,
      ACCEPTED,
    ]);
    const state = await readCalibrationRun('run-1');
    expect(state.capturesShown).toBe(3);
    expect(state.corrections).toBe(1);
    expect(state.correctionRate).toBeCloseTo(1 / 3);
    // Only the trailing clean run counts: the first capture needed a fix.
    expect(state.consecutiveCleanCaptures).toBe(2);
  });

  it('separates captures SHOWN from DISTINCT captures shown', async () => {
    // Three clean showings of ONE capture is the vacuity this level demotes,
    // wearing the streak's clothes. Neither number alone tells that apart from
    // three different captures agreeing, so both are reported.
    const same = { ...SHOWN, snapshotId: 'snap-same' };
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue({
      ...runRow([OPENED]),
      decisions: log([OPENED, same, ACCEPTED, same, ACCEPTED, same, ACCEPTED]),
    });

    const state = await readCalibrationRun('run-1');
    expect(state.capturesShown).toBe(3);
    expect(state.distinctCapturesShown).toBe(1);
    expect(state.consecutiveCleanCaptures).toBe(3);
  });

  it('counts distinct captures when they really are distinct', async () => {
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue({
      ...runRow([OPENED]),
      decisions: log([
        OPENED,
        { ...SHOWN, snapshotId: 'snap-1' },
        ACCEPTED,
        { ...SHOWN, snapshotId: 'snap-2' },
        ACCEPTED,
      ]),
    });

    const state = await readCalibrationRun('run-1');
    expect(state.distinctCapturesShown).toBe(2);
  });

  it('resets the clean streak when a later capture needs a correction', async () => {
    mockRun([
      OPENED,
      SHOWN,
      ACCEPTED,
      SHOWN,
      ACCEPTED,
      SHOWN,
      { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.promo'] },
    ]);
    const state = await readCalibrationRun('run-1');
    expect(state.consecutiveCleanCaptures).toBe(0);
  });

  // -------------------------------------------------------------------------
  // SHOWING IS NOT JUDGING.
  //
  // Every test above this block pairs SHOWN with ACCEPTED, which is why the
  // defect below survived them all: the fold pushed a CLEAN episode on
  // CAPTURE_SHOWN, so a capture merely displayed counted as a capture that
  // needed no correction. The schema documents that same event as "Nothing is
  // judged yet." Observed on the marking page's first render, 2026-08-31: a
  // clean streak of 1 before the researcher had judged anything.
  //
  // The stopping rule is "no corrections on the last three versions". These
  // cases hold that it cannot be reached by scrolling.
  // -------------------------------------------------------------------------

  it('does not count a capture that was SHOWN and never judged', async () => {
    mockRun([OPENED, SHOWN]);
    const state = await readCalibrationRun('run-1');

    expect(state.capturesShown).toBe(1);
    expect(state.capturesJudged).toBe(0);
    // The exact reading the page produced on first render. It must be 0.
    expect(state.consecutiveCleanCaptures).toBe(0);
    expect(state.correctionRate).toBeNull();
    expect(state.correctionRate).not.toBe(0);
  });

  it('cannot reach the stopping rule by paging through captures', async () => {
    mockRun([OPENED, SHOWN, SHOWN, SHOWN]);
    const state = await readCalibrationRun('run-1');

    expect(state.capturesShown).toBe(3);
    expect(state.capturesJudged).toBe(0);
    // Three captures displayed, nothing decided. "No corrections on the last
    // three" must NOT be satisfied by this.
    expect(state.consecutiveCleanCaptures).toBe(0);
    expect(state.correctionRate).toBeNull();
  });

  it('does not let a capture awaiting judgement break an earned streak', async () => {
    // The mirror error of the one above: loading the next capture is not a
    // verdict against the previous one either.
    mockRun([OPENED, SHOWN, ACCEPTED, SHOWN, ACCEPTED, SHOWN]);
    const state = await readCalibrationRun('run-1');

    expect(state.capturesShown).toBe(3);
    expect(state.capturesJudged).toBe(2);
    expect(state.consecutiveCleanCaptures).toBe(2);
  });

  it('counts a correction as a judgement — acting on the rules IS deciding', async () => {
    mockRun([
      OPENED,
      SHOWN,
      { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad'] },
    ]);
    const state = await readCalibrationRun('run-1');

    expect(state.capturesJudged).toBe(1);
    expect(state.capturesNeedingCorrection).toBe(1);
    expect(state.correctionRate).toBe(1);
    expect(state.consecutiveCleanCaptures).toBe(0);
  });

  it('excludes a SKIPPED capture rather than counting it clean', async () => {
    // A skip declares the capture unusable. It says nothing about the rules, so
    // it must not pad the streak and must not sit in the denominator.
    mockRun([
      OPENED,
      SHOWN,
      ACCEPTED,
      SHOWN,
      // `reason` is required on a real skip and enforced at the append; the
      // fold never reads it, so the seed does not carry it.
      { type: CalibrationDecisionType.CAPTURE_SKIPPED },
    ]);
    const state = await readCalibrationRun('run-1');

    expect(state.capturesShown).toBe(2);
    expect(state.capturesJudged).toBe(1);
    expect(state.consecutiveCleanCaptures).toBe(1);
    expect(state.correctionRate).toBe(0);
  });

  // -------------------------------------------------------------------------
  // A RATE MUST BE A RATE.
  //
  // The denominator was `capturesShown` and the numerator counted EDITS, so the
  // value was bounded by nothing. The first walk measured `correctionRate: 2`
  // with a single capture on screen. Five edits against one capture is one
  // capture that disagreed, not five.
  // -------------------------------------------------------------------------

  it('counts a capture that needed several edits ONCE, and stays within [0,1]', async () => {
    mockRun([
      OPENED,
      SHOWN,
      { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad'] },
      { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad', '.promo'] },
      { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad', '.promo', '#nav'] },
      ACCEPTED,
    ]);
    const state = await readCalibrationRun('run-1');

    // The raw edit count is still reported — it is just not the rate.
    expect(state.corrections).toBe(3);
    expect(state.capturesJudged).toBe(1);
    expect(state.capturesNeedingCorrection).toBe(1);
    // Was 3 under the old arithmetic. A rate cannot exceed 1.
    expect(state.correctionRate).toBe(1);
  });

  it('keeps correctionRate within [0,1] across a mixed run', async () => {
    mockRun([
      OPENED,
      SHOWN,
      { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad'] },
      { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad', '.promo'] },
      ACCEPTED,
      SHOWN,
      ACCEPTED,
      SHOWN,
      ACCEPTED,
      SHOWN, // shown, still awaiting judgement
    ]);
    const state = await readCalibrationRun('run-1');

    expect(state.capturesShown).toBe(4);
    expect(state.capturesJudged).toBe(3);
    expect(state.corrections).toBe(2);
    expect(state.capturesNeedingCorrection).toBe(1);
    expect(state.correctionRate).toBeCloseTo(1 / 3);
    expect(state.correctionRate).toBeGreaterThanOrEqual(0);
    expect(state.correctionRate).toBeLessThanOrEqual(1);
    expect(state.consecutiveCleanCaptures).toBe(2);
  });

  // -------------------------------------------------------------------------
  // WHICH captures were judged, not just how many.
  //
  // The marking page tracked this in the browser tab, so a reload erased every
  // verdict and the capture strip went blank — the researcher reported not being
  // able to see which versions they had confirmed. The log knew all along.
  // -------------------------------------------------------------------------

  it('folds which captures were judged, and what the verdict was', async () => {
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue({
      ...runRow([OPENED]),
      // EVERY JUDGEMENT NAMES ITS CAPTURE, because `requireSubjectForType`
      // enforces exactly that on append — CAPTURE_ACCEPTED, _REJECTED and
      // _SKIPPED are all capture-bearing. The bare `ACCEPTED` fixture at the top
      // of this file predates that rule and is only safe in tests that count
      // rather than attribute; a log the service would actually have written
      // always carries the id.
      decisions: log([
        OPENED,
        { ...SHOWN, snapshotId: 'snap-1' },
        { ...ACCEPTED, snapshotId: 'snap-1' },
        { ...SHOWN, snapshotId: 'snap-2' },
        { type: CalibrationDecisionType.CAPTURE_SKIPPED, snapshotId: 'snap-2' },
        { ...SHOWN, snapshotId: 'snap-3' },
      ]),
    });

    const state = await readCalibrationRun('run-1');
    // snap-3 was shown and never judged, so it must not appear.
    expect(state.judgedCaptures).toEqual([
      { snapshotId: 'snap-1', verdict: CalibrationDecisionType.CAPTURE_ACCEPTED },
      { snapshotId: 'snap-2', verdict: CalibrationDecisionType.CAPTURE_SKIPPED },
    ]);
  });

  it('lets the NEWEST verdict on a capture stand', async () => {
    // A rejection routes back to marking, so the same capture is judged again.
    // Reporting the rejection after the researcher has accepted it would show a
    // disagreement that was already resolved.
    (prisma.calibrationRun.findUnique as jest.Mock).mockResolvedValue({
      ...runRow([OPENED]),
      decisions: log([
        OPENED,
        { ...SHOWN, snapshotId: 'snap-1' },
        { type: CalibrationDecisionType.CAPTURE_REJECTED, snapshotId: 'snap-1' },
        { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad'] },
        { ...SHOWN, snapshotId: 'snap-1' },
        { ...ACCEPTED, snapshotId: 'snap-1' },
      ]),
    });

    const state = await readCalibrationRun('run-1');
    expect(state.judgedCaptures).toEqual([
      { snapshotId: 'snap-1', verdict: CalibrationDecisionType.CAPTURE_ACCEPTED },
    ]);
  });

  it('reports no judged captures before anything has been judged', async () => {
    mockRun([OPENED, SHOWN]);
    const state = await readCalibrationRun('run-1');
    expect(state.judgedCaptures).toEqual([]);
  });

  it('treats a rejection’s correction as dirtying the capture it followed', async () => {
    // A rejection means the RULES are wrong, not that the capture is bad, so it
    // routes back to marking and the correction lands inside the same episode.
    mockRun([
      OPENED,
      SHOWN,
      { type: CalibrationDecisionType.CAPTURE_REJECTED },
      { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad'] },
      ACCEPTED,
    ]);
    const state = await readCalibrationRun('run-1');
    expect(state.capturesShown).toBe(1);
    expect(state.consecutiveCleanCaptures).toBe(0);
  });
});

describe('appending a decision', () => {
  it('refuses a stale expected version', async () => {
    mockRun([OPENED, SHOWN, ACCEPTED]);
    await expect(
      appendCalibrationDecision('run-1', 2, {
        type: CalibrationDecisionType.CAPTURE_SHOWN,
        snapshotId: 'snap-1',
      }),
    ).rejects.toThrow(StaleCalibrationVersionError);
    expect(prisma.calibrationDecision.create).not.toHaveBeenCalled();
  });

  it('translates the unique-index collision into a stale-version error', async () => {
    // THE CHECK ABOVE IS A COURTESY; THIS IS WHAT MAKES IT SAFE. Two browsers
    // fold the same run, both compute version 3, both insert sequence 4: one
    // wins, the loser takes the constraint and re-reads to find version 4.
    mockRun([OPENED, SHOWN, ACCEPTED]);
    (prisma.calibrationRun.findUnique as jest.Mock)
      .mockResolvedValueOnce(runRow([OPENED, SHOWN, ACCEPTED]))
      .mockResolvedValueOnce(runRow([OPENED, SHOWN, ACCEPTED, SHOWN]));
    (prisma.calibrationDecision.create as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(
      appendCalibrationDecision('run-1', 3, {
        type: CalibrationDecisionType.CAPTURE_SHOWN,
        snapshotId: 'snap-1',
      }),
    ).rejects.toThrow(StaleCalibrationVersionError);
  });

  it('does NOT blame the version when the collision was something else', async () => {
    // A commit upserts an ArticleRuleset too, and that key can collide for
    // reasons that have nothing to do with this run's sequence. Reporting "you
    // are a version behind" there would bury the real cause behind an accurate
    // sentence answering a different question.
    mockRun([OPENED, SHOWN, ACCEPTED]);
    (prisma.calibrationDecision.create as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Unique constraint failed on ArticleRuleset'), { code: 'P2002' }),
    );
    await expect(
      appendCalibrationDecision('run-1', 3, {
        type: CalibrationDecisionType.CAPTURE_SHOWN,
        snapshotId: 'snap-1',
      }),
    ).rejects.toThrow(/ArticleRuleset/);
  });

  it('refuses a decision on a run that has already closed', async () => {
    mockRun([OPENED, SHOWN, ACCEPTED], CalibrationRunStatus.COMMITTED);
    await expect(
      appendCalibrationDecision('run-1', 3, {
        type: CalibrationDecisionType.CAPTURE_SHOWN,
        snapshotId: 'snap-1',
      }),
    ).rejects.toThrow(CalibrationRunClosedError);
  });

  it('refuses a skipped capture with no reason', async () => {
    mockRun([OPENED]);
    await expect(
      appendCalibrationDecision('run-1', 1, {
        type: CalibrationDecisionType.CAPTURE_SKIPPED,
        snapshotId: 's1',
      }),
    ).rejects.toThrow(/silent hole/);
  });

  it('refuses a correction that does not say what it corrected to', async () => {
    mockRun([OPENED]);
    await expect(
      appendCalibrationDecision('run-1', 1, {
        type: CalibrationDecisionType.RULESET_CORRECTED,
      }),
    ).rejects.toThrow(/carries the selectors/);
  });
});

describe('a capture has exactly one identity', () => {
  it('accepts a stored capture', () => {
    expect(requireObservationSubject({ snapshotId: 's1' })).toEqual({ snapshotId: 's1' });
  });

  it('accepts a capture fetched and not persisted', () => {
    expect(requireObservationSubject({ waybackTimestamp: '20220622120000' })).toEqual({
      waybackTimestamp: '20220622120000',
    });
  });

  it('THROWS on both, rather than silently preferring one', () => {
    // A silent filter would drop the subject from the pass and report it as
    // nothing to check. The guard is loud on purpose.
    expect(() =>
      requireObservationSubject({ snapshotId: 's1', waybackTimestamp: '20220622120000' }),
    ).toThrow(/never both/);
  });

  it('throws on neither', () => {
    expect(() => requireObservationSubject({})).toThrow(/neither was given/);
  });
});

describe('the null check', () => {
  const observed = (counts: Record<string, number>, iso: string) => ({
    matchCounts: counts,
    observedAt: new Date(iso),
  });

  it('reports a selector that has never matched anything', () => {
    const stale = findStaleSelectors(
      ['.ad', '.gone'],
      [observed({ '.ad': 2, '.gone': 0 }, '2026-08-31T00:00:00Z')],
    );
    expect(stale).toEqual([{ selector: '.gone', lastMatchedAt: null }]);
  });

  it('reports WHEN a selector last matched, which is what a redesign looks like', () => {
    const stale = findStaleSelectors(
      ['.ad'],
      [
        observed({ '.ad': 3 }, '2026-01-01T00:00:00Z'),
        observed({ '.ad': 0 }, '2026-08-31T00:00:00Z'),
      ],
    );
    expect(stale).toEqual([{ selector: '.ad', lastMatchedAt: new Date('2026-01-01T00:00:00Z') }]);
  });

  it('says nothing at all when no capture has been observed', () => {
    // Vacuity again: with no observations, every selector has "matched nothing",
    // and reporting all of them as stale would be an instrument crying wolf on
    // its first run. Level 7 already wrote that ending — a gate that cries wolf
    // gets disabled.
    expect(findStaleSelectors(['.ad', '.promo'], [])).toEqual([]);
  });

  it('holds nothing against a selector that still matches', () => {
    expect(
      findStaleSelectors(['.ad'], [observed({ '.ad': 1 }, '2026-08-31T00:00:00Z')]),
    ).toEqual([]);
  });
});

describe('matchCounts is Json, so it is validated on the way out', () => {
  it('accepts a well-formed record', () => {
    expect(parseMatchCounts({ '.ad': 2, nav: 0 })).toEqual({ '.ad': 2, nav: 0 });
  });

  it('rejects a shape the column could hold but the code cannot use', () => {
    expect(() => parseMatchCounts({ '.ad': 'two' })).toThrow();
    expect(() => parseMatchCounts(['.ad'])).toThrow();
  });
});

describe('the write paths — a success arm that never fired is unproven', () => {
  it('opens a run seeded from the rules already in force', async () => {
    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue({
      id: 'url-1',
      activeArticleRuleset: { id: 'ars-1', selectors: ['.ad', 'nav'] },
    });
    (prisma.calibrationRun.create as jest.Mock).mockResolvedValue({ id: 'run-1' });
    mockRun([{ type: CalibrationDecisionType.RUN_OPENED, selectors: ['.ad', 'nav'] }]);

    const state = await openCalibrationRun({ trackedUrlId: 'url-1', researcherId: 'res-1' });

    // MODE 1 AND MODE 3 ARE THIS SAME CALL. A page with a ruleset seeds from it;
    // a page without one seeds from nothing, and nothing here is told which.
    const created = (prisma.calibrationRun.create as jest.Mock).mock.calls[0]?.[0] as {
      data: { seededFromRulesetId: string | null; decisions: { create: { selectors: string[] } } };
    };
    expect(created.data.seededFromRulesetId).toBe('ars-1');
    expect(created.data.decisions.create.selectors).toEqual(['.ad', 'nav']);
    expect(state.selectors).toEqual(['.ad', 'nav']);
  });

  it('opens a run on a page with no rules at all', async () => {
    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue({
      id: 'url-1',
      activeArticleRuleset: null,
    });
    (prisma.calibrationRun.create as jest.Mock).mockResolvedValue({ id: 'run-1' });
    mockRun([OPENED]);

    const state = await openCalibrationRun({ trackedUrlId: 'url-1', researcherId: 'res-1' });
    expect(state.selectors).toEqual([]);
    expect(state.rulesetId).toBe(chromeRulesetId({ selectors: [] }));
  });

  it('commits by MOVING THE POINTER — that is the whole effect', async () => {
    mockRun([OPENED, SHOWN, { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad'] }]);
    (prisma.articleRuleset.upsert as jest.Mock).mockResolvedValue({ id: 'ars-9' });

    const result = await commitCalibrationRuleset('run-1', 3);

    expect(prisma.trackedUrl.update).toHaveBeenCalledWith({
      where: { id: 'url-1' },
      data: { activeArticleRulesetId: 'ars-9' },
    });
    expect(prisma.calibrationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CalibrationRunStatus.COMMITTED,
          committedRulesetId: 'ars-9',
        }) as unknown,
      }),
    );
    expect(result.rulesetId).toBe(chromeRulesetId({ selectors: ['.ad'] }));
  });

  it('does NOT re-derive anything on commit — that is the scanner’s', async () => {
    // Level 4: the UI writes decisions, the backend applies effects. A commit
    // that also rewrote a thousand rows inline would be this service quietly
    // becoming the scanner.
    mockRun([OPENED, { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad'] }]);
    (prisma.articleRuleset.upsert as jest.Mock).mockResolvedValue({ id: 'ars-9' });

    await commitCalibrationRuleset('run-1', 2);

    expect(prisma.rulesetObservation.upsert).not.toHaveBeenCalled();
  });

  it('abandons without touching the rules in force', async () => {
    mockRun([OPENED, SHOWN, { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.x'] }]);

    const state = await abandonCalibrationRun('run-1', 3);

    // ABANDONED IS NOT COMMITTED-WITH-NOTHING: the page keeps the rules it had.
    expect(prisma.trackedUrl.update).not.toHaveBeenCalled();
    expect(prisma.calibrationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: CalibrationRunStatus.ABANDONED }) as unknown,
      }),
    );
    expect(state.status).toBe(CalibrationRunStatus.OPEN); // the mocked read is unchanged
  });

  it('translates a sequence collision on COMMIT too, not only on append', async () => {
    // ONE RULE, ONE IMPLEMENTATION. An earlier version translated P2002 in
    // appendCalibrationDecision alone, so a researcher a version behind would
    // have seen a raw Prisma error from commit and abandon.
    mockRun([OPENED, SHOWN]);
    (prisma.calibrationRun.findUnique as jest.Mock)
      .mockResolvedValueOnce(runRow([OPENED, SHOWN]))
      .mockResolvedValueOnce(runRow([OPENED, SHOWN, ACCEPTED]));
    (prisma.articleRuleset.upsert as jest.Mock).mockResolvedValue({ id: 'ars-9' });
    (prisma.calibrationDecision.create as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );

    await expect(commitCalibrationRuleset('run-1', 2)).rejects.toThrow(StaleCalibrationVersionError);
  });

  it('records an observation under whichever identity the capture has', async () => {
    (prisma.rulesetObservation.upsert as jest.Mock).mockResolvedValue({ id: 'obs-1' });

    await recordRulesetObservation({
      articleRulesetId: 'ars-1',
      snapshotId: 'snap-1',
      matchCounts: { '.ad': 2 },
      removalFraction: 0.12,
      derivedTextLength: 900,
    });
    expect(prisma.rulesetObservation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { articleRulesetId_snapshotId: { articleRulesetId: 'ars-1', snapshotId: 'snap-1' } },
      }),
    );

    await recordRulesetObservation({
      articleRulesetId: 'ars-1',
      waybackTimestamp: '20220622120000',
      matchCounts: { '.ad': 0 },
      removalFraction: 0,
      derivedTextLength: 900,
    });
    expect(prisma.rulesetObservation.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          articleRulesetId_waybackTimestamp: {
            articleRulesetId: 'ars-1',
            waybackTimestamp: '20220622120000',
          },
        },
      }),
    );
  });

  it('refuses an observation that names no capture', async () => {
    await expect(
      recordRulesetObservation({
        articleRulesetId: 'ars-1',
        matchCounts: {},
        removalFraction: 0,
        derivedTextLength: 0,
      }),
    ).rejects.toThrow(/neither was given/);
    expect(prisma.rulesetObservation.upsert).not.toHaveBeenCalled();
  });
});

describe('a decision that is ABOUT a capture must name one', () => {
  it('refuses CAPTURE_SHOWN with no capture at all', async () => {
    // THE BUG THIS TEST WAS WRITTEN FOR. The guard used to run only when the
    // caller had already supplied an identity, so a capture could be recorded as
    // shown without recording WHICH — corrupting capturesShown, the correction
    // rate computed from it, and the audit trail, silently.
    mockRun([OPENED]);
    await expect(
      appendCalibrationDecision('run-1', 1, { type: CalibrationDecisionType.CAPTURE_SHOWN }),
    ).rejects.toThrow(/neither was given/);
    expect(prisma.calibrationDecision.create).not.toHaveBeenCalled();
  });

  it('refuses a correction that names a capture it is not about', async () => {
    mockRun([OPENED]);
    await expect(
      appendCalibrationDecision('run-1', 1, {
        type: CalibrationDecisionType.RULESET_CORRECTED,
        selectors: ['.ad'],
        snapshotId: 'snap-1',
      }),
    ).rejects.toThrow(/must not name one/);
  });

  it('accepts a capture named exactly once', async () => {
    mockRun([OPENED]);
    (prisma.calibrationDecision.create as jest.Mock).mockResolvedValue({});
    await appendCalibrationDecision('run-1', 1, {
      type: CalibrationDecisionType.CAPTURE_SHOWN,
      snapshotId: 'snap-1',
    });
    expect(prisma.calibrationDecision.create).toHaveBeenCalled();
  });
});

describe('the fold refuses to hide a writer bug', () => {
  it('throws when a stored rulesetId disagrees with its own selectors', async () => {
    const decisions = mockRun([OPENED, { type: CalibrationDecisionType.RULESET_CORRECTED, selectors: ['.ad'] }]);
    const last = decisions.at(-1);
    if (last) last.rulesetId = 'deadbeef';

    // A ruleset id that silently disagreed would send a scan's deviation
    // baseline to the wrong set of captures.
    await expect(readCalibrationRun('run-1')).rejects.toThrow(/hash to/);
  });
});
