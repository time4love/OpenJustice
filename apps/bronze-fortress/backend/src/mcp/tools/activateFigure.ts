import { z } from 'zod';
import { KeyFigureService } from '../../services/KeyFigureService';

export const activateFigureSchema = {
  keyFigureId: z.string().describe('ID of the KeyFigure to activate (must have PENDING status)'),
};

const service = new KeyFigureService();

export async function activateFigureHandler(input: { keyFigureId: string }): Promise<string> {
  const figure = await service.activateFigure(input.keyFigureId);
  return JSON.stringify({
    id: figure.id,
    name: figure.name,
    type: figure.type,
    status: figure.status,
    activatedAt: figure.activatedAt,
    message: 'Figure is now ACTIVE — visible to registered families and queryable in pattern theses.',
  }, null, 2);
}
