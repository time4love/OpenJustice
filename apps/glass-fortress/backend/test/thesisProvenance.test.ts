// ---------------------------------------------------------------------------
// How this thesis came to say what it says.
//
// Two assertions carry the design, and both are about NOT collapsing distinct
// facts into one:
//
//   A malformed stored assessment is reported AS malformed. "No contradictions
//   were found" and "the record is broken" are opposite facts, and rendering
//   the second as the first is the recurring defect in this codebase.
//
//   A framing session that produced no thesis appears NOWHERE. An abandoned
//   framing is not a thesis's provenance, and showing it beside a real one
//   would attribute reasoning to a thesis that never used it.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    thesis: { findUnique: jest.fn() },
    researchSession: { findMany: jest.fn() },
  },
}));

import { prisma } from '../src/lib/prisma';
import { getThesisProvenance, type ThesisProvenance } from '../src/services/thesisProvenance';

const findThesis = prisma.thesis.findUnique as jest.Mock;
const findSessions = prisma.researchSession.findMany as jest.Mock;

const THESIS = 'thesis-1';

function framingAssessment(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    candidateFramings: [
      {
        framing: 'המשרד עדכן מצגי בטיחות',
        scope: 'NARROW',
        backedByFileHashes: ['0xaaa'],
        strength: 'קרבה בזמן',
        weakness: 'הסבר תמים',
      },
    ],
    contradictions: [
      { researcherClaim: 'הטענה הוסרה', whatEvidenceShows: 'הראיה מראה היעדרות', fileHash: '0xaaa' },
    ],
    unverifiedAssumptions: [{ assumption: 'הנחה', howToVerify: 'בדיקה' }],
    recommendedTopicString: 'מסגור מומלץ',
    assessment: 'נימוק',
    ...over,
  });
}

function publicationAssessment(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    rationaleHasSubstance: true,
    substanceGaps: [],
    verdict: 'SUPPORTS',
    objection: '',
    officialCapacityOk: true,
    characterClaims: [],
    gapActionability: [],
    assessment: 'נימוק',
    ...over,
  });
}

interface EventSeed {
  id?: string;
  type: string;
  description: string;
  refId?: string | null;
  createdAt?: Date;
}

function session(over: {
  id?: string;
  researcherId?: string | null;
  researcher?: { handle: string } | null;
  status?: string;
  events: EventSeed[];
}): Record<string, unknown> {
  return {
    id: over.id ?? 'session-1',
    name: 'Framing: whether the ministry revised its safety claims',
    question: 'Did the ministry revise its safety claims?',
    status: over.status ?? 'ACTIVE',
    createdAt: new Date('2026-08-20T10:00:00Z'),
    closedAt: null,
    researcherId: over.researcherId === undefined ? 'researcher-1' : over.researcherId,
    researcher: over.researcher === undefined ? { handle: 'ada' } : over.researcher,
    events: over.events.map((e, i) => ({
      id: e.id ?? `event-${String(i)}`,
      type: e.type,
      description: e.description,
      refId: e.refId ?? null,
      createdAt: e.createdAt ?? new Date(`2026-08-20T10:0${String(i)}:00Z`),
    })),
  };
}

function ok(result: Awaited<ReturnType<typeof getThesisProvenance>>): ThesisProvenance {
  if ('error' in result) throw new Error(`expected provenance, got ${result.error}`);
  return result;
}

beforeEach(() => {
  findThesis.mockResolvedValue({ id: THESIS });
  findSessions.mockResolvedValue([]);
});

