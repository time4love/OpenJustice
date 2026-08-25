// ---------------------------------------------------------------------------
// The thesis publication gate.
//
// The one test that carries the whole design: publishing pins a version, the
// head then moves, and nothing public changes. Around it: each hard check
// blocks alone and the refusal names it; advisory checks never block but are
// recorded; check 6 admits when it is non-binding; a refused attempt still
// leaves its rationale and assessment on the session; unpublishing deletes
// nothing and is reversible.
//
// The assessor is mocked — this file tests the gate, not the model. The hedge
// and public-interest checks have their own deterministic suite.
// ---------------------------------------------------------------------------

const mockAssess = jest.fn();
// The resolver has its own suite (trajectoryCitation.test.ts). Here it is a
// stub, so these tests stay about the GATE: does an unanchored trajectory block
// publication, and does a citation that no longer resolves.
const mockResolveTrajectories = jest.fn();
jest.mock('../src/services/trajectoryCitation', () => ({
  resolveTrajectoryCitations: (ids: readonly string[]) => mockResolveTrajectories(ids) as unknown,
}));
jest.mock('../src/services/ThesisPublicationAssessorAgent', () => ({
  ThesisPublicationAssessorAgent: jest.fn().mockImplementation(() => ({ assess: mockAssess })),
}));

// Check 16 asks whether the stored critique still answers the current input.
// Deciding that means assembling the critic's whole input — evidence, gaps,
// trajectories, prompt — which is a different service's job and is tested where
// that rule lives (thesisAnalysisCitations.test.ts). Here it is a boundary: these
// fixtures are about the GATE, and the currency answer is stubbed so each check
// can still be failed one at a time.
const mockAnalysisIsCurrent = jest.fn();
jest.mock('../src/services/thesisAnalysis', () => {
  const actual = jest.requireActual('../src/services/thesisAnalysis');
  return { ...actual, analysisIsCurrent: (...a: unknown[]) => mockAnalysisIsCurrent(...a) as unknown };
});

interface Version {
  id: string;
  status: string;
  userContent: unknown;
  aiAnalysis: unknown;
  createdAt: Date;
  mentions: { type: string; refId: string }[];
  gapResolutions: { gapIndex: number; evidenceId: string }[];
}
interface Thesis {
  id: string;
  headVersionId: string | null;
  publishedVersionId: string | null;
  publishedAt: Date | null;
  publishedById: string | null;
  publicInterestStatement: string | null;
}
interface Session {
  id: string;
  thesisId: string | null;
  researcherId: string | null;
  status: string;
  name: string;
  question: string | null;
  createdAt: Date;
}

