// ---------------------------------------------------------------------------
// THE MCP WRITE GATE: HTTP → auth guard → transport → handler.
//
// MOVED HERE AT EVIDENCE STEP 11a from `mcpIntegration.test.ts`, which is
// deleted. Document refactor plan §5 planned this move for step 36 and named the
// reason: that file mocked `IntakeAgent` BY PATH, and a KEEP group cannot stay
// green in a file whose `jest.mock` targets a module the step deletes — it throws
// at load, before a single assertion runs. The plan's hazard list calls it "mock
// by path"; this is it, paid rather than tripped over.
//
// WHAT MOVED IS THE GATE'S CONTRACT, NOT ITS FIXTURES. The tools named below are
// whatever the surface still carries: the list has been re-pointed at every one
// of the three deletion PRs, because a gate list that only ever shrinks
// eventually tests nothing, and a fixture naming a retired tool is a gate tested
// against something nobody can call.
//
// The second KEEP group the plan expected to move — evidence creation — went
// with `create_evidence_from_url` at 11a-evidence, so one group moved, not two.
//
// Mocked at service boundaries only. `Web3Service` is mocked and asserted NOT
// called: that is the staging gate, which forbids a write tool touching the
// chain. The Pinecone half of that assertion left with `VectorStoreService` in
// 11a-document — evidence §5 leaves the embedding no source and no reader.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    evidence: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    trackedUrl: { upsert: jest.fn() },
    thesis: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    thesisVersion: { create: jest.fn() },
    researchSession: { findFirst: jest.fn().mockResolvedValue(null) },
    researchSessionEvent: { create: jest.fn() },
    researcher: { findFirst: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../src/oauth/oidcProvider', () => ({
  oidcProvider: {
    issuer: 'https://backend.test/oauth',
    AccessToken: { find: jest.fn().mockResolvedValue(undefined) },
  },
  resolveOrigin: jest.fn().mockReturnValue('https://backend.test'),
}));

jest.mock('../src/services/Web3Service', () => {
  const MockWeb3Service: jest.Mock & { hashFile?: jest.Mock } = jest.fn().mockImplementation(() => ({
    registerEvidenceHash: jest.fn(),
  }));
  // hashFile is a static, side-effect-free helper (SHA-256 of a buffer) — safe
  // to keep real-ish under the staging gate, which only forbids on-chain/
  // Pinecone calls. Tests assert the *constructor* (on-chain registration) is
  // never invoked; a static method call doesn't touch that mock's call count.
  MockWeb3Service.hashFile = jest.fn().mockReturnValue('0xmockedfilehash');
  return { Web3Service: MockWeb3Service };
});

// The verification tools reach the archived-page extractor, which loads jsdom —
// ESM-only in its dependency chain and unparseable by ts-jest, the same reason
// every scraper test stubs it. Nothing here exercises extraction; what the real
// extractor does is measured in test/extraction/ against a frozen capture.
jest.mock('jsdom', () => ({
  JSDOM: jest.fn().mockImplementation((html: string) => ({
    window: { document: { body: { innerHTML: html ?? '' } } },
  })),
}));
jest.mock('@mozilla/readability', () => ({
  Readability: jest.fn().mockImplementation(() => ({ parse: () => null })),
}));

import request from 'supertest';
import express from 'express';
import { prisma } from '../src/lib/prisma';
import { Web3Service } from '../src/services/Web3Service';
import { hashToken } from '../src/lib/tokenHash';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mcpRouter } = require('../src/mcp/mcpRoutes') as { mcpRouter: express.Router };

const app = express();
app.use(express.json());
app.use('/api/mcp', mcpRouter);

const VALID_TOKEN = 'integration-test-token';
// MCP requires Accept: application/json, text/event-stream for tools/call
const MCP_ACCEPT = 'application/json, text/event-stream';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a tool result out of the SSE envelope the MCP transport sends. */
function parseMcpToolResult(sseText: string): unknown {
  const dataLine = sseText
    .split('\n')
    .find((line) => line.startsWith('data:'));
  if (!dataLine) throw new Error(`No SSE data line in response:\n${sseText}`);
  const envelope = JSON.parse(dataLine.slice(5).trim()) as {
    result?: { content?: Array<{ type: string; text: string }> };
    error?: unknown;
  };
  if (envelope.error) throw new Error(`MCP error: ${JSON.stringify(envelope.error)}`);
  const text = envelope.result?.content?.[0]?.text;
  if (text === undefined) throw new Error(`No content text in MCP result: ${JSON.stringify(envelope)}`);
  return JSON.parse(text);
}

