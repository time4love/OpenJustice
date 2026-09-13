jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('./tools') as typeof import('./tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./tools') as typeof import('./tools')).llmFactoryTripwire);

import type { Router } from 'express';
import express from 'express';
import request from 'supertest';
import { DIFF_NAME } from '../helpers/corpusFixture';
import { resetDouble, store } from '../helpers/evidenceDouble';
import { built } from './absent';
import { ANALYSIS, ATTEMPT, AUTHOR, DEBATE, MENTION, NEXT_VERSION, NOTE, ROUNDS, THESIS, VERSION, WITHDRAWAL } from './fixtures';
import { AS_PUBLISHED, actAs, containsDeep, resetTools, seedThesis, tripped } from './tools';

// ---------------------------------------------------------------------------
// A5's THREE PUBLIC READS — docs/gf-thesis-flows.md A5 (:1559–:1570), T6
// (:914–:918), A7's standing list (:1686–:1689); the R40 sketch §5i. THESIS STEP 23
// builds `routes/publicThesisRoutes.ts` (never `routes/thesisRoutes`, a retired
// module path).
//
// MOUNTED WHERE server.ts MOUNTS EVERY ROUTER, `/api/<area>` — so the router serves
// `/`, `/:id` and `/:id/versions/:v` under `/api/thesis`, the three paths A5 names.
//
// IDENTICAL BYTES WITH AND WITHOUT A RESEARCHER. "With" is BOTH ways one can arrive:
// a researcher in context and a bearer token on the request. A PUBLIC read reads
// neither (A4 :1420; A5 :1561 "all PUBLIC and identity-free").
//
// THE SHAPE TEST IS BY VALUE. Every private row the world holds — an analysis, the
// attempt's assessment and its objection, the framing rounds, the debate, a note —
// carries a MARKER, and no marker may reach any of the three bodies. A field's NAME is
// the builder's; what may not reach a public read is its CONTENT.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

/** The router, mounted at `/api/thesis` — red by name until step 23 builds it. */
async function app(): Promise<ReturnType<typeof express>> {
  const { publicThesisRouter } = await built<{ publicThesisRouter: Router }>('routes/publicThesisRoutes');
  const server = express();
  server.use('/api/thesis', publicThesisRouter);
  return server;
}

/** One GET, as no one and then as a researcher arriving both ways. */
async function bothWays(server: ReturnType<typeof express>, path: string) {
  actAs(null);
  const anonymous = await request(server).get(path);
  actAs(AUTHOR);
  const researcher = await request(server).get(path).set('Authorization', 'Bearer a-researcher-token');
  actAs(null);
  return { anonymous, researcher };
}

const READS = [`/api/thesis`, `/api/thesis/${THESIS.id}`, `/api/thesis/${THESIS.id}/versions/${VERSION.id}`];

/** What no public read may carry: the CONTENT of every private row, one marker each. */
const MARK = {
  analysis: 'MARK-ANALYSIS-OPINION',
  assessment: 'MARK-PUBLICATION-ASSESSMENT',
  objection: 'MARK-ASSESSOR-OBJECTION',
  round: 'MARK-FRAMING-ROUND',
  debate: 'MARK-DEBATE-TURN',
  note: 'MARK-RESEARCH-NOTE',
} as const;

/** THESIS published at VERSION (its attempt on record), and every private row beside it carrying a marker. */
function seedPublishedWithPrivateRows(): void {
  seedThesis(AS_PUBLISHED);
  store.attempts = [
    { ...ATTEMPT, verdict: 'DISPUTES', assessment: { reasoning: MARK.assessment, objection: MARK.objection, names: [] } },
  ];
  store.analyses = [{ ...ANALYSIS, opinion: { counterArguments: [MARK.analysis] } }];
  store.framingRounds = ROUNDS.map((r) => ({ ...r, content: { marker: MARK.round, of: r.content } }));
  store.debates = [{ ...DEBATE, verdict: MARK.debate }];
  store.session = { ...DEBATE, events: [{ type: 'RATIONALE_SUBMITTED', content: MARK.debate }] };
  store.notes = [{ ...NOTE, text: MARK.note }];
}

