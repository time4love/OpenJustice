// ---------------------------------------------------------------------------
// ROUTE COEXISTENCE AT /api/article-rules — refactor step 6 (plan §8).
//
// RETIRE at step 8, with the legacy mount this file holds in place: when
// `articleRulesRouter` goes, the order it holds has nothing left to be an order
// of, and this file is deleted in the same commit (beside
// test/articleRulesRoutes.test.ts, which goes with the router).
//
// Two halves. (a) A SOURCE SCAN over src/server.ts: both mounts are found —
// the walk's page-scoped router and the legacy run-scoped one, at one base —
// and the walk's comes first. A missing mount FAILS rather than passing on an
// absent line (the vacuity guard). (b) BEHAVIOUR with the REAL routers, each
// mocked at its edges exactly as its own test mocks them, mounted in the
// server's order: every A6 path reaches the walk router and the legacy
// `/:runId/captures/:snapshotId` still reaches the legacy one.
//
// WHAT THIS DOES NOT CLAIM. Measured 2026-09-05 against Express 5.2.1: the
// legacy `/:runId/captures/:snapshotId` cannot answer `/pages/<id>/captures/
// <capture>` in EITHER order — a static segment matches literally, and the
// legacy pattern needs `captures` where the new path carries the page id. The
// order is held so that step 8's removal of the legacy mount changes nothing
// observable, not because a shadow was found; a case asserting a legacy answer
// under the reversed order would be red on the truth, so none is written.
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

// The legacy router's edges, as test/articleRulesRoutes.test.ts mocks them:
// captureMarking by factory (its parser chain is ESM-only), calibrationRun by
// factory with the two error classes the router translates.
const legacy = { loadCaptureForMarking: jest.fn() };
jest.mock('../src/services/captureMarking', () => ({
  loadCaptureForMarking: (...a: unknown[]) => legacy.loadCaptureForMarking(...a),
  previewUnderSelectors: jest.fn(),
  recordObservationForCapture: jest.fn(),
  appendDecisionWithObservation: jest.fn(),
}));
jest.mock('../src/services/calibrationRun', () => ({
  describeCalibrationRun: jest.fn(),
  readCalibrationRun: jest.fn(),
  readCalibrationDraft: jest.fn(),
  saveCalibrationDraft: jest.fn(),
  discardCalibrationDraft: jest.fn(),
  ensureCurrentRuleset: jest.fn(),
  appendCalibrationDecision: jest.fn(),
  commitCalibrationRuleset: jest.fn(),
  abandonCalibrationRun: jest.fn(),
  StaleCalibrationVersionError: class extends Error {},
  CalibrationRunClosedError: class extends Error {},
}));

// The walk router's edges, as test/walk/markingRoutes.test.ts mocks them:
// prisma's delegates, and the jsdom-backed module by path.
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn(), update: jest.fn() },
    cdxIndexEntry: { findFirst: jest.fn() },
    urlSnapshot: { findUnique: jest.fn() },
    rule: { findMany: jest.fn() },
    pageDecision: { findMany: jest.fn() },
  },
}));
jest.mock('../src/lib/chromeRulesetApply', () => ({
  deriveTextUnderRuleset: jest.fn(),
  documentOutline: jest.fn(),
  inertDocument: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import { join } from 'node:path';
import { prisma } from '../src/lib/prisma';
import { articleRulesRouter } from '../src/routes/articleRulesRoutes';
import { walkArticleRulesRouter } from '../src/walk/routes';
import { SRC, readCode, codeOf } from './walk/scan';

const SERVER = join(SRC, 'server.ts');
const BASE = '/api/article-rules';
const WALK_MOUNT = `app.use('${BASE}', walkArticleRulesRouter)`;
const LEGACY_MOUNT = `app.use('${BASE}', articleRulesRouter)`;

/** Where the two mounts stand in the code: the walk's first, reversed, or one of them missing. */
function mountOrder(code: string): 'WALK_FIRST' | 'REVERSED' | 'MISSING' {
  const walk = code.indexOf(WALK_MOUNT);
  const old = code.indexOf(LEGACY_MOUNT);
  if (walk < 0 || old < 0) return 'MISSING';
  return walk < old ? 'WALK_FIRST' : 'REVERSED';
}

describe('(a) src/server.ts mounts the walk router before the legacy one at /api/article-rules', () => {
  it('both mounts are present, and the walk’s comes first', () => {
    expect(mountOrder(readCode(SERVER))).toBe('WALK_FIRST');
  });

  it('DETECTS the reversed order, and a mount that exists only in a comment — proven against decoys', () => {
    expect(mountOrder(codeOf(`${LEGACY_MOUNT};\n${WALK_MOUNT};`))).toBe('REVERSED');
    expect(mountOrder(codeOf(`// ${WALK_MOUNT};\n${LEGACY_MOUNT};`))).toBe('MISSING');
    expect(mountOrder(codeOf(`${WALK_MOUNT};\n${LEGACY_MOUNT};`))).toBe('WALK_FIRST');
  });
});

describe('(b) the real routers, mounted in the server’s order', () => {
  const app = express();
  app.use(express.json());
  app.use(BASE, walkArticleRulesRouter);
  app.use(BASE, articleRulesRouter);

  type Mock = jest.Mock;
  const trackedFind = (prisma as unknown as { trackedUrl: { findUnique: Mock } }).trackedUrl.findUnique;

  beforeEach(() => {
    jest.clearAllMocks();
    // A page that does not exist: the walk router answers 404 itself, which
    // is enough to show which router the request reached.
    trackedFind.mockResolvedValue(null);
    legacy.loadCaptureForMarking.mockResolvedValue({ snapshotId: 'snap-1' });
  });

  it('every A6 path reaches the walk router, and not the legacy one', async () => {
    const calls = [
      request(app).get(`${BASE}/pages/page-1/captures/20200301140000`),
      request(app).post(`${BASE}/pages/page-1/captures/20200301140000/preview`).send({ selectors: [] }),
      request(app).get(`${BASE}/pages/page-1/draft`),
      request(app).put(`${BASE}/pages/page-1/draft`).send({ capture: '20200301140000', selectors: [], trusted: [], returned: false }),
      request(app).delete(`${BASE}/pages/page-1/draft`),
    ];
    for (const call of calls) {
      const res = await call;
      expect({ status: res.status, code: (res.body as { code?: string }).code }).toEqual({ status: 404, code: 'NOT_SURVEYED' });
    }
    expect(trackedFind).toHaveBeenCalledTimes(calls.length);
    expect(trackedFind).toHaveBeenCalledWith({ where: { id: 'page-1' } });
    expect(legacy.loadCaptureForMarking).not.toHaveBeenCalled();
  });

  it('the legacy /:runId/captures/:snapshotId still reaches the legacy router — the vacuity guard on the mock', async () => {
    const res = await request(app).get(`${BASE}/run-1/captures/snap-1`);
    expect(res.status).toBe(200);
    expect(legacy.loadCaptureForMarking).toHaveBeenCalledWith('snap-1');
    expect(trackedFind).not.toHaveBeenCalled();
  });
});
