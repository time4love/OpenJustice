import { z } from 'zod';
import { prisma } from '../../lib/prisma';

export const listCourtsSchema = {
  district: z.string().optional().describe('Optional: filter by district name (e.g. "ירושלים", "תל אביב")'),
};

export async function listCourtsHandler(input: { district?: string }): Promise<string> {
  const courts = await prisma.court.findMany({
    where: input.district ? { district: input.district } : undefined,
    orderBy: [{ district: 'asc' }, { city: 'asc' }],
    select: { id: true, name: true, city: true, district: true },
  });

  return JSON.stringify(
    {
      count: courts.length,
      courts,
      usage: 'Pass the court "id" field as courtId in nominate_and_commit or suggest_allegations.',
    },
    null,
    2,
  );
}
