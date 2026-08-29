// ---------------------------------------------------------------------------
// POST /api/evidence/confirm — the SECOND path that turns a diff into evidence.
//
// WHY THIS FILE EXISTS. The source scan in diffPromotionGate.test.ts asserts
// this route CALLS `loadPromotionBlock`. A mutation that kept the call and
// changed its `if` to `false` SURVIVED that scan — the identifier is still
// there, so the string match still passes while the gate does nothing. That is
// the third time in this session that a source scan proved a line exists and
// nothing proved it acts. The two guards are complementary and neither replaces
// the other: the scan catches a path that never calls the rule, this catches a
// path that calls it and ignores the answer.
//
// This route writes status CONFIRMED with an on-chain tx hash, and it was
// missing from the first enumeration of promotion paths entirely.
// ---------------------------------------------------------------------------

jest.mock('../src/utils/webScraper', () => ({ scrapeUrl: jest.fn() }));
// `create` RESOLVES, rather than returning undefined. The route awaits nothing
// from it, but it does call `.then(...).catch(...)` on the result, so a mock
// returning undefined throws inside the request handler. Nothing noticed while
// every non-refused submission died at the chain call first.
jest.mock('../src/services/VectorStoreService', () => ({
  VectorStoreService: { create: jest.fn(async () => ({ upsertEvidence: jest.fn() })) },
}));
jest.mock('../src/lib/encrypt', () => ({ encryptContact: jest.fn() }));

jest.mock('../src/middleware/rateLimiting', () => ({
  aiCostLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  generalLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const db = { diff: null as Record<string, unknown> | null };
const evidenceUpsert = jest.fn();
const registerOnChain = jest.fn();

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    urlVersionDiff: { findUnique: jest.fn(async () => db.diff) },
    evidence: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      upsert: evidenceUpsert,
      create: jest.fn(),
    },
    keyFigure: { createMany: jest.fn(async () => ({ count: 0 })) },
  },
}));

jest.mock('../src/services/evidenceOnChain', () => ({
  registerEvidenceOnChain: registerOnChain,
}));

// THE CHAIN IS MOCKED, AND THAT IS A FIX RATHER THAN A CONVENIENCE.
//
// This route reaches `new Web3Service().registerEvidenceHash(...)` on every
// non-refused submission. Nothing here mocked it, so the assertions below
// passed for a reason unrelated to what they test: RPC_URL was unset in the
// test environment, the constructor threw, and the route answered 500 — which
// is merely "not 409".
//
// That made the verdict depend on ambient configuration. The moment anything in
// the import graph loaded `.env` — which `@prisma/client` does — the same tests
// began making a REAL call to Base Sepolia, and the registry's honest "already
// registered" answer came back as the 409 these tests exist to rule out. A gate
// test that passes or fails on whether a public RPC is reachable is testing the
// network, not the gate.
const mockRegisterEvidenceHash = jest.fn();
jest.mock('../src/services/Web3Service', () => ({
  Web3Service: class {
    registerEvidenceHash = mockRegisterEvidenceHash;
  },
  DuplicateEvidenceError: class DuplicateEvidenceError extends Error {},
}));

import request from 'supertest';
import express from 'express';
import { evidenceRouter } from '../src/routes/evidenceRoutes';
import { SURVIVAL_CHECK_VERSION, survivalSourceStateHash } from '../src/lib/diffSurvival';
import { TEXT_VERSION } from './helpers/survivalFixture';

const app = express();
app.use(express.json());
app.use('/api/evidence', evidenceRouter);

const DIFF_ID = 'diff-1';
const BEFORE_HASH = 'a'.repeat(64);
const AFTER_HASH = 'b'.repeat(64);
const RAW_DELETED = JSON.stringify([
  'The Ministry stated that side effects are mild and temporary in all reported cases.',
]);

const ANALYSIS = {
  evidenceRole: 'Incriminating',
  isRelevant: true,
  investigativeCategories: ['WITHHOLDING_INFORMATION'],
  summary: 'הדף שינה את הנוסח בנוגע לתופעות הלוואי.',
  missingInformation: [],
  targetEntity: 'Ministry of Health',
  evidencePerspective: 'Internal Knowledge',
  tierReasoning: 'שינוי מהותי בעמוד רשמי.',
  evidenceTier: 'Tier 2: Material',
  evidenceDate: '2022-09-06',
  keyFigures: [],
  medicalConditions: [],
  statisticalClaims: [],
  regulatoryMentions: [],
  euaOmissionStatus: 'Not Applicable',
};

