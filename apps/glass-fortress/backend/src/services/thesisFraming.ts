import { prisma } from '../lib/prisma';
import { VectorStoreService } from './VectorStoreService';
import {
  ThesisFramingAssessorAgent,
  ThesisFramingAssessmentSchema,
  type ThesisFramingAssessment,
} from './ThesisFramingAssessorAgent';
import { loadTrajectoryContext } from '../lib/trajectoryContext';
import { loadSummaryCaveat } from '../lib/summaryProvenance';
import { openExclusiveSession, type OpenSessionConsent, type OpenSessionRefusal } from './researchSessions';
import { parseAssessment, type ParsedAssessment } from './thesisProvenance';

// ---------------------------------------------------------------------------
// Deciding what a thesis should argue, before one exists.
//
// The topic string fed to suggest_thesis determines which evidence is pulled
// semantically and what the Devil's Advocate attacks. A wrong framing produces a
// well-argued thesis about the wrong thing, and no later iteration rescues it —
// yet until 2026-08-22 that decision left no trace: the topic was interpolated
// into a prompt and discarded, and a ResearchSession could not exist without a
// thesisId.
//
// A framing session IS a ResearchSession that opened before its subject did. It
// is deliberately not a third session type: ResearchSession and DiffDebateSession
// already exist, and a third would be a smell. The thesis attaches when created.
// ---------------------------------------------------------------------------

const MAX_EVIDENCE = 12;

let _vectorStore: VectorStoreService | null = null;
async function getVectorStore(): Promise<VectorStoreService> {
  if (!_vectorStore) _vectorStore = await VectorStoreService.create();
  return _vectorStore;
}

let _assessor: ThesisFramingAssessorAgent | null = null;
function getAssessor(): ThesisFramingAssessorAgent {
  if (!_assessor) _assessor = new ThesisFramingAssessorAgent();
  return _assessor;
}

export type FramingError =
  | { error: 'SESSION_NOT_FOUND'; sessionId: string }
  | { error: 'SESSION_CLOSED'; sessionId: string; status: string }
  | { error: 'ALREADY_HAS_THESIS'; sessionId: string; thesisId: string }
  | { error: 'NO_EVIDENCE'; question: string; explanation: string };

export interface FramingState {
  sessionId: string;
  question: string;
  status: string;
  rounds: number;
  evidenceConsidered: number;
  /**
   * How many deterministic claim trajectories the assessor was shown.
   *
   * Reported for the same reason the diff timeline reports significantCount from
   * the server: an assessor blind to trajectories does not say so, it produces a
   * confident, citation-backed contradiction. A visible zero beside a corpus of
   * forensic evidence is the signal that the strongest layer went unread.
   */
  trajectoriesConsidered: number;
  latestAssessment: ThesisFramingAssessment | null;
  thesisId: string | null;
}

export async function openThesisFraming(
  question: string,
  name?: string,
  researcherId: string | null = null,
  consent: OpenSessionConsent = {},
): Promise<FramingState | OpenSessionRefusal> {
  const sessionName = name ?? `Framing: ${question.slice(0, 60)}`;

  // No thesis yet — that is the point of a framing session. It is still THE
  // active session: it used to escape the one-active rule because that rule
  // was scoped by thesisId, and a null thesisId matched nothing.
  const opened = await openExclusiveSession(
    researcherId,
    { thesisId: null, question, name: sessionName },
    consent,
  );
  if (!opened.opened) {
    // Destructured rather than rebuilt field-by-field: an object literal loses
    // the correlation between `error` and whether `activeSession` accompanies
    // it, and RESEARCHER_REQUIRED carries no session to describe.
    const { opened: _discriminant, ...refusal } = opened;
    return refusal;
  }
  const { session } = opened;

  return {
    sessionId: session.id,
    question,
    status: session.status,
    rounds: 0,
    evidenceConsidered: 0,
    trajectoriesConsidered: 0,
    latestAssessment: null,
    thesisId: null,
  };
}

