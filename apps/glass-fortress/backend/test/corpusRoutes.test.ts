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

import request from 'supertest';
import { checkOnChainStatusHandler } from '../src/mcp/tools/checkOnChainStatus';
import { getDiffInputHandler } from '../src/mcp/tools/getDiffInput';
import { getWhistleblowerCallHandler } from '../src/mcp/tools/getWhistleblowerCall';
import { listCorpusHandler } from '../src/mcp/tools/listCorpus';
import { listFindingsHandler } from '../src/mcp/tools/listFindings';
import { listTrajectoriesHandler } from '../src/mcp/tools/listTrajectories';
import { resolveRecordHandler } from '../src/mcp/tools/resolveRecord';
import { searchCorpusHandler } from '../src/mcp/tools/searchCorpus';
import { AFTER, BEFORE, BETWEEN, DIFF_NAME, PAGE, URL } from './helpers/corpusFixture';
import { resetDouble, store, windows, written } from './helpers/evidenceDouble';
import {
  DRAFT_ID,
  MISSING_PAGE_ID,
  MISSING_THESIS_ID,
  NAMELESS,
  P2_DIFF_NAME,
  PAGE_2,
  PAGE_3,
  PHRASE,
  appOf,
  seedCorpusWorld,
  seedDraft,
  seedThesisWorld,
  thrown,
} from './helpers/routeWorld';
import { THESIS } from './thesis/fixtures';
import { delegatesCalled, resetTools, tripped } from './thesis/tools';

// ---------------------------------------------------------------------------
// THE PUBLIC CORPUS ROUTES AND THE CALL ROUTE, STATUS BY STATUS — docs/gf-ui-flows.md §6 :199–:276 (the routes and the
// ONE status table), A2 :1000–:1014 (the states a route answers); docs/gf-ui-refactor-plan.md UI-3 :229–:264; the R53
// sketch §a3 and §d2 (round 2). WRITTEN FIRST, RED BY NAME until UI-3 builds `routes/corpusRoutes` — the app is built
// through `test/helpers/routeWorld.ts`' `appOf`, which loads the route modules with the owner "UI-3".
//
// NO IDENTITY IS READ on any route here; `scope` is `public`, fixed by the route, and a `scope` in the query is a
// malformed parameter. A 404 is ONE body — `{ error: 'Not found' }` — for a page nobody opened and a page nobody
// surveyed alike. A date where a timestamp belongs reaches the core and is its NOT_A_CAPTURE (evidence A4 :1069–:1070,
// the researcher's ruling), never a 400. `GET /api/pages/:id/search` is not mounted (#487).
// ---------------------------------------------------------------------------

const NOT_FOUND = '{"error":"Not found"}';
const enc = encodeURIComponent;

