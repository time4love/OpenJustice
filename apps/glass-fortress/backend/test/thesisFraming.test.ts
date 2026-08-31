// ---------------------------------------------------------------------------
// Thesis framing — deciding what to argue, before writing it.
//
// The topic string that drives evidence retrieval determines which evidence is pulled
// semantically and what the Devil's Advocate attacks, so a wrong framing yields
// a well-argued thesis about the wrong thing. Until 2026-08-22 that decision left
// no trace: the topic was interpolated into a prompt and discarded, and a
// ResearchSession could not exist without a thesisId.
//
// The valuable output is CONTRADICTIONS, not candidate framings. Generating
// options is the easy half; being told your own evidence points the other way is
// what saves a thesis.
// ---------------------------------------------------------------------------

const mockAssess = jest.fn();
// Only the AGENT is stubbed. ThesisFramingAssessmentSchema is kept real, because
// getThesisFraming now validates the stored assessment against it — a stubbed
// schema would make the malformed-record tests below assert the stub.
jest.mock('../src/services/ThesisFramingAssessorAgent', () => ({
  ...jest.requireActual('../src/services/ThesisFramingAssessorAgent'),
  ThesisFramingAssessorAgent: jest.fn().mockImplementation(() => ({ assess: mockAssess })),
}));

const mockSearch = jest.fn();
jest.mock('../src/services/VectorStoreService', () => ({
  VectorStoreService: {
    create: jest.fn().mockResolvedValue({ searchSimilarEvidence: (...a: unknown[]) => mockSearch(...a) }),
  },
}));

const db = {
  sessions: new Map<string, Record<string, unknown>>(),
  events: [] as Record<string, unknown>[],
  evidence: [] as Record<string, unknown>[],
  theses: new Set<string>(),
};
let seq = 0;

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    researchSession: {
      // The one-active rule: openThesisFraming now refuses while any session is
      // ACTIVE. Each test here opens at most one, after a cleared db.
      // Honours `thesisId` as well as `status`, because linkThesisToFraming
      // derives the framing session from "ACTIVE **and not yet bound to a
      // thesis**" — a mock ignoring the second half would make the derivation
      // pass a test it does not pass in reality.
      // Honours researcherId and NOT: the change under test is entirely about
      // scoping, and a mock that ignored scope would pass either way.
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: {
            status?: string;
            thesisId?: string | null;
            researcherId?: string | null;
            NOT?: { researcherId?: string };
          };
        }) => {
          const s = [...db.sessions.values()].find(
            (x) =>
              (!where.status || x['status'] === where.status) &&
              (!('thesisId' in where) ||
                (where.thesisId === null ? !x['thesisId'] : x['thesisId'] === where.thesisId)) &&
              (!('researcherId' in where) || x['researcherId'] === where.researcherId) &&
              (where.NOT?.researcherId === undefined || x['researcherId'] !== where.NOT.researcherId),
          );
          if (!s) return null;
          const handle = s['researcherId'] ? String(s['researcherId']).replace('r-', '') : null;
          return {
            createdAt: new Date(),
            ...s,
            researcher: handle ? { handle } : null,
            _count: { events: 0 },
          };
        },
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `fs-${++seq}`;
        const s: Record<string, unknown> = { id, ...data };
        delete s['events'];
        db.sessions.set(id, s);
        db.events.push({ sessionId: id, type: 'SESSION_STARTED', description: 'opened', createdAt: new Date(++seq) });
        return s;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const s = db.sessions.get(where.id);
        if (!s) return null;
        return { ...s, events: db.events.filter((e) => e['sessionId'] === where.id) };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        Object.assign(db.sessions.get(where.id) as object, data);
        return {};
      }),
    },
    researchSessionEvent: {
      findMany: jest.fn(async ({ where }: { where: { sessionId: string; type: { in: string[] } } }) =>
        db.events.filter(
          (e) => e['sessionId'] === where.sessionId && where.type.in.includes(e['type'] as string),
        ),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const e = { ...data, createdAt: new Date(++seq) };
        db.events.push(e);
        return e;
      }),
    },
    evidence: { findMany: jest.fn(async () => db.evidence) },
    thesis: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        db.theses.has(where.id) ? { id: where.id } : null,
      ),
    },
    $transaction: jest.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
  },
}));

