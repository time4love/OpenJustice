jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);
jest.mock('../src/middleware/supabaseAuth', () => (require('./helpers/gateDouble') as typeof import('./helpers/gateDouble')).supabaseAuthDouble);

import request from 'supertest';
import { getDebateHandler } from '../src/mcp/tools/getDebate';
import { getFramingHandler } from '../src/mcp/tools/getFraming';
import { getThesisContextHandler } from '../src/mcp/tools/getThesisContext';
import { listCorpusHandler } from '../src/mcp/tools/listCorpus';
import { listEvidenceReviewsHandler } from '../src/mcp/tools/listEvidenceReviews';
import { listFramingsHandler } from '../src/mcp/tools/listFramings';
import { listPagesHandler } from '../src/mcp/tools/listPages';
import { listThesesHandler } from '../src/mcp/tools/listTheses';
import { listThesisReviewsHandler } from '../src/mcp/tools/listThesisReviews';
import { listTrajectoriesHandler } from '../src/mcp/tools/listTrajectories';
import { searchCorpusHandler } from '../src/mcp/tools/searchCorpus';
import { getArticleRulesHandler, getRuleHistoryHandler, listCapturesHandler } from '../src/walk/tools';
import { PAGE, URL } from './helpers/corpusFixture';
import { resetDouble, store, windows, written } from './helpers/evidenceDouble';
import {
  MISSING_PAGE_ID,
  MISSING_THESIS_ID,
  OTHER_PAGES_RULE_ID,
  PAGE_2,
  PHRASE,
  RULE_ID,
  SESSION_ID,
  TOKEN,
  appOf,
  seedCorpusWorld,
  seedDebate,
  seedEvidenceReview,
  seedGate,
  seedThesisWorld,
  seedWalkWorld,
  thrown,
} from './helpers/routeWorld';
import { AUTHOR, FRAMING, THESIS } from './thesis/fixtures';
import { actAs, researcherContextDouble, resetTools, tripped } from './thesis/tools';

// ---------------------------------------------------------------------------
// THE RESEARCHER'S READ VIEW, STATUS BY STATUS — docs/gf-ui-flows.md §7 :278–:310 (the fourteen gated routes, ONE
// mount-level gate, a 404 inside the prefix naming its refusal), §7.1 :312–:327 (`scope` fixed to `all` by the route);
// docs/gf-ui-refactor-plan.md UI-3 :253–:260; the R53 sketch §a3 and §d3 (round 2). WRITTEN FIRST, RED BY NAME until
// UI-3 builds `routes/researchRoutes` — the app is `test/helpers/routeWorld.ts`' `appOf`, loaded with the owner "UI-3".
//
// Every call carries the approved researcher's bearer (`Bearer good`); the gate's own statuses are `test/routeIsTool.
// test.ts` G5's. Each 200 is the tool's answer as that researcher, byte for byte; each refusal inside the prefix is the
// tool's `{ error, code }` VERBATIM — a researcher reads working state, and its words (§7 :308–:310). A `scope` in the
// query is a malformed parameter: the route fixes it (plan :256).
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
  thrown.length = 0;
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** The tool's answer as the approved researcher, the context left empty after it. */
async function asAuthor(tool: () => Promise<string>): Promise<string> {
  actAs(AUTHOR);
  try {
    return await tool();
  } finally {
    actAs(null);
  }
}

async function get(path: string): Promise<{ status: number; text: string; body: Record<string, unknown> }> {
  const res = await request(await appOf()).get(path).set('Authorization', `Bearer ${TOKEN.good}`);
  return { status: res.status, text: res.text, body: res.body as Record<string, unknown> };
}

const thesisWorld = (): void => {
  seedThesisWorld();
  seedGate();
};
const corpusWorld = (): void => {
  seedCorpusWorld();
  seedGate();
};
const walkWorld = (): void => {
  seedWalkWorld();
  seedGate();
};

const invalidParameter = (answer: { status: number; body: Record<string, unknown> }): unknown[] => [answer.status, answer.body['code']];

