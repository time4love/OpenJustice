import request from 'supertest';
import { PatternCategory } from '../../src/generated/prisma';

// Shared mock objects — module-level singletons share one mock per service.
const mockCommitmentService = {
  getPatternCount: jest.fn(),
  getFigurePatternSummary: jest.fn(),
  registerCommitment: jest.fn(),
};
const mockPatternThesisService = {
  buildThesis: jest.fn(),
  listActiveFigures: jest.fn(),
  getDomainLabels: jest.fn().mockReturnValue({}),
};

jest.mock('../../src/services/CommitmentService', () => ({
  CommitmentService: jest.fn().mockImplementation(() => mockCommitmentService),
}));

jest.mock('../../src/services/PatternThesisService', () => ({
  PatternThesisService: jest.fn().mockImplementation(() => mockPatternThesisService),
}));

jest.mock('../../src/lib/supabase', () => ({
  supabaseAdmin: { auth: { getUser: jest.fn() } },
}));

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    keyFigure: { findUnique: jest.fn() },
    commitment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}));

const mockRegisterCommitmentHash = jest.fn();
jest.mock('../../src/lib/web3', () => ({
  getWeb3Service: jest.fn().mockReturnValue(null),
}));

import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { getWeb3Service } from '../../src/lib/web3';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const WRITE_TOKEN = 'test-write-token';

beforeAll(() => {
  process.env['MCP_WRITE_TOKEN'] = WRITE_TOKEN;
});

function mcpCall(toolName: string, args: Record<string, unknown>) {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  };
}

// Parse the JSON-RPC result from an SSE response body
function parseMcpResult(responseText: string): unknown {
  const lines = responseText.split('\n');
  for (const line of lines) {
    const trimmed = line.startsWith('data: ') ? line.slice(6).trim() : line.trim();
    if (!trimmed || trimmed === '[DONE]') continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.result) return parsed.result;
    } catch {
      // not this line
    }
  }
  return null;
}

describe('GET /api/mcp', () => {
  it('returns server info', async () => {
    const res = await request(app).get('/api/mcp');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Bronze Fortress MCP');
    expect(res.body.readTools).toContain('query_pattern');
    expect(res.body.writeTools).toContain('register_commitment');
  });
});

describe('POST /api/mcp — auth', () => {
  it('rejects register_commitment without token', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(mcpCall('register_commitment', {
        caseId: 'case-1', figureId: 'fig-1', courtId: 'court-1',
        patternCategory: PatternCategory.EX_PARTE_HEARING,
      }));
    expect(res.status).toBe(401);
  });

  it('rejects register_commitment with wrong token', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', 'Bearer wrong-token')
      .send(mcpCall('register_commitment', {
        caseId: 'case-1', figureId: 'fig-1', courtId: 'court-1',
        patternCategory: PatternCategory.EX_PARTE_HEARING,
      }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/mcp — query_pattern (read, no auth)', () => {
  it('returns pattern count for a figure + category', async () => {
    mockCommitmentService.getPatternCount.mockResolvedValue(7);

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(mcpCall('query_pattern', {
        figureId: 'fig-1',
        patternCategory: PatternCategory.EX_PARTE_HEARING,
      }));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.familyCount).toBe(7);
  });
});

describe('POST /api/mcp — get_key_figure_profile (read, no auth)', () => {
  it('returns error object when figure not found', async () => {
    (mockPrisma.keyFigure.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(mcpCall('get_key_figure_profile', { figureId: 'fig-missing' }));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.error).toMatch(/not found/i);
  });
});

describe('POST /api/mcp — register_commitment (write, auth required)', () => {
  it('registers a new commitment with valid token', async () => {
    mockCommitmentService.registerCommitment.mockResolvedValue({
      commitment: { id: 'cm-1', commitmentHash: 'abc123' },
      isDuplicate: false,
    });

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', `Bearer ${WRITE_TOKEN}`)
      .send(mcpCall('register_commitment', {
        caseId: 'case-1', figureId: 'fig-1', courtId: 'court-1',
        patternCategory: PatternCategory.EX_PARTE_HEARING,
      }));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.isDuplicate).toBe(false);
    expect(content.commitmentHash).toBe('abc123');
  });
});

