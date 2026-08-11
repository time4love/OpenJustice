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
    type: figure.type,
    status: figure.status,
    publicSequence: figure.publicSequence,
    activatedAt: figure.activatedAt,
    message: `Figure is now ACTIVE — public identifier assigned: ${figure.type} ${figure.publicSequence}.`,
  }, null, 2);
}
