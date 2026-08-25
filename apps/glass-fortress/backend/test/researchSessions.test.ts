// ---------------------------------------------------------------------------
// One ACTIVE session PER RESEARCHER, and one PER THESIS.
//
// It used to be one across the whole platform, which made a second researcher
// unusable: their first session would offer to close somebody else's work.
//
// The database enforces both rules with partial unique indexes that Prisma
// cannot express (see the ResearchSession model). These tests exercise the
// service's refusals — the messages a researcher actually reads — plus the
// P2002 path, which is what happens when the indexes win a race the checks lost.
//
// The mock honours researcherId / thesisId / NOT in `where`, because the whole
// change is about scoping and a mock that ignored scope would pass either way.
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
/** Set to make the next create() reject the way a partial unique index does. */
let nextCreateViolatesUnique = false;

interface Where {
  status?: string;
  researcherId?: string | null;
  thesisId?: string | null;
  id?: string;
  NOT?: { researcherId?: string };
}

function matches(s: Record<string, unknown>, where: Where): boolean {
  if (where.status !== undefined && s['status'] !== where.status) return false;
  if (where.id !== undefined && s['id'] !== where.id) return false;
  if (where.researcherId !== undefined && s['researcherId'] !== where.researcherId) return false;
  if (where.thesisId !== undefined && s['thesisId'] !== where.thesisId) return false;
  if (where.NOT?.researcherId !== undefined && s['researcherId'] === where.NOT.researcherId) return false;
  return true;
}

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    researchSession: {
      findFirst: jest.fn(async ({ where }: { where: Where }) => {
        const hit = [...db.sessions.values()]
          .filter((s) => matches(s, where))
          .sort((a, b) => (b['createdAt'] as Date).getTime() - (a['createdAt'] as Date).getTime())[0];
        if (!hit) return null;
        const owner = hit['researcherId'] ? db.researchers.get(hit['researcherId'] as string) : null;
        return {
          ...hit,
          researcher: owner ? { handle: owner.handle } : null,
          _count: { events: db.events.filter((e) => e['sessionId'] === hit['id']).length },
        };
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (nextCreateViolatesUnique) {
          nextCreateViolatesUnique = false;
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
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
  nextCreateViolatesUnique = false;
});

function eventsOn(sessionId: string) {
  return db.events.filter((e) => e['sessionId'] === sessionId);
}

function seed(over: Partial<Record<string, unknown>> = {}) {
  const id = `pre-${String(++seq)}`;
  db.sessions.set(id, {
    id,
    name: 'pre-existing',
    status: 'ACTIVE',
    thesisId: null,
    question: null,
    researcherId: 'r-dana',
    createdAt: new Date(seq * 60000),
    closedAt: null,
    ...over,
  });
  return id;
}

describe('openExclusiveSession', () => {
  it('opens normally when nothing is active, stamping the owner', async () => {
    const r = await openExclusiveSession('r-dana', { thesisId: 't1', question: null, name: 'first' });

    expect(r.opened).toBe(true);
    if (!r.opened) throw new Error('unreachable');
    expect(db.sessions.get(r.session.id)?.['researcherId']).toBe('r-dana');
  });

  it('refuses without a researcher — a session must have an owner', async () => {
    // Both locks are keyed on an owner, so an ownerless session would hold
    // neither and could never be closed by anybody in particular.
    const r = await openExclusiveSession(null, { thesisId: 't1', question: null, name: 'x' });

    expect(r.opened).toBe(false);
    if (r.opened) throw new Error('unreachable');
    expect(r.error).toBe('RESEARCHER_REQUIRED');
    expect(db.sessions.size).toBe(0);
  });

  it("refuses while the caller's OWN session is active, and names it", async () => {
    seed({ researcherId: 'r-dana', name: 'dana-1' });

    const r = await openExclusiveSession('r-dana', { thesisId: 't1', question: null, name: 'dana-2' });

    expect(r.opened).toBe(false);
    if (r.opened || !('activeSession' in r)) throw new Error('unreachable');
    expect(r.error).toBe('SESSION_ACTIVE_SAME_RESEARCHER');
    expect(r.activeSession.name).toBe('dana-1');
    expect(r.activeSession.ownedByCaller).toBe(true);
  });

  // -------------------------------------------------------------------------
  // The point of the change.
  // -------------------------------------------------------------------------

  it('TWO RESEARCHERS hold sessions at once on different theses', async () => {
    const dana = seed({ researcherId: 'r-dana', thesisId: 't1', name: 'dana on t1' });

    const r = await openExclusiveSession('r-yoav', { thesisId: 't2', question: null, name: 'yoav on t2' });

    expect(r.opened).toBe(true);
    if (!r.opened) throw new Error('unreachable');
    // Nobody's work was closed to make room — the whole point of the change.
    expect(r.closed).toBeNull();
    expect(db.sessions.get(dana)?.['status']).toBe('ACTIVE');
    expect(db.sessions.get(r.session.id)?.['status']).toBe('ACTIVE');
  });

  it('refuses when ANOTHER researcher holds this thesis, and cannot be consented past', async () => {
    seed({ researcherId: 'r-dana', thesisId: 't1', name: 'dana on t1' });

    const r = await openExclusiveSession(
      'r-yoav',
      { thesisId: 't1', question: null, name: 'yoav wants t1' },
      // Consent to close one's own session must not reach another researcher's.
      { closeActiveSession: true },
    );

    expect(r.opened).toBe(false);
    if (r.opened || !('activeSession' in r)) throw new Error('unreachable');
    expect(r.error).toBe('THESIS_ACTIVE_OTHER_RESEARCHER');
    expect(r.activeSession.ownerHandle).toBe('dana');
    expect(r.activeSession.ownedByCaller).toBe(false);
    // Dana's session untouched.
    expect(eventsOn(r.activeSession.id).filter((e) => e['type'] === 'SESSION_CLOSED')).toHaveLength(0);
  });

  it("checks the thesis lock BEFORE closing the caller's own session", async () => {
    // Otherwise a researcher consents to close their own work, then gets refused
    // anyway — losing a session for nothing.
    seed({ researcherId: 'r-dana', thesisId: 't1', name: 'dana on t1' });
    const mine = seed({ researcherId: 'r-yoav', thesisId: 't9', name: 'yoav elsewhere' });

    const r = await openExclusiveSession(
      'r-yoav',
      { thesisId: 't1', question: null, name: 'yoav wants t1' },
      { closeActiveSession: true },
    );

    expect(r.opened).toBe(false);
    expect(db.sessions.get(mine)?.['status']).toBe('ACTIVE');
  });

  it('several framing sessions may be open at once — a null thesis contends with nothing', async () => {
    seed({ researcherId: 'r-dana', thesisId: null, question: 'why?', name: 'dana framing' });

    const r = await openExclusiveSession('r-yoav', { thesisId: null, question: 'how?', name: 'yoav framing' });

    expect(r.opened).toBe(true);
  });

  it('a legacy unowned session belongs to NOBODY and blocks no one', async () => {
    // Under the old global lock a null owner was treated as the caller's own.
    // Per-researcher, that reading would make one legacy row block every
    // researcher simultaneously.
    seed({ researcherId: null, thesisId: 't1', name: 'legacy' });

    const r = await openExclusiveSession('r-dana', { thesisId: 't2', question: null, name: 'dana' });

    expect(r.opened).toBe(true);
  });

  it("closes the caller's own session with consent, recording SESSION_CLOSED on it", async () => {
    const mine = seed({ researcherId: 'r-dana', thesisId: 't1', name: 'old' });

    const r = await openExclusiveSession(
      'r-dana',
      { thesisId: 't2', question: null, name: 'new' },
      { closeActiveSession: true },
    );

    expect(r.opened).toBe(true);
    expect(db.sessions.get(mine)?.['status']).toBe('CLOSED');
    expect(eventsOn(mine).map((e) => e['type'])).toContain('SESSION_CLOSED');
  });

  it('translates a unique-constraint race into a named refusal, never a throw', async () => {
    // The checks lost a race and the partial index won it. That is the index
    // doing its job, and the caller must get a sentence rather than a 500.
    nextCreateViolatesUnique = true;

    const r = await openExclusiveSession('r-dana', { thesisId: 't1', question: null, name: 'x' });

    expect(r.opened).toBe(false);
    if (r.opened) throw new Error('unreachable');
    expect(r.error).toBe('THESIS_ACTIVE_OTHER_RESEARCHER');
    expect(r.howToProceed).toMatch(/Nothing was created/);
  });

  it('rethrows anything that is not a unique violation', async () => {
    // Swallowing every error here would hide a real database failure behind a
    // polite message about concurrency.
    const { prisma } = jest.requireMock<{ prisma: { researchSession: { create: jest.Mock } } }>(
      '../src/lib/prisma',
    );
    prisma.researchSession.create.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      openExclusiveSession('r-dana', { thesisId: 't1', question: null, name: 'x' }),
    ).rejects.toThrow('connection lost');
  });
});

describe('requireActiveSessionFor', () => {
  it('refuses when the caller has nothing active', async () => {
    const r = await requireActiveSessionFor('r-dana', 't1');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('NO_ACTIVE_SESSION');
  });

  it('refuses an unidentified caller — they never had a session to find', async () => {
    const r = await requireActiveSessionFor(null, 't1');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('NO_ACTIVE_SESSION');
  });

  it("is not confused by another researcher's newer session", async () => {
    // The old lookup fetched THE active session globally and then asked whether
    // it was yours — so a colleague starting work more recently would refuse
    // your own legitimate act.
    seed({ researcherId: 'r-dana', thesisId: 't1', name: 'mine' });
    seed({ researcherId: 'r-yoav', thesisId: 't2', name: 'theirs, newer' });

    const r = await requireActiveSessionFor('r-dana', 't1');

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.name).toBe('mine');
  });

  it('refuses when the caller\'s session is on a different thesis', async () => {
    seed({ researcherId: 'r-dana', thesisId: 't-other', name: 'elsewhere' });

    const r = await requireActiveSessionFor('r-dana', 't1');

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('ACTIVE_SESSION_ON_OTHER_THESIS');
  });

  it('refuses an unattached framing session for a thesis act', async () => {
    seed({ researcherId: 'r-dana', thesisId: null, question: 'why?', name: 'framing' });

    const r = await requireActiveSessionFor('r-dana', 't1');

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('ACTIVE_SESSION_ON_OTHER_THESIS');
  });

  it("returns the caller's own active session on this thesis", async () => {
    const id = seed({ researcherId: 'r-dana', thesisId: 't1', name: 'right one' });

    const r = await requireActiveSessionFor('r-dana', 't1');

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.sessionId).toBe(id);
  });
});
