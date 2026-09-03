jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn(), update: jest.fn() },
    cdxIndexEntry: { findFirst: jest.fn(), update: jest.fn() },
    urlSnapshot: { findUnique: jest.fn() },
    rule: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    pageDecision: { findMany: jest.fn(), create: jest.fn() },
  },
}));

// A toggle, so "behind requireResearcher" is observable rather than assumed.
let researcherPresent = true;
jest.mock('../../src/middleware/researcherIdentity', () => ({
  requireResearcher: (req: { researcherId?: string }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (!researcherPresent) {
      res.status(401).json({ error: 'researcher required' });
      return;
    }
    req.researcherId = 'res-1';
    next();
  },
  identifyResearcher: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ESM-only through jsdom: the derivation, the outline and the inert document
// are mocked, and what they RECEIVED is what the bytes-source cases assert.
const mockDerive = jest.fn();
const mockOutline = jest.fn();
const mockInert = jest.fn();
jest.mock('../../src/lib/chromeRulesetApply', () => ({
  deriveTextUnderRuleset: mockDerive,
  documentOutline: mockOutline,
  inertDocument: mockInert,
}));

const mockCaptureHtml = jest.fn();
jest.mock('../../src/lib/captureDocument', () => ({ captureHtml: mockCaptureHtml }));

import express from 'express';
import request from 'supertest';
import { publicUrl } from '../../src/lib/publicRoutes';
import { prisma } from '../../src/lib/prisma';
import { markingUrl } from '../../src/walk/markingUrl';
import { walkArticleRulesRouter } from '../../src/walk/routes';
import { T09, T14, T2, OUTCOMES, rule, D, log } from './fixtures';
import { WALK, tsFiles, readCode } from './scan';

// ---------------------------------------------------------------------------
// A6 — THE MARKING PAGE'S ONLY SURFACE. Five page-scoped routes under
// /api/article-rules, all behind requireResearcher:
//
//   GET    /pages/:trackedUrlId/captures/:capture
//   POST   /pages/:trackedUrlId/captures/:capture/preview      pure
//   GET    /pages/:trackedUrlId/draft
//   PUT    /pages/:trackedUrlId/draft                           last write wins
//   DELETE /pages/:trackedUrlId/draft                           the log untouched
//
// THE MARKING PAGE DECIDES NOTHING AND APPLIES NOTHING. It reads a capture,
// previews selectors, and hands back a draft. No route here writes a decision,
// a rule or a row; invariants.test.ts holds that by source scan, this file by
// behaviour.
//
// RULED 2026-09-03. The marking URL is composed by the reused `publicUrl`
// with the default locale — <frontend>/<locale>/article-rules/<id>/<capture>
// — in exactly one module under src/walk; and 409 is answered for every
// outcome that holds no bytes: UNFETCHED, UNSERVABLE, IDENTICAL, DUPLICATE and
// SKIPPED. Only PENDING_JUDGEMENT (the held body) and ACQUIRED (the
// snapshot's document) have something to show.
//
// Step 6 mounts this router BEFORE the legacy one at the same base: the old
// `/:runId/captures/:snapshotId` would otherwise answer `/pages/<id>/captures/
// <capture>` with runId = 'pages'. Recorded in the plan's hazards.
//
// RED until step 6 builds `src/walk/routes` and `src/walk/markingUrl`.
// ---------------------------------------------------------------------------

const TRACKED = 'page-1';
const URL = 'https://example.gov.il/page';
const HELD = Buffer.from('<html>held</html>');
const STORED = Buffer.from('<html>stored</html>');
const RETURNED_AT = new Date('2026-09-03T10:00:00Z');
const BASE = `/api/article-rules/pages/${TRACKED}`;

type Mock = jest.Mock;
const db = prisma as unknown as Record<string, Record<string, Mock>>;
const delegate = (name: string): Record<string, Mock> => db[name] ?? {};
const trackedFind = delegate('trackedUrl')['findUnique'] as Mock;
const trackedUpdate = delegate('trackedUrl')['update'] as Mock;
const rowFind = delegate('cdxIndexEntry')['findFirst'] as Mock;
const rowUpdate = delegate('cdxIndexEntry')['update'] as Mock;
const snapshotFind = delegate('urlSnapshot')['findUnique'] as Mock;
const rulesFind = delegate('rule')['findMany'] as Mock;
const ruleCreate = delegate('rule')['create'] as Mock;
const ruleUpdate = delegate('rule')['update'] as Mock;
const decisionsFind = delegate('pageDecision')['findMany'] as Mock;
const decisionCreate = delegate('pageDecision')['create'] as Mock;

const DECIDING_WRITES = [rowUpdate, ruleCreate, ruleUpdate, decisionCreate];

const app = express();
app.use(express.json());
app.use('/api/article-rules', walkArticleRulesRouter);

const r1 = rule('r1', '.ticker', T09, 'd1');
const r2 = rule('r2', '.share', T2, 'd3');
const RULES = [r1, r2];
const LOG = log(RULES, [D.corrected(T09), D.accepted(T09), D.corrected(T2), D.trusted('r1', T2), D.accepted(T2)]);

const STOP = { gates: [{ gate: 4, material: { removals: [{ text: 'never seen', ruleId: 'r1', selector: '.ticker' }] } }] };

function page(draft: { draftCapture: string | null; draftSelectors: string[]; draftTrusted: string[]; draftReturnedAt: Date | null } | null = null) {
  trackedFind.mockResolvedValue({
    id: TRACKED,
    url: URL,
    draftCapture: draft?.draftCapture ?? null,
    draftSelectors: draft?.draftSelectors ?? [],
    draftTrusted: draft?.draftTrusted ?? [],
    draftReturnedAt: draft?.draftReturnedAt ?? null,
  });
}

function rowOf(status: string, waybackTimestamp = T14) {
  const pending = status === 'PENDING_JUDGEMENT';
  const acquired = status === 'ACQUIRED';
  rowFind.mockResolvedValue({
    id: `row-${waybackTimestamp}`,
    trackedUrlId: TRACKED,
    waybackTimestamp,
    digest: 'A',
    status,
    heldBody: pending ? HELD : null,
    contentType: pending ? 'text/html' : null,
    contentEncoding: null,
    stop: pending ? STOP : null,
    snapshotId: acquired ? 'snap-14' : null,
  });
  snapshotFind.mockResolvedValue(
    acquired ? { id: 'snap-14', document: STORED, documentContentType: 'text/html', documentContentEncoding: null } : null,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  researcherPresent = true;
  page();
  rowOf('PENDING_JUDGEMENT');
  rulesFind.mockResolvedValue(RULES);
  decisionsFind.mockResolvedValue(LOG);
  mockCaptureHtml.mockImplementation(({ document }: { document: Buffer }) => document.toString('utf8'));
  mockInert.mockImplementation((html: string) => `<inert>${html}</inert>`);
  mockOutline.mockReturnValue({ root: { tag: 'body', children: [] }, truncated: false, unreachableTextLength: 0 });
  mockDerive.mockReturnValue({
    text: 'kept text',
    textHash: 'hash',
    textExtractionVersion: 'v2-fixture-extractor',
    chrome: {
      html: '<html/>',
      removedText: 'ticker item',
      removedSegments: [{ selector: '.ticker', text: 'ticker item' }],
      matchCounts: { '.ticker': 1 },
      invalidSelectors: [],
    },
  });
  trackedUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: TRACKED, url: URL, ...data }));
});