const db = {
  thesis: null as Thesis | null,
  versions: [] as Version[],
  evidence: [] as { fileHash: string; status: string; onChainTxHash: string | null; evidenceTier: string; summary: string }[],
  sessions: new Map<string, Session>(),
  events: [] as Record<string, unknown>[],
  keyFigures: [] as string[],
};
let seq = 0;

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    thesis: {
      findUnique: jest.fn(async ({ where, include }: { where: { id: string }; include?: { headVersion?: unknown } }) => {
        if (!db.thesis || db.thesis.id !== where.id) return null;
        const head = db.versions.find((v) => v.id === db.thesis?.headVersionId) ?? null;
        return include?.headVersion ? { ...db.thesis, headVersion: head } : { ...db.thesis };
      }),
      update: jest.fn(async ({ data }: { data: Partial<Thesis> }) => {
        Object.assign(db.thesis as object, data);
        return db.thesis;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Thesis> }) => {
        if (!db.thesis || db.thesis.id !== where.id) return { count: 0 };
        Object.assign(db.thesis, data);
        return { count: 1 };
      }),
    },
    evidence: {
      findMany: jest.fn(async ({ where }: { where: { fileHash: { in: string[] } } }) =>
        db.evidence.filter((e) => where.fileHash.in.includes(e.fileHash)),
      ),
      count: jest.fn(async ({ where }: { where: { status: string; evidenceTier: { notIn: string[] } } }) =>
        db.evidence.filter((e) => e.status === where.status && !where.evidenceTier.notIn.includes(e.evidenceTier)).length,
      ),
    },
    researchSession: {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: {
            status?: string;
            thesisId?: string;
            researcherId?: string | null;
            events?: { some: { type: string } };
          };
        }) => {
          if (where.status) {
            // researcherId is honoured because the lookup is now scoped to the
            // caller. A mock that ignored it would let this suite pass while a
            // researcher published inside somebody else's session.
            const s = [...db.sessions.values()].find(
              (x) =>
                x.status === where.status &&
                (!('researcherId' in where) || x.researcherId === where.researcherId),
            );
            return s ? { ...s, researcher: s.researcherId ? { handle: s.researcherId } : null, _count: { events: 0 } } : null;
          }
          const wanted = where.events?.some.type;
          const s = [...db.sessions.values()].find(
            (x) =>
              x.thesisId === where.thesisId &&
              db.events.some((e) => e['sessionId'] === x.id && e['type'] === wanted),
          );
          return s ? { id: s.id, question: s.question } : null;
        },
      ),
    },
    researchSessionEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const e = { ...data, createdAt: new Date(++seq) };
        db.events.push(e);
        return e;
      }),
      findFirst: jest.fn(async ({ where }: { where: { type: string; refId: string } }) => {
        const matches = db.events.filter((e) => e['type'] === where.type && e['refId'] === where.refId);
        const last = matches.at(-1);
        return last ? { sessionId: last['sessionId'] } : null;
      }),
    },
    researcher: { findUnique: jest.fn(async () => null) },
    keyFigure: { findMany: jest.fn(async () => db.keyFigures.map((name) => ({ name }))) },
    $transaction: jest.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
  },
}));

import { assessPublication, publishThesis, unpublishThesis } from '../src/services/thesisPublication';
import { publicationState } from '../src/lib/thesisView';

const FIGURE = 'נחמן אש';
const EV = '0xaaa';

function hedgedDoc(extraSentence?: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'על פי המסמכים, ' },
          { type: 'keyFigureMention', attrs: { id: FIGURE, label: FIGURE } },
          { type: 'text', text: ' חתם על ההנחיה המעודכנת. ' },
          { type: 'evidenceMention', attrs: { id: EV, label: '#ev' } },
          ...(extraSentence ? [{ type: 'text', text: ` ${extraSentence}` }] : []),
        ],
      },
      { type: 'paragraph', content: [{ type: 'keyFigureMention', attrs: { id: FIGURE, label: FIGURE } }] },
    ],
  };
}

const ANALYSIS = {
  counterArguments: [],
  evidenceGaps: [{ description: 'פרוטוקול ועדת ההיגוי מיום 5.8.2022, במשרד הבריאות', suggestedSearch: 'protocol' }],
  alternativeInterpretations: [],
  overallStrengthAssessment: 'MODERATE',
  summaryHe: 'תקציר',
};

function addVersion(id: string, over: Partial<Version> = {}): Version {
  const v: Version = {
    id,
    status: 'COMPLETE',
    userContent: hedgedDoc(),
    aiAnalysis: ANALYSIS,
    createdAt: new Date(2026, 0, db.versions.length + 1),
    mentions: [
      { type: 'EVIDENCE', refId: EV },
      { type: 'KEY_FIGURE', refId: FIGURE },
    ],
    gapResolutions: [],
    ...over,
  };
  db.versions.push(v);
  if (db.thesis) db.thesis.headVersionId = id;
  return v;
}

function openSession(researcherId: string | null, thesisId: string | null = 't1', id = `s-${String(++seq)}`): Session {
  const s: Session = { id, thesisId, researcherId, status: 'ACTIVE', name: 'work', question: null, createdAt: new Date() };
  db.sessions.set(id, s);
  return s;
}

