import request from 'supertest';
import { PatternCategory } from '../../src/generated/prisma';

// Shared mock objects — module-level singletons share one mock per service.
const mockAllegationService = {
  getPatternCount: jest.fn(),
  getFigurePatternSummary: jest.fn(),
  registerAllegation: jest.fn(),
};
const mockPatternThesisService = {
  buildThesis: jest.fn(),
  listActiveFigures: jest.fn(),
  getDomainLabels: jest.fn().mockReturnValue({}),
};
const mockPatternDetectionService = {
  suggestAllegations: jest.fn(),
};

jest.mock('../../src/services/AllegationService', () => ({
  AllegationService: jest.fn().mockImplementation(() => mockAllegationService),
}));

jest.mock('../../src/services/PatternThesisService', () => ({
  PatternThesisService: jest.fn().mockImplementation(() => mockPatternThesisService),
}));

jest.mock('../../src/services/PatternDetectionService', () => ({
  PatternDetectionService: jest.fn().mockImplementation(() => mockPatternDetectionService),
}));

jest.mock('../../src/lib/supabase', () => ({
  supabaseAdmin: { auth: { getUser: jest.fn() } },
}));

const mockFigureService = {
  nominateAndCommit: jest.fn(),
};

jest.mock('../../src/services/FigureService', () => ({
  FigureService: jest.fn().mockImplementation(() => mockFigureService),
}));

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    keyFigure: { findUnique: jest.fn(), findMany: jest.fn() },
    court: { findMany: jest.fn() },
    allegation: {
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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { KeyFigureType } = require('../../src/generated/prisma');

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
    expect(res.body.writeTools).toContain('register_allegation');
  });
});

