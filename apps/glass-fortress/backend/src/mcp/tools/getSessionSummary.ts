import { z } from 'zod';
import { prisma } from '../../lib/prisma';

export const getSessionSummarySchema = {
  thesisId: z.string().min(1).describe('ID of the thesis to get session summary for'),
};

type Input = { thesisId: string };

export async function getSessionSummaryHandler(input: Input): Promise<string> {
  // Return active session, falling back to most recent closed session
  const session = await prisma.researchSession.findFirst({
    where: { thesisId: input.thesisId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // ACTIVE < CLOSED alphabetically
    include: {
      events: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!session) {
    return JSON.stringify({
      thesisId: input.thesisId,
      session: null,
      message: 'No sessions found for this thesis. Use create_research_session to start one.',
    });
  }

  const durationMs =
    (session.closedAt ?? new Date()).getTime() - session.createdAt.getTime();
  const durationMinutes = Math.round(durationMs / 60000);

  const summary = {
    versionsCreated: session.events.filter((e) => e.type === 'VERSION_CREATED').length,
    gapsResolved: session.events.filter((e) => e.type === 'GAP_RESOLVED').length,
    aiAnalysesRun: session.events.filter((e) => e.type === 'AI_ANALYSIS_RUN').length,
    notes: session.events.filter((e) => e.type === 'NOTE').length,
  };

  // Also fetch all sessions for context (count only)
  const totalSessions = await prisma.researchSession.count({
    where: { thesisId: input.thesisId },
  });

  return JSON.stringify({
    thesisId: input.thesisId,
    totalSessions,
    session: {
      id: session.id,
      name: session.name,
      status: session.status,
      createdAt: session.createdAt,
      closedAt: session.closedAt,
      durationMinutes,
      summary,
      events: session.events.map((e) => ({
        type: e.type,
        description: e.description,
        refId: e.refId,
        createdAt: e.createdAt,
      })),
    },
  });
}
