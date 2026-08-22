import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { WaybackScraper } from '../../services/WaybackScraper';

// WaybackScraper is instantiated per-call — construction is cheap.
// runFullScan() carries its own in-memory concurrent-run guard per trackedUrlId,
// so calling this tool twice for the same URL is safe.
function getScraper(): WaybackScraper {
  return new WaybackScraper();
}

export const startForensicScanSchema = {
  url: z.string().url().describe('Public URL to track and diff against the Wayback Machine'),
};

export async function startForensicScanHandler(input: { url: string }): Promise<string> {
  // Upsert TrackedUrl and set status to SCANNING.
  // Idempotent — if a SCANNING record already exists for this URL, it is resumed.
  const trackedUrl = await prisma.trackedUrl.upsert({
    where: { url: input.url },
    update: { status: 'SCANNING' },
    create: { url: input.url, status: 'SCANNING' },
  });

  // Fire-and-forget — the in-memory concurrent-run guard inside runFullScan
  // prevents double-runs for the same trackedUrlId.
  void getScraper()
    .runFullScan(trackedUrl.id, input.url)
    .catch((err: unknown) => {
      console.error(
        '[MCP:startForensicScan] runFullScan error:',
        err instanceof Error ? err.stack : err,
      );
    });

  return JSON.stringify({
    trackedUrlId: trackedUrl.id,
    url: input.url,
    status: 'SCANNING',
    message:
      'Forensic scan started. Call get_forensic_timeline for this URL to follow progress and ' +
      'read results once snapshots are processed.',
  });
}