describe('scope', () => {
  it('refuses a thesis that does not exist', async () => {
    findThesis.mockResolvedValue(null);

    expect(await getThesisProvenance(THESIS)).toEqual({ error: 'THESIS_NOT_FOUND', thesisId: THESIS });
  });

  it('queries only sessions attached to this thesis', async () => {
    // A framing session that produced no thesis keeps thesisId: null and must
    // appear nowhere — it is not this thesis's provenance, or anyone's.
    await getThesisProvenance(THESIS);

    expect(findSessions).toHaveBeenCalledWith(
      expect.objectContaining({ where: { thesisId: THESIS } }),
    );
  });

  it('reports a thesis with no session as empty, which is a state and not a blank', async () => {
    const result = ok(await getThesisProvenance(THESIS));

    expect(result.empty).toBe(true);
    expect(result.sessions).toEqual([]);
    expect(result.counts).toEqual({ sessions: 0, events: 0, malformedAssessments: 0 });
  });
});

describe('assessments are parsed server-side', () => {
  it('returns structured contradictions, not a JSON string', async () => {
    findSessions.mockResolvedValue([
      session({ events: [{ type: 'FRAMING_ASSESSED', description: framingAssessment() }] }),
    ]);

    const result = ok(await getThesisProvenance(THESIS));
    const event = result.sessions[0].events[0];

    expect(event.framingAssessment?.state).toBe('ok');
    if (event.framingAssessment?.state !== 'ok') throw new Error('unreachable');
    expect(event.framingAssessment.value.contradictions).toEqual([
      { researcherClaim: 'הטענה הוסרה', whatEvidenceShows: 'הראיה מראה היעדרות', fileHash: '0xaaa' },
    ]);
    // The raw JSON is NOT handed back beside the parsed form — offering both
    // invites a client to parse the string, which is what breaks on a schema change.
    expect(event.description).toBeNull();
  });

  it('reports a malformed assessment AS malformed, never as absent or empty', async () => {
    findSessions.mockResolvedValue([
      session({ events: [{ type: 'FRAMING_ASSESSED', description: '{not json' }] }),
    ]);

    const result = ok(await getThesisProvenance(THESIS));
    const parsed = result.sessions[0].events[0].framingAssessment;

    expect(parsed?.state).toBe('malformed');
    if (parsed?.state !== 'malformed') throw new Error('unreachable');
    expect(parsed.reason).toContain('not valid JSON');
    expect(parsed.raw).toBe('{not json');
    expect(result.counts.malformedAssessments).toBe(1);
  });

  it('treats valid JSON of the wrong shape as malformed, not as an assessment with no findings', async () => {
    // The dangerous case: {} parses fine and would render as an assessment that
    // found no contradictions — indistinguishable from a real one that found none.
    findSessions.mockResolvedValue([
      session({ events: [{ type: 'FRAMING_ASSESSED', description: '{"unexpected":true}' }] }),
    ]);

    const result = ok(await getThesisProvenance(THESIS));
    const parsed = result.sessions[0].events[0].framingAssessment;

    expect(parsed?.state).toBe('malformed');
    if (parsed?.state !== 'malformed') throw new Error('unreachable');
    expect(parsed.reason).toContain('does not match the expected shape');
  });

  it('distinguishes an empty stored assessment from a broken one', async () => {
    findSessions.mockResolvedValue([
      session({ events: [{ type: 'FRAMING_ASSESSED', description: '   ' }] }),
    ]);

    const result = ok(await getThesisProvenance(THESIS));

    expect(result.sessions[0].events[0].framingAssessment?.state).toBe('absent');
    expect(result.counts.malformedAssessments).toBe(0);
  });

  it('parses a publication assessment too', async () => {
    findSessions.mockResolvedValue([
      session({ events: [{ type: 'PUBLICATION_ASSESSED', description: publicationAssessment() }] }),
    ]);

    const result = ok(await getThesisProvenance(THESIS));
    const parsed = result.sessions[0].events[0].publicationAssessment;

    expect(parsed?.state).toBe('ok');
    if (parsed?.state !== 'ok') throw new Error('unreachable');
    expect(parsed.value.verdict).toBe('SUPPORTS');
  });
});

