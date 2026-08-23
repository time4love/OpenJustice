import { prisma } from '../lib/prisma';

// ---------------------------------------------------------------------------
// One ACTIVE research session at a time, with an owner.
//
// A publication attaches to the session that did it, so its rationale lands in
// the same event log as the framing that chose the question. That only means
// something if "the active session" is unambiguous — which, until this, it was
// not: create_research_session closed prior ACTIVE sessions scoped to its
// thesisId, and a framing session has thesisId null and escaped that scope
// entirely. Verified on staging 2026-08-23: 2 of 2 sessions ACTIVE, both
// unattached. The "one active session" guarantee never covered the sessions
// that matter most.
//
// Closing someone else's work requires consent and leaves a trace. MCP tools
// cannot prompt, so consent is a parameter:
//
//   no other active session              → open normally
//   active session, SAME researcher      → refuse; proceed with closeActiveSession
//   active session, OTHER researcher     → refuse; proceed with
//                                          closeOtherResearchersSession AND a reason.
//                                          The closure is written ONTO THE CLOSED
//                                          SESSION naming who closed it and why.
//
// A session with no owner (opened before ownership existed) has nobody to
// protect and is treated as the caller's own.
// ---------------------------------------------------------------------------

export interface OpenSessionConsent {
  /** Consent to close the caller's OWN active session. */
  closeActiveSession?: boolean;
  /** Distinct consent to close ANOTHER researcher's active session. */
  closeOtherResearchersSession?: boolean;
  /** Required alongside closeOtherResearchersSession; recorded on the closed session. */
  closeReason?: string;
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
  | {
      error: 'SESSION_ACTIVE_OTHER_RESEARCHER';
      activeSession: ActiveSessionSummary;
      howToProceed: string;
    };

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

async function callerHandle(researcherId: string | null): Promise<string> {
  if (!researcherId) return 'an unidentified caller';
  const r = await prisma.researcher.findUnique({ where: { id: researcherId }, select: { handle: true } });
  return r?.handle ?? researcherId;
}

/**
 * Open a session as the ONLY active one, closing whatever was active first —
 * but only with the consent the situation requires. Refuses, naming the open
 * session and its owner, when consent is missing.
 */
export async function openExclusiveSession(
  researcherId: string | null,
  seed: SessionSeed,
  consent: OpenSessionConsent = {},
): Promise<OpenSessionResult> {
  const existing = await prisma.researchSession.findFirst({
    where: { status: 'ACTIVE' },
    include: {
      researcher: { select: { handle: true } },
      _count: { select: { events: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  let closed: ClosedSessionRecord | null = null;

  if (existing) {
    const ownedByCaller = existing.researcherId === null || existing.researcherId === researcherId;
    const summary: ActiveSessionSummary = {
      id: existing.id,
      name: existing.name,
      thesisId: existing.thesisId,
      question: existing.question,
      ownerHandle: existing.researcher?.handle ?? null,
      ownedByCaller,
      ageMinutes: ageMinutes(existing.createdAt),
      events: existing._count.events,
    };

    if (ownedByCaller) {
      if (!consent.closeActiveSession) {
        return {
          opened: false,
          error: 'SESSION_ACTIVE_SAME_RESEARCHER',
          activeSession: summary,
          howToProceed:
            'Only one research session may be active at a time. This one is yours: close it first with ' +
            'close_research_session, or pass closeActiveSession: true to close it and open the new one.',
        };
      }
    } else {
      const reason = consent.closeReason?.trim() ?? '';
      if (!consent.closeOtherResearchersSession || reason === '') {
        return {
          opened: false,
          error: 'SESSION_ACTIVE_OTHER_RESEARCHER',
          activeSession: summary,
          howToProceed:
            `Only one research session may be active at a time, and the open one belongs to ` +
            `${summary.ownerHandle ?? 'another researcher'}. To close it and open yours, pass ` +
            'closeOtherResearchersSession: true AND a closeReason. The closure will be recorded on their ' +
            'session, naming you and the reason.',
        };
      }
    }

    const description = ownedByCaller
      ? `Closed by its owner to open "${seed.name}".`
      : `Closed by ${await callerHandle(researcherId)} to open "${seed.name}". Reason: ${consent.closeReason?.trim() ?? ''}`;

    await prisma.$transaction([
      prisma.researchSessionEvent.create({
        data: {
          sessionId: existing.id,
          type: ownedByCaller ? 'SESSION_CLOSED' : 'SESSION_CLOSED_BY_OTHER',
          description,
          ...(ownedByCaller || !researcherId ? {} : { refId: researcherId }),
        },
      }),
      prisma.researchSession.update({
        where: { id: existing.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      }),
    ]);

    closed = {
      id: existing.id,
      name: existing.name,
      ownerHandle: summary.ownerHandle,
      closedByOther: !ownedByCaller,
    };
  }

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
}

export type ActiveSessionForThesis =
  | { ok: true; sessionId: string; name: string }
  | { ok: false; error: 'NO_ACTIVE_SESSION'; explanation: string }
  | { ok: false; error: 'ACTIVE_SESSION_NOT_YOURS'; activeSession: ActiveSessionSummary; explanation: string }
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
  const active = await prisma.researchSession.findFirst({
    where: { status: 'ACTIVE' },
    include: { researcher: { select: { handle: true } }, _count: { select: { events: true } } },
    orderBy: { createdAt: 'desc' },
  });

  if (!active) {
    return {
      ok: false,
      error: 'NO_ACTIVE_SESSION',
      explanation:
        'This act must happen inside an active research session on the thesis, so that its rationale is ' +
        'recorded alongside the work that led to it. Open one with create_research_session.',
    };
  }

  const ownedByCaller = active.researcherId === null || active.researcherId === researcherId;
  const summary: ActiveSessionSummary = {
    id: active.id,
    name: active.name,
    thesisId: active.thesisId,
    question: active.question,
    ownerHandle: active.researcher?.handle ?? null,
    ownedByCaller,
    ageMinutes: ageMinutes(active.createdAt),
    events: active._count.events,
  };

  if (!ownedByCaller) {
    return {
      ok: false,
      error: 'ACTIVE_SESSION_NOT_YOURS',
      activeSession: summary,
      explanation: `The active session belongs to ${summary.ownerHandle ?? 'another researcher'}. Open your own with create_research_session.`,
    };
  }

  if (active.thesisId !== thesisId) {
    return {
      ok: false,
      error: 'ACTIVE_SESSION_ON_OTHER_THESIS',
      activeSession: summary,
      explanation: active.thesisId
        ? `The active session is on thesis ${active.thesisId}, not ${thesisId}. Open a session on this thesis with create_research_session.`
        : 'The active session is a framing session with no thesis attached. Open a session on this thesis with create_research_session.',
    };
  }

  return { ok: true, sessionId: active.id, name: active.name };
}
