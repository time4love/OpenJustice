import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { deleteEvidence } from '../../services/deleteEvidence';

export const deleteEvidenceSchema = {
  evidenceId: z.string().uuid().describe('UUID of the PENDING_REVIEW evidence record to permanently delete'),
};

export async function deleteEvidenceHandler(input: { evidenceId: string }): Promise<string> {
  const record = await prisma.evidence.findUnique({ where: { id: input.evidenceId } });

  if (!record) {
    return JSON.stringify({ error: `No evidence found with id: "${input.evidenceId}"` });
  }

  const result = await deleteEvidence(record);
  return JSON.stringify(result);
}
