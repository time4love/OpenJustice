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
    urlVersionDiff: {
      findUnique: jest.fn(async () => db.diff),
      // buildState re-reads the diff for its Level 5 verdict on every entry
      // point, so the state cannot depend on which caller assembled it.
      findUniqueOrThrow: jest.fn(async () => db.diff),
    },
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
      findMany: jest.fn(
        async ({ where }: { where: { sessionId: string; type: { in: string[] } | string } }) =>
          db.events.filter((e) => {
            if (e['sessionId'] !== where.sessionId) return false;
            const t = e['type'] as string;
            return typeof where.type === 'string' ? where.type === t : where.type.in.includes(t);
          }),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const e = { refId: null, ...data, createdAt: new Date(++seq) };
        db.events.push(e);
        return e;
      }),
    },
    $transaction: jest.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
  },
}));

import { survivalFixture, TEXT_VERSION } from './helpers/survivalFixture';
import { SURVIVAL_CHECK_VERSION, survivalSourceStateHash } from '../src/lib/diffSurvival';
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
    ...survivalFixture(),
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

// ---------------------------------------------------------------------------
// Multi-round regressions.
//
// Every test above submits a SINGLE argument, which is why none of them caught
// this: the first real human debate lost its substance gate on round two. The
// researcher had made specific claims about the deleted text in round one, then
// answered an objection about the INFERENCE — an abstract reply, correctly so,
// since answering an inference does not require re-quoting the text. The
// assessor saw only that reply, read it as a fresh opening argument, and
// returned hasSubstance: false. The gate ratcheted backwards.
// ---------------------------------------------------------------------------
describe('multi-round debate', () => {
  it('gives the assessor the whole debate, not just the latest turn', async () => {
    mockAssess.mockResolvedValue(assessment({ verdict: 'DISPUTES', objection: 'הסבר חלופי' }));
    const opened = await openDiffDebate(DIFF_ID, 'הוסרה טענת היעילות המספרית');
    const sessionId = (opened as { sessionId: string }).sessionId;

    await respondInDiffDebate(sessionId, 'ההסבר החלופי אינו מאיין את ערך הראיה');

    const secondCall = mockAssess.mock.calls[1][0] as { priorTurns: string[] };
    expect(secondCall.priorTurns.length).toBeGreaterThan(0);
    expect(secondCall.priorTurns.join('\n')).toContain('הוסרה טענת היעילות המספרית');
    // The turn under assessment is passed separately, not duplicated into history.
    expect(secondCall.priorTurns.join('\n')).not.toContain('ההסבר החלופי אינו מאיין');
  });

  it('never un-clears a substance gate that was already met', async () => {
    mockAssess.mockResolvedValueOnce(assessment({ verdict: 'DISPUTES', objection: 'הסבר חלופי' }));
    const opened = await openDiffDebate(DIFF_ID, 'טיעון קונקרטי על הטקסט שנמחק');
    const sessionId = (opened as { sessionId: string }).sessionId;
    expect((opened as { hasSubstance: boolean }).hasSubstance).toBe(true);

    // An abstract reply about the inference — the exact shape that regressed.
    mockAssess.mockResolvedValueOnce(
      assessment({ hasSubstance: false, substanceGaps: ['חסר ביסוס'], verdict: 'DISPUTES' }),
    );
    const after = await respondInDiffDebate(sessionId, 'טיעון על ארכיטקטורת ההוכחה');

    expect((after as { hasSubstance: boolean }).hasSubstance).toBe(true);
  });

  it('still lets merit change in either direction across rounds', async () => {
    // Substance latches; the verdict must not, or the assessor could never be
    // persuaded — which is the point of arguing at all.
    mockAssess.mockResolvedValueOnce(assessment({ verdict: 'DISPUTES', objection: 'הסבר חלופי' }));
    const opened = await openDiffDebate(DIFF_ID, 'טיעון קונקרטי');
    const sessionId = (opened as { sessionId: string }).sessionId;

    mockAssess.mockResolvedValueOnce(assessment({ verdict: 'SUPPORTS' }));
    const after = await respondInDiffDebate(sessionId, 'מענה משכנע');

    expect((after as { verdict: string }).verdict).toBe('SUPPORTS');
    expect((after as { canPromote: boolean }).canPromote).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Substance is derived from the record, not latched off a column.
//
// The first fix latched `session.hasSubstance || assessment.hasSubstance`,
// which cannot recover a value already written wrongly — and one had been. A
// live session that cleared substance in round one held `false` after round
// two overwrote it, and no later turn could restore it. The events are the
// record; the column is a cache of them.
// ---------------------------------------------------------------------------
describe('substance derived from the event log', () => {
  it('reads true from the record even when the stored column says false', async () => {
    mockAssess.mockResolvedValueOnce(assessment({ verdict: 'DISPUTES', objection: 'הסבר חלופי' }));
    const opened = await openDiffDebate(DIFF_ID, 'טיעון קונקרטי על הטקסט שנמחק');
    const sessionId = (opened as { sessionId: string }).sessionId;

    // Simulate the corruption the old latch could not undo.
    (db.sessions.get(sessionId) as Record<string, unknown>)['hasSubstance'] = false;

    mockAssess.mockResolvedValueOnce(assessment({ hasSubstance: false, substanceGaps: ['x'], verdict: 'DISPUTES' }));
    const after = await respondInDiffDebate(sessionId, 'טיעון מופשט על ארכיטקטורת ההוכחה');

    expect((after as { hasSubstance: boolean }).hasSubstance).toBe(true);
    expect((after as { canPromote: boolean }).canPromote).toBe(true);
  });

  it('stays false when no assessment has ever found substance', async () => {
    mockAssess.mockResolvedValue(assessment({ hasSubstance: false, substanceGaps: ['חסר'], verdict: 'DISPUTES' }));
    const opened = await openDiffDebate(DIFF_ID, 'זה חשוב');

    expect((opened as { hasSubstance: boolean }).hasSubstance).toBe(false);
    expect((opened as { canPromote: boolean }).canPromote).toBe(false);
  });

  it('ignores an unparseable assessment rather than treating it as substance', async () => {
    mockAssess.mockResolvedValueOnce(assessment({ hasSubstance: false, substanceGaps: ['חסר'], verdict: 'DISPUTES' }));
    const opened = await openDiffDebate(DIFF_ID, 'טיעון');
    const sessionId = (opened as { sessionId: string }).sessionId;
    db.events.push({ sessionId, type: 'ASSESSMENT_RETURNED', content: 'not json', refId: null, createdAt: new Date(++seq) });

    mockAssess.mockResolvedValueOnce(assessment({ hasSubstance: false, substanceGaps: ['חסר'], verdict: 'DISPUTES' }));
    const after = await respondInDiffDebate(sessionId, 'עוד טיעון');

    expect((after as { hasSubstance: boolean }).hasSubstance).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LEVEL 5 — A DEBATE ABOUT A CHANGE THAT DID NOT HAPPEN
// ---------------------------------------------------------------------------
describe('a CONTRADICTED diff cannot be argued into evidence', () => {
  /** The stored verdict as `survivalStateOf` must read it: present and current. */
  function contradicted(): Record<string, unknown> {
    const rawDeletedText = JSON.stringify(['a sentence long enough to clear the presence floor']);
    return survivalFixture({
      rawDeletedText,
      survivalVerdict: 'CONTRADICTED',
      survivalCheckVersion: SURVIVAL_CHECK_VERSION,
      survivalTextVersion: TEXT_VERSION,
      survivalCheckedAt: new Date('2026-08-28'),
      survivalChunksChecked: 1,
      survivalContradicted: [{ side: 'REMOVED', excerpt: 'still on the page' }],
      survivalSourceStateHash: survivalSourceStateHash({
        beforeTextHash: 'a'.repeat(64),
        afterTextHash: 'b'.repeat(64),
        rawDeletedText,
        rawAddedText: '[]',
      }),
    });
  }

  it('blocks promotion no matter how good the argument is', async () => {
    // ASSERTING THE CALLER. The checker and the audit are covered in isolation;
    // this is the assertion that the debate — where promotion is actually decided
    // — reaches them. An assessment that finds substance AND agrees is used on
    // purpose: every other gate is open, so only this one can be doing the work.
    db.diff = { ...db.diff, ...contradicted() };
    mockAssess.mockResolvedValue(assessment({ hasSubstance: true, verdict: 'AGREES' }));

    const state = await openDiffDebate(DIFF_ID, 'הטענה על יעילות הוסרה מן העמוד ביום זה.');

    expect('canPromote' in state && state.canPromote).toBe(false);
    expect('blockedBy' in state && state.blockedBy).toContain('CONTRADICTED');
    expect('survival' in state && state.survival.state).toBe('CONTRADICTED');
  });

  it('says so BEFORE the substance gate, not after the researcher has cleared it', async () => {
    // The other blocks are about whether the ARGUMENT is good enough. This one is
    // about whether there is anything to argue about, and arriving second would
    // make a researcher earn their way to it.
    db.diff = { ...db.diff, ...contradicted() };
    mockAssess.mockResolvedValue(
      assessment({ hasSubstance: false, substanceGaps: ['לא צוין איזה תוכן השתנה'] }),
    );

    const state = await openDiffDebate(DIFF_ID, 'זה חשוב');

    expect('blockedBy' in state && state.blockedBy).toContain('CONTRADICTED');
    expect('blockedBy' in state && state.blockedBy).not.toContain('substance');
  });

  it('does NOT block an unchecked diff — that is a question nobody asked, not a refutation', async () => {
    // UNCHECKED must not be treated as failure any more than as a pass. It
    // travels in the state instead, so the researcher sees it and decides.
    db.diff = { ...db.diff, ...survivalFixture() };
    mockAssess.mockResolvedValue(assessment({ hasSubstance: true, verdict: 'AGREES' }));

    const state = await openDiffDebate(DIFF_ID, 'הטענה על יעילות הוסרה מן העמוד ביום זה.');

    expect('canPromote' in state && state.canPromote).toBe(true);
    expect('survival' in state && state.survival.state).toBe('UNCHECKED');
  });
});
