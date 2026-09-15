jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { publishThesisHandler } from '../src/mcp/tools/publishThesis';
import { unpublishThesisHandler } from '../src/mcp/tools/unpublishThesis';
import { publicThesisRouter } from '../src/routes/publicThesisRoutes';
import * as evidencePredicates from '../src/services/evidencePredicates';
import * as publicationAssessor from '../src/services/publicationAssessor';
import { INTAKE } from '../src/services/publishedThesis';
import { getWhistleblowerCallHandler } from '../src/mcp/tools/getWhistleblowerCall';
import { BEFORE, CAPTURE_NAME, DIFF_NAME, PAGE, SUPERSEDED_VERSION, URL } from './helpers/corpusFixture';
import { store, resetDouble, type Row } from './helpers/evidenceDouble';
import {
  ANALYSIS,
  ATTEMPT,
  AUTHOR,
  CITING_BOTH_VERSION,
  DEBATE,
  MENTION,
  NEXT_VERSION,
  OPEN_GAP,
  THESIS,
  TRAJECTORY_MENTION,
  TRAJECTORY_VERSION,
  VERSION,
  WITHDRAWAL,
} from './thesis/fixtures';
import { CURRENCIES, evidencePasses, gap, seedPublishable, trajectoriesAre } from './thesis/gateWorld';
import { mentionRow } from './thesis/rows';
import { AS_PUBLISHED, actAs, resetTools, seedThesis } from './thesis/tools';
import { SRC, codeOf, readCode } from './walk/scan';

// ---------------------------------------------------------------------------
// THE PUBLIC THESIS READS — what `test/thesis/publicReads.test.ts` cannot see. docs/gf-thesis-flows.md T5 :804–:853, T6
// :914–:918, A5 :1565–:1570; the R49 sketch §e4, §f3 (R11, R16). Thesis step 23.
//
//   four more MARKERS         a withdrawal's reason, a gap's reason, a REFUSED attempt's rationale, a critic's suggestion
//   the RATIONALE             the pinned version's PUBLISHED attempt's words, never a refused attempt's
//   the HISTORY               a withdrawn version listed by its dates alone; a superseded one whole
//   route 3's THREE STATES    withdrawn now → the notice for every version · named by a withdrawal → its notice ·
//                             superseded → its text — "withdrawn" read from the Withdrawal rows, never from dates
//   a CITATION                resolved at its PIN, argued, and the FACT of an objection
//   the R16 half              publish → unpublish → publish the same version: route 3 still answers the notice
//   the CALL route            UI-3 (the R53 sketch §e): `GET /api/thesis/:id/call` is `get_whistleblower_call`'s answer,
//                             `{ live: false }` a 200 for a draft and an id naming nothing alike (§6 :205–:206)
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const server = express();
server.use('/api/thesis', publicThesisRouter);

const get = async (path: string): Promise<{ status: number; body: Record<string, unknown>; text: string }> => {
  const res = await request(server).get(path);
  return { status: res.status, body: res.body as Record<string, unknown>, text: res.text };
};

const at = (minute: number): Date => new Date(Date.UTC(2026, 8, 11, 9, minute));

const MARK = {
  withdrawalReason: 'MARK-WITHDRAWAL-REASON',
  gapReason: 'MARK-GAP-REASON',
  refusedRationale: 'MARK-REFUSED-RATIONALE',
  criticSuggestion: 'MARK-CRITIC-SUGGESTION',
} as const;

const RATIONALE_NOW = 'הטיעון לפרסום הגרסה השלישית';

const attempt = (versionId: string, minute: number, over: Row = {}): Row => ({
  ...ATTEMPT,
  id: `attempt-${versionId}-${String(minute)}`,
  versionId,
  createdAt: at(minute),
  ...over,
});

/**
 * THE SKETCH'S WORLD B, republished: VERSION published (:10) and SUPERSEDED by TRAJECTORY_VERSION (:20), which was
 * WITHDRAWN (:30); NEXT_VERSION published (:40) and pinned, then a refused attempt on it (:45); the head has moved on to
 * CITING_BOTH_VERSION, never published. VERSION is older than the withdrawal and never named by one.
 */