function goodAssessment(over: Record<string, unknown> = {}) {
  return {
    rationaleHasSubstance: true,
    substanceGaps: [],
    verdict: 'SUPPORTS',
    objection: '',
    officialCapacityOk: true,
    characterClaims: [],
    gapActionability: [{ gapIndex: 0, namesDocument: true, namesHolder: true, note: '' }],
    assessment: 'נימוק',
    ...over,
  };
}

const RATIONALE = 'התזה טוענת X; הראיות תומכות ב-Y; היא נעצרת ב-Z.';

function eventsOfType(type: string) {
  return db.events.filter((e) => e['type'] === type);
}

beforeEach(() => {
  jest.clearAllMocks();
  // The default is "current": these fixtures exercise the other checks, and a
  // stale critique is failed deliberately in its own test below.
  mockAnalysisIsCurrent.mockResolvedValue(true);
  seq = 0;
  db.thesis = {
    id: 't1',
    headVersionId: null,
    publishedVersionId: null,
    publishedAt: null,
    publishedById: null,
    publicInterestStatement: 'הציבור זכאי לדעת כיצד שונו הנחיות בטיחות רשמיות בזמן אמת.',
  };
  db.versions = [];
  db.evidence = [{ fileHash: EV, status: 'CONFIRMED', onChainTxHash: '0xtx', evidenceTier: 'Tier 2: Material', summary: 's' }];
  db.sessions.clear();
  db.events = [];
  db.keyFigures = [];
  addVersion('v1');
  mockAssess.mockResolvedValue(goodAssessment());
  mockResolveTrajectories.mockResolvedValue({ resolved: [], missing: [] });
});

/** A resolved trajectory citation, as the resolver would hand it to the gate. */
function citedTrajectory(over: Record<string, unknown> = {}) {
  return {
    id: 'traj-1',
    claimHash: 'abc',
    claimText: 'טענה שנעקבה על פני כל ההעתקים בארכיון',
    url: 'https://corona.health.gov.il/x',
    trackedUrlId: 'tracked-1',
    observations: [],
    changes: [],
    transitions: 2,
    firstSeen: '2022-07-24',
    lastSeen: '2022-09-05',
    finalState: 'REMOVED',
    computation: {
      id: 'comp-1',
      sourceStateHash: 'state-1',
      detectionVersion: 'v1',
      computedAt: '2026-08-23T10:00:00.000Z',
      snapshotsExamined: 4,
    },
    coMovement: { patternHash: 'p', claimCount: 1, members: [] },
    currency: { state: 'PINNED_IS_LATEST', computedAt: '2026-08-23T10:00:00.000Z' },
    caveat: 'computed over the archived text extraction',
    ...over,
  };
}

/** Head version citing one trajectory alongside the usual evidence. */
function citeTrajectory(refId = 'traj-1'): void {
  db.versions[0].mentions.push({ type: 'CLAIM_TRAJECTORY', refId });
}

async function report(rationale: string | null = RATIONALE) {
  const r = await assessPublication('t1', rationale);
  if ('error' in r) throw new Error(r.error);
  return r;
}

