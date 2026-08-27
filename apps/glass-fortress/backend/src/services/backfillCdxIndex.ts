import { prisma } from '../lib/prisma';
import { CdxEntryStatus } from '@prisma/client';
import { ARCHIVED_CAPTURES_ONLY } from '../lib/archivedCaptures';
import { recordCdxObservation, markCdxEntryStored, type CdxRow } from './recordCdxObservation';

/**
 * Populate the CDX observation store for a URL already scanned.
 *
 * The tables are created empty, so an existing corpus has no index entries and
 * no record of ever having asked. This makes one live, unpaginated CDX query,
 * records it, and links every entry to the capture we already hold for it.
 *
 * LINKED BY (timestamp, digest), never by timestamp alone — the same key the
 * scanner uses, so a future drifted re-observation cannot inherit a link to a
 * capture it did not produce.
 *
 * Idempotent: the observation path uses `skipDuplicates`, and linking is an
 * update to the value it already holds.
 */
export interface CdxBackfillReport {
  url: string;
  dryRun: boolean;
  /** Rows the live CDX index returned. */
  indexed: number;
  /** Captures we hold for this URL. */
  held: number;
  /** Entries linked to a capture — status STORED. */
  linked: number;
  /**
   * Entries with no capture behind them, left UNFETCHED.
   *
   * SEE THE CAVEAT IN THE SCRIPT: some of these were fetched and deliberately not
   * stored, which UNFETCHED does not describe.
   */
  unlinked: number;
  unlinkedTimestamps: string[];
}

export async function backfillCdxIndex(opts: {
  url: string;
  dryRun: boolean;
  fetchRows: (url: string) => Promise<CdxRow[]>;
}): Promise<CdxBackfillReport> {
  const tracked = await prisma.trackedUrl.findUnique({
    where: { url: opts.url },
    select: { id: true },
  });
  if (!tracked) throw new Error(`No tracked URL found for: ${opts.url}`);

  const rows = await opts.fetchRows(opts.url);
  const captures = await prisma.urlSnapshot.findMany({
    where: { trackedUrlId: tracked.id, ...ARCHIVED_CAPTURES_ONLY },
    select: { id: true, waybackTimestamp: true, document: true },
  });

  // The digest the Archive published is what we key on, and we can recompute
  // ours from the stored payload to confirm the pairing rather than assume it.
  const { cdxDigestOf } = await import('./verifyAgainstCdx');
  const byKey = new Map<string, string>();
  for (const c of captures) {
    if (c.waybackTimestamp) byKey.set(`${c.waybackTimestamp}:${cdxDigestOf(c.document)}`, c.id);
  }

  const linkable = rows.filter((r) => byKey.has(`${r.timestamp}:${r.digest}`));
  const unlinked = rows.filter((r) => !byKey.has(`${r.timestamp}:${r.digest}`));

  if (!opts.dryRun) {
    await recordCdxObservation({
      trackedUrlId: tracked.id,
      queriedAt: new Date(),
      rows,
      hasMore: false,
    });
    for (const row of linkable) {
      const snapshotId = byKey.get(`${row.timestamp}:${row.digest}`);
      if (!snapshotId) continue;
      await markCdxEntryStored({
        trackedUrlId: tracked.id,
        waybackTimestamp: row.timestamp,
        digest: row.digest,
        snapshotId,
      });
    }
  }

  return {
    url: opts.url,
    dryRun: opts.dryRun,
    indexed: rows.length,
    held: captures.length,
    linked: linkable.length,
    unlinked: unlinked.length,
    unlinkedTimestamps: unlinked.map((r) => r.timestamp),
  };
}

/** Statuses this backfill can legitimately assign. */
export const BACKFILL_ASSIGNS = [CdxEntryStatus.STORED, CdxEntryStatus.UNFETCHED] as const;