function seedRepublished(): void {
  seedThesis({ headVersionId: CITING_BOTH_VERSION.id, publishedVersionId: NEXT_VERSION.id, publishedAt: at(40), publishedById: AUTHOR });
  store.versions = [VERSION, TRAJECTORY_VERSION, NEXT_VERSION, CITING_BOTH_VERSION];
  store.mentions = [mentionRow(MENTION, false), mentionRow(TRAJECTORY_MENTION, false)];
  store.attempts = [
    attempt(VERSION.id, 10),
    attempt(TRAJECTORY_VERSION.id, 20),
    attempt(NEXT_VERSION.id, 40, { rationale: RATIONALE_NOW }),
    // A LATER attempt on the pinned version that lost its race — refused, so its words are working state, never the case.
    attempt(NEXT_VERSION.id, 45, { outcome: 'REFUSED', refusedBy: ['HEAD_VERSION'], verdict: null, rationale: MARK.refusedRationale }),
  ];
  store.withdrawals = [{ ...WITHDRAWAL, versionId: TRAJECTORY_VERSION.id, reason: MARK.withdrawalReason, createdAt: at(30) }];
  store.gapDecisions = [gap(1, 'DISMISSED', { reason: MARK.gapReason })];
  store.analyses = [{ ...ANALYSIS, versionId: NEXT_VERSION.id, opinion: { suggestedGaps: [{ description: MARK.criticSuggestion }] } }];
}

const PATHS = (): string[] => [
  '/api/thesis',
  `/api/thesis/${THESIS.id}`,
  ...[VERSION, TRAJECTORY_VERSION, NEXT_VERSION].map((v) => `/api/thesis/${THESIS.id}/versions/${v.id}`),
];

describe('the public bodies — what they never carry, and what they carry instead (T5 :826–:829; A7 :1688–:1689)', () => {
  it("no withdrawal reason, gap reason, refused attempt's rationale or critic's suggestion reaches any read — searched by VALUE", async () => {
    seedRepublished();
    for (const path of PATHS()) {
      const { status, text } = await get(path);
      expect([path, status, Object.values(MARK).filter((mark) => text.includes(mark))]).toEqual([path, 200, []]);
    }
  });

  it("the rationale is the PINNED version's PUBLISHED attempt's; `overObjection` and `analysisRun` are booleans of fact", async () => {
    seedRepublished();
    const { body } = await get(`/api/thesis/${THESIS.id}`);
    expect(body).toMatchObject({ rationale: RATIONALE_NOW, overObjection: false, analysisRun: true });
    expect(body['appeals']).toEqual({ call: [], requests: [], intake: INTAKE });
  });

  it('the history lists every version EVER published, oldest first: the WITHDRAWN one by its dates alone, the superseded one whole (R11)', async () => {
    seedRepublished();
    const { body, text } = await get(`/api/thesis/${THESIS.id}`);
    expect(body['history']).toEqual([
      { versionId: VERSION.id, contentHash: VERSION.contentHash, publishedAt: at(10).toISOString(), citations: [{ kind: 'EVIDENCE', name: DIFF_NAME, pin: MENTION.contentVersionHash }] },
      { versionId: TRAJECTORY_VERSION.id, publishedAt: at(20).toISOString(), withdrawn: true, withdrawnAt: at(30).toISOString() },
      { versionId: NEXT_VERSION.id, contentHash: NEXT_VERSION.contentHash, publishedAt: at(40).toISOString(), citations: [] },
    ]);
    expect([text.includes(TRAJECTORY_VERSION.contentHash), text.includes(TRAJECTORY_VERSION.text.trim())]).toEqual([false, false]);
  });
});

describe("route 3's three states — a version named by a Withdrawal is never served as text (R11, the researcher's §9-5)", () => {
  it('the thesis WITHDRAWN NOW → the notice for EVERY ever-published version, the newest withdrawal\'s date, no text of either', async () => {
    seedThesis();
    store.versions = [VERSION, TRAJECTORY_VERSION, NEXT_VERSION];
    store.attempts = [attempt(VERSION.id, 10), attempt(NEXT_VERSION.id, 40)];
    store.withdrawals = [{ ...WITHDRAWAL, versionId: NEXT_VERSION.id, createdAt: at(50) }];
    for (const version of [VERSION, NEXT_VERSION]) {
      const { status, body, text } = await get(`/api/thesis/${THESIS.id}/versions/${version.id}`);
      expect([version.id, status, body]).toEqual([version.id, 200, { thesisId: THESIS.id, withdrawn: true, withdrawnAt: at(50).toISOString() }]);
      expect(text.includes(version.text.trim())).toBe(false);
    }
  });

  it('republished → the WITHDRAWN version answers ITS notice, the SUPERSEDED one (older than the withdrawal) its text, and one never published 404', async () => {
    seedRepublished();
    const withdrawn = await get(`/api/thesis/${THESIS.id}/versions/${TRAJECTORY_VERSION.id}`);
    const superseded = await get(`/api/thesis/${THESIS.id}/versions/${VERSION.id}`);
    const never = await get(`/api/thesis/${THESIS.id}/versions/${CITING_BOTH_VERSION.id}`);
    expect(withdrawn.body).toEqual({ thesisId: THESIS.id, withdrawn: true, withdrawnAt: at(30).toISOString() });
    expect(superseded.body).toEqual({
      thesisId: THESIS.id,
      versionId: VERSION.id,
      text: VERSION.text,
      contentHash: VERSION.contentHash,
      publishedAt: at(10).toISOString(),
      citations: [{ kind: 'EVIDENCE', name: DIFF_NAME, pin: MENTION.contentVersionHash }],
    });
    expect([never.status, never.body]).toEqual([404, { error: 'Not found' }]);
  });
});

