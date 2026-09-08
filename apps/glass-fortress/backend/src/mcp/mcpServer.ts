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

  return server;
}
