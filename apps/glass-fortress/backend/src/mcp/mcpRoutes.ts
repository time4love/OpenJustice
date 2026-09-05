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
// Read tools (search_evidence, get_forensic_timeline, etc.) are unauthenticated.
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
  'search_evidence',
  'get_forensic_timeline',
  // Derived entirely from data GET /api/thesis/:id already serves anonymously,
  // with no LLM call and no RPC call. Gating it would hide a page that is
  // deliberately public from the tool that describes it.
  'get_whistleblower_call',
  // Reads recorded scan output — no LLM, no RPC. The scan that produced it was
  // already gated; listing what it found for review is not the expensive part.
  'get_scan_findings',
  'get_thesis_framing',
  'get_diff_debate',
  'get_figure_dossier',
  'get_thesis_context',
  // Reads stored trajectories and resolves them; writes nothing, invokes no
  // model. Unlike get_claim_trajectories, it can never trigger a detection pass.
  'get_thesis_trajectory_citations',
  'get_session_summary',
  // Serves a static curriculum string: no model, no RPC, no database, no
  // network — the cheapest tool here by construction. Open on purpose as well as
  // by cost: its audience is an account that has signed up and is awaiting
  // approval, which under requireResearcher can do nothing at all.
  'start_tutorial',
  // Two stored columns and a count. No model, no archive fetch, no write — the
  // cheapest possible read, and the one that makes the layer beneath the
  // classifier visible at all. Gating it would put the raw record further out of
  // reach than the REST route that already serves it anonymously.
  'get_diff_input',
  // Open on purpose, and the one tool where gating would be self-defeating:
  // "which environment am I talking to?" must be answerable BEFORE authenticating
  // into it. A caller who has to obtain a credential first has already had to
  // guess the answer in order to pick which credential to present.
  //
  // Cheap by construction: eleven counts, one eth_chainId and one eth_getCode.
  // No LLM, no archive fetch, no log scan, no write. Behind the staging access
  // gate on staging regardless, and under the rate limiter on both.
  'get_environment',
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
  'create_evidence_from_url',
  'create_evidence_from_text',
  'start_forensic_scan',
  // Level 4's marking tools, ALL THREE GATED — including the one whose name
  // reads like a read.
  //
  // The two start tools write a CalibrationRun, and calibrate_article_rules can
  // admit a URL into the corpus. get_article_rules writes nothing, and is gated
  // anyway: it returns a researcher's in-progress working state — which URLs are
  // being marked and how often their rules needed fixing — which is not
  // published evidence. "An anonymous caller would have to guess a cuid" is
  // obscurity, not a gate, and `get_claim_trajectories` above is the standing
  // precedent for gating a read-named tool with the reason written down.
  'calibrate_article_rules',
  'correct_article_rules',
  'get_article_rules',
  // The RESEARCH ACT of this flow and its refusal. `commit_article_rules` saves a
  // versioned ruleset and sets it active for the URL; the other
  // closes the run. Both are obviously gated — they are here so the set names
  // them explicitly rather than by omission, which is how a tool ends up
  // unclassified.
  'commit_article_rules',
  'abandon_article_rules',
  // Writes nothing, and gated for the same reason `get_article_rules` is: it
  // returns a researcher's in-progress working state — which captures of which
  // page are being marked, and where the rules are failing.
  'next_article_capture',
  // Writes a decision and an observation. The verdict of the calibration flow.
  'judge_article_capture',
  // Reads only, gated like the rest: it exposes a researcher's working state.
  'open_article_capture',
  // Reads only, and gated for the same reason: it reports which captures of which
  // page were accepted and where a later rule has since changed their text.
  'check_ruleset_survival',
  // Writes a decision, and the ONLY one that can open an era. Obviously gated; it
  // is named here rather than by omission, which is how a tool ends up
  // unclassified.
  'resolve_era_boundary',
  // Ends the authority of every calibration decision on a URL. Gated for the
  // obvious reason, and named rather than omitted.
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
  'create_thesis_draft',
  'add_thesis_version',
  // Writes a new ThesisVersion. Cheaper and narrower than add_thesis_version —
  // it cannot change the prose — but it is still a write on the one artifact
  // that names living officials.
  'cite_trajectories',
  'run_ai_analysis',
  'create_research_session',
  'add_session_note',
  'close_research_session',
  'enrich_evidence_with_history',
  'promote_evidence',
  'generate_foia_request',
  'recover_evidence_from_screenshot',
  'delete_evidence',

  // Writes nothing at all — no diff update, no finding, no evidence row — and is
  // still here, because the rule at the top of this file is what it SPENDS.
  // Every `runs` is a full LLM call, and `runs` is caller-controlled, so a single
  // anonymous request could bill MAX_PREVIEW_RUNS classifications of the largest
  // diff in the corpus. Same reason get_research_agenda sits below.
  'preview_diff_classification',

  // Persists nothing, and was therefore unauthenticated until 2026-08-21 — but
  // spends real money on every call, with no account and (until the limiter
  // below) no cap:
  //
  //   get_research_agenda — embeds each gap, and with includeSuggestions:true
  //                         runs GapRevisionAgent once PER OPEN GAP, so the
  //                         cost of a single call scales with thesis state
  //                         rather than being fixed.
  //
  // suggest_thesis sat here too until it was retired — see
  // docs/gf-prosecutor-dev-plan.md §11.1.
  //
  // search_evidence stays open deliberately: it embeds a query and nothing
  // more (cents), it is the core public read, and it is what the anonymous
  // ChatGPT integration depends on. Gating it would break a working consumer
  // to solve a problem it is not causing.
  'get_research_agenda',

  // Persists nothing either, and is semantically a read — but every call hits
  // the chain RPC, and recoverTxHash:true issues a bounded eth_getLogs scan.
  // An anonymous caller could drain the project's RPC quota through it, which
  // is the same exposure that gated the two tools above.
  'check_on_chain_status',

  // Registers every pending finding for a page on-chain. Irreversible, spends
  // gas, and asserts CONFIRMED — the most consequential write in the toolset.
  'promote_scan_findings',

  // The diff debate. open/respond each run an LLM assessment; promote registers
  // on-chain. All gated — get_diff_debate is a plain read and sits above.
  // Embeds the question and runs a long-context assessment — real money per call.
  'open_thesis_framing',
  'assess_thesis_framing',
  'open_diff_debate',
  'respond_in_diff_debate',
  'promote_from_diff_debate',

  // The verification tools (docs/gf-verification-tools-dev-plan.md). All three
  // write nothing — and all three are gated anyway, because "write" is not the
  // criterion here: each issues one or more requests to the Internet Archive,
  // which is unbounded per-call work against a free third-party service. An
  // anonymous caller could walk a decade of captures through them, which is the
  // same exposure that gated get_research_agenda and check_on_chain_status.
  'list_captures',
  'verify_claim_text',
  'audit_thesis_claims',

  // The publication gate. publish/unpublish move what the public sees and
  // write to the session log; check_publication_readiness writes nothing but
  // runs the assessor, which is an LLM call. All three gated — the thesis is the
  // one artifact that assembles a narrative naming living officials.
  'check_publication_readiness',
  'publish_thesis',
  'unpublish_thesis',
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
