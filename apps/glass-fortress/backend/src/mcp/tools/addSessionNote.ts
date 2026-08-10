import { z } from 'zod';
import { prisma } from '../../lib/prisma';

export const addSessionNoteSchema = {
  thesisId: z.string().min(1).describe('ID of the thesis whose active session to note'),
  note: z.string().min(1).describe('The note to log — observations, dead ends, next steps, hypotheses'),
};

type Input = { thesisId: string; note: string };

export async function addSessionNoteHandler(input: Input): Promise<string> {
  const session = await prisma.researchSession.findFirst({
    where: { thesisId: input.thesisId, status: 'ACTIVE' },
    select: { id: true, name: true },
  });

  if (!session) {
    return JSON.stringify({
      error: `No active session for thesis ${input.thesisId}. Use create_research_session first.`,
    });
  }

  const event = await prisma.researchSessionEvent.create({
    data: { sessionId: session.id, type: 'NOTE', description: input.note },
  });

  return JSON.stringify({
    sessionId: session.id,
    eventId: event.id,
    note: input.note,
    createdAt: event.createdAt,
  });
}