describe('publishing pins a version', () => {
  it('pins the head; the head then moves and nothing public changes', async () => {
    openSession('r1');
    const r = await publishThesis('t1', 'r1', RATIONALE);

    expect(r).toMatchObject({ published: true, publishedVersionId: 'v1', overObjection: false });
    expect(db.thesis?.publishedVersionId).toBe('v1');
    expect(db.thesis?.publishedById).toBe('r1');

    // The researcher keeps working: a new head, with a different analysis.
    addVersion('v2', { aiAnalysis: { ...ANALYSIS, evidenceGaps: [] } });

    expect(db.thesis?.headVersionId).toBe('v2');
    expect(db.thesis?.publishedVersionId).toBe('v1');
    const state = publicationState(
      { ...(db.thesis as Thesis), publishedBy: null },
      db.versions.map((v) => ({ id: v.id, createdAt: v.createdAt })),
    );
    expect(state).toMatchObject({ isPublished: true, headIsPublished: false, versionsAhead: 1, publishedVersionId: 'v1' });
  });

  it('records the act on the active session: rationale, assessment, THESIS_PUBLISHED with the version id', async () => {
    const s = openSession('r1');
    await publishThesis('t1', 'r1', RATIONALE);

    const types = db.events.filter((e) => e['sessionId'] === s.id).map((e) => e['type']);
    expect(types).toEqual(['PUBLICATION_RATIONALE', 'PUBLICATION_ASSESSED', 'THESIS_PUBLISHED']);
    expect(eventsOfType('PUBLICATION_RATIONALE')[0]['description']).toBe(RATIONALE);
    expect(eventsOfType('THESIS_PUBLISHED')[0]['refId']).toBe('v1');
    const assessed = JSON.parse(String(eventsOfType('PUBLICATION_ASSESSED')[0]['description'])) as { checks: unknown[] };
    expect(assessed.checks).toHaveLength(16);
  });

  it('saves the public-interest statement on the thesis even when the attempt is refused', async () => {
    openSession('r1');
    db.thesis!.publicInterestStatement = null;
    mockAssess.mockResolvedValue(goodAssessment({ rationaleHasSubstance: false, substanceGaps: ['where it stops'] }));

    const r = await publishThesis('t1', 'r1', 'weak', 'הציבור זכאי לדעת כיצד שונו הנחיות בטיחות רשמיות בזמן אמת.');

    expect(r).toMatchObject({ published: false, refusedBy: ['RATIONALE_SUBSTANCE'] });
    expect(db.thesis?.publicInterestStatement).toContain('הציבור זכאי');
  });
});

describe('the session requirement', () => {
  it('refuses with no active session, and writes nothing', async () => {
    const r = await publishThesis('t1', 'r1', RATIONALE);
    expect(r).toMatchObject({ published: false, error: 'NO_ACTIVE_SESSION' });
    expect(db.events).toHaveLength(0);
    expect(mockAssess).not.toHaveBeenCalled();
  });

  it("is not blocked by another researcher's session — it is simply not yours to publish in", async () => {
    // Was ACTIVE_SESSION_NOT_YOURS: the lookup fetched THE active session
    // globally and then asked whether it belonged to you. Scoped to the caller,
    // somebody else's open session is invisible here, and the honest answer is
    // that r1 has no session at all — not that r2's is in the way.
    openSession('r2');

    const r = await publishThesis('t1', 'r1', RATIONALE);

    expect(r).toMatchObject({ published: false, error: 'NO_ACTIVE_SESSION' });
    // r2's work is untouched by r1's refused attempt.
    expect(db.events).toHaveLength(0);
  });

  it('refuses inside a session on another thesis', async () => {
    openSession('r1', 'other');
    const r = await publishThesis('t1', 'r1', RATIONALE);
    expect(r).toMatchObject({ published: false, error: 'ACTIVE_SESSION_ON_OTHER_THESIS' });
  });
});

