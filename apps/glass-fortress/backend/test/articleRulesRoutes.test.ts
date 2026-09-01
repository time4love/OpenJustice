// ---------------------------------------------------------------------------
// LEVEL 4 — the browser's half of the handoff.
//
// What only exists here is the TRANSLATION: a service refusal becoming a status
// code the page can act on. A stale version is not a fault — it is another tab
// having got there first, and the page re-reads and re-offers. Returning 500
// would present a race as a bug and teach a researcher to reload rather than to
// look at what changed.
//
// AND THE RULE THIS FILE GUARDS: the browser writes DECISIONS, never EFFECTS.
// No route here reaches a capture write, a snapshot, or an anchor.
// ---------------------------------------------------------------------------

jest.mock('../src/middleware/researcherIdentity', () => ({
  requireResearcher: (req: { researcherId?: string }, _res: unknown, next: () => void) => {
    req.researcherId = 'res-1';
    next();
  },
  identifyResearcher: (_req: unknown, _res: unknown, next: () => void) => {
    next();
  },
}));

const service = {
  describeCalibrationRun: jest.fn(),
  readCalibrationRun: jest.fn(),
  ensureCurrentRuleset: jest.fn(),
  appendCalibrationDecision: jest.fn(),
  commitCalibrationRuleset: jest.fn(),
  abandonCalibrationRun: jest.fn(),
};

class StaleCalibrationVersionError extends Error {
  constructor() {
    super('Calibration run run-1 is at version 4, not 3.');
    this.name = 'StaleCalibrationVersionError';
  }
}
class CalibrationRunClosedError extends Error {
  constructor() {
    super('Calibration run run-1 is COMMITTED and accepts no further decisions.');
    this.name = 'CalibrationRunClosedError';
  }
}

// `captureMarking` imports the HTML parser, whose dependency chain is ESM-only
// and unparseable by this project's `unit` transform. Mocked with a factory so
// the real module is never loaded — the same treatment every scraper test gives
// jsdom, and the reason the marking service was split out of `calibrationRun`
// in the first place.
jest.mock('../src/services/captureMarking', () => ({
  loadCaptureForMarking: jest.fn(),
  previewUnderSelectors: jest.fn(),
  recordObservationForCapture: jest.fn().mockResolvedValue({ observationId: 'obs-1' }),
  // The route delegates the whole append to this, so the browser and
  // `judge_article_capture` write a decision by exactly the same code. The stub
  // forwards to the real service append, which is what these tests assert on.
  appendDecisionWithObservation: async (
    runId: string,
    expectedVersion: number,
    decision: Parameters<typeof service.appendCalibrationDecision>[2],
  ) => {
    await service.appendCalibrationDecision(runId, expectedVersion, {
      ...decision,
      observationId: 'obs-1',
    });
    return { observationId: 'obs-1' };
  },
}));

jest.mock('../src/services/calibrationRun', () => ({
  ...service,
  describeCalibrationRun: (...a: unknown[]) => service.describeCalibrationRun(...a),
  readCalibrationRun: (...a: unknown[]) => service.readCalibrationRun(...a),
  ensureCurrentRuleset: (...a: unknown[]) => service.ensureCurrentRuleset(...a),
  appendCalibrationDecision: (...a: unknown[]) => service.appendCalibrationDecision(...a),
  commitCalibrationRuleset: (...a: unknown[]) => service.commitCalibrationRuleset(...a),
  abandonCalibrationRun: (...a: unknown[]) => service.abandonCalibrationRun(...a),
  StaleCalibrationVersionError,
  CalibrationRunClosedError,
}));

import express from 'express';
import request from 'supertest';
import { articleRulesRouter } from '../src/routes/articleRulesRoutes';
import { calibrationEffect } from '../src/services/approvalEffect';

const app = express();
app.use(express.json());
app.use('/api/article-rules', articleRulesRouter);

const DETAIL = {
  state: {
    runId: 'run-1',
    trackedUrlId: 'url-1',
    researcherId: 'res-1',
    status: 'OPEN',
    version: 3,
    selectors: ['.ad'],
    rulesetId: 'abc12345',
    capturesShown: 1,
    corrections: 0,
    correctionRate: 0,
    consecutiveCleanCaptures: 1,
  },
  staleSelectors: [],
  storedCaptures: 12,
  effect: calibrationEffect(12),
};

beforeEach(() => {
  service.describeCalibrationRun.mockResolvedValue(DETAIL);
  service.readCalibrationRun.mockResolvedValue(DETAIL.state);
  service.ensureCurrentRuleset.mockResolvedValue({ id: 'ars-1', rulesetId: 'abc12345' });
  service.appendCalibrationDecision.mockResolvedValue(DETAIL.state);
  service.commitCalibrationRuleset.mockResolvedValue({
    state: DETAIL.state,
    articleRulesetId: 'ars-9',
    rulesetId: 'abc12345',
  });
  service.abandonCalibrationRun.mockResolvedValue(DETAIL.state);
});

