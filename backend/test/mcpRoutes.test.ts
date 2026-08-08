// ---------------------------------------------------------------------------
// MCP route auth tests
// Tests the bearer-token guard for write tools and the isWriteToolCall helper.
// The MCP transport layer is mocked so tests don't need a real server.
// ---------------------------------------------------------------------------

// Mock the transport and server before any imports so the route module never
// tries to connect to the MCP SDK internals.
jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: jest.fn().mockImplementation(() => ({
    handleRequest: jest.fn().mockImplementation((_req: unknown, res: { json: (b: unknown) => void }) => {
      res.json({ jsonrpc: '2.0', id: 1, result: {} });
      return Promise.resolve();
    }),
    close: jest.fn(),
  })),
}));

jest.mock('../src/mcp/mcpServer', () => ({
  createMcpServer: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
  }),
}));

import request from 'supertest';
import express from 'express';
import { isWriteToolCall } from '../src/mcp/mcpRoutes';

// Late import after mocks are in place
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mcpRouter } = require('../src/mcp/mcpRoutes') as { mcpRouter: express.Router };

const app = express();
app.use(express.json());
app.use('/api/mcp', mcpRouter);

const VALID_TOKEN = 'test-secret-token';

beforeEach(() => {
  process.env['MCP_WRITE_TOKEN'] = VALID_TOKEN;
});

afterEach(() => {
  delete process.env['MCP_WRITE_TOKEN'];
});

// ===========================================================================
// isWriteToolCall — pure helper
// ===========================================================================

describe('isWriteToolCall', () => {
  it('returns the tool name for a write tool call', () => {
    const body = { method: 'tools/call', params: { name: 'create_evidence_from_url' } };
    expect(isWriteToolCall(body)).toBe('create_evidence_from_url');
  });

  it('returns tool name for all four write tools', () => {
    const writeTools = [
      'create_evidence_from_url',
      'start_forensic_scan',
      'create_thesis_draft',
      'add_thesis_version',
    ];
    for (const name of writeTools) {
      expect(isWriteToolCall({ method: 'tools/call', params: { name } })).toBe(name);
    }
  });

  it('returns null for a read tool call', () => {
    const body = { method: 'tools/call', params: { name: 'search_evidence' } };
    expect(isWriteToolCall(body)).toBeNull();
  });

  it('returns null for tools/list (not a call)', () => {
    const body = { method: 'tools/list', params: {} };
    expect(isWriteToolCall(body)).toBeNull();
  });

  it('returns null for non-object body', () => {
    expect(isWriteToolCall(null)).toBeNull();
    expect(isWriteToolCall('string')).toBeNull();
    expect(isWriteToolCall(42)).toBeNull();
  });

  it('returns null when params.name is missing', () => {
    expect(isWriteToolCall({ method: 'tools/call', params: {} })).toBeNull();
  });

  it('returns null when params is not an object', () => {
    expect(isWriteToolCall({ method: 'tools/call', params: null })).toBeNull();
  });
});

// ===========================================================================
// POST /api/mcp — auth guard integration
// ===========================================================================

describe('POST /api/mcp — write tool auth', () => {
  const writeCallBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'create_evidence_from_url', arguments: { url: 'https://example.com' } },
  };

  const readCallBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'search_evidence', arguments: { query: 'test' } },
  };

  it('returns 401 for write tool call with no Authorization header', async () => {
    const res = await request(app).post('/api/mcp').send(writeCallBody);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 for write tool call with wrong token', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Authorization', 'Bearer wrong-token')
      .send(writeCallBody);
    expect(res.status).toBe(401);
  });

  it('passes through write tool call with correct bearer token', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(writeCallBody);
    // Transport mock returns nothing — just confirm we did NOT get 401
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('passes through read tool call with no Authorization header', async () => {
    const res = await request(app).post('/api/mcp').send(readCallBody);
    expect(res.status).not.toBe(401);
  });

  it('passes through tools/list with no Authorization header', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).not.toBe(401);
  });

  it('returns 401 message that explains how to configure the token', async () => {
    const res = await request(app).post('/api/mcp').send(writeCallBody);
    expect(res.body.message).toContain('MCP_WRITE_TOKEN');
  });

  it('returns 500 when MCP_WRITE_TOKEN env var is not set', async () => {
    delete process.env['MCP_WRITE_TOKEN'];
    const res = await request(app).post('/api/mcp').send(writeCallBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('MCP_WRITE_TOKEN');
  });
});

// ===========================================================================
// GET /api/mcp — health check
// ===========================================================================

describe('GET /api/mcp', () => {
  it('lists read and write tools separately', async () => {
    const res = await request(app).get('/api/mcp');
    expect(res.status).toBe(200);
    expect(res.body.readTools).toContain('search_evidence');
    expect(res.body.writeTools).toContain('create_evidence_from_url');
  });

  it('documents that write tools require auth', async () => {
    const res = await request(app).get('/api/mcp');
    expect(res.body.auth).toContain('MCP_WRITE_TOKEN');
  });
});
