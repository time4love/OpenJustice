import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { openExclusiveSession } from '../../services/researchSessions';

export const sessionConsentSchema = {
  closeActiveSession: z
    .boolean()
    .optional()
    .describe(
      'Consent to close YOUR OWN currently active session. Without it, opening refuses while one is active.',
    ),
};

export const createResearchSessionSchema = {
  thesisId: z.string().min(1).describe('ID of the thesis to start a session on'),
  name: z.string().optional().describe('Optional session name. Defaults to current date/time.'),
  ...sessionConsentSchema,
};

interface Input {
  thesisId: string;
  name?: string;
  closeActiveSession?: boolean;
}

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

  const result = await openExclusiveSession(
    getResearcherId(),
    { thesisId: input.thesisId, question: null, name: sessionName },
    { closeActiveSession: input.closeActiveSession },
  );

  if (!result.opened) {
    // RESEARCHER_REQUIRED carries no activeSession — there is no session to
    // describe, only a missing identity. Destructuring keeps each variant's own
    // shape instead of emitting a key as present-and-undefined.
    const { opened: _discriminant, ...refusal } = result;
    return JSON.stringify(refusal);
  }

  return JSON.stringify({
    sessionId: result.session.id,
    name: result.session.name,
    thesisId: input.thesisId,
    status: 'ACTIVE',
    previousSessionClosed: result.closed,
    message: `Session started. Events will be logged automatically as you work. Use add_session_note to add context, close_research_session when done.`,
  });
}