describe('all five routes', () => {
  const calls = () => [
    request(app).get(`${BASE}/captures/${T14}`),
    request(app).post(`${BASE}/captures/${T14}/preview`).send({ selectors: ['.ticker'] }),
    request(app).get(`${BASE}/draft`),
    request(app).put(`${BASE}/draft`).send({ capture: T14, selectors: ['.ticker'], trusted: [], returned: true }),
    request(app).delete(`${BASE}/draft`),
  ];

  it('answer 401 without a researcher', async () => {
    researcherPresent = false;
    for (const call of calls()) expect((await call).status).toBe(401);
  });

  it('answer 404 for a page that does not exist', async () => {
    trackedFind.mockResolvedValue(null);
    for (const call of calls()) expect((await call).status).toBe(404);
  });
});

describe('GET /pages/:trackedUrlId/captures/:capture', () => {
  it('404 when the page has no row for the capture', async () => {
    rowFind.mockResolvedValue(null);
    expect((await request(app).get(`${BASE}/captures/${T14}`)).status).toBe(404);
  });

  it('409 for every outcome that holds no bytes, exhaustively', async () => {
    for (const outcome of OUTCOMES.filter((o) => o !== 'PENDING_JUDGEMENT' && o !== 'ACQUIRED')) {
      rowOf(outcome);
      const res = await request(app).get(`${BASE}/captures/${T14}`);
      expect({ outcome, status: res.status }).toEqual({ outcome, status: 409 });
    }
  });

  it('serves a PENDING_JUDGEMENT capture from the held body', async () => {
    rowOf('PENDING_JUDGEMENT');
    const res = await request(app).get(`${BASE}/captures/${T14}`);
    expect(res.status).toBe(200);
    expect(mockCaptureHtml).toHaveBeenCalledWith(expect.objectContaining({ document: HELD }));
    expect(mockInert).toHaveBeenCalledWith('<html>held</html>');
    expect(res.body.document).toBe('<inert><html>held</html></inert>');
  });

  it('serves an ACQUIRED capture from the snapshot’s document', async () => {
    rowOf('ACQUIRED');
    const res = await request(app).get(`${BASE}/captures/${T14}`);
    expect(res.status).toBe(200);
    expect(mockCaptureHtml).toHaveBeenCalledWith(expect.objectContaining({ document: STORED }));
    expect(res.body.document).toBe('<inert><html>stored</html></inert>');
  });

  it('answers A6’s body: the rules in force at the capture’s timestamp with their trust, the draft, and the stop', async () => {
    page({ draftCapture: T14, draftSelectors: ['.ticker', '.new'], draftTrusted: ['.new'], draftReturnedAt: RETURNED_AT });
    rowOf('PENDING_JUDGEMENT');
    const res = await request(app).get(`${BASE}/captures/${T14}`);
    expect(Object.keys(res.body as object).sort()).toEqual(['capture', 'document', 'draft', 'outcome', 'rulesInForce', 'snapshotDate', 'stop']);
    expect(res.body).toEqual(
      expect.objectContaining({
        capture: T14,
        snapshotDate: '2020-03-01',
        outcome: 'PENDING_JUDGEMENT',
        // r2 is created at T2, after T14: not in force here.
        rulesInForce: [{ ruleId: 'r1', selector: '.ticker', trusted: true }],
        draft: { capture: T14, selectors: ['.ticker', '.new'], trusted: ['.new'], returnedAt: RETURNED_AT.toISOString() },
        stop: STOP,
      }),
    );
  });

  it('draft is null when the page holds none, and stop is null on an ACQUIRED capture', async () => {
    rowOf('ACQUIRED');
    const res = await request(app).get(`${BASE}/captures/${T14}`);
    expect(res.body.draft).toBeNull();
    expect(res.body.stop).toBeNull();
  });
});