/** Prior framing turns, oldest first, for the assessor to judge cumulatively. */
async function priorTurns(sessionId: string): Promise<string[]> {
  const events = await prisma.researchSessionEvent.findMany({
    where: { sessionId, type: { in: ['FRAMING_PROPOSED', 'FRAMING_ASSESSED'] } },
    orderBy: { createdAt: 'asc' },
  });

  return events.map((e) =>
    e.type === 'FRAMING_PROPOSED'
      ? `מסגור שהציע החוקר: ${e.description}`
      : `הערכה קודמת: ${e.description}`,
  );
}

export async function assessThesisFraming(
  sessionId: string,
  proposedFraming: string,
): Promise<(FramingState & { assessment: ThesisFramingAssessment }) | FramingError> {
  const session = await prisma.researchSession.findUnique({ where: { id: sessionId } });
  if (!session) return { error: 'SESSION_NOT_FOUND', sessionId };
  if (session.status !== 'ACTIVE') {
    return { error: 'SESSION_CLOSED', sessionId, status: session.status };
  }
  if (session.thesisId) {
    return { error: 'ALREADY_HAS_THESIS', sessionId, thesisId: session.thesisId };
  }

  const question = session.question ?? session.name;

  // Candidates must be anchored in real evidence, so the vault is searched on the
  // QUESTION rather than on the proposed framing — searching the framing would
  // return whatever supports it and quietly hide what contradicts it, which is
  // the one output this exists to produce.
  const vectorStore = await getVectorStore();
  const hits = await vectorStore.searchSimilarEvidence(question, MAX_EVIDENCE * 2);

  const evidence = await prisma.evidence.findMany({
    where: { fileHash: { in: hits.map((h) => h.fileHash) }, status: 'CONFIRMED' },
    select: {
      fileHash: true,
      summary: true,
      evidenceTier: true,
      evidenceRole: true,
      evidenceDate: true,
      investigativeCategories: true,
      targetEntity: true,
    },
    take: MAX_EVIDENCE,
  });

  if (evidence.length === 0) {
    return {
      error: 'NO_EVIDENCE',
      question,
      explanation:
        'No CONFIRMED evidence matches this question, so any framing would be unanchored. Add and promote evidence first.',
    };
  }

  // Loaded BEFORE the turn is recorded, so a failure here cannot leave a
  // FRAMING_PROPOSED event with no assessment beside it.
  // No citations: framing precedes the document, so nothing cites anything yet.
  const trajectories = await loadTrajectoryContext(evidence, []);
  const summaryCaveat = await loadSummaryCaveat(evidence);

  const turns = await priorTurns(sessionId);

  await prisma.researchSessionEvent.create({
    data: { sessionId, type: 'FRAMING_PROPOSED', description: proposedFraming },
  });

  const assessment = await getAssessor().assess({
    question,
    proposedFraming,
    evidence,
    priorTurns: turns,
    trajectories,
    summaryCaveat,
  });

  await prisma.researchSessionEvent.create({
    data: { sessionId, type: 'FRAMING_ASSESSED', description: JSON.stringify(assessment) },
  });

  const rounds = (await priorTurns(sessionId)).filter((t) => t.startsWith('הערכה')).length;

  return {
    sessionId,
    question,
    status: session.status,
    rounds,
    evidenceConsidered: evidence.length,
    trajectoriesConsidered: trajectories.trajectories.length,
    latestAssessment: assessment,
    thesisId: null,
    assessment,
  };
}

/**
 * Attach a thesis to the framing session that produced it.
 *
 * Called by create_thesis_draft. Without this the framing record and the thesis
 * it justified are two unconnected rows, and the reasoning is as lost as it was
 * before the session existed.
 *
 * Refuses to move a session already bound to a thesis — so the repair path
 * below can never overwrite an existing link, only fill an absent one.
 */