function mcpCall(toolName: string, args: Record<string, unknown>) {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mockEvidenceFindUnique = prisma.evidence.findUnique as jest.Mock;
const mockEvidenceFindMany = prisma.evidence.findMany as jest.Mock;
const mockEvidenceCreate = prisma.evidence.create as jest.Mock;
const mockTrackedUrlUpsert = prisma.trackedUrl.upsert as jest.Mock;
const mockThesisCreate = prisma.thesis.create as jest.Mock;
const mockThesisUpdate = prisma.thesis.update as jest.Mock;
const mockThesisFindUnique = prisma.thesis.findUnique as jest.Mock;
const mockThesisVersionCreate = prisma.thesisVersion.create as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockResearcherFindFirst = prisma.researcher.findFirst as jest.Mock;
const MockWeb3Service = Web3Service as jest.MockedClass<typeof Web3Service>;

const TEST_HMAC_SECRET = 'test-hmac-secret-for-jest';
const MOCK_RESEARCHER = { id: 'researcher-1', handle: 'test_researcher', role: 'RESEARCHER', approved: true };

beforeEach(() => {
  process.env['TOKEN_HMAC_SECRET'] = TEST_HMAC_SECRET;
  jest.clearAllMocks();

  // Return approved researcher only when the token matches VALID_TOKEN
  mockResearcherFindFirst.mockImplementation(
    async (args: { where: { mcpTokenHash: string } }) => {
      const validHash = hashToken(VALID_TOKEN);
      return args.where.mcpTokenHash === validHash ? MOCK_RESEARCHER : null;
    },
  );

  // Fetch mock for create_evidence_from_url
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: jest.fn().mockReturnValue('text/html; charset=utf-8') },
    text: jest.fn().mockResolvedValue(
      '<html><body><p>Health ministry internal meeting recording leaked. ' +
      'Prof. Barkovitz presented alarming side effect findings that were suppressed ' +
      'from the official August 2022 report published by the ministry.</p></body></html>',
    ),
  } as unknown as Response);

  mockEvidenceFindUnique.mockResolvedValue(null);
  // evidence.findMany used by createThesisDraftHandler to look up summaries for mention labels
  mockEvidenceFindMany.mockResolvedValue([
    { fileHash: '0xabc123', summary: 'Ministry suppressed side effect findings.' },
  ]);
  mockEvidenceCreate.mockResolvedValue({
    id: 'ev-int-1',
    fileHash: '0xabc',
    status: 'PENDING_REVIEW',
    evidenceRole: 'Incriminating',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
    targetEntity: 'Ministry of Health',
    evidenceTier: 'Tier 1: Smoking Gun',
    summary: 'Ministry suppressed side effect findings.',
    evidenceDate: '2022-08-01',
    figures: [{ name: 'Prof. Barkovitz' }],
    sourceUrl: 'https://example.gov/article',
  });

  mockTrackedUrlUpsert.mockResolvedValue({
    id: 'tu-int-1',
    url: 'https://corona.health.gov.il/',
    status: 'SCANNING',
  });

  mockThesisCreate.mockResolvedValue({ id: 'thesis-int-1', createdAt: new Date() });
  mockThesisVersionCreate.mockResolvedValue({
    id: 'ver-int-1',
    thesisId: 'thesis-int-1',
    parentVersionId: null,
    status: 'PENDING_AI',
    contentHash: 'abc',
    createdAt: new Date(),
  });
  mockThesisUpdate.mockResolvedValue({
    id: 'thesis-int-1',
    headVersionId: 'ver-int-1',
    createdAt: new Date(),
  });
  mockThesisFindUnique.mockResolvedValue({
    id: 'thesis-int-1',
    headVersionId: 'ver-int-1',
    createdAt: new Date(),
  });

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      thesis: { create: mockThesisCreate, update: mockThesisUpdate },
      thesisVersion: { create: mockThesisVersionCreate },
    };
    return fn(tx);
  });
});

afterEach(() => {
  delete process.env['TOKEN_HMAC_SECRET'];
});

// ===========================================================================
// Auth enforcement — all write tools
// ===========================================================================

describe('write tool auth enforcement', () => {
  const writeTools = [
    // `create_evidence_from_url` left the surface at evidence step 11a (evidence
    // A4: a selection with nothing to select). The gate's rule is unchanged and
    // the list keeps a write tool of every layer, so it is replaced rather than
    // shortened — a gate list that only shrinks eventually tests nothing.
    { name: 'scan_captures', args: { url: 'https://corona.health.gov.il/' } },
    { name: 'survey_wayback_captures', args: { url: 'https://corona.health.gov.il/' } },
    // RE-POINTED AT EVERY ONE OF THE THREE DELETION PRs, AND THAT IS THE POINT.
    // `create_evidence_from_url` went in 11a-evidence, six thesis tools in
    // 11a-thesis, `create_evidence_from_text` here — document flows §9 retires it
    // for `add_document`. The gate's rule never changed; what a gate list must
    // name is a tool somebody can actually call, and a list that only ever
    // shrinks eventually tests nothing.
    //
    // EVERY WRITE TOOL THE SURFACE HAS IS HERE, which is the strongest form this
    // case has ever taken: until the thesis and document doors are rebuilt at
    // steps 20 and 30, the walk's five writes ARE the write surface.
    { name: 'scan_captures', args: { url: 'https://corona.health.gov.il/' } },
    { name: 'survey_wayback_captures', args: { url: 'https://corona.health.gov.il/' } },
    { name: 'approve_article_rules', args: { url: 'https://corona.health.gov.il/', capture: '20220101000000' } },
    { name: 'resolve_scan_stop', args: { url: 'https://corona.health.gov.il/', capture: '20220101000000', resolution: 'CONTINUE' } },
    { name: 'reset_article_calibration', args: { url: 'https://corona.health.gov.il/', reason: 'test' } },
  ];

  for (const { name, args } of writeTools) {
    it(`${name}: returns 401 with no token`, async () => {
      const res = await request(app)
        .post('/api/mcp')
        .set('Accept', MCP_ACCEPT)
        .send(mcpCall(name, args));
      expect(res.status).toBe(401);
    });

    it(`${name}: returns 401 with wrong token`, async () => {
      const res = await request(app)
        .post('/api/mcp')
        .set('Accept', MCP_ACCEPT)
        .set('Authorization', 'Bearer wrong')
        .send(mcpCall(name, args));
      expect(res.status).toBe(401);
    });
  }
});


// THE TWO THESIS INTEGRATION GROUPS WENT WITH THEIR TOOLS AT EVIDENCE STEP 11a:
// `create_thesis_draft` is retired by thesis A4 (the framing is named, not derived)
// and `add_thesis_version` is REWRITE, its successor landing at thesis step 20 over
// T2's shape. The write-tool auth group above is KEEP and stays: it asserts the
// GATE, which is unchanged, and its list keeps a live tool of every layer.