describe('each hard check blocks alone, and the refusal names it', () => {
  beforeEach(() => openSession('r1'));

  it('16 — the stored critique argued against a different input', async () => {
    // The hole check 2 could not see. Status is set to PENDING_AI only when a
    // version is CREATED, so a critique survives corrected evidence summaries, a
    // new detection pass, and changes to what the critic is given — and check 2,
    // which asks only whether an analysis EXISTS, keeps passing. A thesis could
    // publish carrying adversarial review of something else.
    mockAnalysisIsCurrent.mockResolvedValue(false);

    const r = await report();

    expect(r.hardFailures).toEqual(['ANALYSIS_CURRENT']);
    expect(r.publishable).toBe(false);
    expect(r.checks.find((c) => c.id === 'ANALYSIS_CURRENT')?.summary).toContain('run_ai_analysis');
    // Check 2 still passes: an analysis does exist. Two questions, two checks.
    expect(r.checks.find((c) => c.id === 'ANALYSIS_COMPLETE')?.passed).toBe(true);
  });

  it('passes the good fixture with every hard check', async () => {
    const r = await report();
    expect(r.hardFailures).toEqual([]);
    expect(r.publishable).toBe(true);
    expect(r.checks.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it('1 — no head version', async () => {
    db.thesis!.headVersionId = null;
    const r = await report();
    expect(r.hardFailures).toContain('HEAD_VERSION');
    expect(r.publishable).toBe(false);
  });

  it('2 — analysis not complete on this text', async () => {
    db.versions[0].status = 'PENDING_AI';
    db.versions[0].aiAnalysis = null;
    const r = await report();
    expect(r.hardFailures).toContain('ANALYSIS_COMPLETE');
    expect(r.checks.find((c) => c.id === 'ANALYSIS_COMPLETE')?.summary).toContain('PENDING_AI');
    expect(mockAssess).not.toHaveBeenCalled();
  });

  it('3 — analysis present but malformed', async () => {
    db.versions[0].aiAnalysis = { evidenceGaps: 'nope' };
    const r = await report();
    expect(r.hardFailures).toContain('ANALYSIS_WELL_FORMED');
    expect(r.hardFailures).not.toContain('ANALYSIS_COMPLETE');
  });

  it('4 — cites no evidence', async () => {
    db.versions[0].mentions = [{ type: 'KEY_FIGURE', refId: FIGURE }];
    const r = await report();
    expect(r.hardFailures).toContain('CITES_EVIDENCE');
  });

  it('5 — cited evidence not in the vault / not CONFIRMED / not anchored', async () => {
    db.evidence = [];
    let r = await report();
    expect(r.hardFailures).toEqual(['EVIDENCE_CONFIRMED_AND_ANCHORED']);
    expect(r.checks.find((c) => c.id === 'EVIDENCE_CONFIRMED_AND_ANCHORED')?.details).toMatchObject({ missing: [EV] });

    db.evidence = [{ fileHash: EV, status: 'PENDING_REVIEW', onChainTxHash: null, evidenceTier: 'Tier 2: Material', summary: 's' }];
    r = await report();
    expect(r.hardFailures).toEqual(['EVIDENCE_CONFIRMED_AND_ANCHORED']);

    // CONFIRMED without a tx hash is the invariant violation promote_evidence guards against.
    db.evidence = [{ fileHash: EV, status: 'CONFIRMED', onChainTxHash: null, evidenceTier: 'Tier 2: Material', summary: 's' }];
    r = await report();
    expect(r.hardFailures).toEqual(['EVIDENCE_CONFIRMED_AND_ANCHORED']);
    expect(r.checks.find((c) => c.id === 'EVIDENCE_CONFIRMED_AND_ANCHORED')?.details).toMatchObject({ unanchored: [EV] });
  });

  it('6 — cited evidence below Tier 2', async () => {
    db.evidence[0].evidenceTier = 'Tier 3: Supporting';
    const r = await report();
    expect(r.hardFailures).toEqual(['EVIDENCE_TIER']);
    expect(r.checks.find((c) => c.id === 'EVIDENCE_TIER')?.binding).toBe(true);
  });

  it('6 — reports that it is non-binding while every confirmed record is at or above Tier 2', async () => {
    const r = await report();
    const c = r.checks.find((x) => x.id === 'EVIDENCE_TIER');
    expect(c?.passed).toBe(true);
    expect(c?.binding).toBe(false);
    expect(c?.summary).toContain('NON-BINDING');
  });

  it('6 — binds once a confirmed below-threshold record exists anywhere in the vault', async () => {
    db.evidence.push({ fileHash: '0xbbb', status: 'CONFIRMED', onChainTxHash: '0x2', evidenceTier: 'Tier 3: Supporting', summary: 's' });
    const r = await report();
    const c = r.checks.find((x) => x.id === 'EVIDENCE_TIER');
    expect(c?.passed).toBe(true);
    expect(c?.binding).toBe(true);
    expect(c?.summary).not.toContain('NON-BINDING');
  });

  it('7 — a sentence naming a key figure with no hedge', async () => {
    db.versions[0].userContent = hedgedDoc(`${FIGURE} הסתיר את הנתונים.`);
    const r = await report();
    expect(r.hardFailures).toEqual(['FIGURES_HEDGED']);
    expect(JSON.stringify(r.checks.find((c) => c.id === 'FIGURES_HEDGED')?.details)).toContain('הסתיר');
  });

  it('7 — a KNOWN figure typed as plain text, never tagged in this thesis, is still caught', async () => {
    // The easiest way to write an unhedged allegation is to just type the name.
    db.keyFigures = ['שרון אלרעי-פרייס'];
    db.versions[0].userContent = hedgedDoc('שרון אלרעי-פרייס אישרה את המחיקה.');
    const r = await report();
    expect(r.hardFailures).toEqual(['FIGURES_HEDGED']);
    expect(r.checks.find((c) => c.id === 'FIGURES_HEDGED')?.summary).toContain('2 known figure name(s)');
  });

  it('7 — an unpunctuated run naming a figure fails even when hedged, and says why', async () => {
    const run = `לכאורה ${FIGURE} ${'פעל בניגוד להנחיות וגם '.repeat(20)}`;
    db.versions[0].userContent = hedgedDoc(run);
    const r = await report();
    expect(r.hardFailures).toEqual(['FIGURES_HEDGED']);
    expect(r.checks.find((c) => c.id === 'FIGURES_HEDGED')?.summary).toContain('add punctuation');
  });

  it('8 — no public-interest statement', async () => {
    db.thesis!.publicInterestStatement = null;
    const r = await report();
    expect(r.hardFailures).toEqual(['PUBLIC_INTEREST_STATEMENT']);
  });

  it('9 — the call is not live because the analysis found no gaps', async () => {
    db.versions[0].aiAnalysis = { ...ANALYSIS, evidenceGaps: [] };
    const r = await report();
    expect(r.hardFailures).toEqual(['CALL_LIVE']);
    expect(r.checks.find((c) => c.id === 'CALL_LIVE')?.summary).toContain('no evidence gaps');
  });

  it('10 — rationale without substance; the verdict is never a hard failure', async () => {
    mockAssess.mockResolvedValue(goodAssessment({ rationaleHasSubstance: false, substanceGaps: ['where it stops'] }));
    const r = await report();
    expect(r.hardFailures).toEqual(['RATIONALE_SUBSTANCE']);
    expect(r.checks.find((c) => c.id === 'RATIONALE_SUBSTANCE')?.details).toEqual(['where it stops']);

    mockAssess.mockResolvedValue(goodAssessment({ verdict: 'DISPUTES', objection: 'no' }));
    const r2 = await report();
    expect(r2.hardFailures).toEqual([]);
    expect(r2.verdict).toBe('DISPUTES');
  });

  it('10 — no rationale supplied at all fails without consulting the model on it', async () => {
    const r = await report(null);
    expect(r.hardFailures).toEqual(['RATIONALE_SUBSTANCE']);
    expect(r.checks.find((c) => c.id === 'RATIONALE_SUBSTANCE')?.summary).toContain('No rationale');
    // The model still ran for the advisory checks, with no rationale to judge.
    expect(mockAssess).toHaveBeenCalledWith(expect.objectContaining({ rationale: null }));
  });
});

describe('advisory checks never block, and are recorded', () => {
  beforeEach(() => openSession('r1'));

  it('publishes over character claims and non-actionable gaps, naming them on the publication', async () => {
    mockAssess.mockResolvedValue(
      goodAssessment({
        officialCapacityOk: false,
        characterClaims: ['הוא שיקר'],
        gapActionability: [{ gapIndex: 0, namesDocument: false, namesHolder: false, note: 'name the protocol' }],
      }),
    );
    const r = await publishThesis('t1', 'r1', RATIONALE);

    expect(r).toMatchObject({ published: true, advisoryFailures: ['OFFICIAL_CAPACITY', 'GAP_ACTIONABILITY', 'FRAMING_ATTACHED'] });
    expect(String(eventsOfType('THESIS_PUBLISHED')[0]['description'])).toContain('OFFICIAL_CAPACITY');
  });

  it('publishes over a DISPUTES verdict and records the dissent permanently', async () => {
    mockAssess.mockResolvedValue(goodAssessment({ verdict: 'DISPUTES', objection: 'the evidence shows less' }));
    const r = await publishThesis('t1', 'r1', RATIONALE);

    expect(r).toMatchObject({ published: true, overObjection: true });
    expect(String(eventsOfType('THESIS_PUBLISHED')[0]['description'])).toContain('over a sustained objection');
    const assessed = JSON.parse(String(eventsOfType('PUBLICATION_ASSESSED')[0]['description'])) as {
      assessment: { objection: string };
    };
    expect(assessed.assessment.objection).toBe('the evidence shows less');
  });

  it('13 — passes once a framing session is attached', async () => {
    const framing = openSession('r1', 't1', 'framing');
    framing.status = 'CLOSED';
    db.events.push({ sessionId: 'framing', type: 'THESIS_ATTACHED', refId: 't1' });
    const r = await report();
    expect(r.advisoryFailures).toEqual([]);
  });
});

describe('a refused attempt', () => {
  it('still records the rationale and the assessment on the session, and pins nothing', async () => {
    const s = openSession('r1');
    db.thesis!.publicInterestStatement = null;
    const r = await publishThesis('t1', 'r1', RATIONALE);

    expect(r).toMatchObject({ published: false, refusedBy: ['PUBLIC_INTEREST_STATEMENT'], sessionId: s.id });
    expect(db.thesis?.publishedVersionId).toBeNull();
    expect(db.events.map((e) => e['type'])).toEqual(['PUBLICATION_RATIONALE', 'PUBLICATION_ASSESSED']);
  });
});

describe('unpublish', () => {
  it('sets the pin to null, deletes nothing, records the reason on the publishing session, and is reversible', async () => {
    const s = openSession('r1');
    await publishThesis('t1', 'r1', RATIONALE);
    s.status = 'CLOSED';

    const r = await unpublishThesis('t1', 'r1', 'a correction is coming');

    expect(r).toMatchObject({ unpublished: true, previouslyPublishedVersionId: 'v1', recordedOnSessionId: s.id });
    expect(db.thesis).toMatchObject({ publishedVersionId: null, publishedAt: null, publishedById: null });
    expect(db.versions.map((v) => v.id)).toEqual(['v1']);
    const ev = eventsOfType('THESIS_UNPUBLISHED')[0];
    expect(ev['sessionId']).toBe(s.id);
    expect(ev['description']).toContain('a correction is coming');

    openSession('r1');
    const again = await publishThesis('t1', 'r1', RATIONALE);
    expect(again).toMatchObject({ published: true, publishedVersionId: 'v1' });
  });

  it('prefers the caller\'s active session on the thesis for the record', async () => {
    const first = openSession('r1');
    await publishThesis('t1', 'r1', RATIONALE);
    first.status = 'CLOSED';
    const second = openSession('r1');

    const r = await unpublishThesis('t1', 'r1', 'reason');
    expect(r).toMatchObject({ unpublished: true, recordedOnSessionId: second.id });
  });

  it('reports an unpublished thesis rather than pretending', async () => {
    const r = await unpublishThesis('t1', 'r1', 'reason');
    expect(r).toMatchObject({ unpublished: false, error: 'NOT_PUBLISHED' });
  });
});

// ---------------------------------------------------------------------------
// 14 + 15 — cited trajectories.
//
// Trajectories are deliberately NOT anchored on-chain: they are derived from
// snapshots that are anchored individually, and anchoring a derivable thing
// adds nothing but the appearance of authority. So the anchoring check must not
// reach them — applying check 5 unchanged would make every trajectory-citing
// thesis unpublishable, which is the failure this pair of tests exists to catch.
// ---------------------------------------------------------------------------
describe('cited trajectories', () => {
  beforeEach(() => openSession('r1'));

  it('does NOT fail a thesis for citing an unanchored trajectory', async () => {
    citeTrajectory();
    mockResolveTrajectories.mockResolvedValue({ resolved: [citedTrajectory()], missing: [] });

    const r = await report();

    expect(r.hardFailures).toEqual([]);
    expect(r.publishable).toBe(true);
    expect(r.checks.find((c) => c.id === 'TRAJECTORIES_RESOLVE')).toMatchObject({ kind: 'hard', passed: true });
  });

  it('DOES fail a thesis citing a trajectory id that no longer exists', async () => {
    citeTrajectory('traj-deleted');
    mockResolveTrajectories.mockResolvedValue({ resolved: [], missing: ['traj-deleted'] });

    const r = await report();

    expect(r.hardFailures).toEqual(['TRAJECTORIES_RESOLVE']);
    expect(r.publishable).toBe(false);
    expect(r.checks.find((c) => c.id === 'TRAJECTORIES_RESOLVE')?.details).toEqual({ missing: ['traj-deleted'] });
  });

  it('records a superseded trajectory as ADVISORY — the archive changed, the thesis did not break', async () => {
    citeTrajectory();
    mockResolveTrajectories.mockResolvedValue({
      resolved: [
        citedTrajectory({
          currency: {
            state: 'RECOMPUTED_DISAGREES',
            latestComputationId: 'comp-2',
            latestComputedAt: '2026-08-24T10:00:00.000Z',
            latestSnapshotsExamined: 5,
            difference: 'The claim was REMOVED when cited and is PRESENT in the latest pass.',
            latestFinalState: 'PRESENT',
            latestFlips: [],
          },
        }),
      ],
      missing: [],
    });

    const r = await report();

    expect(r.hardFailures).toEqual([]);
    expect(r.publishable).toBe(true);
    expect(r.advisoryFailures).toContain('TRAJECTORIES_CURRENT');
  });

  it('treats a claim the latest pass no longer follows as silence, not disagreement', async () => {
    citeTrajectory();
    mockResolveTrajectories.mockResolvedValue({
      resolved: [
        citedTrajectory({
          currency: {
            state: 'NOT_FOLLOWED_BY_LATEST',
            latestComputationId: 'comp-2',
            latestComputedAt: '2026-08-24T10:00:00.000Z',
          },
        }),
      ],
      missing: [],
    });

    const r = await report();

    expect(r.advisoryFailures).not.toContain('TRAJECTORIES_CURRENT');
    expect(r.checks.find((c) => c.id === 'TRAJECTORIES_CURRENT')?.summary).toContain('no longer followed');
  });

  it('passes both checks with nothing cited, and says so rather than implying a check ran', async () => {
    const r = await report();

    expect(r.checks.find((c) => c.id === 'TRAJECTORIES_RESOLVE')?.summary).toBe('No trajectory cited.');
    expect(r.checks.find((c) => c.id === 'TRAJECTORIES_CURRENT')?.summary).toBe('No trajectory cited.');
  });
});
