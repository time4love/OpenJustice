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
    for (const tool of ['get_research_agenda', 'run_ai_analysis']) {
      expect(WRITE_TOOLS.has(tool)).toBe(true);
    }
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

  it('keeps search_evidence open', () => {
    // Deliberate: it embeds a query and nothing more, it is the core public
    // read, and the anonymous ChatGPT integration depends on it. Asserted so
    // that a future tightening pass has to make that trade-off consciously.
    expect(READ_TOOLS.has('search_evidence')).toBe(true);
    expect(WRITE_TOOLS.has('search_evidence')).toBe(false);
  });
});
