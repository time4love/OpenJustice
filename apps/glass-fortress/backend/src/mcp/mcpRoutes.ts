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
// Gated tool names — any tools/call for one of these requires a valid per-user
// bearer token (looked up in the Researcher table).
// Read tools (the corpus reads: list_findings, get_diff_input, resolve_record,
// check_on_chain_status) are unauthenticated — and gate their own ACCESS by
// PUBLIC_PAGE, which is a question about the page and never about the caller.
//
// "Write" is the common case but not the criterion. What is actually gated is
// anything that COSTS: a tool that spends money or does unbounded work belongs
// here whether or not it persists a row. Two tools were mis-classified on that
// basis and are listed separately below — the audit in
// docs/gf-cost-exposure-dev-plan.md missed them because it enumerated REST
// routes, and /api/mcp is mounted above the rate limiter where it was not
// looking. Before adding a tool here, ask what it spends, not what it writes.
// ---------------------------------------------------------------------------

export const READ_TOOLS = new Set([
  // Reads stored trajectories and resolves them; writes nothing, invokes no
  // model. Unlike get_claim_trajectories, it can never trigger a detection pass.
  'get_thesis_trajectory_citations',
  // Open on purpose, and the one tool where gating would be self-defeating:
  // "which environment am I talking to?" must be answerable BEFORE authenticating
  // into it. A caller who has to obtain a credential first has already had to
  // guess the answer in order to pick which credential to present.
  //
  // Cheap by construction: eleven counts, one eth_chainId and one eth_getCode.
  // No LLM, no archive fetch, no log scan, no write. Behind the staging access
  // gate on staging regardless, and under the rate limiter on both.
  'get_environment',
  // THE CORPUS READS — evidence step 12, docs/gf-evidence-flows.md A4 and §5.
  //
  // OPEN BECAUSE THE PUBLIC SURFACE IS THE CORPUS. "An outsider verifies a
  // thesis against the corpus … Public reads are corpus reads: a page's
  // timeline, search by text over the corpus, and a diff's input." Gating them
  // would leave a published thesis citing records nobody outside could check,
  // which is the counterweight §1 rests the whole selection argument on.
  //
  // ACCESS IS GATED INSIDE THE HANDLER, BY PUBLIC_PAGE, NOT HERE — and the
  // distinction is the design's: "that is access, not a second behaviour: the
  // output never depends on who asks". A page no published thesis cites refuses
  // NOT_PUBLIC to an anonymous caller; a researcher's bearer token, when one is
  // present, is resolved by identifyViewer and opens every page. Nothing below
  // this line returns different CONTENT to the two.
  //
  // AND THE COST WAS THE DECIDING QUESTION, as this file's header says: ask what
  // a tool SPENDS. None of the four invokes a model or fetches the archive.
  // `list_findings` reads the STORED anchor verdict per capture — one query for
  // the page, no chain call — precisely so a timeline stays bounded; the two
  // that do read the chain are bounded by ONE RECORD (two hashes at most, two
  // calls each). A timeline that asked the chain per capture would be the
  // unbounded anonymous path this set exists to keep out, and that is why the
  // attribution is stored at anchor time instead.
  'list_findings',
  'get_diff_input',
  'resolve_record',
  'check_on_chain_status',
]);

