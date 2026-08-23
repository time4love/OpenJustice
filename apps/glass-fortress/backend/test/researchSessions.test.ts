// ---------------------------------------------------------------------------
// One ACTIVE research session at a time, with an owner.
//
// The live defect this fixes: the old one-active rule was scoped by thesisId,
// so framing sessions (thesisId null) never counted — staging had two ACTIVE
// at once. What matters here: opening refuses while another is active and
// names the owner; closing another researcher's session needs distinct consent
// AND a reason, and writes the closure onto THEIR session.
// ---------------------------------------------------------------------------

const db = {
  sessions: new Map<string, Record<string, unknown>>(),
  events: [] as Record<string, unknown>[],
  researchers: new Map<string, { id: string; handle: string }>([
    ['r-dana', { id: 'r-dana', handle: 'dana' }],
    ['r-yoav', { id: 'r-yoav', handle: 'yoav' }],
  ]),
};
let seq = 0;

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    researchSession: {
      findFirst: jest.fn(async ({ where }: { where: { status?: string } }) => {
        const active = [...db.sessions.values()]
          .filter((s) => (where.status ? s['status'] === where.status : true))
          .sort((a, b) => (b['createdAt'] as Date).getTime() - (a['createdAt'] as Date).getTime());
        const s = active[0];
        if (!s) return null;
        const owner = s['researcherId'] ? db.researchers.get(s['researcherId'] as string) : null;
        return {
          ...s,
          researcher: owner ? { handle: owner.handle } : null,
          _count: { events: db.events.filter((e) => e['sessionId'] === s['id']).length },
        };
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `s-${String(++seq)}`;
        const { events, ...rest } = data as { events?: { create: Record<string, unknown> } } & Record<string, unknown>;
        const s = { id, createdAt: new Date(seq * 60000), closedAt: null, ...rest };
        db.sessions.set(id, s);
        if (events) db.events.push({ sessionId: id, ...events.create, createdAt: new Date(++seq) });
        return s;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        Object.assign(db.sessions.get(where.id) as object, data);
        return db.sessions.get(where.id);
      }),
    },
    researchSessionEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const e = { ...data, createdAt: new Date(++seq) };
        db.events.push(e);
        return e;
      }),
    },
    researcher: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => db.researchers.get(where.id) ?? null),
    },
    $transaction: jest.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
  },
}));

import { openExclusiveSession, requireActiveSessionFor } from '../src/services/researchSessions';

beforeEach(() => {
  db.sessions.clear();
  db.events.length = 0;
  seq = 0;
});

function eventsOn(sessionId: string) {
  return db.events.filter((e) => e['sessionId'] === sessionId);
}