import {
  openThesisFraming as openThesisFramingRaw,
  assessThesisFraming,
  attachThesisToFraming,
  linkThesisToFraming,
  repairFramingLink,
  getThesisFraming,
} from '../src/services/thesisFraming';

const DANA = 'r-dana';
const YOAV = 'r-yoav';

/** Open a framing session, asserting it was not refused. Sessions need an owner. */
async function openThesisFraming(question: string, researcherId: string = DANA) {
  const state = await openThesisFramingRaw(question, undefined, researcherId);
  if ('error' in state) throw new Error(`framing refused: ${state.error}`);
  return state;
}

function assessment(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    candidateFramings: [
      {
        framing: 'המשרד עדכן מצגי בטיחות בהתאם לידע פנימי',
        scope: 'NARROW',
        backedByFileHashes: ['0xaaa'],
        strength: 'קרבה בזמן לאירוע חיצוני מתועד',
        weakness: 'הסבר תמים אפשרי',
      },
    ],
    contradictions: [],
    unverifiedAssumptions: [],
    recommendedTopicString: 'מסגור מומלץ',
    assessment: 'נימוק',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.sessions.clear();
  db.events.length = 0;
  db.theses.clear();
  db.theses.add('thesis-1');
  db.theses.add('thesis-2');
  seq = 0;
  db.evidence = [
    {
      fileHash: '0xaaa',
      summary: 's',
      evidenceTier: 'Tier 2: Material',
      evidenceRole: 'Incriminating',
      evidenceDate: '2022-08-05',
      investigativeCategories: ['WITHHOLDING_INFORMATION'],
      targetEntity: 'Ministry of Health',
    },
  ];
  mockSearch.mockResolvedValue([{ fileHash: '0xaaa' }]);
});

describe('openThesisFraming', () => {
  it('opens a research session with no thesis attached', async () => {
    const s = await openThesisFraming('did the ministry revise safety claims?');

    expect(s.thesisId).toBeNull();
    expect(db.sessions.get(s.sessionId)?.['thesisId']).toBeNull();
    expect(db.sessions.get(s.sessionId)?.['question']).toBe('did the ministry revise safety claims?');
  });
});

describe('openThesisFraming — one active session', () => {
  it('refuses while another session is active and names it — framing sessions no longer escape the rule', async () => {
    const first = await openThesisFraming('first question');
    const second = await openThesisFramingRaw('second question', undefined, DANA);

    expect('error' in second).toBe(true);
    if (!('error' in second)) return;
    expect(second.error).toBe('SESSION_ACTIVE_SAME_RESEARCHER');
    if (!('activeSession' in second)) throw new Error('unreachable');
    expect(second.activeSession.id).toBe(first.sessionId);
    expect(db.sessions.size).toBe(1);
  });
});

