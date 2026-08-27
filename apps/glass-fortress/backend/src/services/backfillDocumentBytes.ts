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
  /**
   * The derived text changed relative to what was stored.
   *
   * NOT NECESSARILY A REGRESSION, and the Content-Type below is what decides.
   * The stored text came from axios `responseType: 'text'`, which in Node
   * defaults to UTF-8 and does NOT honour the charset a response declares. This
   * page is Hebrew: if the Archive served `windows-1255`, the STORED text is
   * mojibake and the recomputation — which decodes per the declared charset — is
   * the correct one. A change would then be a repair.
   */
  textChanged?: boolean;
  /** The Content-Type header verbatim. Report it, never just the diff count. */
  contentType?: string | null;
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

// ---------------------------------------------------------------------------
// Why these queries are raw SQL, and must stay raw SQL.
//
// This tool repairs an environment whose schema LAGS the code — one that has
// received 20260827170000 (the columns) but not yet been backfilled. HEAD's
// schema.prisma declares `document` and `documentHash` NOT NULL
// (20260827180000), so Prisma's generated filter type cannot express
// `documentHash: null` at all: the typed query stops compiling the moment the
// constraint is declared.
//
// That is not an obstacle to work around, it is the situation stated plainly. A
// cross-schema repair tool is precisely the case where the ORM's model of the
// world is the wrong one, because the ORM models HEAD and this reads an older
// environment. Raw SQL is the honest instrument here rather than an escape
// hatch, and every value below is still parameterised by the tagged template.
//
// If the columns do not exist yet these queries raise `column ... does not
// exist` and the run fails loudly, which is correct: the environment needs
// 20260827170000 first, and a repair tool that reported success against a schema
// it could not read would be the exact failure that hid snapshot anchoring being
// broken for 83 rows.
// ---------------------------------------------------------------------------

interface PendingRow {
  id: string;
  waybackTimestamp: string | null;
  url: string;
  text: string;
}

export async function countSnapshotsWithoutDocument(url?: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n
    FROM "UrlSnapshot" s
    JOIN "TrackedUrl" t ON t."id" = s."trackedUrlId"
    WHERE s."documentHash" IS NULL
      AND (${url ?? null}::text IS NULL OR t."url" = ${url ?? null}::text)
  `;
  return Number(rows[0]?.n ?? 0);
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

  // LIMIT NULL is unlimited in PostgreSQL, so the optional limit needs no branch.
  const targets = await prisma.$queryRaw<PendingRow[]>`
    SELECT s."id", s."waybackTimestamp", s."text", t."url"
    FROM "UrlSnapshot" s
    JOIN "TrackedUrl" t ON t."id" = s."trackedUrlId"
    WHERE s."documentHash" IS NULL
      AND (${opts.url ?? null}::text IS NULL OR t."url" = ${opts.url ?? null}::text)
    ORDER BY s."capturedAt" ASC
    LIMIT ${opts.limit ?? null}
  `;

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
        snap.url,
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
      const updated = await prisma.$executeRaw`
        UPDATE "UrlSnapshot"
        SET "document" = ${bytes},
            "documentHash" = ${documentHash},
            "documentContentType" = ${contentType},
            "text" = ${derived.text},
            "textHash" = ${derived.textHash},
            "textExtractionVersion" = ${derived.textExtractionVersion}
        WHERE "id" = ${snap.id} AND "documentHash" IS NULL
      `;

      if (updated === 1) {
        filled++;
        if (changed) textChanged++;
        rows.push({
          snapshotId: snap.id,
          waybackTimestamp: snap.waybackTimestamp,
          bytes: bytes.length,
          contentType,
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
