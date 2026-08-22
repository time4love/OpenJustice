import { prisma } from '../lib/prisma';
import {
  ForensicPromotionAssessorAgent,
  type ForensicPromotionAssessment,
} from './ForensicPromotionAssessorAgent';
import { promoteForensicDiff } from './promoteForensicDiff';
import type { DiffItem } from './ForensicAgent';

// ---------------------------------------------------------------------------
// Debating whether one page change should become evidence.
//
// A session with a goal, a lifecycle and an event log — the same shape as a
// ResearchSession on a thesis, for the same reason. The sequence of claims,
// challenges and answers IS the justification; a single summary field written
// at the end would not be.
//
// Preconditions for promotion, in order:
//   1. The session is OPEN.
//   2. The latest argument cleared the SUBSTANCE gate. Hard requirement.
//   3. If the assessor DISPUTES it, the researcher has answered the objection
//      at least once.
//
// Nothing here can refuse a promotion on the merits. A sustained objection is
// recorded as promotedOverObjection and carried on the evidence forever.
// ---------------------------------------------------------------------------

let _assessor: ForensicPromotionAssessorAgent | null = null;
function getAssessor(): ForensicPromotionAssessorAgent {
  if (!_assessor) _assessor = new ForensicPromotionAssessorAgent();
  return _assessor;
}

function itemSummaries(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as DiffItem[]).map((i) => i.summary).filter(Boolean);
  } catch {
    return [];
  }
}

export type DiffDebateError =
  | { error: 'DIFF_NOT_FOUND'; urlVersionDiffId: string }
  | { error: 'SESSION_NOT_FOUND'; sessionId: string }
  | { error: 'SESSION_CLOSED'; sessionId: string; status: string }
  | { error: 'ALREADY_EVIDENCE'; evidenceId: string; fileHash: string };

export interface DiffDebateState {
  sessionId: string;
  urlVersionDiffId: string;
  status: string;
  hasSubstance: boolean;
  verdict: string | null;
  canPromote: boolean;
  /** Why promotion is blocked, when it is. */
  blockedBy: string | null;
  latestAssessment: ForensicPromotionAssessment | null;
  rounds: number;
}

/** Assess one argument, log both turns, and update the session's standing state. */
async function assessAndRecord(
  sessionId: string,
  argument: string,
  argumentType: 'RATIONALE_SUBMITTED' | 'RESPONSE_SUBMITTED',
  diff: {
    id: string;
    url: string;
    beforeDate: string;
    afterDate: string;
    aiSignificance: string;
    investigativeCategories: string[];
    deletedText: string;
    addedText: string;
  },
): Promise<ForensicPromotionAssessment> {
  await prisma.diffDebateEvent.create({
    data: { sessionId, type: argumentType, content: argument },
  });

  const assessment = await getAssessor().assess({
    url: diff.url,
    beforeDate: diff.beforeDate,
    afterDate: diff.afterDate,
    classifierReasoning: diff.aiSignificance,
    classifierCategories: diff.investigativeCategories,
    deletedItems: itemSummaries(diff.deletedText),
    addedItems: itemSummaries(diff.addedText),
    rationale: argument,
  });

  await prisma.diffDebateEvent.create({
    data: {
      sessionId,
      type: 'ASSESSMENT_RETURNED',
      content: JSON.stringify(assessment),
    },
  });

  await prisma.diffDebateSession.update({
    where: { id: sessionId },
    data: { hasSubstance: assessment.hasSubstance, verdict: assessment.verdict },
  });

  return assessment;
}

async function buildState(sessionId: string): Promise<DiffDebateState> {
  const session = await prisma.diffDebateSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });

  const assessments = session.events.filter((e) => e.type === 'ASSESSMENT_RETURNED');
  const latest = assessments[assessments.length - 1];
  const latestAssessment = latest
    ? (JSON.parse(latest.content) as ForensicPromotionAssessment)
    : null;

  const respondedToObjection = session.events.some((e) => e.type === 'RESPONSE_SUBMITTED');

  let blockedBy: string | null = null;
  if (session.status !== 'OPEN') blockedBy = `The debate is ${session.status}.`;
  else if (!session.hasSubstance) {
    blockedBy =
      'The argument has not cleared the substance gate: it must make specific, falsifiable claims about the changed content. See substanceGaps and respond with respond_in_diff_debate.';
  } else if (session.verdict === 'DISPUTES' && !respondedToObjection) {
    blockedBy =
      'The assessor disputes the argument. Answer its objection with respond_in_diff_debate before promoting. You may still promote afterwards if you disagree — the objection will be recorded on the evidence.';
  }

  return {
    sessionId: session.id,
    urlVersionDiffId: session.urlVersionDiffId,
    status: session.status,
    hasSubstance: session.hasSubstance,
    verdict: session.verdict,
    canPromote: blockedBy === null,
    blockedBy,
    latestAssessment,
    rounds: assessments.length,
  };
}

