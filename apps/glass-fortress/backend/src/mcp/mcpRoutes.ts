import { Router, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcpServer';
import { prisma } from '../lib/prisma';
import { hashToken } from '../lib/tokenHash';
import { researcherContext } from '../context/researcherContext';
import { extractBearerToken } from '../lib/bearerToken';
import { oidcProvider } from '../oauth/oidcProvider';
import { resourceMetadataUrl } from '../oauth/resourceMetadata';

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
  'recover_evidence_from_screenshot',
  'delete_evidence',
]);

// ---------------------------------------------------------------------------
// resolveResearcher (docs/gf-mcp-oauth-dev-plan.md, Phase 4)
//
// Two accepted credential shapes, tried in order:
//   1. An MCP OAuth access token (docs/gf-mcp-oauth-dev-plan.md Phases 1-3) —
//      resolved in-process via oidcProvider.AccessToken.find(), the same
//      lookup oidc-provider's own userinfo/introspection actions use
//      internally (validate_access_token.js) — never a network round trip,
//      since the resource server and authorization server are the same
//      process. Requires the mcp:write scope.
//   2. The legacy per-user static service token (§2.3's decision — kept for
//      non-interactive/scripted use, hashed lookup in Researcher.mcpTokenHash).
//
// Returns { researcherId } on success, or sends a 401/403 and returns null.
// ---------------------------------------------------------------------------

type OAuthResolution =
  | { kind: 'not_oauth' }
  | { kind: 'ok'; researcherId: string }
  | { kind: 'rejected'; status: number; error: string; message: string };

async function resolveViaOAuth(token: string): Promise<OAuthResolution> {
  const accessToken = await oidcProvider.AccessToken.find(token);
  if (!accessToken) return { kind: 'not_oauth' };

  if (!accessToken.scopes.has('mcp:write')) {
    return {
      kind: 'rejected',
      status: 403,
      error: 'Forbidden',
      message: 'This OAuth token was not granted the mcp:write scope.',
    };
  }

  if (!accessToken.accountId) {
    return {
      kind: 'rejected',
      status: 401,
      error: 'Unauthorized',
      message: 'OAuth token has no associated account.',
    };
  }

  // Re-checked here, not just at grant time — approval can be revoked after
  // an access token was already issued; every use must re-verify, matching
  // findAccount()'s own re-check (src/oauth/oidcProvider.ts).
  const researcher = await prisma.researcher.findUnique({ where: { id: accessToken.accountId } });
  if (!researcher?.approved) {
    return {
      kind: 'rejected',
      status: 403,
      error: 'Forbidden',
      message: 'The researcher account behind this OAuth grant is not approved (or no longer exists).',
    };
  }

  return { kind: 'ok', researcherId: researcher.id };
}

// RFC 9728 §5.1 — MCP servers MUST send this on every 401 so a client can
// find the authorization server without guessing. Missing this is what sent
// a real claude.ai connection attempt off guessing bare-root well-known
// paths that don't exist here (docs/gf-mcp-oauth-dev-plan.md §7.0c).
function sendUnauthorized(res: Response, message: string): void {
  res.set('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl()}"`);
  res.status(401).json({ error: 'Unauthorized', message });
}

async function resolveResearcher(req: Request, res: Response): Promise<{ researcherId: string } | null> {
  const token = extractBearerToken(req);

  if (!token) {
    sendUnauthorized(
      res,
      'Write tools require Authorization: Bearer <token> — an MCP OAuth access token ' +
        '(see GET /api/mcp for the authorization server) or a legacy service token (POST /api/auth/mcp-token).',
    );
    return null;
  }

  const oauth = await resolveViaOAuth(token);
  if (oauth.kind === 'ok') return { researcherId: oauth.researcherId };
  if (oauth.kind === 'rejected') {
    if (oauth.status === 401) {
      sendUnauthorized(res, oauth.message);
    } else {
      res.status(oauth.status).json({ error: oauth.error, message: oauth.message });
    }
    return null;
  }
  // oauth.kind === 'not_oauth' — not a token oidc-provider recognizes at all,
  // fall through and try it as a legacy static token instead.

  let tokenHash: string;
  try {
    tokenHash = hashToken(token);
  } catch {
    res.status(500).json({ error: 'Server misconfiguration: TOKEN_HMAC_SECRET is not set' });
    return null;
  }

  const researcher = await prisma.researcher.findFirst({ where: { mcpTokenHash: tokenHash } });

  if (!researcher) {
    sendUnauthorized(
      res,
      'Invalid MCP token. Generate a new one via POST /api/auth/mcp-token, or connect via OAuth (GET /api/mcp).',
    );
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
//
// Pointed at the staging deploy instead of localhost, also add
// "X-Staging-Token": "<STAGING_API_TOKEN>" — see requireStagingAccess.
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
    writeTools: ['create_evidence_from_url', 'create_evidence_from_text', 'start_forensic_scan', 'create_thesis_draft', 'add_thesis_version', 'run_ai_analysis', 'create_research_session', 'add_session_note', 'close_research_session', 'enrich_evidence_with_history', 'promote_evidence', 'generate_foia_request', 'recover_evidence_from_screenshot', 'delete_evidence'],
    auth:
      'Write tools accept either an MCP OAuth access token (see the "oauth" field below — this is what ' +
      'ChatGPT/Claude Desktop custom connectors should use) or a legacy per-user service token ' +
      '(Authorization: Bearer <token>, POST /api/auth/mcp-token — for non-interactive/scripted use).',
    oauth: {
      authorizationServer: oidcProvider.issuer,
      scopes: ['mcp:read', 'mcp:write'],
    },
  });
});

export { router as mcpRouter };
