// ---------------------------------------------------------------------------
// Thesis framing — deciding what to argue, before writing it.
//
// The topic string fed to suggest_thesis determines which evidence is pulled
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
jest.mock('../src/services/ThesisFramingAssessorAgent', () => ({
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
};
let seq = 0;

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    researchSession: {
      // The one-active rule: openThesisFraming now refuses while any session is
      // ACTIVE. Each test here opens at most one, after a cleared db.
      findFirst: jest.fn(async ({ where }: { where: { status?: string } }) => {
        const s = [...db.sessions.values()].find((x) => !where.status || x['status'] === where.status);
        return s ? { createdAt: new Date(), ...s, researcher: null, _count: { events: 0 } } : null;
      }),
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
    $transaction: jest.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
  },
}));

import {
  openThesisFraming as openThesisFramingRaw,
  assessThesisFraming,
  attachThesisToFraming,
  getThesisFraming,
} from '../src/services/thesisFraming';

/** Open a framing session, asserting it was not refused. */
async function openThesisFraming(question: string) {
  const state = await openThesisFramingRaw(question);
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
    const second = await openThesisFramingRaw('second question');

    expect('error' in second).toBe(true);
    if (!('error' in second)) return;
    expect(second.error).toBe('SESSION_ACTIVE_SAME_RESEARCHER');
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

describe('getThesisFraming', () => {
  it('returns the full exchange with the latest assessment', async () => {
    const s = await openThesisFraming('the question');
    mockAssess.mockResolvedValue(assessment({ recommendedTopicString: 'the recommended string' }));
    await assessThesisFraming(s.sessionId, 'framing');

    const r = await getThesisFraming(s.sessionId);

    expect('events' in r && r.events).toHaveLength(3);
    expect('latestAssessment' in r && r.latestAssessment?.recommendedTopicString).toBe('the recommended string');
  });
});
