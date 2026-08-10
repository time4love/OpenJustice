import { Router, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcpServer';

const router = Router();

// ---------------------------------------------------------------------------
// Write tool names — any tools/call for one of these requires a valid bearer token.
// Read tools (query_pattern, get_key_figure_profile, list_commitments) are unauthenticated.
// ---------------------------------------------------------------------------

const WRITE_TOOLS = new Set([
  'register_commitment',
  'propose_key_figure',
  'activate_figure',
  'register_on_chain',
  'suggest_commitments',
]);

function isWriteToolCall(body: unknown): boolean {
  if (body !== null && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (b['method'] === 'tools/call') {
      const params = b['params'];
      if (params !== null && typeof params === 'object') {
        const name = (params as Record<string, unknown>)['name'];
        return typeof name === 'string' && WRITE_TOOLS.has(name);
      }
    }
  }
  return false;
}

function requireWriteAuth(req: Request, res: Response): boolean {
  const secret = process.env['MCP_WRITE_TOKEN'];
  if (!secret) {
    res.status(500).json({ error: 'Server misconfiguration: MCP_WRITE_TOKEN is not set' });
    return false;
  }
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== secret) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Write tools require Authorization: Bearer <MCP_WRITE_TOKEN>',
    });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/mcp
// ---------------------------------------------------------------------------

router.post('/', async (req: Request, res: Response) => {
  if (isWriteToolCall(req.body) && !requireWriteAuth(req, res)) return;

  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  res.on('finish', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[MCP] Request error:', err instanceof Error ? err.message : err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP request failed' });
    }
  }
});

// ---------------------------------------------------------------------------
// GET /api/mcp — health / discovery
// ---------------------------------------------------------------------------

router.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Bronze Fortress MCP',
    version: '1.0.0',
    transport: 'streamable-http',
    readTools: ['query_pattern', 'get_key_figure_profile', 'list_commitments', 'list_pending_figures', 'build_pattern_thesis', 'list_active_figures'],
    writeTools: ['register_commitment', 'propose_key_figure', 'activate_figure', 'register_on_chain', 'suggest_commitments'],
    auth: 'Write tools require Authorization: Bearer <MCP_WRITE_TOKEN>',
    privacy: 'All read tools return aggregate data only. No family content or identifiers are exposed.',
  });
});

export { router as mcpRouter };
