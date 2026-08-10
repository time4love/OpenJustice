import { Router, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcpServer';
import { prisma } from '../lib/prisma';
import { hashToken } from '../lib/tokenHash';
import { researcherContext } from '../context/researcherContext';

const router = Router();

// ---------------------------------------------------------------------------
// Write tool names — any tools/call for one of these requires a valid per-user
// bearer token (looked up in the Researcher table).
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
  'generate_foia_request',
]);

// ---------------------------------------------------------------------------
// resolveResearcher
//
// Hashes the incoming bearer token, looks it up in the Researcher table, and
// checks that the account is approved.
//
// Returns { researcherId } on success, or sends a 401/403 and returns null.
// ---------------------------------------------------------------------------

async function resolveResearcher(req: Request, res: Response): Promise<{ researcherId: string } | null> {
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Write tools require Authorization: Bearer <your-mcp-token>. Generate one via POST /api/auth/mcp-token.',
    });
    return null;
  }

  let tokenHash: string;
  try {
    tokenHash = hashToken(token);
  } catch {
    res.status(500).json({ error: 'Server misconfiguration: TOKEN_HMAC_SECRET is not set' });
    return null;
  }

  const researcher = await prisma.researcher.findFirst({ where: { mcpTokenHash: tokenHash } });

  if (!researcher) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid MCP token. Generate a new one via POST /api/auth/mcp-token.',
    });
    return null;
  }

  if (!researcher.approved) {
    res.status(403).json({
      error: 'Forbidden',
      message: `Account '${researcher.handle}' is not yet approved. Contact an admin.`,
    });
    return null;
  }

  return { researcherId: researcher.id };
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

  let researcherId: string | undefined;
  if (writeTool !== null) {
    const resolved = await resolveResearcher(req, res);
    if (resolved === null) return; // response already sent
    researcherId = resolved.researcherId;
  }

  const handleRequest = async () => {
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
  };

  // Run write tool requests inside researcherContext so handlers can stamp createdById.
  if (researcherId !== undefined) {
    await researcherContext.run({ researcherId }, handleRequest);
  } else {
    await handleRequest();
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
    writeTools: ['create_evidence_from_url', 'create_evidence_from_text', 'start_forensic_scan', 'create_thesis_draft', 'add_thesis_version', 'run_ai_analysis', 'create_research_session', 'add_session_note', 'close_research_session', 'enrich_evidence_with_history', 'promote_evidence', 'generate_foia_request'],
    auth: 'Write tools require Authorization: Bearer <per-user-mcp-token>. Generate via POST /api/auth/mcp-token.',
  });
});

export { router as mcpRouter };
