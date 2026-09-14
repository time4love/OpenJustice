import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MCP_INSTRUCTIONS } from '../src/mcp/instructions';
import { PROVISIONS } from '../src/lib/provisions';
import { registeredToolNamesIn } from './mcpToolClassification.test';

// ---------------------------------------------------------------------------
// THE CONNECTOR'S INSTRUCTIONS NAME THE SURFACE AS IT IS — no more, no less.
//
// `src/mcp/instructions.ts` is the one place the order of the flows is told to
// the model (thesis flows §2: Claude "holds the protocol"). Two drifts would make
// it lie, and each is this repository's named defect shape arriving in prose:
//
//   a tool NAMED but not REGISTERED  — a retired or renamed tool kept alive as a
//                                      promise the surface does not keep (the
//                                      retired-names scan's second half, evidence
//                                      A7, for a string no scan reads)
//   a tool REGISTERED but not NAMED  — a tool the model meets with no idea when
//                                      to reach for it, which is the gap these
//                                      instructions exist to close
//
// So the two sets are held EQUAL, both ways. A tool added at thesis step 20 fails
// here until the flow map places it; a tool unregistered at a switch fails here
// until the map lets it go. Names are read from the registration site exactly as
// `mcpToolClassification` reads them, never from the SDK (which ts-jest cannot
// load) and never from a second list.
//
// THE EXTRACTOR IS ITSELF TESTED, with a decoy each way, because a scan that
// matches nothing passes vacuously (refactor plan §4).
// ---------------------------------------------------------------------------

/**
 * Every snake_case word in the text — the shape every tool on this surface has and
 * no English word does. Lowercase only: an enum value (NUREMBERG_1, BAD_CAPTURE)
 * or a refusal code (NO_THESIS) is uppercase and is not a tool.
 */
export function toolNamesMentionedIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)].map((m) => m[0]))].sort();
}

const backend = join(__dirname, '..');
const serverSource = readFileSync(join(backend, 'src/mcp/mcpServer.ts'), 'utf8');
const instructionsSource = readFileSync(join(backend, 'src/mcp/instructions.ts'), 'utf8');

describe('the tool-name extractor sees what it scans for', () => {
  it('finds a snake_case tool name inside prose', () => {
    expect(toolNamesMentionedIn('call get_environment first, then list_findings.')).toEqual([
      'get_environment',
      'list_findings',
    ]);
  });

  it('would catch a retired tool kept alive in prose', () => {
    // The decoy: a name the surface no longer has. If the extractor cannot see
    // it, the equality below is a comparison against nothing.
    expect(toolNamesMentionedIn('then assess_thesis_framing judges it')).toEqual(['assess_thesis_framing']);
  });

  it('ignores uppercase enum values, refusal codes and plain words', () => {
    expect(toolNamesMentionedIn('NUREMBERG_1 · BAD_CAPTURE · NO_THESIS · a byte-distinct count')).toEqual([]);
  });
});

describe('the connector instructions and the registered surface are the same set', () => {
  const registered = registeredToolNamesIn(serverSource);
  const named = toolNamesMentionedIn(MCP_INSTRUCTIONS);

  it('reads both at all', () => {
    expect(registered.length).toBeGreaterThan(0);
    expect(named.length).toBeGreaterThan(0);
  });

  it('names no tool the server does not register', () => {
    const known = new Set(registered);
    expect(named.filter((t) => !known.has(t))).toEqual([]);
  });

  it('places every registered tool in a flow', () => {
    const placed = new Set(named);
    expect(registered.filter((t) => !placed.has(t))).toEqual([]);
  });
});

describe('the instructions reach the server, and from one pure module', () => {
  it('createMcpServer passes MCP_INSTRUCTIONS as the instructions option', () => {
    // Read from the source because the SDK cannot be loaded under ts-jest. The
    // option name is the SDK's (ServerOptions.instructions); a rename there
    // would surface here as a silent drop of the whole string.
    expect(serverSource).toMatch(/\{\s*instructions:\s*MCP_INSTRUCTIONS\s*\}/);
  });

  it('the instructions module imports the provision table and nothing else', () => {
    // A pure module never gains a dependency (the researcher, 2026-09-11) — and
    // lib/provisions is itself pure. The string must be readable by this test and
    // by the tutorial without a database, a model or the SDK behind it.
    const imports = [...instructionsSource.matchAll(/^\s*import .* from '([^']+)';/gm)].map((m) => m[1]);
    expect(imports).toEqual(['../lib/provisions']);
  });

  it('names every provision and every element the table knows — derived, so a new row appears unedited', () => {
    // The researcher, 2026-09-13: Article 1 is the table's first row and the
    // worked example, never the platform's scope. The list in the text is built
    // from PROVISIONS at load; this holds that the build happened and that the
    // prose gloss of each element still names it.
    for (const [provision, shape] of Object.entries(PROVISIONS)) {
      expect(MCP_INSTRUCTIONS).toContain(provision);
      expect(MCP_INSTRUCTIONS).toContain(shape.title);
      for (const [element, means] of Object.entries(shape.elements)) {
        expect(MCP_INSTRUCTIONS).toContain(element);
        expect(MCP_INSTRUCTIONS).toContain(means);
      }
    }
  });

  it('registers the probe PROMPT and RESOURCE, each returning the same string', () => {
    // 2026-09-13: claude.ai does not surface `instructions`; a prompt and a
    // resource are the two other primitives that could carry "start here". They
    // exist to be OBSERVED in a live conversation. Held here so that removing
    // them is a deliberate edit with a failure to explain, and so that neither
    // ever returns a second spelling of the text.
    const prompt = serverSource.match(/registerPrompt\(\s*'start_here'[\s\S]*?\n  \);/);
    const resource = serverSource.match(/registerResource\(\s*'platform-protocol'[\s\S]*?\n  \);/);
    expect(prompt?.[0]).toMatch(/text: MCP_INSTRUCTIONS/);
    expect(resource?.[0]).toMatch(/text: MCP_INSTRUCTIONS/);
  });

  it('states its one limit with the step that lifts it', () => {
    // The paragraph that names tools with no path today is edited when that
    // path lands; the step number is how the editor finds it.
    expect(instructionsSource).toMatch(/Edit this paragraph at steps 22 and 23/);
  });
});
