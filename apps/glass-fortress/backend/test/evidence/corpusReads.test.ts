jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => ({
  getResearcherId: (): string | null => identity.researcherId,
}));
jest.mock('../../src/factories/LLMFactory', () => ({
  LLMFactory: new Proxy<Record<string, unknown>>({}, { get: (_f, member) => (): never => { throw new Error(`LLMFactory.${String(member)} — no model in UI-2's path`); } }),
  resolveModelId: (): never => { throw new Error('resolveModelId — no model in UI-2\'s path'); },
}));
jest.mock('../../src/lib/archiveHttp', () => ({
  ...(jest.requireActual('../../src/lib/archiveHttp') as object),
  fetchCaptureHtml: jest.fn(),
}));
jest.mock('axios');

import axios from 'axios';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { recordId } from '../../src/lib/evidenceIdentity';
import { fetchCaptureHtml } from '../../src/lib/archiveHttp';
import { normaliseClaim } from '../../src/lib/normalise';
import { getClaimTrajectoriesHandler } from '../../src/mcp/tools/getClaimTrajectories';
import { listFindingsHandler } from '../../src/mcp/tools/listFindings';
import { listPagesHandler } from '../../src/mcp/tools/listPages';
import { verifyClaimTextHandler } from '../../src/mcp/tools/verifyClaimText';
import { claimHash, computeSourceStateHash, DETECTION_VERSION, presencePatternHash, type Observation } from '../../src/services/claimTrajectory';
import { DIFF_VERSION } from '../../src/lib/diffVersion';
import { AFTER, BEFORE, BETWEEN, CHUNKS, CURRENT_VERSION, DIFF_NAME, DIFF_ROW, PAGE, URL, WHOLE_CLASSIFICATION } from '../helpers/corpusFixture';
import { asked, resetDouble, store, windows, written, type Row } from '../helpers/evidenceDouble';
import { load } from '../thesis/absent';
import type { ExportContract } from '../thesis/contract';
import { delegatesCalled } from '../thesis/tools';

// ---------------------------------------------------------------------------
// THE CORPUS ACROSS PAGES — docs/gf-ui-flows.md §6.1 :226–:257 (`list_corpus`, `list_trajectories`, `search_corpus`),
// §28 :746–:753 (the `pages` facet), §9 :348–:349 and §31 :797–:798 (the two instruments), A4 :1036–:1048; evidence A4
// :1074–:1077 ("the output never depends on who asks") and :1081–:1103 (the per-page rows); docs/gf-ui-refactor-plan.md
// UI-2 :145–:218. WRITTEN FIRST, FROM THE CONTRACT, RED BY NAME until UI-2's chunk 3 builds the modules (refactor plan
// §4 rule 4) — each unbuilt module is reached through `test/thesis/absent.ts`' loader with the owner "UI-2", so a case
// fails on its own with "not built — UI-2 builds it" and never as a file-level TS2307.
//
// `scope` DECIDES, NEVER IDENTITY. `public` answers over PUBLIC_PAGE pages and reads no caller — the bytes are the same
// anonymous and signed in (C1); a named page not opened is NOT_PUBLIC from a researcher's bearer too (R4; plan UI-2
// :167–:168). `all` refuses NO_RESEARCHER without one, before any query (R1), and answers over every surveyed page.
//
// ONE LOADER, THREE CALLERS (plan :178–:183): the per-page reads are UNCHANGED and each is the corpus read at one page —
// `one-page-is-the-corpus-at-one-page` (C6, T3, S3) holds equal rows against the KEEP tools, which are imported here
// literally because they exist. `pages-facet-equals-scope` (C7) holds the facet to PUBLIC_PAGE's set and to `list_pages`'.
//
// THE WORLD IS TWO PAGES AND A THIRD HOLDING NOTHING (the R52 sketch §d1, §e2): PAGE opened by a published thesis —
// through the REAL `publicPage`, an evidence row on its diff and a mention on a version with a PUBLISHED attempt — beside
// PAGE_2, surveyed and cited by nobody, and PAGE_3, surveyed with no capture and no detection pass. Timestamps
// interleave across the pages, so TIMESTAMP order across pages is never store order. No model is reached; the
// archive is never fetched by the corpus reads (`fetchCaptureHtml` and the CDX client are mocked and asserted uncalled)
// — it is fetched by `verify_claim_text` alone, in S3, and answers HTML that CONTAINS the phrase, so the raw half would
// read true and the STORED register is what decides (ruled 2026-09-15, q2 (a)).
// ---------------------------------------------------------------------------

const identity: { researcherId: string | null } = { researcherId: null };
const RESEARCHER = 'researcher-1';
const actAs = (id: string | null): void => {
  identity.researcherId = id;
};

// --- the modules UI-2 builds, by path and export --------------------------------------------------------------------

const fn: ExportContract = { step: 0, kind: 'function' };
const table: ExportContract = { step: 0, kind: 'table' };
const value: ExportContract = { step: 0, kind: 'value' };

const UI2_MODULES = {
  'mcp/tools/listCorpus': { listCorpusHandler: fn, listCorpusSchema: table },
  'mcp/tools/listTrajectories': { listTrajectoriesHandler: fn, listTrajectoriesSchema: table },
  'mcp/tools/searchCorpus': { searchCorpusHandler: fn, searchCorpusSchema: table },
  'services/corpusReads': {
    loadCorpus: fn,
    pagesInScope: fn,
    captureRow: fn,
    diffRow: fn,
    trajectoryFindings: fn,
    leftAt: fn,
    encodeCursor: fn,
    decodeCursor: fn,
    CORPUS_READ_LIMIT: value,
    CORPUS_CURSOR_KEYS: table,
    TRAJECTORY_CURSOR_KEYS: table,
  },
} as const;

type Handler = (input: Readonly<Record<string, unknown>>) => Promise<string>;
type ToolModule = { handler: Handler; schema: Record<string, z.ZodTypeAny> };
type ToolName = 'list_corpus' | 'list_trajectories' | 'search_corpus';

const TOOL_MODULES: Readonly<Record<ToolName, keyof typeof UI2_MODULES>> = {
  list_corpus: 'mcp/tools/listCorpus',
  list_trajectories: 'mcp/tools/listTrajectories',
  search_corpus: 'mcp/tools/searchCorpus',
};

/** A tool's handler and schema, by the exports the table names — red by name until UI-2 builds the module. */
async function tool(name: ToolName): Promise<ToolModule> {
  const module = TOOL_MODULES[name];
  const exports = UI2_MODULES[module];
  const [handlerName, schemaName] = Object.keys(exports);
  const loaded = await load<Record<string, unknown>>(module, 0, exports, 'UI-2');
  return { handler: loaded[String(handlerName)] as Handler, schema: loaded[String(schemaName)] as Record<string, z.ZodTypeAny> };
}

