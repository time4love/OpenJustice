import { z } from 'zod';
import { PatternCategory } from '../../generated/prisma';
import { CommitmentService } from '../../services/CommitmentService';

export const queryPatternSchema = {
  figureId: z.string().describe('KeyFigure ID to query'),
  patternCategory: z
    .nativeEnum(PatternCategory)
    .optional()
    .describe('Optional: filter to a specific pattern category'),
};

const service = new CommitmentService();

export async function queryPatternHandler(input: {
  figureId: string;
  patternCategory?: PatternCategory;
}): Promise<string> {
  if (input.patternCategory) {
    const count = await service.getPatternCount(input.figureId, input.patternCategory);
    return JSON.stringify({
      figureId: input.figureId,
      patternCategory: input.patternCategory,
      familyCount: count,
      note: 'Count reflects independently registered commitments. Each family registered on-chain before any inter-family connection was made.',
    }, null, 2);
  }

  const summary = await service.getFigurePatternSummary(input.figureId);
  return JSON.stringify(summary, null, 2);
}
