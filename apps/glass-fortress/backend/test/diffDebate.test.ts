// ---------------------------------------------------------------------------
// The diff debate — arguing a passed-over change into evidence.
//
// Two standards apply and the split is the whole design:
//
//   SUBSTANCE is a HARD gate. No promotion without a reviewable argument. This
//   judges only whether the researcher argued, never whether they are right, so
//   a demonstrably fallible classifier is never the final authority on
//   significance.
//
//   MERIT is ADVISORY. The assessor may disagree, the researcher may proceed,
//   and the dissent is recorded on the evidence forever. An override that is
//   permitted but permanently visible deters better than a refusal — and unlike
//   a refusal it cannot be defeated by rephrasing until the model yields.
// ---------------------------------------------------------------------------

const mockAssess = jest.fn();
jest.mock('../src/services/ForensicPromotionAssessorAgent', () => ({
  ForensicPromotionAssessorAgent: jest.fn().mockImplementation(() => ({
    assess: (...a: unknown[]) => mockAssess(...a),
  })),
}));

const mockPromoteForensicDiff = jest.fn();
jest.mock('../src/services/promoteForensicDiff', () => ({
  promoteForensicDiff: (...a: unknown[]) => mockPromoteForensicDiff(...a),
}));

const db = {
  diff: null as Record<string, unknown> | null,
  evidence: null as Record<string, unknown> | null,
  sessions: new Map<string, Record<string, unknown>>(),
  events: [] as Record<string, unknown>[],
};
let seq = 0;

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    urlVersionDiff: { findUnique: jest.fn(async () => db.diff) },
    evidence: { findFirst: jest.fn(async () => db.evidence) },
    diffDebateSession: {
      findFirst: jest.fn(async ({ where }: { where: { status: string } }) =>
        [...db.sessions.values()].find((s) => s['status'] === where.status) ?? null,
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const s = db.sessions.get(where.id);
        if (!s) return null;
        return { ...s, events: db.events.filter((e) => e['sessionId'] === where.id), urlVersionDiff: db.diff };
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
        const s = db.sessions.get(where.id);
        if (!s) throw new Error('not found');
        return { ...s, events: db.events.filter((e) => e['sessionId'] === where.id) };
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `sess-${++seq}`;
        const s: Record<string, unknown> = {
          id,
          status: 'OPEN',
          hasSubstance: false,
          verdict: null,
          promotedOverObjection: false,
          evidenceId: null,
          ...data,
        };
        // The real create() nests events; the fake stores them separately.
        delete s['events'];
        db.sessions.set(id, s);
        db.events.push({ sessionId: id, type: 'DEBATE_OPENED', content: 'opened', refId: null, createdAt: new Date(++seq) });
        return s;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const s = db.sessions.get(where.id);
        Object.assign(s as object, data);
        return s;
      }),
    },
    diffDebateEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const e = { refId: null, ...data, createdAt: new Date(++seq) };
        db.events.push(e);
        return e;
      }),
    },
    $transaction: jest.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
  },
}));

import {
  openDiffDebate,
  respondInDiffDebate,
  promoteFromDiffDebate,
} from '../src/services/diffDebate';

const DIFF_ID = 'diff-1';

function assessment(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    hasSubstance: true,
    substanceGaps: [],
    verdict: 'SUPPORTS',
    objection: '',
    assessment: 'נימוק',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.diff = {
    id: DIFF_ID,
    beforeDate: '2022-01-01',
    afterDate: '2022-01-05',
    aiSignificance: 'שינוי תפעולי',
    investigativeCategories: [],
    deletedText: '[{"summary":"הוסרה אזהרה"}]',
    addedText: '[]',
    trackedUrl: { url: 'https://health.gov.il/x' },
  };
  db.evidence = null;
  db.sessions.clear();
  db.events.length = 0;
  seq = 0;
});

