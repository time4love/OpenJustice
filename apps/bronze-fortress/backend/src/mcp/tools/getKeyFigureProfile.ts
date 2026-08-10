import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { CommitmentService } from '../../services/CommitmentService';

export const getKeyFigureProfileSchema = {
  figureId: z.string().describe('KeyFigure ID'),
};

const commitmentService = new CommitmentService();

export async function getKeyFigureProfileHandler(input: { figureId: string }): Promise<string> {
  const figure = await prisma.keyFigure.findUnique({
    where: { id: input.figureId },
    include: { court: true },
  });

  if (!figure) {
    return JSON.stringify({ error: `KeyFigure ${input.figureId} not found` });
  }

  const patternSummary = await commitmentService.getFigurePatternSummary(input.figureId);

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
      'Pattern counts reflect independently registered commitments from families who never met each other. ' +
      'Each commitment was timestamped on-chain before any inter-family connection. ' +
      'No individual case content is exposed here.',
  }, null, 2);
}
