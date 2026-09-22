import { createHash } from 'node:crypto';
import express, { type Express, type NextFunction, type Request, type Response, type Router } from 'express';
import { recordId } from '../../src/lib/evidenceIdentity';
import { normaliseClaim } from '../../src/lib/normalise';
import { requireResearcher } from '../../src/middleware/researcherIdentity';
import { publicThesisRouter } from '../../src/routes/publicThesisRoutes';
import { claimHash, computeSourceStateHash, DETECTION_VERSION, type Observation } from '../../src/services/claimTrajectory';
import { load } from '../thesis/absent';
import type { ExportContract } from '../thesis/contract';
import { ANALYSIS, ATTEMPT, AUTHOR, DEBATE, FRAMING, OPEN_GAP, ROUNDS, THESIS, VERSION } from '../thesis/fixtures';
import { AS_PUBLISHED, seedThesis } from '../thesis/tools';
import { AFTER, BEFORE, BETWEEN, CHUNKS, CURRENT_VERSION, DIFF_NAME, DIFF_ROW, PAGE, URL } from './corpusFixture';
import { store, type Row } from './evidenceDouble';

// ---------------------------------------------------------------------------
// THE ROUTES' WORLD — UI-3 (handoffs/R53-chunk-1-sketch.md §d, §6-D10). What `test/routeIsTool.test.ts`,
// `test/corpusRoutes.test.ts` and `test/researchRoutes.test.ts` stand on: the two-page corpus of UI-2 (a page a
// published thesis opened, a page nobody cited, a page holding nothing and no detection pass), a published thesis
// with a CALLED appeal and model prose planted by VALUE, the walk's work-list of one page, and the researchers the
// gate looks up. Not an instrument: it holds nothing, and is exercised by the first case each part serves.
//
// RE-STATED, NEVER IMPORTED FROM A KEEP FILE. `seedTwoPages` is local to `test/evidence/corpusReads.test.ts` (KEEP), so
// the corpus is re-stated here over the same shared fixtures and the same state-hash inputs `loadDetectionInputs`
// assembles (services/claimTrajectory.ts :472–:485), so a stored pass HITS and nothing is computed or written.
//
// THE APP is the server's own mounts for the routes under test — the lines `server.ts` carries — built per case,
// because the route modules are loaded through `absent.ts`' `load()` with owner "UI-3" and fail BY NAME until built.
// ---------------------------------------------------------------------------

// --- the corpus: two pages and a third holding nothing --------------------------------------------------------------

export const PAGE_2 = { id: 'page-2', url: 'https://news.walla.co.il/item/3500001' };
export const PAGE_3 = { id: 'page-3', url: 'https://news.walla.co.il/item/3600001' };
export const MISSING_PAGE_ID = 'page-that-does-not-exist';
export const PHRASE = 'דיווח על תופעות לוואי';
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

export const P2A = capture('snap-p2-a', '20210301120000', '2021-03-01', 'p2-a-bytes');
export const P2B = capture('snap-p2-b', '20210901120000', '2021-09-01', 'p2-b-bytes');

const held = (page: { id: string; url: string }, c: Capture, text: string): Row => ({ ...c, text, trackedUrlId: page.id, trackedUrl: page });

const P2_DIFF: Row = {
  id: 'diff-p2',
  trackedUrlId: PAGE_2.id,
  beforeSnapshot: P2A,
  afterSnapshot: P2B,
  contentVersions: [{ ...CURRENT_VERSION, contentVersionHash: 'content-p2' }],
};

/** A record of the PRIVATE page — its name resolves through the corpus, and its page is opened by nobody. */
export const P2_DIFF_NAME = recordId({
  kind: 'DIFF',
  url: PAGE_2.url,
  before: { waybackTimestamp: P2A.waybackTimestamp, documentHash: P2A.documentHash },
  after: { waybackTimestamp: P2B.waybackTimestamp, documentHash: P2B.documentHash },
});

/** A well-formed record name nothing in the corpus holds. */
export const NAMELESS = `0x${'00'.repeat(32)}`;

const stateOf = (timestamps: readonly string[]): string =>
  computeSourceStateHash({
    waybackTimestamps: timestamps,
    candidateHashes: [...new Set(CHUNKS.map((c) => claimHash(normaliseClaim(c.text))))],
    detectionVersion: DETECTION_VERSION,
  });

