import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { queryPatternSchema, queryPatternHandler } from './tools/queryPattern';
import { getKeyFigureProfileSchema, getKeyFigureProfileHandler } from './tools/getKeyFigureProfile';
import { listCommitmentsSchema, listCommitmentsHandler } from './tools/listCommitments';
import { buildPatternThesisSchema, buildPatternThesisHandler } from './tools/buildPatternThesis';
import { listActiveFiguresSchema, listActiveFiguresHandler } from './tools/listActiveFigures';
import { registerCommitmentSchema, registerCommitmentHandler } from './tools/registerCommitment';
import { proposeKeyFigureSchema, proposeKeyFigureHandler } from './tools/proposeKeyFigure';
import { listPendingFiguresSchema, listPendingFiguresHandler } from './tools/listPendingFigures';
import { activateFigureSchema, activateFigureHandler } from './tools/activateFigure';
import { registerOnChainSchema, registerOnChainHandler } from './tools/registerOnChain';
import { suggestCommitmentsSchema, suggestCommitmentsHandler } from './tools/suggestCommitments';

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
    'Query pattern commitment counts for a key figure. Returns the number of independent families ' +
      'who registered a specific procedural pattern. Optionally filter by pattern category. ' +
      'No family content or identifiers are exposed — counts only.',
    queryPatternSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await queryPatternHandler(input) }],
    }),
  );

  server.tool(
    'get_key_figure_profile',
    'Retrieve the full pattern profile for a key figure (judge, social worker, evaluator, guardian). ' +
      'Returns figure metadata, status, and aggregate pattern counts across all registered families. ' +
      'This is the legal argument layer: independent, timestamped, convergent pattern descriptions.',
    getKeyFigureProfileSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await getKeyFigureProfileHandler(input) }],
    }),
  );

  server.tool(
    'list_commitments',
    'List individual commitment records for a key figure — commitment hash, pattern category, ' +
      'court, date range, and on-chain tx hash. caseId and all case content are excluded. ' +
      'Use this to verify on-chain registration status or build a pattern thesis timeline.',
    listCommitmentsSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await listCommitmentsHandler(input) }],
    }),
  );

  server.tool(
    'build_pattern_thesis',
    'Build a structured pattern thesis for an ACTIVE key figure. ' +
      'Aggregates all independently registered commitments into a legally-framed document: ' +
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

  // -------------------------------------------------------------------------
  // WRITE TOOLS — require Authorization: Bearer <MCP_WRITE_TOKEN>
  // -------------------------------------------------------------------------

  server.tool(
    'register_commitment',
    'Register a cryptographic pattern commitment for a family. Idempotent — returns existing ' +
      'commitment if already registered for this family × figure × pattern × court combination. ' +
      'The commitment hash is stored and should be registered on-chain to establish timestamp independence.',
    registerCommitmentSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await registerCommitmentHandler(input) }],
    }),
  );

  server.tool(
    'propose_key_figure',
    'A family proposes a key figure (judge, social worker, evaluator, guardian) from their official ' +
      'case documents. Name must match exactly as it appears in the תסקיר, חוות דעת, or court ruling. ' +
      'When 3 independent families name the same figure, they are promoted for legal review.',
    proposeKeyFigureSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await proposeKeyFigureHandler(input) }],
    }),
  );

  server.tool(
    'list_pending_figures',
    'List figures that have been proposed but not yet activated. Shows nomination counts vs threshold. ' +
      'Optionally includes figures that reached threshold and are awaiting legal review (use these to decide who to activate).',
    listPendingFiguresSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await listPendingFiguresHandler(input) }],
    }),
  );

  server.tool(
    'activate_figure',
    'Legal review gate — marks a KeyFigure as ACTIVE, making it visible to registered families ' +
      'and queryable in pattern theses. Only call after legal review confirms the figure is named ' +
      'in their official capacity and the nomination count is legitimate.',
    activateFigureSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await activateFigureHandler(input) }],
    }),
  );

  server.tool(
    'suggest_commitments',
    'Analyse a case\'s structured intake data (criminal complaints, nzakut orders) and return ' +
      'which PatternCategory values are evidenced. Covers domains A and B. ' +
      'Already-registered commitments for this case × figure × court are flagged so you can skip them. ' +
      'Call register_commitment for each suggestion where alreadyRegistered=false.',
    suggestCommitmentsSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await suggestCommitmentsHandler(input) }],
    }),
  );

  server.tool(
    'register_on_chain',
    'Backfill on-chain registration for commitments that have not yet been registered. ' +
      'Finds all commitments with no onChainTxHash and submits each to EvidenceRegistry. ' +
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