/** One call as `researcher` (null: no one), the answer parsed — a throw fails the case in these words. */
async function run(name: ToolName, input: Readonly<Record<string, unknown>>, researcher: string | null): Promise<unknown> {
  const { handler } = await tool(name);
  actAs(researcher);
  try {
    return JSON.parse(await handler(input)) as unknown;
  } catch (err) {
    throw new Error(`${name} THREW — every refusal is a JSON { error, code }, never a throw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const obj = (v: unknown): Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`not an object: ${JSON.stringify(v)}`);
  return v as Record<string, unknown>;
};
const arr = (v: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(v)) throw new Error(`not a list: ${JSON.stringify(v)}`);
  return v.map(obj);
};
const answer = (v: unknown): Record<string, unknown> => {
  const o = obj(v);
  if ('code' in o) throw new Error(`a REFUSAL where an answer was owed: ${JSON.stringify(o)}`);
  return o;
};
/** An entry with `kind` and `page` removed — what the per-page tool answers at one page. */
const strip = ({ kind: _kind, page: _page, ...rest }: Record<string, unknown>): Record<string, unknown> => rest;
const instantOf = (e: Record<string, unknown>): string => String(e['kind'] === 'DIFF' ? e['after'] : e['capture']);

// --- the world: two pages and a third holding nothing ---------------------------------------------------------------

const PAGE_2 = { id: 'page-2', url: 'https://news.walla.co.il/item/3500001' };
const PAGE_3 = { id: 'page-3', url: 'https://news.walla.co.il/item/3600001' };
const PHRASE = 'דיווח על תופעות לוואי';
const WITH = `הקישור ל${PHRASE} מופיע בעמוד הזה.`;
const WITHOUT = 'העמוד אינו מזכיר את הקישור כלל.';
const hash = (seed: string): string => createHash('sha256').update(seed).digest('hex');

interface Capture {
  id: string;
  waybackTimestamp: string;
  snapshotDate: string;
  textHash: string;
  textExtractionVersion: string;
  documentHash: string;
  anchoredHash: string;
}

const capture = (id: string, waybackTimestamp: string, snapshotDate: string, seed: string): Capture => ({
  id,
  waybackTimestamp,
  snapshotDate,
  textHash: `text-${id}`,
  textExtractionVersion: 'v3-extractor',
  documentHash: hash(seed),
  anchoredHash: hash(seed),
});

const P2A = capture('snap-p2-a', '20210301120000', '2021-03-01', 'p2-a-bytes');
const P2B = capture('snap-p2-b', '20210901120000', '2021-09-01', 'p2-b-bytes');
const P2C = capture('snap-p2-c', '20211201120000', '2021-12-01', 'p2-c-bytes');

/** A capture as the corpus fixture's rows are, on its page, with the text the STORED register holds for it. */
const held = (page: { id: string; url: string }, c: Capture, text: string): Row => ({ ...c, text, trackedUrlId: page.id, trackedUrl: page });

const P2_DIFF: Row = {
  id: 'diff-p2',
  trackedUrlId: PAGE_2.id,
  beforeSnapshot: P2A,
  afterSnapshot: P2B,
  contentVersions: [{ ...CURRENT_VERSION, contentVersionHash: 'content-p2' }],
};
const P2_DIFF_NAME = recordId({
  kind: 'DIFF',
  url: PAGE_2.url,
  before: { waybackTimestamp: P2A.waybackTimestamp, documentHash: P2A.documentHash },
  after: { waybackTimestamp: P2B.waybackTimestamp, documentHash: P2B.documentHash },
});

/** The state a page is in, as `loadDetectionInputs` hashes it (services/claimTrajectory.ts :472–:485): its timestamps in order, its CURRENT chunks' claims. */
const stateOf = (timestamps: readonly string[]): string =>
  computeSourceStateHash({
    waybackTimestamps: timestamps,
    candidateHashes: [...new Set(CHUNKS.map((c) => claimHash(normaliseClaim(c.text))))],
    detectionVersion: DETECTION_VERSION,
  });

interface Seen {
  c: Capture;
  present: boolean;
}
const observations = (url: string, seen: readonly Seen[]): Observation[] =>
  seen.map(({ c, present }) => ({ snapshotDate: c.snapshotDate, waybackTimestamp: c.waybackTimestamp, snapshotUrl: `https://web.archive.org/web/${c.waybackTimestamp}/${url}`, present }));

/** THE PRESENCE VECTORS the three claims trace — PA and P2 share `101`, so one pattern hash appears on two pages; the page id keeps them apart. */
const SEEN = {
  PA: [{ c: BEFORE, present: true }, { c: BETWEEN, present: false }, { c: AFTER, present: true }],
  PB: [{ c: BEFORE, present: false }, { c: BETWEEN, present: true }, { c: AFTER, present: false }],
  P2: [{ c: P2A, present: true }, { c: P2B, present: false }, { c: P2C, present: true }],
} as const satisfies Record<string, readonly Seen[]>;

/** A group's identity as the stored read COMPUTES it — `presencePatternHash` over the presence vector, never a column (services/claimTrajectory.ts :953–:975). */
const patternOf = (page: { url: string }, seen: readonly Seen[]): string => presencePatternHash(observations(page.url, seen));
const PATTERN = { PA: patternOf(PAGE, SEEN.PA), PB: patternOf(PAGE, SEEN.PB), P2: patternOf(PAGE_2, SEEN.P2) };

const trajectory = (id: string, page: { id: string; url: string }, computationId: string, claimText: string, seen: readonly Seen[]): Row => {
  const present = seen.filter((s) => s.present);
  return {
    id,
    computationId,
    trackedUrlId: page.id,
    claimHash: claimHash(normaliseClaim(claimText)),
    claimText,
    observations: JSON.stringify(observations(page.url, seen)),
    transitions: seen.filter((s, i) => i > 0 && s.present !== seen[i - 1]?.present).length,
    firstSeen: present.at(0)?.c.snapshotDate ?? '',
    lastSeen: present.at(-1)?.c.snapshotDate ?? '',
    finalState: seen.at(-1)?.present === true ? 'PRESENT' : 'REMOVED',
  };
};

/** The three claims and when each LEFT: PA left at BETWEEN, PB at AFTER, P2 at P2B — latest first is P2 · PB · PA. */
const LEFT = { PA: BETWEEN.waybackTimestamp, PB: AFTER.waybackTimestamp, P2: P2B.waybackTimestamp } as const;

function seedTwoPages(): void {
  store.pages = [PAGE, PAGE_2, PAGE_3];
  // PAGE: the corpus fixture's two captures with the third between them (§7's NARROWED), the pair spanning the two.
  store.captures = [
    held(PAGE, BEFORE, WITH),
    held(PAGE, BETWEEN, WITHOUT),
    held(PAGE, AFTER, WITH),
    held(PAGE_2, P2A, WITH),
    held(PAGE_2, P2B, WITHOUT),
    held(PAGE_2, P2C, WITHOUT),
  ];
  store.diffs = [{ ...DIFF_ROW, trackedUrlId: PAGE.id }, P2_DIFF];
  // PAGE IS OPENED THROUGH THE REAL PREDICATE: an evidence row on its diff, cited by a version with a PUBLISHED attempt.
  store.evidenceRows = [
    {
      fileHash: DIFF_NAME,
      kind: 'DIFF',
      status: 'PROMOTED',
      affirmedContentVersionHash: CURRENT_VERSION.contentVersionHash,
      snapshot: null,
      urlVersionDiff: { ...DIFF_ROW, trackedUrlId: PAGE.id },
    },
  ];
  store.mentions = [
    { id: 'mention-1', versionId: 'version-1', kind: 'EVIDENCE', name: DIFF_NAME, thesisVersion: { thesisId: 'thesis-1', isPublished: { id: 'thesis-1' } } },
  ];
  store.attempts = [{ id: 'attempt-1', versionId: 'version-1', outcome: 'PUBLISHED' }];
  // The stored detection passes — one per page that has one, keyed on the state the fixture is in.
  store.computations = [
    {
      id: 'computation-p1',
      trackedUrlId: PAGE.id,
      sourceStateHash: stateOf([BEFORE.waybackTimestamp, BETWEEN.waybackTimestamp, AFTER.waybackTimestamp]),
      detectionVersion: DETECTION_VERSION,
      computedAt: new Date('2026-09-01T00:00:00.000Z'),
      snapshotsExamined: 3,
      candidatesConsidered: 2,
      candidatesUnmatched: 0,
      candidatesDerivative: 0,
    },
    {
      id: 'computation-p2',
      trackedUrlId: PAGE_2.id,
      sourceStateHash: stateOf([P2A.waybackTimestamp, P2B.waybackTimestamp, P2C.waybackTimestamp]),
      detectionVersion: DETECTION_VERSION,
      computedAt: new Date('2026-09-02T00:00:00.000Z'),
      snapshotsExamined: 3,
      candidatesConsidered: 2,
      candidatesUnmatched: 0,
      candidatesDerivative: 0,
    },
  ];
  store.trajectories = [
    trajectory('trajectory-pa', PAGE, 'computation-p1', 'הטענה הראשונה על העמוד', SEEN.PA),
    trajectory('trajectory-pb', PAGE, 'computation-p1', 'הטענה השנייה על העמוד', SEEN.PB),
    trajectory('trajectory-p2', PAGE_2, 'computation-p2', 'הטענה על העמוד השני', SEEN.P2),
  ];
}

beforeEach(() => {
  resetDouble();
  actAs(null);
  (fetchCaptureHtml as jest.Mock).mockResolvedValue(`<html><body><p>${PHRASE}</p></body></html>`);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// --- the refusals, one table over the three tools --------------------------------------------------------------------

/** The least input each tool takes at a scope, so a refusal cannot be an argument's in disguise. */
const AT = (name: ToolName, scope: 'public' | 'all', more: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> =>
  name === 'search_corpus' ? { scope, phrase: PHRASE, ...more } : { scope, ...more };

function expectRefusal(out: unknown, code: string): void {
  expect(out).toEqual({ error: expect.stringMatching(/\S/) as unknown, code });
  expect(written).toEqual([]);
}

describe.each<ToolName>(['list_corpus', 'list_trajectories', 'search_corpus'])('%s — the refusals of §6.1 :242–:252, in order (R1–R5)', (name) => {
  it(`R1 ${name} refuses NO_RESEARCHER — scope all with no identity, before any query (asked and every delegate empty)`, async () => {
    seedTwoPages();
    expectRefusal(await run(name, AT(name, 'all'), null), 'NO_RESEARCHER');
    expect(asked).toEqual([]);
    expect(delegatesCalled()).toEqual([]);
  });

  it(`R2 ${name} refuses INVALID_RANGE — since after until, before any query`, async () => {
    seedTwoPages();
    expectRefusal(await run(name, AT(name, 'public', { since: '2021-06-30', until: '2021-01-01' }), RESEARCHER), 'INVALID_RANGE');
    expect(asked).toEqual([]);
    expect(delegatesCalled()).toEqual([]);
  });

  it(`R3 ${name} refuses NOT_SURVEYED — page names no surveyed page`, async () => {
    seedTwoPages();
    expectRefusal(await run(name, AT(name, 'all', { page: 'https://news.walla.co.il/item/9999999' }), RESEARCHER), 'NOT_SURVEYED');
  });

  it(`R4 ${name} refuses NOT_PUBLIC at scope public for a surveyed page no published thesis cites — from a researcher's bearer too (plan UI-2 :167)`, async () => {
    seedTwoPages();
    expectRefusal(await run(name, AT(name, 'public', { page: PAGE_2.url }), RESEARCHER), 'NOT_PUBLIC');
    expectRefusal(await run(name, AT(name, 'public', { page: PAGE_2.url }), null), 'NOT_PUBLIC');
  });

  it(`R5 ${name} answers the same private page at scope all to a researcher, its page marked public: false`, async () => {
    seedTwoPages();
    const out = answer(await run(name, AT(name, 'all', { page: PAGE_2.url }), RESEARCHER));
    const pages = arr(out['entries']).map((e) => e['page']);
    expect(pages.length).toBeGreaterThan(0);
    expect(new Set(pages.map((p) => JSON.stringify(p)))).toEqual(new Set([JSON.stringify({ trackedUrlId: PAGE_2.id, url: PAGE_2.url, public: false })]));
  });
});

// --- list_corpus ------------------------------------------------------------------------------------------------------

describe('list_corpus — §6.1 :236–:243, §28 :746–:753, A4 :1081–:1091 (UI-2)', () => {
  /** The eight entries at `all`, in the order §6.1 :239 and §24 :682 give them: timestamp across pages, CAPTURE before DIFF at one instant. */
  const ORDER_AT_ALL = [
    ['CAPTURE', BEFORE.waybackTimestamp, PAGE.id],
    ['CAPTURE', BETWEEN.waybackTimestamp, PAGE.id],
    ['CAPTURE', P2A.waybackTimestamp, PAGE_2.id],
    ['CAPTURE', AFTER.waybackTimestamp, PAGE.id],
    ['DIFF', AFTER.waybackTimestamp, PAGE.id],
    ['CAPTURE', P2B.waybackTimestamp, PAGE_2.id],
    ['DIFF', P2B.waybackTimestamp, PAGE_2.id],
    ['CAPTURE', P2C.waybackTimestamp, PAGE_2.id],
  ];
  const shapeOf = (e: Record<string, unknown>): unknown[] => [e['kind'], instantOf(e), obj(e['page'])['trackedUrlId']];

  it('C1 list_corpus at scope public reads no caller: the bytes anonymous and as a researcher are identical, over the opened page alone', async () => {
    seedTwoPages();
    const { handler } = await tool('list_corpus');
    actAs(null);
    const anonymous = await handler({ scope: 'public' });
    actAs(RESEARCHER);
    const signedIn = await handler({ scope: 'public' });
    expect(signedIn).toBe(anonymous);
    const entries = arr(answer(JSON.parse(anonymous))['entries']);
    expect(entries.map(shapeOf)).toEqual(ORDER_AT_ALL.filter(([, , page]) => page === PAGE.id));
    expect(entries.every((e) => obj(e['page'])['public'] === true)).toBe(true);
  });

  it('C2 list_corpus: TIMESTAMP order across pages, oldest first; at one instant CAPTURE before DIFF; then page url — not store order', async () => {
    seedTwoPages();
    // Store order is page by page; the answer interleaves.
    const entries = arr(answer(await run('list_corpus', { scope: 'all' }, RESEARCHER))['entries']);
    expect(entries.map(shapeOf)).toEqual(ORDER_AT_ALL);
  });

  it('C2b list_corpus: two pages at ONE instant — CAPTURE before DIFF, then the page url, code units (the declared tie-break)', async () => {
    seedTwoPages();
    // A PAGE_2 capture at exactly PAGE's AFTER instant, scoped to this case: the two captures precede PAGE's diff at
    // that instant, and PAGE's url sorts before PAGE_2's.
    store.captures.push(held(PAGE_2, capture('snap-p2-tie', AFTER.waybackTimestamp, AFTER.snapshotDate, 'p2-tie-bytes'), WITHOUT));
    const entries = arr(answer(await run('list_corpus', { scope: 'all', since: AFTER.snapshotDate, until: AFTER.snapshotDate }, RESEARCHER))['entries']);
    expect(entries.map(shapeOf)).toEqual([
      ['CAPTURE', AFTER.waybackTimestamp, PAGE.id],
      ['CAPTURE', AFTER.waybackTimestamp, PAGE_2.id],
      ['DIFF', AFTER.waybackTimestamp, PAGE.id],
    ]);
  });

  it("C3 list_corpus: every entry is list_findings' capture row or diff row plus kind and page { trackedUrlId, url, public }", async () => {
    seedTwoPages();
    const entries = arr(answer(await run('list_corpus', { scope: 'all' }, RESEARCHER))['entries']);
    const findings = answer(JSON.parse(await listFindingsHandler({ url: URL })));
    const captureKeys = Object.keys(arr(findings['captures'])[0] ?? {}).sort();
    const diffKeys = Object.keys(arr(findings['diffs'])[0] ?? {}).sort();
    for (const entry of entries) {
      expect(Object.keys(obj(entry['page'])).sort()).toEqual(['public', 'trackedUrlId', 'url']);
      const rest = Object.keys(strip(entry)).sort();
      expect([entry['kind'], rest]).toEqual([entry['kind'], entry['kind'] === 'CAPTURE' ? captureKeys : diffKeys]);
    }
  });

  it('C4 list_corpus: kind keeps one kind; cited keeps evidence ≠ null; page keeps one page; since/until keep by day, a diff by its after — each filter dropping something', async () => {
    seedTwoPages();
    const at = async (more: Record<string, unknown>): Promise<unknown[][]> =>
      arr(answer(await run('list_corpus', { scope: 'all', ...more }, RESEARCHER))['entries']).map(shapeOf);
    expect(await at({ kind: 'CAPTURE' })).toEqual(ORDER_AT_ALL.filter(([kind]) => kind === 'CAPTURE'));
    expect(await at({ kind: 'DIFF' })).toEqual(ORDER_AT_ALL.filter(([kind]) => kind === 'DIFF'));
    // The one entry carrying `evidence`: PAGE's diff, the evidence row (A4 :1089).
    expect(await at({ cited: true })).toEqual([['DIFF', AFTER.waybackTimestamp, PAGE.id]]);
    expect(await at({ page: PAGE_2.url })).toEqual(ORDER_AT_ALL.filter(([, , page]) => page === PAGE_2.id));
    // The range keeps four of eight: PAGE's BETWEEN (on the `since` day), PAGE_2's first capture, PAGE's AFTER and the
    // diff ending at it; it drops PAGE's BEFORE, PAGE_2's later two captures and PAGE_2's diff (its `after` is 2021-09-01).
    expect(await at({ since: '2021-01-01', until: '2021-06-30' })).toEqual([
      ['CAPTURE', BETWEEN.waybackTimestamp, PAGE.id],
      ['CAPTURE', P2A.waybackTimestamp, PAGE_2.id],
      ['CAPTURE', AFTER.waybackTimestamp, PAGE.id],
      ['DIFF', AFTER.waybackTimestamp, PAGE.id],
    ]);
  });

  it("C4b list_corpus: until equal to a held capture's day KEEPS that capture — 2021-06-12 keeps 20210612183110 and the diff ending at it; since equal to it keeps them too", async () => {
    seedTwoPages();
    const at = async (more: Record<string, unknown>): Promise<unknown[][]> =>
      arr(answer(await run('list_corpus', { scope: 'all', ...more }, RESEARCHER))['entries']).map(shapeOf);
    expect(await at({ until: '2021-06-12' })).toEqual(ORDER_AT_ALL.slice(0, 5));
    expect(await at({ since: '2021-06-12' })).toEqual(ORDER_AT_ALL.slice(3));
  });

  it('C5 list_corpus: limit 2 walks the whole list through nextCursor with no gap and no repeat, null at the end; the facet identical on every page; a limit above CORPUS_READ_LIMIT and another read’s cursor are schema rejections', async () => {
    seedTwoPages();
    const { schema } = await tool('list_corpus');
    const walked: unknown[][] = [];
    const facets = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const out = answer(await run('list_corpus', { scope: 'all', limit: 2, ...(cursor === null ? {} : { cursor }) }, RESEARCHER));
      walked.push(...arr(out['entries']).map(shapeOf));
      facets.add(JSON.stringify(out['pages']));
      cursor = out['nextCursor'] === null ? null : String(out['nextCursor']);
      pages += 1;
    } while (cursor !== null && pages < 20);
    expect(walked).toEqual(ORDER_AT_ALL);
    expect(pages).toBe(4);
    expect(facets.size).toBe(1);

    const corpusReads = await load<{ CORPUS_READ_LIMIT: number }>('services/corpusReads', 0, { CORPUS_READ_LIMIT: value }, 'UI-2');
    expect(z.object(schema).safeParse({ scope: 'public', limit: corpusReads.CORPUS_READ_LIMIT + 1 }).success).toBe(false);
    expect(z.object(schema).safeParse({ scope: 'public', limit: corpusReads.CORPUS_READ_LIMIT }).success).toBe(true);
    // ANOTHER READ'S CURSOR: a list_trajectories cursor is not a list_corpus cursor (the R52 sketch §6-D21).
    const trajectories = answer(await run('list_trajectories', { scope: 'all', limit: 1 }, RESEARCHER));
    expect(typeof trajectories['nextCursor']).toBe('string');
    expect(z.object(schema).safeParse({ scope: 'public', cursor: trajectories['nextCursor'] }).success).toBe(false);
    expect(z.object(schema).safeParse({ scope: 'public', cursor: 'not-a-cursor' }).success).toBe(false);
  });

  it('C6 one-page-is-the-corpus-at-one-page — list_findings(url).captures and .diffs equal list_corpus({ page: url }).entries with kind and page stripped, split by kind and in order: the public page at public, the private page at all', async () => {
    seedTwoPages();
    // A row `loadCaptures` FILTERS — no archive timestamp, so no CAPTURE_ID (A1) — on the page: a corpus loader with a
    // query of its own beside `loadCaptures` would list it, and the equality would say so.
    store.captures.push({ ...capture('snap-doc', '', '2021-02-01', 'doc-bytes'), waybackTimestamp: null, text: WITHOUT, trackedUrlId: PAGE.id, trackedUrl: PAGE });
    for (const [page, scope, researcher] of [
      [PAGE, 'public', null],
      [PAGE_2, 'all', RESEARCHER],
    ] as const) {
      actAs(researcher);
      const findings = answer(JSON.parse(await listFindingsHandler({ url: page.url })));
      const entries = arr(answer(await run('list_corpus', { scope, page: page.url }, researcher))['entries']);
      expect(entries.filter((e) => e['kind'] === 'CAPTURE').map(strip)).toEqual(findings['captures']);
      expect(entries.filter((e) => e['kind'] === 'DIFF').map(strip)).toEqual(findings['diffs']);
      expect(entries.length).toBeGreaterThan(0);
    }
  });

  it("C7 pages-facet-equals-scope — at public exactly PUBLIC_PAGE's set, public: true on each; at all list_pages' set (three pages), public true/false/false", async () => {
    seedTwoPages();
    const facetAt = async (scope: 'public' | 'all', researcher: string | null): Promise<[string, unknown][]> =>
      arr(answer(await run('list_corpus', { scope }, researcher))['pages'])
        .map((p): [string, unknown] => [String(p['url']), p['public']])
        .sort();
    expect(await facetAt('public', null)).toEqual([[URL, true]]);
    actAs(RESEARCHER);
    const listed = arr(JSON.parse(await listPagesHandler()))
      .map((p) => String(p['url']))
      .sort();
    expect(listed).toEqual([URL, PAGE_2.url, PAGE_3.url].sort());
    expect(await facetAt('all', RESEARCHER)).toEqual([
      [URL, true],
      [PAGE_2.url, false],
      [PAGE_3.url, false],
    ]);
  });

  it("C8 list_corpus: the facet's first/last are the page's held span and entries its count, unfiltered by since or page; a page holding nothing has entries 0 and nulls", async () => {
    seedTwoPages();
    const expected = [
      { trackedUrlId: PAGE.id, url: URL, public: true, first: BEFORE.waybackTimestamp, last: AFTER.waybackTimestamp, entries: 4 },
      { trackedUrlId: PAGE_2.id, url: PAGE_2.url, public: false, first: P2A.waybackTimestamp, last: P2C.waybackTimestamp, entries: 4 },
      { trackedUrlId: PAGE_3.id, url: PAGE_3.url, public: false, first: null, last: null, entries: 0 },
    ];
    // `shape` IS THE ONE FIELD OF THIS FACET THAT A NAMED PAGE CHANGES (§24 region 3, ruled 2026-09-21), so it is
    // held by the SH cases below and stripped here rather than folded into this one — which keeps C8's subject the
    // sentence its name makes: first, last and entries are the page's own under every filter.
    const withoutShape = ({ shape: _shape, ...rest }: Record<string, unknown>): Record<string, unknown> => rest;
    for (const more of [{}, { page: PAGE_2.url }, { since: '2021-06-01', until: '2021-06-30' }, { kind: 'DIFF' }]) {
      expect(arr(answer(await run('list_corpus', { scope: 'all', ...more }, RESEARCHER))['pages']).map(withoutShape)).toEqual(expected);
    }
  });

  it('C9 list_corpus writes nothing, opens no transaction, calls no model and never fetches the archive', async () => {
    seedTwoPages();
    await run('list_corpus', { scope: 'all' }, RESEARCHER);
    await run('list_corpus', { scope: 'public' }, null);
    expect(written).toEqual([]);
    expect(windows).toEqual([]);
    expect(fetchCaptureHtml).not.toHaveBeenCalled();
    expect(jest.mocked(axios).get).not.toHaveBeenCalled();
  });
});


// --- THE PAGE'S SHAPE — §24 region 3, RULED 2026-09-21 (the researcher) -----------------------------------------------

/**
 * A PAGE WHOSE BINS ANSWER EVERY RULING OF REGION 3, and every one of them is a fact about the real corpus rather
 * than a shape invented for a case: two captures on ONE day (the strip's unit is the day), three diffs sharing ONE
 * day pair at 50 · 52 · 52 chunks (May's three, which is where the SUM was measured to invent a magnitude no change
 * has), a bin every diff of which the classifier judged insignificant, a bin whose diff carries NO opinion, and a
 * pair still AWAITING DERIVATION.
 */
const SHAPE_PAGE = { id: 'page-shape', url: 'https://www.gov.il/he/departments/news/shape' };

const S_A1 = capture('snap-a1', '20220103090000', '2022-01-03', 'a1-bytes');
const S_A2 = capture('snap-a2', '20220103140000', '2022-01-03', 'a2-bytes');
const S_B1 = capture('snap-b1', '20220501080000', '2022-05-01', 'b1-bytes');
const S_B2 = capture('snap-b2', '20220501170000', '2022-05-01', 'b2-bytes');
const S_C1 = capture('snap-c1', '20220620120000', '2022-06-20', 'c1-bytes');
const S_D1 = capture('snap-d1', '20220810120000', '2022-08-10', 'd1-bytes');
const S_E1 = capture('snap-e1', '20220905120000', '2022-09-05', 'e1-bytes');

/** COMPUTED, never typed — this is the one capture of the world that carries its own `evidence` (ruling (c)). */
const A2_NAME = recordId({
  kind: 'CAPTURE',
  url: SHAPE_PAGE.url,
  capture: { waybackTimestamp: S_A2.waybackTimestamp, documentHash: S_A2.documentHash },
});

/** A whole classification at a chosen verdict — every key of CLASSIFICATION_KEYS, so the reader reads it rather than throwing on a HALF row. */
const verdict = (legallySignificant: boolean, categories: readonly string[]): Record<string, unknown> => ({
  ...WHOLE_CLASSIFICATION,
  isLegallySignificant: legallySignificant,
  investigativeCategories: [...categories],
});

const chunksOfSize = (n: number, seed: string): Record<string, unknown>[] =>
  Array.from({ length: n }, (_, i) => ({ side: i % 2 === 0 ? 'REMOVED' : 'ADDED', text: `${seed}-${String(i)}`, survival: 'SURVIVES' }));

/** A pair of the shape page. `chunks` null is the pair the walk owes a version — AWAITING DERIVATION, a STATE and not an error. */
const shapeDiff = (
  id: string,
  before: Capture,
  after: Capture,
  chunks: Record<string, unknown>[] | null,
  classification: Record<string, unknown> | null,
): Row => ({
  id,
  trackedUrlId: SHAPE_PAGE.id,
  beforeSnapshot: before,
  afterSnapshot: after,
  contentVersions:
    chunks === null
      ? []
      : [
          {
            contentVersionHash: `content-${id}`,
            // CURRENT is three equalities (evidence A3): both endpoints' text hashes and DIFF_VERSION. A fixture
            // that got one wrong would make every diff of this page AWAITING DERIVATION and the case vacuous.
            beforeTextHash: before.textHash,
            afterTextHash: after.textHash,
            diffVersion: DIFF_VERSION,
            chunks,
            classification,
            survivalVersion: 'v1-survival',
          },
        ],
});

function seedShapePage(): void {
  store.pages = [SHAPE_PAGE, PAGE_2];
  store.captures = [
    held(SHAPE_PAGE, S_A1, WITH),
    held(SHAPE_PAGE, S_A2, WITH),
    held(SHAPE_PAGE, S_B1, WITHOUT),
    held(SHAPE_PAGE, S_B2, WITHOUT),
    held(SHAPE_PAGE, S_C1, WITHOUT),
    held(SHAPE_PAGE, S_D1, WITHOUT),
    held(SHAPE_PAGE, S_E1, WITHOUT),
    held(PAGE_2, P2A, WITH),
    held(PAGE_2, P2B, WITHOUT),
  ];
  store.diffs = [
    // ONE DAY PAIR, THREE DIFFS — 50 · 52 · 52. The third is flagged by its CATEGORIES ALONE, with
    // `isLegallySignificant: false`, so a gate that read only the stored flag would answer false here.
    shapeDiff('diff-a1-b1', S_A1, S_B1, chunksOfSize(50, 'a1b1'), verdict(false, [])),
    shapeDiff('diff-a1-b2', S_A1, S_B2, chunksOfSize(52, 'a1b2'), verdict(false, [])),
    shapeDiff('diff-a2-b1', S_A2, S_B1, chunksOfSize(52, 'a2b1'), verdict(false, ['SAFETY_CLAIM_ALTERATION'])),
    // A BIN EVERY DIFF OF WHICH THE CLASSIFIER JUDGED INSIGNIFICANT — what makes the `passed` cases non-vacuous.
    shapeDiff('diff-b2-c1', S_B2, S_C1, chunksOfSize(3, 'b2c1'), verdict(false, [])),
    // NO OPINION AT ALL: a derived version the classifier never spoke on.
    shapeDiff('diff-c1-d1', S_C1, S_D1, chunksOfSize(7, 'c1d1'), null),
    // TWO DIFFS LEAVING THE SAME DAY FOR DIFFERENT DAYS — this pair is NARROWED by S_D1 sitting between its
    // endpoints (§7), which is an ordinary shape of the real corpus and the one the bin's KEY depends on. Without
    // it no two diffs of this world share a `before` day, so a bin keyed on `before` alone answers identically
    // and the key is held by nothing. Its opinion is flagged by the FLAG with EMPTY categories — the one arm of
    // the gate the shape world did not otherwise exercise.
    shapeDiff('diff-c1-e1', S_C1, S_E1, chunksOfSize(11, 'c1e1'), verdict(true, [])),
    // AWAITING DERIVATION: the walk owes this pair a version.
    shapeDiff('diff-d1-e1', S_D1, S_E1, null, null),
  ];
  // The one cited capture — an Evidence row under the capture's own name is what `evidence ≠ null` reads (ruling (c)).
  store.evidenceRows = [{ fileHash: A2_NAME, kind: 'CAPTURE', status: 'PROMOTED', affirmedContentVersionHash: null, snapshot: null, urlVersionDiff: null }];
}

/** The shape this page HAS, written out once — days, counts, the MAX chunk count, and the two ANY flags. */
const SHAPE = {
  captures: [
    // ONE BIN for two captures 5 hours apart (the unit is the day), RINGED because ONE of the two is cited.
    { day: '20220103', count: 2, cited: true },
    { day: '20220501', count: 2, cited: false },
    { day: '20220620', count: 1, cited: false },
    { day: '20220810', count: 1, cited: false },
    { day: '20220905', count: 1, cited: false },
  ],
  diffs: [
    // 52, THE GROUP'S LARGEST — never 154, which is what summing 50 + 52 + 52 would draw.
    { before: '20220103', after: '20220501', count: 3, chunks: 52, passed: true },
    { before: '20220501', after: '20220620', count: 1, chunks: 3, passed: false },
    { before: '20220620', after: '20220810', count: 1, chunks: 7, passed: true },
    // SAME `before` AS THE ROW ABOVE, DIFFERENT `after` — two bins, never one.
    { before: '20220620', after: '20220905', count: 1, chunks: 11, passed: true },
    { before: '20220810', after: '20220905', count: 1, chunks: 0, passed: true },
  ],
};

describe("list_corpus — the `pages` facet's `shape` (§24 region 3, ruled 2026-09-21; rulings (b)–(g) of :758)", () => {
  beforeEach(seedShapePage);

  /** The facet row of one page from a read at `all`, as the researcher. */
  const facetRow = async (id: string, more: Readonly<Record<string, unknown>> = {}): Promise<Record<string, unknown>> => {
    const rows = arr(answer(await run('list_corpus', { scope: 'all', ...more }, RESEARCHER))['pages']);
    const row = rows.find((p) => p['trackedUrlId'] === id);
    if (row === undefined) throw new Error(`no facet row for ${id} — the read answered ${JSON.stringify(rows.map((p) => p['trackedUrlId']))}`);
    return row;
  };
  const shapeOfRead = async (more: Readonly<Record<string, unknown>> = {}): Promise<unknown> =>
    (await facetRow(SHAPE_PAGE.id, { page: SHAPE_PAGE.url, ...more }))['shape'];

  /**
   * One diff bin, BY ITS PAIR and never by its index. The cases below first read `bins[2]` and `bins[3]`, and
   * adding one row to the world moved what those meant — an assertion that still passed while naming a different
   * subject. A bin's identity is the pair, so that is what a case asks for.
   */
  const binFor = async (before: string, after: string): Promise<Record<string, unknown>> => {
    const bins = arr(obj(await shapeOfRead())['diffs']);
    const bin = bins.find((b) => b['before'] === before && b['after'] === after);
    if (bin === undefined) throw new Error(`no diff bin ${before}→${after} — the shape holds ${JSON.stringify(bins.map((b) => [b['before'], b['after']]))}`);
    return bin;
  };

  it('SH1 the shape is the PAGE\'s and never the FILTER\'s — kind, cited and a since/until window return a byte-identical shape, and it is the unfiltered read\'s', async () => {
    // THE CASE THE DEFECT FAILED. Measured on staging 2026-09-21: `?page=<corona>` drew 16 dots and 16 bars,
    // `&kind=CAPTURE` the same card line over 16 dots and NO bars, `&kind=DIFF&cited=1` over an empty strip —
    // one element contradicting itself, because the strip came from the filtered array and the line from the facet.
    const whole = JSON.stringify(await shapeOfRead());
    expect(whole).toBe(JSON.stringify(SHAPE));
    for (const filter of [{ kind: 'CAPTURE' }, { kind: 'DIFF' }, { cited: true }, { kind: 'DIFF', cited: true }, { since: '2022-05-01', until: '2022-05-31' }]) {
      expect([filter, JSON.stringify(await shapeOfRead(filter))]).toEqual([filter, whole]);
    }
    // …and the filters really do narrow what the read RETURNS, so the equality above is not equality of two empties.
    const entriesOf = async (more: Readonly<Record<string, unknown>>): Promise<number> =>
      arr(answer(await run('list_corpus', { scope: 'all', page: SHAPE_PAGE.url, ...more }, RESEARCHER))['entries']).length;
    expect([await entriesOf({}), await entriesOf({ kind: 'CAPTURE' }), await entriesOf({ cited: true })]).toEqual([14, 7, 1]);
  });

  it('SH2 the shape is not the WINDOW\'s — limit 1 answers the same shape as limit 100, so the strip stops depending on CORPUS_READ_LIMIT', async () => {
    expect(JSON.stringify(await shapeOfRead({ limit: 1 }))).toBe(JSON.stringify(await shapeOfRead({ limit: 100 })));
    expect(await shapeOfRead({ limit: 1 })).toEqual(SHAPE);
    // The window really is one row wide — otherwise the two reads are the same read.
    const windowed = answer(await run('list_corpus', { scope: 'all', page: SHAPE_PAGE.url, limit: 1 }, RESEARCHER));
    expect([arr(windowed['entries']).length, windowed['nextCursor'] === null]).toEqual([1, false]);
  });

  it('SH3 a bin\'s `chunks` is its group\'s MAXIMUM and never their sum — three diffs on one day pair at 50, 52 and 52 answer 52, not 154', async () => {
    const bin = obj(arr(obj(await shapeOfRead())['diffs'])[0]);
    expect([bin['before'], bin['after'], bin['count'], bin['chunks']]).toEqual(['20220103', '20220501', 3, 52]);
    expect(bin['chunks']).not.toBe(50 + 52 + 52);
  });

  it('SH4 `cited` and `passed` are ANY, not every — one cited capture rings a bin of two, one flagged diff full-tones a bin of three', async () => {
    const shape = obj(await shapeOfRead());
    // The ring: S_A2 carries evidence and S_A1 does not, and they share a bin.
    expect(arr(shape['captures']).map((b) => [b['day'], b['count'], b['cited']])).toEqual(
      SHAPE.captures.map((b) => [b.day, b.count, b.cited]),
    );
    // The tone: of the three diffs in the first bin only `diff-a2-b1` is flagged, and the bin is full-toned.
    expect(arr(shape['diffs']).map((b) => b['passed'])).toEqual([true, false, true, true, true]);
  });

  it('SH5 a diff with NO opinion PASSES, and a diff the classifier judged insignificant does not — the gate is not vacuous, and it reads the CATEGORIES as well as the flag', async () => {
    // A classifier that has not spoken has not judged the row insignificant (the researcher, 2026-09-19).
    expect((await binFor('20220620', '20220810'))['passed']).toBe(true);
    // And the zero is real: this bin's one diff carries `isLegallySignificant: false` with `investigativeCategories: []`.
    expect((await binFor('20220501', '20220620'))['passed']).toBe(false);
    // This bin is flagged only through `diff-a2-b1`, whose stored flag is FALSE and whose categories are not
    // empty — so a gate reading `legallySignificant` alone answers false here and this bin would be dimmed.
    expect((await binFor('20220103', '20220501'))['passed']).toBe(true);
    // …and the other half of the OR is live too: this one's flag is TRUE with EMPTY categories, so a gate reading
    // the categories alone would dim IT. Between the two rows, neither half can be dropped unnoticed.
    expect((await binFor('20220620', '20220905'))['passed']).toBe(true);
  });

  it('SH6 a pair AWAITING DERIVATION counts 0 chunks and is still a bin — the state is not an absence', async () => {
    expect(await binFor('20220810', '20220905')).toEqual({ before: '20220810', after: '20220905', count: 1, chunks: 0, passed: true });
  });

  it('SH7 a read that names NO page carries `shape: null` on every facet row; a read that names one carries it on that row alone', async () => {
    // Region 0 draws no strip (§24 :695–:701), so the bare read must not grow by one byte.
    const bare = arr(answer(await run('list_corpus', { scope: 'all' }, RESEARCHER))['pages']);
    expect(bare.map((p) => [p['trackedUrlId'], p['shape']])).toEqual([
      [PAGE_2.id, null],
      [SHAPE_PAGE.id, null],
    ]);
    const named = arr(answer(await run('list_corpus', { scope: 'all', page: SHAPE_PAGE.url }, RESEARCHER))['pages']);
    expect(named.map((p) => [p['trackedUrlId'], p['shape'] === null])).toEqual([
      [PAGE_2.id, true],
      [SHAPE_PAGE.id, false],
    ]);
    // …and naming the OTHER page moves the shape with it, so the rule is about the NAME and not about this row.
    expect((await facetRow(PAGE_2.id, { page: PAGE_2.url }))['shape']).not.toBeNull();
    expect((await facetRow(SHAPE_PAGE.id, { page: PAGE_2.url }))['shape']).toBeNull();
  });

  it('SH8 the unit is the DAY — two captures five hours apart are ONE bin with count 2, and the bin is named by the day and not by the instant', async () => {
    const first = obj(arr(obj(await shapeOfRead())['captures'])[0]);
    expect(first).toEqual({ day: '20220103', count: 2, cited: true });
    // The two instants exist and differ — otherwise the merge is a fixture artefact.
    expect([S_A1.waybackTimestamp, S_A2.waybackTimestamp]).toEqual(['20220103090000', '20220103140000']);
  });

  it('SH9 the shape carries DAYS and never GEOMETRY — no pixel, no midpoint, no field the component owns', async () => {
    // The 5px merge threshold and the viewBox width are the COMPONENT's (ruling (e)), and "a diff sits at its
    // interval's midpoint" is ruling (b), a DRAWING rule. A backend that emitted either would be a second place
    // where the strip's geometry lives.
    const shape = obj(await shapeOfRead());
    expect(Object.keys(shape).sort()).toEqual(['captures', 'diffs']);
    for (const bin of arr(shape['captures'])) expect(Object.keys(bin).sort()).toEqual(['cited', 'count', 'day']);
    for (const bin of arr(shape['diffs'])) expect(Object.keys(bin).sort()).toEqual(['after', 'before', 'chunks', 'count', 'passed']);
    // Every day is eight digits — the instant's precision is thrown away here, as `timeStrip.dayOf` throws it away.
    for (const bin of arr(shape['captures'])) expect(String(bin['day'])).toMatch(/^\d{8}$/);
    for (const bin of arr(shape['diffs'])) expect([String(bin['before']), String(bin['after'])].every((d) => /^\d{8}$/.test(d))).toBe(true);
  });

  it('SH11 a bin is keyed by the PAIR and never by `before` alone — two diffs leaving one day for DIFFERENT days are TWO bins, each carrying its own `after`', async () => {
    // A DIFF IS ITS PAIR (§7, evidence A1: "one pair, by the two captures it spans — never by a date pair, never
    // by a diff id"), so the bin a diff falls in is the PAIR OF DAYS and not the day it left. Keying on `before`
    // alone reads as the same rule and is not: it MERGES two changes that ended on different days into one mark
    // carrying the earlier `after`, so ruling (b)'s midpoint would be computed for an interval no diff spans and
    // one real change would vanish into another — the silent absorption (g) refuses in the tone's case.
    const bins = arr(obj(await shapeOfRead())['diffs']);
    const leaving = bins.filter((b) => b['before'] === '20220620');
    expect(leaving.map((b) => [b['after'], b['count'], b['chunks']])).toEqual([
      ['20220810', 1, 7],
      ['20220905', 1, 11],
    ]);
    // The world really does hold two such diffs — otherwise this case is about a page that cannot exercise it.
    expect(store.diffs.filter((d) => String((d['beforeSnapshot'] as { waybackTimestamp: string }).waybackTimestamp).slice(0, 8) === '20220620')).toHaveLength(2);
    expect(bins).toHaveLength(5);
  });

  it('SH10 the shape costs no query — a read that names a page asks exactly what the same read without one asks', async () => {
    // The facet rides rows `loadCorpus` already holds (§28: "a facet on the one read, not a second read"). If the
    // shape ever needed a second read, this case is where it shows.
    await run('list_corpus', { scope: 'all' }, RESEARCHER);
    const bare = [...asked];
    asked.length = 0;
    await run('list_corpus', { scope: 'all', page: SHAPE_PAGE.url }, RESEARCHER);
    expect([...asked]).toEqual(bare);
    expect(written).toEqual([]);
  });
});

// --- list_trajectories ------------------------------------------------------------------------------------------------

describe('list_trajectories — §6.1 :244–:247, A4 :1103 (UI-2)', () => {
  const leftAndPage = (e: Record<string, unknown>): unknown[] => [obj(e['page'])['trackedUrlId'], String(e['patternHash'])];

  it('T1 list_trajectories: ordered by the date the claim LEFT, latest first, across pages; then page url, then patternHash', async () => {
    seedTwoPages();
    const entries = arr(answer(await run('list_trajectories', { scope: 'all' }, RESEARCHER))['entries']);
    expect(entries.map(leftAndPage)).toEqual([
      [PAGE_2.id, PATTERN.P2],
      [PAGE.id, PATTERN.PB],
      [PAGE.id, PATTERN.PA],
    ]);
    // PA and P2 trace the same vector: one hash, two pages, told apart by the page id.
    expect(PATTERN.PA).toBe(PATTERN.P2);
    expect(PATTERN.PB).not.toBe(PATTERN.PA);
    // The instant each LEFT, read from the row's own `changes`: the last span in which the claim was absent.
    const left = entries.map((e) => arr(e['changes']).filter((s) => s['present'] === false).at(-1)?.['waybackTimestamp']);
    expect(left).toEqual([LEFT.P2, LEFT.PB, LEFT.PA]);
  });

  it('T2 list_trajectories: a page in scope whose current state has no stored pass is NAMED in undetected — and nothing is computed or written', async () => {
    seedTwoPages();
    const out = answer(await run('list_trajectories', { scope: 'all' }, RESEARCHER));
    expect(out['undetected']).toEqual([{ trackedUrlId: PAGE_3.id, url: PAGE_3.url, public: false }]);
    expect(written).toEqual([]);
    expect(windows).toEqual([]);
    // At `public` the third page is out of scope, and nothing is undetected.
    expect(answer(await run('list_trajectories', { scope: 'public' }, null))['undetected']).toEqual([]);
  });

  it('T3 one-page-is-the-corpus-at-one-page — get_claim_trajectories(url).findings equal list_trajectories({ page: url }).entries with page stripped, matched by patternHash; nothing written by either', async () => {
    seedTwoPages();
    for (const [page, scope, researcher] of [
      [PAGE, 'public', null],
      [PAGE_2, 'all', RESEARCHER],
    ] as const) {
      actAs(researcher);
      const perPage = answer(JSON.parse(await getClaimTrajectoriesHandler({ url: page.url })));
      const byPattern = (rows: Record<string, unknown>[]): Record<string, unknown>[] =>
        [...rows].sort((a, b) => String(a['patternHash']).localeCompare(String(b['patternHash'])));
      const findings = byPattern(arr(perPage['findings']));
      const entries = byPattern(arr(answer(await run('list_trajectories', { scope, page: page.url }, researcher))['entries']).map(strip));
      expect(findings.length).toBeGreaterThan(0);
      expect(entries).toEqual(findings);
    }
    expect(written).toEqual([]);
  });

  it('T4 list_trajectories: since/until by the date the claim LEFT; cursor pages; every row carries sourceStateHash', async () => {
    seedTwoPages();
    const since = arr(answer(await run('list_trajectories', { scope: 'all', since: '2021-06-01' }, RESEARCHER))['entries']);
    expect(since.map(leftAndPage)).toEqual([
      [PAGE_2.id, PATTERN.P2],
      [PAGE.id, PATTERN.PB],
    ]);
    const until = arr(answer(await run('list_trajectories', { scope: 'all', until: '2021-06-12' }, RESEARCHER))['entries']);
    expect(until.map(leftAndPage)).toEqual([
      [PAGE.id, PATTERN.PB],
      [PAGE.id, PATTERN.PA],
    ]);

    const walked: unknown[][] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const out = answer(await run('list_trajectories', { scope: 'all', limit: 1, ...(cursor === null ? {} : { cursor }) }, RESEARCHER));
      const entries = arr(out['entries']);
      expect(entries.every((e) => typeof e['sourceStateHash'] === 'string' && e['sourceStateHash'] !== '')).toBe(true);
      walked.push(...entries.map(leftAndPage));
      cursor = out['nextCursor'] === null ? null : String(out['nextCursor']);
      pages += 1;
    } while (cursor !== null && pages < 20);
    expect(pages).toBe(3);
    expect(walked).toEqual([
      [PAGE_2.id, PATTERN.P2],
      [PAGE.id, PATTERN.PB],
      [PAGE.id, PATTERN.PA],
    ]);
  });
});

// --- search_corpus -----------------------------------------------------------------------------------------------------

describe('search_corpus — §6.1 :248–:252, A4 :1101 (UI-2; the stored register, ruled 2026-09-15)', () => {
  const verdictOf = (e: Record<string, unknown>): unknown[] => [obj(e['page'])['trackedUrlId'], e['capture'], e['presentInStoredSnapshot']];

  it("S1 search_corpus refuses PHRASE_REQUIRED for a blank phrase (REASON_REQUIRED's shape), before any query", async () => {
    seedTwoPages();
    expectRefusal(await run('search_corpus', { scope: 'public', phrase: '   ' }, null), 'PHRASE_REQUIRED');
    expect(asked).toEqual([]);
    expect(delegatesCalled()).toEqual([]);
  });

  it('S2 search_corpus: one verdict per HELD capture across pages in timestamp order, over the STORED text — fetchCaptureHtml and the CDX index never called', async () => {
    seedTwoPages();
    const out = answer(await run('search_corpus', { scope: 'all', phrase: PHRASE }, RESEARCHER));
    expect(out['phrase']).toBe(PHRASE);
    expect(arr(out['entries']).map(verdictOf)).toEqual([
      [PAGE.id, BEFORE.waybackTimestamp, true],
      [PAGE.id, BETWEEN.waybackTimestamp, false],
      [PAGE_2.id, P2A.waybackTimestamp, true],
      [PAGE.id, AFTER.waybackTimestamp, true],
      [PAGE_2.id, P2B.waybackTimestamp, false],
      [PAGE_2.id, P2C.waybackTimestamp, false],
    ]);
    expect(arr(out['entries']).every((e) => e['kind'] === 'CAPTURE' && typeof e['fileHash'] === 'string')).toBe(true);
    expect(fetchCaptureHtml).not.toHaveBeenCalled();
    expect(jest.mocked(axios).get).not.toHaveBeenCalled();
    expect(written).toEqual([]);
  });

  it("S3 one-page-is-the-corpus-at-one-page — verify_claim_text({ url, capture, phrase }).checks[0].presentInStoredSnapshot equals search_corpus({ page })'s verdict for that capture, every held capture, the archive fetch mocked to CONTAIN the phrase", async () => {
    seedTwoPages();
    const entries = arr(answer(await run('search_corpus', { scope: 'public', phrase: PHRASE, page: URL }, null))['entries']);
    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      const verified = obj(JSON.parse(await verifyClaimTextHandler({ url: URL, capture: String(entry['capture']), phrase: PHRASE })));
      const check = arr(verified['checks'])[0] ?? {};
      // The raw half read TRUE on every capture (the mock); the stored half is what the two tools share.
      expect([entry['capture'], check['presentInRawArchive'], check['presentInStoredSnapshot']]).toEqual([
        entry['capture'],
        true,
        entry['presentInStoredSnapshot'],
      ]);
    }
    expect(fetchCaptureHtml).toHaveBeenCalledTimes(3);
  });

  it('S4 search_corpus: since/until and page bound the captures searched', async () => {
    seedTwoPages();
    const ranged = arr(answer(await run('search_corpus', { scope: 'all', phrase: PHRASE, since: '2021-01-01', until: '2021-06-30' }, RESEARCHER))['entries']);
    expect(ranged.map(verdictOf)).toEqual([
      [PAGE.id, BETWEEN.waybackTimestamp, false],
      [PAGE_2.id, P2A.waybackTimestamp, true],
      [PAGE.id, AFTER.waybackTimestamp, true],
    ]);
    const paged = arr(answer(await run('search_corpus', { scope: 'all', phrase: PHRASE, page: PAGE_2.url }, RESEARCHER))['entries']);
    expect(paged.map(verdictOf)).toEqual([
      [PAGE_2.id, P2A.waybackTimestamp, true],
      [PAGE_2.id, P2B.waybackTimestamp, false],
      [PAGE_2.id, P2C.waybackTimestamp, false],
    ]);
  });
});
