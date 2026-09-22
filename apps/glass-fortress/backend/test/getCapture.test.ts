jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);
jest.mock('../src/middleware/supabaseAuth', () => (require('./helpers/gateDouble') as typeof import('./helpers/gateDouble')).supabaseAuthDouble);

import request from 'supertest';
import { getCaptureHandler } from '../src/mcp/tools/getCapture';
import { listFindingsHandler } from '../src/mcp/tools/listFindings';
import { BEFORE, PAGE, URL } from './helpers/corpusFixture';
import { resetDouble, store, written } from './helpers/evidenceDouble';
import { PAGE_3, appOf, seedCorpusWorld } from './helpers/routeWorld';
import { resetTools, tripped } from './thesis/tools';

// ---------------------------------------------------------------------------
// get_capture — ONE CAPTURE, WHOLE. docs/gf-evidence-flows.md A4 as ruled 2026-09-19 on the cold design
// review the researcher commissioned and accepted whole; docs/gf-ui-flows.md §26 clause (3); the UI plan's
// :555, this step's ONE declared exception to "frontend only".
//
// A NEW FILE, DELIBERATELY. The UI plan's KEEP list at :672–:673 is "every backend file", and this chunk's
// declared exception is the tool, its route and its core — not a licence to edit the route suite that was
// already there. New cases in a new file leave every existing backend path's `git diff` empty, which is what
// the KEEP sweep actually measures.
//
// THE PARITY CASE IS THE POINT OF THE DESIGN. A4 says this read answers "the row this clause already returns
// for it", so the row is asserted EQUAL to the one `list_findings` reports — not merely "shaped like" it. A
// case that checked the fields by name would pass two compositions that had drifted apart, which is the
// second-spelling defect the resource was chosen to avoid.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
  seedCorpusWorld();
});

const parse = (out: string): Record<string, unknown> => JSON.parse(out) as Record<string, unknown>;

async function get(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(await appOf()).get(path);
  return { status: res.status, body: res.body as Record<string, unknown> };
}

describe('get_capture — the row, plus the bytes', () => {
  it('G1 THE ROW IS `list_findings`\' OWN ROW, field for field — one composition, never a second spelling', async () => {
    const one = parse(await getCaptureHandler({ url: URL, capture: BEFORE.waybackTimestamp }));
    const timeline = parse(await listFindingsHandler({ url: URL }));
    const captures = timeline.captures as Record<string, unknown>[];

    // THE FLOOR: the page must hold more than one capture, or "this read answers ONE of them" is a claim
    // about a set with one member and the parity below could not tell the right row from the only row.
    expect(captures.length).toBeGreaterThanOrEqual(2);
    const mine = captures.find((row) => row.capture === BEFORE.waybackTimestamp);
    expect(mine).toBeDefined();

    // DEEP EQUALITY, not a field-by-field check: a field ADDED to the timeline's row and forgotten here
    // would pass any named-field assertion and is exactly the drift the one-composition rule forbids.
    expect(one.capture).toEqual(mine);
    // eslint-disable-next-line no-console
    console.log(`get_capture: the page holds ${String(captures.length)} captures; the row for ${BEFORE.waybackTimestamp} is equal to the timeline's, over ${String(Object.keys(mine ?? {}).length)} fields`);
  });

  it('G2 THE TEXT IS THE CAPTURE\'S CURRENT EXTRACTION, and the answer SAYS which extraction it gave', async () => {
    const one = parse(await getCaptureHandler({ url: URL, capture: BEFORE.waybackTimestamp }));
    const seeded = store.captures.find((c) => c.waybackTimestamp === BEFORE.waybackTimestamp);
    expect(typeof one.text).toBe('string');
    expect(one.text).toBe(seeded?.text);
    // A NON-EMPTY FLOOR: `toBe(seeded.text)` is satisfied by two empty strings, and a read that answered ''
    // for every capture would pass it. The bytes are the whole point of this tool.
    expect(String(one.text).length).toBeGreaterThan(0);
    expect(one.textHash).toBe(BEFORE.textHash);
    expect(one.current).toBe(true);
  });

  it('G3 `textHash` SELECTS THE PINNED EXTRACTION, and `current` says it is not the current one', async () => {
    // A SUPERSEDED extraction of the same capture — the shape `heldTextsFor` reads from `textVersion`, and
    // the reason `textHash` exists at all: a citation holds the text AT ITS PIN.
    const pinnedText = 'הפסקה כפי שהייתה בעת הציטוט';
    store.textVersions = [{ snapshotId: BEFORE.id, textHash: 'text-before-pinned', text: pinnedText }];

    const pinned = parse(await getCaptureHandler({ url: URL, capture: BEFORE.waybackTimestamp, textHash: 'text-before-pinned' }));
    expect(pinned.text).toBe(pinnedText);
    expect(pinned.textHash).toBe('text-before-pinned');
    expect(pinned.current).toBe(false);

    // AND THE TWO READS DIFFER, which is the property that makes the argument worth building: without it
    // this case would pass on a tool that ignored `textHash` and returned the current bytes every time.
    const current = parse(await getCaptureHandler({ url: URL, capture: BEFORE.waybackTimestamp }));
    expect(current.text).not.toBe(pinned.text);
  });

  it('G4 AN EXTRACTION THIS CAPTURE DOES NOT HOLD IS REFUSED — never answered with the current text', async () => {
    const out = parse(await getCaptureHandler({ url: URL, capture: BEFORE.waybackTimestamp, textHash: 'text-that-was-never-kept' }));
    expect(out.code).toBe('NOT_A_CAPTURE');
    expect(String(out.error)).toContain('text-that-was-never-kept');
    // THE FABRICATION GUARD: the refusal must not carry the bytes it declined to find.
    const seeded = store.captures.find((c) => c.waybackTimestamp === BEFORE.waybackTimestamp);
    expect(out.text).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain(String(seeded?.text));
  });

  it('G5 THE THREE REFUSALS A4 NAMES, and no fourth code is invented', async () => {
    const dated = parse(await getCaptureHandler({ url: URL, capture: '2020-12-09' }));
    expect(dated.code).toBe('NOT_A_CAPTURE');

    const unknown = parse(await getCaptureHandler({ url: URL, capture: '20191111111111' }));
    expect(unknown.code).toBe('NOT_A_CAPTURE');

    const missing = parse(await getCaptureHandler({ url: 'https://example.gov.il/never-surveyed', capture: BEFORE.waybackTimestamp }));
    expect(missing.code).toBe('NOT_SURVEYED');

    const closed = parse(await getCaptureHandler({ url: PAGE_3.url, capture: BEFORE.waybackTimestamp }));
    expect(closed.code).toBe('NOT_PUBLIC');

    // A FLOOR OVER THE CODE SET: every refusal this tool can answer is one of A4's three. A fourth code
    // would be a contract change, and it must not arrive unnoticed through a message nobody read.
    const codes = new Set([dated.code, unknown.code, missing.code, closed.code]);
    expect(codes.size).toBeGreaterThanOrEqual(3);
    for (const code of codes) expect(['NOT_SURVEYED', 'NOT_A_CAPTURE', 'NOT_PUBLIC']).toContain(code);
  });

  it('G6 IT WRITES NOTHING, ASKS NO MODEL — a public read of one row and one text', async () => {
    await getCaptureHandler({ url: URL, capture: BEFORE.waybackTimestamp });
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });
});

