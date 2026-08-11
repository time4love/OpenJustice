import { z } from 'zod';
import { PatternCategory } from '../../generated/prisma';
import { AllegationService } from '../../services/AllegationService';

export const registerAllegationSchema = {
  caseId: z.string().describe('Case vault ID'),
  figureId: z.string().describe('KeyFigure ID (must be ACTIVE)'),
  courtId: z.string().describe('Court ID where the pattern occurred'),
  patternCategory: z.nativeEnum(PatternCategory).describe('Pattern category from the taxonomy'),
  eventStartDate: z.string().optional().describe('ISO date string — start of the documented period'),
  eventEndDate: z.string().optional().describe('ISO date string — end of the documented period'),
};

const service = new AllegationService();

export async function registerAllegationHandler(input: {
  caseId: string;
  figureId: string;
  courtId: string;
  patternCategory: PatternCategory;
  eventStartDate?: string;
  eventEndDate?: string;
}): Promise<string> {
  const result = await service.registerAllegation({
    caseId: input.caseId,
    figureId: input.figureId,
    courtId: input.courtId,
    patternCategory: input.patternCategory,
    eventStartDate: input.eventStartDate ? new Date(input.eventStartDate) : undefined,
    eventEndDate: input.eventEndDate ? new Date(input.eventEndDate) : undefined,
  });

  return JSON.stringify({
    allegationId: result.allegation.id,
    allegationHash: result.allegation.allegationHash,
    isDuplicate: result.isDuplicate,
    message: result.isDuplicate
      ? 'This allegation was already registered. No duplicate created.'
      : 'Allegation registered. Call register_on_chain to timestamp it on the blockchain.',
  }, null, 2);
}
