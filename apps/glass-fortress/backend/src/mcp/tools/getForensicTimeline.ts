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

  // Derived from state on every read, never tracked through a write.
  //
  // Snapshot anchoring is fire-and-forget with a swallowed rejection — correctly,
  // since a chain hiccup must not fail a scan that stored archived text. But
  // nothing ever asked afterwards, and a scan that ran while the RPC was down
  // left all 83 snapshots unanchored while reporting success. A counter
  // incremented at write time would have reported zero failures; this cannot.
  const [snapshotsStored, unanchoredSnapshots] = await Promise.all([
    prisma.urlSnapshot.count({ where: { trackedUrlId: tracked.id } }),
    prisma.urlSnapshot.count({ where: { trackedUrlId: tracked.id, onChainTxHash: null } }),
  ]);

  return JSON.stringify({
    url: tracked.url,
    title: tracked.title,
    status: tracked.status,
    totalDiffs: tracked.diffs.length,
    significantDiffs: significantCount,
    snapshotsStored,
    // The factual layer's chain of custody. Non-zero means the archived text for
    // this page is stored but its hash was never published, so "this page held
    // exactly this text on this date" currently rests on this platform's word.
    unanchoredSnapshots,
    ...(unanchoredSnapshots > 0
      ? {
          anchoringWarning:
            `${unanchoredSnapshots} of ${snapshotsStored} archived snapshots for this page are not ` +
            'registered on-chain. Evidence promoted from them is still anchored in its own right, ' +
            'but the underlying capture is not independently timestamped. Repair with ' +
            'npm run forensics:anchor-snapshots.',
        }
      : {}),
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
