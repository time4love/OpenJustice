import { prisma } from '../lib/prisma';

// ---------------------------------------------------------------------------
// One ACTIVE research session PER RESEARCHER, and one PER THESIS.
//
// It used to be one across the whole platform. That made a second researcher
// impossible to onboard: opening their first session would offer to close
// somebody else's work, and the two locks a collaborating team actually needs
// were collapsed into one global mutex.
//
// A publication attaches to the session that did it, so its rationale lands in
// the same event log as the framing that chose the question. That requires "the
// active session" to be unambiguous FOR A GIVEN RESEARCHER — not globally.
//
// ENFORCED IN THE DATABASE, by two partial unique indexes that Prisma cannot
// show you (see the ResearchSession model, and
// migrations/20260825190000_session_active_locks). The checks below produce good
// error messages; the indexes are what make the rule true. A check-then-insert
// alone races: two callers can both read "no active session" and both insert.
// That was harmless under a global lock, because there was at most one session
// anyway. Per-thesis locking makes it meaningful, and a provenance system must
// not depend on two people not clicking at the same moment.
//
// A session with NO OWNER belongs to NOBODY.
//
// It used to be treated as the caller's own, which was defensible when the lock
// was global — there was one session and somebody had to be able to close it.
// Under per-researcher locks that reading is actively wrong: an ownerless
// session would match every researcher at once and block all of them. Legacy
// ownerless sessions (2 on staging, both CLOSED) therefore participate in
// nothing. Opening now requires a researcher, so no new one can be ownerless.
//
// Closing someone else's session is no longer part of opening yours: their lock
// does not block you. The consent parameters that existed for it are gone, and
// with them the only path by which one researcher could end another's work.
// ---------------------------------------------------------------------------

export interface OpenSessionConsent {
  /**
   * Consent to close the caller's OWN active session.
   *
   * The only consent left. Closing another researcher's session was possible
   * because their session blocked yours; under per-researcher locks it does not,
   * so the capability had no remaining purpose and was removed rather than left
   * available.
   */
  closeActiveSession?: boolean;
}

export interface ActiveSessionSummary {
  id: string;
  name: string;
  thesisId: string | null;
  question: string | null;
  /** Pseudonymous handle of the owner; null for sessions that predate ownership. */
  ownerHandle: string | null;
  ownedByCaller: boolean;
  ageMinutes: number;
  events: number;
}

export type OpenSessionRefusal =
  | {
      error: 'SESSION_ACTIVE_SAME_RESEARCHER';
      activeSession: ActiveSessionSummary;
      howToProceed: string;
    }
  /** Someone else already holds THIS THESIS. Nothing the caller can consent past. */
  | {
      error: 'THESIS_ACTIVE_OTHER_RESEARCHER';
      activeSession: ActiveSessionSummary;
      howToProceed: string;
    }
  /** Opening requires an identified researcher; a session must have an owner. */
  | { error: 'RESEARCHER_REQUIRED'; howToProceed: string };

export interface ClosedSessionRecord {
  id: string;
  name: string;
  ownerHandle: string | null;
  closedByOther: boolean;
}

interface SessionSeed {
  thesisId: string | null;
  question: string | null;
  name: string;
}

export type OpenSessionResult =
  | { opened: true; session: { id: string; name: string; status: string; createdAt: Date }; closed: ClosedSessionRecord | null }
  | ({ opened: false } & OpenSessionRefusal);

function ageMinutes(since: Date): number {
  return Math.round((Date.now() - since.getTime()) / 60000);
}


/** Prisma's unique-constraint violation, which here means a partial index fired. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err &&
    (err as { code?: unknown }).code === 'P2002';
}

interface SessionRow {
  id: string;
  name: string;
  thesisId: string | null;
  question: string | null;
  researcherId: string | null;
  createdAt: Date;
  researcher: { handle: string } | null;
  _count: { events: number };
}

/**
 * `ownedByCaller` is strict equality — a null owner is owned by NOBODY.
 *
 * It used to read `researcherId === null || researcherId === caller`, which was
 * defensible under a global lock and is actively wrong under per-researcher
 * ones: a single legacy row would match every researcher and block all of them.
 */
