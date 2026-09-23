jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);
jest.mock('../src/middleware/supabaseAuth', () => (require('./helpers/gateDouble') as typeof import('./helpers/gateDouble')).supabaseAuthDouble);

const mockIsHashRegistered = jest.fn();
const mockWeb3Constructor = jest.fn();
jest.mock('../src/services/Web3Service', () => ({
  Web3Service: class {
    constructor() {
      mockWeb3Constructor();
    }
    isHashRegistered = mockIsHashRegistered;
    readEvidenceRecord = jest.fn();
    get registryAddress(): string {
      return `0x${'9'.repeat(40)}`;
    }
    get registrarAddress(): string {
      return `0x${'1'.repeat(40)}`;
    }
  },
}));
jest.mock('../src/lib/chainIdentity', () => ({
  readChainIdentity: jest.fn().mockResolvedValue({ reachable: true, chainId: 84532, registryAddress: `0x${'9'.repeat(40)}` }),
}));

import { join } from 'node:path';
import express, { type Request, type RequestHandler } from 'express';
import request from 'supertest';
import { checkOnChainStatusHandler } from '../src/mcp/tools/checkOnChainStatus';
import { getDebateHandler } from '../src/mcp/tools/getDebate';
import { getDiffInputHandler } from '../src/mcp/tools/getDiffInput';
import { getFramingHandler } from '../src/mcp/tools/getFraming';
import { getThesisContextHandler } from '../src/mcp/tools/getThesisContext';
import { getWhistleblowerCallHandler } from '../src/mcp/tools/getWhistleblowerCall';
import { listCorpusHandler } from '../src/mcp/tools/listCorpus';
import { listEvidenceReviewsHandler } from '../src/mcp/tools/listEvidenceReviews';
import { listFindingsHandler } from '../src/mcp/tools/listFindings';
import { listFramingsHandler } from '../src/mcp/tools/listFramings';
import { listPagesHandler } from '../src/mcp/tools/listPages';
import { listThesesHandler } from '../src/mcp/tools/listTheses';
import { listThesisReviewsHandler } from '../src/mcp/tools/listThesisReviews';
import { listTrajectoriesHandler } from '../src/mcp/tools/listTrajectories';
import { resolveRecordHandler } from '../src/mcp/tools/resolveRecord';
import { searchCorpusHandler } from '../src/mcp/tools/searchCorpus';
import { getArticleRulesHandler, getRuleHistoryHandler, listCapturesHandler } from '../src/walk/tools';
import { AFTER, BEFORE, BETWEEN, DIFF_NAME, PAGE, URL } from './helpers/corpusFixture';
import { db, resetDouble, store } from './helpers/evidenceDouble';
import {
  DRAFT_ID,
  MARK,
  MISSING_PAGE_ID,
  MISSING_THESIS_ID,
  NAMELESS,
  OTHER_PAGES_RULE_ID,
  P2A,
  P2_DIFF_NAME,
  PAGE_2,
  PAGE_3,
  PHRASE,
  RULE_ID,
  SESSION_ID,
  TOKEN,
  appOf,
  seedCorpusWorld,
  seedDebate,
  seedDraft,
  seedEvidenceReview,
  seedGate,
  seedThesisWorld,
  seedWalkWorld,
  thrown,
} from './helpers/routeWorld';
import { load } from './thesis/absent';
import type { ExportContract } from './thesis/contract';
import { AUTHOR, FRAMING, THESIS, VERSION } from './thesis/fixtures';
import { actAs, delegatesCalled, resetTools } from './thesis/tools';
import { SRC, balanced, codeOf, importSpecifiers, readCode } from './walk/scan';

// ---------------------------------------------------------------------------
// THE FIVE ROUTE INSTRUMENTS — docs/gf-ui-flows.md §9 :346–:357 and A5 :1058–:1064; docs/gf-ui-refactor-plan.md UI-3
// :280–:288 and §5 :898–:903; the R53 sketch §d1 (round 2). WRITTEN FIRST, FROM THE CONTRACT, RED BY NAME until UI-3
// builds the routes (refactor plan §4 rule 4): the route modules and the adapter are reached through
// `test/thesis/absent.ts`' `load()` with the owner "UI-3", so a case fails on its own and never as a file-level TS2307.
//
//   route-is-tool                 a route's body IS its tool's answer for the same input, serialised as the tool's
//                                 `answer` serialises it — no environment stamp (the researcher, 2026-09-15) — and a
//                                 refusal is the ONE table's status and body for it; no route module queries,
//                                 composes a status or builds a refusal (T1–T6)
//   public-identical              every public route the same bytes with and without a session; the 404s one body (P1–P3)
//   no-model-prose-public         no analysis, assessment or objection in a public body, by VALUE; `opinion` only on a diff (M1–M2)
//   gate-by-prefix                one gate at the `/api/research` mount; `req.researcherId` read once, by the gated
//                                 adapter, which enters the context once (G1–G5)
//   no-surveyed-page-anonymous    no public route lists surveyed pages or answers `scope: 'all'` (N1–N4)
//
// THE WORLD is `test/helpers/routeWorld.ts` — the corpus of UI-2, a published thesis, the walk's work-list, the
// gate's researchers — probed through the REAL predicates before these cases were written (the R53 chunk-2 report).
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
  thrown.length = 0;
  mockIsHashRegistered.mockResolvedValue({ registered: false, evidenceId: BigInt(0) });
  mockWeb3Constructor.mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const fn: ExportContract = { step: 0, kind: 'function' };
const table: ExportContract = { step: 0, kind: 'table' };

type Door = 'public' | 'research';
interface Refusal {
  error: string;
  code: string;
}
interface ToolRoute {
  statusOf: (refusal: Refusal, door: Door) => { status: number; body: object };
  ROUTED_CODES: readonly string[];
  publicRoute: <I>(read: (req: Request) => { input: I } | { invalid: string }, core: (input: I) => Promise<unknown>) => RequestHandler;
}

/** The adapter's module — red by name until UI-3 builds it. */
const toolRoute = (): Promise<ToolRoute> =>
  load<ToolRoute>('routes/toolRoute', 0, { statusOf: fn, ROUTED_CODES: table, publicRoute: fn, researchRoute: fn, pageById: fn }, 'UI-3');

