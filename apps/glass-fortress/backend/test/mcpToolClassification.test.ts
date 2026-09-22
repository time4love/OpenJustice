import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The route module transitively loads the MCP SDK, which ships ESM that ts-jest
// cannot parse — the same reason every other test in this suite stubs it. These
// stubs exist only so the READ_TOOLS/WRITE_TOOLS sets can be imported; nothing
// below exercises the transport or the server.
jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class {
    async handleRequest(): Promise<void> {}
    async close(): Promise<void> {}
  },
}));
jest.mock('../src/mcp/mcpServer', () => ({
  createMcpServer: () => ({ connect: async (): Promise<void> => {} }),
}));
jest.mock('../src/lib/prisma', () => ({ prisma: {} }));
jest.mock('../src/oauth/oidcProvider', () => ({ oidcProvider: {} }));

import { READ_TOOLS, WRITE_TOOLS } from '../src/mcp/mcpRoutes';

// ---------------------------------------------------------------------------
// Every MCP tool must be classified exactly once — gated or open.
//
// This exists because the classification used to live in three places that
// could not see each other: the WRITE_TOOLS set the auth gate actually reads,
// and two hand-maintained literal arrays in GET /api/mcp that advertise the
// tool list. They had already drifted by 2026-08-21 — a paid tool was in
// none of them, so it ran unauthenticated while not appearing in the endpoint's
// own inventory. It embeds its topic and then runs a long-context LLM call, so
// the one tool missing from the list was the most expensive anonymous path in
// the backend.
//
// Fixing that instance would not have prevented the next one. This does: a tool
// added to the server and left unclassified fails here, and so does a tool
// listed in both sets or in neither.
// ---------------------------------------------------------------------------

/**
 * Reads the registered tool names out of mcpServer.ts itself.
 *
 * Deliberately static rather than importing createMcpServer(): the MCP SDK
 * pulls in an ESM-only dependency that ts-jest cannot parse, which is why no
 * test in this suite loads it. Parsing the registration site keeps the guard
 * without dragging the SDK — and the names are what is being checked, not the
 * server's behaviour.
 *
 * Fails loudly if the pattern stops matching. A silent zero would make every
 * assertion below vacuously true, which is worse than no test at all.
 */