describe('a citation on the page — resolved at its PIN, with the facts beside it (T5 :812–:817)', () => {
  it("serves the PINNED content version's chunks — not CURRENT's — argued, and the FACT that it was promoted over an objection", async () => {
    seedThesis(AS_PUBLISHED);
    store.attempts = [ATTEMPT];
    store.diffs = store.diffs.map((d) => ({ ...d, contentVersions: [...(d['contentVersions'] as Row[]), SUPERSEDED_VERSION] }));
    const row = mentionRow({ ...MENTION, contentVersionHash: SUPERSEDED_VERSION.contentVersionHash }, true, DEBATE);
    store.mentions = [{ ...row, debateSession: { ...(row['debateSession'] as Row), promotedOverObjection: true } }];

    const { body } = await get(`/api/thesis/${THESIS.id}`);

    expect(body['citations']).toEqual([
      expect.objectContaining({
        kind: 'EVIDENCE',
        name: DIFF_NAME,
        pin: SUPERSEDED_VERSION.contentVersionHash,
        content: { kind: 'DIFF', chunks: [{ side: 'REMOVED', text: 'קודם' }] },
        argued: true,
        overObjection: true,
      }),
    ]);
    // THE PAGE'S ID BESIDE ITS URL — thesis A5 :1569 as amended by docs/gf-ui-flows.md §6 :221–:224 (UI-3): the one field the
    // browser needs to compose `/corpus?page=`.
    expect(body['pages']).toEqual([{ trackedUrlId: PAGE.id, url: URL }]);
  });

  /** THESIS published citing the BEFORE capture at `pin`, the snapshot's current text marked, and `kept` text versions held. */
  const seedCitingTheCapture = (pin: string, kept: readonly Row[] = []): void => {
    seedThesis(AS_PUBLISHED);
    store.attempts = [ATTEMPT];
    store.captures = store.captures.map((c) => (c['id'] === BEFORE.id ? { ...c, text: 'MARK-CURRENT-TEXT' } : c));
    store.textVersions = [...kept];
    store.mentions = [mentionRow({ ...MENTION, name: CAPTURE_NAME, contentVersionHash: pin }, true)];
  };

  it("a CAPTURE pinned at its CURRENT text hash serves the snapshot's text, named by its page and timestamp", async () => {
    seedCitingTheCapture(BEFORE.textHash);
    const { body } = await get(`/api/thesis/${THESIS.id}`);
    expect(body['citations']).toEqual([
      expect.objectContaining({
        name: CAPTURE_NAME,
        pin: BEFORE.textHash,
        record: { url: URL, capture: BEFORE.waybackTimestamp },
        content: { kind: 'CAPTURE', text: 'MARK-CURRENT-TEXT' },
      }),
    ]);
  });

  it('a CAPTURE pinned at a text its snapshot has since moved off serves the KEPT text version at the pin — never the current text', async () => {
    seedCitingTheCapture('text-before-kept', [{ snapshotId: BEFORE.id, textHash: 'text-before-kept', text: 'הטקסט שנשמר' }]);
    const { body, text } = await get(`/api/thesis/${THESIS.id}`);
    expect(body['citations']).toEqual([expect.objectContaining({ content: { kind: 'CAPTURE', text: 'הטקסט שנשמר' } })]);
    expect(text.includes('MARK-CURRENT-TEXT')).toBe(false);
  });
});

