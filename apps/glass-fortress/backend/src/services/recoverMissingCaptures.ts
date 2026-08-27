import { prisma } from '../lib/prisma';
import { CaptureProvenance } from '@prisma/client';
import { recordCapture, waybackTimestampToDate, type DocumentComparison } from './recordCapture';
import { extractArticleText } from '../lib/archiveText';
import { decodeDocument } from '../lib/captureDocument';
import type { SnapshotAnchorOutcome } from './anchorSnapshots';
import axios from 'axios';
import {
  CDX_MAX_RETRIES,
  CDX_TIMEOUT_MS,
  CDX_USER_AGENT,
  fetchCaptureBytes,
  rawCaptureUrl,
  sleep,
  viewerCaptureUrl,
  withRetry,
} from '../lib/archiveHttp';

/**
 * Fetch archived captures the Archive holds and this platform does not.
 *
 * INSTRUMENT 1 of Level 1's closing step. It exists because the ordinary scan
 * cannot do this job, for two separate reasons that were measured rather than
 * assumed (2026-08-27):
 *
 *   1. A rescan currently fetches NOTHING and reports success. `runFullScan`
 *      asks `computeNextFromDate` whether more batches exist; that returns null
 *      when the last batch held fewer than MAX_SNAPSHOTS rows, so staging's
 *      COMPLETED job (totalSnapshots 41) short-circuits to COMPLETED without a
 *      single request to the Archive.
 *
 *   2. Forcing a rescan would DUPLICATE every existing diff. `WaybackScraper`
 *      writes diffs with `create` across six call sites and `UrlVersionDiff`
 *      has no unique constraint on the snapshot pair it spans, so a from-scratch
 *      run adds ~81 duplicates beside the originals — corrupting the layer the
 *      repair was meant to fix, and feeding duplicated candidates into
 *      trajectory detection.
 *
 * So this touches the CAPTURE LAYER ONLY. It creates no diffs, classifies
 * nothing, calls no LLM, and spends nothing on classification. Re-pairing the
 * diff layer is Level 5's opening act, deliberately: diffs created now under the
 * current unverified classifier would be paid for twice once Level 5's
 * write-time verification lands.
 *
 * KNOWN AND RECORDED CONSEQUENCE: the moment these captures land, 7 existing
 * diffs become stale — they claim a direct transition between captures that are
 * no longer consecutive. They are left unmarked for that interval, which is
 * acceptable only because it is written down (plan §Level 1). It is safe because
 * it was CHECKED rather than assumed: none of the 7 is legally significant and
 * none backs an evidence record, so no anchored hash and no `fileHash` is
 * touched. Had one been significant this would have been Level 7 work.
 *
 * Reads from the Internet Archive; writes only captures that are missing.
 * Never overwrites a stored document. Idempotent and resumable.
 */

/** One capture's outcome, reported individually rather than only in aggregate. */
export interface RecoveredCapture {
  waybackTimestamp: string;
  digest: string;
  /** Absent on a dry run, where nothing is written. */
  outcome?: 'CREATED' | 'UNCHANGED' | 'EXISTS';
  /** Whether the refetched payload matched the stored one — see DocumentComparison. */
  documentComparison?: DocumentComparison;
  /**
   * How anchoring resolved.
   *
   * Every recovered capture here is byte-identical to one already stored — that
   * is what made it a REVERT — so each should reach `anchorOneSnapshot`'s twin
   * path and COPY an existing transaction rather than register a duplicate.
   * That branch is the reason production holds 71 rows with a null
   * `onChainTxHash`, and this is its first exercise against real data, so the
   * outcome is reported per capture instead of summarised as "anchored".
   */
  anchoring?: SnapshotAnchorOutcome['kind'] | 'ATTEMPT_FAILED' | 'NOT_ATTEMPTED';
  error?: string;
}

export interface RecoveryReport {
  url: string;
  dryRun: boolean;
  /** Distinct captures the CDX index holds for this URL. */
  cdxRows: number;
  /** Captures already stored before this run. */
  storedBefore: number;
  /** Captures CDX holds that were not stored. */
  missing: number;
  recovered: RecoveredCapture[];
  storedAfter: number;
  /** Captures still missing at the end — a fetch failure, not a design gap. */
  stillMissing: number;
}

interface CdxRow {
  timestamp: string;
  digest: string;
}

/**
 * Every capture CDX holds for this URL, in one query, with NO client-side dedup.
 *
 * Deliberately not reusing `WaybackScraper.getSnapshotsList`: that paginates at
 * MAX_SNAPSHOTS to bound a scan's LLM spend, and pagination is the mechanism
 * that made the old rule's answer depend on where a batch boundary fell. This
 * fetches the whole index at once because no classification follows it.
 *
 * `collapse=digest` is kept, but NOT because it is lossless — it is not.
 * Consecutive-collapse discards exactly the observations that prove CONTINUITY:
 * "at T2 the page still said A". Those are real observations by an independent
 * party, and dropping them is a loss.
 *
 * It is kept because it changes nothing HERE. The captures being recovered are
 * non-consecutive reverts, which collapse never touches, and an unchanged
 * observation that survived CDX would be dropped at the door anyway by
 * recordCapture's novelty rule. Asking for them would cost a much larger index
 * and recover none of them.
 *
 * The consequence is bigger than this tool and is filed at Level 1 as an open
 * question: between the two discards, the platform cannot prove a page was
 * UNCHANGED over an interval. The strongest statement available is "we hold no
 * capture in between" — the weaker claim list_captures already warns about.
 */