describe('assessThesisFraming', () => {
  it('searches the vault on the QUESTION, not the proposed framing', async () => {
    // Searching the framing would return whatever supports it and hide what
    // contradicts it — which is the one output this exists to produce.
    const s = await openThesisFraming('the question');
    mockAssess.mockResolvedValue(assessment());

    await assessThesisFraming(s.sessionId, 'a framing that says something else entirely');

    expect(mockSearch.mock.calls[0][0]).toBe('the question');
  });

  it('surfaces contradictions between the framing and the evidence', async () => {
    const s = await openThesisFraming('the question');
    mockAssess.mockResolvedValue(
      assessment({
        contradictions: [
          {
            researcherClaim: 'המשרד הסיר אזהרות בעודו ממליץ',
            whatEvidenceShows: 'העריכה הסירה את הבטחות המשרד עצמו ואת המלצתו',
            fileHash: '0xaaa',
          },
        ],
      }),
    );

    const r = await assessThesisFraming(s.sessionId, 'framing');

    expect('assessment' in r && r.assessment.contradictions).toHaveLength(1);
  });

  it('logs both the proposal and the assessment, so the exchange is the record', async () => {
    const s = await openThesisFraming('the question');
    mockAssess.mockResolvedValue(assessment());

    await assessThesisFraming(s.sessionId, 'my framing');

    const types = db.events.filter((e) => e['sessionId'] === s.sessionId).map((e) => e['type']);
    expect(types).toEqual(['SESSION_STARTED', 'FRAMING_PROPOSED', 'FRAMING_ASSESSED']);
    expect(db.events[1]['description']).toBe('my framing');
  });

  it('gives the assessor the prior turns, so a reply is judged cumulatively', async () => {
    const s = await openThesisFraming('the question');
    mockAssess.mockResolvedValue(assessment());
    await assessThesisFraming(s.sessionId, 'first framing');
    await assessThesisFraming(s.sessionId, 'revised framing');

    const second = mockAssess.mock.calls[1][0] as { priorTurns: string[] };
    expect(second.priorTurns.join('\n')).toContain('first framing');
  });

  it('refuses when no confirmed evidence anchors the question', async () => {
    // A framing with no anchor is an idea, not a framing.
    const s = await openThesisFraming('the question');
    db.evidence = [];

    const r = await assessThesisFraming(s.sessionId, 'framing');

    expect(r).toMatchObject({ error: 'NO_EVIDENCE' });
    expect(mockAssess).not.toHaveBeenCalled();
  });

  it('refuses once a thesis is attached', async () => {
    const s = await openThesisFraming('the question');
    await attachThesisToFraming(s.sessionId, 'thesis-1');

    const r = await assessThesisFraming(s.sessionId, 'framing');

    expect(r).toMatchObject({ error: 'ALREADY_HAS_THESIS', thesisId: 'thesis-1' });
  });
});

describe('attachThesisToFraming', () => {
  it('links the thesis and records it', async () => {
    const s = await openThesisFraming('the question');

    await attachThesisToFraming(s.sessionId, 'thesis-1');

    expect(db.sessions.get(s.sessionId)?.['thesisId']).toBe('thesis-1');
    const attached = db.events.find((e) => e['type'] === 'THESIS_ATTACHED');
    expect(attached?.['refId']).toBe('thesis-1');
  });

  it('is a no-op when a thesis is already attached, rather than overwriting provenance', async () => {
    const s = await openThesisFraming('the question');
    await attachThesisToFraming(s.sessionId, 'thesis-1');

    await attachThesisToFraming(s.sessionId, 'thesis-2');

    expect(db.sessions.get(s.sessionId)?.['thesisId']).toBe('thesis-1');
  });

  it('does not throw for an unknown session — a thesis must never fail to save over provenance', async () => {
    await expect(attachThesisToFraming('nope', 'thesis-1')).resolves.toBeUndefined();
  });
});

