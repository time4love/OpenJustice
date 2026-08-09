// ---------------------------------------------------------------------------
// sessionService.ts
//
// Low-friction session event logging. All functions are fire-and-forget safe:
// if no active session exists for the thesis, they silently no-op.
// Called automatically from thesisRoutes.ts and thesisAnalysis.ts.
// ---------------------------------------------------------------------------

import { type ResearchSessionEventType } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Log an event to the active session for a thesis.
 * Silently no-ops if no active session exists — callers do not need to check.
 */
export async function logSessionEvent(
  thesisId: string,
  type: ResearchSessionEventType,
  description: string,
  refId?: string,
): Promise<void> {
  const activeSession = await prisma.researchSession.findFirst({
    where: { thesisId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!activeSession) return;

  await prisma.researchSessionEvent.create({
    data: { sessionId: activeSession.id, type, description, refId },
  });
}
