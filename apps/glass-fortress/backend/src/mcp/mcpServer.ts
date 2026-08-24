import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchEvidenceSchema, searchEvidenceHandler } from './tools/searchEvidence';
import { getForensicTimelineSchema, getForensicTimelineHandler } from './tools/getForensicTimeline';
import { getFigureDossierSchema, getFigureDossierHandler } from './tools/getFigureDossier';
import { getThesisContextSchema, getThesisContextHandler } from './tools/getThesisContext';
import { getResearchAgendaSchema, getResearchAgendaHandler } from './tools/getResearchAgenda';
import { createEvidenceFromUrlSchema, createEvidenceFromUrlHandler } from './tools/createEvidenceFromUrl';
import { createEvidenceFromTextSchema, createEvidenceFromTextHandler } from './tools/createEvidenceFromText';
import { startForensicScanSchema, startForensicScanHandler } from './tools/startForensicScan';
import { createThesisDraftSchema, createThesisDraftHandler } from './tools/createThesisDraft';
import { addThesisVersionSchema, addThesisVersionHandler } from './tools/addThesisVersion';
import { citeTrajectoriesSchema, citeTrajectoriesHandler } from './tools/citeTrajectories';
import { runAiAnalysisSchema, runAiAnalysisHandler } from './tools/runAiAnalysis';
import { createResearchSessionSchema, createResearchSessionHandler } from './tools/createResearchSession';
import { addSessionNoteSchema, addSessionNoteHandler } from './tools/addSessionNote';
import { closeResearchSessionSchema, closeResearchSessionHandler } from './tools/closeResearchSession';
import { getSessionSummarySchema, getSessionSummaryHandler } from './tools/getSessionSummary';
import { suggestThesisSchema, suggestThesisHandler } from './tools/suggestThesis';
import { enrichEvidenceWithHistorySchema, enrichEvidenceWithHistoryHandler } from './tools/enrichEvidenceWithHistory';
import { promoteEvidenceSchema, promoteEvidenceHandler } from './tools/promoteEvidence';
import { deleteEvidenceSchema, deleteEvidenceHandler } from './tools/deleteEvidence';
import { generateFoiaRequestSchema, generateFoiaRequestHandler } from './tools/generateFoiaRequest';
import { recoverEvidenceFromScreenshotSchema, recoverEvidenceFromScreenshotHandler } from './tools/recoverEvidenceFromScreenshot';
import { checkOnChainStatusSchema, checkOnChainStatusHandler } from './tools/checkOnChainStatus';
import { getWhistleblowerCallSchema, getWhistleblowerCallHandler } from './tools/getWhistleblowerCall';
import { getScanFindingsSchema, getScanFindingsHandler } from './tools/getScanFindings';
import {
  openThesisFramingSchema,
  openThesisFramingHandler,
  assessThesisFramingSchema,
  assessThesisFramingHandler,
  getThesisFramingSchema,
  getThesisFramingHandler,
} from './tools/thesisFramingTools';
import { getClaimTrajectoriesSchema, getClaimTrajectoriesHandler } from './tools/getClaimTrajectories';
import { promoteScanFindingsSchema, promoteScanFindingsHandler } from './tools/promoteScanFindings';
import {
  openDiffDebateSchema,
  openDiffDebateHandler,
  respondInDiffDebateSchema,
  respondInDiffDebateHandler,
  promoteFromDiffDebateSchema,
  promoteFromDiffDebateHandler,
  getDiffDebateSchema,
  getDiffDebateHandler,
} from './tools/diffDebateTools';
import { listCapturesSchema, listCapturesHandler } from './tools/listCaptures';
import { verifyClaimTextSchema, verifyClaimTextHandler } from './tools/verifyClaimText';
import { auditThesisClaimsSchema, auditThesisClaimsHandler } from './tools/auditThesisClaims';
import {
  checkPublicationReadinessSchema,
  checkPublicationReadinessHandler,
  publishThesisSchema,
  publishThesisHandler,
  unpublishThesisSchema,
  unpublishThesisHandler,
} from './tools/thesisPublicationTools';

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
  // Tool: check_on_chain_status
  // Compares the vault's claim about a record against the registry contract.
  // Read-only against both — it never registers anything.
  // -------------------------------------------------------------------------
  server.tool(
    'check_on_chain_status',
    'Verify an evidence record against the blockchain registry. Compares what the database claims ' +
      '(PENDING_REVIEW / CONFIRMED, recorded tx hash) against what the EvidenceRegistry contract ' +
      'actually holds, and returns a verdict naming any discrepancy. Call it BEFORE promote_evidence ' +
      'to confirm the hash is not already anchored, and AFTER to confirm the anchor landed. ' +
      'Read-only — it never registers anything.',
    checkOnChainStatusSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await checkOnChainStatusHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: get_whistleblower_call
  // The public Call for Whistleblowers is derived from the head version's
  // evidence gaps — there is no stored record, so this is a read.
  // -------------------------------------------------------------------------
  server.tool(
    'get_whistleblower_call',
    'Return the Call for Whistleblowers for a thesis — its shareable URL, whether it is live, ' +
      'and every evidence gap it publishes as an appeal. The call is derived from a version\'s ' +
      'Devil\'s Advocate analysis rather than stored. Anonymous callers see the call the public ' +
      'sees (derived from the PUBLISHED version, or UNPUBLISHED); an authenticated researcher sees ' +
      'the call the head version would produce, and whether the public is behind it. Each gapIndex ' +
      'returned can also be passed to generate_foia_request.',
    getWhistleblowerCallSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await getWhistleblowerCallHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: get_scan_findings
  // What a page's forensic scans found and nobody has reviewed yet.
  // -------------------------------------------------------------------------
  server.tool(
    'get_scan_findings',
    'List every finding from a tracked page\'s forensic scans that is still awaiting human review. ' +
      'Forensic scans do NOT promote their own findings: they classify page changes and record the ' +
      'significant ones as PENDING_REVIEW, with nothing on-chain and nothing publicly searchable ' +
      'until a person confirms them. Returns the classifier\'s reasoning with each finding so the ' +
      'decisions can be reviewed, not just the rows. Confirm them with promote_scan_findings.',
    getScanFindingsSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await getScanFindingsHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: promote_scan_findings
  // The human decision a scan deliberately does not make for itself.
  // -------------------------------------------------------------------------
  server.tool(
    'promote_scan_findings',
    'Confirm every pending finding from a tracked page\'s forensic scans — registering each on-chain, ' +
      'indexing it for search, and marking it CONFIRMED. Promotes exactly what the classifier flagged ' +
      'as legally significant. Irreversible: on-chain registration cannot be undone. Call ' +
      'get_scan_findings first and review what it returns.',
    promoteScanFindingsSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await promoteScanFindingsHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tools: the diff debate — arguing a passed-over change into evidence.
  // -------------------------------------------------------------------------
  server.tool(
    'open_diff_debate',
    'Open a debate arguing that a page change the forensic classifier passed over should become ' +
      'evidence. Requires a rationale making specific, falsifiable claims about the changed content — ' +
      'bare assertion is refused. Returns the assessor\'s response and a session id. Promotion is a ' +
      'separate call: this one never writes evidence and never touches the chain. Use this when you ' +
      'disagree with the classifier; promote_scan_findings confirms what it DID flag.',
    openDiffDebateSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await openDiffDebateHandler(input) }],
    }),
  );

  server.tool(
    'respond_in_diff_debate',
    'Reply within an open diff debate — answering the assessor\'s objection, or supplying the ' +
      'specificity its substanceGaps asked for. Re-assessed and recorded as another round. The ' +
      'assessor cannot veto: once your argument has substance you may promote even over a sustained ' +
      'objection, and the objection is then carried on the evidence permanently.',
    respondInDiffDebateSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await respondInDiffDebateHandler(input) }],
    }),
  );

  server.tool(
    'promote_from_diff_debate',
    'Promote the debated change to evidence, registering it on-chain. Requires that the argument ' +
      'cleared the substance gate and, if the assessor disputes it, that you answered the objection. ' +
      'Irreversible. If the assessor still disagrees, the promotion is recorded as made over its ' +
      'objection and that stays attached to the evidence.',
    promoteFromDiffDebateSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await promoteFromDiffDebateHandler(input) }],
    }),
  );

  server.tool(
    'get_diff_debate',
    'Read a diff debate — its full turn-by-turn record of arguments, assessments and responses, ' +
      'whether it can be promoted yet, and what is blocking it if not.',
    getDiffDebateSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await getDiffDebateHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: get_claim_trajectories
  // What a single claim did across a page's whole archived history.
  // -------------------------------------------------------------------------
  server.tool(
    'get_claim_trajectories',
    'Follow individual claims across a tracked page\'s entire archived history — every assertion ' +
      'that was added and removed more than once. This is the pattern no single diff can show: a diff ' +
      'compares two snapshots, while a trajectory shows that a claim was removed, restored and removed ' +
      'again. Computed by string search against the archived page text with no AI judgment, so every ' +
      'result is verifiable by opening the snapshot URLs it returns.',
    getClaimTrajectoriesSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await getClaimTrajectoriesHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tools: thesis framing — deciding what to argue, before writing it.
  // -------------------------------------------------------------------------
  server.tool(
    'open_thesis_framing',
    'Open a session to decide what a thesis should argue, BEFORE writing one. The topic string a ' +
      'thesis is built from determines which evidence gets pulled and what the Devil\'s Advocate ' +
      'attacks, so a wrong framing produces a well-argued thesis about the wrong thing. This session ' +
      'has no thesis attached; the thesis attaches to it when created.',
    openThesisFramingSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await openThesisFramingHandler(input) }],
    }),
  );

  server.tool(
    'assess_thesis_framing',
    'Check a proposed thesis framing against confirmed evidence. Returns candidate framings anchored ' +
      'in specific records, assumptions that need verifying — and, most importantly, CONTRADICTIONS: ' +
      'where your own evidence points the other way. Finding that now is far cheaper than hearing it ' +
      'from the Devil\'s Advocate after a thesis is written, or from the opposing side. The whole ' +
      'exchange is recorded and attaches to the thesis.',
    assessThesisFramingSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await assessThesisFramingHandler(input) }],
    }),
  );

  server.tool(
    'get_thesis_framing',
    'Read a thesis framing session — its full turn-by-turn record of proposed framings and the ' +
      'assessments of them, and the thesis it produced if any.',
    getThesisFramingSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await getThesisFramingHandler(input) }],
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
    'Retrieve a legal thesis by ID — the version body, all cited evidence summaries, key figures ' +
      'mentioned, and the Devil\'s Advocate AI critique. Anonymous callers receive the PUBLISHED ' +
      'version only (or viewer: PUBLIC with status UNPUBLISHED); an authenticated researcher ' +
      'receives the head version plus publication state and how far the public is behind it.',
    getThesisContextSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await getThesisContextHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: get_research_agenda
  // Returns the AI critique gaps for a thesis, each enriched with vault hits
  // (evidence already in the vault that may address the gap). Flags which hits
  // are already cited vs. new. Includes instructions for the next action.
  // -------------------------------------------------------------------------
  server.tool(
    'get_research_agenda',
    'Given a thesis ID, returns the Devil\'s Advocate gaps with vault evidence hits for each gap. ' +
      'Use this after get_thesis_context to know exactly what evidence is missing and whether the ' +
      'vault already contains records that address each gap. Returns alreadyCited flags so you ' +
      'can focus on new evidence only.',
    getResearchAgendaSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await getResearchAgendaHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: suggest_thesis  [READ — no auth required]
  // Searches the evidence vault semantically, builds a corpus, and asks the
  // ThesisSynthesisAgent to propose the strongest defensible legal thesis.
  // Returns a ready-to-use create_thesis_draft payload.
  // -------------------------------------------------------------------------
  server.tool(
    'suggest_thesis',
    'Search the evidence vault for a topic and propose the strongest legal thesis the evidence ' +
      'supports. Returns a proposed title, thesis statement, full narrative body, supporting ' +
      'evidence hashes, implicated key figures, and what evidence is still missing. ' +
      'Pass the readyForDraft field directly to create_thesis_draft to save it.',
    suggestThesisSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await suggestThesisHandler(input) }],
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
      'call run_ai_analysis immediately after to get Devil\'s Advocate critique. ' +
      'Body supports Markdown (# headings, **bold**, - bullets).',
    addThesisVersionSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await addThesisVersionHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: cite_trajectories  [WRITE — STAGING GATE]
  // Attaches claim trajectories to claims already written, WITHOUT re-authoring
  // the thesis. add_thesis_version takes the body as Markdown, and nothing hands
  // the stored document back in that form, so adding one citation through it
  // means retyping the whole thesis by hand past every working citation in it.
  // -------------------------------------------------------------------------
  server.tool(
    'cite_trajectories',
    'Attach claim trajectories to sentences already written, without touching the prose. Anchors ' +
      'on an exact substring of the existing text and splices the citation in after it; the prose is ' +
      'asserted byte-identical afterwards, and an anchor matching zero times or more than once is ' +
      'refused rather than guessed. Writes a new PENDING_AI version — use this instead of ' +
      'add_thesis_version when only the CITATIONS change, never to edit what the thesis says.',
    citeTrajectoriesSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await citeTrajectoriesHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: run_ai_analysis  [WRITE — requires auth]
  // Synchronously runs Devil's Advocate AI analysis on the head version of a
  // thesis and returns the full critique. Unlike POST /analyze (202 async),
  // this tool awaits completion so the LLM can continue the research loop.
  // -------------------------------------------------------------------------
  server.tool(
    'run_ai_analysis',
    'Run Devil\'s Advocate AI analysis on the current head version of a thesis. ' +
      'Waits for analysis to complete and returns the full critique including strength ' +
      'assessment, counter-arguments, and evidence gaps. If already analysed, returns ' +
      'the cached result. Use after add_thesis_version to close the research loop.',
    runAiAnalysisSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await runAiAnalysisHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tools: Research Sessions  [WRITE: create, note, close / READ: summary]
  // Track the arc of a Claude+human research sprint on a thesis.
  // Events (VERSION_CREATED, GAP_RESOLVED, AI_ANALYSIS_RUN) are logged
  // automatically — no explicit logging needed.
  // -------------------------------------------------------------------------
  server.tool(
    'create_research_session',
    'Start a new named research session on a thesis. Only ONE session may be active at a time ' +
      'across the system: if one is open, this refuses and names it. Pass closeActiveSession: true ' +
      'to close your own; closing another researcher\'s requires closeOtherResearchersSession: true ' +
      'and a closeReason, recorded on their session. Publishing a thesis must happen inside an active ' +
      'session on that thesis. Events are logged automatically. Name defaults to the current date/time.',
    createResearchSessionSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await createResearchSessionHandler(input) }],
    }),
  );

  server.tool(
    'add_session_note',
    'Add a manual note to the active research session for a thesis. Use to record observations, ' +
      'dead ends, hypotheses, or next steps that are not captured by automatic events.',
    addSessionNoteSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await addSessionNoteHandler(input) }],
    }),
  );

  server.tool(
    'close_research_session',
    'Close the active research session — by thesisId, or by sessionId for a framing session that ' +
      'has no thesis yet — and return a full summary of what was accomplished: versions created, ' +
      'gaps resolved, AI analyses run, and the event timeline.',
    closeResearchSessionSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await closeResearchSessionHandler(input) }],
    }),
  );

  server.tool(
    'get_session_summary',
    'Return the current (or most recent) research session for a thesis, including the full ' +
      'event timeline and activity summary. Useful for resuming work after a break.',
    getSessionSummarySchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await getSessionSummaryHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: create_evidence_from_text  [WRITE — STAGING GATE]
  // Accepts raw text + source URL (for pages behind bot protection, paywalls,
  // or dynamic SPAs that can't be fetched server-side). Same analysis pipeline
  // and staging gate as create_evidence_from_url.
  // -------------------------------------------------------------------------
  server.tool(
    'create_evidence_from_text',
    'Submit evidence as raw text when the source URL cannot be fetched directly (e.g. behind ' +
      'bot protection, JavaScript SPA, or paywall). Provide the plain text content and the ' +
      'canonical source URL for provenance. Runs the same AI intake analysis and staging gate ' +
      'as create_evidence_from_url — saved as PENDING_REVIEW, not registered on-chain until promoted.',
    createEvidenceFromTextSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await createEvidenceFromTextHandler(input) }],
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
      'with a trackedUrlId — the scan runs asynchronously server-side. Call ' +
      'get_forensic_timeline for progress; the REST status endpoint sits behind the staging ' +
      'access gate and is not reachable from MCP. Calling this again for the same ' +
      'URL while it is already scanning is safe — the concurrent-run guard prevents double-runs.',
    startForensicScanSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await startForensicScanHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: enrich_evidence_with_history  [WRITE — FIRE-AND-FORGET]
  // Given a fileHash, triggers a Wayback scan of the evidence's sourceUrl.
  // Reverse enrichment: find the page history behind a submitted document.
  // -------------------------------------------------------------------------
  server.tool(
    'enrich_evidence_with_history',
    'Trigger a Wayback Machine forensic scan for the sourceUrl of an existing evidence record. ' +
      'Given a fileHash, looks up the evidence sourceUrl, upserts a TrackedUrl, and starts ' +
      'runFullScan() asynchronously. Legally significant page edits are recorded as ' +
      'PENDING_REVIEW evidence — never promoted, never registered on-chain; review them with ' +
      'get_scan_findings and confirm with promote_scan_findings. Returns a trackedUrlId; call ' +
      'get_forensic_timeline for progress.',
    enrichEvidenceWithHistorySchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await enrichEvidenceWithHistoryHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: promote_evidence  [WRITE — SYNCHRONOUS]
  // Promotes a PENDING_REVIEW evidence record to CONFIRMED:
  //   1. Registers the fileHash on-chain (Web3Service)
  //   2. Upserts the summary embedding to the vector store
  //   3. Sets status = CONFIRMED in Prisma
  // Idempotent — safe to call on already-CONFIRMED records.
  // -------------------------------------------------------------------------
  server.tool(
    'promote_evidence',
    'Promote a PENDING_REVIEW evidence record to CONFIRMED. Registers the file hash on the ' +
      'blockchain, upserts the embedding into the vector store, and marks the record as CONFIRMED ' +
      'in the database. Idempotent — safe to call if already confirmed. Requires evidenceId (UUID).',
    promoteEvidenceSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await promoteEvidenceHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: delete_evidence  [WRITE — SYNCHRONOUS, DESTRUCTIVE]
  // Permanently deletes a PENDING_REVIEW evidence record and its Storage
  // file(s). Refuses CONFIRMED records (immutable once on-chain), records
  // still cited by a thesis, and records with a Pinata IPFS pin (no verified
  // unpin implementation yet — see deleteEvidence.ts).
  // -------------------------------------------------------------------------
  server.tool(
    'delete_evidence',
    'Permanently delete a PENDING_REVIEW evidence record — removes its file(s) from Storage and ' +
      'the database row. Refuses to delete CONFIRMED records (already registered on-chain, meant to ' +
      'be immutable), records still cited by a thesis, or records with an IPFS pin from the ' +
      'whistleblower attachment path. Requires evidenceId (UUID). Irreversible — use for cleaning up ' +
      'test, rejected, or mistakenly-submitted PENDING_REVIEW records, not as a general moderation tool.',
    deleteEvidenceSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await deleteEvidenceHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: generate_foia_request  [WRITE — synchronous LLM call]
  // Given a thesis ID and gap index, generates a formal Hebrew FOIA request
  // letter targeting the Israeli ministry most likely to hold the missing
  // evidence. Requires the thesis to have a completed Devil's Advocate analysis.
  // -------------------------------------------------------------------------
  server.tool(
    'generate_foia_request',
    'Generate a formal Hebrew Freedom of Information (חוק חופש המידע) request letter for a ' +
      'specific evidence gap in a thesis. The LLM identifies the target Israeli ministry and ' +
      'drafts numbered, specific requests derived from the gap description. ' +
      'Requires a completed Devil\'s Advocate analysis on the thesis head version.',
    generateFoiaRequestSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await generateFoiaRequestHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: recover_evidence_from_screenshot  [WRITE — STAGING GATE]
  // For when a source URL is blocked or unarchived: accepts one or more
  // screenshots (in reading order) in place of a direct fetch. Synthesizes
  // them into a single analysis and saves as PENDING_REVIEW — same rule as
  // create_evidence_from_text, since the paired URL is asserted, not fetched.
  // -------------------------------------------------------------------------
  server.tool(
    'recover_evidence_from_screenshot',
    'Submit one or more screenshots of a page that could not be fetched directly (blocked, not in ' +
      'the Wayback Machine). Screenshots are treated as sequential parts of one document and ' +
      'synthesized into a single AI analysis. Saved as PENDING_REVIEW — the paired source URL is ' +
      'asserted, not verified by a server fetch, same rule that governs create_evidence_from_text. ' +
      'Not registered on-chain or indexed for search until a human reviewer promotes it via the UI.',
    recoverEvidenceFromScreenshotSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await recoverEvidenceFromScreenshotHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Thesis publication (docs/gf-thesis-publication-gate-dev-plan.md)
  // Publication is a pinned version behind thirteen individually-reported
  // checks. All three tools are gated.
  // -------------------------------------------------------------------------
  server.tool(
    'check_publication_readiness',
    'Run every publication check on a thesis\'s head version and report each one, pass or fail, ' +
      'WITHOUT publishing. Hard checks block publication; advisory checks are recorded with it. ' +
      'Use before publish_thesis to see exactly what is missing. Pass a rationale to have it ' +
      'assessed in advance. Writes nothing.',
    checkPublicationReadinessSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await checkPublicationReadinessHandler(input) }],
    }),
  );

  server.tool(
    'publish_thesis',
    'Publish the HEAD version of a thesis: pins that exact version as what the public sees until ' +
      'publish_thesis is called again — later edits and re-analyses change nothing public. Requires ' +
      'an active research session on this thesis, an argued rationale (substance is a hard gate, ' +
      'merit is advisory and recorded), and every hard check to pass; refuses with the full list ' +
      'otherwise. The rationale and assessment are recorded on the session either way.',
    publishThesisSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await publishThesisHandler(input) }],
    }),
  );

  server.tool(
    'unpublish_thesis',
    'Withdraw a thesis from public view: sets the published pin to null and deletes nothing. ' +
      'Requires no session — retraction must never wait on one. The reason is recorded on the ' +
      'active session on this thesis if there is one, otherwise on the session that published.',
    unpublishThesisSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await unpublishThesisHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Verification tools (docs/gf-verification-tools-dev-plan.md)
  //
  // The platform institutionalised ARGUMENT — framing session, diff debate,
  // publication rationale — and left VERIFICATION as improvisation. Every
  // factual error caught in the first real thesis walk was caught by
  // re-deriving a number from primary data through an ad-hoc shell; these three
  // tools are that shell, available to anyone.
  //
  // Deterministic, dry (they write nothing), and reporting rather than
  // blocking: the publication gate is where blocking lives, and wiring these
  // into it would turn "could not reach the archive" into "cannot publish".
  //
  // Gated because each hits the Internet Archive — unbounded per-call work,
  // which is what WRITE_TOOLS actually means here.
  // -------------------------------------------------------------------------
  server.tool(
    'list_captures',
    'List every capture the Internet Archive holds for a tracked page, optionally within a date ' +
      'range, marking which ones this platform has stored. Answers "is there a capture between ' +
      'these two dates?" — which the forensic timeline (diffs) and claim trajectories (a count) ' +
      'cannot. Writes nothing.',
    listCapturesSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await listCapturesHandler(input) }],
    }),
  );

  server.tool(
    'verify_claim_text',
    'Check whether an exact phrase was on a tracked page at a given capture. Searches the RAW ' +
      'archived document, not this platform\'s stored extraction, and reports both plus an ' +
      'EXTRACTION_DIVERGENCE flag when they disagree — the condition that let a false claim survive ' +
      'into a real thesis. Distinguishes "not in the archive" and "fetch failed" from "phrase ' +
      'absent". Writes nothing.',
    verifyClaimTextSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await verifyClaimTextHandler(input) }],
    }),
  );

  server.tool(
    'audit_thesis_claims',
    'Check every mechanically checkable assertion in a thesis\'s head version against the archive: ' +
      'dates (does a capture exist, and does the sentence assert an act on a day nobody captured?), ' +
      'quotations (is the quoted text really in those captures?), and intervals (are the endpoints ' +
      'adjacent captures?). No model is involved. Reports what it could NOT check, including Hebrew ' +
      'number-word spans and counts. Reports only — it never blocks publication.',
    auditThesisClaimsSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await auditThesisClaimsHandler(input) }],
    }),
  );

  return server;
}