describe('POST /pages/:trackedUrlId/captures/:capture/preview — pure', () => {
  it('answers the derivation under the posted selectors', async () => {
    const res = await request(app).post(`${BASE}/captures/${T14}/preview`).send({ selectors: ['.ticker'] });
    expect(res.status).toBe(200);
    expect(mockDerive).toHaveBeenCalledWith(HELD, 'text/html', null, { selectors: ['.ticker'] });
    expect(res.body).toEqual({
      keptText: 'kept text',
      removedText: 'ticker item',
      removedSegments: [{ selector: '.ticker', text: 'ticker item' }],
      matchCounts: { '.ticker': 1 },
    });
  });

  it('previews an ACQUIRED capture from the snapshot’s document', async () => {
    rowOf('ACQUIRED');
    const res = await request(app).post(`${BASE}/captures/${T14}/preview`).send({ selectors: ['.ticker'] });
    expect(res.status).toBe(200);
    expect(mockDerive).toHaveBeenCalledWith(STORED, 'text/html', null, { selectors: ['.ticker'] });
  });

  it('400 without selectors', async () => {
    expect((await request(app).post(`${BASE}/captures/${T14}/preview`).send({})).status).toBe(400);
    expect((await request(app).post(`${BASE}/captures/${T14}/preview`).send({ selectors: 'not-a-list' })).status).toBe(400);
  });

  it('409 with no bytes to preview', async () => {
    rowOf('DUPLICATE');
    expect((await request(app).post(`${BASE}/captures/${T14}/preview`).send({ selectors: ['.ticker'] })).status).toBe(409);
  });

  it('writes nothing', async () => {
    await request(app).post(`${BASE}/captures/${T14}/preview`).send({ selectors: ['.ticker'] });
    expect(trackedUpdate).not.toHaveBeenCalled();
    for (const write of DECIDING_WRITES) expect(write).not.toHaveBeenCalled();
  });
});

