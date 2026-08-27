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

// ---------------------------------------------------------------------------
// Why these three queries are raw SQL, and must stay raw SQL.
//
// This tool exists to repair an environment whose schema LAGS the code — one
// whose captures predate 20260827050000_snapshot_raw_text, or that has received
// the columns but not yet been backfilled. HEAD's schema.prisma declares
// `rawText` NOT NULL (20260827120000_snapshot_document_required), so Prisma's
// generated filter type cannot express `rawText: null` at all: the typed query
// stops compiling the moment the constraint is declared.
//
// That is not an obstacle to work around, it is the situation stated plainly.
// A cross-schema repair tool is precisely the case where the ORM's model of the
// world is the wrong one, because the ORM models HEAD and this reads an older
// environment. Raw SQL is the honest instrument here rather than an escape
// hatch, and every value below is still parameterised by the tagged template.
//
// If the columns do not exist yet, these queries raise `column ... does not
// exist` and the run fails loudly. That is correct: the environment needs
// 20260827050000 before it can be backfilled, and a repair tool that reported
// success against a schema it could not read would be the exact failure that hid
// snapshot anchoring being broken for 83 rows.
// ---------------------------------------------------------------------------

interface PendingSnapshotRow {
  id: string;
  waybackTimestamp: string;
  url: string;
}

export async function countSnapshotsWithoutRawText(url?: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n
    FROM "UrlSnapshot" s
    JOIN "TrackedUrl" t ON t."id" = s."trackedUrlId"
    WHERE s."rawText" IS NULL
      AND (${url ?? null}::text IS NULL OR t."url" = ${url ?? null}::text)
  `;
  return Number(rows[0]?.n ?? 0);
}

export async function backfillSnapshotRawText(options: {
  dryRun: boolean;
  url?: string;
  limit?: number;
}): Promise<BackfillResult> {
  const { dryRun, url, limit } = options;

  // LIMIT NULL is unlimited in PostgreSQL, so the optional limit needs no branch.
  const pending = await prisma.$queryRaw<PendingSnapshotRow[]>`
    SELECT s."id", s."waybackTimestamp", t."url"
    FROM "UrlSnapshot" s
    JOIN "TrackedUrl" t ON t."id" = s."trackedUrlId"
    WHERE s."rawText" IS NULL
      AND (${url ?? null}::text IS NULL OR t."url" = ${url ?? null}::text)
    ORDER BY s."waybackTimestamp" ASC
    LIMIT ${limit ?? null}
  `;

  const missingAtStart = await countSnapshotsWithoutRawText(url);
  const failures: BackfillFailure[] = [];
  let filled = 0;

  for (const snap of pending) {
    let html: string;
    try {
      // A generous retry budget on purpose: this is an operator-run repair, not a
      // scan, so waiting is cheaper than a partial fill that has to be reasoned
      // about afterwards.
      html = await fetchCaptureHtml(snap.url, snap.waybackTimestamp, INTERACTIVE_RETRY);
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
      // `AND "rawText" IS NULL` is the fill-never-overwrite guard, enforced by the
      // database rather than by a check above it. A refetch that DISAGREES with an
      // already-stored document means the Archive's own copy changed — a finding to
      // surface, never something to silently overwrite. This statement cannot
      // produce that situation and cannot hide it.
      const written = await prisma.$executeRaw`
        UPDATE "UrlSnapshot"
        SET "rawText" = ${rawText}, "rawContentHash" = ${sha256(rawText)}
        WHERE "id" = ${snap.id} AND "rawText" IS NULL
      `;
      if (written === 0) continue; // filled concurrently — not this run's doing
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