describe('linkThesisToFraming — deriving the framing session', () => {
  it('links the single ACTIVE session WITHOUT being passed its id', async () => {
    // The whole point of fix (a): the parameter was optional with one caller, so
    // omitting it lost the link permanently and no repair path existed.
    const s = await openThesisFraming('the question');

    const link = await linkThesisToFraming('thesis-1', undefined, DANA);

    expect(link).toEqual({ linked: true, sessionId: s.sessionId, derived: true });
    expect(db.sessions.get(s.sessionId)?.['thesisId']).toBe('thesis-1');
    expect(db.events.find((e) => e['type'] === 'THESIS_ATTACHED')?.['refId']).toBe('thesis-1');
  });

  // -------------------------------------------------------------------------
  // Provenance isolation. Impossible to get wrong while exclusivity was global —
  // there was only ever one session — and silently corrupting the moment it
  // became per-researcher.
  // -------------------------------------------------------------------------

  it("NEVER derives another researcher's framing session", async () => {
    // Unscoped, this picked the most recent unattached ACTIVE session belonging
    // to ANYONE, and reported derived: true. Yoav's thesis would then carry
    // Dana's reasoning as the record of why it argues what it argues.
    await openThesisFraming("dana's question", DANA);

    const link = await linkThesisToFraming('yoav-thesis', undefined, YOAV);

    expect(link).toEqual({ linked: false, reason: 'NO_ACTIVE_SESSION' });
  });

  it("refuses an explicitly named session that belongs to someone else", async () => {
    // The same corruption through a different door: naming the id directly must
    // not bypass the scoping that protects the derivation.
    const dana = await openThesisFraming("dana's question", DANA);

    const link = await linkThesisToFraming('yoav-thesis', dana.sessionId, YOAV);

    expect(link).toEqual({
      linked: false,
      reason: 'SESSION_NOT_FOUND',
      sessionId: dana.sessionId,
    });
    // Dana's session untouched.
    expect(db.sessions.get(dana.sessionId)?.['thesisId']).toBeFalsy();
  });

  it('an unidentified caller derives nothing, rather than guessing a session', async () => {
    await openThesisFraming('a question', DANA);

    const link = await linkThesisToFraming('thesis-1', undefined, null);

    expect(link).toEqual({ linked: false, reason: 'NO_ACTIVE_SESSION' });
  });

  it('reports NO_ACTIVE_SESSION rather than silently producing an orphan', async () => {
    const link = await linkThesisToFraming('thesis-1', undefined, DANA);

    expect(link).toEqual({ linked: false, reason: 'NO_ACTIVE_SESSION' });
  });

  it('does not derive a session that is already bound to another thesis', async () => {
    // An ACTIVE session with a thesis is THAT thesis's working session, not this
    // one's framing. Deriving it would attribute one thesis's reasoning to another.
    const s = await openThesisFraming('the question');
    await attachThesisToFraming(s.sessionId, 'thesis-1');

    const link = await linkThesisToFraming('thesis-2', undefined, DANA);

    expect(link).toEqual({ linked: false, reason: 'NO_ACTIVE_SESSION' });
    expect(db.sessions.get(s.sessionId)?.['thesisId']).toBe('thesis-1');
  });

  it('honours an explicit session id as an override', async () => {
    const s = await openThesisFraming('the question');

    const link = await linkThesisToFraming('thesis-1', s.sessionId, DANA);

    expect(link).toEqual({ linked: true, sessionId: s.sessionId, derived: false });
  });

  it('refuses an explicit session that already has a thesis', async () => {
    const s = await openThesisFraming('the question');
    await attachThesisToFraming(s.sessionId, 'thesis-1');

    const link = await linkThesisToFraming('thesis-2', s.sessionId, DANA);

    expect(link).toMatchObject({ linked: false, reason: 'SESSION_ALREADY_HAS_THESIS' });
  });

  it('reports an unknown explicit session instead of falling back to derivation', async () => {
    // Falling back would silently attach a DIFFERENT session than the caller
    // named — provenance quietly reassigned by a typo.
    await openThesisFraming('the question');

    const link = await linkThesisToFraming('thesis-1', 'no-such-session', DANA);

    expect(link).toMatchObject({ linked: false, reason: 'SESSION_NOT_FOUND' });
  });
});

