import { z } from 'zod';
import { prisma } from '../../lib/prisma';

export const closeResearchSessionSchema = {
  thesisId: z.string().min(1).describe('ID of the thesis whose active session to close'),
};

type Input = { thesisId: string };

export async function closeResearchSessionHandler(input: Input): Promise<string> {
  const session = await prisma.researchSession.findFirst({
    where: { thesisId: input.thesisId, status: 'ACTIVE' },
    include: {
      events: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!session) {
    return JSON.stringify({
      error: `No active session for thesis ${input.thesisId}.`,
    });
  }

  await prisma.researchSessionEvent.create({
    data: { sessionId: session.id, type: 'SESSION_CLOSED', description: 'Session closed' },
  });

  const closed = await prisma.researchSession.update({
    where: { id: session.id },
    data: { status: 'CLOSED', closedAt: new Date() },
  });

  const durationMs = closed.closedAt!.getTime() - session.createdAt.getTime();
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
