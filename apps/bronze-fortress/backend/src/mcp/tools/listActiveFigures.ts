import { z } from 'zod';
import { PatternThesisService } from '../../services/PatternThesisService';
import { KeyFigureType } from '../../generated/prisma';

export const listActiveFiguresSchema = {
  type: z
    .nativeEnum(KeyFigureType)
    .optional()
    .describe('Optional: filter by figure type (JUDGE, SOCIAL_WORKER, EVALUATOR, etc.)'),
};

const service = new PatternThesisService();

export async function listActiveFiguresHandler(input: {
  type?: KeyFigureType;
}): Promise<string> {
  const figures = await service.listActiveFigures();
  const filtered = input.type ? figures.filter((f) => f.type === input.type) : figures;

  return JSON.stringify({
    count: filtered.length,
    figures: filtered,
    note: 'Only ACTIVE figures are listed. Figures below threshold or awaiting legal review are excluded.',
  }, null, 2);
}
