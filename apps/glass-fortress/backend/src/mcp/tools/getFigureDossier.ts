import { z } from 'zod';
import { prisma } from '../../lib/prisma';

export const getFigureDossierSchema = {
  name: z.string().describe('Key figure name to look up (Hebrew or English, partial match supported)'),
};

export async function getFigureDossierHandler(input: { name: string }): Promise<string> {
  const figure = await prisma.keyFigure.findFirst({
    where: { name: { contains: input.name, mode: 'insensitive' } },
    include: {
      evidence: {
        select: {
          fileHash: true,
          summary: true,
          evidenceTier: true,
          evidenceRole: true,
          evidenceDate: true,
          investigativeCategories: true,
          targetEntity: true,
          sourceUrl: true,
        },
        orderBy: { evidenceDate: 'desc' },
      },
    },
  });

  if (!figure) {
    return JSON.stringify({ error: `No key figure found matching: "${input.name}"` });
  }

  return JSON.stringify({
    figure: figure.name,
    evidenceCount: figure.evidence.length,
    evidence: figure.evidence.map((e) => ({
      fileHash: e.fileHash,
      summary: e.summary,
      evidenceTier: e.evidenceTier,
      evidenceRole: e.evidenceRole,
      evidenceDate: e.evidenceDate,
      investigativeCategories: e.investigativeCategories,
      targetEntity: e.targetEntity,
      sourceUrl: e.sourceUrl ?? null,
    })),
  });
}