export async function attachThesisToFraming(sessionId: string, thesisId: string): Promise<void> {
  const session = await prisma.researchSession.findUnique({ where: { id: sessionId } });
  // Non-fatal: a thesis must never fail to save because its framing record could
  // not be updated. The thesis is the artifact; this is its provenance.
  if (!session || session.thesisId) return;

  await prisma.$transaction([
    prisma.researchSession.update({ where: { id: sessionId }, data: { thesisId } }),
    prisma.researchSessionEvent.create({
      data: {
        sessionId,
        type: 'THESIS_ATTACHED',
        description: 'The framing produced a thesis.',
        refId: thesisId,
      },
    }),
  ]);
}

/** What linking a new thesis to its framing session actually did, and why. */
export type FramingLink =
  | { linked: true; sessionId: string; derived: boolean }
  | { linked: false; reason: 'NO_ACTIVE_SESSION' | 'SESSION_ALREADY_HAS_THESIS' | 'SESSION_NOT_FOUND'; sessionId?: string };

/**
 * Link a newly created thesis to the framing session it came out of, DERIVING
 * that session rather than waiting to be told which one it was.
 *
 * `framingSessionId` used to be an optional argument with exactly one caller.
 * Omit it and both rows still existed, a human could see the relationship in
 * the timestamps, and nothing in the system could ever record it — provenance
 * lost by a missing argument, with no repair path.
 *
 * The ambiguity that justified the parameter is gone: exactly one session may
 * be ACTIVE system-wide (services/researchSessions.ts), so if a thesis is being
 * created while one framing session is active, there is no question which one
 * it came from.
 *
 * This matters more than it looks. **The provenance record's value is that it
 * cannot be curated.** A researcher able to quietly create a thesis without the
 * framing session holding an adversary's objections — and a correction they
 * were asked to make — could publish a narrative whose reasoning trail is
 * simply absent, and it would look identical to a thesis that never had one.
 * Deriving the link removes the choice.
 *
 * `explicitSessionId` remains as a manual override for the unusual case, and
 * failure is always REPORTED, never silent: an orphan the caller was warned
 * about can be repaired, an orphan nobody noticed cannot.
 */
