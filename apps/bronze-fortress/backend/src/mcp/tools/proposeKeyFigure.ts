import { z } from 'zod';
import { KeyFigureType } from '../../generated/prisma';
import { KeyFigureService } from '../../services/KeyFigureService';

export const proposeKeyFigureSchema = {
  caseId: z.string().describe('Case vault ID making the proposal'),
  name: z.string().describe('Full name exactly as it appears in official case documents'),
  type: z.nativeEnum(KeyFigureType).describe('Role of the figure in the proceedings'),
  organization: z.string().optional().describe('Employer or organization (welfare office, clinic, court)'),
  courtId: z.string().optional().describe('Court ID if figure operated in a specific court'),
};

const service = new KeyFigureService();

export async function proposeKeyFigureHandler(input: {
  caseId: string;
  name: string;
  type: KeyFigureType;
  organization?: string;
  courtId?: string;
}): Promise<string> {
  const result = await service.proposeKeyFigure(input);

  const messages: Record<string, string> = {
    created: 'Figure registered as PENDING — awaiting legal review before activation.',
    incremented: `Nomination recorded. This figure has now been named by ${result.nominationCount} independent cases.`,
    already_nominated: 'This case has already nominated this figure. No change.',
  };

  return JSON.stringify({
    status: result.status,
    message: messages[result.status],
    keyFigureId: result.keyFigure.id,
    nominationCount: result.nominationCount,
  }, null, 2);
}
