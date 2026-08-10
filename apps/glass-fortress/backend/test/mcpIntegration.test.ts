// ---------------------------------------------------------------------------
// MCP write-tool integration tests
//
// Tests the full stack: HTTP → auth guard → MCP transport → tool handler.
// Only mocked at service boundaries (Prisma, IntakeAgent, WaybackScraper).
// VectorStoreService and Web3Service are mocked and asserted NOT called —
// this is the staging gate: write tools must never touch on-chain or Pinecone.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    evidence: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    keyFigure: { createMany: jest.fn() },
    trackedUrl: { upsert: jest.fn() },
    thesis: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    thesisVersion: { create: jest.fn() },
    researchSession: { findFirst: jest.fn().mockResolvedValue(null) },
    researchSessionEvent: { create: jest.fn() },
    researcher: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../src/services/IntakeAgent', () => ({
  IntakeAgent: jest.fn().mockImplementation(() => ({
    analyzeText: jest.fn().mockResolvedValue({
      isRelevant: true,
      evidenceRole: 'Incriminating',
      category: 'Side Effect Withholding',
      targetEntity: 'Ministry of Health',
      evidenceTier: 'Tier 1: Smoking Gun',
      evidencePerspective: 'Internal Knowledge',
      tierReasoning: 'Leaked internal data.',
      summary: 'Ministry suppressed side effect findings.',
      evidenceDate: '2022-08-01',
      keyFigures: ['Prof. Barkovitz'],
      medicalConditions: ['myocarditis'],
      statisticalClaims: [],
      regulatoryMentions: [],
      euaOmissionStatus: 'Not Applicable',
      missingInformation: '',
    }),
    analyzeEvidence: jest.fn().mockResolvedValue({
      isRelevant: true,
      evidenceRole: 'Incriminating',
      category: 'Side Effect Withholding',
      targetEntity: 'Ministry of Health',
      evidenceTier: 'Tier 1: Smoking Gun',
      evidencePerspective: 'Internal Knowledge',
      tierReasoning: 'Leaked internal data.',
      summary: 'Ministry suppressed side effect findings.',
      evidenceDate: '2022-08-01',
      keyFigures: ['Prof. Barkovitz'],
      medicalConditions: ['myocarditis'],
      statisticalClaims: [],
      regulatoryMentions: [],
      euaOmissionStatus: 'Not Applicable',
      missingInformation: '',
    }),
  })),
}));