describe('recorded dissent', () => {
  it('surfaces a DISPUTES objection at the top level, where a published badge cannot hide it', async () => {
    findSessions.mockResolvedValue([
      session({
        events: [
          {
            id: 'assessed-1',
            type: 'PUBLICATION_ASSESSED',
            description: publicationAssessment({
              verdict: 'DISPUTES',
              objection: 'הראיות אינן תומכות בטענה המרכזית',
            }),
          },
          { type: 'THESIS_PUBLISHED', description: 'published', refId: 'version-1' },
        ],
      }),
    ]);

    const result = ok(await getThesisProvenance(THESIS));

    expect(result.recordedDissent).toEqual([
      {
        sessionId: 'session-1',
        eventId: 'assessed-1',
        createdAt: '2026-08-20T10:00:00.000Z',
        objection: 'הראיות אינן תומכות בטענה המרכזית',
      },
    ]);
  });

  it('records no dissent when the assessor supported publication', async () => {
    findSessions.mockResolvedValue([
      session({ events: [{ type: 'PUBLICATION_ASSESSED', description: publicationAssessment() }] }),
    ]);

    expect(ok(await getThesisProvenance(THESIS)).recordedDissent).toEqual([]);
  });

  it('does not claim dissent it could not read — a malformed assessment is not a SUPPORTS', async () => {
    findSessions.mockResolvedValue([
      session({ events: [{ type: 'PUBLICATION_ASSESSED', description: 'garbage' }] }),
    ]);

    const result = ok(await getThesisProvenance(THESIS));

    expect(result.recordedDissent).toEqual([]);
    expect(result.counts.malformedAssessments).toBe(1);
  });
});

describe('actors', () => {
  it('renders a session with no researcher as unknown, never as a blank name', async () => {
    findSessions.mockResolvedValue([
      session({
        researcherId: null,
        researcher: null,
        events: [{ type: 'SESSION_STARTED', description: 'opened' }],
      }),
    ]);

    const result = ok(await getThesisProvenance(THESIS));

    expect(result.sessions[0].researcherId).toBeNull();
    expect(result.sessions[0].researcherHandle).toBeNull();
  });

  it('names the researcher when the record has one', async () => {
    findSessions.mockResolvedValue([
      session({ events: [{ type: 'SESSION_STARTED', description: 'opened' }] }),
    ]);

    expect(ok(await getThesisProvenance(THESIS)).sessions[0].researcherHandle).toBe('ada');
  });
});

describe('the timeline', () => {
  it('keeps plain events as text and counts everything', async () => {
    findSessions.mockResolvedValue([
      session({
        events: [
          { type: 'SESSION_STARTED', description: 'opened' },
          { type: 'FRAMING_PROPOSED', description: 'המסגור שאני מציע' },
          { type: 'FRAMING_ASSESSED', description: framingAssessment() },
          { type: 'THESIS_ATTACHED', description: 'The framing produced a thesis.', refId: THESIS },
          { type: 'AI_ANALYSIS_RUN', description: 'analysis complete' },
        ],
      }),
    ]);

    const result = ok(await getThesisProvenance(THESIS));

    expect(result.empty).toBe(false);
    expect(result.counts).toEqual({ sessions: 1, events: 5, malformedAssessments: 0 });
    expect(result.sessions[0].events.map((e) => e.type)).toEqual([
      'SESSION_STARTED',
      'FRAMING_PROPOSED',
      'FRAMING_ASSESSED',
      'THESIS_ATTACHED',
      'AI_ANALYSIS_RUN',
    ]);
    expect(result.sessions[0].events[1].description).toBe('המסגור שאני מציע');
    expect(result.sessions[0].events[3].refId).toBe(THESIS);
  });

  it('asks the database for events in chronological order', async () => {
    await getThesisProvenance(THESIS);

    const args = findSessions.mock.calls[0][0] as {
      select: { events: { orderBy: { createdAt: string } } };
      orderBy: { createdAt: string };
    };
    expect(args.select.events.orderBy).toEqual({ createdAt: 'asc' });
    expect(args.orderBy).toEqual({ createdAt: 'asc' });
  });
});
