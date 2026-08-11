import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AllegationService } from '../../services/AllegationService';

export const getKeyFigureProfileSchema = {
  figureId: z.string().describe('KeyFigure ID'),
};

const allegationService = new AllegationService();

export async function getKeyFigureProfileHandler(input: { figureId: string }): Promise<string> {
  const figure = await prisma.keyFigure.findUnique({
    where: { id: input.figureId },
    include: { court: true },
  });

  if (!figure) {
    return JSON.stringify({ error: `KeyFigure ${input.figureId} not found` });
  }

  const patternSummary = await allegationService.getFigurePatternSummary(input.figureId);

  return JSON.stringify({
    id: figure.id,
    name: figure.name,
    type: figure.type,
    organization: figure.organization,
    status: figure.status,
    court: figure.court ? { name: figure.court.name, city: figure.court.city } : null,
    registryVerified: figure.registryVerified,
    registrySource: figure.registrySource,
    activatedAt: figure.activatedAt,
    patternSummary,
    legalNote:
      'Pattern counts reflect independently registered allegations from cases that had no prior connection. ' +
      'Each allegation was timestamped on-chain before any inter-case connection was established. ' +
      'No individual case content is exposed here.',
  }, null, 2);
}
