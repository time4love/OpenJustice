import { z } from 'zod';
import { PatternCategory } from '../../generated/prisma';
import { prisma } from '../../lib/prisma';

export const listAllegationsSchema = {
  figureId: z.string().describe('KeyFigure ID'),
  patternCategory: z
    .nativeEnum(PatternCategory)
    .optional()
    .describe('Optional: filter to a specific pattern category'),
  limit: z.number().int().min(1).max(100).default(50).describe('Max records to return'),
};

export async function listAllegationsHandler(input: {
  figureId: string;
  patternCategory?: PatternCategory;
  limit: number;
}): Promise<string> {
  const allegations = await prisma.allegation.findMany({
    where: {
      figureId: input.figureId,
      ...(input.patternCategory ? { patternCategory: input.patternCategory } : {}),
    },
    select: {
      id: true,
      patternCategory: true,
      allegationHash: true,
      eventStartDate: true,
      eventEndDate: true,
      onChainTxHash: true,
      createdAt: true,
      court: { select: { name: true, city: true } },
      // caseId intentionally excluded — no case content exposed
    },
    orderBy: { createdAt: 'desc' },
    take: input.limit,
  });

  return JSON.stringify({
    figureId: input.figureId,
    count: allegations.length,
    allegations,
    privacyNote: 'caseId and all case content are excluded. Only allegation hashes and pattern categories are returned.',
  }, null, 2);
}
