import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { extractRawText } from '../lib/archiveText';
import { fetchCaptureHtml, INTERACTIVE_RETRY, WaybackFetchError } from '../lib/archiveHttp';

// ---------------------------------------------------------------------------
// Backfill UrlSnapshot.rawText for rows created before the document was stored.
//
// Level 1 of docs/gf-factual-layer-rebuild-dev-plan.md. Step 1 added
// the columns nullable and made every NEW snapshot carry them; step 3 sets them
// NOT NULL. This is the only thing standing between those two, and until it has
// run in an environment, that environment's step-3 migration will fail — which
// is the intended behaviour, not a hazard: the deploy aborts and the previous
// version keeps serving rather than a NOT NULL constraint being forced onto rows
// that cannot satisfy it.
//
// FILLS, NEVER OVERWRITES. Every write is guarded by `rawText: null`. A refetch
// that DISAGREES with already-stored raw text means the Internet Archive's own
// copy of that capture changed, which is a finding to surface (Phase 2 persists
// the CDX digest so it can be detected) and never something to silently
// overwrite. This script cannot produce that situation and cannot hide it.
//
// Reads from the Archive, writes only to previously-null columns. It touches no
// hash that anything is anchored to: contentHash stays SHA-256(fullText), so no
// evidence identity moves and no anchor is invalidated.
// ---------------------------------------------------------------------------

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export interface BackfillFailure {
  snapshotId: string;
  waybackTimestamp: string;
  /** OFFLINE means the archive did not answer — distinct from a capture it does not hold. */
  reason: 'OFFLINE' | 'FETCH_FAILED' | 'EMPTY_DOCUMENT';
  detail: string;
}

export interface BackfillResult {
  /** Snapshots holding no document when the run began. */
  missingAtStart: number;
  filled: number;
  failures: BackfillFailure[];
  /** Still missing when the run ended — `missingAtStart` minus what was filled. */
  missingAtEnd: number;
  dryRun: boolean;
}

export async function countSnapshotsWithoutRawText(url?: string): Promise<number> {
  return prisma.urlSnapshot.count({
    where: { rawText: null, ...(url ? { trackedUrl: { url } } : {}) },
  });
}

export async function backfillSnapshotRawText(options: {
  dryRun: boolean;
  url?: string;
  limit?: number;
}): Promise<BackfillResult> {
  const { dryRun, url, limit } = options;

  const pending = await prisma.urlSnapshot.findMany({
    where: { rawText: null, ...(url ? { trackedUrl: { url } } : {}) },
    select: { id: true, waybackTimestamp: true, trackedUrl: { select: { url: true } } },
    orderBy: { waybackTimestamp: 'asc' },
    ...(limit ? { take: limit } : {}),
  });

  const missingAtStart = await countSnapshotsWithoutRawText(url);
  const failures: BackfillFailure[] = [];
  let filled = 0;

  for (const snap of pending) {
    let html: string;
    try {
      // A generous retry budget on purpose: this is an operator-run repair, not a
      // scan, so waiting is cheaper than a partial fill that has to be reasoned
      // about afterwards.
      html = await fetchCaptureHtml(snap.trackedUrl.url, snap.waybackTimestamp, INTERACTIVE_RETRY);
    } catch (err) {
      failures.push({
        snapshotId: snap.id,
        waybackTimestamp: snap.waybackTimestamp,
        // NOT isWaybackOffline(): that predicate matches a raw axios 503, and by
        // the time an error reaches here fetchCaptureHtml has already wrapped it,
        // so the outage would be misreported as an ordinary fetch failure. The
        // distinction matters — an outage means "run this again", a fetch failure
        // means "this capture needs looking at".
        reason: err instanceof WaybackFetchError && err.offline ? 'OFFLINE' : 'FETCH_FAILED',
        detail: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const rawText = extractRawText(html);
    if (rawText.trim().length === 0) {
      // Storing an empty document would satisfy the NOT NULL constraint while
      // meaning the opposite of what the column exists to mean. Refuse it: a
      // capture whose document reads empty is a finding about the fetch or the
      // extractor, and it must stay visible as still-missing.
      failures.push({
        snapshotId: snap.id,
        waybackTimestamp: snap.waybackTimestamp,
        reason: 'EMPTY_DOCUMENT',
        detail: 'The fetched capture produced no text; refusing to store an empty document.',
      });
      continue;
    }

    if (!dryRun) {
      const written = await prisma.urlSnapshot.updateMany({
        where: { id: snap.id, rawText: null },
        data: { rawText, rawContentHash: sha256(rawText) },
      });
      if (written.count === 0) continue; // filled concurrently — not this run's doing
    }
    filled += 1;
  }

  return {
    missingAtStart,
    filled,
    failures,
    missingAtEnd: dryRun ? missingAtStart : await countSnapshotsWithoutRawText(url),
    dryRun,
  };
}