describe('the thesis lists and one thesis (§7 :288–:294)', () => {
  it('S1 GET /api/research/reviews answers list_thesis_reviews at all as the caller; ?scope=mine is 400 INVALID_PARAMETER', async () => {
    thesisWorld();
    const all = await get('/api/research/reviews');
    expect([all.status, all.text]).toEqual([200, await asAuthor(() => listThesisReviewsHandler({ scope: 'all' }))]);
    expect(invalidParameter(await get('/api/research/reviews?scope=mine'))).toEqual([400, 'INVALID_PARAMETER']);
  });

  it('S2 GET /api/research/evidence-reviews answers list_evidence_reviews — over a world owing one CONTENT_MOVED review, never the empty answer', async () => {
    thesisWorld();
    seedEvidenceReview();
    const tool = await asAuthor(() => listEvidenceReviewsHandler());
    expect((JSON.parse(tool) as { reviews: { kind: string }[] }).reviews.map((r) => r.kind)).toEqual(['CONTENT_MOVED']);
    const reviews = await get('/api/research/evidence-reviews');
    expect([reviews.status, reviews.text]).toEqual([200, tool]);
  });

  it('S3 GET /api/research/theses answers list_theses at all, each entry with author and mine; ?scope= is 400', async () => {
    thesisWorld();
    const theses = await get('/api/research/theses');
    expect([theses.status, theses.text]).toEqual([200, await asAuthor(() => listThesesHandler({ scope: 'all' }))]);
    const entries = theses.body['theses'] as Record<string, unknown>[];
    expect(entries.length > 0 && entries.every((e) => typeof e['author'] === 'string' && typeof e['mine'] === 'boolean')).toBe(true);
    expect(invalidParameter(await get('/api/research/theses?scope=all'))).toEqual([400, 'INVALID_PARAMETER']);
  });

  it('S4 GET /api/research/theses/:id — 200 the context; a made-up id 404 { error, code: NO_THESIS } verbatim; since=yesterday 400 INVALID_PARAMETER', async () => {
    thesisWorld();
    const context = await get(`/api/research/theses/${THESIS.id}`);
    expect([context.status, context.text]).toEqual([200, await asAuthor(() => getThesisContextHandler({ thesisId: THESIS.id }))]);
    const missing = await asAuthor(() => getThesisContextHandler({ thesisId: MISSING_THESIS_ID }));
    expect((JSON.parse(missing) as { code: string }).code).toBe('NO_THESIS');
    const refused = await get(`/api/research/theses/${MISSING_THESIS_ID}`);
    expect([refused.status, refused.text]).toEqual([404, missing]);
    expect(invalidParameter(await get(`/api/research/theses/${THESIS.id}?since=yesterday`))).toEqual([400, 'INVALID_PARAMETER']);
  });

  it('S5 GET /api/research/framings 200; /framings/:id a made-up id 404 NO_FRAMING verbatim', async () => {
    thesisWorld();
    const list = await get('/api/research/framings');
    expect([list.status, list.text]).toEqual([200, await asAuthor(() => listFramingsHandler())]);
    const one = await get(`/api/research/framings/${FRAMING.id}`);
    expect([one.status, one.text]).toEqual([200, await asAuthor(() => getFramingHandler({ framingId: FRAMING.id }))]);
    const missing = await asAuthor(() => getFramingHandler({ framingId: 'framing-that-does-not-exist' }));
    const refused = await get('/api/research/framings/framing-that-does-not-exist');
    expect([refused.status, refused.text, (JSON.parse(missing) as { code: string }).code]).toEqual([404, missing, 'NO_FRAMING']);
  });

  it('S6 GET /api/research/debates/:sessionId — 200; a made-up id 404 SESSION_NOT_FOUND verbatim', async () => {
    thesisWorld();
    seedDebate();
    const debate = await get(`/api/research/debates/${SESSION_ID}`);
    expect([debate.status, debate.text]).toEqual([200, await asAuthor(() => getDebateHandler({ sessionId: SESSION_ID }))]);
    // THE DOUBLE ANSWERS ITS ONE SESSION TO ANY id (`defaultSessionLookup`), so the made-up id is asked of a world holding none.
    store.session = null;
    const missing = await asAuthor(() => getDebateHandler({ sessionId: 'session-that-does-not-exist' }));
    const refused = await get('/api/research/debates/session-that-does-not-exist');
    expect([refused.status, refused.text, (JSON.parse(missing) as { code: string }).code]).toEqual([404, missing, 'SESSION_NOT_FOUND']);
  });
});

describe('the corpus at scope all, and the pages (§7 :295–:298)', () => {
  it('S7 GET /api/research/corpus answers list_corpus at all — the private page with public: false; ?page=<made-up id> 404 { code: NOT_SURVEYED } worded by the id', async () => {
    corpusWorld();
    const all = await get('/api/research/corpus');
    expect([all.status, all.text]).toEqual([200, await asAuthor(() => listCorpusHandler({ scope: 'all' }))]);
    const facet = all.body['pages'] as { trackedUrlId: string; public: boolean }[];
    expect(facet.find((p) => p.trackedUrlId === PAGE_2.id)?.public).toBe(false);
    const privatePage = await get(`/api/research/corpus?page=${PAGE_2.id}`);
    expect([privatePage.status, privatePage.text]).toEqual([200, await asAuthor(() => listCorpusHandler({ scope: 'all', page: PAGE_2.url }))]);
    const missing = await get(`/api/research/corpus?page=${MISSING_PAGE_ID}`);
    expect([missing.status, missing.body['code'], String(missing.body['error']).includes(MISSING_PAGE_ID)]).toEqual([404, 'NOT_SURVEYED', true]);
  });

  it('S8 GET /api/research/corpus/claims and /corpus/search answer at all', async () => {
    corpusWorld();
    const claims = await get('/api/research/corpus/claims');
    expect([claims.status, claims.text]).toEqual([200, await asAuthor(() => listTrajectoriesHandler({ scope: 'all' }))]);
    const search = await get(`/api/research/corpus/search?phrase=${encodeURIComponent(PHRASE)}`);
    expect([search.status, search.text]).toEqual([200, await asAuthor(() => searchCorpusHandler({ scope: 'all', phrase: PHRASE }))]);
  });

  it('S9 GET /api/research/pages answers list_pages', async () => {
    corpusWorld();
    const pages = await get('/api/research/pages');
    expect([pages.status, pages.text]).toEqual([200, await asAuthor(() => listPagesHandler())]);
  });
});

