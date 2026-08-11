import { z } from 'zod';
import { KeyFigureType } from '../../generated/prisma';
import { FigureService } from '../../services/FigureService';

export const nominateAndCommitSchema = {
  caseId: z.string().describe('Case vault ID making the nomination'),
  name: z.string().describe('Full name exactly as it appears in official case documents'),
  type: z.nativeEnum(KeyFigureType).describe('Role of the figure in the proceedings'),
  organization: z.string().optional().describe('Employer or welfare office / clinic (optional)'),
};

const service = new FigureService();

export async function nominateAndCommitHandler(input: {
  caseId: string;
  name: string;
  type: KeyFigureType;
  organization?: string;
}): Promise<string> {
  const result = await service.nominateAndCommit(input.caseId, {
    name: input.name,
    type: input.type,
    organization: input.organization,
  });

  return JSON.stringify(
    {
      figureId: result.figure.id,
      figureName: result.figure.name,
      figureType: result.figure.type,
      figureStatus: result.figure.status,
      courtName: result.court.name,
      courtCity: result.court.city,
      patternsDetected: result.patterns.length,
      newAllegationsCreated: result.newAllegationsCreated,
      patterns: result.patterns.map((p) => ({
        patternCategory: p.patternCategory,
        alreadyRegistered: p.alreadyRegistered,
        evidence: p.evidence,
      })),
      nextStep:
        result.newAllegationsCreated > 0
          ? `${result.newAllegationsCreated} new allegation(s) registered. Call register_on_chain to timestamp them on the blockchain. To make this figure visible in pattern theses, call activate_figure after legal review.`
          : 'All detected patterns were already registered for this figure.',
    },
    null,
    2,
  );
}