describe('repairFramingLink', () => {
  it('attaches a framing session to a thesis that has none', async () => {
    const s = await openThesisFraming('the question');

    const result = await repairFramingLink(s.sessionId, 'thesis-1');

    expect(result).toEqual({ repaired: true, sessionId: s.sessionId, thesisId: 'thesis-1' });
    expect(db.sessions.get(s.sessionId)?.['thesisId']).toBe('thesis-1');
  });

  it('refuses when the session is already bound to a DIFFERENT thesis', async () => {
    // A repair able to overwrite an existing link is not a repair — it is a way
    // to rewrite provenance, which is the one thing this record exists to prevent.
    const s = await openThesisFraming('the question');
    await attachThesisToFraming(s.sessionId, 'thesis-1');

    const result = await repairFramingLink(s.sessionId, 'thesis-2');

    expect(result).toMatchObject({ repaired: false, reason: 'SESSION_ALREADY_HAS_THESIS', boundThesisId: 'thesis-1' });
    expect(db.sessions.get(s.sessionId)?.['thesisId']).toBe('thesis-1');
  });

  it('refuses when the thesis already has a framing session', async () => {
    const first = await openThesisFraming('the question');
    await attachThesisToFraming(first.sessionId, 'thesis-1');
    db.sessions.set('fs-other', { id: 'fs-other', name: 'another', status: 'ACTIVE', thesisId: null });

    const result = await repairFramingLink('fs-other', 'thesis-1');

    expect(result).toMatchObject({ repaired: false, reason: 'THESIS_ALREADY_LINKED' });
  });

  it('reports an unknown session and an unknown thesis distinctly', async () => {
    const s = await openThesisFraming('the question');

    expect(await repairFramingLink('nope', 'thesis-1')).toMatchObject({ reason: 'SESSION_NOT_FOUND' });
    expect(await repairFramingLink(s.sessionId, 'no-such-thesis')).toMatchObject({ reason: 'THESIS_NOT_FOUND' });
  });
});

describe('getThesisFraming', () => {
  it('reports a malformed stored assessment instead of throwing', async () => {
    // This was a bare JSON.parse. A malformed row did not read as malformed —
    // it threw, and took the whole get_thesis_framing tool down with it.
    const s = await openThesisFraming('the question');
    db.events.push({
      sessionId: s.sessionId,
      type: 'FRAMING_ASSESSED',
      description: '{not json',
      createdAt: new Date(++seq),
    });

    const r = await getThesisFraming(s.sessionId);

    expect('error' in r).toBe(false);
    if ('error' in r) throw new Error('unreachable');
    // Null assessment AND a stated reason — "none was made" and "the stored one
    // is broken" are opposite facts and must not share a representation.
    expect(r.latestAssessment).toBeNull();
    expect(r.latestAssessmentMalformed?.reason).toContain('not valid JSON');
  });

  it('reports valid JSON of the wrong shape as malformed too', async () => {
    const s = await openThesisFraming('the question');
    db.events.push({
      sessionId: s.sessionId,
      type: 'FRAMING_ASSESSED',
      description: '{"unexpected":true}',
      createdAt: new Date(++seq),
    });

    const r = await getThesisFraming(s.sessionId);

    if ('error' in r) throw new Error('unreachable');
    expect(r.latestAssessment).toBeNull();
    expect(r.latestAssessmentMalformed?.reason).toContain('does not match the expected shape');
  });

  it('says nothing about malformation when no assessment exists at all', async () => {
    const s = await openThesisFraming('the question');

    const r = await getThesisFraming(s.sessionId);

    if ('error' in r) throw new Error('unreachable');
    expect(r.latestAssessment).toBeNull();
    expect(r.latestAssessmentMalformed).toBeUndefined();
  });

  it('returns the full exchange with the latest assessment', async () => {
    const s = await openThesisFraming('the question');
    mockAssess.mockResolvedValue(assessment({ recommendedTopicString: 'the recommended string' }));
    await assessThesisFraming(s.sessionId, 'framing');

    const r = await getThesisFraming(s.sessionId);

    expect('events' in r && r.events).toHaveLength(3);
    expect('latestAssessment' in r && r.latestAssessment?.recommendedTopicString).toBe('the recommended string');
  });
});