describe('GET /api/pages/:trackedUrlId/captures/:capture — the sibling of the chain route', () => {
  it('G7 THE ROUTE ANSWERS THE CORE, and `?textHash=` reaches it', async () => {
    const tool = parse(await getCaptureHandler({ url: URL, capture: BEFORE.waybackTimestamp }));
    const route = await get(`/api/pages/${PAGE.id}/captures/${BEFORE.waybackTimestamp}`);
    expect(route.status).toBe(200);
    expect(route.body).toEqual(tool);

    store.textVersions = [{ snapshotId: BEFORE.id, textHash: 'text-before-pinned', text: 'הפסקה כפי שהייתה בעת הציטוט' }];
    const pinned = await get(`/api/pages/${PAGE.id}/captures/${BEFORE.waybackTimestamp}?textHash=text-before-pinned`);
    expect(pinned.status).toBe(200);
    expect(pinned.body.textHash).toBe('text-before-pinned');
    expect(pinned.body.current).toBe(false);
  });

  it('G8 IT DID NOT SWALLOW THE CHAIN ROUTE — the deeper path still answers the chain, not this read', async () => {
    // Express matches in mount order and `/captures/:capture` is declared FIRST, so a `:capture` that
    // matched `<ts>/chain` would answer this read where the chain check belongs. What this case holds is
    // the deeper route still answering its own question: not a 404, no `text`, no `current`.
    const chain = await get(`/api/pages/${PAGE.id}/captures/${BEFORE.waybackTimestamp}/chain`);
    expect(chain.status).not.toBe(404);
    expect(chain.body.text).toBeUndefined();
    expect(Object.keys(chain.body)).not.toContain('current');
  });

  it('G9 A DATE WHERE A TIMESTAMP BELONGS IS THE 404 OF NOT_A_CAPTURE, never a 400; a page nobody opened is the ONE 404', async () => {
    const dated = await get(`/api/pages/${PAGE.id}/captures/2020-12-09`);
    expect(dated.status).toBe(404);

    const closed = await get(`/api/pages/${PAGE_3.id}/captures/${BEFORE.waybackTimestamp}`);
    expect(closed.status).toBe(404);
    // THE ONE 404 (§8, A2): a private page and a missing capture answer the SAME body, byte for byte, so a
    // reader cannot learn from the difference which pages are under investigation.
    expect(JSON.stringify(closed.body)).toBe(JSON.stringify(dated.body));
  });
});
