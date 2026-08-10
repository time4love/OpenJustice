import { z } from 'zod';
import { PatternCategory } from '../../generated/prisma';
import { CommitmentService } from '../../services/CommitmentService';

export const registerCommitmentSchema = {
  caseId: z.string().describe('Case vault ID'),
  figureId: z.string().describe('KeyFigure ID (must be ACTIVE)'),
  courtId: z.string().describe('Court ID where the pattern occurred'),
  patternCategory: z.nativeEnum(PatternCategory).describe('Pattern category from the taxonomy'),
  eventStartDate: z.string().optional().describe('ISO date string — start of the documented period'),
  eventEndDate: z.string().optional().describe('ISO date string — end of the documented period'),
};

const service = new CommitmentService();

export async function registerCommitmentHandler(input: {
  caseId: string;
  figureId: string;
  courtId: string;
  patternCategory: PatternCategory;
  eventStartDate?: string;
  eventEndDate?: string;
}): Promise<string> {
  const result = await service.registerCommitment({
    caseId: input.caseId,
    figureId: input.figureId,
    courtId: input.courtId,
    patternCategory: input.patternCategory,
    eventStartDate: input.eventStartDate ? new Date(input.eventStartDate) : undefined,
    eventEndDate: input.eventEndDate ? new Date(input.eventEndDate) : undefined,
  });

  return JSON.stringify({
    commitmentId: result.commitment.id,
    commitmentHash: result.commitment.commitmentHash,
    isDuplicate: result.isDuplicate,
    message: result.isDuplicate
      ? 'This commitment was already registered. No duplicate created.'
      : 'Commitment registered. On-chain registration will be wired in BF-2.5.',
  }, null, 2);
}