function summarise(row: SessionRow, callerId: string): ActiveSessionSummary {
  return {
    id: row.id,
    name: row.name,
    thesisId: row.thesisId,
    question: row.question,
    ownerHandle: row.researcher?.handle ?? null,
    ownedByCaller: row.researcherId === callerId,
    ageMinutes: ageMinutes(row.createdAt),
    events: row._count.events,
  };
}

/**
 * Open a session, holding both locks: one per researcher, one per thesis.
 *
 * The database enforces them (two partial unique indexes; see the
 * ResearchSession model). These checks exist to produce a useful refusal before
 * the write, not to be the guarantee.
 */
export async function openExclusiveSession(
  researcherId: string | null,
  seed: SessionSeed,
  consent: OpenSessionConsent = {},
): Promise<OpenSessionResult> {
  // A session must have an owner: both locks are keyed on one, so an ownerless
  // session would hold neither and could never be closed by anybody in
  // particular.
  if (!researcherId) {
    return {
      opened: false,
      error: 'RESEARCHER_REQUIRED',
      howToProceed:
        'Opening a research session requires an approved researcher account, because the session is the ' +
        'record of who did the work. Sign in and retry.',
    };
  }

  // Two independent locks, queried separately: they refuse for different reasons
  // and only one of them is something the caller may consent past.
  const [mine, onThesis] = await Promise.all([
    prisma.researchSession.findFirst({
      where: { status: 'ACTIVE', researcherId },
      include: { researcher: { select: { handle: true } }, _count: { select: { events: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    seed.thesisId
      ? prisma.researchSession.findFirst({
          where: { status: 'ACTIVE', thesisId: seed.thesisId, NOT: { researcherId } },
          include: { researcher: { select: { handle: true } }, _count: { select: { events: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : // A framing session has no thesis to contend for. NULL thesisId is
        // DISTINCT under the partial index, so several may be open at once.
        Promise.resolve(null),
  ]);

  // Checked BEFORE the caller's own session, deliberately: closing your own work
  // and then being refused anyway is a worse outcome than being told up front
  // that the thesis is taken.
  if (onThesis) {
    return {
      opened: false,
      error: 'THESIS_ACTIVE_OTHER_RESEARCHER',
      activeSession: summarise(onThesis, researcherId),
      howToProceed:
        `${onThesis.researcher?.handle ?? 'Another researcher'} is working on this thesis in an open ` +
        'session. Only one researcher may hold a thesis at a time, so its event log stays a single ' +
        'account of what happened rather than two interleaved ones. Ask them to close it, or work on ' +
        'another thesis meanwhile.',
    };
  }

  let closed: ClosedSessionRecord | null = null;

  if (mine) {
    if (!consent.closeActiveSession) {
      return {
        opened: false,
        error: 'SESSION_ACTIVE_SAME_RESEARCHER',
        activeSession: summarise(mine, researcherId),
        howToProceed:
          'You already have an open research session. Close it with close_research_session, or pass ' +
          'closeActiveSession: true to close it and open the new one.',
      };
    }

    await prisma.$transaction([
      prisma.researchSessionEvent.create({
        data: {
          sessionId: mine.id,
          type: 'SESSION_CLOSED',
          description: `Closed by its owner to open "${seed.name}".`,
        },
      }),
      prisma.researchSession.update({
        where: { id: mine.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      }),
    ]);

    closed = {
      id: mine.id,
      name: mine.name,
      ownerHandle: mine.researcher?.handle ?? null,
      closedByOther: false,
    };
  }

  try {
    const session = await prisma.researchSession.create({
      data: {
        thesisId: seed.thesisId,
        question: seed.question,
        name: seed.name,
        status: 'ACTIVE',
        researcherId,
        events: {
          create: {
            type: 'SESSION_STARTED',
            description: seed.thesisId
              ? `Session "${seed.name}" started`
              : `Framing session opened on: ${seed.question ?? seed.name}`,
          },
        },
      },
    });

    return {
      opened: true,
      session: { id: session.id, name: session.name, status: session.status, createdAt: session.createdAt },
      closed,
    };
  } catch (err) {
    // P2002 means a partial unique index fired: someone opened a session between
    // our check and our insert. That is the race the indexes exist for, and it
    // must surface as a named refusal rather than a 500 — the checks produce the
    // good messages, the indexes produce the truth.
    if (isUniqueViolation(err)) {
      return {
        opened: false,
        error: 'THESIS_ACTIVE_OTHER_RESEARCHER',
        activeSession: {
          id: '-',
          name: '-',
          thesisId: seed.thesisId,
          question: seed.question,
          ownerHandle: null,
          ownedByCaller: false,
          ageMinutes: 0,
          events: 0,
        },
        howToProceed:
          'A session was opened for this researcher or this thesis a moment ago, between the check and ' +
          'the write. Nothing was created. Re-read the current state and try again.',
      };
    }
    throw err;
  }
}

/**
 * ACTIVE_SESSION_NOT_YOURS is gone: the lookup is now scoped to the caller, so a
 * session that is not theirs is never the one returned. It existed to explain a
 * refusal that could only happen under a global lock.
 */
export type ActiveSessionForThesis =
  | { ok: true; sessionId: string; name: string }
  | { ok: false; error: 'NO_ACTIVE_SESSION'; explanation: string }
  | { ok: false; error: 'ACTIVE_SESSION_ON_OTHER_THESIS'; activeSession: ActiveSessionSummary; explanation: string };

/**
 * The session a consequential act on `thesisId` attaches to: the single ACTIVE
 * session, which must belong to the caller and be on this thesis. Anything
 * else is refused with the reason, so the act is never logged against the
 * wrong piece of work — or nobody's.
 */
export async function requireActiveSessionFor(
  researcherId: string | null,
  thesisId: string,
): Promise<ActiveSessionForThesis> {
  // An unidentified caller has no session, and never had one: sessions require
  // an owner. Answering "no active session" is the whole truth for them.
  if (!researcherId) {
    return {
      ok: false,
      error: 'NO_ACTIVE_SESSION',
      explanation:
        'This act must happen inside an active research session on the thesis, so that its rationale is ' +
        'recorded alongside the work that led to it. Opening one requires an approved researcher account.',
    };
  }

  // Scoped to the caller. It used to fetch THE active session globally and then
  // ask whether it belonged to you — which, once several may be open, refuses
  // work that is legitimately yours because somebody else happened to start
  // more recently.
  const mine = await prisma.researchSession.findFirst({
    where: { status: 'ACTIVE', researcherId },
    include: { researcher: { select: { handle: true } }, _count: { select: { events: true } } },
    orderBy: { createdAt: 'desc' },
  });

  if (!mine) {
    return {
      ok: false,
      error: 'NO_ACTIVE_SESSION',
      explanation:
        'This act must happen inside an active research session on the thesis, so that its rationale is ' +
        'recorded alongside the work that led to it. Open one with create_research_session.',
    };
  }

  if (mine.thesisId !== thesisId) {
    return {
      ok: false,
      error: 'ACTIVE_SESSION_ON_OTHER_THESIS',
      activeSession: summarise(mine, researcherId),
      explanation:
        'Your open session is on a different thesis, so this act would be logged against work it did not ' +
        'belong to. Close it and open one on this thesis, or continue on the thesis you already have open.',
    };
  }

  return { ok: true, sessionId: mine.id, name: mine.name };
}
