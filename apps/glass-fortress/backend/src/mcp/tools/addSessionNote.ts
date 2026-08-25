import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';

export const addSessionNoteSchema = {
  thesisId: z.string().min(1).describe('ID of the thesis whose active session to note'),
  note: z.string().min(1).describe('The note to log — observations, dead ends, next steps, hypotheses'),
};

type Input = { thesisId: string; note: string };

export async function addSessionNoteHandler(input: Input): Promise<string> {
  // Scoped to the caller. A note is a provenance event: unscoped, this wrote
  // into whichever session held the thesis — which, now that a thesis may be
  // held by a researcher who is not you, means writing your observation into
  // somebody else's account of their work.
  const researcherId = getResearcherId();
  const session = await prisma.researchSession.findFirst({
    where: { thesisId: input.thesisId, status: 'ACTIVE', researcherId },
    select: { id: true, name: true },
  });

  if (!session) {
    return JSON.stringify({
      error:
        `You have no active session on thesis ${input.thesisId}. Use create_research_session first. ` +
        'If another researcher is holding this thesis, their session is not one you can write into.',
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
