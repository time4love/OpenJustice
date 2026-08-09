import { z } from 'zod';
import { prisma } from '../../lib/prisma';

export const createResearchSessionSchema = {
  thesisId: z.string().min(1).describe('ID of the thesis to start a session on'),
  name: z.string().optional().describe('Optional session name. Defaults to current date/time.'),
};

type Input = { thesisId: string; name?: string };

export async function createResearchSessionHandler(input: Input): Promise<string> {
  const thesis = await prisma.thesis.findUnique({ where: { id: input.thesisId } });
  if (!thesis) {
    return JSON.stringify({ error: `Thesis not found: ${input.thesisId}` });
  }

  const sessionName =
    input.name ??
    `Session ${new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`;

  // Close any existing active session for this thesis
  const existing = await prisma.researchSession.findFirst({
    where: { thesisId: input.thesisId, status: 'ACTIVE' },
    include: { _count: { select: { events: true } } },
  });

  if (existing) {
    await prisma.researchSessionEvent.create({
      data: {
        sessionId: existing.id,
        type: 'SESSION_CLOSED',
        description: `Session auto-closed — new session "${sessionName}" started`,
      },
    });
    await prisma.researchSession.update({
      where: { id: existing.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
  }

  const session = await prisma.researchSession.create({
    data: { thesisId: input.thesisId, name: sessionName, status: 'ACTIVE' },
  });

  await prisma.researchSessionEvent.create({
    data: { sessionId: session.id, type: 'SESSION_STARTED', description: `Session "${sessionName}" started` },
  });

  return JSON.stringify({
    sessionId: session.id,
    name: session.name,
    thesisId: input.thesisId,
    status: 'ACTIVE',
    previousSessionClosed: existing ? existing.id : null,
    message: `Session started. Events will be logged automatically as you work. Use add_session_note to add context, close_research_session when done.`,
  });
}