/** The two thesis cores `services/publishedThesis.ts` gains (sketch §0h, round 2 M2). */
const thesisCores = (): Promise<{ publishedPageOf: (id: string) => Promise<unknown>; publishedVersionOf: (id: string, v: string) => Promise<unknown> }> =>
  load('services/publishedThesis', 0, { publishedPageOf: fn, publishedVersionOf: fn }, 'UI-3');

const enc = encodeURIComponent;

/** The tool's answer AS A RESEARCHER, the context left empty after it — the route enters its own. */
const asAuthor = async (tool: () => Promise<string>): Promise<string> => {
  actAs(AUTHOR);
  try {
    return await tool();
  } finally {
    actAs(null);
  }
};

interface RouteRow {
  door: Door;
  path: string;
  seed: () => void;
  tool: () => Promise<string>;
}

const thesisWorld = (): void => {
  seedThesisWorld();
  seedGate();
};
const corpusWorld = (): void => {
  seedCorpusWorld();
  seedGate();
};
const draftWorld = (): void => {
  thesisWorld();
  seedDraft();
};
const walkWorld = (): void => {
  seedWalkWorld();
  seedGate();
};

/** THE TWELVE PUBLIC ROUTES (§6 as ruled: `…/search` not mounted), each beside its tool at the input the route fixes. */
const PUBLIC_ROUTES: readonly RouteRow[] = [
  { door: 'public', path: '/api/thesis', seed: thesisWorld, tool: () => listThesesHandler({}) },
  { door: 'public', path: `/api/thesis/${THESIS.id}`, seed: thesisWorld, tool: async () => JSON.stringify(await (await thesisCores()).publishedPageOf(THESIS.id)) },
  { door: 'public', path: `/api/thesis/${THESIS.id}/versions/${VERSION.id}`, seed: thesisWorld, tool: async () => JSON.stringify(await (await thesisCores()).publishedVersionOf(THESIS.id, VERSION.id)) },
  { door: 'public', path: `/api/thesis/${THESIS.id}/call`, seed: thesisWorld, tool: () => getWhistleblowerCallHandler({ thesisId: THESIS.id }) },
  { door: 'public', path: '/api/corpus?kind=DIFF&limit=2', seed: corpusWorld, tool: () => listCorpusHandler({ scope: 'public', kind: 'DIFF', limit: 2 }) },
  { door: 'public', path: '/api/corpus/claims', seed: corpusWorld, tool: () => listTrajectoriesHandler({ scope: 'public' }) },
  { door: 'public', path: `/api/corpus/search?phrase=${enc(PHRASE)}`, seed: corpusWorld, tool: () => searchCorpusHandler({ scope: 'public', phrase: PHRASE }) },
  { door: 'public', path: `/api/pages/${PAGE.id}/findings`, seed: corpusWorld, tool: () => listFindingsHandler({ url: URL }) },
  { door: 'public', path: `/api/pages/${PAGE.id}/diffs/${BEFORE.waybackTimestamp}/${AFTER.waybackTimestamp}`, seed: corpusWorld, tool: () => getDiffInputHandler({ url: URL, before: BEFORE.waybackTimestamp, after: AFTER.waybackTimestamp }) },
  { door: 'public', path: `/api/pages/${PAGE.id}/trajectories`, seed: corpusWorld, tool: () => listTrajectoriesHandler({ scope: 'public', page: URL }) },
  { door: 'public', path: `/api/pages/${PAGE.id}/captures/${BEFORE.waybackTimestamp}/chain`, seed: corpusWorld, tool: () => checkOnChainStatusHandler({ url: URL, capture: BEFORE.waybackTimestamp }) },
  { door: 'public', path: `/api/records/${DIFF_NAME}`, seed: corpusWorld, tool: () => resolveRecordHandler({ fileHash: DIFF_NAME }) },
];

/**
 * FOURTEEN OF THE FIFTEEN GATED ROUTES (§7), each beside its tool as the same researcher, `scope` fixed to `all` where the
 * tool takes one. THE FIFTEENTH, `/api/research/documents` (document step 30), is held route-is-tool in
 * `test/documentsRoute.test.ts` over the DOCUMENT world: this table's world is `test/helpers/evidenceDouble.ts`, a KEEP
 * file that models no document delegate, so a row here could only crash. G2 counts all fifteen registrations.
 */
const RESEARCH_ROUTES: readonly RouteRow[] = [
  { door: 'research', path: '/api/research/reviews', seed: thesisWorld, tool: () => asAuthor(() => listThesisReviewsHandler({ scope: 'all' })) },
  { door: 'research', path: '/api/research/evidence-reviews', seed: () => { thesisWorld(); seedEvidenceReview(); }, tool: () => asAuthor(() => listEvidenceReviewsHandler()) },
  { door: 'research', path: '/api/research/theses', seed: thesisWorld, tool: () => asAuthor(() => listThesesHandler({ scope: 'all' })) },
  { door: 'research', path: `/api/research/theses/${THESIS.id}`, seed: thesisWorld, tool: () => asAuthor(() => getThesisContextHandler({ thesisId: THESIS.id })) },
  { door: 'research', path: '/api/research/framings', seed: thesisWorld, tool: () => asAuthor(() => listFramingsHandler()) },
  { door: 'research', path: `/api/research/framings/${FRAMING.id}`, seed: thesisWorld, tool: () => asAuthor(() => getFramingHandler({ framingId: FRAMING.id })) },
  { door: 'research', path: `/api/research/debates/${SESSION_ID}`, seed: () => { thesisWorld(); seedDebate(); }, tool: () => asAuthor(() => getDebateHandler({ sessionId: SESSION_ID })) },
  { door: 'research', path: '/api/research/corpus', seed: corpusWorld, tool: () => asAuthor(() => listCorpusHandler({ scope: 'all' })) },
  { door: 'research', path: '/api/research/corpus/claims', seed: corpusWorld, tool: () => asAuthor(() => listTrajectoriesHandler({ scope: 'all' })) },
  { door: 'research', path: `/api/research/corpus/search?phrase=${enc(PHRASE)}`, seed: corpusWorld, tool: () => asAuthor(() => searchCorpusHandler({ scope: 'all', phrase: PHRASE })) },
  { door: 'research', path: '/api/research/pages', seed: corpusWorld, tool: () => asAuthor(() => listPagesHandler()) },
  { door: 'research', path: `/api/research/pages/${PAGE.id}/captures`, seed: walkWorld, tool: () => asAuthor(() => listCapturesHandler({ url: URL })) },
  { door: 'research', path: `/api/research/pages/${PAGE.id}/rules`, seed: walkWorld, tool: () => asAuthor(() => getArticleRulesHandler({ url: URL })) },
  { door: 'research', path: `/api/research/pages/${PAGE.id}/rules/${RULE_ID}/history`, seed: walkWorld, tool: () => asAuthor(() => getRuleHistoryHandler({ url: URL, ruleId: RULE_ID })) },
];