describe("A5's public reads — identical for everyone (thesis step 23)", () => {
  it('each of the three reads answers the SAME BYTES with and without a researcher, and asks no model (A7 :1686; A5 :1561)', async () => {
    const server = await app();
    seedPublishedWithPrivateRows();
    for (const path of READS) {
      const { anonymous, researcher } = await bothWays(server, path);
      expect([path, anonymous.status]).toEqual([path, 200]);
      expect([path, researcher.status, researcher.text]).toEqual([path, anonymous.status, anonymous.text]);
    }
    expect(tripped).toEqual([]);
  });

  it('a thesis NEVER published is 404 — and so is an id naming none (A5 :1569; A7 :1687)', async () => {
    const server = await app();
    seedThesis();
    const never = await request(server).get(`/api/thesis/${THESIS.id}`);
    const none = await request(server).get('/api/thesis/thesis-that-does-not-exist');
    expect([never.status, none.status]).toEqual([404, 404]);
  });

  it("GET /:id carries the PUBLISHED version by VALUE — its text and contentHash, its citation resolved with its pin, and the rationale — never the head's, which moved on after it (sketch §5i; A5 :1565–:1568; T5 :811–:814, :822, :801–:802; plan step 23 :149–:150)", async () => {
    const server = await app();
    // Published at VERSION; the head is NEXT_VERSION, written after and never published.
    seedThesis({ ...AS_PUBLISHED, headVersionId: NEXT_VERSION.id });
    store.versions = [VERSION, NEXT_VERSION];
    store.attempts = [ATTEMPT];
    const res = await request(server).get(`/api/thesis/${THESIS.id}`);
    const body: unknown = res.body;
    expect(res.status).toBe(200);
    expect([containsDeep(body, VERSION.text), containsDeep(body, VERSION.contentHash)]).toEqual([true, true]);
    // EACH MENTION RESOLVED WITH ITS PIN (A5 :1566; T5 :812–:814): the record's name and
    // the pinned content version, each a VALUE of its own — deep equality, so the token
    // inside the text does not stand in for either.
    expect([containsDeep(body, DIFF_NAME), containsDeep(body, MENTION.contentVersionHash)]).toEqual([true, true]);
    // THE RATIONALE (A5 :1567; T5 :822) is the researcher's words, the attempt's `rationale` and never its `assessment`, where the shape test's markers sit — so the two cases do not conflict.
    expect(containsDeep(body, ATTEMPT.rationale)).toBe(true);
    expect([containsDeep(body, NEXT_VERSION.text), containsDeep(body, NEXT_VERSION.contentHash)]).toEqual([false, false]);
  });

  it('a WITHDRAWN thesis answers the NOTICE — not 404, and neither its text nor the reason (T6 :914–:916; A5 :1568–:1569)', async () => {
    const server = await app();
    seedThesis();
    store.attempts = [ATTEMPT];
    store.withdrawals = [WITHDRAWAL];
    const res = await request(server).get(`/api/thesis/${THESIS.id}`);
    expect(res.status).toBe(200);
    // "withdrawn by its author on this date. Not the text, not the reason."
    expect(res.text).toContain(WITHDRAWAL.createdAt.toISOString().slice(0, 10));
    expect([res.text.includes(WITHDRAWAL.reason), res.text.includes(VERSION.text.trim())]).toEqual([false, false]);
  });

  it('THE SHAPE TEST: no field of any analysis, assessment, objection, framing round, debate or note reaches any of the three bodies (A7 :1688–:1689; §9 :994)', async () => {
    const server = await app();
    seedPublishedWithPrivateRows();
    for (const path of READS) {
      const res = await request(server).get(path);
      expect([path, Object.values(MARK).filter((mark) => res.text.includes(mark))]).toEqual([path, []]);
    }
  });

  it('/versions/:v — a version NEVER published is 404, and one EVER published answers (A5 :1570)', async () => {
    const server = await app();
    // Published at VERSION; the head has moved on to NEXT_VERSION, written and never published.
    seedThesis({ ...AS_PUBLISHED, headVersionId: NEXT_VERSION.id });
    store.versions = [VERSION, NEXT_VERSION];
    store.attempts = [ATTEMPT];
    const ever = await request(server).get(`/api/thesis/${THESIS.id}/versions/${VERSION.id}`);
    const never = await request(server).get(`/api/thesis/${THESIS.id}/versions/${NEXT_VERSION.id}`);
    expect([ever.status, never.status]).toEqual([200, 404]);
  });
});
