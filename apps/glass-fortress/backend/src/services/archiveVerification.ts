import axios from 'axios';
import { prisma } from '../lib/prisma';
import { CaptureProvenance } from '@prisma/client';
import {
  CDX_TIMEOUT_MS,
  CDX_USER_AGENT,
  fetchCaptureHtml,
  INTERACTIVE_RETRY,
  viewerCaptureUrl,
  rawCaptureUrl,
  WaybackFetchError,
  withRetry,
} from '../lib/archiveHttp';
import {
  extractArticleText,
  extractRawText,
  normaliseForPresence,
  timestampToDate,
} from '../lib/archiveText';

// ---------------------------------------------------------------------------
// Checking a claim against the archive.
//
// docs/gf-verification-tools-dev-plan.md. The platform had three tools for
// ARGUING (framing, diff debate, publication rationale) and none for CHECKING.
// Every factual error caught in the first real thesis walk was caught by
// re-deriving a number from primary data through an ad-hoc shell; this module
// is that shell, made available to anyone.
//
// Two rules govern everything below, and both were learned from specific
// failures:
//
//   1. Go to the RAW archived HTML, never to UrlSnapshot.fullText. That column
//      is a Readability extraction which, on capture 20220905111109, dropped
//      the very sentence a thesis then claimed had been added the next day. A
//      verification tool built on it would have CONFIRMED the false claim.
//
//   2. "Could not check" is never "checked and found nothing." Every failure
//      here is a named outcome carried in the result, not an exception and
//      never a `false`.
//
// Nothing in this module judges an inference, and nothing blocks. These are
// instruments; the publication gate is where blocking lives.
// ---------------------------------------------------------------------------

/**
 * Hard cap on captures pulled from one CDX query.
 *
 * A page with a decade of history can have tens of thousands. The cap keeps a
 * single call bounded; `truncated` in the result says when it bit, because a
 * silently shortened capture list would make "no capture exists between these
 * dates" a lie of exactly the kind these tools exist to catch.
 */
export const CAPTURE_INDEX_LIMIT = 2_000;

/**
 * Most captures a single `verify_claim_text` call will download when the caller
 * passes a DATE rather than an exact timestamp.
 *
 * A heavily archived page can have dozens of captures in one day, and each is a
 * real page fetch from a free service. When the cap bites the result says so
 * and names how many were left — an answer computed over a silently truncated
 * set is the failure mode this whole toolset exists to prevent.
 */
export const MAX_CAPTURES_PER_DATE = 10;

// ---------------------------------------------------------------------------
// The capture index
// ---------------------------------------------------------------------------

export interface ArchiveCapture {
  /** Wayback timestamp, YYYYMMDDHHMMSS */
  waybackTimestamp: string;
  /** YYYY-MM-DD */
  date: string;
  /** Content digest CDX reports — equal digests mean byte-identical captures. */
  digest: string | null;
  /** HTTP status the archive recorded at capture time ('200', '302', ...). */
  statusCode: string | null;
  /** Wayback viewer URL — what a reader opens to check this themselves. */
  snapshotUrl: string;
}

export type CaptureIndex =
  | { available: true; captures: ArchiveCapture[]; truncated: boolean }
  | { available: false; reason: string; offline: boolean };

/** YYYY-MM-DD → YYYYMMDD, or null when the input is not that shape. */
function compactDate(date: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.replace(/-/g, '') : null;
}

/**
 * Every capture the archive holds for a URL, optionally within a date range.
 *
 * Deliberately does NOT pass `collapse=digest`, unlike the scanner's own CDX
 * query. The scanner wants content-changed captures because it is diffing; a
 * researcher asking "is there a capture between the publication and the
 * change?" needs every capture, including the ones whose content was identical
 * — an unchanged capture is exactly the evidence that the page had NOT yet
 * changed on that date.
 */
