jest.mock('../src/lib/prisma', () => (require('./document/world') as typeof import('./document/world')).prismaDouble);
jest.mock('../src/services/documentBucket', () => (require('./document/world') as typeof import('./document/world')).bucketDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./document/world') as typeof import('./document/world')).llmDouble);
// THE GATE, doubled by the one fact this case needs from it: which of its answers it gives, and — when it admits — the
// researcher it sets. Its own arms are `researcherIdentity`'s, held in `routeIsTool.test.ts` G5 for the table's routes.
jest.mock('../src/middleware/researcherIdentity', () => ({
  requireResearcher: (
    req: { headers: Record<string, string | undefined>; researcherId?: string },
    res: { status: (n: number) => { json: (b: unknown) => void } },
    next: () => void,
  ) => {
    const who = req.headers['x-test-researcher'];
    if (who === 'stranger') {
      res.status(403).json({ error: 'Forbidden', message: 'No researcher account for this login. Register first.' });
      return;
    }
    if (who === undefined) {
      res.status(401).json({ error: 'Unauthorized', message: 'Missing Authorization: Bearer <token>' });
      return;
    }
    req.researcherId = who;
    next();
  },
}));

import express from 'express';
import request from 'supertest';
import { researcherContext } from '../src/context/researcherContext';
import { listDocumentsHandler } from '../src/mcp/tools/documentTools';
import { requireResearcher } from '../src/middleware/researcherIdentity';
import { researchRouter } from '../src/routes/researchRoutes';
import { resetWorld, seedArrival, seedDocument, seedResearcher, seedVersion } from './document/world';

// ---------------------------------------------------------------------------
// THE FIFTEENTH GATED ROUTE — GET /api/research/documents, `list_documents({ scope: 'all' })` (ui §7 :307 and §24 :719;
// document flows A4 :1432–:1434 as ruled; document refactor plan step 30 :182). ROUTE-IS-TOOL, as `routeIsTool.test.ts`
// T2 holds the other fourteen: the route answers the tool's answer, as the same researcher, BYTE FOR BYTE.
//
// WHY THIS FILE AND NOT A ROW IN THAT TABLE: its world is `test/helpers/evidenceDouble.ts` (KEEP), which models no
// document delegate. The DOCUMENT world is `test/document/world.ts`, and the mount here is the one `server.ts` makes —
// the router behind the gate at `/api/research`.
// ---------------------------------------------------------------------------

const app = express();
app.use('/api/research', requireResearcher, researchRouter);

const PATH = '/api/research/documents';

beforeEach(() => {
  resetWorld();
  seedResearcher('res_1', 'researcher-one');
  seedResearcher('res_2', 'researcher-two');
  for (const [n, researcher] of [['1', 'res_1'], ['2', 'res_2']] as const) {
    const docId = '0x' + `d${n}`.repeat(32);
    const commitment = '0x' + `c${n}`.repeat(32);
    seedDocument({ docId, commitment, bytes: docId, title: `document ${n}` });
    seedArrival(researcher, commitment, new Date(Date.UTC(2026, 8, 20 + Number(n))));
    seedVersion({ commitment, text: `text ${n}`, contentVersionHash: '0x' + `e${n}`.repeat(32) }, ['seed']);
  }
});

describe('GET /api/research/documents — route-is-tool, at scope all', () => {
  it('answers 200 with list_documents({ scope: "all" })’s answer as the same researcher, byte for byte', async () => {
    const route = await request(app).get(PATH).set('x-test-researcher', 'res_1');
    const tool = await researcherContext.run({ researcherId: 'res_1' }, () => listDocumentsHandler({ scope: 'all' }));
    expect(route.status).toBe(200);
    expect(route.text).toBe(tool);
    // THE FLOOR: `all` really is every researcher's — both documents, each attributed.
    expect((JSON.parse(route.text) as { documents: { by: unknown }[] }).documents.map((d) => d.by)).toEqual([
      { handle: 'researcher-one', mine: true },
      { handle: 'researcher-two', mine: false },
    ]);
  });

  it('401 and 403 come from the gate at the mount, before any route runs (ui §7 :284–:287)', async () => {
    expect((await request(app).get(PATH)).status).toBe(401);
    expect((await request(app).get(PATH).set('x-test-researcher', 'stranger')).status).toBe(403);
  });
});
