import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { WaybackScraper } from '../../services/WaybackScraper';

function getScraper(): WaybackScraper {
  return new WaybackScraper();
}

export const enrichEvidenceWithHistorySchema = {
  fileHash: z
    .string()
    .min(1)
    .describe('SHA-256 fileHash of the Evidence record to enrich with Wayback history'),
};

export async function enrichEvidenceWithHistoryHandler(input: { fileHash: string }): Promise<string> {
  const evidence = await prisma.evidence.findUnique({ where: { fileHash: input.fileHash } });

  if (!evidence) {
    return JSON.stringify({ error: `No evidence found with fileHash: "${input.fileHash}"` });
  }

  if (!evidence.sourceUrl) {
    return JSON.stringify({
      error: 'Evidence has no sourceUrl — cannot trigger Wayback scan.',
      fileHash: input.fileHash,
    });
  }

  const url = evidence.sourceUrl;

  const trackedUrl = await prisma.trackedUrl.upsert({
    where: { url },
    update: { status: 'SCANNING' },
    create: { url, status: 'SCANNING' },
  });

  void getScraper()
    .runFullScan(trackedUrl.id, url)
    .catch((err: unknown) => {
      console.error(
        '[MCP:enrichEvidenceWithHistory] runFullScan error:',
        err instanceof Error ? err.stack : err,
      );
    });

  return JSON.stringify({
    trackedUrlId: trackedUrl.id,
    url,
    status: 'SCANNING',
    message:
      `Wayback scan started for ${url}. ` +
      'Call get_forensic_timeline for this URL to follow progress. Legally significant page ' +
      'edits are recorded as PENDING_REVIEW evidence — not promoted and not registered ' +
      'on-chain. Review them with get_scan_findings and confirm with promote_scan_findings.',
  });
}
