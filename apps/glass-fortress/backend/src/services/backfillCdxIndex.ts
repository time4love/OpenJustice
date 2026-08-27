import { prisma } from '../lib/prisma';
import { ARCHIVED_CAPTURES_ONLY } from '../lib/archivedCaptures';
import {
  recordCdxObservation,
  markCdxEntryStored,
  markCdxEntryUnchanged,
  markCdxEntryUnservable,
  type CdxRow,
} from './recordCdxObservation';
import { noveltyAgainstPredecessor, waybackTimestampToDate } from './recordCapture';
import { deriveText } from '../lib/captureDocument';
import { fetchCaptureBytes } from '../lib/archiveHttp';
import { WaybackFetchError } from '../lib/archiveHttp';

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
  /** Entries fetched, compared, and identical to their predecessor. */
  unchanged: number;
  /** Entries the Archive indexes but will not serve — HTTP 404, durable. */
  unservable: number;
  /**
   * Entries still UNFETCHED after classification.
   *
   * A NON-ZERO VALUE IS A FINDING, not routine: it means CDX indexes a capture
   * that is text-distinct from its predecessor and we hold no row for it — a
   * genuine gap for `forensics:recover-captures`, not something this tool fills.
   */
  unfetched: number;
  unfetchedTimestamps: string[];
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

  if (opts.dryRun) {
    return {
      url: opts.url,
      dryRun: true,
      indexed: rows.length,
      held: captures.length,
      linked: linkable.length,
      // A dry run cannot say which of the unlinked are UNCHANGED and which are
      // UNSERVABLE without fetching, and it will not guess: reporting them as
      // one number is honest, reporting a split it did not measure is not.
      unchanged: 0,
      unservable: 0,
      unfetched: unlinked.length,
      unfetchedTimestamps: unlinked.map((r) => r.timestamp),
    };
  }

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

  // CLASSIFY THE UNLINKED BY MEASUREMENT, NOT BY ASSUMPTION.
  //
  // Leaving them UNFETCHED would write rows we already know are wrong: on this
  // corpus eleven of twelve were fetched successfully and dropped by the novelty
  // rule, so "we never looked" would be false about eleven of them and the
  // question "which entries have we never looked at" would return eleven false
  // positives. A note in a plan does not protect a query.
  //
  // The comparison is `noveltyAgainstPredecessor`, the SAME function
  // `recordCapture` uses. A second copy would be two definitions of "unchanged",
  // and any drift between them would mislabel entries rather than merely
  // duplicate code.
  let unchanged = 0;
  let unservable = 0;
  const stillUnfetched: string[] = [];

  for (const row of unlinked) {
    try {
      const { bytes, contentType, contentEncoding } = await fetchCaptureBytes(
        opts.url,
        row.timestamp,
      );
      const derived = deriveText(bytes, contentType, contentEncoding);
      const { unchanged: isUnchanged, preceding } = await noveltyAgainstPredecessor({
        trackedUrlId: tracked.id,
        capturedAt: waybackTimestampToDate(row.timestamp),
        textHash: derived.textHash,
      });
      if (isUnchanged && preceding) {
        await markCdxEntryUnchanged({
          trackedUrlId: tracked.id,
          waybackTimestamp: row.timestamp,
          digest: row.digest,
          // The verdict records WHAT IT WAS COMPUTED AGAINST, so a later
          // back-filled capture between the two makes the staleness detectable
          // rather than leaving a judgement that quietly stopped being true.
          comparedToSnapshotId: preceding.id,
        });
        unchanged++;
      } else {
        // Text-distinct and unheld: a real gap. Left UNFETCHED deliberately —
        // filling it is `forensics:recover-captures`, not this tool.
        stillUnfetched.push(row.timestamp);
      }
    } catch (err) {
      // ONLY a 404 is permanent. A timeout or 5xx stays UNFETCHED, because
      // collapsing them would make a durable gap indistinguishable from a
      // retryable one — the distinction UNSERVABLE exists to keep.
      if (err instanceof WaybackFetchError && err.status === 404) {
        await markCdxEntryUnservable({
          trackedUrlId: tracked.id,
          waybackTimestamp: row.timestamp,
          digest: row.digest,
        });
        unservable++;
      } else {
        stillUnfetched.push(row.timestamp);
      }
    }
  }

  return {
    url: opts.url,
    dryRun: false,
    indexed: rows.length,
    held: captures.length,
    linked: linkable.length,
    unchanged,
    unservable,
    unfetched: stillUnfetched.length,
    unfetchedTimestamps: stillUnfetched,
  };
}