export const WRITE_TOOLS = new Set([
  // Rewrites the prose on an evidence record and its source diff.
  // Gated despite the name. It was in READ_TOOLS while detection recomputed on
  // every call: no LLM, no RPC, and its whole value is that anyone can re-run
  // the check themselves. Detection is now stored state, so a cache MISS
  // inserts rows — an anonymous caller could write to the database.
  //
  // mcpToolClassification.test.ts could not catch this. It asserts every tool is
  // classified exactly once, never that a classification still describes what
  // the tool does. "Does this tool's classification still match its behaviour?"
  // is a review question the guard cannot answer, and behaviour changed under a
  // classification that did not.
  //
  // The public read-only path is getStoredClaimTrajectories, served by
  // GET /api/forensics/tracked/:id/trajectories, which never computes.
  'get_claim_trajectories',
  // The walk's two READS, gated by the standing precedent: a researcher's
  // working state — which pages are being marked, where the rules failed, what
  // is held at a stop — is not published evidence (flows A5).
  'get_article_rules',
  'list_captures',
  // The third read, added 2026-09-07 with judgement in the chat: one rule's
  // history, including what it removed from each capture it matched. Gated for
  // the same reason as the other two — and this one re-derives held bytes.
  'get_rule_history',
  // One RESET decision; every rule created before it loses authority. Gated for
  // the obvious reason, and named rather than omitted.
  'reset_article_calibration',
  // The walk's entry to the corpus (refactor step 2). Creates a TrackedUrl
  // attributed to the researcher and writes work-list rows — a write on its
  // face, and one CDX query per fifty captures besides.
  'survey_wayback_captures',
  // MARKING's one command and Flow 2's one non-draft answer (refactor step 3).
  // Both write the page's decision log, attributed; both refuse without a
  // researcher — the gate supplies the identity the handler refuses without.
  'approve_article_rules',
  'resolve_scan_stop',
  // The walk (refactor step 4, reporting only until step 5). Gated because it
  // SPENDS: one classifier call per novel capture that reaches Gate 5 — and
  // from step 5 it stores, anchors and writes rows besides.
  'scan_captures',






  // The verification tools (docs/gf-verification-tools-dev-plan.md). All three
  // write nothing — and all three are gated anyway, because "write" is not the
  // criterion here: each issues one or more requests to the Internet Archive,
  // which is unbounded per-call work against a free third-party service. An
  // anonymous caller could walk a decade of captures through them, which is the
  // same exposure that gated get_research_agenda and check_on_chain_status.
  'verify_claim_text',
  'audit_thesis_claims',
  // THE DEBATE — evidence step 13, docs/gf-evidence-flows.md §4 and A4.
  //
  // Three of the four WRITE: a session, its events, and on promotion the
  // evidence row, the debate's close and the head mention's argument. Two of
  // them also SPEND — one assessor call per round, which is the only paid point
  // in the evidence layer and the reason a debate cannot be opened anonymously.
  //
  // `get_debate` writes nothing and calls no model, and is gated all the same:
  // it is a researcher's working state and it carries a model's OPINIONS — the
  // assessment, the objection, the verdict — which thesis T5 lists among the
  // things a published page never shows. The standing precedent is the walk's
  // three reads, gated on the same ground.
  'open_debate',
  'respond_in_debate',
  'promote_from_debate',
  'get_debate',
  // THE REVIEW — evidence step 14, docs/gf-evidence-flows.md §6.
  //
  // `review_evidence` writes: a decision on the record's append-only log and the
  // row's own standing. `list_evidence_reviews` writes nothing and calls no
  // model, and is gated all the same — A4 calls it a GATED read, and it names
  // DRAFT citations of unpublished theses, which is exactly the working state a
  // corpus read may never reveal (§5) and exactly the citation a REAFFIRM
  // protects. The standing precedent is `get_debate` and the walk's three reads.
  'list_evidence_reviews',
  'review_evidence',
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

async function resolveViaOAuth(token: string, requiredScope: 'mcp:read' | 'mcp:write'): Promise<OAuthResolution> {
  const accessToken = await oidcProvider.AccessToken.find(token);
  if (!accessToken) return { kind: 'not_oauth' };

  // mcp:write implies mcp:read — a token that may write may certainly view.
  const hasScope = accessToken.scopes.has('mcp:write') || (requiredScope === 'mcp:read' && accessToken.scopes.has('mcp:read'));
  if (!hasScope) {
    return {
      kind: 'rejected',
      status: 403,
      error: 'Forbidden',
      message: `This OAuth token was not granted the ${requiredScope} scope.`,
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

type Identification =
  | { kind: 'ok'; researcherId: string }
  | { kind: 'rejected'; status: number; error: string; message: string };

/**
 * Who presented this token — an approved researcher, or a reason they are not.
 * Sends nothing: the caller decides whether a rejection is fatal (a write) or
 * merely means "anonymous" (a viewer-dependent read).
 */
async function identifyResearcher(token: string, requiredScope: 'mcp:read' | 'mcp:write'): Promise<Identification> {
  const oauth = await resolveViaOAuth(token, requiredScope);
  if (oauth.kind !== 'not_oauth') return oauth;
  // Not a token oidc-provider recognizes at all — try it as a legacy static token instead.

  let tokenHash: string;
  try {
    tokenHash = hashToken(token);
  } catch {
    return { kind: 'rejected', status: 500, error: 'Server misconfiguration', message: 'TOKEN_HMAC_SECRET is not set' };
  }

  const researcher = await prisma.researcher.findFirst({ where: { mcpTokenHash: tokenHash } });

  if (!researcher) {
    return {
      kind: 'rejected',
      status: 401,
      error: 'Unauthorized',
      message: 'Invalid MCP token. Generate a new one via POST /api/auth/mcp-token, or connect via OAuth (GET /api/mcp).',
    };
  }

  if (!researcher.approved) {
    return {
      kind: 'rejected',
      status: 403,
      error: 'Forbidden',
      message: `Account '${researcher.handle}' is not yet approved. Contact an admin.`,
    };
  }

  return { kind: 'ok', researcherId: researcher.id };
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

  const identity = await identifyResearcher(token, 'mcp:write');
  if (identity.kind === 'ok') return { researcherId: identity.researcherId };

  if (identity.status === 401) {
    sendUnauthorized(res, identity.message);
  } else {
    res.status(identity.status).json({ error: identity.error, message: identity.message });
  }
  return null;
}

// ---------------------------------------------------------------------------
// identifyViewer
//
// Read tools stay open, but some are VIEWER-DEPENDENT: get_thesis_context and
// get_whistleblower_call show an anonymous caller the published version and an
// approved researcher the head. So a read call that carries a bearer token is
// identified if it can be, and treated as anonymous if it cannot — never
// refused. The tool output names the viewer it answered for, so a researcher
// whose token has lapsed sees `viewer: PUBLIC` rather than mistaking the
// public view for the head.
// ---------------------------------------------------------------------------

async function identifyViewer(req: Request): Promise<string | undefined> {
  const token = extractBearerToken(req);
  if (!token) return undefined;
  const identity = await identifyResearcher(token, 'mcp:read');
  return identity.kind === 'ok' ? identity.researcherId : undefined;
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
// Read tools: no auth required; a valid token, if present, identifies the viewer.
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
  } else {
    researcherId = await identifyViewer(req);
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

  // Run identified requests inside researcherContext so handlers can stamp
  // createdById and answer viewer-dependent reads for the right viewer.
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
    // Derived from the sets the gate itself reads, never re-typed. These were
    // previously two hardcoded literals maintained by hand, and they had
    // already drifted: a tool once appeared in NEITHER, so the endpoint
    // advertised 20 of its 21 tools and silently omitted the most expensive
    // anonymous one. mcpToolClassification.test.ts now asserts the two sets are
    // exhaustive and disjoint against the server's real registry, so a new tool
    // cannot be added without being classified.
    readTools: [...READ_TOOLS],
    writeTools: [...WRITE_TOOLS],
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