function body(): Record<string, unknown> {
  return {
    url: 'https://corona.health.gov.il/vaccine-for-covid/',
    scrapedText: 'the page text as captured at submission time',
    analysis: JSON.stringify(ANALYSIS),
    urlVersionDiffId: DIFF_ID,
  };
}

function diffRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: DIFF_ID,
    rawDeletedText: RAW_DELETED,
    rawAddedText: '[]',
    beforeSnapshot: { textHash: BEFORE_HASH, textExtractionVersion: TEXT_VERSION },
    afterSnapshot: { textHash: AFTER_HASH, textExtractionVersion: TEXT_VERSION },
    survivalVerdict: null,
    survivalSourceStateHash: null,
    survivalTextVersion: null,
    survivalCheckedAt: null,
    survivalChunksChecked: null,
    survivalContradicted: [],
    ...over,
  };
}

function verdict(value: 'CONTRADICTED' | 'SURVIVES'): Record<string, unknown> {
  return {
    survivalVerdict: value,
    survivalCheckVersion: SURVIVAL_CHECK_VERSION,
    survivalTextVersion: TEXT_VERSION,
    survivalCheckedAt: new Date('2026-08-28'),
    survivalChunksChecked: 1,
    survivalContradicted: value === 'CONTRADICTED' ? [{ side: 'REMOVED', excerpt: 'x' }] : [],
    survivalSourceStateHash: survivalSourceStateHash({
      beforeTextHash: BEFORE_HASH,
      afterTextHash: AFTER_HASH,
      rawDeletedText: RAW_DELETED,
      rawAddedText: '[]',
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.diff = null;
  registerOnChain.mockResolvedValue({ txHash: '0xdeadbeef', confirmed: true });
  mockRegisterEvidenceHash.mockResolvedValue('0xdeadbeef');
  evidenceUpsert.mockResolvedValue({ id: 'ev-1' });
});

describe('POST /api/evidence/confirm refuses a contradicted diff', () => {
  it('answers 409 and explains why', async () => {
    db.diff = diffRow(verdict('CONTRADICTED'));

    const res = await request(app).post('/api/evidence/confirm').send(body());

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('CONTRADICTED');
  });

  it('writes NOTHING and anchors NOTHING', async () => {
    // This route writes CONFIRMED with an on-chain hash. The refusal has to come
    // before both, because neither can be taken back.
    db.diff = diffRow(verdict('CONTRADICTED'));

    await request(app).post('/api/evidence/confirm').send(body());

    expect(registerOnChain).not.toHaveBeenCalled();
    // The registration this route ACTUALLY makes. Asserting only the shared
    // helper left the route's own chain call unguarded — and that is the call
    // that would anchor a contradicted diff.
    expect(mockRegisterEvidenceHash).not.toHaveBeenCalled();
    expect(evidenceUpsert).not.toHaveBeenCalled();
  });
});

describe('the refusal is narrow', () => {
  it('does not refuse a SURVIVES diff', async () => {
    // Vacuity guard: if this route rejected everything, the tests above would
    // pass while proving nothing about the verdict.
    db.diff = diffRow(verdict('SURVIVES'));

    const res = await request(app).post('/api/evidence/confirm').send(body());

    // 201, not merely "not 409". With the chain mocked the route runs to
    // completion, so the guard can assert the submission SUCCEEDED rather than
    // that it failed for some other reason — which is what it was doing.
    expect(res.status).toBe(201);
    expect(mockRegisterEvidenceHash).toHaveBeenCalled();
  });

  it('does not refuse an UNCHECKED diff — that is an unasked question', async () => {
    db.diff = diffRow({});

    const res = await request(app).post('/api/evidence/confirm').send(body());

    expect(res.status).toBe(201);
  });

  it('does not refuse a submission that names no diff at all', async () => {
    const { urlVersionDiffId: _omitted, ...noDiff } = body();

    const res = await request(app).post('/api/evidence/confirm').send(noDiff);

    expect(res.status).toBe(201);
  });
});