describe('the mount — the public reads live at /api/thesis, behind the staging gate (server.ts; A5 :1559)', () => {
  const MOUNT = "app.use('/api/thesis', publicThesisRouter)";
  const GATE = 'app.use(requireStagingAccess)';
  /** Where each is mounted in the server's CODE — comments stripped, so a comment naming a mount is not one. */
  const positions = (code: string): { mount: number; gate: number } => ({ mount: code.indexOf(MOUNT), gate: code.indexOf(GATE) });
  const mountedBehindTheGate = (code: string): boolean => {
    const { mount, gate } = positions(code);
    return gate >= 0 && mount > gate;
  };

  it('server.ts mounts publicThesisRouter at /api/thesis, AFTER requireStagingAccess', () => {
    expect(mountedBehindTheGate(readCode(join(SRC, 'server.ts')))).toBe(true);
  });

  it('DETECTS a mount at another path, a mount above the gate and a commented mount — and passes the gate-then-mount order', () => {
    expect(mountedBehindTheGate(`${GATE};\n${MOUNT};`)).toBe(true);
    expect(mountedBehindTheGate(`${GATE};\napp.use('/api/theses', publicThesisRouter);`)).toBe(false);
    expect(mountedBehindTheGate(`${MOUNT};\n${GATE};`)).toBe(false);
    expect(mountedBehindTheGate(codeOf(`${GATE};\n// ${MOUNT};\nconst x = 1;`))).toBe(false);
  });
});

describe("the call page's read — GET /api/thesis/:id/call (thesis A4 :1501–:1504; ui-flows §6 :205–:206)", () => {
  const CALL_ITEM = { whatIsNeeded: 'פרוטוקול הדיון', whoWouldHaveSeenIt: 'חברי הצוות', unit: 'אגף הרפואה', window: '2022-08' };
  /** OPEN_GAP decided CALLED a second after it opened — before the publication, so the call is the published version's. */
  const CALLED: Row = { ...OPEN_GAP, id: 'gap-decision-called', sequence: 2, decision: 'CALLED', callItem: CALL_ITEM, createdAt: new Date(OPEN_GAP.createdAt.getTime() + 1000) };

  it("a PUBLISHED thesis with a gap CALLED answers 200 with get_whistleblower_call's answer, byte for byte — live, the item the researcher approved", async () => {
    seedThesis(AS_PUBLISHED);
    store.attempts = [ATTEMPT];
    store.gapDecisions = [{ ...OPEN_GAP }, CALLED];
    const { status, body, text } = await get(`/api/thesis/${THESIS.id}/call`);
    expect([status, text]).toEqual([200, await getWhistleblowerCallHandler({ thesisId: THESIS.id })]);
    expect(body).toMatchObject({ live: true, call: [CALL_ITEM] });
  });

  it('a DRAFT with a gap CALLED and an id naming no thesis answer the same 200 bytes, `{ live: false }` — never a 404 that tells a draft apart', async () => {
    seedThesis();
    store.gapDecisions = [{ ...OPEN_GAP }, CALLED];
    const draft = await get(`/api/thesis/${THESIS.id}/call`);
    const nothing = await get('/api/thesis/thesis-that-does-not-exist/call');
    expect([draft.status, draft.text, nothing.status, nothing.text]).toEqual([200, '{"live":false}', 200, '{"live":false}']);
  });
});

describe('the R16 half owed by chunk 3 — publish → unpublish → publish the same version', () => {
  it('route 3 on the withdrawn version answers its notice, and route 2 the thesis\'s — never the text', async () => {
    await seedPublishable();
    jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(evidencePasses(VERSION));
    trajectoriesAre(CURRENCIES.PINNED_IS_LATEST);
    jest.spyOn(publicationAssessor, 'assess').mockResolvedValue({
      rationaleHasSubstance: true,
      substanceGaps: [],
      verdict: 'SUPPORTS',
      objection: '',
      names: [],
      allegationsFramed: true,
      allegationsNote: '',
      assessment: 'הנימוק בעל ממש.',
    });
    actAs(AUTHOR);
    const act = { thesisId: THESIS.id, rationale: 'הטיעון' };
    expect(JSON.parse(await publishThesisHandler(act))).toMatchObject({ publishedVersionId: VERSION.id });
    expect(JSON.parse(await unpublishThesisHandler({ thesisId: THESIS.id, reason: 'נמצאה טעות' }))).toMatchObject({ withdrawnVersionId: VERSION.id });
    expect(JSON.parse(await publishThesisHandler(act))).toMatchObject({ code: 'NOT_PUBLISHABLE' });
    actAs(null);

    const withdrawnAt = (store.withdrawals.at(0)?.['createdAt'] as Date).toISOString();
    for (const path of [`/api/thesis/${THESIS.id}/versions/${VERSION.id}`, `/api/thesis/${THESIS.id}`]) {
      const { status, body, text } = await get(path);
      expect([path, status, body]).toEqual([path, 200, { thesisId: THESIS.id, withdrawn: true, withdrawnAt }]);
      expect(text.includes(VERSION.text.trim())).toBe(false);
    }
  });
});
