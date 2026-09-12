import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveOrigin } from '../oauth/oidcProvider';
import {
  surveyWaybackCapturesSchema,
  surveyWaybackCapturesHandler,
  approveArticleRulesSchema,
  approveArticleRulesHandler,
  resolveScanStopSchema,
  resolveScanStopHandler,
  scanCapturesSchema,
  scanCapturesHandler,
  getArticleRulesSchema,
  getArticleRulesHandler,
  getRuleHistoryHandler,
  getRuleHistorySchema,
  resetArticleCalibrationSchema,
  resetArticleCalibrationHandler,
  listCapturesSchema,
  listCapturesHandler,
} from '../walk/tools';
import {
  getThesisTrajectoryCitationsSchema,
  getThesisTrajectoryCitationsHandler,
} from './tools/getThesisTrajectoryCitations';
import { getClaimTrajectoriesSchema, getClaimTrajectoriesHandler } from './tools/getClaimTrajectories';
import { verifyClaimTextSchema, verifyClaimTextHandler } from './tools/verifyClaimText';
import { getEnvironmentSchema, getEnvironmentHandler } from './tools/getEnvironment';
import { auditThesisClaimsSchema, auditThesisClaimsHandler } from './tools/auditThesisClaims';
import { listFindingsSchema, listFindingsHandler } from './tools/listFindings';
import { getDiffInputSchema, getDiffInputHandler } from './tools/getDiffInput';
import { resolveRecordSchema, resolveRecordHandler } from './tools/resolveRecord';
import { checkOnChainStatusSchema, checkOnChainStatusHandler } from './tools/checkOnChainStatus';
import { openDebateSchema, openDebateHandler } from './tools/openDebate';
import { respondInDebateSchema, respondInDebateHandler } from './tools/respondInDebate';
import { promoteFromDebateSchema, promoteFromDebateHandler } from './tools/promoteFromDebate';
import { getDebateSchema, getDebateHandler } from './tools/getDebate';
import {
  listEvidenceReviewsSchema,
  listEvidenceReviewsHandler,
} from './tools/listEvidenceReviews';
import { reviewEvidenceSchema, reviewEvidenceHandler } from './tools/reviewEvidence';
import { openFramingSchema, openFramingHandler } from './tools/openFraming';
import { assessFramingSchema, assessFramingHandler } from './tools/assessFraming';
import { chooseFramingSchema, chooseFramingHandler } from './tools/chooseFraming';
import { getFramingSchema, getFramingHandler } from './tools/getFraming';

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
    // name is the programmatic identifier and title is what a client shows —
    // Implementation extends BaseMetadata, so putting the display name in
    // `name` would hand clients a Hebrew string to key on.
    //
    // Both change: "Glass Fortress" is this codebase's internal term for the
    // Covid case and has never been a name the project shows anyone, and a
    // connector's serverInfo is shown to whoever attaches it.
    name: 'tzedek-laam-covid',
    title: 'צדק לעם — תיק הקורונה',
    version: '1.0.0',
    websiteUrl: resolveOrigin(process.env),
    description:
      'Forensic evidence vault for the Covid-19 Ministry of Health case: archived page histories, ' +
      'deterministic claim trajectories, and the theses built on them.',
    // Declared per the MCP spec so a client does not have to fall back to
    // guessing a favicon at the origin. Served above the staging gate, because
    // this is fetched unauthenticated.
    icons: [
      {
        src: `${resolveOrigin(process.env)}/icon.png`,
        mimeType: 'image/png',
        sizes: ['480x480'],
      },
    ],
  });

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
  // Tool: get_thesis_trajectory_citations  [READ]
  // The deterministic citations behind a thesis, resolved in full. It was
  // separate from the thesis context read because that answer had to stay
  // bounded while this one grows with how thoroughly a thesis is cited; the
  // context read left the surface in the thesis half of the legacy switch and
  // returns at thesis step 20, under T2's shape.
  // -------------------------------------------------------------------------
  server.tool(
    'get_thesis_trajectory_citations',
    'Resolve the claim trajectories a thesis cites: which claims, which archived captures each one ' +
      'appeared and vanished on, how much of each co-movement was cited, and whether a later ' +
      'detection pass still agrees. This is the full answer, not a summary: no other read ' +
      'returns a thesis\'s trajectory citations resolved.',
    getThesisTrajectoryCitationsSchema,
    async (input) => ({
      content: [{ type: 'text' as const, text: await getThesisTrajectoryCitationsHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tools: get_article_rules · reset_article_calibration · list_captures
  //
  // THE WALK'S TWO READS AND ITS RESET — docs/gf-interaction-flows.md A5. The
  // reads are GATED in WRITE_TOOLS by the standing precedent: a researcher's
  // working state is not published evidence. Registered at the switch
  // (refactor plan §3 step 8, 2026-09-06), under the names the retired tools
  // owned until then.
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_article_rules',
    {
      description:
        'READ A PAGE\'S RULES AND ITS LOG. Every rule under AUTHORITY — in force or ended, with ' +
        'validFrom, validTo, whether it is trusted, and when it last matched a capture; the pending ' +
        'stop, verbatim from the row, with its marking URL, or null; the count of every outcome ' +
        'on the work-list and how many rows are stale; and every decision on the page. Names the ' +
        'page by url. Writes nothing. Refuses NOT_SURVEYED.',
      inputSchema: getArticleRulesSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await getArticleRulesHandler(input) }],
    }),
  );

  server.registerTool(
    'get_rule_history',
    {
      description:
        'READ ONE RULE\'S HISTORY, so a stop can be judged. Returns the rule — its selector, the capture it ' +
        'was created against, when it was ended if it was, whether it is trusted, who made it — every decision ' +
        'about it, and the series of captures it matched: each capture, that capture\'s outcome, how many nodes ' +
        'it matched, and THE LINES IT REMOVED THERE, re-derived under the ruleset in force for that capture\'s ' +
        'own date. `removed` is null where the corpus holds no body (DUPLICATE, IDENTICAL), which is not the ' +
        'same as removing nothing. `maxCaptures` bounds it to the latest n. NAME THE ELEMENT IN WORDS when you ' +
        'read this out — its tag and the first line it removed — never the selector as the name. `removed` is ' +
        'the LINES the rule took, de-duplicated, at the same granularity Gate 4 shows them. Quote the ' +
        'FIRST 5 VERBATIM and offer the rest; never summarise them in their place. Gate 2\'s ' +
        'silent rule shows what it removed on the previous capture, from here. This read decides nothing: it ' +
        'is a series and its lines, and it must not be turned into a verdict or a threshold. Writes nothing. ' +
        'Refuses NOT_SURVEYED and NO_SUCH_RULE.',
      inputSchema: getRuleHistorySchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await getRuleHistoryHandler(input) }],
    }),
  );

  server.registerTool(
    'reset_article_calibration',
    {
      description:
        'START A PAGE\'S CALIBRATION AGAIN: one RESET decision, reason REQUIRED, after which every ' +
        'rule created before it loses authority — the rules stay readable, nothing is deleted, and ' +
        'the next scan_captures stops on Gate 0 like a page\'s first capture. Clears the draft and ' +
        'the pending stop on every held capture (the bytes are kept and re-evaluated). Refuses ' +
        'NOTHING_TO_RETIRE, REASON_REQUIRED and STALE_SEQUENCE.',
      inputSchema: resetArticleCalibrationSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await resetArticleCalibrationHandler(input) }],
    }),
  );

  server.registerTool(
    'list_captures',
    {
      description:
        'LIST A PAGE\'S WORK-LIST, one entry per capture the archive reported, in timestamp order: ' +
        'the capture, its date, its outcome (UNFETCHED, UNSERVABLE, IDENTICAL, DUPLICATE, ACQUIRED, ' +
        'PENDING_JUDGEMENT, SKIPPED), its digest, what it was compared to, the ruleset it was derived ' +
        'under, its snapshot, whether it is stale, and the gates of its pending stop. Never the held ' +
        'bytes. `outcome` filters to one outcome. Writes nothing. Refuses NOT_SURVEYED and ' +
        'INVALID_OUTCOME.',
      inputSchema: listCapturesSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await listCapturesHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: survey_wayback_captures  [WRITE — SYNCHRONOUS, ONE CDX QUERY]
  //
  // THE WALK'S ENTRY TO THE CORPUS — docs/gf-interaction-flows.md Phase 0
  // (refactor step 2). It admits nothing and fetches nothing: the first survey
  // creates the TrackedUrl attributed to the researcher, every survey records
  // what the archive's index said, one row per capture.
  // -------------------------------------------------------------------------
  server.registerTool(
    'survey_wayback_captures',
    {
      description:
        'SIZE THE JOB BEFORE ANYTHING IS FETCHED, STORED OR SPENT. Asks the Internet Archive\'s ' +
        'index for every capture of a URL — one query, no page fetches — and records one work-list ' +
        'row per capture. The first survey of a URL brings it into the corpus, attributed to you; ' +
        'a later survey appends captures the archive has added and rewrites nothing. Returns two ' +
        'sizes: `captures`, the archive\'s activity, and `byteDistinct`, captures whose bytes differ ' +
        'from the one before — the upper bound on fetches and on your attention. Also `held` (captures ' +
        'this platform already holds), `appended`, `unservable` and the date `span`. Refuses ' +
        'ARCHIVE_UNAVAILABLE with nothing written when the index cannot be read.',
      inputSchema: surveyWaybackCapturesSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await surveyWaybackCapturesHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tools: approve_article_rules · resolve_scan_stop  [WRITE — the page's log]
  //
  // THE WALK'S TWO ANSWERS AT A STOP — docs/gf-interaction-flows.md MARKING
  // and Flow 2 (refactor step 3). A capture is named by its page's URL and its
  // wayback timestamp, nothing else (A1).
  // -------------------------------------------------------------------------
  server.registerTool(
    'approve_article_rules',
    {
      description:
        'PROMOTE THE DRAFT YOU HANDED BACK FROM THE MARKING PAGE — CORRECT, the one answer given on ' +
        'the page: new selectors become rules in force from THIS capture; removed ones end here; the ' +
        'capture is accepted under the rules now in force; the draft is cleared. TRUST is not given ' +
        'here — it is resolve_scan_stop\'s, in the chat, and on a stop that needs both this call comes ' +
        'first. Names the page by url and the capture by its 14-digit wayback timestamp — paste the ' +
        'line the page shows. A draft that leaves NO rule in force needs `rules: 0`, stated, never ' +
        'assumed. AFTER THE CALL, SHOW THE RETURN AS IT CAME — `changes` and `decisionSequence`. ' +
        'Refuses NO_DRAFT, DRAFT_NOT_RETURNED, ' +
        'DRAFT_FOR_OTHER_CAPTURE (the wrong page is open), CAPTURE_NOT_MARKABLE, ' +
        'EMPTY_RULESET_UNCONFIRMED and STALE_SEQUENCE (someone else decided on this page first — ' +
        're-read). Then scan_captures acquires the capture; nothing else does.',
      inputSchema: approveArticleRulesSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await approveArticleRulesHandler(input) }],
    }),
  );

  server.registerTool(
    'resolve_scan_stop',
    {
      description:
        'RECORD THE RESEARCHER\'S ANSWER AT A STOP — every answer but CORRECT, in ONE call. ' +
        'CONTINUE: the rules are right here, so the capture is accepted, and with it the rules the ' +
        'researcher chose to TRUST or to END, each named by its selector. Say what each answer means ' +
        'before they choose. TRUST: Gate 4 stops asking about that element\'s contents on later ' +
        'captures; Gate 1 still catches its text if it changes sides. There is no untrust decision: the way ' +
        'back is to END or retire the rule and mark the element afresh, which starts REVIEWED again. ' +
        'CONTINUE WITHOUT TRUST: this capture is accepted and the element\'s new contents will stop the ' +
        'walk again. END: the rule stops applying from this capture\'s date, its text enters the article ' +
        'from here, and earlier captures are untouched. TRUST and END name GATE 4 rules only — a Gate 2 ' +
        'rule, one that matched nothing on this capture, goes in neither list and needs no decision; CONTINUE ' +
        'covers it. Read the rule\'s removals from get_rule_history first — the first 5 verbatim — and never ' +
        'ask for trust on a rule the researcher has not seen; one rule per turn. ' +
        'BAD_CAPTURE: this capture does not speak — a truncated archive page, a paywall redirect, ' +
        'anything a human has looked at and judged unusable — with a REQUIRED reason, because a silent ' +
        'hole in the record is the one outcome this corpus does not permit. The capture becomes SKIPPED, ' +
        'its held bytes are discarded, no snapshot is ever made of it, and the rules are untouched ' +
        'however many bad captures occur in a row; it carries no rule decision. CORRECT — marking or ' +
        'unmarking an element — is the one answer given in the marking page, and on a stop that needs ' +
        'both — one answer is CORRECT and others are trust or end — MARKING COMES FIRST and this call ' +
        'follows it; a stop with no CORRECT answer needs no marking and the URL in the return is only an ' +
        'address. Also the answer for an UNFETCHED capture ' +
        'the archive will not serve (a 429 that holds for one capture while its neighbours serve): the ' +
        'walk keeps retrying it forever and no count of attempts ever skips it — only your explicit word ' +
        'does, with the reason saying so. Names the page by url and the capture by its 14-digit wayback ' +
        'timestamp. AFTER THE CALL, SHOW THE RETURN AS IT CAME — `changes.trusted`, `changes.ended` and ' +
        '`decisionSequence` — so the researcher checks the record against what they said; never only your ' +
        'account of it. Refuses NOT_PENDING (any outcome but PENDING_JUDGEMENT or UNFETCHED), ' +
        'REASON_REQUIRED, NO_SUCH_RULE (a selector naming no rule in force at this capture), ' +
        'INVALID_RESOLUTION and STALE_SEQUENCE.',
      inputSchema: resolveScanStopSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await resolveScanStopHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // Tool: scan_captures  [WRITE — spends; stores, anchors, diffs]
  //
  // THE WALK — docs/gf-interaction-flows.md Phase 2 and Flow 3, WRITING since
  // refactor step 5: every outcome on the work-list row, the capture stored
  // and anchored on ACQUIRED, its diff written with the verdict.
  // -------------------------------------------------------------------------
  server.registerTool(
    'scan_captures',
    {
      description:
        'WALK A SURVEYED PAGE\'S CAPTURES IN DATE ORDER: this call fetches each capture\'s raw replay, ' +
        'derives its text under the rules in force for its date, compares it with its predecessor, runs ' +
        'every gate, and WRITES the outcome on the work-list row — IDENTICAL (the archive\'s digest equals ' +
        'the previous capture\'s: same bytes, nothing fetched), DUPLICATE (fetched; the text derived under ' +
        'the rules equals the predecessor\'s; nothing stored), UNSERVABLE (the archive refuses it durably), ' +
        'or ACQUIRED, on which the capture is stored, anchored on chain as it is stored (the anchor is ' +
        'awaited), and diffed against its predecessor with the classifier\'s verdict. A gate firing halts ' +
        'the chunk: the capture is held on its row as PENDING_JUDGEMENT with the stop\'s material, and the ' +
        'marking URL is returned. THE MARKING URL COMES WITH EVERY STOP AND IS AN ADDRESS, NOT AN ' +
        'INSTRUCTION: do not send the researcher to the page on seeing it. Read the rules first; marking is ' +
        'needed only if one of the researcher\'s answers turns out to be CORRECT, and only then does it come ' +
        'first. A stop with no CORRECT answer is resolved wholly in the chat with resolve_scan_stop, then ' +
        'call again — the held capture is acquired without re-running the gates. AFTER EVERY CALL, SHOW ' +
        'THE RETURN — the counts, `next`, and for a stop the gates that fired with the number of rules or ' +
        'lines under each; the material itself is read rule by rule below, never printed whole. A stale ' +
        'stored capture is re-derived: ' +
        'its previous text kept as a version (superseded) or its ruleset stamp moved (restamped). ' +
        'SPENDS one classifier call per acquired novel capture. `maxCaptures` is how many rows this ' +
        'call may walk; the walk resumes from where it got to. Refuses NOT_SURVEYED, INVALID_MAX_CAPTURES, ' +
        'ARCHIVE_UNAVAILABLE at the row the archive did not serve, REGISTRY_FROZEN when the registry is ' +
        'neither empty nor scheme-stamped at index 0 (nothing acquired), and CHAIN_UNAVAILABLE when the ' +
        'chain cannot be reached — everything before the halted row is kept. ' +
        'AT A STOP, DRIVE IT IN THE CHAT (flows Flow 2, amended 2026-09-08). "THE PREVIOUS CAPTURE" in every ' +
        'gate is the PREDECESSOR: the last ACQUIRED capture before this one — a DUPLICATE or IDENTICAL row ' +
        'between them is stepped over, so a count "on the predecessor" may name a capture two rows back. ' +
        'THE STOP\'S SHAPE FOLLOWS GATE 1. FIRST READ GATE 1. If it lists lines that ENTERED the text ' +
        '(`nowKept` non-empty), the stop\'s answer is CORRECT ON THE PAGE for the stop as a whole: name the ' +
        'elements by their first lines, hand over the marking URL, and make NO per-rule Gate 2 check — the ' +
        'marking is the covering, and the retry acquires the capture without re-running the gates. Gate 1\'s ' +
        'REMOVED side (kept before, removed now) is a rule taking article text: END it in the chat, or the ' +
        'researcher unmarks it on the page. The per-rule walk below applies whenever Gate 1 lists NO ' +
        'kept-side lines — Gate 1 quiet, or fired on its removed side alone, which is chat-shaped: each ' +
        'removed-side rule is END or CONTINUE in its own turn — ' +
        'the re-walk after the marking has already happened. THE GATES, IN WORDS — say the gate\'s sentence, ' +
        'never your own: GATE 0 — no human has approved any capture up to this date, the first calibration: ' +
        'the researcher opens the marking URL and marks. GATE 1 — a line of text changed sides against the ' +
        'predecessor, as above. GATE 2 — a rule that matched the predecessor matches nothing here: the ' +
        'element left the page or changed its class; the answers are CONTINUE, or CORRECT on the page if ' +
        'the element is still there unmarked — TRUST and END do not apply to a silent rule, and a Gate 2 ' +
        'rule goes in neither list. VERIFY WHICH before offering CONTINUE, never guess, in this order: (1) ' +
        'COVERED — some rule in force at this capture removes here the text the silent rule removed on the ' +
        'predecessor; look at the rules created against this capture first (get_article_rules, validFrom ' +
        'equal to it) and then at any other rule in force that matches here (lastMatched at or after this ' +
        'capture), reading get_rule_history on each; found → say "covered by <the rule>" and CONTINUE is ' +
        'verified. (2) NOT COVERED — then CONTINUE, and say why it is not a guess: the per-rule walk runs ' +
        'only when Gate 1 listed no kept-side lines, and Gate 1 lists every line that was removed on the ' +
        'predecessor and is kept here — so a silent rule\'s previous text is NOT on this capture\'s kept side, ' +
        'or Gate 1 would have named it. The element left the page, or its wording changed (a ticker, a ' +
        'related box, a headline list changes every capture, so a text match can only fail there), and ' +
        'either way nothing of it enters the article. CORRECT never comes from this branch; it comes from ' +
        'Gate 1\'s kept side, above. Never say the stop "needs marking" without a CORRECT from the ' +
        'researcher. GATE 4 — a rule not yet ' +
        'trusted removed text no human has seen: for each such rule, TRUST, CONTINUE without trust, or END. ' +
        'GATE 5 — the classifier judged this capture\'s diff not editorial: a symptom of furniture entering ' +
        'the text, so CORRECT on the page if there is, else CONTINUE; the verdict decides nothing. DIGEST — ' +
        'the bytes received do not match the archive index\'s digest for this capture: CONTINUE, or ' +
        'BAD_CAPTURE. FOR EACH RULE the material names, IN ITS OWN TURN: read get_rule_history; say the ' +
        'element in words — its tag and the first line it removed, never the selector as its name; then its ' +
        'history — created against which capture, matched since, trusted or not; then its removals VERBATIM — ' +
        '`removed` is the LINES the rule took, de-duplicated, at the same granularity Gate 4 shows them, ' +
        'and a menu or a sidebar is hundreds of them, so quote the FIRST 5 and offer the rest, never a ' +
        'summary in their place; for a Gate 4 rule ' +
        'name the never-seen lines from the stop\'s material first; then only the answers that apply to ITS ' +
        'gate, with what each means; then STOP and wait for the researcher\'s answer before the next rule. ' +
        'Never read several histories in one turn. After the last rule, record the whole stop with ONE ' +
        'resolve_scan_stop call; when one answer is CORRECT, MARKING COMES FIRST and the chat\'s decisions ' +
        'follow it, against the ruleset the marking left. Do not call scan_captures again until the ' +
        'researcher says so: each call may spend and may anchor. Decide nothing yourself: every answer here ' +
        'is the researcher\'s.',
      inputSchema: scanCapturesSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await scanCapturesHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // THE CORPUS READS — docs/gf-evidence-flows.md A4, evidence step 12.
  //
  // PUBLIC, AND IDENTICAL FOR EVERYONE. "PUBLIC reads take no identity and
  // answer identically for everyone. Access to a page's timeline is gated by
  // PUBLIC_PAGE for a caller without identity — that is ACCESS, not a second
  // behaviour: the output never depends on who asks." A page becomes public in
  // full, every capture and every diff, the moment a published thesis cites any
  // record of it; before that it is a researcher's working corpus and an
  // anonymous caller is refused NOT_PUBLIC.
  //
  // THE PUBLIC SURFACE IS THE CORPUS (§5). There is no public evidence surface
  // to replace: `search_evidence` ranked selections by an embedding of prose,
  // with everything unselected hidden, and it is retired. What an outsider reads
  // is the same timeline the researcher reads, which is what makes the corpus
  // the counterweight to a thesis's selection rather than a promise about one.
  // -------------------------------------------------------------------------
  server.registerTool(
    'list_findings',
    {
      description:
        'A PAGE\'S WHOLE TIMELINE, IN DATE ORDER — every archived capture this platform holds and ' +
        'every change between consecutive ones. Per capture: its 14-digit archive timestamp, the ' +
        'hash of its current extracted text, and its anchor — the SHA-256 of the bytes as served, ' +
        'with `attributed` saying whether the registry holds it under our registrar (TRUE, FALSE, ' +
        'or NULL meaning no anchor check has been stored — null is never "no"). Per change: the ' +
        'PAIR of captures it spans (never a date pair), the current version\'s computed chunks, ' +
        'whether a later capture now falls between the two (`narrowed`), and the promotion linkage ' +
        '— which theses cite it, PUBLISHED ones only, for every caller. Each entry also carries ' +
        '`fileHash`, the record\'s own name, which is what a thesis cites as #ev_<fileHash> whether ' +
        'or not anyone has promoted it. `opinion` IS A MODEL\'S OPINION AND IS SHOWN AS ONE: a ' +
        'separate object, null when nothing classified that derivation, never mixed into the ' +
        'computed chunks and never the ordering — significance is the classifier\'s judgement, the ' +
        'order is always chronological, and the researcher ranks. `awaitingDerivation` means the ' +
        'walk owes a re-derivation, NOT that nothing changed. THE ANSWER IS THE SAME FOR EVERYONE: ' +
        'this read has no second behaviour by identity. Writes nothing. Refuses NOT_SURVEYED and ' +
        'NOT_PUBLIC (no published thesis cites any record of this page).',
      inputSchema: listFindingsSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await listFindingsHandler(input) }],
    }),
  );

  server.registerTool(
    'get_diff_input',
    {
      description:
        'WHAT THE DIFFER AND THE CLASSIFIER WERE ACTUALLY GIVEN for one change: both captures\' ' +
        'current extracted text in full, and the current version\'s chunks with each chunk\'s ' +
        'survival verdict against the raw archived documents. NAMED BY THE PAIR — the two 14-digit ' +
        'wayback timestamps, never a date pair, because three captures on one day are three ' +
        'captures. Use it to check a change yourself rather than taking a summary for it. Writes ' +
        'nothing. Refuses NOT_SURVEYED, NOT_PUBLIC, NOT_A_CAPTURE (a date, or a timestamp this page ' +
        'holds no acquired capture for — the message says which), NO_SUCH_DIFF (two real captures ' +
        'the walk never diffed as a pair) and AWAITING_DERIVATION, which NAMES THE DIFF and means ' +
        'the walk owes a re-derivation — it is not a finding that nothing changed.',
      inputSchema: getDiffInputSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await getDiffInputHandler(input) }],
    }),
  );

  server.registerTool(
    'resolve_record',
    {
      description:
        'WHAT A CITATION POINTS AT. Given the name a thesis cites (#ev_<fileHash>), returns the ' +
        'corpus record it resolves to — a capture or a pair of captures, with its page and ' +
        'timestamps — whether the name is RECOMPUTABLE from that record, whether it is VERIFIED ' +
        '(every capture beneath it registered on chain under our registrar, with the anchored hash ' +
        'equal to the hash of the bytes as served) with the per-capture attribution behind that ' +
        'answer, and the PUBLISHED thesis versions that cite it — each with its text and with any ' +
        'FLAG the platform has since raised: the record was withdrawn, or its content moved and ' +
        'nobody has re-affirmed it. A published version is never edited and never unpublished by ' +
        'this platform; the flag is derived on every read and shown beside the citation. Reads the ' +
        'chain for the record\'s own captures and nothing else. Writes nothing. Refuses ' +
        'NOT_A_RECORD and NOT_PUBLIC.',
      inputSchema: resolveRecordSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await resolveRecordHandler(input) }],
    }),
  );

  server.registerTool(
    'check_on_chain_status',
    {
      description:
        'ASK THE REGISTRY ABOUT A CAPTURE — never about a thesis, an argument or an evidence row: ' +
        'the chain attests the corpus, and nothing above it is anchored. Give a page and a capture ' +
        '(url, capture), or a record name (fileHash), which answers about every capture beneath it. ' +
        'Per capture: whether the registry holds the SHA-256 of its bytes as served, at which ' +
        'index, submitted by whom, whether that submitter is our registrar (ATTRIBUTED), whether ' +
        'the hash the platform recorded as anchored is that same hash, and the last stored anchor ' +
        'check with its version and date. READ FROM CHAIN STATE, NEVER FROM A TRANSACTION RECEIPT: ' +
        'state answers forever, a receipt only inside the RPC\'s retention window. Reports the ' +
        'chain id and registry address it actually reached, so a wrong environment shows itself. ' +
        'Writes nothing. Refuses NOT_SURVEYED, NOT_PUBLIC, NOT_A_CAPTURE, NOT_A_RECORD and ' +
        'CHAIN_UNAVAILABLE — which is a verdict about the CHECK and is never evidence that a hash ' +
        'is unregistered.',
      inputSchema: checkOnChainStatusSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await checkOnChainStatusHandler(input) }],
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
  // -------------------------------------------------------------------------
  // get_environment
  //
  // Registered first among the verification tools because it is the call that
  // has to come first: nothing else here is meaningful until the caller knows
  // which environment answered it.
  // -------------------------------------------------------------------------
  server.tool(
    'get_environment',
    'Which environment is this — production or staging? Answers from the deployment\'s own ' +
      'configuration (APP_ENV, already validated at startup against the database it is actually ' +
      'connected to) cross-checked against the chain its evidence registry sits on. Call this ' +
      'FIRST, before any write: a connector name is a local label and proves nothing, and evidence ' +
      'counts or content hashes are checks with an expiry date. Takes no arguments. Writes nothing.',
    getEnvironmentSchema,
    async () => ({
      content: [{ type: 'text' as const, text: await getEnvironmentHandler() }],
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

  // -------------------------------------------------------------------------
  // THE DEBATE ON A CITATION — evidence step 13, docs/gf-evidence-flows.md §4
  // and A4, docs/gf-thesis-flows.md T3.
  //
  // "Why is this diff important? The question has no answer outside a claim
  // someone is trying to establish" — so a record is argued FOR A THESIS, on a
  // citation the thesis's text already carries, and the assessor judges whether
  // the researcher ARGUED, never whether they are right.
  // -------------------------------------------------------------------------
  server.registerTool(
    'open_debate',
    {
      description:
        'ARGUE FOR A CORPUS RECORD, FOR ONE THESIS. Give the thesis, the record — a page and one ' +
        '14-digit capture, or a page and the PAIR of captures a change spans, never a row id — and ' +
        'your rationale: what the record shows, why it carries the passage that cites it, and what ' +
        "would prove it wrong. THE CITATION COMES FIRST: the thesis's head version must already " +
        'mention the record (#ev_<fileHash>), or this refuses NOT_CITED — there is no promotion of a ' +
        'record no text cites. A PAID ASSESSOR then judges two separate things: SUBSTANCE, whether ' +
        'the argument can be checked at all, which is a hard gate; and MERIT, whether it agrees, ' +
        'which is ADVISORY — you may promote over its objection and the dissent is recorded beside ' +
        'the evidence forever. One OPEN debate per (thesis, record): calling again with a new ' +
        'rationale adds it to the same debate as a revision and re-assesses the accumulated ' +
        'argument. Refuses NO_RESEARCHER, REASON_REQUIRED, NO_THESIS, NOT_AUTHOR (a thesis has one ' +
        'author), NOT_SURVEYED, NOT_A_CAPTURE, NOT_ACQUIRED (naming the work-list outcome), ' +
        'NO_SUCH_DIFF, NOT_CITED, AWAITING_DERIVATION (naming the pair — the walk owes a version), ' +
        'CONTRADICTED (carrying the chunks the documents refute), NOTHING_TO_PROMOTE and NARROWED ' +
        '(naming the captures that now fall between the pair).',
      inputSchema: openDebateSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await openDebateHandler(input) }],
    }),
  );

  server.registerTool(
    'respond_in_debate',
    {
      description:
        'ANSWER THE ASSESSOR — as many rounds as it takes. Supply what its substance gaps asked for, ' +
        'or answer the objection it raised. A PAID call: it re-reads the ACCUMULATED argument, not ' +
        'your last message alone, so you need not repeat what you already quoted. An objection you ' +
        'have answered once no longer blocks promotion; one you never answer is carried on the ' +
        'record forever. Refuses NO_RESEARCHER, REASON_REQUIRED, SESSION_NOT_FOUND, NOT_AUTHOR and ' +
        'SESSION_CLOSED, plus every record refusal re-checked now — the corpus can move under an ' +
        'argument.',
      inputSchema: respondInDebateSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await respondInDebateHandler(input) }],
    }),
  );

  server.registerTool(
    'promote_from_debate',
    {
      description:
        'PROMOTE THE RECORD ON A CLEARED ARGUMENT — the act that makes a corpus record EVIDENCE: the ' +
        'record, marked, with who promoted it, when, and which version of its content they stood ' +
        'behind. Writes the evidence row on the FIRST cleared argument for a record and JOINS it on ' +
        'every later one, so a second thesis citing the same record argues its own case without ' +
        'creating a second row. NOTHING IS WRITTEN TO ANY CHAIN: the chain attests the corpus, the ' +
        'bytes were anchored when the capture was acquired, and nothing above the corpus is ' +
        'anchored. Refuses NO_RESEARCHER, SESSION_NOT_FOUND, NOT_AUTHOR, SESSION_CLOSED, NOT_READY ' +
        '(with blockedBy: NO_SUBSTANCE, OBJECTION_UNANSWERED), STALE_PIN (the citation pins a ' +
        "version that is no longer the record's current one — write a new version, which re-pins), " +
        'and every refusal of open_debate re-checked at this moment.',
      inputSchema: promoteFromDebateSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await promoteFromDebateHandler(input) }],
    }),
  );

  server.registerTool(
    'get_debate',
    {
      description:
        'READ ONE DEBATE: its record, its status, every turn in order — the rationales, the ' +
        "assessor's answers verbatim, the responses — whether SUBSTANCE cleared, the current " +
        'verdict, and whether it can promote yet with the list of what blocks it. Any researcher may ' +
        "read any thesis's debates: working state is gated from the public, not from colleagues. " +
        'Calls no model and writes nothing. Refuses NO_RESEARCHER and SESSION_NOT_FOUND.',
      inputSchema: getDebateSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await getDebateHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // THE REVIEW — evidence step 14, docs/gf-evidence-flows.md §6 (Flow E3).
  //
  // A re-walk moves a cited record's content and nothing is wrong yet: the old
  // version is kept and every citation still pins it. What is owed is a
  // judgement no pass can make — does the new version still support what the
  // thesis says — so the list is STOP-SHAPED and the decision is a researcher's.
  // NO AUTOMATIC RE-AFFIRMATION, EVER.
  // -------------------------------------------------------------------------
  server.registerTool(
    'list_evidence_reviews',
    {
      description:
        'WHAT YOU OWE: every promoted record whose content has MOVED off the version a human stood ' +
        'behind. Stop-shaped, like a walk stop — the count first, then one entry per record oldest ' +
        'first, each with the affirmed version beside the current one, WHAT MOVED between them ' +
        '(the chunks or segments that entered and left, computed by containment, no model), WHY it ' +
        'moved (a page decision with its researcher, a new extractor, or a new differ — all of them ' +
        'where more than one applies), every thesis whose head or published version cites it with ' +
        'whether that citation was argued, the narrower diffs where the pair is no longer the ' +
        "finest record, and TWO COMMANDS THAT PASTE AS WRITTEN. Records that cannot be judged are " +
        'NAMED in notEvaluable rather than dropped. An empty list is an answer: owed: 0 means ' +
        'nothing moved. Writes nothing and calls no model. Refuses NO_RESEARCHER and nothing else.',
      inputSchema: listEvidenceReviewsSchema,
    },
    async () => ({
      content: [{ type: 'text' as const, text: await listEvidenceReviewsHandler() }],
    }),
  );

  server.registerTool(
    'review_evidence',
    {
      description:
        'DECIDE ON A RECORD WHOSE CONTENT MOVED. REAFFIRM: the current version still carries every ' +
        'citing passage — the record now stands behind it, and its citations are NOT re-pinned by ' +
        'this act (re-pinning is a new thesis version, by the thesis\'s author, who may not be ' +
        'you). WITHDRAW: it no longer carries them, or never did; a reason is REQUIRED and every ' +
        'thesis citing it on a published version is FLAGGED from that moment — visibly, never ' +
        'unpublished by the platform. NOTHING IS DELETED: a withdrawn record keeps its name, its ' +
        'argument and its citations so a reader of the thesis that cited it can find out what ' +
        'happened, and nothing moves it back. ANY researcher may review ANY record. Paste the ' +
        'command from list_evidence_reviews — it carries expectedSequence, the compare-and-set on ' +
        "the record's review log. Refuses NO_RESEARCHER, REASON_REQUIRED, NOT_A_RECORD, " +
        'NOT_PROMOTED (naming whether it was never promoted or already withdrawn), ' +
        'AWAITING_DERIVATION, NOTHING_TO_REVIEW (REAFFIRM only — a WITHDRAW of a current record is ' +
        'allowed) and STALE_SEQUENCE.',
      inputSchema: reviewEvidenceSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await reviewEvidenceHandler(input) }],
    }),
  );

  // -------------------------------------------------------------------------
  // FRAMING — thesis step 19, docs/gf-thesis-flows.md T1 and A4 :1434–:1459.
  // The glasses go on before the thesis is written: a provision says what kind of
  // record demonstrates a violation, so it says what to look for before anything
  // is found.
  // -------------------------------------------------------------------------

  server.registerTool(
    'open_framing',
    {
      description:
        'OPEN A FRAMING — the question you want to establish, and the glasses you read the corpus ' +
        'through. Returns the framing and the PROVISION\'S REQUIRED ELEMENTS, each unfilled: what ' +
        'kind of record would demonstrate each part of the violation. A framing needs no thesis — ' +
        'open one before any thesis exists, or on an unpublished thesis of your own to re-frame it. ' +
        'Nothing opens and nothing closes: a framing with rounds and no choice is a discussion that ' +
        'ended without a decision, which is a legitimate record. Writes one row, spends nothing. ' +
        'Refuses NO_RESEARCHER, NO_THESIS, NOT_AUTHOR, NO_PROVISION_SHAPE, PUBLISHED (the thesis\'s ' +
        'head IS its published version — frame the next one) and NO_SUCH_RUN.',
      inputSchema: openFramingSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await openFramingHandler(input) }],
    }),
  );

  server.registerTool(
    'assess_framing',
    {
      description:
        'PROPOSE A FRAMING AND HAVE IT ARGUED WITH. PAID — one assessor call per round. Name the ' +
        'records you have been reading and the trajectories; the platform loads each one\'s CURRENT ' +
        'COMPUTED CONTENT — never a summary, never a classifier\'s opinion — records your proposal ' +
        'VERBATIM, and hands both to the assessor. EVERY ASSERTION IT MAKES IS THEN AUDITED ' +
        'MECHANICALLY, with no model: a contradiction quoting you is checked as a substring of what ' +
        'you actually wrote (quoteVerified), a phrase it attributes to a record is checked against ' +
        'that record\'s content (phraseVerified: PRESENT, ABSENT or UNCHECKED), and an element is ' +
        'filled only by a record you supplied. NOTHING IS DROPPED and nothing gates on a verdict: a ' +
        'contradiction that misquotes you is SHOWN, labelled. AN ELEMENT WITH NO RECORD BEHIND IT ' +
        'IS THE HONEST OUTPUT, not a failure — it becomes a FOIA target or a call item later. As ' +
        'many rounds as it takes; you stop. Refuses NO_RESEARCHER, NO_FRAMING, NOT_YOURS, ' +
        'NO_RECORDS, NOT_A_RECORD, NOT_ACQUIRED, AWAITING_DERIVATION (naming the diff) and ' +
        'UNKNOWN_TRAJECTORY_ID.',
      inputSchema: assessFramingSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await assessFramingHandler(input) }],
    }),
  );

  server.registerTool(
    'choose_framing',
    {
      description:
        'DECIDE THE FRAMING — IN YOUR OWN WORDS. The claim you record here is the sentence the ' +
        'thesis will argue and it is stored VERBATIM, because a version must restate it exactly for ' +
        'the publication gate to recognise it as framed. The choice is yours: it may be your ' +
        'framing, the assessor\'s, or a third. Record the element map as it stands, MISSING ' +
        'elements included — a thesis is opened with its gaps on record from its first day. Writes ' +
        'one row, spends nothing. Refuses NO_RESEARCHER, NO_FRAMING, NOT_YOURS, NOT_ASSESSED (no ' +
        'assessed round yet) and PROVISION_MISMATCH (the thesis this framing is attached to asserts ' +
        'another provision — a different provision is a different thesis).',
      inputSchema: chooseFramingSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await chooseFramingHandler(input) }],
    }),
  );

  server.registerTool(
    'get_framing',
    {
      description:
        'READ A FRAMING AND EVERY ROUND OF IT, in sequence, with every audit verdict beside its ' +
        'assertion, and the thesis it attaches to. ANY researcher may read ANY framing: working ' +
        'state is gated from the public, not from colleagues. A round whose stored content is ' +
        'malformed is reported AS MALFORMED, never as empty. Writes nothing, spends nothing. ' +
        'Refuses NO_FRAMING.',
      inputSchema: getFramingSchema,
    },
    async (input) => ({
      content: [{ type: 'text' as const, text: await getFramingHandler(input) }],
    }),
  );

  return server;
}