describe('openExclusiveSession', () => {
  it('opens normally when nothing is active, stamping the owner', async () => {
    const r = await openExclusiveSession('r-dana', { thesisId: 't1', question: null, name: 'first' });

    expect(r.opened).toBe(true);
    if (!r.opened) return;
    expect(db.sessions.get(r.session.id)?.['researcherId']).toBe('r-dana');
    expect(r.closed).toBeNull();
  });

  it('refuses while the caller\'s own session is active, and names it', async () => {
    const first = await openExclusiveSession('r-dana', { thesisId: 't1', question: null, name: 'first' });
    const r = await openExclusiveSession('r-dana', { thesisId: 't2', question: null, name: 'second' });

    expect(r.opened).toBe(false);
    if (r.opened || !first.opened) return;
    expect(r.error).toBe('SESSION_ACTIVE_SAME_RESEARCHER');
    expect(r.activeSession.id).toBe(first.session.id);
    expect(r.activeSession.ownedByCaller).toBe(true);
    expect(db.sessions.get(first.session.id)?.['status']).toBe('ACTIVE');
  });

  it('a framing session (no thesis) counts as the active session — the scope bug', async () => {
    await openExclusiveSession('r-dana', { thesisId: null, question: 'the question', name: 'framing' });
    const r = await openExclusiveSession('r-dana', { thesisId: 't1', question: null, name: 'on thesis' });

    expect(r.opened).toBe(false);
    if (r.opened) return;
    expect(r.activeSession.thesisId).toBeNull();
    expect(r.activeSession.question).toBe('the question');
  });

  it('closes the caller\'s own session with consent and records a plain SESSION_CLOSED on it', async () => {
    const first = await openExclusiveSession('r-dana', { thesisId: 't1', question: null, name: 'first' });
    const r = await openExclusiveSession(
      'r-dana',
      { thesisId: 't2', question: null, name: 'second' },
      { closeActiveSession: true },
    );

    expect(r.opened).toBe(true);
    if (r.opened === false || !first.opened) return;
    expect(r.closed).toEqual({ id: first.session.id, name: 'first', ownerHandle: 'dana', closedByOther: false });
    expect(db.sessions.get(first.session.id)?.['status']).toBe('CLOSED');
    expect(eventsOn(first.session.id).map((e) => e['type'])).toEqual(['SESSION_STARTED', 'SESSION_CLOSED']);
  });

  it('refuses to close another researcher\'s session, naming the owner', async () => {
    await openExclusiveSession('r-dana', { thesisId: 't1', question: null, name: 'dana\'s' });
    const r = await openExclusiveSession(
      'r-yoav',
      { thesisId: 't2', question: null, name: 'yoav\'s' },
      { closeActiveSession: true }, // the SAME-researcher consent does not carry over
    );

    expect(r.opened).toBe(false);
    if (r.opened) return;
    expect(r.error).toBe('SESSION_ACTIVE_OTHER_RESEARCHER');
    expect(r.activeSession.ownerHandle).toBe('dana');
    expect(r.activeSession.ownedByCaller).toBe(false);
    expect(r.howToProceed).toContain('dana');
  });

  it('refuses the distinct consent without a reason', async () => {
    await openExclusiveSession('r-dana', { thesisId: 't1', question: null, name: 'dana\'s' });
    const r = await openExclusiveSession(
      'r-yoav',
      { thesisId: 't2', question: null, name: 'yoav\'s' },
      { closeOtherResearchersSession: true, closeReason: '   ' },
    );

    expect(r.opened).toBe(false);
  });

  it('closes another researcher\'s session with consent + reason, writing who and why ONTO THE CLOSED SESSION', async () => {
    const danas = await openExclusiveSession('r-dana', { thesisId: 't1', question: null, name: 'dana\'s' });
    const r = await openExclusiveSession(
      'r-yoav',
      { thesisId: 't2', question: null, name: 'yoav\'s' },
      { closeOtherResearchersSession: true, closeReason: 'publishing deadline' },
    );

    expect(r.opened).toBe(true);
    if (!r.opened || !danas.opened) return;
    expect(r.closed).toEqual({ id: danas.session.id, name: 'dana\'s', ownerHandle: 'dana', closedByOther: true });

    const trace = eventsOn(danas.session.id).find((e) => e['type'] === 'SESSION_CLOSED_BY_OTHER');
    expect(trace).toBeDefined();
    expect(trace?.['description']).toContain('yoav');
    expect(trace?.['description']).toContain('publishing deadline');
    expect(trace?.['refId']).toBe('r-yoav');
    expect(db.sessions.get(danas.session.id)?.['status']).toBe('CLOSED');
    expect(db.sessions.get(r.session.id)?.['status']).toBe('ACTIVE');
  });

  it('treats a legacy unowned session as the caller\'s own — nobody to protect', async () => {
    const legacy = await openExclusiveSession(null, { thesisId: 't1', question: null, name: 'legacy' });
    const r = await openExclusiveSession('r-yoav', { thesisId: 't2', question: null, name: 'new' }, { closeActiveSession: true });

    expect(r.opened).toBe(true);
    if (!r.opened || !legacy.opened) return;
    expect(r.closed?.closedByOther).toBe(false);
  });
});

describe('requireActiveSessionFor', () => {
  it('refuses when nothing is active', async () => {
    const r = await requireActiveSessionFor('r-dana', 't1');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('NO_ACTIVE_SESSION');
  });

  it('refuses another researcher\'s active session', async () => {
    await openExclusiveSession('r-dana', { thesisId: 't1', question: null, name: 'dana\'s' });
    const r = await requireActiveSessionFor('r-yoav', 't1');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('ACTIVE_SESSION_NOT_YOURS');
    if (r.error !== 'ACTIVE_SESSION_NOT_YOURS') return;
    expect(r.activeSession.ownerHandle).toBe('dana');
  });

  it('refuses a session on a different thesis, or an unattached framing session', async () => {
    await openExclusiveSession('r-dana', { thesisId: null, question: 'q', name: 'framing' });
    const r = await requireActiveSessionFor('r-dana', 't1');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('ACTIVE_SESSION_ON_OTHER_THESIS');
    expect(r.explanation).toContain('framing');
  });

  it('returns the caller\'s own active session on this thesis', async () => {
    const s = await openExclusiveSession('r-dana', { thesisId: 't1', question: null, name: 'mine' });
    const r = await requireActiveSessionFor('r-dana', 't1');
    expect(r.ok).toBe(true);
    if (!r.ok || !s.opened) return;
    expect(r.sessionId).toBe(s.session.id);
  });
});