/** GET through the app, as a researcher for the research door. */
async function get(path: string, door: Door, token: string | null = door === 'research' ? TOKEN.good : null, over: { researcherId?: string } = {}): Promise<{ status: number; text: string }> {
  const app = await appOf(over);
  const pending = request(app).get(path);
  const res = token === null ? await pending : await pending.set('Authorization', `Bearer ${token}`);
  return { status: res.status, text: res.text };
}

/** The route modules the scans read, by path under src — each must EXIST before a scan of it says anything. */
const ROUTE_MODULE_FILES = ['routes/corpusRoutes.ts', 'routes/researchRoutes.ts', 'routes/publicThesisRoutes.ts'] as const;
const TOOL_ROUTE_FILE = 'routes/toolRoute.ts';
const codeAt = (file: string): string => readCode(join(SRC, file));

// --- route-is-tool ----------------------------------------------------------------------------------------------------

/** What a route module may not do: query, compose a status, or build a refusal (T4; round 2 M2). */
function composes(code: string): string[] {
  const found: string[] = [];
  for (const specifier of importSpecifiers(code)) {
    if (/(?:^|\/)lib\/prisma$/.test(specifier)) found.push(`imports ${specifier}`);
    if (/(?:^|\/)services\//.test(specifier) && !/(?:^|\/)services\/publishedThesis$/.test(specifier)) found.push(`imports ${specifier}`);
    if (/Refusals$/.test(specifier)) found.push(`imports ${specifier}`);
  }
  if (/\bres\.(?:status|json)\s*\(/.test(code)) found.push('composes a status');
  if (/\brefusal\s*\(/.test(code)) found.push('builds a refusal');
  return found;
}

describe('route-is-tool — a route IS its tool\'s answer (ui-flows §5 :184–:189, §9 :346–:347; plan UI-3 :231–:238)', () => {
  it.each(PUBLIC_ROUTES.map((r) => [r.path, r] as const))('T1 route-is-tool — PUBLIC %s answers 200 with its core\'s value, byte for byte', async (_path, row) => {
    row.seed();
    const expected = await row.tool();
    const { status, text } = await get(row.path, 'public');
    expect([status, text]).toEqual([200, expected]);
    expect(thrown).toEqual([]);
  });

  it.each(RESEARCH_ROUTES.map((r) => [r.path, r] as const))('T2 route-is-tool — RESEARCH %s answers 200 with its tool\'s answer as the same researcher, byte for byte', async (_path, row) => {
    row.seed();
    const expected = await row.tool();
    const { status, text } = await get(row.path, 'research');
    expect([status, text]).toEqual([200, expected]);
    expect(thrown).toEqual([]);
  });

  const REFUSALS: readonly RouteRow[] = [
    { door: 'public', path: `/api/pages/${PAGE_2.id}/findings`, seed: corpusWorld, tool: () => listFindingsHandler({ url: PAGE_2.url }) },
    { door: 'public', path: `/api/pages/${PAGE.id}/diffs/2020-12-09/${AFTER.waybackTimestamp}`, seed: corpusWorld, tool: () => getDiffInputHandler({ url: URL, before: '2020-12-09', after: AFTER.waybackTimestamp }) },
    { door: 'public', path: `/api/pages/${PAGE.id}/diffs/${BEFORE.waybackTimestamp}/${BETWEEN.waybackTimestamp}`, seed: corpusWorld, tool: () => getDiffInputHandler({ url: URL, before: BEFORE.waybackTimestamp, after: BETWEEN.waybackTimestamp }) },
    {
      door: 'public',
      path: `/api/pages/${PAGE.id}/diffs/${BEFORE.waybackTimestamp}/${AFTER.waybackTimestamp}`,
      seed: () => {
        corpusWorld();
        store.diffs = store.diffs.map((d) => (d['id'] === 'diff-1' ? { ...d, contentVersions: [] } : d));
      },
      tool: () => getDiffInputHandler({ url: URL, before: BEFORE.waybackTimestamp, after: AFTER.waybackTimestamp }),
    },
    {
      door: 'public',
      path: `/api/pages/${PAGE.id}/captures/${BEFORE.waybackTimestamp}/chain`,
      seed: () => {
        corpusWorld();
        mockWeb3Constructor.mockImplementation(() => {
          throw new Error('no RPC configured');
        });
      },
      tool: () => checkOnChainStatusHandler({ url: URL, capture: BEFORE.waybackTimestamp }),
    },
    { door: 'public', path: `/api/corpus/search?phrase=${enc('   ')}`, seed: corpusWorld, tool: () => searchCorpusHandler({ scope: 'public', phrase: '   ' }) },
    { door: 'public', path: '/api/corpus?since=2021-06-30&until=2021-01-01', seed: corpusWorld, tool: () => listCorpusHandler({ scope: 'public', since: '2021-06-30', until: '2021-01-01' }) },
    { door: 'public', path: `/api/records/${P2_DIFF_NAME}`, seed: corpusWorld, tool: () => resolveRecordHandler({ fileHash: P2_DIFF_NAME }) },
    { door: 'research', path: `/api/research/pages/${PAGE.id}/captures?outcome=STORED`, seed: walkWorld, tool: () => asAuthor(() => listCapturesHandler({ url: URL, outcome: 'STORED' })) },
    { door: 'research', path: `/api/research/theses/${MISSING_THESIS_ID}`, seed: thesisWorld, tool: () => asAuthor(() => getThesisContextHandler({ thesisId: MISSING_THESIS_ID })) },
    { door: 'research', path: '/api/research/framings/framing-that-does-not-exist', seed: thesisWorld, tool: () => asAuthor(() => getFramingHandler({ framingId: 'framing-that-does-not-exist' })) },
    { door: 'research', path: '/api/research/debates/session-that-does-not-exist', seed: thesisWorld, tool: () => asAuthor(() => getDebateHandler({ sessionId: 'session-that-does-not-exist' })) },
    { door: 'research', path: `/api/research/pages/${PAGE.id}/rules/${OTHER_PAGES_RULE_ID}/history`, seed: walkWorld, tool: () => asAuthor(() => getRuleHistoryHandler({ url: URL, ruleId: OTHER_PAGES_RULE_ID })) },
  ];

  it.each(REFUSALS.map((r) => [r.door, r.path, r] as const))('T3 route-is-tool — %s %s answers statusOf(the tool\'s refusal, the door)', async (door, _path, row) => {
    const { statusOf } = await toolRoute();
    row.seed();
    const refusal = JSON.parse(await row.tool()) as Refusal;
    expect(Object.keys(refusal).sort()).toEqual(['code', 'error']);
    const want = statusOf(refusal, door);
    const { status, text } = await get(row.path, door);
    expect([status, text]).toEqual([want.status, JSON.stringify(want.body)]);
  });

  it('T4 route-is-tool — no route module queries or composes: corpusRoutes, researchRoutes and publicThesisRoutes import no lib/prisma, no service beyond the cores and no …Refusals module, name no res.status / res.json and call no refusal(; toolRoute imports no lib/prisma', () => {
    const files = [...ROUTE_MODULE_FILES, TOOL_ROUTE_FILE];
    const missing = files.filter((file) => {
      try {
        codeAt(file);
        return false;
      } catch {
        return true;
      }
    });
    expect(missing).toEqual([]);
    expect(ROUTE_MODULE_FILES.map((file) => [file, composes(codeAt(file))])).toEqual(ROUTE_MODULE_FILES.map((file) => [file, []]));
    expect(importSpecifiers(codeAt(TOOL_ROUTE_FILE)).filter((s) => /(?:^|\/)lib\/prisma$/.test(s))).toEqual([]);
  });

  it('T5 DETECTS a router with its own query, a composed status and a built refusal — and the landed shape does not fire', () => {
    expect(composes("import { prisma } from '../lib/prisma';")).toEqual(['imports ../lib/prisma']);
    expect(composes("import { loadCorpus } from '../services/corpusReads';")).toEqual(['imports ../services/corpusReads']);
    expect(composes("import { shared } from '../mcp/tools/evidenceRefusals';")).toEqual(['imports ../mcp/tools/evidenceRefusals']);
    expect(composes("router.get('/x', (req, res) => { res.status(403).json({}); });")).toEqual(['composes a status']);
    expect(composes("const read = (req) => refusal('NOT_PUBLIC', 'no');")).toEqual(['builds a refusal']);
    expect(
      composes(
        "import { publicRoute, pageById } from './toolRoute';\nimport { findingsOf } from '../mcp/tools/listFindings';\nimport { publishedPageOf } from '../services/publishedThesis';\npagesRouter.get('/:trackedUrlId/findings', publicRoute(read, findingsOf));",
      ),
    ).toEqual([]);
  });

  /** Every refusal code each routed core's appendix names, and the two the route layer carries (sketch §a1, round 2). */
  const APPENDIX_CODES: Readonly<Record<string, readonly string[]>> = {
    'list_findings — evidence A4 :1092': ['NOT_SURVEYED', 'NOT_PUBLIC'],
    'get_diff_input — evidence A4 :1098–:1099': ['NOT_SURVEYED', 'NOT_PUBLIC', 'NOT_A_CAPTURE', 'NO_SUCH_DIFF', 'AWAITING_DERIVATION'],
    'check_on_chain_status — evidence A4 :1115, and PUBLIC_PAGE': ['NOT_SURVEYED', 'NOT_PUBLIC', 'NOT_A_CAPTURE', 'CHAIN_UNAVAILABLE'],
    'resolve_record — evidence A4 :1109': ['NOT_A_RECORD', 'NOT_PUBLIC'],
    'list_corpus / list_trajectories — ui-flows §6.1 :242, :247': ['INVALID_RANGE', 'NOT_SURVEYED', 'NOT_PUBLIC', 'NO_RESEARCHER'],
    'search_corpus — ui-flows §6.1 :252': ['INVALID_RANGE', 'PHRASE_REQUIRED', 'NOT_SURVEYED', 'NOT_PUBLIC', 'NO_RESEARCHER'],
    'get_whistleblower_call — thesis A4 :1501–:1504': [],
    'list_theses — thesis A4 :1426 as amended': ['NO_RESEARCHER'],
    'list_thesis_reviews — thesis A4 :1523': ['NO_RESEARCHER'],
    'list_evidence_reviews — evidence A4 :1146': ['NO_RESEARCHER'],
    'get_thesis_context — thesis A4 :1476, :1474': ['NO_THESIS'],
    'list_framings — thesis A4 :1432': [],
    'get_framing — thesis A4 :1458': ['NO_FRAMING'],
    'get_debate — evidence A4 :1141': ['NO_RESEARCHER', 'SESSION_NOT_FOUND'],
    'list_pages — interaction A5 :1071': [],
    'list_captures — interaction A5 :1212': ['NOT_SURVEYED', 'INVALID_OUTCOME'],
    'get_article_rules — interaction A5 :1206': ['NOT_SURVEYED'],
    'get_rule_history — interaction A5 :1224': ['NOT_SURVEYED', 'NO_SUCH_RULE'],
    'the public thesis reads — thesis A5 :1569, a thesis never published': ['NOT_PUBLISHED'],
    'the routes — a malformed parameter': ['INVALID_PARAMETER'],
  };

  const NOT_FOUND = { error: 'Not found' };
  /** What each code answers at each door (sketch §a1's table): a status and whether the body is the one 404 or the refusal verbatim; `throws` for a wiring defect. */
  const EXPECTED: Readonly<Record<string, { public: number | 'throws'; research: number | 'throws'; hidden?: true }>> = {
    NOT_SURVEYED: { public: 404, research: 404, hidden: true },
    NOT_PUBLIC: { public: 404, research: 404, hidden: true },
    NOT_A_RECORD: { public: 404, research: 404, hidden: true },
    NOT_A_CAPTURE: { public: 404, research: 404, hidden: true },
    NO_SUCH_DIFF: { public: 404, research: 404, hidden: true },
    NOT_PUBLISHED: { public: 404, research: 404, hidden: true },
    NO_THESIS: { public: 404, research: 404, hidden: true },
    NO_FRAMING: { public: 404, research: 404, hidden: true },
    NO_SUCH_RULE: { public: 404, research: 404, hidden: true },
    SESSION_NOT_FOUND: { public: 404, research: 404, hidden: true },
    AWAITING_DERIVATION: { public: 409, research: 409 },
    CHAIN_UNAVAILABLE: { public: 503, research: 503 },
    INVALID_RANGE: { public: 400, research: 400 },
    PHRASE_REQUIRED: { public: 400, research: 400 },
    INVALID_OUTCOME: { public: 400, research: 400 },
    INVALID_PARAMETER: { public: 400, research: 400 },
    NO_RESEARCHER: { public: 'throws', research: 'throws' },
  };

  it('T6 the ONE table maps every code: ROUTED_CODES is exactly every code the routed cores\' appendices name with the route layer\'s, each answers its status at each door, the 404 one body publicly and verbatim inside the prefix, and an unknown code throws', async () => {
    const { statusOf, ROUTED_CODES } = await toolRoute();
    const named = [...new Set(Object.values(APPENDIX_CODES).flat())].sort();
    expect([...ROUTED_CODES].sort()).toEqual(named);
    expect(Object.keys(EXPECTED).sort()).toEqual(named);
    for (const code of named) {
      const refusal = { error: `the refusal of ${code}`, code };
      const want = EXPECTED[code];
      for (const door of ['public', 'research'] as const) {
        const status = want?.[door];
        if (status === 'throws') {
          expect(() => statusOf(refusal, door)).toThrow();
          continue;
        }
        const body = door === 'public' && want?.hidden === true ? NOT_FOUND : refusal;
        expect([code, door, statusOf(refusal, door)]).toEqual([code, door, { status, body }]);
      }
    }
    expect(() => statusOf({ error: 'a word no contract names', code: 'NOT_A_CODE' }, 'public')).toThrow();
  });
});

// --- public-identical -------------------------------------------------------------------------------------------------

describe('public-identical — every public route the same bytes for everyone; the 404s one body (ui-flows §9 :350–:351; thesis A7 :1686)', () => {
  const PRIVATE_ROWS: readonly { path: string; seed: () => void }[] = [
    ...PUBLIC_ROUTES.map((r) => ({ path: r.path, seed: r.seed })),
    { path: `/api/pages/${PAGE_2.id}/findings`, seed: corpusWorld },
    { path: `/api/corpus?page=${PAGE_2.id}`, seed: corpusWorld },
    { path: `/api/pages/${PAGE_2.id}/trajectories`, seed: corpusWorld },
  ];

  it.each(PRIVATE_ROWS.map((r) => [r.path, r] as const))('P1 public-identical — %s answers the same bytes with no session and with an approved researcher\'s bearer and req.researcherId set', async (_path, row) => {
    row.seed();
    const anonymous = await get(row.path, 'public', null);
    const signedIn = await get(row.path, 'public', TOKEN.good, { researcherId: AUTHOR });
    expect(signedIn).toEqual(anonymous);
  });

  it('P2 public-identical — the 404s are one body: a draft thesis, a made-up thesis, a draft\'s version, a private page\'s findings, a made-up page id, a made-up record, a private record, a private page\'s chain', async () => {
    const rows: readonly { path: string; seed: () => void }[] = [
      { path: `/api/thesis/${DRAFT_ID}`, seed: draftWorld },
      { path: `/api/thesis/${MISSING_THESIS_ID}`, seed: thesisWorld },
      { path: `/api/thesis/${DRAFT_ID}/versions/${VERSION.id}`, seed: draftWorld },
      { path: `/api/pages/${PAGE_2.id}/findings`, seed: corpusWorld },
      { path: `/api/pages/${MISSING_PAGE_ID}/findings`, seed: corpusWorld },
      { path: `/api/records/${NAMELESS}`, seed: corpusWorld },
      { path: `/api/records/${P2_DIFF_NAME}`, seed: corpusWorld },
      { path: `/api/pages/${PAGE_2.id}/captures/${P2A.waybackTimestamp}/chain`, seed: corpusWorld },
    ];
    const answers: [string, number, string][] = [];
    for (const row of rows) {
      resetDouble();
      row.seed();
      const { status, text } = await get(row.path, 'public');
      answers.push([row.path, status, text]);
    }
    expect(answers).toEqual(rows.map((r) => [r.path, 404, '{"error":"Not found"}']));
  });

  /** Does a region of code read the caller: the context or the request's researcher. */
  const readsCaller = (region: string): boolean => /\bresearcherContext\b|\bresearcherId\b|\bgetResearcherId\b/.test(region);

  it('P3 public-identical — publicRoute\'s own body names neither researcherContext nor researcherId; DETECTS a planted one', () => {
    expect(readsCaller('{ return researcherContext.run({ researcherId: req.researcherId }, () => core(input)); }')).toBe(true);
    expect(readsCaller('{ return send(res, await core(input)); }')).toBe(false);
    const code = codeAt(TOOL_ROUTE_FILE);
    const at = code.search(/export\s+function\s+publicRoute\b/);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(readsCaller(balanced(code, code.indexOf('{', code.indexOf(')', at))))).toBe(false);
  });
});

// --- no-model-prose-public --------------------------------------------------------------------------------------------

/** A key a model register would carry into a body. `opinion` is allowed on a DIFF row alone — an object with `before` and `after` (evidence A4 :1087). */
const MODEL_KEYS = new Set(['analysis', 'analyses', 'assessment', 'objection', 'suggestedGaps', 'critique']);

function modelProse(body: unknown, path = '$'): string[] {
  if (Array.isArray(body)) return body.flatMap((item, i) => modelProse(item, `${path}[${String(i)}]`));
  if (typeof body !== 'object' || body === null) return [];
  const object = body as Record<string, unknown>;
  const found: string[] = [];
  for (const [key, value] of Object.entries(object)) {
    if (MODEL_KEYS.has(key)) found.push(`${path}.${key}`);
    if (key === 'opinion' && !('before' in object && 'after' in object)) found.push(`${path}.opinion`);
    found.push(...modelProse(value, `${path}.${key}`));
  }
  return found;
}

describe('no-model-prose-public — no analysis, assessment or objection on a public body (ui-flows §9 :352–:353; thesis A7 :1688)', () => {
  it.each(PUBLIC_ROUTES.map((r) => [r.path, r] as const))('M1 no-model-prose-public — %s carries no planted model MARK by value and no model key; `opinion` only on a diff', async (_path, row) => {
    row.seed();
    const { status, text } = await get(row.path, 'public');
    expect(status).toBe(200);
    expect(Object.values(MARK).filter((mark) => text.includes(mark))).toEqual([]);
    expect(modelProse(JSON.parse(text))).toEqual([]);
  });

  it('M2 DETECTS a planted analysis field and an opinion off a diff — and a diff\'s own opinion does not fire', () => {
    expect(modelProse({ thesisId: 't', analysis: { opinion: 'x' } })).toEqual(['$.analysis', '$.analysis.opinion']);
    expect(modelProse({ entries: [{ kind: 'CAPTURE', capture: '20200101000000', opinion: {} }] })).toEqual(['$.entries[0].opinion']);
    expect(modelProse({ diffs: [{ before: '1', after: '2', opinion: { significance: 's' } }] })).toEqual([]);
  });
});

// --- gate-by-prefix ---------------------------------------------------------------------------------------------------

const GATED_MOUNT = "app.use('/api/research', requireResearcher, researchRouter)";

/** The `.verb(` registrations on a router in a module, each with its argument text. */
function registrations(code: string, router: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(new RegExp(`\\b${router}\\.(?:get|post|put|patch|delete|use)\\s*\\(`, 'g'))) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < code.length; i++) {
      if (code[i] === '(') depth++;
      else if (code[i] === ')') {
        depth--;
        if (depth === 0) {
          out.push(code.slice(open, i + 1));
          break;
        }
      }
    }
  }
  return out;
}

