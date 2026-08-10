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
    created: `Proposal recorded. ${result.nominationCount}/${result.threshold} families needed for threshold.`,
    incremented: `Nomination count updated: ${result.nominationCount}/${result.threshold} families.`,
    promoted: `Threshold reached (${result.nominationCount} families). Figure promoted — awaiting legal review before activation.`,
    already_nominated: 'This family has already nominated this figure. No change.',
  };

  return JSON.stringify({
    status: result.status,
    message: messages[result.status],
    nominationCount: result.nominationCount,
    threshold: result.threshold,
    keyFigureId: result.keyFigure?.id,
    pendingFigureId: result.pendingFigure?.id,
  }, null, 2);
}
