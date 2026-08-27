import { prisma } from '../lib/prisma';
import { fetchCaptureBytes } from '../lib/archiveHttp';
import { deriveText, sha256Bytes } from '../lib/captureDocument';

/**
 * Store the archived PAYLOAD for captures that hold only text derived from it.
 *
 * The second step of Level 1's reopening, and the only thing standing between
 * "the payload column exists" and "the payload column is NOT NULL". Until this
 * has run in an environment, that environment's enforcing migration
 * (20260827180000) fails and the deploy aborts with the previous version still
 * serving — the ordering guarantee working, not an accident.
 *
 * It replaces `backfillSnapshotRawText`, which filled the column that turned out
 * to be the problem: `rawText` was `normaliseText(htmlToText(html))`, text
 * stripped of markup, stored under the name of the document. That script is
 * removed rather than left beside this one — two backfills for one invariant is
 * how the scan and the reclassify paths drifted apart under a single version
 * string.
 *
 * FILLS, NEVER OVERWRITES THE PAYLOAD. Every write is guarded by
 * `documentHash IS NULL`. A refetch that disagrees with a payload already stored
 * means the Archive's own copy changed — a finding, not something to paper over.
 *
 * IT DOES recompute `text`, because text is a cached derivation of the payload
 * and the two must agree. A recomputation that DIFFERS from the stored text is
 * reported per row: it means the decoded-string path and the bytes path disagree
 * about this capture, which is worth knowing rather than silently resolving.
 *
 * Idempotent and resumable — run it again after an interruption or an archive
 * outage and it picks up exactly what is still missing.
 */

export interface BackfillRow {
  snapshotId: string;
  waybackTimestamp: string | null;
  /** The derived text changed relative to what was stored — a decoding difference. */
  textChanged?: boolean;
  bytes?: number;
  error?: string;
}

export interface BackfillReport {
  dryRun: boolean;
  missingBefore: number;
  filled: number;
  textChanged: number;
  failures: BackfillRow[];
  rows: BackfillRow[];
  missingAtEnd: number;
}

export async function countSnapshotsWithoutDocument(url?: string): Promise<number> {
  return prisma.urlSnapshot.count({
    where: {
      documentHash: null,
      ...(url ? { trackedUrl: { url } } : {}),
    },
  });
}

/** Milliseconds between Archive requests — respects rate limits. */
const FETCH_DELAY_MS = 1_500;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function backfillDocumentBytes(opts: {
  dryRun: boolean;
  url?: string;
  limit?: number;
}): Promise<BackfillReport> {
  const missingBefore = await countSnapshotsWithoutDocument(opts.url);

  const targets = await prisma.urlSnapshot.findMany({
    where: {
      documentHash: null,
      ...(opts.url ? { trackedUrl: { url: opts.url } } : {}),
    },
    select: {
      id: true,
      waybackTimestamp: true,
      text: true,
      trackedUrl: { select: { url: true } },
    },
    orderBy: { capturedAt: 'asc' },
    ...(opts.limit !== undefined ? { take: opts.limit } : {}),
  });

  const rows: BackfillRow[] = [];
  const failures: BackfillRow[] = [];
  let filled = 0;
  let textChanged = 0;

  for (const snap of targets) {
    if (snap.waybackTimestamp === null) {
      // Only archived captures can be refetched from the Archive. A DIRECT or
      // ASSERTED capture without a payload is a different problem and is not
      // silently skipped — it is reported.
      const row: BackfillRow = {
        snapshotId: snap.id,
        waybackTimestamp: null,
        error: 'not an archived capture — cannot refetch from the Archive',
      };
      rows.push(row);
      failures.push(row);
      continue;
    }

    if (opts.dryRun) {
      rows.push({ snapshotId: snap.id, waybackTimestamp: snap.waybackTimestamp });
      continue;
    }

    try {
      const { bytes, contentType } = await fetchCaptureBytes(
        snap.trackedUrl.url,
        snap.waybackTimestamp,
      );
      if (bytes.length === 0) {
        throw new Error('archive returned an empty payload');
      }
      const documentHash = sha256Bytes(bytes);
      const derived = deriveText(bytes, contentType);
      const changed = derived.text !== snap.text;

      // `AND "documentHash" IS NULL` is the fill-never-overwrite guard, enforced
      // by the database rather than by having checked a moment earlier.
      const updated = await prisma.urlSnapshot.updateMany({
        where: { id: snap.id, documentHash: null },
        data: {
          document: bytes,
          documentHash,
          documentContentType: contentType,
          text: derived.text,
          textHash: derived.textHash,
          textExtractionVersion: derived.textExtractionVersion,
        },
      });

      if (updated.count === 1) {
        filled++;
        if (changed) textChanged++;
        rows.push({
          snapshotId: snap.id,
          waybackTimestamp: snap.waybackTimestamp,
          bytes: bytes.length,
          textChanged: changed,
        });
      } else {
        // Another writer filled it between the read and the write. Not an error;
        // the payload is stored either way.
        rows.push({ snapshotId: snap.id, waybackTimestamp: snap.waybackTimestamp });
      }
    } catch (err) {
      const row: BackfillRow = {
        snapshotId: snap.id,
        waybackTimestamp: snap.waybackTimestamp,
        error: err instanceof Error ? err.message : String(err),
      };
      rows.push(row);
      failures.push(row);
    }

    await sleep(FETCH_DELAY_MS);
  }

  return {
    dryRun: opts.dryRun,
    missingBefore,
    filled,
    textChanged,
    failures,
    rows,
    missingAtEnd: await countSnapshotsWithoutDocument(opts.url),
  };
}
