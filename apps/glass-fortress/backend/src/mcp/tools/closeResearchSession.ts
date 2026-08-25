import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';

export const closeResearchSessionSchema = {
  thesisId: z.string().min(1).optional().describe('ID of the thesis whose active session to close'),
  sessionId: z
    .string()
    .min(1)
    .optional()
    .describe('ID of the active session to close — the only way to close a framing session that has no thesis yet'),
};

interface Input {
  thesisId?: string;
  sessionId?: string;
}

export async function closeResearchSessionHandler(input: Input): Promise<string> {
  if (!input.thesisId && !input.sessionId) {
    return JSON.stringify({ error: 'Provide thesisId or sessionId.' });
  }

  // Scoped to the caller's own sessions. Unscoped, `sessionId` or a thesis id
  // would close another researcher's open work — and under per-researcher locks
  // there is no longer any reason to: their session does not block yours.
  const researcherId = getResearcherId();
  const session = await prisma.researchSession.findFirst({
    where: {
      status: 'ACTIVE',
      researcherId,
      ...(input.sessionId ? { id: input.sessionId } : { thesisId: input.thesisId }),
    },
    include: {
      events: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!session) {
    return JSON.stringify({
      // Deliberately identical whether the session does not exist or belongs to
      // somebody else: a differing message would let any caller probe who is
      // working on what.
      error: input.sessionId
        ? `You have no active session with id ${input.sessionId}.`
        : `You have no active session for thesis ${input.thesisId ?? ''}.`,
    });
  }

  await prisma.researchSessionEvent.create({
    data: { sessionId: session.id, type: 'SESSION_CLOSED', description: 'Session closed' },
  });

  const closed = await prisma.researchSession.update({
    where: { id: session.id },
    data: { status: 'CLOSED', closedAt: new Date() },
  });

  const durationMs = (closed.closedAt ?? new Date()).getTime() - session.createdAt.getTime();
  const durationMinutes = Math.round(durationMs / 60000);

  const summary = {
    versionsCreated: session.events.filter((e) => e.type === 'VERSION_CREATED').length,
    gapsResolved: session.events.filter((e) => e.type === 'GAP_RESOLVED').length,
    aiAnalysesRun: session.events.filter((e) => e.type === 'AI_ANALYSIS_RUN').length,
    notes: session.events.filter((e) => e.type === 'NOTE').length,
  };

  return JSON.stringify({
    sessionId: session.id,
    name: session.name,
    status: 'CLOSED',
    durationMinutes,
    summary,
    events: session.events.map((e) => ({
      type: e.type,
      description: e.description,
      createdAt: e.createdAt,
    })),
  });
}
