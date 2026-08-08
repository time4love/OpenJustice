import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchEvidenceSchema, searchEvidenceHandler } from './tools/searchEvidence';
import { getForensicTimelineSchema, getForensicTimelineHandler } from './tools/getForensicTimeline';
import { getFigureDossierSchema, getFigureDossierHandler } from './tools/getFigureDossier';
import { getThesisContextSchema, getThesisContextHandler } from './tools/getThesisContext';
import { createEvidenceFromUrlSchema, createEvidenceFromUrlHandler } from './tools/createEvidenceFromUrl';
import { startForensicScanSchema, startForensicScanHandler } from './tools/startForensicScan';
import { createThesisDraftSchema, createThesisDraftHandler } from './tools/createThesisDraft';
import { addThesisVersionSchema, addThesisVersionHandler } from './tools/addThesisVersion';

// ---------------------------------------------------------------------------
// Factory — creates a fresh McpServer per request.
//
// StreamableHTTPServerTransport (stateless mode) requires a new McpServer
// instance per request: once server.connect(transport) is called, the server
// is bound to that transport and cannot accept a second one.
//
// Tool handlers (Prisma queries, VectorStore) use their own lazy singletons
// so the per-request server creation is cheap — only tool registration runs.
// ---------------------------------------------------------------------------

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'Glass Fortress MCP',
    version: '1.0.0',
  });

  // -------------------------------------------------------------------------
  // Tool: search_evidence
  // Semantic search over the evidence vault (Pinecone + Prisma).
  // PII-free: no submitterAddress, fileUrl, or raw medicalConditions returned.
  // -------------------------------------------------------------------------
  server.tool(
    'search_evidence',
    'Semantic search over the Glass Fortress evidence vault. Returns public evidence metadata ' +
      'ranked by relevance. Filter by entity or tier. Never returns PII.',
    searchEvidenceSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await searchEvidenceHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: get_forensic_timeline
  // Returns the full Wayback Machine diff history for a tracked URL.
  // -------------------------------------------------------------------------
  server.tool(
    'get_forensic_timeline',
    'Retrieve the forensic diff timeline for a tracked URL — all detected content changes ' +
      'between archived snapshots, including AI-assessed legal significance.',
    getForensicTimelineSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await getForensicTimelineHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: get_figure_dossier
  // Returns all evidence linked to a named key figure.
  // -------------------------------------------------------------------------
  server.tool(
    'get_figure_dossier',
    'Retrieve all evidence records associated with a named public figure (official, politician, ' +
      'doctor). Supports partial name matching in Hebrew or English.',
    getFigureDossierSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await getFigureDossierHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: get_thesis_context
  // Returns a full thesis with its head version, evidence citations, and AI critique.
  // -------------------------------------------------------------------------
  server.tool(
    'get_thesis_context',
    'Retrieve a legal thesis by ID — returns the current version body, all cited evidence ' +
      'summaries, key figures mentioned, and the Devil\'s Advocate AI critique.',
    getThesisContextSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await getThesisContextHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: create_evidence_from_url  [WRITE — STAGING GATE]
  // Fetches a URL, runs IntakeAgent analysis, and saves as PENDING_REVIEW.
  // NEVER registers on-chain or indexes in Pinecone — human promotion required.
  // -------------------------------------------------------------------------
  server.tool(
    'create_evidence_from_url',
    'Fetch a public URL, run AI intake analysis, and save the result as PENDING_REVIEW in the ' +
      'evidence vault. The evidence is NOT registered on-chain or indexed for search until a ' +
      'human reviewer explicitly promotes it via the UI. Safe to call multiple times — ' +
      'duplicate URLs return the existing record.',
    createEvidenceFromUrlSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await createEvidenceFromUrlHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: create_thesis_draft  [WRITE — STAGING GATE]
  // Creates a Thesis + ThesisVersion (PENDING_AI). Does NOT trigger AI
  // analysis — human opens in UI, reviews, then triggers analysis.
  // -------------------------------------------------------------------------
  server.tool(
    'create_thesis_draft',
    'Create a new legal thesis draft pre-populated with evidence and key-figure mentions. ' +
      'Saved as PENDING_AI — no Devil\'s Advocate analysis is triggered automatically. ' +
      'Open the thesis in the UI to edit and trigger AI review before publishing.',
    createThesisDraftSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await createThesisDraftHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: add_thesis_version  [WRITE — STAGING GATE]
  // Appends a new ThesisVersion (wiki edit) to an existing thesis. The new
  // version immediately becomes the head. Does NOT trigger AI analysis.
  // -------------------------------------------------------------------------
  server.tool(
    'add_thesis_version',
    'Append a new version (wiki edit) to an existing thesis. The previous head becomes the ' +
      'parent; the new version immediately becomes the head. Saved as PENDING_AI — ' +
      'no Devil\'s Advocate analysis is triggered automatically. Open in the UI to review.',
    addThesisVersionSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await addThesisVersionHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: start_forensic_scan  [WRITE — FIRE-AND-FORGET]
  // Upserts a TrackedUrl, sets status to SCANNING, and fires runFullScan().
  // Idempotent — calling again for an in-progress URL resumes where it left off.
  // -------------------------------------------------------------------------
  server.tool(
    'start_forensic_scan',
    'Start (or resume) a Wayback Machine forensic diff scan for a URL. Returns immediately ' +
      'with a trackedUrlId — the scan runs asynchronously server-side. Poll ' +
      'GET /api/forensics/tracked/:id/status for progress. Calling this again for the same ' +
      'URL while it is already scanning is safe — the concurrent-run guard prevents double-runs.',
    startForensicScanSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await startForensicScanHandler(input) }],
    }),
  );

  return server;
}