describe('POST /api/mcp — build_pattern_thesis (read, no auth)', () => {
  it('returns error when figure not found or not active', async () => {
    mockPatternThesisService.buildThesis.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(mcpCall('build_pattern_thesis', { figureId: 'fig-missing' }));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.error).toMatch(/fig-missing/);
  });

  it('returns structured thesis for an active figure', async () => {
    mockPatternThesisService.buildThesis.mockResolvedValue({
      figureId: 'fig-1',
      figureName: 'Judge Test',
      figureType: 'JUDGE',
      organization: null,
      court: 'Jerusalem Family Court',
      activatedAt: new Date('2026-01-01'),
      totalCases: 5,
      totalCommitments: 8,
      onChainCount: 6,
      byDomain: {},
      legalNote: 'test note',
      generatedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(mcpCall('build_pattern_thesis', { figureId: 'fig-1' }));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.thesis.figureName).toBe('Judge Test');
    expect(content.thesis.summary.totalCases).toBe(5);
    expect(content.thesis.summary.onChainRegistered).toBe(6);
  });
});

describe('POST /api/mcp — list_active_figures (read, no auth)', () => {
  it('returns active figures list', async () => {
    mockPatternThesisService.listActiveFigures.mockResolvedValue([
      { id: 'fig-1', name: 'Judge A', type: 'JUDGE', totalCases: 7, court: 'Jerusalem' },
      { id: 'fig-2', name: 'Worker B', type: 'SOCIAL_WORKER', totalCases: 3, court: null },
    ]);

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(mcpCall('list_active_figures', {}));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.count).toBe(2);
    expect(content.figures[0].name).toBe('Judge A');
  });
});

describe('POST /api/mcp — register_on_chain (write, auth required)', () => {
  it('rejects without token', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(mcpCall('register_on_chain', {}));
    expect(res.status).toBe(401);
  });

  it('returns error when web3 is not configured', async () => {
    (getWeb3Service as jest.Mock).mockReturnValue(null);

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', `Bearer ${WRITE_TOKEN}`)
      .send(mcpCall('register_on_chain', {}));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.error).toMatch(/not configured/i);
  });

  it('registers pending commitments and returns counts', async () => {
    mockRegisterCommitmentHash.mockResolvedValue('0xabc123');
    (getWeb3Service as jest.Mock).mockReturnValue({
      registerCommitmentHash: mockRegisterCommitmentHash,
    });
    (mockPrisma.commitment.findMany as jest.Mock).mockResolvedValue([
      { id: 'cm-1', commitmentHash: 'hash1' },
      { id: 'cm-2', commitmentHash: 'hash2' },
    ]);
    (mockPrisma.commitment.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', `Bearer ${WRITE_TOKEN}`)
      .send(mcpCall('register_on_chain', {}));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.attempted).toBe(2);
    expect(content.succeeded).toBe(2);
    expect(content.failed).toBe(0);
  });

  it('reports failed registrations without throwing', async () => {
    mockRegisterCommitmentHash.mockRejectedValue(new Error('RPC error'));
    (getWeb3Service as jest.Mock).mockReturnValue({
      registerCommitmentHash: mockRegisterCommitmentHash,
    });
    (mockPrisma.commitment.findMany as jest.Mock).mockResolvedValue([
      { id: 'cm-1', commitmentHash: 'hash1' },
    ]);

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', `Bearer ${WRITE_TOKEN}`)
      .send(mcpCall('register_on_chain', {}));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.attempted).toBe(1);
    expect(content.succeeded).toBe(0);
    expect(content.failed).toBe(1);
    expect(content.results[0].error).toMatch(/RPC error/);
  });
});
