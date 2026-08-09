import { Router, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcpServer';

const router = Router();

// ---------------------------------------------------------------------------
// Write tool names — any tools/call for one of these requires a valid bearer token.
// Read tools (search_evidence, get_forensic_timeline, etc.) are unauthenticated.
// ---------------------------------------------------------------------------

const WRITE_TOOLS = new Set([
  'create_evidence_from_url',
  'create_evidence_from_text',
  'start_forensic_scan',
  'create_thesis_draft',
  'add_thesis_version',
  'run_ai_analysis',
  'create_research_session',
  'add_session_note',
  'close_research_session',
  'enrich_evidence_with_history',
  'promote_evidence',
]);

// ---------------------------------------------------------------------------
// requireWriteAuth
//
// Called before handing off to the MCP transport when the request targets a
// write tool. Returns true if the request is allowed to proceed, false if a
// 401 has already been sent.
//
// Token source: MCP_WRITE_TOKEN env var (set in .env).
// Client sends: Authorization: Bearer <token>
// ---------------------------------------------------------------------------

function requireWriteAuth(req: Request, res: Response): boolean {
  const configuredToken = process.env['MCP_WRITE_TOKEN'];
  if (!configuredToken) {
    // Server misconfiguration — fail closed
    res.status(500).json({ error: 'MCP write tools are not configured (MCP_WRITE_TOKEN missing)' });
    return false;
  }

  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (token !== configuredToken) {
    res.status(401).json({
      error: 'Unauthorized',
      message:
        'Write tools require a valid bearer token. ' +
        'Set Authorization: Bearer <MCP_WRITE_TOKEN> in your MCP client config.',
    });
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// isWriteToolCall
//
// Inspects the raw JSON-RPC body to determine whether this request is a
// tools/call targeting one of the write tools. Returns the tool name if so,
// null otherwise.
// ---------------------------------------------------------------------------

export function isWriteToolCall(body: unknown): string | null {
  if (
    body !== null &&
    typeof body === 'object' &&
    (body as Record<string, unknown>)['method'] === 'tools/call'
  ) {
    const params = (body as Record<string, unknown>)['params'];
    if (params !== null && typeof params === 'object') {
      const name = (params as Record<string, unknown>)['name'];
      if (typeof name === 'string' && WRITE_TOOLS.has(name)) {
        return name;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/mcp
//
// Stateless StreamableHTTP transport — each request gets a fresh McpServer
// and transport instance. The server is closed after the response finishes.
//
// Read tools: no auth required.
// Write tools: require Authorization: Bearer <MCP_WRITE_TOKEN>
//
// Claude Desktop config (~/Library/Application Support/Claude/claude_desktop_config.json):
//   {
//     "mcpServers": {
//       "glass-fortress": {
//         "url": "http://localhost:3001/api/mcp",
//         "headers": { "Authorization": "Bearer <MCP_WRITE_TOKEN>" }
//       }
//     }
//   }
// ---------------------------------------------------------------------------

router.post('/', async (req: Request, res: Response) => {
  const writeTool = isWriteToolCall(req.body);
  if (writeTool !== null && !requireWriteAuth(req, res)) {
    return;
  }

  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no session tracking
  });

  res.on('finish', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[MCP] Request handling error:', err instanceof Error ? err.message : err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP request failed' });
    }
  }
});

// ---------------------------------------------------------------------------
// GET /api/mcp — health check so Claude Desktop can verify the endpoint
// ---------------------------------------------------------------------------

router.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Glass Fortress MCP',
    version: '1.0.0',
    transport: 'streamable-http',
    readTools: ['search_evidence', 'get_forensic_timeline', 'get_figure_dossier', 'get_thesis_context', 'get_research_agenda', 'get_session_summary'],
    writeTools: ['create_evidence_from_url', 'create_evidence_from_text', 'start_forensic_scan', 'create_thesis_draft', 'add_thesis_version', 'run_ai_analysis', 'create_research_session', 'add_session_note', 'close_research_session'],
    auth: 'Write tools require Authorization: Bearer <MCP_WRITE_TOKEN>',
  });
});

export { router as mcpRouter };