describe('substance gate (hard)', () => {
  it('blocks promotion when the argument is bare assertion', async () => {
    mockAssess.mockResolvedValue(
      assessment({ hasSubstance: false, substanceGaps: ['לא צוין איזה תוכן השתנה'], verdict: 'DISPUTES' }),
    );

    const state = await openDiffDebate(DIFF_ID, 'זה חשוב');

    expect('canPromote' in state && state.canPromote).toBe(false);
    expect('blockedBy' in state && state.blockedBy).toContain('substance');
  });

  it('refuses to promote while substance is unmet, without touching the chain', async () => {
    mockAssess.mockResolvedValue(assessment({ hasSubstance: false, substanceGaps: ['חסר'] }));
    const opened = await openDiffDebate(DIFF_ID, 'כי אני אומר');

    const result = await promoteFromDiffDebate((opened as { sessionId: string }).sessionId);

    expect(result).toMatchObject({ promoted: false });
    expect(mockPromoteForensicDiff).not.toHaveBeenCalled();
  });

  it('lets a revised argument clear the gate', async () => {
    mockAssess.mockResolvedValueOnce(assessment({ hasSubstance: false, substanceGaps: ['חסר'] }));
    const opened = await openDiffDebate(DIFF_ID, 'זה חשוב');
    const sessionId = (opened as { sessionId: string }).sessionId;

    mockAssess.mockResolvedValueOnce(assessment());
    const after = await respondInDiffDebate(sessionId, 'הוסרה האזהרה על תופעות לוואי, הפוגעת בהסכמה מדעת');

    expect('canPromote' in after && after.canPromote).toBe(true);
  });
});

describe('merit (advisory)', () => {
  it('requires answering an objection before promoting', async () => {
    mockAssess.mockResolvedValue(assessment({ verdict: 'DISPUTES', objection: 'השינוי תפעולי' }));
    const opened = await openDiffDebate(DIFF_ID, 'טיעון מפורט עם ציטוטים');

    expect('canPromote' in opened && opened.canPromote).toBe(false);
    expect('blockedBy' in opened && opened.blockedBy).toContain('objection');
  });

  it('allows promotion over a sustained objection, and records the dissent', async () => {
    // The assessor never yields. The researcher proceeds anyway — permitted,
    // but permanently visible.
    mockAssess.mockResolvedValue(assessment({ verdict: 'DISPUTES', objection: 'השינוי תפעולי' }));
    const opened = await openDiffDebate(DIFF_ID, 'טיעון מפורט');
    const sessionId = (opened as { sessionId: string }).sessionId;
    await respondInDiffDebate(sessionId, 'אני חולק, שכן האזהרה הוסרה במלואה');

    mockPromoteForensicDiff.mockResolvedValue({
      outcome: 'promoted', evidenceId: 'ev-1', fileHash: '0xabc', txHash: '0xtx', confirmed: true,
    });
    const result = await promoteFromDiffDebate(sessionId);

    expect(result).toMatchObject({ promoted: true, promotedOverObjection: true });
    expect(db.sessions.get(sessionId)?.['promotedOverObjection']).toBe(true);
    expect(db.sessions.get(sessionId)?.['status']).toBe('PROMOTED');
  });

  it('does not flag dissent when the assessor agreed', async () => {
    mockAssess.mockResolvedValue(assessment());
    const opened = await openDiffDebate(DIFF_ID, 'טיעון מפורט');
    mockPromoteForensicDiff.mockResolvedValue({
      outcome: 'promoted', evidenceId: 'ev-2', fileHash: '0xdef', txHash: '0xtx', confirmed: true,
    });

    const result = await promoteFromDiffDebate((opened as { sessionId: string }).sessionId);

    expect(result).toMatchObject({ promoted: true, promotedOverObjection: false });
  });
});

describe('the session as a record', () => {
  it('logs every turn, so the debate itself is the justification', async () => {
    mockAssess.mockResolvedValue(assessment({ verdict: 'DISPUTES', objection: 'תפעולי' }));
    const opened = await openDiffDebate(DIFF_ID, 'טיעון ראשון');
    const sessionId = (opened as { sessionId: string }).sessionId;
    await respondInDiffDebate(sessionId, 'מענה');

    const types = db.events.filter((e) => e['sessionId'] === sessionId).map((e) => e['type']);
    expect(types).toEqual([
      'DEBATE_OPENED',
      'RATIONALE_SUBMITTED',
      'ASSESSMENT_RETURNED',
      'RESPONSE_SUBMITTED',
      'ASSESSMENT_RETURNED',
    ]);
  });

  it('refuses to debate a diff that is already evidence', async () => {
    db.evidence = { id: 'ev-9', fileHash: '0x999' };

    const result = await openDiffDebate(DIFF_ID, 'טיעון');

    expect(result).toMatchObject({ error: 'ALREADY_EVIDENCE', evidenceId: 'ev-9' });
    expect(mockAssess).not.toHaveBeenCalled();
  });

  it('reports a missing diff rather than opening an empty debate', async () => {
    db.diff = null;

    expect(await openDiffDebate('nope', 'טיעון')).toMatchObject({ error: 'DIFF_NOT_FOUND' });
  });
});
