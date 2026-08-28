import { z } from 'zod';
import { WaybackScraper } from '../../services/WaybackScraper';
import { admitUrl } from '../../services/admitUrl';
import { fetchContentForRelevanceCheck } from '../../services/fetchContentForRelevanceCheck';

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
  // ADMISSION RUNS HERE TOO, and it did not before.
  //
  // This tool upserted a TrackedUrl and scanned, with no relevance check and no
  // recorded verdict — so the mission gate existed on the path the WEBSITE uses
  // and not on the path the RESEARCHER uses. Every submission through the
  // research interface entered the corpus unassessed and unrecorded, which is the
  // gap the gate was built to close, on the interface where its absence is least
  // defensible.
  const admission = await admitUrl({
    url: input.url,
    fetchContent: fetchContentForRelevanceCheck,
  });
  if (!admission.admitted) {
    return JSON.stringify({
      error:
        admission.verdict === 'UNREADABLE'
          ? 'Could not retrieve this URL to assess it.'
          : 'URL not relevant to this investigation.',
      verdict: admission.verdict,
      reason: admission.reason,
      url: input.url,
    });
  }
  const trackedUrl = { id: admission.trackedUrlId };

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
