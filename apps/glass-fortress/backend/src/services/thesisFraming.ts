import { prisma } from '../lib/prisma';
import { VectorStoreService } from './VectorStoreService';
import {
  ThesisFramingAssessorAgent,
  type ThesisFramingAssessment,
} from './ThesisFramingAssessorAgent';
import { loadTrajectoryContext } from '../lib/trajectoryContext';
import { loadSummaryCaveat } from '../lib/summaryProvenance';

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

export async function openThesisFraming(question: string, name?: string): Promise<FramingState> {
  const sessionName = name ?? `Framing: ${question.slice(0, 60)}`;

  const session = await prisma.researchSession.create({
    data: {
      // No thesis yet — that is the point of a framing session.
      thesisId: null,
      question,
      name: sessionName,
      status: 'ACTIVE',
      events: {
        create: {
          type: 'SESSION_STARTED',
          description: `Framing session opened on: ${question}`,
        },
      },
    },
  });

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
  const trajectories = await loadTrajectoryContext(evidence);
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

export async function getThesisFraming(
  sessionId: string,
): Promise<(FramingState & { events: { type: string; description: string; createdAt: Date }[] }) | FramingError> {
  const session = await prisma.researchSession.findUnique({
    where: { id: sessionId },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });
  if (!session) return { error: 'SESSION_NOT_FOUND', sessionId };

  const assessments = session.events.filter((e) => e.type === 'FRAMING_ASSESSED');
  const latest = assessments[assessments.length - 1];

  return {
    sessionId: session.id,
    question: session.question ?? session.name,
    status: session.status,
    rounds: assessments.length,
    evidenceConsidered: 0,
    trajectoriesConsidered: 0,
    latestAssessment: latest ? (JSON.parse(latest.description) as ThesisFramingAssessment) : null,
    thesisId: session.thesisId,
    events: session.events.map((e) => ({
      type: e.type,
      description: e.description,
      createdAt: e.createdAt,
    })),
  };
}
