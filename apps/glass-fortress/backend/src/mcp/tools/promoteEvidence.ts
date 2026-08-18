import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { promoteEvidence } from '../../services/promoteEvidence';

export const promoteEvidenceSchema = {
  evidenceId: z.string().uuid().describe('UUID of the PENDING_REVIEW evidence record to promote'),
};

export async function promoteEvidenceHandler(input: { evidenceId: string }): Promise<string> {
  const record = await prisma.evidence.findUnique({ where: { id: input.evidenceId } });

  if (!record) {
    return JSON.stringify({ error: `No evidence found with id: "${input.evidenceId}"` });
  }

  const result = await promoteEvidence(record);
  return JSON.stringify(result);
}