beforeEach(() => {
  resetDouble();
  resetTools();
  thrown.length = 0;
  mockIsHashRegistered.mockResolvedValue({ registered: false, evidenceId: BigInt(0) });
  mockWeb3Constructor.mockImplementation(() => undefined);
  seedCorpusWorld();
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function get(path: string): Promise<{ status: number; text: string; body: Record<string, unknown> }> {
  const res = await request(await appOf()).get(path);
  return { status: res.status, text: res.text, body: res.body as Record<string, unknown> };
}

const codeOf = (out: string): unknown => (JSON.parse(out) as { code?: unknown }).code;

describe('GET /api/corpus — list_corpus at scope public (§6 :207–:208; §6.1 :236–:243)', () => {
  it('C1 GET /api/corpus answers list_corpus at public: 200, the opened page only, the facet one row', async () => {
    const tool = await listCorpusHandler({ scope: 'public' });
    const { status, text, body } = await get('/api/corpus');
    expect([status, text]).toEqual([200, tool]);
    expect((body['pages'] as { trackedUrlId: string }[]).map((p) => p.trackedUrlId)).toEqual([PAGE.id]);
  });

  it('C2 GET /api/corpus?page=<PAGE id> keeps the page; ?page=<PAGE_2 id> and ?page=<made-up> are the one 404', async () => {
    const kept = await get(`/api/corpus?page=${PAGE.id}`);
    expect([kept.status, kept.text]).toEqual([200, await listCorpusHandler({ scope: 'public', page: URL })]);
    const hidden = await get(`/api/corpus?page=${PAGE_2.id}`);
    const nothing = await get(`/api/corpus?page=${MISSING_PAGE_ID}`);
    expect([hidden.status, hidden.text, nothing.status, nothing.text]).toEqual([404, NOT_FOUND, 404, NOT_FOUND]);
  });

  it('C2b GET /api/corpus carries the facet\'s `shape` on the NAMED page alone — the bare list gets none, and a filtered single-page view gets the page\'s own (§24 region 3, ruled 2026-09-21)', async () => {
    // THE DOOR IS THE ROUTE, not the tool: region 3's card is drawn from what `/api/corpus` answers, so the
    // contract has to hold HERE or the page card goes on contradicting itself with the tool green.
    const bare = await get('/api/corpus');
    const rows = bare.body['pages'] as { trackedUrlId: string; shape: unknown }[];
    expect(rows.length > 0 && rows.every((p) => p.shape === null)).toBe(true);

    const named = await get(`/api/corpus?page=${PAGE.id}`);
    const namedRows = named.body['pages'] as { trackedUrlId: string; shape: unknown }[];
    expect(namedRows.map((p) => [p.trackedUrlId, p.shape === null])).toEqual([[PAGE.id, false]]);

    // AND IT IS THE PAGE'S SHAPE AND NOT THE VIEW'S: every chip the route accepts answers the same bytes.
    const shape = JSON.stringify(namedRows[0]?.shape);
    // `cited=true` and NOT `cited=1`: the URL the reader sees carries `1` and the READ takes a boolean, and the
    // frontend's `corpusQuery.ts` is where that one translation lives. A chip this route refuses would make the
    // loop below assert nothing, which is why the status is asserted beside the bytes.
    for (const chip of ['kind=CAPTURE', 'kind=DIFF', 'cited=true', 'limit=1', 'since=2021-01-01']) {
      const filtered = await get(`/api/corpus?page=${PAGE.id}&${chip}`);
      const row = (filtered.body['pages'] as { shape: unknown }[] | undefined)?.[0];
      expect([chip, filtered.status, JSON.stringify(row?.shape)]).toEqual([chip, 200, shape]);
    }
    // …and the chips really narrow the rows, so the equality above is not equality of two empties.
    const entriesFor = async (query: string): Promise<number> => ((await get(`/api/corpus?page=${PAGE.id}${query}`)).body['entries'] as unknown[]).length;
    expect(await entriesFor('') > await entriesFor('&kind=DIFF')).toBe(true);
  });

  it('C3 GET /api/corpus?since=2021-06-30&until=2021-01-01 is 400 INVALID_RANGE, the tool\'s refusal verbatim', async () => {
    const tool = await listCorpusHandler({ scope: 'public', since: '2021-06-30', until: '2021-01-01' });
    expect(codeOf(tool)).toBe('INVALID_RANGE');
    const { status, text } = await get('/api/corpus?since=2021-06-30&until=2021-01-01');
    expect([status, text]).toEqual([400, tool]);
  });

  it.each([
    ['since=2021-1-1'],
    ['limit=abc'],
    ['limit=101'],
    ['kind=BOTH'],
    ['cited=yes'],
    ['cursor=garbage'],
    ['scope=all'],
    ['unknown=1'],
    ['since=2021-01-01&since=2021-02-01'],
  ])('C4 a malformed parameter is 400 INVALID_PARAMETER and reaches no core: ?%s', async (query) => {
    const { status, body } = await get(`/api/corpus?${query}`);
    expect([status, body['code'], typeof body['error'] === 'string' && body['error'].trim() !== '']).toEqual([400, 'INVALID_PARAMETER', true]);
    expect(delegatesCalled()).toEqual([]);
  });
});

describe('GET /api/corpus/claims and /api/corpus/search (§6 :209–:211)', () => {
  it('C5 GET /api/corpus/claims answers list_trajectories at public, undetected included', async () => {
    const tool = await listTrajectoriesHandler({ scope: 'public' });
    const { status, text, body } = await get('/api/corpus/claims');
    expect([status, text, Object.keys(body).includes('undetected')]).toEqual([200, tool, true]);
  });

  it('C6 GET /api/corpus/search without phrase is 400 INVALID_PARAMETER; with a blank phrase 400 PHRASE_REQUIRED; with a phrase 200, the stored register', async () => {
    const absent = await get('/api/corpus/search');
    expect([absent.status, absent.body['code']]).toEqual([400, 'INVALID_PARAMETER']);
    const blank = await get(`/api/corpus/search?phrase=${enc('   ')}`);
    expect([blank.status, blank.text]).toEqual([400, await searchCorpusHandler({ scope: 'public', phrase: '   ' })]);
    const found = await get(`/api/corpus/search?phrase=${enc(PHRASE)}`);
    expect([found.status, found.text]).toEqual([200, await searchCorpusHandler({ scope: 'public', phrase: PHRASE })]);
  });
});

describe('GET /api/pages/:trackedUrlId/… — one page, named by its id (§6 :212–:217, :221–:223)', () => {
  it('C7 GET /api/pages/<PAGE id>/findings 200; <PAGE_2 id> and <made-up> the one 404', async () => {
    const page = await get(`/api/pages/${PAGE.id}/findings`);
    expect([page.status, page.text]).toEqual([200, await listFindingsHandler({ url: URL })]);
    const hidden = await get(`/api/pages/${PAGE_2.id}/findings`);
    const nothing = await get(`/api/pages/${MISSING_PAGE_ID}/findings`);
    expect([hidden.status, hidden.text, nothing.status, nothing.text]).toEqual([404, NOT_FOUND, 404, NOT_FOUND]);
  });

  it('C8 GET /api/pages/:id/diffs/:before/:after — 200 on a written pair; a DATE for before is the 404 of NOT_A_CAPTURE, never a 400; a pair the walk never wrote 404; a pair with no CURRENT version 409 { error, code: AWAITING_DERIVATION }', async () => {
    const pair = { url: URL, before: BEFORE.waybackTimestamp, after: AFTER.waybackTimestamp };
    const written_ = await get(`/api/pages/${PAGE.id}/diffs/${pair.before}/${pair.after}`);
    expect([written_.status, written_.text]).toEqual([200, await getDiffInputHandler(pair)]);

    expect(codeOf(await getDiffInputHandler({ ...pair, before: '2020-12-09' }))).toBe('NOT_A_CAPTURE');
    const dated = await get(`/api/pages/${PAGE.id}/diffs/2020-12-09/${pair.after}`);
    expect([dated.status, dated.text]).toEqual([404, NOT_FOUND]);

    expect(codeOf(await getDiffInputHandler({ ...pair, after: BETWEEN.waybackTimestamp }))).toBe('NO_SUCH_DIFF');
    const unwritten = await get(`/api/pages/${PAGE.id}/diffs/${pair.before}/${BETWEEN.waybackTimestamp}`);
    expect([unwritten.status, unwritten.text]).toEqual([404, NOT_FOUND]);

    store.diffs = store.diffs.map((d) => (d['id'] === 'diff-1' ? { ...d, contentVersions: [] } : d));
    const awaiting = await getDiffInputHandler(pair);
    expect(codeOf(awaiting)).toBe('AWAITING_DERIVATION');
    const underived = await get(`/api/pages/${PAGE.id}/diffs/${pair.before}/${pair.after}`);
    expect([underived.status, underived.text]).toEqual([409, awaiting]);
  });

  it('C9 GET /api/pages/<PAGE id>/trajectories is list_trajectories({ scope: public, page }); <PAGE_3 id> is not public — 404; a query parameter is 400', async () => {
    const page = await get(`/api/pages/${PAGE.id}/trajectories`);
    expect([page.status, page.text]).toEqual([200, await listTrajectoriesHandler({ scope: 'public', page: URL })]);
    expect(codeOf(await listTrajectoriesHandler({ scope: 'public', page: PAGE_3.url }))).toBe('NOT_PUBLIC');
    const hidden = await get(`/api/pages/${PAGE_3.id}/trajectories`);
    expect([hidden.status, hidden.text]).toEqual([404, NOT_FOUND]);
    const ranged = await get(`/api/pages/${PAGE.id}/trajectories?since=2021-01-01`);
    expect([ranged.status, ranged.body['code']]).toEqual([400, 'INVALID_PARAMETER']);
  });

  it('C10 GET /api/pages/:id/captures/:capture/chain — 200 with the chain\'s answer; a date for capture 404; the chain unreachable 503 { error, code: CHAIN_UNAVAILABLE }', async () => {
    const at = { url: URL, capture: BEFORE.waybackTimestamp };
    const checked = await get(`/api/pages/${PAGE.id}/captures/${at.capture}/chain`);
    expect([checked.status, checked.text]).toEqual([200, await checkOnChainStatusHandler(at)]);

    expect(codeOf(await checkOnChainStatusHandler({ ...at, capture: '2020-12-09' }))).toBe('NOT_A_CAPTURE');
    const dated = await get(`/api/pages/${PAGE.id}/captures/2020-12-09/chain`);
    expect([dated.status, dated.text]).toEqual([404, NOT_FOUND]);

    mockWeb3Constructor.mockImplementation(() => {
      throw new Error('no RPC configured');
    });
    const unavailable = await checkOnChainStatusHandler(at);
    expect(codeOf(unavailable)).toBe('CHAIN_UNAVAILABLE');
    const down = await get(`/api/pages/${PAGE.id}/captures/${at.capture}/chain`);
    expect([down.status, down.text]).toEqual([503, unavailable]);
  });
});

describe('GET /api/records/:fileHash and GET /api/thesis/:id/call (§6 :205–:206, :218)', () => {
  it('C11 GET /api/records/:fileHash — 200 for the promoted record; a name nothing resolves 404; a record of a private page 404', async () => {
    const promoted = await get(`/api/records/${DIFF_NAME}`);
    expect([promoted.status, promoted.text]).toEqual([200, await resolveRecordHandler({ fileHash: DIFF_NAME })]);
    expect([codeOf(await resolveRecordHandler({ fileHash: NAMELESS })), codeOf(await resolveRecordHandler({ fileHash: P2_DIFF_NAME }))]).toEqual(['NOT_A_RECORD', 'NOT_PUBLIC']);
    const nothing = await get(`/api/records/${NAMELESS}`);
    const hidden = await get(`/api/records/${P2_DIFF_NAME}`);
    expect([nothing.status, nothing.text, hidden.status, hidden.text]).toEqual([404, NOT_FOUND, 404, NOT_FOUND]);
  });

  it('C12 GET /api/thesis/:id/call — 200 live true for the published thesis; 200 { live: false } for the draft and for a made-up id, byte-identical', async () => {
    resetDouble();
    seedThesisWorld();
    seedDraft();
    const live = await get(`/api/thesis/${THESIS.id}/call`);
    expect([live.status, live.text, live.body['live']]).toEqual([200, await getWhistleblowerCallHandler({ thesisId: THESIS.id }), true]);
    const draft = await get(`/api/thesis/${DRAFT_ID}/call`);
    const nothing = await get(`/api/thesis/${MISSING_THESIS_ID}/call`);
    expect([draft.status, draft.text, nothing.status, nothing.text]).toEqual([200, '{"live":false}', 200, '{"live":false}']);
  });

  it('C13 GET /api/pages/:id/search is not mounted — 404 and no core called (#487)', async () => {
    const { status } = await get(`/api/pages/${PAGE.id}/search?phrase=${enc(PHRASE)}`);
    expect(status).toBe(404);
    expect(delegatesCalled()).toEqual([]);
  });
});

describe('the public routes write nothing', () => {
  it('C14 no public route writes, opens a transaction or trips the model', async () => {
    const paths = [
      '/api/corpus',
      '/api/corpus/claims',
      `/api/corpus/search?phrase=${enc(PHRASE)}`,
      `/api/pages/${PAGE.id}/findings`,
      `/api/pages/${PAGE.id}/diffs/${BEFORE.waybackTimestamp}/${AFTER.waybackTimestamp}`,
      `/api/pages/${PAGE.id}/trajectories`,
      `/api/pages/${PAGE.id}/captures/${BEFORE.waybackTimestamp}/chain`,
      `/api/records/${DIFF_NAME}`,
      `/api/thesis/${THESIS.id}/call`,
    ];
    for (const path of paths) {
      const { status } = await get(path);
      expect([path, status]).toEqual([path, 200]);
    }
    expect([written, windows, tripped, thrown]).toEqual([[], [], [], []]);
  });
});