export async function fetchCaptureIndex(
  url: string,
  opts: { from?: string; to?: string; limit?: number } = {},
): Promise<CaptureIndex> {
  const limit = opts.limit ?? CAPTURE_INDEX_LIMIT;
  const from = opts.from ? compactDate(opts.from) : null;
  const to = opts.to ? compactDate(opts.to) : null;

  const cdxUrl =
    `http://web.archive.org/cdx/search/cdx` +
    `?url=${encodeURIComponent(url)}` +
    `&output=json` +
    `&fl=timestamp,digest,statuscode` +
    `&limit=${String(limit + 1)}` + // one extra row so truncation is detected, not guessed
    (from ? `&from=${from}000000` : '') +
    (to ? `&to=${to}235959` : '');

  let rows: unknown[][];
  try {
    const response = await withRetry(
      () =>
        axios.get<unknown[][]>(cdxUrl, {
          timeout: CDX_TIMEOUT_MS,
          headers: { 'User-Agent': CDX_USER_AGENT },
        }),
      INTERACTIVE_RETRY,
    );
    rows = response.data;
  } catch (err) {
    return {
      available: false,
      reason:
        err instanceof Error ? err.message : `CDX query failed for ${url}`,
      offline: axios.isAxiosError(err) && err.response?.status === 503,
    };
  }

  // A URL the archive has never seen returns an empty body rather than an
  // error. That is a real answer — no captures — not an unavailable state.
  if (!Array.isArray(rows) || rows.length < 2) {
    return { available: true, captures: [], truncated: false };
  }

  // Row 0 is the header. Cells are typed as possibly-absent because CDX is a
  // third-party API and a short row is a real possibility — asserting string[][]
  // would type away exactly the case worth guarding.
  const dataRows = rows.slice(1) as (string | undefined)[][];
  const truncated = dataRows.length > limit;

  const captures: ArchiveCapture[] = [];
  for (const row of dataRows.slice(0, limit)) {
    // Indexed rather than destructured: CDX is a third-party API and a short
    // row is a real possibility, which positional destructuring would type as
    // `string` while handing back `undefined`.
    const timestamp = row[0];
    if (timestamp === undefined || !/^\d{14}$/.test(timestamp)) continue;
    captures.push({
      waybackTimestamp: timestamp,
      date: timestampToDate(timestamp),
      digest: row[1] ?? null,
      statusCode: row[2] ?? null,
      snapshotUrl: viewerCaptureUrl(timestamp, url),
    });
  }

  // CDX defaults to ascending order, but that is an assumption about a
  // third-party API rather than a guarantee — and every interval answer below
  // is computed from adjacency in this list.
  captures.sort((a, b) => a.waybackTimestamp.localeCompare(b.waybackTimestamp));

  return { available: true, captures, truncated };
}

// ---------------------------------------------------------------------------
// list_captures
// ---------------------------------------------------------------------------

export interface ListedCapture extends ArchiveCapture {
  /**
   * True when this platform holds the archived text for this capture.
   *
   * The distinction matters and is not cosmetic: the vault holds 83 captures
   * for the corona page while the archive holds more, so an interval computed
   * from stored captures alone is WIDER than the truth. A researcher reading
   * "nothing changed between these two stored snapshots" may be reading over
   * an archive capture nobody scanned.
   */
  storedLocally: boolean;
  /** Set when stored — the platform's SHA-256 over its extracted text. */
  storedContentHash?: string;
  /** Set when stored — the anchoring transaction, or null if never anchored. */
  storedOnChainTxHash?: string | null;
}

export type ListCapturesResult =
  | { status: 'NOT_TRACKED'; url: string; message: string }
  | {
      status: 'ARCHIVE_UNAVAILABLE';
      url: string;
      reason: string;
      offline: boolean;
      message: string;
      storedCaptures: ListedCapture[];
    }
  | {
      status: 'OK';
      url: string;
      range: { from: string | null; to: string | null };
      truncated: boolean;
      counts: {
        inArchive: number;
        storedLocally: number;
        /** Captures this platform holds that the archive index did not return. */
        storedNotInArchiveIndex: number;
        /**
         * Captures this platform holds that the Archive does NOT hold at all.
         *
         * Distinct from `storedNotInArchiveIndex`, which counts ARCHIVED captures
         * the index did not return — a disagreement between two sources about the
         * same page. This counts captures that were never archived, so no
         * disagreement is possible and none should be reported.
         */
        notArchived: number;
      };
      captures: ListedCapture[];
      /**
       * Captures held but never archived, in their own section.
       *
       * A PARTITION, NOT AN EXCLUSION. Cross-checking these against CDX would
       * report each as a gap in the Archive — a fabricated finding from the tool
       * built to detect fabricated findings — so they are correctly kept out of
       * `captures`. But dropping them from the answer entirely makes
       * `list_captures` UNDER-REPORT what the platform holds, which is the same
       * failure in the other direction.
       *
       * The distinction a reader needs is re-checkability: everything in
       * `captures` can be verified by a stranger against a public archive, and
       * nothing here can.
       */
      notArchived: NotArchivedCapture[];
    };

