import { z } from 'zod';
import { prisma } from '../../lib/prisma';

export const getForensicTimelineSchema = {
  url: z.string().url().describe('The tracked URL to retrieve forensic diff history for'),
};

export async function getForensicTimelineHandler(input: { url: string }): Promise<string> {
  const tracked = await prisma.trackedUrl.findFirst({
    where: { url: input.url },
    include: {
      diffs: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          beforeDate: true,
          afterDate: true,
          snapshotUrl: true,
          deletedText: true,
          addedText: true,
          aiSignificance: true,
          isLegallySignificant: true,
          createdAt: true,
        },
      },
    },
  });

  if (!tracked) {
    return JSON.stringify({ error: `No tracked URL found for: ${input.url}` });
  }

  const significantCount = tracked.diffs.filter((d) => d.isLegallySignificant).length;

  const timeline = tracked.diffs.map((d) => ({
    id: d.id,
    beforeDate: d.beforeDate,
    afterDate: d.afterDate,
    snapshotUrl: d.snapshotUrl,
    deletedItems: parseJsonArray(d.deletedText),
    addedItems: parseJsonArray(d.addedText),
    aiSignificance: d.aiSignificance,
    isLegallySignificant: d.isLegallySignificant,
  }));

  return JSON.stringify({
    url: tracked.url,
    title: tracked.title,
    status: tracked.status,
    totalDiffs: tracked.diffs.length,
    significantDiffs: significantCount,
    timeline,
  });
}

function parseJsonArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