describe('GET /api/article-rules/:runId', () => {
  it('returns the folded state and the rendered effect', async () => {
    const res = await request(app).get('/api/article-rules/run-1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ runId: 'run-1', version: 3, storedCaptures: 12 });
    expect(res.body.effect).toContain('Reversible');
  });

  it('answers 410 for a run that is gone — not a 500', async () => {
    // The plan asks for OAuth's expired-interaction treatment by name.
    service.describeCalibrationRun.mockRejectedValue(new Error('Calibration run x not found.'));
    const res = await request(app).get('/api/article-rules/x');
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('run_not_found');
  });
});

describe('POST /api/article-rules/:runId/decisions', () => {
  it('appends a decision carrying the version it was folded from', async () => {
    const res = await request(app)
      .post('/api/article-rules/run-1/decisions')
      .send({ expectedVersion: 3, type: 'CAPTURE_SHOWN', snapshotId: 'snap-1' });

    expect(res.status).toBe(200);
    expect(service.appendCalibrationDecision).toHaveBeenCalledWith('run-1', 3, {
      type: 'CAPTURE_SHOWN',
      snapshotId: 'snap-1',
      // Computed server-side and linked here. The page never posts the numbers.
      observationId: 'obs-1',
    });
  });

  it('answers 409 when another tab got there first', async () => {
    service.appendCalibrationDecision.mockRejectedValue(new StaleCalibrationVersionError());
    const res = await request(app)
      .post('/api/article-rules/run-1/decisions')
      .send({ expectedVersion: 3, type: 'CAPTURE_SHOWN', snapshotId: 'snap-1' });

    // Not 500: the page re-reads and re-offers, which it can only do if the
    // status distinguishes a race from a fault.
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('stale_version');
  });

  it('answers 410 on a run that has already closed', async () => {
    service.appendCalibrationDecision.mockRejectedValue(new CalibrationRunClosedError());
    const res = await request(app)
      .post('/api/article-rules/run-1/decisions')
      .send({ expectedVersion: 3, type: 'CAPTURE_ACCEPTED', snapshotId: 'snap-1' });
    expect(res.status).toBe(410);
  });

  it('refuses RUN_OPENED and RUN_CLOSED — those are the server’s to write', async () => {
    for (const type of ['RUN_OPENED', 'RUN_CLOSED']) {
      const res = await request(app)
        .post('/api/article-rules/run-1/decisions')
        .send({ expectedVersion: 3, type });
      expect(res.status).toBe(400);
    }
    expect(service.appendCalibrationDecision).not.toHaveBeenCalled();
  });

  it('refuses a body with no version — an append must say what it saw', async () => {
    const res = await request(app)
      .post('/api/article-rules/run-1/decisions')
      .send({ type: 'CAPTURE_SHOWN', snapshotId: 'snap-1' });
    expect(res.status).toBe(400);
  });
});

describe('the UI writes decisions; the backend applies effects', () => {
  it('commit is the only route that puts rules in force, and it runs server-side', async () => {
    const res = await request(app)
      .post('/api/article-rules/run-1/commit')
      .send({ expectedVersion: 3 });

    expect(res.status).toBe(200);
    expect(res.body.articleRulesetId).toBe('ars-9');
    expect(service.commitCalibrationRuleset).toHaveBeenCalledWith('run-1', 3);
  });

  it('abandon closes without putting anything in force', async () => {
    const res = await request(app)
      .post('/api/article-rules/run-1/abandon')
      .send({ expectedVersion: 3 });

    expect(res.status).toBe(200);
    expect(service.commitCalibrationRuleset).not.toHaveBeenCalled();
  });

  it('exposes NO route that writes a capture, a snapshot or an anchor', () => {
    // The rule stated as a check rather than as a comment, with every route
    // named and what it does beside it. A route added here fails this until
    // somebody writes down which column it belongs in.
    //
    //   /:runId                            read   run state
    //   /:runId/captures                   read   which captures to mark against
    //   /:runId/captures/:snapshotId       read   one capture, rendered inert
    //   .../preview                        read   derives a view; writes nothing
    //   /:runId/decisions                  write  a DECISION, plus its observation
    //   /:runId/commit                     write  moves the active-ruleset pointer
    //   /:runId/abandon                    write  closes the run
    //
    // Every write is run state or a derived measurement. None reaches
    // recordCapture, a snapshot, or an anchor.
    const paths = articleRulesRouter.stack
      .flatMap((layer: { route?: { path: string } }) => (layer.route ? [layer.route.path] : []))
      .sort();
    expect(paths).toEqual([
      '/:runId',
      '/:runId/abandon',
      '/:runId/captures',
      '/:runId/captures/:snapshotId',
      '/:runId/captures/:snapshotId/preview',
      '/:runId/commit',
      '/:runId/decisions',
    ]);
  });
});
