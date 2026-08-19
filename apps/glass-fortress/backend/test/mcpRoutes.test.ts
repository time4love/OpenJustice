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

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    researcher: { findFirst: jest.fn(), findUnique: jest.fn() },
  },
}));

// oidc-provider is pure ESM — see test/oauthInteractionRoutes.test.ts for why
// this needs mocking under Jest's CJS test transform even though the real
// runtime (ts-node-dev / dist) loads it fine.
jest.mock('../src/oauth/oidcProvider', () => ({
  oidcProvider: {
    issuer: 'https://backend.test/oauth',
    AccessToken: { find: jest.fn() },
  },
  resolveOrigin: jest.fn().mockReturnValue('https://backend.test'),
}));

import request from 'supertest';
import express from 'express';
import { prisma } from '../src/lib/prisma';
import { hashToken } from '../src/lib/tokenHash';
import { oidcProvider } from '../src/oauth/oidcProvider';
import { isWriteToolCall } from '../src/mcp/mcpRoutes';

// Late import after mocks are in place
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mcpRouter } = require('../src/mcp/mcpRoutes') as { mcpRouter: express.Router };

const app = express();
app.use(express.json());
app.use('/api/mcp', mcpRouter);

const VALID_TOKEN = 'test-secret-token';
const MOCK_RESEARCHER = { id: 'r-1', handle: 'tester', role: 'RESEARCHER', approved: true };
const mockResearcherFindFirst = prisma.researcher.findFirst as jest.Mock;
const mockResearcherFindUnique = prisma.researcher.findUnique as jest.Mock;
const mockAccessTokenFind = oidcProvider.AccessToken.find as jest.Mock;

beforeEach(() => {
  process.env['TOKEN_HMAC_SECRET'] = 'jest-hmac-secret';
  // Return researcher only when the token hash matches VALID_TOKEN
  mockResearcherFindFirst.mockImplementation(
    async (args: { where: { mcpTokenHash: string } }) => {
      const validHash = hashToken(VALID_TOKEN);
      return args.where.mcpTokenHash === validHash ? MOCK_RESEARCHER : null;
    },
  );
  // No token is a recognized OAuth token unless a test says otherwise —
  // every legacy-token test below implicitly exercises the not_oauth
  // fall-through path this way.
  mockAccessTokenFind.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env['TOKEN_HMAC_SECRET'];
  jest.clearAllMocks();
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

  it('sets WWW-Authenticate pointing at the resource metadata on every 401 (RFC 9728 §5.1)', async () => {
    // The actual bug: without this header, a spec-compliant client (a real
    // claude.ai connector, observed live) has no authoritative way to find
    // the authorization server and falls back to guessing paths that don't
    // exist — docs/gf-mcp-oauth-dev-plan.md §7.0c.
    const res = await request(app).post('/api/mcp').send(writeCallBody);
    expect(res.headers['www-authenticate']).toBe(
      'Bearer resource_metadata="https://backend.test/.well-known/oauth-protected-resource"',
    );
  });

  it('returns 401 for write tool call with wrong token', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .set('Authorization', 'Bearer wrong-token')
      .send(writeCallBody);
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain('resource_metadata=');
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

  it('returns 401 message that explains how to get a token', async () => {
    const res = await request(app).post('/api/mcp').send(writeCallBody);
    expect(res.body.message).toContain('mcp-token');
  });

  it('returns 401 when token is not in the DB', async () => {
    mockResearcherFindFirst.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/mcp')
      .set('Authorization', 'Bearer unknown-token')
      .send(writeCallBody);
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// POST /api/mcp — OAuth access token path (docs/gf-mcp-oauth-dev-plan.md, Phase 4)
// ===========================================================================

describe('POST /api/mcp — OAuth access token auth', () => {
  const writeCallBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'create_evidence_from_url', arguments: { url: 'https://example.com' } },
  };

  it('accepts a valid OAuth token with mcp:write scope, never touching the legacy lookup', async () => {
    mockAccessTokenFind.mockResolvedValueOnce({
      accountId: 'r-oauth-1',
      scopes: new Set(['mcp:write', 'offline_access']),
    });
    mockResearcherFindUnique.mockResolvedValueOnce({ id: 'r-oauth-1', approved: true });

    const res = await request(app)
      .post('/api/mcp')
      .set('Authorization', 'Bearer oauth-token')
      .send(writeCallBody);

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(mockResearcherFindFirst).not.toHaveBeenCalled();
  });

  it('rejects an OAuth token missing the mcp:write scope with 403, not falling through to legacy', async () => {
    mockAccessTokenFind.mockResolvedValueOnce({
      accountId: 'r-oauth-1',
      scopes: new Set(['mcp:read']),
    });

    const res = await request(app)
      .post('/api/mcp')
      .set('Authorization', 'Bearer read-only-oauth-token')
      .send(writeCallBody);

    expect(res.status).toBe(403);
    expect(mockResearcherFindFirst).not.toHaveBeenCalled();
  });

  it('rejects an OAuth token for a researcher who is no longer approved', async () => {
    mockAccessTokenFind.mockResolvedValueOnce({
      accountId: 'r-oauth-1',
      scopes: new Set(['mcp:write']),
    });
    mockResearcherFindUnique.mockResolvedValueOnce({ id: 'r-oauth-1', approved: false });

    const res = await request(app)
      .post('/api/mcp')
      .set('Authorization', 'Bearer revoked-approval-token')
      .send(writeCallBody);

    expect(res.status).toBe(403);
  });

  it('falls through to the legacy static-token path when the token is not a recognized OAuth token', async () => {
    mockAccessTokenFind.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/api/mcp')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send(writeCallBody);

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(mockResearcherFindFirst).toHaveBeenCalled();
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
    expect(res.body.auth).toContain('mcp-token');
  });

  it('advertises the OAuth authorization server and scopes', async () => {
    const res = await request(app).get('/api/mcp');
    expect(res.body.oauth).toEqual({
      authorizationServer: 'https://backend.test/oauth',
      scopes: ['mcp:read', 'mcp:write'],
    });
  });
});