/** A capture this platform holds that the Internet Archive does not. */
export interface NotArchivedCapture {
  capturedAt: string;
  provenance: string;
  /**
   * Always false, and stated rather than implied.
   *
   * A reader scanning two lists needs the difference between them to be on the
   * row, not inferred from which array it came out of.
   */
  independentlyRecheckable: false;
}

interface StoredSnapshotRow {
  waybackTimestamp: string;
  snapshotDate: string;
  snapshotUrl: string;
  contentHash: string;
  onChainTxHash: string | null;
}

async function loadStoredSnapshots(
  trackedUrlId: string,
  range: { from?: string; to?: string },
): Promise<StoredSnapshotRow[]> {
  const rows = await prisma.urlSnapshot.findMany({
    where: {
      trackedUrlId,
      // Archived captures ONLY, and this is a correctness constraint rather than
      // a filter of convenience.
      //
      // These rows are cross-checked against the CDX index to find captures the
      // Archive holds that this platform does not. A DIRECT capture is by
      // definition absent from CDX, so including one here would report it as a
      // gap in the Archive — a fabricated finding, emitted by the tool built to
      // detect fabricated findings.
      //
      // LEVEL 2 OWES A PARTITION, NOT A WIDENING: list_captures must report
      // non-archived captures in their own section rather than folding them in
      // here. Today the distinction costs nothing to defer, because every stored
      // capture is WAYBACK.
      provenance: CaptureProvenance.WAYBACK,
      waybackTimestamp: { not: null },
      ...(range.from || range.to
        ? {
            snapshotDate: {
              ...(range.from ? { gte: range.from } : {}),
              ...(range.to ? { lte: range.to } : {}),
            },
          }
        : {}),
    },
    select: {
      waybackTimestamp: true,
      snapshotDate: true,
      snapshotUrl: true,
      contentHash: true,
      onChainTxHash: true,
    },
    orderBy: { waybackTimestamp: 'asc' },
  });
  return rows.map((row) => {
    if (row.waybackTimestamp === null) {
      // Excluded by the where clause above, so reaching this means the QUERY is
      // wrong, not the data. Throwing says so; dropping the row would quietly
      // shrink the comparison set and turn a bug into a missing capture.
      throw new Error(
        `loadStoredSnapshots: archived capture ${row.snapshotUrl} has no waybackTimestamp.`,
      );
    }
    return { ...row, waybackTimestamp: row.waybackTimestamp };
  });
}

/**
 * What captures exist for this page, and which of them this platform holds.
 *
 * Nothing exposed this before. `get_forensic_timeline` returns diffs;
 * `get_claim_trajectories` returns `snapshotsExamined` as a bare count. Neither
 * can answer "is there a capture between the publication and the change?" —
 * the question the central temporal claim of the first real thesis turned on.
 */