/** Each registration that does not go through `adapter(` — or goes through the other door's. */
const offDoor = (code: string, router: string, adapter: 'publicRoute' | 'researchRoute'): string[] => {
  const other = adapter === 'publicRoute' ? 'researchRoute' : 'publicRoute';
  return registrations(code, router).filter((args) => !args.includes(`${adapter}(`) || args.includes(`${other}(`));
};

const count = (code: string, pattern: RegExp): number => (code.match(pattern) ?? []).length;

describe('gate-by-prefix — one gate at the /api/research mount; the caller read once, by the gated adapter (ui-flows §7 :281–:284, §9 :354–:355)', () => {
  it('G1 gate-by-prefix — server.ts mounts /api/research exactly once, with requireResearcher before researchRouter, after requireStagingAccess; researchRouter is mounted nowhere else', () => {
    const code = readCode(join(SRC, 'server.ts'));
    expect(count(code, /app\.use\('\/api\/research', requireResearcher, researchRouter\)/g)).toBe(1);
    expect(code.indexOf(GATED_MOUNT)).toBeGreaterThan(code.indexOf('app.use(requireStagingAccess)'));
    const beyondImports = code.split('\n').filter((line) => !/^\s*import\b/.test(line)).join('\n');
    expect(count(beyondImports, /\bresearchRouter\b/g)).toBe(1);
  });

  it('G2 gate-by-prefix — every route of researchRoutes.ts registers through researchRoute(, every route of corpusRoutes.ts and publicThesisRoutes.ts through publicRoute(', () => {
    const research = codeAt('routes/researchRoutes.ts');
    const corpus = codeAt('routes/corpusRoutes.ts');
    const thesis = codeAt('routes/publicThesisRoutes.ts');
    expect([registrations(research, 'researchRouter').length, ['corpusRouter', 'pagesRouter', 'recordsRouter'].map((r) => registrations(corpus, r).length).reduce((a, b) => a + b, 0), registrations(thesis, 'publicThesisRouter').length]).toEqual([15, 9, 4]);
    expect(offDoor(research, 'researchRouter', 'researchRoute')).toEqual([]);
    expect(['corpusRouter', 'pagesRouter', 'recordsRouter'].flatMap((r) => offDoor(corpus, r, 'publicRoute'))).toEqual([]);
    expect(offDoor(thesis, 'publicThesisRouter', 'publicRoute')).toEqual([]);
  });

  /** The reads of the caller under src/routes, by file. */
  const callerReads = (files: readonly { file: string; code: string }[]): { reads: [string, number][]; runs: [string, number][]; getters: string[] } => ({
    reads: files.map(({ file, code }) => [file, count(code, /\breq\.researcherId\b/g)] as [string, number]).filter(([, n]) => n > 0),
    runs: files.map(({ file, code }) => [file, count(code, /\bresearcherContext\.run\s*\(/g)] as [string, number]).filter(([, n]) => n > 0),
    getters: files.filter(({ code }) => /\bgetResearcherId\b/.test(code)).map(({ file }) => file),
  });

  it('G3 gate-by-prefix — req.researcherId is read exactly once under src/routes and researcherContext.run called once, both inside toolRoute.ts\'s researchRoute; no route module names getResearcherId', () => {
    const files = [TOOL_ROUTE_FILE, ...ROUTE_MODULE_FILES].map((file) => ({ file, code: codeAt(file) }));
    expect(callerReads(files)).toEqual({ reads: [[TOOL_ROUTE_FILE, 1]], runs: [[TOOL_ROUTE_FILE, 1]], getters: [] });
    const code = codeAt(TOOL_ROUTE_FILE);
    const at = code.search(/export\s+function\s+researchRoute\b/);
    expect(at).toBeGreaterThanOrEqual(0);
    const body = balanced(code, code.indexOf('{', code.indexOf(')', at)));
    expect([count(body, /\breq\.researcherId\b/g), count(body, /\bresearcherContext\.run\s*\(/g)]).toEqual([1, 1]);
  });

  it('G4 DETECTS a second read of req.researcherId, a mount without the gate, and a publicRoute registered on researchRouter — and the landed shapes do not fire', () => {
    expect(callerReads([{ file: 'routes/toolRoute.ts', code: 'researcherContext.run({ researcherId: req.researcherId }, go);' }, { file: 'routes/researchRoutes.ts', code: "theses.filter((t) => t.createdById === req.researcherId);" }]).reads).toEqual([['routes/toolRoute.ts', 1], ['routes/researchRoutes.ts', 1]]);
    expect(count("app.use('/api/research', researchRouter);", /app\.use\('\/api\/research', requireResearcher, researchRouter\)/g)).toBe(0);
    expect(offDoor("researchRouter.get('/pages', publicRoute(noQuery, pagesOf));", 'researchRouter', 'researchRoute')).toHaveLength(1);
    expect(offDoor("researchRouter.get('/pages', researchRoute(noQuery, pagesOf));", 'researchRouter', 'researchRoute')).toEqual([]);
  });

  it('G5 gate-by-prefix — every research route answers 401 with no bearer and an unverified one, 403 for a login with no researcher and an unapproved one — one body per kind across the fourteen routes of the table and a made-up id (the fifteenth: documentsRoute.test.ts) — before any lookup but the gate\'s', async () => {
    const paths = [...RESEARCH_ROUTES.map((r) => r.path), `/api/research/theses/${MISSING_THESIS_ID}`];
    const kinds = { none: null, unverified: TOKEN.unverified, stranger: TOKEN.stranger, pending: TOKEN.pending } as const;
    const seen: Record<string, Set<string>> = {};
    for (const path of paths) {
      for (const [kind, token] of Object.entries(kinds)) {
        resetDouble();
        thesisWorld();
        const { status, text } = await get(path, 'research', token);
        (seen[kind] ??= new Set()).add(JSON.stringify([status, text]));
        expect([path, kind, delegatesCalled().filter((d) => d !== 'researcher.findUnique')]).toEqual([path, kind, []]);
      }
    }
    // ONE answer per kind across every route and id: the set holds a single [status, body].
    const one = (kind: string): unknown => [...(seen[kind] ?? [])].map((a) => JSON.parse(a) as [number, string]);
    expect(Object.fromEntries(Object.keys(kinds).map((kind) => [kind, one(kind)]))).toEqual({
      none: [[401, '{"error":"Unauthorized","message":"Missing Authorization: Bearer <token>"}']],
      unverified: [[401, '{"error":"Unauthorized","message":"Invalid or expired Supabase token"}']],
      stranger: [[403, '{"error":"Forbidden","message":"No researcher account for this login. Register first."}']],
      pending: [[403, '{"error":"Forbidden","message":"Account \'pending_1\' is not yet approved."}']],
    });
  });
});

// --- no-surveyed-page-anonymous ---------------------------------------------------------------------------------------

/** A public route module that lists surveyed pages: a TrackedUrl MODEL access, the page-listing names, or `'all'` (round 2 M1). */
function listsPages(code: string): string[] {
  const found: string[] = [];
  if (/\b(?:prisma|tx|db)\.trackedUrl\./.test(code) || /(?<![\w/:])trackedUrl\.(?:findMany|findUnique|findFirst|count)\b/.test(code)) found.push('accesses the TrackedUrl model');
  for (const m of code.matchAll(/\b(?:listPages|pagesOf|pagesInScope)\b/g)) found.push(`names ${m[0]}`);
  if (/['"]all['"]/.test(code)) found.push("passes 'all'");
  return found;
}

/** Does a body name a page nobody opened, by url or by id. */
const namesPrivatePages = (text: string): string[] => [PAGE_2.url, PAGE_2.id, PAGE_3.url, PAGE_3.id].filter((s) => text.includes(s));

describe('no-surveyed-page-anonymous — no public route lists surveyed pages or answers scope all (ui-flows §9 :356–:357; A5 :1064)', () => {
  it('N1 no-surveyed-page-anonymous — no public route module accesses the TrackedUrl model, names listPages / pagesOf / pagesInScope, or passes the literal \'all\'', () => {
    expect(['routes/corpusRoutes.ts', 'routes/publicThesisRoutes.ts'].map((file) => [file, listsPages(codeAt(file))])).toEqual([
      ['routes/corpusRoutes.ts', []],
      ['routes/publicThesisRoutes.ts', []],
    ]);
  });

  it('N2 no-surveyed-page-anonymous — no public 200 body names a page nobody opened; ?scope=all on the three public corpus routes is 400 INVALID_PARAMETER; /api/research/pages without a bearer is 401', async () => {
    for (const row of PUBLIC_ROUTES) {
      resetDouble();
      row.seed();
      const { status, text } = await get(row.path, 'public');
      expect([row.path, status, namesPrivatePages(text)]).toEqual([row.path, 200, []]);
    }
    resetDouble();
    corpusWorld();
    for (const path of ['/api/corpus?scope=all', '/api/corpus/claims?scope=all', `/api/corpus/search?phrase=${enc(PHRASE)}&scope=all`]) {
      const { status, text } = await get(path, 'public');
      expect([path, status, (JSON.parse(text) as Refusal).code]).toEqual([path, 400, 'INVALID_PARAMETER']);
    }
    expect((await get('/api/research/pages', 'research', null)).status).toBe(401);
  });

  it('N3 no-surveyed-page-anonymous — every tool that takes scope refuses scope all with no identity: list_corpus, list_trajectories, search_corpus, list_theses, list_thesis_reviews (a control: UI-2 built these refusals)', async () => {
    corpusWorld();
    actAs(null);
    const codes = [
      await listCorpusHandler({ scope: 'all' }),
      await listTrajectoriesHandler({ scope: 'all' }),
      await searchCorpusHandler({ scope: 'all', phrase: PHRASE }),
      await listThesesHandler({ scope: 'all' }),
      await listThesisReviewsHandler({ scope: 'all' }),
    ].map((out) => (JSON.parse(out) as Refusal).code);
    expect(codes).toEqual(['NO_RESEARCHER', 'NO_RESEARCHER', 'NO_RESEARCHER', 'NO_RESEARCHER', 'NO_RESEARCHER']);
  });

  it("N4 DETECTS a public router listing TrackedUrl rows — by scan and by call on a planted router; the survivors '/:trackedUrlId/findings', ref.load() and { trackedUrlId: page.id } do not fire", async () => {
    expect(listsPages('const pages = await prisma.trackedUrl.findMany({});')).toEqual(['accesses the TrackedUrl model']);
    expect(listsPages("pagesRouter.get('/', publicRoute(noQuery, pagesOf));")).toEqual(['names pagesOf']);
    expect(listsPages("pagesRouter.get('/:trackedUrlId/findings', publicRoute(read, findingsOf));\nconst page = await ref.load();\nconst row = { trackedUrlId: page.id };")).toEqual([]);

    const { publicRoute } = await toolRoute();
    corpusWorld();
    const planted = express.Router();
    planted.get('/', publicRoute(() => ({ input: {} }), async () => JSON.parse(await listPagesHandler()) as unknown));
    const app = express();
    app.use('/api/pages-planted', planted);
    const res = await request(app).get('/api/pages-planted');
    // THE ID ARM OF THE DETECTOR FIRES FOR THE FIRST TIME, 2026-09-20 (R66). `namesPrivatePages` has looked for
    // `PAGE_2.id` and `PAGE_3.id` since it was written, and until `list_pages` gained `trackedUrlId` (interaction
    // A5 :1071, the envelope RULED by the researcher) nothing could ever make it — so half the detector was
    // unexercised and this case could not have told a url leak from an id leak. It can now: the planted public
    // router leaks BOTH, and N2 holds that the real public routes leak NEITHER.
    expect([res.status, namesPrivatePages(res.text)]).toEqual([200, [PAGE_2.url, PAGE_2.id, PAGE_3.url, PAGE_3.id]]);
  });
});

// --- one row, one load ------------------------------------------------------------------------------------------------

/**
 * A PAGE NAMED AT A DOOR IS LOADED ONCE — docs/gf-ui-refactor-plan.md UI-3 :243 ("no row is loaded twice"), the R53 sketch
 * §0a / §b1: a core calls its `PageRef`'s `load()` exactly where its refusal order puts the lookup, from the tool (by url)
 * and from the route (by id) alike. Counted on `trackedUrl.findUnique`, the one delegate both `loadPage` and
 * `loadPageById` ask (and the walk's handlers' own url lookup).
 *
 * THE ONE LEGITIMATE SECOND CALLER, NAMED: the two trajectory reads — `getStoredClaimTrajectories` → `loadDetectionInputs`
 * (services/claimTrajectory.ts :429) looks the page up again by url to hash its current state. That lookup belongs to the
 * stored read and not to the door, so a named page costs 2 there, and the case says so.
 */
interface OneLoad {
  read: string;
  seed: () => void;
  tool: () => Promise<string>;
  path: string;
  door: Door;
  /** `trackedUrl.findUnique` calls per call — 1 unless a named caller beyond the door's ref asks too. */
  loads: number;
}

const ONE_LOAD: readonly OneLoad[] = [
  { read: 'list_findings', seed: corpusWorld, tool: () => listFindingsHandler({ url: URL }), path: `/api/pages/${PAGE.id}/findings`, door: 'public', loads: 1 },
  { read: 'get_diff_input', seed: corpusWorld, tool: () => getDiffInputHandler({ url: URL, before: BEFORE.waybackTimestamp, after: AFTER.waybackTimestamp }), path: `/api/pages/${PAGE.id}/diffs/${BEFORE.waybackTimestamp}/${AFTER.waybackTimestamp}`, door: 'public', loads: 1 },
  { read: 'check_on_chain_status (page and capture)', seed: corpusWorld, tool: () => checkOnChainStatusHandler({ url: URL, capture: BEFORE.waybackTimestamp }), path: `/api/pages/${PAGE.id}/captures/${BEFORE.waybackTimestamp}/chain`, door: 'public', loads: 1 },
  { read: 'list_corpus (a named page)', seed: corpusWorld, tool: () => asAuthor(() => listCorpusHandler({ scope: 'all', page: URL })), path: `/api/research/corpus?page=${PAGE.id}`, door: 'research', loads: 1 },
  { read: 'list_trajectories (a named page) — + loadDetectionInputs, claimTrajectory.ts :429', seed: corpusWorld, tool: () => asAuthor(() => listTrajectoriesHandler({ scope: 'all', page: URL })), path: `/api/research/corpus/claims?page=${PAGE.id}`, door: 'research', loads: 2 },
  { read: 'search_corpus (a named page)', seed: corpusWorld, tool: () => asAuthor(() => searchCorpusHandler({ scope: 'all', phrase: PHRASE, page: URL })), path: `/api/research/corpus/search?phrase=${enc(PHRASE)}&page=${PAGE.id}`, door: 'research', loads: 1 },
  { read: 'list_captures', seed: walkWorld, tool: () => asAuthor(() => listCapturesHandler({ url: URL })), path: `/api/research/pages/${PAGE.id}/captures`, door: 'research', loads: 1 },
  { read: 'get_article_rules', seed: walkWorld, tool: () => asAuthor(() => getArticleRulesHandler({ url: URL })), path: `/api/research/pages/${PAGE.id}/rules`, door: 'research', loads: 1 },
  { read: 'get_rule_history', seed: walkWorld, tool: () => asAuthor(() => getRuleHistoryHandler({ url: URL, ruleId: RULE_ID })), path: `/api/research/pages/${PAGE.id}/rules/${RULE_ID}/history`, door: 'research', loads: 1 },
];

describe('one row, one load — a page named at either door is looked up once (plan UI-3 :243)', () => {
  it.each(ONE_LOAD.map((r) => [r.read, r] as const))('O1 one row, one load — the TOOL door of %s asks trackedUrl.findUnique the landed number of times, and answers', async (_read, row) => {
    row.seed();
    db.trackedUrl.findUnique.mockClear();
    const out = await row.tool();
    expect([Object.keys(JSON.parse(out) as object).includes('code'), db.trackedUrl.findUnique.mock.calls.length]).toEqual([false, row.loads]);
  });

  it.each(ONE_LOAD.map((r) => [r.read, r] as const))('O2 one row, one load — the ROUTE door of %s asks trackedUrl.findUnique the same number of times, and answers 200', async (_read, row) => {
    row.seed();
    const app = await appOf();
    db.trackedUrl.findUnique.mockClear();
    const pending = request(app).get(row.path);
    const res = row.door === 'research' ? await pending.set('Authorization', `Bearer ${TOKEN.good}`) : await pending;
    expect([res.status, db.trackedUrl.findUnique.mock.calls.length]).toEqual([200, row.loads]);
  });

  it.each([
    ['list_corpus', () => listCorpusHandler({ scope: 'public', page: URL, since: '2021-06-30', until: '2021-01-01' })],
    ['list_trajectories', () => listTrajectoriesHandler({ scope: 'public', page: URL, since: '2021-06-30', until: '2021-01-01' })],
    ['search_corpus', () => searchCorpusHandler({ scope: 'public', phrase: PHRASE, page: URL, since: '2021-06-30', until: '2021-01-01' })],
  ] as const)('O3 the order holds with a named page — %s refuses INVALID_RANGE before its page is looked up (sketch §0a)', async (_read, tool) => {
    corpusWorld();
    db.trackedUrl.findUnique.mockClear();
    db.trackedUrl.findMany.mockClear();
    const out = JSON.parse(await tool()) as Refusal;
    expect([out.code, db.trackedUrl.findUnique.mock.calls.length, db.trackedUrl.findMany.mock.calls.length]).toEqual(['INVALID_RANGE', 0, 0]);
  });
});