jest.mock('../src/services/WaybackScraper', () => ({
  WaybackScraper: jest.fn().mockImplementation(() => ({
    runFullScan: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Staging gate mocks — asserted NOT called in write-tool tests
jest.mock('../src/services/VectorStoreService', () => ({
  VectorStoreService: { create: jest.fn() },
}));

jest.mock('../src/services/Web3Service', () => ({
  Web3Service: jest.fn().mockImplementation(() => ({
    registerEvidenceHash: jest.fn(),
  })),
}));

jest.mock('../src/services/DevilsAdvocateAgent', () => ({
  DevilsAdvocateAgent: jest.fn().mockImplementation(() => ({
    analyze: jest.fn(),
  })),
}));

import request from 'supertest';
import express from 'express';
import { prisma } from '../src/lib/prisma';
import { VectorStoreService } from '../src/services/VectorStoreService';
import { Web3Service } from '../src/services/Web3Service';
import { DevilsAdvocateAgent } from '../src/services/DevilsAdvocateAgent';
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
const mockKeyFigureCreateMany = prisma.keyFigure.createMany as jest.Mock;
const mockTrackedUrlUpsert = prisma.trackedUrl.upsert as jest.Mock;
const mockThesisCreate = prisma.thesis.create as jest.Mock;
const mockThesisUpdate = prisma.thesis.update as jest.Mock;
const mockThesisFindUnique = prisma.thesis.findUnique as jest.Mock;
const mockThesisVersionCreate = prisma.thesisVersion.create as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockResearcherFindFirst = prisma.researcher.findFirst as jest.Mock;
const mockVectorStoreCreate = VectorStoreService.create as jest.Mock;
const MockWeb3Service = Web3Service as jest.MockedClass<typeof Web3Service>;
const MockDevilsAdvocate = DevilsAdvocateAgent as jest.MockedClass<typeof DevilsAdvocateAgent>;

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
  mockKeyFigureCreateMany.mockResolvedValue({ count: 1 });
  mockEvidenceCreate.mockResolvedValue({
    id: 'ev-int-1',
    fileHash: '0xabc',
    status: 'PENDING_REVIEW',
    evidenceRole: 'Incriminating',
    category: 'Side Effect Withholding',
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
    { name: 'create_evidence_from_url', args: { url: 'https://example.gov' } },
    { name: 'start_forensic_scan', args: { url: 'https://corona.health.gov.il/' } },
    { name: 'create_thesis_draft', args: { title: 'Test', body: 'Test thesis.' } },
    { name: 'add_thesis_version', args: { thesisId: 'thesis-int-1', body: 'Updated.' } },
    { name: 'run_ai_analysis', args: { thesisId: 'thesis-int-1' } },
    { name: 'create_research_session', args: { thesisId: 'thesis-int-1' } },
    { name: 'add_session_note', args: { thesisId: 'thesis-int-1', note: 'test' } },
    { name: 'close_research_session', args: { thesisId: 'thesis-int-1' } },
    { name: 'enrich_evidence_with_history', args: { fileHash: '0xdeadbeef' } },
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

// ===========================================================================
// create_evidence_from_url — staging gate integration
// ===========================================================================

describe('create_evidence_from_url integration', () => {
  const args = { url: 'https://example.gov/article' };

  it('returns PENDING_REVIEW status in tool output', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(mcpCall('create_evidence_from_url', args));

    const result = parseMcpToolResult(res.text) as Record<string, unknown>;
    expect(result['status']).toBe('PENDING_REVIEW');
  });

  it('staging gate: VectorStoreService.create is never called', async () => {
    await request(app)
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(mcpCall('create_evidence_from_url', args));

    expect(mockVectorStoreCreate).not.toHaveBeenCalled();
  });

  it('staging gate: Web3Service is never instantiated', async () => {
    await request(app)
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(mcpCall('create_evidence_from_url', args));

    expect(MockWeb3Service).not.toHaveBeenCalled();
  });

  it('persists to Prisma with PENDING_REVIEW', async () => {
    await request(app)
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(mcpCall('create_evidence_from_url', args));

    expect(mockEvidenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_REVIEW' }),
      }),
    );
  });
});

// ===========================================================================
// start_forensic_scan — staging gate integration
// ===========================================================================

describe('start_forensic_scan integration', () => {
  const args = { url: 'https://corona.health.gov.il/' };

  it('returns trackedUrlId and SCANNING status in tool output', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(mcpCall('start_forensic_scan', args));

    const result = parseMcpToolResult(res.text) as Record<string, unknown>;
    expect(result['trackedUrlId']).toBe('tu-int-1');
    expect(result['status']).toBe('SCANNING');
  });

  it('upserts TrackedUrl with SCANNING status', async () => {
    await request(app)
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(mcpCall('start_forensic_scan', args));

    expect(mockTrackedUrlUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { status: 'SCANNING' },
        create: expect.objectContaining({ status: 'SCANNING' }),
      }),
    );
  });
});

// ===========================================================================
// create_thesis_draft — staging gate integration
// ===========================================================================

describe('create_thesis_draft integration', () => {
  const args = {
    title: 'MOH Concealment of Vaccine Side Effects',
    body: 'The Ministry of Health concealed serious vaccine side effects.',
    evidenceHashes: ['0xabc123'],
    keyFigures: ['Prof. Barkovitz'],
  };

  it('returns thesisId and PENDING_AI status in tool output', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(mcpCall('create_thesis_draft', args));

    const result = parseMcpToolResult(res.text) as Record<string, unknown>;
    expect(result['thesisId']).toBe('thesis-int-1');
    expect(result['status']).toBe('PENDING_AI');
  });

  it('staging gate: DevilsAdvocateAgent.analyze is never called', async () => {
    await request(app)
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(mcpCall('create_thesis_draft', args));

    expect(MockDevilsAdvocate).not.toHaveBeenCalled();
  });

  it('persists ThesisVersion with PENDING_AI', async () => {
    await request(app)
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(mcpCall('create_thesis_draft', args));

    expect(mockThesisVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_AI' }),
      }),
    );
  });

  it('reports correct evidence and figure link counts', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(mcpCall('create_thesis_draft', args));

    const result = parseMcpToolResult(res.text) as Record<string, unknown>;
    expect(result['evidenceLinked']).toBe(1);
    expect(result['keyFiguresLinked']).toBe(1);
  });
});

// ===========================================================================
// add_thesis_version — staging gate integration
// ===========================================================================

describe('add_thesis_version integration', () => {
  const args = {
    thesisId: 'thesis-int-1',
    body: 'Revised: statistical manipulation confirmed by leaked Zoom recording.',
    evidenceHashes: ['0xdef456'],
  };

  it('returns new headVersionId and PENDING_AI status', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(mcpCall('add_thesis_version', args));

    const result = parseMcpToolResult(res.text) as Record<string, unknown>;
    expect(result['thesisId']).toBe('thesis-int-1');
    expect(result['status']).toBe('PENDING_AI');
  });

  it('sets parentVersionId from existing headVersionId', async () => {
    await request(app)
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(mcpCall('add_thesis_version', args));

    expect(mockThesisVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentVersionId: 'ver-int-1' }),
      }),
    );
  });

  it('staging gate: DevilsAdvocateAgent.analyze is never called', async () => {
    await request(app)
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(mcpCall('add_thesis_version', args));

    expect(MockDevilsAdvocate).not.toHaveBeenCalled();
  });

  it('returns error JSON (not HTTP error) for unknown thesis ID', async () => {
    mockThesisFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(mcpCall('add_thesis_version', { ...args, thesisId: 'nonexistent' }));

    const result = parseMcpToolResult(res.text) as Record<string, unknown>;
    expect(result['error']).toContain('nonexistent');
  });
});