export async function openDiffDebate(
  urlVersionDiffId: string,
  rationale: string,
): Promise<DiffDebateState | DiffDebateError> {
  const diff = await prisma.urlVersionDiff.findUnique({
    where: { id: urlVersionDiffId },
    include: { trackedUrl: { select: { url: true } } },
  });
  if (!diff) return { error: 'DIFF_NOT_FOUND', urlVersionDiffId };

  const existingEvidence = await prisma.evidence.findFirst({ where: { urlVersionDiffId } });
  if (existingEvidence) {
    return {
      error: 'ALREADY_EVIDENCE',
      evidenceId: existingEvidence.id,
      fileHash: existingEvidence.fileHash,
    };
  }

  // One debate per diff at a time — mirrors one ACTIVE ResearchSession per
  // thesis. Reopening returns the existing argument rather than starting a
  // second record of the same dispute.
  const open = await prisma.diffDebateSession.findFirst({
    where: { urlVersionDiffId, status: 'OPEN' },
  });

  const session =
    open ??
    (await prisma.diffDebateSession.create({
      data: {
        urlVersionDiffId,
        events: {
          create: {
            type: 'DEBATE_OPENED',
            content: `Debate opened on ${diff.trackedUrl.url} (${diff.beforeDate} → ${diff.afterDate}).`,
          },
        },
      },
    }));

  await assessAndRecord(session.id, rationale, 'RATIONALE_SUBMITTED', {
    id: diff.id,
    url: diff.trackedUrl.url,
    beforeDate: diff.beforeDate,
    afterDate: diff.afterDate,
    aiSignificance: diff.aiSignificance,
    investigativeCategories: diff.investigativeCategories,
    deletedText: diff.deletedText,
    addedText: diff.addedText,
  });

  return buildState(session.id);
}

export async function respondInDiffDebate(
  sessionId: string,
  response: string,
): Promise<DiffDebateState | DiffDebateError> {
  const session = await prisma.diffDebateSession.findUnique({
    where: { id: sessionId },
    include: { urlVersionDiff: { include: { trackedUrl: { select: { url: true } } } } },
  });
  if (!session) return { error: 'SESSION_NOT_FOUND', sessionId };
  if (session.status !== 'OPEN') {
    return { error: 'SESSION_CLOSED', sessionId, status: session.status };
  }

  const diff = session.urlVersionDiff;
  await assessAndRecord(sessionId, response, 'RESPONSE_SUBMITTED', {
    id: diff.id,
    url: diff.trackedUrl.url,
    beforeDate: diff.beforeDate,
    afterDate: diff.afterDate,
    aiSignificance: diff.aiSignificance,
    investigativeCategories: diff.investigativeCategories,
    deletedText: diff.deletedText,
    addedText: diff.addedText,
  });

  return buildState(sessionId);
}

export type PromoteFromDebateResult =
  | { promoted: true; evidenceId: string; fileHash: string; txHash: string | null; status: string; promotedOverObjection: boolean }
  | { promoted: false; blockedBy: string; state: DiffDebateState }
  | DiffDebateError
  | { error: 'PROMOTION_FAILED'; outcome: string; message?: string };

export async function promoteFromDiffDebate(sessionId: string): Promise<PromoteFromDebateResult> {
  const session = await prisma.diffDebateSession.findUnique({ where: { id: sessionId } });
  if (!session) return { error: 'SESSION_NOT_FOUND', sessionId };

  const state = await buildState(sessionId);
  if (!state.canPromote) {
    return { promoted: false, blockedBy: state.blockedBy ?? 'Not ready to promote.', state };
  }

  const overObjection = session.verdict === 'DISPUTES';
  const result = await promoteForensicDiff(session.urlVersionDiffId);

  if (result.outcome !== 'promoted') {
    return {
      error: 'PROMOTION_FAILED',
      outcome: result.outcome,
      ...(result.outcome === 'chain_error' ? { message: result.message } : {}),
    };
  }

  await prisma.$transaction([
    prisma.diffDebateEvent.create({
      data: {
        sessionId,
        type: 'PROMOTED',
        refId: result.evidenceId,
        content: overObjection
          ? 'Promoted over a sustained objection from the assessor.'
          : 'Promoted with the assessor in agreement.',
      },
    }),
    prisma.diffDebateSession.update({
      where: { id: sessionId },
      data: {
        status: 'PROMOTED',
        evidenceId: result.evidenceId,
        promotedOverObjection: overObjection,
        closedAt: new Date(),
      },
    }),
  ]);

  return {
    promoted: true,
    evidenceId: result.evidenceId,
    fileHash: result.fileHash,
    txHash: result.txHash,
    status: result.confirmed ? 'CONFIRMED' : 'PENDING_REVIEW',
    promotedOverObjection: overObjection,
  };
}

export async function getDiffDebate(sessionId: string): Promise<
  | (DiffDebateState & {
      events: { type: string; content: string; refId: string | null; createdAt: Date }[];
      promotedOverObjection: boolean;
      evidenceId: string | null;
    })
  | DiffDebateError
> {
  const session = await prisma.diffDebateSession.findUnique({
    where: { id: sessionId },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });
  if (!session) return { error: 'SESSION_NOT_FOUND', sessionId };

  const state = await buildState(sessionId);
  return {
    ...state,
    promotedOverObjection: session.promotedOverObjection,
    evidenceId: session.evidenceId,
    events: session.events.map((e) => ({
      type: e.type,
      content: e.content,
      refId: e.refId,
      createdAt: e.createdAt,
    })),
  };
}
