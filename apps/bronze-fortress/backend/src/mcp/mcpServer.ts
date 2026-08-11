import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { queryPatternSchema, queryPatternHandler } from './tools/queryPattern';
import { getKeyFigureProfileSchema, getKeyFigureProfileHandler } from './tools/getKeyFigureProfile';
import { listAllegationsSchema, listAllegationsHandler } from './tools/listAllegations';
import { buildPatternThesisSchema, buildPatternThesisHandler } from './tools/buildPatternThesis';
import { listActiveFiguresSchema, listActiveFiguresHandler } from './tools/listActiveFigures';
import { listCourtsSchema, listCourtsHandler } from './tools/listCourts';
import { listFiguresPendingReviewSchema, listFiguresPendingReviewHandler } from './tools/listFiguresPendingReview';
import { registerAllegationSchema, registerAllegationHandler } from './tools/registerAllegation';
import { proposeKeyFigureSchema, proposeKeyFigureHandler } from './tools/proposeKeyFigure';
import { activateFigureSchema, activateFigureHandler } from './tools/activateFigure';
import { registerOnChainSchema, registerOnChainHandler } from './tools/registerOnChain';
import { suggestAllegationsSchema, suggestAllegationsHandler } from './tools/suggestAllegations';
import { nominateAndCommitSchema, nominateAndCommitHandler } from './tools/nominateAndCommit';

// ---------------------------------------------------------------------------
// Factory — creates a fresh McpServer per request.
// StreamableHTTPServerTransport (stateless mode) requires a new McpServer
// instance per request — tool handlers use their own singletons so this is cheap.
// ---------------------------------------------------------------------------

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'Bronze Fortress MCP',
    version: '1.0.0',
  });

  // -------------------------------------------------------------------------
  // READ TOOLS — unauthenticated, aggregate data only, no family content
  // -------------------------------------------------------------------------

  server.tool(
    'query_pattern',
    'Query allegation counts for a key figure. Returns the number of independent cases ' +
      'that registered a specific procedural pattern. Optionally filter by pattern category. ' +
      'No case content or identifiers are exposed — counts only.',
    queryPatternSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await queryPatternHandler(input) }],
    }),
  );

  server.tool(
    'get_key_figure_profile',
    'Retrieve the full pattern profile for a key figure (judge, social worker, evaluator, guardian). ' +
      'Returns figure metadata, status, and aggregate pattern counts across all registered cases. ' +
      'This is the legal argument layer: independent, timestamped, convergent pattern descriptions.',
    getKeyFigureProfileSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await getKeyFigureProfileHandler(input) }],
    }),
  );

  server.tool(
    'list_allegations',
    'List individual allegation records for a key figure — allegation hash, pattern category, ' +
      'court, date range, and on-chain tx hash. caseId and all case content are excluded. ' +
      'Use this to verify on-chain registration status or build a pattern thesis timeline.',
    listAllegationsSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await listAllegationsHandler(input) }],
    }),
  );

  server.tool(
    'build_pattern_thesis',
    'Build a structured pattern thesis for an ACTIVE key figure. ' +
      'Aggregates all independently registered allegations into a legally-framed document: ' +
      'case counts per pattern, date ranges, court distribution, and on-chain proof hashes. ' +
      'Grouped by legal domain (A–G). No case content or identifiers are included.',
    buildPatternThesisSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await buildPatternThesisHandler(input) }],
    }),
  );

  server.tool(
    'list_active_figures',
    'List all key figures that have passed the nomination threshold and been activated by legal review. ' +
      'Returns name, type, court, and total distinct cases per figure. ' +
      'Optionally filter by figure type (JUDGE, SOCIAL_WORKER, EVALUATOR, etc.).',
    listActiveFiguresSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await listActiveFiguresHandler(input) }],
    }),
  );

  server.tool(
    'list_figures_pending_review',
    'List KeyFigures that were registered via case intake but have not yet been activated by legal review. ' +
      'Shows name, type, court, and the number of distinct cases that registered patterns for each figure. ' +
      'Sort order: highest case count first — prioritise high-count figures for review. ' +
      'Use activate_figure(keyFigureId) to approve a figure after confirming official capacity.',
    listFiguresPendingReviewSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await listFiguresPendingReviewHandler(input) }],
    }),
  );

  server.tool(
    'list_courts',
    'List all seeded Israeli family courts with their stable IDs. ' +
      'Use the returned "id" field as courtId in nominate_and_commit, suggest_allegations, and register_allegation. ' +
      'Optionally filter by district name (e.g. "ירושלים", "תל אביב").',
    listCourtsSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await listCourtsHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // WRITE TOOLS — require Authorization: Bearer <MCP_WRITE_TOKEN>
  // -------------------------------------------------------------------------

  server.tool(
    'register_allegation',
    'Register a cryptographic pattern allegation for a case. Idempotent — returns existing ' +
      'allegation if already registered for this case × figure × pattern × court combination. ' +
      'The allegation hash is stored and should be registered on-chain to establish timestamp independence.',
    registerAllegationSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await registerAllegationHandler(input) }],
    }),
  );

  server.tool(
    'propose_key_figure',
    'A case proposes a key figure (judge, social worker, evaluator, guardian) from their official ' +
      'case documents. Name must match exactly as it appears in the תסקיר, חוות דעת, or court ruling. ' +
      'Creates a PENDING KeyFigure on first proposal; subsequent proposals from other cases increment the nomination count. ' +
      'Legal reviewer activates via activate_figure — no count threshold required.',
    proposeKeyFigureSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await proposeKeyFigureHandler(input) }],
    }),
  );

  server.tool(
    'activate_figure',
    'Legal review gate — marks a KeyFigure as ACTIVE and assigns its stable anonymous public ID ' +
      '(e.g. SOCIAL_WORKER 1). The real name is never exposed publicly. ' +
      'Call after confirming the figure is named in official documents and the facts are accurate.',
    activateFigureSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await activateFigureHandler(input) }],
    }),
  );

  server.tool(
    'suggest_allegations',
    'Analyse a case\'s structured intake data (criminal complaints, nzakut orders) and return ' +
      'which PatternCategory values are evidenced. Covers domains A and B. ' +
      'Already-registered allegations for this case × figure × court are flagged so you can skip them. ' +
      'Call register_allegation for each suggestion where alreadyRegistered=false.',
    suggestAllegationsSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await suggestAllegationsHandler(input) }],
    }),
  );

  server.tool(
    'nominate_and_commit',
    'Primary researcher workflow tool. Given a case and a key figure from official documents, ' +
      'this tool: (1) finds or creates the KeyFigure record, ' +
      '(2) runs pattern detection on the case\'s structured intake (criminal complaints + nzakut orders), ' +
      '(3) registers Allegation records for all newly detected patterns. ' +
      'Idempotent — already-registered patterns are flagged and skipped. ' +
      'Call list_courts first to get a valid courtId. ' +
      'After this call, use register_on_chain to timestamp the new allegations on the blockchain.',
    nominateAndCommitSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await nominateAndCommitHandler(input) }],
    }),
  );

  server.tool(
    'register_on_chain',
    'Backfill on-chain registration for allegations that have not yet been registered. ' +
      'Finds all allegations with no onChainTxHash and submits each to EvidenceRegistry. ' +
      'Optionally filter by figureId to process one figure at a time. ' +
      'The on-chain timestamp establishes that each case recorded independently, ' +
      'before any inter-case connection existed — this is the legal proof of independence.',
    registerOnChainSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await registerOnChainHandler(input) }],
    }),
  );

  return server;
}