export async function fetchAllCdxRows(url: string): Promise<CdxRow[]> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must use http or https protocol.');
  }

  const cdxUrl =
    `http://web.archive.org/cdx/search/cdx` +
    `?url=${encodeURIComponent(url)}` +
    `&output=json` +
    `&fl=timestamp,digest` +
    `&collapse=digest`;

  const response = await withRetry(
    () =>
      axios.get<unknown[][]>(cdxUrl, {
        timeout: CDX_TIMEOUT_MS,
        headers: { 'User-Agent': CDX_USER_AGENT },
      }),
    { maxRetries: CDX_MAX_RETRIES },
  );

  const rows = response.data;
  if (!Array.isArray(rows) || rows.length < 2) return [];

  // Row 0 is the header ["timestamp","digest"].
  const out: CdxRow[] = [];
  for (const row of rows.slice(1) as string[][]) {
    const [timestamp, digest] = row;
    if (!timestamp || !digest) continue;
    if (!/^\d{14}$/.test(timestamp)) continue;
    out.push({ timestamp, digest });
  }
  out.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  return out;
}

/** Milliseconds between Archive requests — respects rate limits. */
const FETCH_DELAY_MS = 1_500;

export async function recoverMissingCaptures(opts: {
  url: string;
  dryRun: boolean;
  limit?: number;
}): Promise<RecoveryReport> {
  const tracked = await prisma.trackedUrl.findUnique({
    where: { url: opts.url },
    select: { id: true },
  });
  if (!tracked) throw new Error(`No tracked URL found for: ${opts.url}`);

  const cdx = await fetchAllCdxRows(opts.url);

  const stored = new Set(
    (
      await prisma.urlSnapshot.findMany({
        where: { trackedUrlId: tracked.id, provenance: CaptureProvenance.WAYBACK },
        select: { waybackTimestamp: true },
      })
    )
      .map((r) => r.waybackTimestamp)
      .filter((t): t is string => t !== null),
  );

  const storedBefore = stored.size;
  let missing = cdx.filter((row) => !stored.has(row.timestamp));
  const missingTotal = missing.length;
  if (opts.limit !== undefined) missing = missing.slice(0, opts.limit);

  const recovered: RecoveredCapture[] = [];

  for (const row of missing) {
    if (opts.dryRun) {
      recovered.push({ waybackTimestamp: row.timestamp, digest: row.digest });
      continue;
    }

    try {
      const { bytes, contentType } = await fetchCaptureBytes(opts.url, row.timestamp);
      const extraction = extractArticleText(
        decodeDocument(bytes, contentType),
        rawCaptureUrl(row.timestamp, opts.url),
      );

      const result = await recordCapture({
        trackedUrlId: tracked.id,
        provenance: CaptureProvenance.WAYBACK,
        capturedAt: waybackTimestampToDate(row.timestamp),
        waybackTimestamp: row.timestamp,
        sourceUrl: viewerCaptureUrl(row.timestamp, opts.url),
        document: bytes,
        documentContentType: contentType,
        extraction,
      });

      // Awaited HERE and nowhere else. The scanner leaves this promise alone so
      // a chain hiccup cannot fail a scan; a maintenance run wants the answer,
      // and it is the only way to observe which branch of anchorOneSnapshot ran.
      let anchoring: RecoveredCapture['anchoring'] = 'NOT_ATTEMPTED';
      if (result.anchoring) {
        const outcome = await result.anchoring;
        anchoring = outcome === null ? 'ATTEMPT_FAILED' : outcome.kind;
      }

      recovered.push({
        waybackTimestamp: row.timestamp,
        digest: row.digest,
        outcome: result.outcome,
        documentComparison: result.documentComparison,
        anchoring,
      });
    } catch (err) {
      // One unreachable capture must not abandon the rest — the Archive is
      // intermittently unavailable and this is resumable by design.
      recovered.push({
        waybackTimestamp: row.timestamp,
        digest: row.digest,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await sleep(FETCH_DELAY_MS);
  }

  const storedAfter = await prisma.urlSnapshot.count({
    where: { trackedUrlId: tracked.id, provenance: CaptureProvenance.WAYBACK },
  });

  return {
    url: opts.url,
    dryRun: opts.dryRun,
    cdxRows: cdx.length,
    storedBefore,
    missing: missingTotal,
    recovered,
    storedAfter,
    stillMissing: opts.dryRun ? missingTotal : cdx.length - storedAfter,
  };
}