describe('POST /api/mcp — auth', () => {
  it('rejects register_allegation without token', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(mcpCall('register_allegation', {
        caseId: 'case-1', figureId: 'fig-1', courtId: 'court-1',
        patternCategory: PatternCategory.EX_PARTE_HEARING,
      }));
    expect(res.status).toBe(401);
  });

  it('rejects register_allegation with wrong token', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', 'Bearer wrong-token')
      .send(mcpCall('register_allegation', {
        caseId: 'case-1', figureId: 'fig-1', courtId: 'court-1',
        patternCategory: PatternCategory.EX_PARTE_HEARING,
      }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/mcp — query_pattern (read, no auth)', () => {
  it('returns pattern count for a figure + category', async () => {
    mockAllegationService.getPatternCount.mockResolvedValue(7);

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
    expect(content.caseCount).toBe(7);
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

describe('POST /api/mcp — register_allegation (write, auth required)', () => {
  it('registers a new allegation with valid token', async () => {
    mockAllegationService.registerAllegation.mockResolvedValue({
      allegation: { id: 'al-1', allegationHash: 'abc123' },
      isDuplicate: false,
    });

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', `Bearer ${WRITE_TOKEN}`)
      .send(mcpCall('register_allegation', {
        caseId: 'case-1', figureId: 'fig-1', courtId: 'court-1',
        patternCategory: PatternCategory.EX_PARTE_HEARING,
      }));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.isDuplicate).toBe(false);
    expect(content.allegationHash).toBe('abc123');
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
      totalAllegations: 8,
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
    expect(content.thesis.summary.totalAllegations).toBe(8);
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

  it('registers pending allegations and returns counts', async () => {
    mockRegisterCommitmentHash.mockResolvedValue('0xabc123');
    (getWeb3Service as jest.Mock).mockReturnValue({
      registerCommitmentHash: mockRegisterCommitmentHash,
    });
    (mockPrisma.allegation.findMany as jest.Mock).mockResolvedValue([
      { id: 'al-1', allegationHash: 'hash1' },
      { id: 'al-2', allegationHash: 'hash2' },
    ]);
    (mockPrisma.allegation.update as jest.Mock).mockResolvedValue({});

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
    (mockPrisma.allegation.findMany as jest.Mock).mockResolvedValue([
      { id: 'al-1', allegationHash: 'hash1' },
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

describe('POST /api/mcp — suggest_allegations (write, auth required)', () => {
  it('rejects without token', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(mcpCall('suggest_allegations', { caseId: 'case-1', figureId: 'fig-1', courtId: 'court-1' }));
    expect(res.status).toBe(401);
  });

  it('returns suggestions with pending and already-registered counts', async () => {
    mockPatternDetectionService.suggestAllegations.mockResolvedValue({
      caseId: 'case-1',
      figureId: 'fig-1',
      courtId: 'court-1',
      suggestions: [
        { patternCategory: 'CRIMINAL_EXONERATION_IGNORED', evidence: 'test', alreadyRegistered: false },
        { patternCategory: 'NZAKUT_NO_EVIDENTIARY_HEARING', evidence: 'test', alreadyRegistered: true },
      ],
      domainsAnalyzed: ['A', 'B'],
      note: 'test note',
    });

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', `Bearer ${WRITE_TOKEN}`)
      .send(mcpCall('suggest_allegations', { caseId: 'case-1', figureId: 'fig-1', courtId: 'court-1' }));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.suggestions).toHaveLength(2);
    expect(content.pendingCount).toBe(1);
    expect(content.alreadyRegisteredCount).toBe(1);
  });
});

describe('POST /api/mcp — list_figures_pending_review (read, no auth)', () => {
  it('returns pending figures sorted by case count descending', async () => {
    (mockPrisma.keyFigure.findMany as jest.Mock).mockResolvedValue([
      { id: 'fig-1', name: 'Judge A', type: 'JUDGE', organization: null, createdAt: new Date(), court: { name: 'בית משפט לענייני משפחה', city: 'ירושלים' } },
      { id: 'fig-2', name: 'Worker B', type: 'SOCIAL_WORKER', organization: 'לשכת רווחה', createdAt: new Date(), court: null },
    ]);
    // First call: 5 distinct cases for fig-1; second call: 2 for fig-2
    (mockPrisma.allegation.findMany as jest.Mock)
      .mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => ({ caseId: `case-${i}` })))
      .mockResolvedValueOnce(Array.from({ length: 2 }, (_, i) => ({ caseId: `case-${i}` })));

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(mcpCall('list_figures_pending_review', {}));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.count).toBe(2);
    expect(content.figures[0].figureId).toBe('fig-1');
    expect(content.figures[0].caseCount).toBe(5);
    expect(content.figures[1].caseCount).toBe(2);
    expect(content.note).toMatch(/activate_figure/);
  });

  it('returns empty list when no figures are pending', async () => {
    (mockPrisma.keyFigure.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(mcpCall('list_figures_pending_review', {}));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.count).toBe(0);
    expect(content.figures).toHaveLength(0);
  });
});

describe('POST /api/mcp — list_courts (read, no auth)', () => {
  it('returns all seeded courts', async () => {
    (mockPrisma.court.findMany as jest.Mock).mockResolvedValue([
      { id: 'court-jerusalem', name: 'בית משפט לענייני משפחה', city: 'ירושלים', district: 'ירושלים' },
      { id: 'court-tel-aviv', name: 'בית משפט לענייני משפחה', city: 'תל אביב', district: 'תל אביב' },
    ]);

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(mcpCall('list_courts', {}));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.count).toBe(2);
    expect(content.courts[0].id).toBe('court-jerusalem');
    expect(content.usage).toMatch(/courtId/);
  });

  it('filters by district when provided', async () => {
    (mockPrisma.court.findMany as jest.Mock).mockResolvedValue([
      { id: 'court-jerusalem', name: 'בית משפט לענייני משפחה', city: 'ירושלים', district: 'ירושלים' },
    ]);

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(mcpCall('list_courts', { district: 'ירושלים' }));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.count).toBe(1);
  });
});

describe('POST /api/mcp — nominate_and_commit (write, auth required)', () => {
  it('rejects without token', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(mcpCall('nominate_and_commit', {
        caseId: 'case-1', name: 'Judge Test', type: 'JUDGE',
      }));
    expect(res.status).toBe(401);
  });

  it('creates figure + registers patterns and returns structured result', async () => {
    mockFigureService.nominateAndCommit.mockResolvedValue({
      figure: { id: 'fig-1', name: 'Judge Test', type: KeyFigureType.JUDGE, status: 'PENDING' },
      court: { id: 'court-jerusalem', name: 'בית משפט לענייני משפחה', city: 'ירושלים' },
      patterns: [
        { patternCategory: 'NZAKUT_NO_EVIDENTIARY_HEARING', evidence: 'evidentiaryHearingHeld=false', alreadyRegistered: false },
        { patternCategory: 'EMERGENCY_ORDER_NO_HEARING_30_DAYS', evidence: 'daysToFullHearing=45', alreadyRegistered: true },
      ],
      newAllegationsCreated: 1,
    });

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', `Bearer ${WRITE_TOKEN}`)
      .send(mcpCall('nominate_and_commit', {
        caseId: 'case-1', name: 'Judge Test', type: 'JUDGE',
      }));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.figureId).toBe('fig-1');
    expect(content.figureName).toBe('Judge Test');
    expect(content.figureStatus).toBe('PENDING');
    expect(content.patternsDetected).toBe(2);
    expect(content.newAllegationsCreated).toBe(1);
    expect(content.patterns).toHaveLength(2);
    expect(content.nextStep).toMatch(/register_on_chain/);
    expect(content.nextStep).toMatch(/activate_figure/);
  });

  it('returns all-registered message when nothing is new', async () => {
    mockFigureService.nominateAndCommit.mockResolvedValue({
      figure: { id: 'fig-1', name: 'Judge Test', type: KeyFigureType.JUDGE, status: 'PENDING' },
      court: { id: 'court-jerusalem', name: 'בית משפט לענייני משפחה', city: 'ירושלים' },
      patterns: [
        { patternCategory: 'NZAKUT_NO_EVIDENTIARY_HEARING', evidence: 'test', alreadyRegistered: true },
      ],
      newAllegationsCreated: 0,
    });

    const res = await request(app)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', `Bearer ${WRITE_TOKEN}`)
      .send(mcpCall('nominate_and_commit', {
        caseId: 'case-1', name: 'Judge Test', type: 'JUDGE',
      }));

    expect(res.status).toBe(200);
    const result = parseMcpResult(res.text) as { content: { text: string }[] };
    const content = JSON.parse(result.content[0].text);
    expect(content.newAllegationsCreated).toBe(0);
    expect(content.nextStep).toMatch(/already registered/);
  });
});