describe('the walk\'s three reads (§7 :299–:303)', () => {
  it('S10 GET /api/research/pages/:id/captures — 200; ?outcome=STORED 400 INVALID_OUTCOME verbatim; ?other=1 400 INVALID_PARAMETER; a made-up page 404 NOT_SURVEYED', async () => {
    walkWorld();
    const captures = await get(`/api/research/pages/${PAGE.id}/captures`);
    expect([captures.status, captures.text]).toEqual([200, await asAuthor(() => listCapturesHandler({ url: URL }))]);
    const notAnOutcome = await asAuthor(() => listCapturesHandler({ url: URL, outcome: 'STORED' }));
    const refused = await get(`/api/research/pages/${PAGE.id}/captures?outcome=STORED`);
    expect([refused.status, refused.text, (JSON.parse(notAnOutcome) as { code: string }).code]).toEqual([400, notAnOutcome, 'INVALID_OUTCOME']);
    expect(invalidParameter(await get(`/api/research/pages/${PAGE.id}/captures?other=1`))).toEqual([400, 'INVALID_PARAMETER']);
    const missing = await get(`/api/research/pages/${MISSING_PAGE_ID}/captures`);
    expect([missing.status, missing.body['code']]).toEqual([404, 'NOT_SURVEYED']);
  });

  it('S11 GET /api/research/pages/:id/rules 200; /rules/:ruleId/history 200 with removed null on a row holding no body; a rule of no page 404 NO_SUCH_RULE', async () => {
    walkWorld();
    const rules = await get(`/api/research/pages/${PAGE.id}/rules`);
    expect([rules.status, rules.text]).toEqual([200, await asAuthor(() => getArticleRulesHandler({ url: URL }))]);
    const history = await get(`/api/research/pages/${PAGE.id}/rules/${RULE_ID}/history`);
    expect([history.status, history.text]).toEqual([200, await asAuthor(() => getRuleHistoryHandler({ url: URL, ruleId: RULE_ID }))]);
    expect((history.body['matches'] as { removed: unknown }[]).map((m) => m.removed)).toEqual([null]);
    const noSuchRule = await asAuthor(() => getRuleHistoryHandler({ url: URL, ruleId: OTHER_PAGES_RULE_ID }));
    const refused = await get(`/api/research/pages/${PAGE.id}/rules/${OTHER_PAGES_RULE_ID}/history`);
    expect([refused.status, refused.text, (JSON.parse(noSuchRule) as { code: string }).code]).toEqual([404, noSuchRule, 'NO_SUCH_RULE']);
  });
});

describe('the context, and nothing written', () => {
  const PATHS = [
    '/api/research/reviews',
    '/api/research/evidence-reviews',
    '/api/research/theses',
    `/api/research/theses/${THESIS.id}`,
    '/api/research/framings',
    `/api/research/framings/${FRAMING.id}`,
    '/api/research/corpus',
    '/api/research/corpus/claims',
    `/api/research/corpus/search?phrase=${encodeURIComponent(PHRASE)}`,
    '/api/research/pages',
  ];

  it('S12 the context is entered for the request and left after it: getResearcherId() is null once every research route has answered', async () => {
    const answered: [string, number, string | null][] = [];
    for (const [index, path] of PATHS.entries()) {
      resetDouble();
      if (index < 6) thesisWorld();
      else corpusWorld();
      const { status } = await get(path);
      answered.push([path, status, researcherContextDouble.getResearcherId()]);
    }
    expect(answered).toEqual(PATHS.map((path) => [path, 200, null]));
  });

  it('S13 no research route writes, opens a transaction or trips the model — each answers 200, and the logs are read after each half, before the double is reset', async () => {
    const answered = async (paths: readonly string[]): Promise<void> => {
      for (const path of paths) {
        const { status } = await get(path);
        expect([path, status]).toEqual([path, 200]);
      }
    };
    thesisWorld();
    seedDebate();
    await answered([...PATHS.slice(0, 6), `/api/research/debates/${SESSION_ID}`]);
    // THE THESIS HALF, read BEFORE `resetDouble` empties the logs — a write planted in any thesis-world route reddens here.
    expect([written, windows, tripped, thrown]).toEqual([[], [], [], []]);
    resetDouble();
    walkWorld();
    await answered([`/api/research/pages/${PAGE.id}/captures`, `/api/research/pages/${PAGE.id}/rules`, `/api/research/pages/${PAGE.id}/rules/${RULE_ID}/history`]);
    expect([written, windows, tripped, thrown]).toEqual([[], [], [], []]);
  });
});