describe('GET /pages/:trackedUrlId/draft', () => {
  it('answers the draft', async () => {
    page({ draftCapture: T14, draftSelectors: ['.ticker'], draftTrusted: ['.ticker'], draftReturnedAt: RETURNED_AT });
    const res = await request(app).get(`${BASE}/draft`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ capture: T14, selectors: ['.ticker'], trusted: ['.ticker'], returnedAt: RETURNED_AT.toISOString() });
  });

  it('answers null when there is none', async () => {
    const res = await request(app).get(`${BASE}/draft`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe('PUT /pages/:trackedUrlId/draft — last write wins, no version', () => {
  it('writes the four fields, returnedAt set when returned is true', async () => {
    const res = await request(app).put(`${BASE}/draft`).send({ capture: T14, selectors: ['.ticker', '.new'], trusted: ['.new'], returned: true });
    expect(res.status).toBe(200);
    expect(trackedUpdate).toHaveBeenCalledWith({
      where: { id: TRACKED },
      data: { draftCapture: T14, draftSelectors: ['.ticker', '.new'], draftTrusted: ['.new'], draftReturnedAt: expect.any(Date) },
    });
    expect(res.body).toEqual({ capture: T14, selectors: ['.ticker', '.new'], trusted: ['.new'], returnedAt: expect.any(String) });
  });

  it('returnedAt is null when returned is false', async () => {
    const res = await request(app).put(`${BASE}/draft`).send({ capture: T14, selectors: ['.ticker'], trusted: [], returned: false });
    expect(res.status).toBe(200);
    expect(trackedUpdate.mock.calls[0]?.[0]).toEqual({ where: { id: TRACKED }, data: expect.objectContaining({ draftReturnedAt: null }) });
    expect(res.body.returnedAt).toBeNull();
  });

  it('a second write overwrites the first without a version', async () => {
    await request(app).put(`${BASE}/draft`).send({ capture: T14, selectors: ['.a'], trusted: [], returned: false });
    await request(app).put(`${BASE}/draft`).send({ capture: T14, selectors: ['.b'], trusted: [], returned: true });
    expect(trackedUpdate).toHaveBeenCalledTimes(2);
    expect(trackedUpdate.mock.calls[1]?.[0]).toEqual({ where: { id: TRACKED }, data: expect.objectContaining({ draftSelectors: ['.b'] }) });
  });

  it('400 on a malformed body', async () => {
    for (const body of [{}, { capture: T14 }, { capture: T14, selectors: 'x', trusted: [], returned: true }, { capture: 12, selectors: [], trusted: [], returned: true }]) {
      expect((await request(app).put(`${BASE}/draft`).send(body)).status).toBe(400);
    }
    expect(trackedUpdate).not.toHaveBeenCalled();
  });

  it('404 for a capture the page has no row for', async () => {
    rowFind.mockResolvedValue(null);
    expect((await request(app).put(`${BASE}/draft`).send({ capture: '20300101000000', selectors: [], trusted: [], returned: true })).status).toBe(404);
    expect(trackedUpdate).not.toHaveBeenCalled();
  });

  it('writes no decision, rule or row', async () => {
    await request(app).put(`${BASE}/draft`).send({ capture: T14, selectors: ['.ticker'], trusted: [], returned: true });
    for (const write of DECIDING_WRITES) expect(write).not.toHaveBeenCalled();
  });
});

describe('DELETE /pages/:trackedUrlId/draft — the researcher’s cancel', () => {
  it('clears the four fields, touches the log not at all, and answers 204', async () => {
    page({ draftCapture: T14, draftSelectors: ['.ticker'], draftTrusted: [], draftReturnedAt: RETURNED_AT });
    const res = await request(app).delete(`${BASE}/draft`);
    expect(res.status).toBe(204);
    expect(trackedUpdate).toHaveBeenCalledWith({
      where: { id: TRACKED },
      data: { draftCapture: null, draftSelectors: [], draftTrusted: [], draftReturnedAt: null },
    });
    for (const write of DECIDING_WRITES) expect(write).not.toHaveBeenCalled();
  });
});

describe('the marking URL — carried in every stop, composed by nothing else', () => {
  it('is the reused publicUrl of /article-rules/<trackedUrlId>/<capture>, default locale', () => {
    expect(markingUrl(TRACKED, T14)).toBe(publicUrl(`/article-rules/${TRACKED}/${T14}`));
    expect(markingUrl(TRACKED, T14).endsWith(`/article-rules/${TRACKED}/${T14}`)).toBe(true);
  });

  it('the literal /article-rules/ appears in exactly one module under src/walk', () => {
    const composers = tsFiles(WALK).filter((file) => readCode(file).includes('/article-rules/'));
    expect(composers.map((f) => f.slice(WALK.length + 1))).toEqual(['markingUrl.ts']);
  });

  it('DETECTS a second composer — proven against a decoy', () => {
    expect(readCode(`const url = \`\${base}/article-rules/\${id}/\${capture}\`; // /article-rules/ in a comment`)).toContain('/article-rules/');
    expect(readCode(`// only a comment names /article-rules/`)).not.toContain('/article-rules/');
  });
});
