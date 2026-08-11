import { z } from 'zod';
import { KeyFigureType, KeyFigureStatus } from '../../generated/prisma';
import { prisma } from '../../lib/prisma';

export const listFiguresPendingReviewSchema = {
  type: z
    .nativeEnum(KeyFigureType)
    .optional()
    .describe('Optional: filter by figure type (JUDGE, SOCIAL_WORKER, EVALUATOR, etc.)'),
};

export async function listFiguresPendingReviewHandler(input: {
  type?: KeyFigureType;
}): Promise<string> {
  const figures = await prisma.keyFigure.findMany({
    where: {
      status: KeyFigureStatus.PENDING,
      ...(input.type ? { type: input.type } : {}),
    },
    include: {
      court: { select: { name: true, city: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Get distinct case counts for each figure
  const withCounts = await Promise.all(
    figures.map(async (fig) => {
      const distinctCases = await prisma.allegation.findMany({
        where: { figureId: fig.id },
        distinct: ['caseId'],
        select: { caseId: true },
      });
      return {
        figureId: fig.id,
        name: fig.name,
        type: fig.type,
        organization: fig.organization,
        court: fig.court ? `${fig.court.name}, ${fig.court.city}` : null,
        caseCount: distinctCases.length,
        createdAt: fig.createdAt,
      };
    }),
  );

  // Sort by case count descending — reviewer should tackle high-count figures first
  withCounts.sort((a, b) => b.caseCount - a.caseCount);

  return JSON.stringify(
    {
      count: withCounts.length,
      figures: withCounts,
      note:
        'These figures were registered via case intake but have not yet been reviewed. ' +
        'Call activate_figure(keyFigureId) after confirming the figure is named in their official capacity.',
    },
    null,
    2,
  );
}
