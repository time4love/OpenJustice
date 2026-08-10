import { z } from 'zod';
import { KeyFigureService, THRESHOLD } from '../../services/KeyFigureService';
import { KeyFigureType } from '../../generated/prisma';

export const listPendingFiguresSchema = {
  includeAwaitingReview: z
    .boolean()
    .default(false)
    .describe('If true, also returns KeyFigures that reached threshold but await legal review'),
};

const service = new KeyFigureService();

export async function listPendingFiguresHandler(input: {
  includeAwaitingReview: boolean;
}): Promise<string> {
  const belowThreshold = await service.listPendingFigures();
  const awaitingReview = input.includeAwaitingReview
    ? await service.getPendingFiguresAwaitingReview()
    : [];

  return JSON.stringify({
    belowThreshold: belowThreshold.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      organization: f.organization,
      nominationCount: f.nominationCount,
      threshold: THRESHOLD[f.type as KeyFigureType],
      remaining: THRESHOLD[f.type as KeyFigureType] - f.nominationCount,
    })),
    awaitingLegalReview: awaitingReview.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      organization: f.organization,
      status: f.status,
      createdAt: f.createdAt,
    })),
  }, null, 2);
}
