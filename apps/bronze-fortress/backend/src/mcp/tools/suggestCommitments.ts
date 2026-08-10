import { z } from 'zod';
import { PatternDetectionService } from '../../services/PatternDetectionService';

export const suggestCommitmentsSchema = {
  caseId: z.string().describe('The case ID to analyse'),
  figureId: z.string().describe('Key figure to attribute the patterns to'),
  courtId: z.string().describe('Court where the proceedings occurred'),
};

const service = new PatternDetectionService();

export async function suggestCommitmentsHandler(input: {
  caseId: string;
  figureId: string;
  courtId: string;
}): Promise<string> {
  const result = await service.suggestCommitments(input.caseId, input.figureId, input.courtId);

  const pending = result.suggestions.filter((s) => !s.alreadyRegistered);
  const already = result.suggestions.filter((s) => s.alreadyRegistered);

  return JSON.stringify(
    {
      ...result,
      pendingCount: pending.length,
      alreadyRegisteredCount: already.length,
      nextStep:
        pending.length > 0
          ? 'Call register_commitment for each suggestion where alreadyRegistered=false.'
          : 'All detected patterns are already registered for this figure.',
    },
    null,
    2,
  );
}