export async function listCaptures(
  url: string,
  range: { from?: string; to?: string } = {},
): Promise<ListCapturesResult> {
  const tracked = await prisma.trackedUrl.findFirst({
    where: { url },
    select: { id: true },
  });
  if (!tracked) {
    return {
      status: 'NOT_TRACKED',
      url,
      message:
        'This URL is not tracked, so nothing can be said about which captures are stored. ' +
        'Run start_forensic_scan on it first. This is NOT a statement that the archive holds no captures.',
    };
  }

  const [stored, index] = await Promise.all([
    loadStoredSnapshots(tracked.id, range),
    fetchCaptureIndex(url, range),
  ]);

  const storedByTimestamp = new Map(stored.map((s) => [s.waybackTimestamp, s]));

  if (!index.available) {
    return {
      status: 'ARCHIVE_UNAVAILABLE',
      url,
      reason: index.reason,
      offline: index.offline,
      message:
        'The Internet Archive did not answer, so the capture list below is only what this platform ' +
        'has STORED. It is not the archive’s full list and must not be read as one: any interval ' +
        'computed from it is wider than the truth.',
      storedCaptures: stored.map((s) => ({
        waybackTimestamp: s.waybackTimestamp,
        date: s.snapshotDate,
        digest: null,
        statusCode: null,
        snapshotUrl: s.snapshotUrl,
        storedLocally: true,
        storedContentHash: s.contentHash,
        storedOnChainTxHash: s.onChainTxHash,
      })),
    };
  }

  const seen = new Set<string>();
  const captures: ListedCapture[] = index.captures.map((c) => {
    seen.add(c.waybackTimestamp);
    const local = storedByTimestamp.get(c.waybackTimestamp);
    return {
      ...c,
      storedLocally: local !== undefined,
      ...(local
        ? { storedContentHash: local.contentHash, storedOnChainTxHash: local.onChainTxHash }
        : {}),
    };
  });

  // A capture this platform stored but the archive index did not return.
  // Reported rather than dropped: it means the two sources disagree about the
  // page's history, which is itself a finding.
  const storedOnly = stored
    .filter((s) => !seen.has(s.waybackTimestamp))
    .map((s) => ({
      waybackTimestamp: s.waybackTimestamp,
      date: s.snapshotDate,
      digest: null,
      statusCode: null,
      snapshotUrl: s.snapshotUrl,
      storedLocally: true,
      storedContentHash: s.contentHash,
      storedOnChainTxHash: s.onChainTxHash,
    }));

  const all = [...captures, ...storedOnly].sort((a, b) =>
    a.waybackTimestamp.localeCompare(b.waybackTimestamp),
  );

  // The partition the archived-only scoping above owes. Built now, while the
  // answer is always empty, for the same reason the UNCHANGED status landed
  // before the backfill wrote a row: the first DIRECT capture Level 2 Phase B
  // creates must appear in this tool on the day it is created, not the day
  // somebody notices it is missing.
  const notArchivedRows = await prisma.urlSnapshot.findMany({
    where: {
      trackedUrlId: tracked.id,
      NOT: { provenance: CaptureProvenance.WAYBACK },
      // Same `snapshotDate` bound the archived query uses, so the two sections of
      // one answer cover the same interval.
      ...(range.from || range.to
        ? {
            snapshotDate: {
              ...(range.from ? { gte: range.from } : {}),
              ...(range.to ? { lte: range.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { capturedAt: 'asc' },
    select: { capturedAt: true, provenance: true },
  });
  const notArchived: NotArchivedCapture[] = notArchivedRows.map((r) => ({
    capturedAt: r.capturedAt.toISOString(),
    provenance: r.provenance,
    independentlyRecheckable: false,
  }));

  return {
    status: 'OK',
    url,
    range: { from: range.from ?? null, to: range.to ?? null },
    truncated: index.truncated,
    counts: {
      inArchive: index.captures.length,
      storedLocally: captures.filter((c) => c.storedLocally).length + storedOnly.length,
      storedNotInArchiveIndex: storedOnly.length,
      notArchived: notArchived.length,
    },
    captures: all,
    notArchived,
  };
}

// ---------------------------------------------------------------------------
// verify_claim_text
// ---------------------------------------------------------------------------

export type CaptureCheckOutcome =
  | 'CHECKED'
  | 'CAPTURE_NOT_IN_ARCHIVE'
  | 'FETCH_FAILED';

export interface CaptureCheck {
  waybackTimestamp: string;
  date: string;
  snapshotUrl: string;
  /** The `id_` URL actually fetched — reproducible by hand with curl. */
  rawUrl: string;
  outcome: CaptureCheckOutcome;
  /** Set when outcome is not CHECKED. */
  reason?: string;
  /** Present in the WHOLE archived document. The authoritative answer. */
  presentInRawArchive?: boolean;
  /** Present in Readability's article — what the scan pipeline would have seen. */
  presentInPlatformExtraction?: boolean;
  /**
   * Present in the text this platform actually STORED for this capture, or
   * null when this capture was never scanned. Distinct from the line above:
   * that one re-runs the extractor now, this one reads what was banked then,
   * so the two disagreeing means the stored text is stale.
   */
  presentInStoredSnapshot?: boolean | null;
  /**
   * The finding this tool exists for. True when the raw page and the
   * platform's extraction disagree about the phrase — the pipeline is blind to
   * something the page said.
   */
  extractionDivergence?: boolean;
  /** How much of the page the extractor kept, in characters. */
  characters?: { raw: number; extracted: number; retainedPercent: number };
}

export type VerifyClaimTextResult =
  | { status: 'NOT_TRACKED'; url: string; message: string }
  | { status: 'ARCHIVE_UNAVAILABLE'; url: string; reason: string; offline: boolean; message: string }
  | {
      status: 'NO_CAPTURE_FOR_DATE';
      url: string;
      date: string;
      message: string;
      nearestBefore: ArchiveCapture | null;
      nearestAfter: ArchiveCapture | null;
    }
  | {
      status: 'OK';
      url: string;
      phrase: string;
      capturesChecked: number;
      /** True when ANY checked capture diverged. Never true on an unchecked capture. */
      anyExtractionDivergence: boolean;
      /** Captures on the requested date that the per-call cap left unchecked. */
      capturesNotChecked: number;
      checks: CaptureCheck[];
    };

/** Resolve `capture` — a 14-digit Wayback timestamp or a YYYY-MM-DD date. */
function isWaybackTimestamp(value: string): boolean {
  return /^\d{14}$/.test(value);
}

/**
 * Was this exact string on this page at this capture?
 *
 * Answered three ways on purpose — the raw document, the platform's extraction
 * of it, and the text the platform stored — because the interesting case is
 * when they disagree.
 */
export async function verifyClaimText(input: {
  url: string;
  capture: string;
  phrase: string;
}): Promise<VerifyClaimTextResult> {
  const { url, phrase } = input;

  const tracked = await prisma.trackedUrl.findFirst({
    where: { url },
    select: { id: true },
  });
  if (!tracked) {
    return {
      status: 'NOT_TRACKED',
      url,
      message:
        'This URL is not tracked. Run start_forensic_scan on it first. This is NOT a statement ' +
        'that the phrase is absent — nothing was checked.',
    };
  }

  let targets: ArchiveCapture[];

  if (isWaybackTimestamp(input.capture)) {
    targets = [
      {
        waybackTimestamp: input.capture,
        date: timestampToDate(input.capture),
        digest: null,
        statusCode: null,
        snapshotUrl: viewerCaptureUrl(input.capture, url),
      },
    ];
  } else {
    const index = await fetchCaptureIndex(url, { from: input.capture, to: input.capture });
    if (!index.available) {
      return {
        status: 'ARCHIVE_UNAVAILABLE',
        url,
        reason: index.reason,
        offline: index.offline,
        message:
          'The Internet Archive did not answer, so the captures for this date could not be listed. ' +
          'Nothing was checked; this is not evidence about the phrase.',
      };
    }
    if (index.captures.length === 0) {
      const [before, after] = await Promise.all([
        nearestCapture(url, input.capture, 'before'),
        nearestCapture(url, input.capture, 'after'),
      ]);
      return {
        status: 'NO_CAPTURE_FOR_DATE',
        url,
        date: input.capture,
        message:
          `The archive holds no capture of this page on ${input.capture}, so the page's state on ` +
          'that day is not observable at all. The archive can only place its content in the ' +
          'interval between the nearest captures on either side.',
        nearestBefore: before,
        nearestAfter: after,
      };
    }
    targets = index.captures;
  }

  const notChecked = Math.max(0, targets.length - MAX_CAPTURES_PER_DATE);
  targets = targets.slice(0, MAX_CAPTURES_PER_DATE);

  const checks = await checkPhraseAtCaptures(url, tracked.id, targets, phrase);

  return {
    status: 'OK',
    url,
    phrase,
    capturesChecked: checks.filter((c) => c.outcome === 'CHECKED').length,
    anyExtractionDivergence: checks.some((c) => c.extractionDivergence === true),
    capturesNotChecked: notChecked,
    checks,
  };
}

/**
 * A cache of already-fetched capture HTML, keyed by `${url}@${timestamp}`.
 *
 * Auditing a whole thesis checks many phrases against the same handful of
 * captures. Without this, one capture would be re-downloaded once per phrase —
 * which is both slow and rude to a free archive.
 */
export type CaptureHtmlCache = Map<string, string>;

/**
 * Check one phrase against a set of captures of one tracked page.
 *
 * Shared by verify_claim_text and audit_thesis_claims so the two can never
 * answer the same question differently.
 */
export async function checkPhraseAtCaptures(
  url: string,
  trackedUrlId: string,
  captures: readonly ArchiveCapture[],
  phrase: string,
  cache?: CaptureHtmlCache,
): Promise<CaptureCheck[]> {
  const storedRows = await prisma.urlSnapshot.findMany({
    where: {
      trackedUrlId,
      waybackTimestamp: { in: captures.map((c) => c.waybackTimestamp) },
    },
    select: { waybackTimestamp: true, fullText: true },
  });
  const storedByTimestamp = new Map(storedRows.map((r) => [r.waybackTimestamp, r.fullText]));

  const needle = normaliseForPresence(phrase);
  const checks: CaptureCheck[] = [];
  // Sequential on purpose — the Internet Archive is a free service and the
  // scanner already paces itself against it.
  for (const capture of captures) {
    checks.push(
      await checkOneCapture(
        url,
        capture,
        needle,
        storedByTimestamp.get(capture.waybackTimestamp),
        cache,
      ),
    );
  }
  return checks;
}

async function checkOneCapture(
  url: string,
  target: ArchiveCapture,
  needle: string,
  storedText: string | undefined,
  cache?: CaptureHtmlCache,
): Promise<CaptureCheck> {
  const base = {
    waybackTimestamp: target.waybackTimestamp,
    date: target.date,
    snapshotUrl: target.snapshotUrl,
    rawUrl: rawCaptureUrl(target.waybackTimestamp, url),
  };

  const cacheKey = `${url}@${target.waybackTimestamp}`;
  let html: string;
  try {
    const cached = cache?.get(cacheKey);
    html = cached ?? (await fetchCaptureHtml(url, target.waybackTimestamp, INTERACTIVE_RETRY));
    cache?.set(cacheKey, html);
  } catch (err) {
    // 404 means the archive does not hold this capture — a real answer about
    // the archive. Anything else means we did not get to look, and the two
    // must never be reported as the same thing.
    const notFound = err instanceof WaybackFetchError && err.status === 404;
    return {
      ...base,
      outcome: notFound ? 'CAPTURE_NOT_IN_ARCHIVE' : 'FETCH_FAILED',
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const rawText = normaliseForPresence(extractRawText(html));
  const extractedText = normaliseForPresence(
    extractArticleText(html, rawCaptureUrl(target.waybackTimestamp, url)),
  );

  const presentInRawArchive = rawText.includes(needle);
  const presentInPlatformExtraction = extractedText.includes(needle);

  return {
    ...base,
    outcome: 'CHECKED',
    presentInRawArchive,
    presentInPlatformExtraction,
    presentInStoredSnapshot:
      storedText === undefined ? null : normaliseForPresence(storedText).includes(needle),
    extractionDivergence: presentInRawArchive !== presentInPlatformExtraction,
    characters: {
      raw: rawText.length,
      extracted: extractedText.length,
      retainedPercent:
        rawText.length === 0 ? 0 : Math.round((extractedText.length / rawText.length) * 100),
    },
  };
}

/**
 * The capture immediately before or after a date, from the archive index.
 * Returns null when the archive has none on that side, or did not answer —
 * callers report the surrounding result's own unavailable state, never a
 * bare null dressed up as "there is nothing there".
 */
async function nearestCapture(
  url: string,
  date: string,
  side: 'before' | 'after',
): Promise<ArchiveCapture | null> {
  const index = await fetchCaptureIndex(
    url,
    side === 'before' ? { to: shiftDate(date, -1) } : { from: shiftDate(date, 1) },
  );
  if (!index.available || index.captures.length === 0) return null;
  return side === 'before'
    ? index.captures[index.captures.length - 1]
    : index.captures[0];
}

/** YYYY-MM-DD shifted by whole days, in UTC. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