export async function linkThesisToFraming(
  thesisId: string,
  explicitSessionId: string | undefined,
  researcherId: string | null,
): Promise<FramingLink> {
  if (explicitSessionId) {
    const session = await prisma.researchSession.findUnique({
      where: { id: explicitSessionId },
      select: { id: true, thesisId: true, researcherId: true },
    });
    if (!session) return { linked: false, reason: 'SESSION_NOT_FOUND', sessionId: explicitSessionId };
    // Naming a session explicitly must not reach into another researcher's work.
    // Without this check the derivation below could be bypassed by simply
    // passing the id, attaching a thesis to reasoning that is not its author's.
    if (session.researcherId !== researcherId) {
      return { linked: false, reason: 'SESSION_NOT_FOUND', sessionId: explicitSessionId };
    }
    if (session.thesisId) {
      return { linked: false, reason: 'SESSION_ALREADY_HAS_THESIS', sessionId: explicitSessionId };
    }
    await attachThesisToFraming(explicitSessionId, thesisId);
    return { linked: true, sessionId: explicitSessionId, derived: false };
  }

  // Derived from state, not from an argument. Only a session with no thesis yet
  // is a candidate: an ACTIVE session already bound to a thesis is that thesis's
  // working session, not this one's framing.
  //
  // SCOPED TO THE RESEARCHER, and that scope is load-bearing. Unscoped, this
  // picked the most recent unattached ACTIVE session belonging to ANYONE — so
  // with two researchers framing at once it would silently attach one
  // researcher's framing session to the other's thesis, and report
  // `derived: true` as though it had inferred something. The thesis would then
  // carry somebody else's reasoning as the record of why it argues what it
  // argues. Impossible while exclusivity was global (there was only ever one
  // session); possible, silent and provenance-corrupting the moment it became
  // per-researcher.
  //
  // A caller with no researcher gets no derivation. There is no "the" session
  // for an unidentified caller, and guessing one is exactly the bug above.
  if (!researcherId) return { linked: false, reason: 'NO_ACTIVE_SESSION' };

  const active = await prisma.researchSession.findFirst({
    where: { status: 'ACTIVE', thesisId: null, researcherId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!active) return { linked: false, reason: 'NO_ACTIVE_SESSION' };

  await attachThesisToFraming(active.id, thesisId);
  return { linked: true, sessionId: active.id, derived: true };
}

export type RepairFramingLinkResult =
  | { repaired: true; sessionId: string; thesisId: string }
  | {
      repaired: false;
      reason: 'SESSION_NOT_FOUND' | 'THESIS_NOT_FOUND' | 'SESSION_ALREADY_HAS_THESIS' | 'THESIS_ALREADY_LINKED';
      /** The thesis the session is already bound to, when that is the obstacle. */
      boundThesisId?: string;
    };

/**
 * Attach a framing session to a thesis created without one.
 *
 * The repair path. Deriving the link at creation closes the hole going forward;
 * this is for the theses already on the wrong side of it — the same reasoning
 * as deriving state rather than reacting to a transition, which this codebase
 * has been bitten by three times.
 *
 * Refuses when the session is already bound to a DIFFERENT thesis. A repair
 * that can overwrite an existing link is not a repair, it is a way to rewrite
 * provenance — exactly what this record exists to make impossible.
 */
export async function repairFramingLink(
  sessionId: string,
  thesisId: string,
): Promise<RepairFramingLinkResult> {
  const [session, thesis, existing] = await Promise.all([
    prisma.researchSession.findUnique({ where: { id: sessionId }, select: { id: true, thesisId: true } }),
    prisma.thesis.findUnique({ where: { id: thesisId }, select: { id: true } }),
    prisma.researchSession.findFirst({ where: { thesisId }, select: { id: true } }),
  ]);

  if (!session) return { repaired: false, reason: 'SESSION_NOT_FOUND' };
  if (!thesis) return { repaired: false, reason: 'THESIS_NOT_FOUND' };
  if (session.thesisId) {
    return { repaired: false, reason: 'SESSION_ALREADY_HAS_THESIS', boundThesisId: session.thesisId };
  }
  if (existing) return { repaired: false, reason: 'THESIS_ALREADY_LINKED' };

  await attachThesisToFraming(sessionId, thesisId);
  return { repaired: true, sessionId, thesisId };
}

export async function getThesisFraming(
  sessionId: string,
): Promise<
  | (FramingState & {
      events: { type: string; description: string; createdAt: Date }[];
      /**
       * Set only when the newest stored assessment could not be read.
       *
       * This used to be a bare `JSON.parse`, so a malformed row did not read as
       * malformed — it THREW, and took the whole tool down with it. Reporting it
       * beside `latestAssessment: null` keeps the two facts apart: "no assessment
       * has been made" and "the stored assessment is broken" are opposite, and a
       * silent null would have said the first while the second was true.
       */
      latestAssessmentMalformed?: { reason: string };
    })
  | FramingError
> {
  const session = await prisma.researchSession.findUnique({
    where: { id: sessionId },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });
  if (!session) return { error: 'SESSION_NOT_FOUND', sessionId };

  const assessments = session.events.filter((e) => e.type === 'FRAMING_ASSESSED');
  // .at() rather than [length - 1]: the index form is typed as always present,
  // so the guard below reads to the compiler as dead code on an empty session.
  const latest = assessments.at(-1);
  const parsed: ParsedAssessment<ThesisFramingAssessment> =
    latest === undefined
      ? { state: 'absent' }
      : parseAssessment<ThesisFramingAssessment>(latest.description, ThesisFramingAssessmentSchema);

  return {
    sessionId: session.id,
    question: session.question ?? session.name,
    status: session.status,
    rounds: assessments.length,
    evidenceConsidered: 0,
    trajectoriesConsidered: 0,
    latestAssessment: parsed.state === 'ok' ? parsed.value : null,
    ...(parsed.state === 'malformed' ? { latestAssessmentMalformed: { reason: parsed.reason } } : {}),
    thesisId: session.thesisId,
    events: session.events.map((e) => ({
      type: e.type,
      description: e.description,
      createdAt: e.createdAt,
    })),
  };
}