const observations = (url: string, seen: readonly { c: Capture; present: boolean }[]): Observation[] =>
  seen.map(({ c, present }) => ({ snapshotDate: c.snapshotDate, waybackTimestamp: c.waybackTimestamp, snapshotUrl: `https://web.archive.org/web/${c.waybackTimestamp}/${url}`, present }));

const trajectory = (id: string, page: { id: string; url: string }, computationId: string, claimText: string, seen: readonly { c: Capture; present: boolean }[]): Row => {
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

/**
 * PAGE opened through the REAL predicate (an evidence row on its diff, cited by a version with a PUBLISHED attempt);
 * PAGE_2 surveyed with two captures, a diff and a stored pass, cited by nobody; PAGE_3 surveyed with nothing.
 */
export function seedCorpusWorld(): void {
  store.pages = [PAGE, PAGE_2, PAGE_3];
  store.captures = [held(PAGE, BEFORE, WITH), held(PAGE, BETWEEN, WITHOUT), held(PAGE, AFTER, WITH), held(PAGE_2, P2A, WITH), held(PAGE_2, P2B, WITHOUT)];
  store.diffs = [{ ...DIFF_ROW, trackedUrlId: PAGE.id }, P2_DIFF];
  store.evidenceRows = [
    {
      fileHash: DIFF_NAME,
      kind: 'DIFF',
      status: 'PROMOTED',
      affirmedContentVersionHash: CURRENT_VERSION.contentVersionHash,
      snapshot: null,
      // The endpoints carry their page, as `verified` selects them (services/evidencePredicates.ts :593–:597, `trackedUrl.url`).
      urlVersionDiff: { ...DIFF_ROW, trackedUrlId: PAGE.id, beforeSnapshot: { ...BEFORE, trackedUrl: PAGE }, afterSnapshot: { ...AFTER, trackedUrl: PAGE } },
    },
  ];
  store.mentions = [
    { id: 'mention-1', versionId: 'version-1', kind: 'EVIDENCE', name: DIFF_NAME, contentVersionHash: CURRENT_VERSION.contentVersionHash, thesisVersion: { id: 'version-1', thesisId: 'thesis-1', contentHash: 'content-hash-1', text: 'טקסט', isPublished: { id: 'thesis-1' } } },
  ];
  store.attempts = [{ id: 'attempt-1', versionId: 'version-1', outcome: 'PUBLISHED' }];
  const seenPage = [{ c: BEFORE, present: true }, { c: BETWEEN, present: false }, { c: AFTER, present: true }];
  const seenP2 = [{ c: P2A, present: true }, { c: P2B, present: false }];
  store.computations = [
    { id: 'computation-p1', trackedUrlId: PAGE.id, sourceStateHash: stateOf([BEFORE.waybackTimestamp, BETWEEN.waybackTimestamp, AFTER.waybackTimestamp]), detectionVersion: DETECTION_VERSION, computedAt: new Date('2026-09-01T00:00:00.000Z'), snapshotsExamined: 3, candidatesConsidered: 2, candidatesUnmatched: 0, candidatesDerivative: 0 },
    { id: 'computation-p2', trackedUrlId: PAGE_2.id, sourceStateHash: stateOf([P2A.waybackTimestamp, P2B.waybackTimestamp]), detectionVersion: DETECTION_VERSION, computedAt: new Date('2026-09-02T00:00:00.000Z'), snapshotsExamined: 2, candidatesConsidered: 2, candidatesUnmatched: 0, candidatesDerivative: 0 },
  ];
  store.trajectories = [
    trajectory('trajectory-pa', PAGE, 'computation-p1', 'הטענה הראשונה על העמוד', seenPage),
    trajectory('trajectory-p2', PAGE_2, 'computation-p2', 'הטענה על העמוד השני', seenP2),
  ];
}

// --- the thesis: published, with an appeal and model prose planted by value ------------------------------------------

/** Model prose, planted where each model register lives — no public body may carry one of these VALUES (A7 :1688). */
export const MARK = {
  analysis: 'MARK-ANALYSIS-OPINION',
  assessment: 'MARK-PUBLICATION-ASSESSMENT',
  objection: 'MARK-PUBLICATION-OBJECTION',
  framingAssessment: 'MARK-FRAMING-ROUND-ASSESSMENT',
} as const;

export const CALL_ITEM = { whatIsNeeded: 'פרוטוקול הדיון', whoWouldHaveSeenIt: 'חברי הצוות', unit: 'אגף הרפואה', window: '2022-08' };

/** A thesis never published — its public reads are the one 404, its call `{ live: false }`. */
export const DRAFT_ID = 'thesis-draft';
export const MISSING_THESIS_ID = 'thesis-that-does-not-exist';

/**
 * THESIS published at VERSION, with OPEN_GAP decided CALLED before the publication (so the call is live), an analysis,
 * a publication attempt and an assessed framing round each carrying a MARK, and the debate.
 */
export function seedThesisWorld(): void {
  seedThesis(AS_PUBLISHED);
  store.attempts = [{ ...ATTEMPT, assessment: { substance: true, names: [], text: MARK.assessment }, objection: MARK.objection }];
  store.gapDecisions = [{ ...OPEN_GAP }, { ...OPEN_GAP, id: 'gap-decision-called', sequence: 2, decision: 'CALLED', callItem: CALL_ITEM, createdAt: new Date(OPEN_GAP.createdAt.getTime() + 1000) }];
  store.analyses = [{ ...ANALYSIS, versionId: VERSION.id, opinion: { suggestedGaps: [{ description: MARK.analysis }] } }];
  store.framingRounds = ROUNDS.map((r) => (r.type === 'ASSESSED' ? { ...r, content: { assessment: MARK.framingAssessment } } : r));
  store.framings = [FRAMING];
  store.debates = [DEBATE];
}

/**
 * A thesis nobody published, beside the published one — for the PUBLIC reads only (the one 404, `{ live: false }`). Its
 * own call, never part of `seedThesisWorld`: a thesis with no head version is a malformed thesis to REVIEWS
 * (services/thesisPredicates.ts), and the read view's routes are asked of well-formed theses.
 */
export function seedDraft(): void {
  store.theses = [...store.theses, { ...THESIS, id: DRAFT_ID, headVersionId: null, publishedVersionId: null, publishedAt: null, publishedById: null }];
}

/**
 * ONE RECORD OWED A REVIEW — `list_evidence_reviews`' CONTENT_MOVED entry (evidence A4 :1146–:1151), in the shapes
 * `test/reviews.test.ts` seeds (:271–:317): the fixture's DIFF promoted and affirmed at an older content version, its
 * BEFORE endpoint's text moved under a RULESET_CORRECTED decision, so the list is not the empty answer.
 */
export function seedEvidenceReview(): void {
  const endpoint = (row: typeof BEFORE): Row => ({
    id: row.id,
    waybackTimestamp: row.waybackTimestamp,
    textHash: row.textHash,
    textExtractionVersion: 'v3-extractor',
    trackedUrlId: PAGE.id,
    trackedUrl: { url: URL },
  });
  const version = (over: Row = {}): Row => ({
    contentVersionHash: 'content-current',
    beforeTextHash: BEFORE.textHash,
    afterTextHash: AFTER.textHash,
    diffVersion: CURRENT_VERSION.diffVersion,
    derivedAt: new Date('2026-09-07T10:00:00.000Z'),
    ...over,
  });
  store.captures = [{ ...BEFORE, text: 'הפסקה על תופעות הלוואי המלאה\nשורה שנשארה\nשורה חדשה', trackedUrlId: PAGE.id, trackedUrl: PAGE }, { ...AFTER, trackedUrlId: PAGE.id, trackedUrl: PAGE }];
  store.evidenceRows = [
    {
      fileHash: DIFF_NAME,
      kind: 'DIFF',
      status: 'PROMOTED',
      affirmedContentVersionHash: 'content-affirmed',
      snapshot: null,
      urlVersionDiff: {
        id: DIFF_ROW.id,
        trackedUrlId: PAGE.id,
        trackedUrl: { url: URL },
        beforeSnapshot: endpoint(BEFORE),
        afterSnapshot: endpoint(AFTER),
        contentVersions: [version({ contentVersionHash: 'content-affirmed', beforeTextHash: 'text-before-v2', derivedAt: new Date('2026-09-01T10:00:00.000Z') }), version()],
      },
    },
  ];
  store.textVersions = [
    {
      snapshotId: BEFORE.id,
      textHash: 'text-before-v2',
      text: 'הפסקה על תופעות הלוואי\nשורה שנשארה',
      textExtractionVersion: 'v2-extractor',
      supersededAt: new Date('2026-09-05T09:00:00.000Z'),
      supersededByDecisionId: 'decision-9',
      supersededByDecision: { id: 'decision-9', type: 'RULESET_CORRECTED', waybackTimestamp: BEFORE.waybackTimestamp, sequence: 9, researcherId: AUTHOR, createdAt: new Date('2026-09-06T08:00:00.000Z') },
    },
  ];
  store.contentVersions = [
    { diffId: DIFF_ROW.id, contentVersionHash: 'content-affirmed', chunks: [{ side: 'REMOVED', text: 'הפסקה על תופעות הלוואי', survival: 'UNCHECKABLE' }] },
    { diffId: DIFF_ROW.id, contentVersionHash: 'content-current', chunks: CHUNKS },
  ];
}

/** The debate `get_debate` reads back — the `test/debate.test.ts` session shape. */
export const SESSION_ID = 'session-1';
export function seedDebate(): void {
  store.session = {
    id: SESSION_ID,
    thesisId: THESIS.id,
    recordFileHash: DIFF_NAME,
    status: 'OPEN',
    hasSubstance: true,
    verdict: 'SUPPORTS',
    promotedOverObjection: false,
    evidenceId: null,
    recordSnapshotId: null,
    recordDiffId: DIFF_ROW.id,
    recordSnapshot: null,
    recordDiff: { trackedUrl: { url: URL }, beforeSnapshot: { waybackTimestamp: BEFORE.waybackTimestamp }, afterSnapshot: { waybackTimestamp: AFTER.waybackTimestamp } },
    evidence: null,
    thesis: { createdById: AUTHOR, headVersionId: VERSION.id },
    // THE OPENER AND ITS MOMENT — columns `DebateSession` has always had (evidence T3 :371) and this fixture
    // did not carry, because nothing read them until `get_debate`'s answer became TURNS (evidence :1123).
    researcherId: AUTHOR,
    createdAt: new Date('2026-09-10T08:59:00.000Z'),
    closedAt: null,
    events: [{ id: 'event-1', type: 'RATIONALE_SUBMITTED', content: 'the opening argument', createdAt: new Date('2026-09-10T09:00:00.000Z') }],
  };
}

// --- the walk: one page's work-list, a rule, its match and the log ----------------------------------------------------

export const RULE_ID = 'rule-1';
export const OTHER_PAGES_RULE_ID = 'rule-on-page-2';

/** PAGE's work-list: a DUPLICATE and an IDENTICAL row (no bytes held, so no jsdom is reached), a rule created by the log's first decision and trusted, and one match of it. */
export function seedWalkWorld(): void {
  store.pages = [PAGE, PAGE_2, PAGE_3];
  const entry = (id: string, waybackTimestamp: string, status: string, comparedTo: string | null): Row => ({
    id,
    trackedUrlId: PAGE.id,
    waybackTimestamp,
    digest: `digest-${id}`,
    status,
    observedAt: new Date('2026-09-05T00:00:00.000Z'),
    snapshotId: null,
    fetchedAt: new Date('2026-09-05T00:00:00.000Z'),
    rawBytesHash: hash(id),
    contentType: 'text/html',
    contentEncoding: null,
    digestVerified: true,
    textExtractionVersion: 'v3-extractor',
    comparedTo,
    rulesetId: null,
    textHash: null,
    heldBody: null,
    stop: null,
    reason: null,
    createdAt: new Date('2026-09-05T00:00:00.000Z'),
    updatedAt: new Date('2026-09-05T00:00:00.000Z'),
  });
  store.workListRows = [entry('cdx-1', '20200301090000', 'DUPLICATE', '20200201090000'), entry('cdx-2', '20200302120000', 'IDENTICAL', '20200301090000')];
  store.pageDecisions = [
    { id: 'd1', trackedUrlId: PAGE.id, sequence: 1, type: 'RULESET_CORRECTED', researcherId: AUTHOR, waybackTimestamp: '20200301090000', ruleId: null, reason: null, rulesetId: null, createdAt: new Date('2026-09-05T01:00:00.000Z') },
    { id: 'd2', trackedUrlId: PAGE.id, sequence: 2, type: 'RULE_TRUSTED', researcherId: AUTHOR, waybackTimestamp: '20200301090000', ruleId: RULE_ID, reason: null, rulesetId: null, createdAt: new Date('2026-09-05T02:00:00.000Z') },
  ];
  store.rules = [
    { id: RULE_ID, trackedUrlId: PAGE.id, selector: 'header', validFrom: '20200301090000', validTo: null, createdById: AUTHOR, createdByDecisionId: 'd1', createdAt: new Date('2026-09-05T01:00:00.000Z') },
    { id: OTHER_PAGES_RULE_ID, trackedUrlId: PAGE_2.id, selector: 'footer', validFrom: '20210301120000', validTo: null, createdById: AUTHOR, createdByDecisionId: 'd9', createdAt: new Date('2026-09-05T01:00:00.000Z') },
  ];
  store.ruleMatches = [{ id: 'match-1', ruleId: RULE_ID, waybackTimestamp: '20200301090000', matchedNodes: 1, observedAt: new Date('2026-09-05T01:00:00.000Z') }];
}

// --- the gate: who logs in ------------------------------------------------------------------------------------------

/** The gate's tokens and its Supabase double live in `gateDouble.ts`, which imports nothing (its header says why). */
export { TOKEN, supabaseAuthDouble } from './gateDouble';

export const PENDING = 'researcher-pending';

/** AUTHOR approved and logged in as `good`; PENDING registered and unapproved as `pending`; `stranger` has no researcher row. Merged onto the handles `seedThesis` holds. */
export function seedGate(): void {
  const handles = new Map(store.researchers.map((r) => [r['id'], r]));
  store.researchers = [
    { ...(handles.get(AUTHOR) ?? {}), id: AUTHOR, handle: 'חוקר_א', supabaseUserId: 'sb-author', approved: true },
    ...store.researchers.filter((r) => r['id'] !== AUTHOR),
    { id: PENDING, handle: 'pending_1', supabaseUserId: 'sb-pending', approved: false },
  ];
}

// --- the app: the server's mounts for the routes under test ----------------------------------------------------------

const fn: ExportContract = { step: 0, kind: 'function' };

export interface RouteModules {
  corpusRouter: Router;
  pagesRouter: Router;
  recordsRouter: Router;
  researchRouter: Router;
}

/** The two route modules UI-3 builds, red BY NAME ("routes/corpusRoutes is not built — UI-3 builds it") until they exist. */
export async function routeModules(): Promise<RouteModules> {
  const corpus = await load<Pick<RouteModules, 'corpusRouter' | 'pagesRouter' | 'recordsRouter'>>('routes/corpusRoutes', 0, { corpusRouter: fn, pagesRouter: fn, recordsRouter: fn }, 'UI-3');
  const research = await load<Pick<RouteModules, 'researchRouter'>>('routes/researchRoutes', 0, { researchRouter: fn }, 'UI-3');
  return { ...corpus, ...research };
}

/** Every error the app's handler met — a route that THREW, which a refusal never is. */
export const thrown: unknown[] = [];

/**
 * The four public mounts and the one gated mount, exactly as `server.ts` lines them (sketch §c1). `researcherId` presets
 * `req.researcherId` before every route, as a session the public adapter must never read (`public-identical`).
 */
export async function appOf(over: { researcherId?: string } = {}): Promise<Express> {
  const routes = await routeModules();
  const app = express();
  if (over.researcherId !== undefined) {
    const preset = over.researcherId;
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.researcherId = preset;
      next();
    });
  }
  app.use('/api/thesis', publicThesisRouter);
  app.use('/api/corpus', routes.corpusRouter);
  app.use('/api/pages', routes.pagesRouter);
  app.use('/api/records', routes.recordsRouter);
  app.use('/api/research', requireResearcher, routes.researchRouter);
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    thrown.push(err);
    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(500).json({ error: 'THREW' });
  });
  return app;
}