export function registeredToolNamesIn(source: string): string[] {
  // BOTH SPELLINGS. `server.tool()` is deprecated in the SDK and `registerTool`
  // is its replacement; the two coexist while the 47 older registrations are
  // migrated separately. A regex written for one would make every tool in the
  // other style INVISIBLE HERE — the guard would keep passing while new tools
  // arrived unclassified, which is precisely the failure it was written for, in
  // its most convincing disguise: a green test.
  const names = [...source.matchAll(/server\.(?:tool|registerTool)\(\s*'([a-z_]+)'/g)].map(
    (m) => m[1],
  );

  if (names.length === 0) {
    throw new Error(
      'Found no server.tool()/server.registerTool() registrations in mcpServer.ts — the ' +
        'registration style changed. Fix this helper rather than deleting the test: without it ' +
        'nothing checks that a new tool has been classified as gated or open.',
    );
  }
  return [...new Set(names)].sort();
}

function registeredToolNames(): string[] {
  return registeredToolNamesIn(readFileSync(join(__dirname, '../src/mcp/mcpServer.ts'), 'utf8'));
}

describe('the registry scan sees every registration style', () => {
  // Broadening a guard is where a guard quietly stops guarding, so the
  // broadening is checked directly. A style this misses does not fail loudly —
  // it reports fewer tools and passes.
  it('finds a tool registered with the deprecated tool()', () => {
    expect(registeredToolNamesIn("server.tool(\n    'old_style',")).toEqual(['old_style']);
  });

  it('finds a tool registered with registerTool()', () => {
    expect(registeredToolNamesIn("server.registerTool(\n    'new_style',")).toEqual(['new_style']);
  });

  it('throws rather than reporting nothing when the style changes again', () => {
    expect(() => registeredToolNamesIn('server.addTool("x")')).toThrow(/registration style changed/);
  });
});

describe('MCP tool classification', () => {
  const registered = registeredToolNames();

  it('reads the registry at all', () => {
    expect(registered.length).toBeGreaterThan(0);
  });

  it('classifies every registered tool exactly once', () => {
    const unclassified = registered.filter((t) => !READ_TOOLS.has(t) && !WRITE_TOOLS.has(t));

    expect(unclassified).toEqual([]);
  });

  it('never classifies a tool as both gated and open', () => {
    const both = [...WRITE_TOOLS].filter((t) => READ_TOOLS.has(t));

    expect(both).toEqual([]);
  });

  it('classifies nothing that is not actually registered', () => {
    // A stale entry is the quieter half of drift: it makes the advertised tool
    // list claim capabilities the server does not have.
    const known = new Set(registered);
    const phantom = [...READ_TOOLS, ...WRITE_TOOLS].filter((t) => !known.has(t));

    expect(phantom).toEqual([]);
  });

  it('gates the tools that spend money', () => {
    // Named explicitly rather than derived, so that moving any of these back to
    // the open set is a deliberate edit to this list with a test failure to
    // explain. Each embeds input and then invokes an LLM.
    // `get_research_agenda` and `run_ai_analysis` left the surface in the thesis
    // half of the legacy switch (thesis A4 retires both). `scan_captures` is one
    // classifier call per novel capture that reaches Gate 5.
    //
    // `assess_framing` ADDED AT THESIS STEP 19 — one framing-assessor call per
    // round, and the thesis layer's first paid point. Its AUTHORITY is thesis A4
    // :1442, which marks the tool "WRITE · paid", with thesis refactor plan §7
    // ("the MCP surface is exactly A4's, and mcpToolClassification agrees").
    //
    // `run_analysis` and `draft_foia_request` ADDED AT THESIS STEP 22 — one critic call and one drafter call. Their
    // AUTHORITY is thesis A4 :1481 ("WRITE · paid") and :1496 ("GATED · paid"), never this comment.
    //
    // `check_publication_readiness` and `publish_thesis` ADDED AT THESIS STEP 23 — one publication-assessor call each.
    // Their AUTHORITY is thesis A4 :1506 ("GATED · paid iff rationale") and :1510 ("WRITE · paid"), never this comment.
    //
    // `open_debate` and `respond_in_debate` ADDED 2026-09-15 (#454) — each ends in one promotion-assessor call
    // (`assessAndRecord`, `services/respondInDebate.ts`), and both were gated with no case holding them there. Their
    // AUTHORITY is evidence A4 :1117 and :1129 ("WRITE"), whose `does` sends the argument to the ASSESSOR; unlike
    // thesis A4, evidence A4 carries no "paid" marker on either line.
    const ungated = [
      'scan_captures',
      'assess_framing',
      'run_analysis',
      'draft_foia_request',
      'check_publication_readiness',
      'publish_thesis',
      'open_debate',
      'respond_in_debate',
    ].filter((tool) => !WRITE_TOOLS.has(tool));
    // Collected rather than asserted in a loop, so a failure NAMES the paid tool that lost its gate.
    expect(ungated).toEqual([]);
  });

  it('gates the tools that persist rows on an otherwise read-shaped call', () => {
    // get_claim_trajectories reads like a read: deterministic string search over
    // already-stored snapshot text, no LLM, no RPC, no chain. It sat in
    // READ_TOOLS on exactly that reasoning, and was correct until detection
    // became stored state — after which a cache MISS inserts a
    // ClaimTrajectoryComputation and its ClaimTrajectory rows. An unauthenticated
    // caller could write to the database.
    //
    // The suites above could not catch it. They assert every tool is classified
    // exactly once and never in both sets; none of them asks whether a
    // classification still describes what the tool DOES. The behaviour changed
    // under a classification that did not, which is the drift this file exists
    // to prevent, arriving in a shape it does not inspect.
    //
    // This assertion is the narrow fix: the general one is a review question, not
    // a test. Ask what a tool spends AND what it writes, every time either changes.
    expect(WRITE_TOOLS.has('get_claim_trajectories')).toBe(true);
    expect(READ_TOOLS.has('get_claim_trajectories')).toBe(false);
  });

  // THE `search_evidence` CASE WENT WITH THE TOOL AT EVIDENCE STEP 11a.
  // It held the tool open deliberately, for the anonymous ChatGPT integration.
  // Evidence flows §5 retires the tool itself: an evidence surface ranked by an
  // embedding of prose, over a row that now carries no prose. The public read is
  // the CORPUS — `list_findings`, `resolve_record`, `verify_claim_text` — and the
  // trade-off this case existed to keep conscious is made there, at step 12.
});

// ---------------------------------------------------------------------------
// THE SURFACE IS EXACTLY THE DESIGNS' — thesis refactor plan step 25's remainder and §7 ("the MCP surface is exactly
// A4's, and mcpToolClassification agrees").
//
// The cases above hold that every registered tool is classified once; none of them holds WHICH tools are registered. A
// tool registered with no design naming it passes them all, and so does a designed tool that silently left the server.
// This list is that expected set, each name beside the design line that makes it a tool. It MOVES at every step that
// registers or retires a tool — document refactor plan step 36 asserts it "equal A4's surface exactly" once documents
// land — so a registration without a design line, or a retirement without a list edit, fails here by name.
//
// The authorities are the tool-contract appendices: interaction flows A5 (the corpus, the walk, the marking), evidence
// flows A4, thesis flows A4 — and ui flows §6.1, the three corpus-wide reads that amend evidence A4 (UI-2, 2026-09-15).
// Tools a design names but that are not built yet — document flows A4's, and `run_prosecutor`
// ("later", thesis A4 :1527) — are NOT on the list: they join it at the step that registers them.
// ---------------------------------------------------------------------------

/** Every tool the server registers today, and the design line that names it. The list is the spec; the comment is not. */
const DESIGNED_SURFACE: Readonly<Record<string, string>> = {
  // interaction flows A5 — the corpus, the walk, the marking
  survey_wayback_captures: 'interaction A5 :1075',
  scan_captures: 'interaction A5 :1090',
  approve_article_rules: 'interaction A5 :1141',
  resolve_scan_stop: 'interaction A5 :1164',
  reset_article_calibration: 'interaction A5 :1190',
  get_article_rules: 'interaction A5 :1199',
  list_captures: 'interaction A5 :1208',
  get_rule_history: 'interaction A5 :1214',
  list_pages: 'interaction A5 :1071 (2026-09-14)',
  // evidence flows A4
  list_findings: 'evidence A4 :1080',
  // Ruled 2026-09-19 on the cold design review the researcher accepted whole — a RESOURCE beside
  // list_findings, never an optional argument on it. The surface moves 45 -> 46, declared (UI plan :555).
  get_capture: 'evidence A4 :1082',
  get_diff_input: 'evidence A4 :1095',
  verify_claim_text: 'evidence A4 :1101',
  get_claim_trajectories: 'evidence A4 :1103',
  resolve_record: 'evidence A4 :1105',
  check_on_chain_status: 'evidence A4 :1111',
  // ui flows §6.1 — the corpus across pages (UI-2)
  list_corpus: 'ui flows §6.1 :236',
  list_trajectories: 'ui flows §6.1 :244',
  search_corpus: 'ui flows §6.1 :248',
  open_debate: 'evidence A4 :1117',
  respond_in_debate: 'evidence A4 :1129',
  promote_from_debate: 'evidence A4 :1132',
  get_debate: 'evidence A4 :1144',
  list_evidence_reviews: 'evidence A4 :1146',
  review_evidence: 'evidence A4 :1154',
  // thesis flows A4
  list_theses: 'thesis A4 :1426',
  list_framings: 'thesis A4 :1432 (2026-09-14)',
  open_framing: 'thesis A4 :1434',
  assess_framing: 'thesis A4 :1442',
  choose_framing: 'thesis A4 :1452',
  get_framing: 'thesis A4 :1458',
  create_thesis: 'thesis A4 :1461',
  add_thesis_version: 'thesis A4 :1468',
  get_thesis_context: 'thesis A4 :1476',
  run_analysis: 'thesis A4 :1481',
  decide_gap: 'thesis A4 :1488',
  draft_foia_request: 'thesis A4 :1496',
  get_whistleblower_call: 'thesis A4 :1501',
  check_publication_readiness: 'thesis A4 :1506',
  publish_thesis: 'thesis A4 :1510',
  unpublish_thesis: 'thesis A4 :1516',
  add_note: 'thesis A4 :1520',
  list_thesis_reviews: 'thesis A4 :1523',
  audit_thesis_claims: 'thesis A4 :1529 (unchanged)',
  get_thesis_trajectory_citations: 'thesis A4 :1529 (unchanged)',
  // No tool contract: the environment's identity, which every write is checked against before it is made — CLAUDE.md
  // ("Identify the environment"), named as the acceptance read by evidence flows :670 and :739.
  get_environment: 'CLAUDE.md; evidence flows :670, :739',
};

/** Names registered with no design line, and designed names not registered — both empty, or the surface drifted. */
function surfaceDrift(registered: readonly string[], designed: readonly string[]): { undesigned: string[]; unregistered: string[] } {
  const reg = new Set(registered);
  const des = new Set(designed);
  return {
    undesigned: registered.filter((t) => !des.has(t)).sort(),
    unregistered: designed.filter((t) => !reg.has(t)).sort(),
  };
}

describe('the MCP surface is exactly the designs\' — thesis refactor plan step 25, §7', () => {
  it('registers exactly the designed tools: none without a design line, none designed and missing', () => {
    expect(surfaceDrift(registeredToolNames(), Object.keys(DESIGNED_SURFACE))).toEqual({ undesigned: [], unregistered: [] });
  });

  it('DETECTS both halves of drift — a tool registered with no design line, and a designed tool left unregistered', () => {
    expect(surfaceDrift(['a', 'b', 'extra'], ['a', 'b'])).toEqual({ undesigned: ['extra'], unregistered: [] });
    expect(surfaceDrift(['a'], ['a', 'gone'])).toEqual({ undesigned: [], unregistered: ['gone'] });
  });
});
