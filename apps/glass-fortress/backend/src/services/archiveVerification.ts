import axios from 'axios';
import { prisma } from '../lib/prisma';
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
// FROM `htmlText`, NOT `archiveText`: the raw reading needs no DOM, and a verifier
// that loaded Readability's module would load jsdom for nothing (R45).
import { extractRawText, normaliseForPresence, phrasePresent, timestampToDate } from '../lib/htmlText';

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
//   1. The RAW archived HTML is the authority. The second answer is the text
//      this platform STORED for the capture — its current `text`, what every
//      diff and trajectory reads — so a disagreement between the two says the
//      platform's derivation is blind to something the page said. The legacy
//      Readability column is read by nothing here: on capture 20220905111109 it
//      dropped the very sentence a thesis then claimed had been added the next
//      day, and a verifier built on it would have CONFIRMED the false claim.
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
  /**
   * Present in the text this platform STORED for this capture — its current
   * `text`, what every diff and trajectory is derived from — or null when this
   * capture is not held. ONE stored register (evidence flows A4: the corpus read
   * by text, over current text versions); the Readability re-run it once sat
   * beside is gone with the legacy register.
   */
  presentInStoredSnapshot?: boolean | null;
  /**
   * The finding this tool exists for. True when the raw page and the stored
   * text disagree about the phrase — the platform's derivation is blind to
   * something the page said. Null when the capture is not held: there is no
   * stored text to disagree with, and "no divergence" would claim a check that
   * was never made.
   */
  extractionDivergence?: boolean | null;
  /**
   * The raw reading's length, and the stored text's — null when not held — in
   * characters, with the share of the raw reading the stored text keeps.
   */
  characters?: { raw: number; stored: number | null; retainedPercent: number | null };
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
 * Answered two ways on purpose — the raw document and the text the platform
 * stored for it — because the interesting case is when they disagree.
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
        'This URL is not tracked. Survey it first (survey_wayback_captures). This is NOT a statement ' +
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
    select: { waybackTimestamp: true, text: true },
  });
  const storedByTimestamp = new Map(storedRows.map((r) => [r.waybackTimestamp, r.text]));

  const checks: CaptureCheck[] = [];
  // Sequential on purpose — the Internet Archive is a free service and the
  // scanner already paces itself against it.
  for (const capture of captures) {
    checks.push(
      await checkOneCapture(
        url,
        capture,
        phrase,
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
  phrase: string,
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

  // Normalised once for the character counts; the ONE rule (`lib/htmlText.phrasePresent`, shared with `search_corpus`)
  // normalises again, which collapses the same whitespace to the same string — it is the verdict, the counts are what
  // it was read over.
  const rawText = normaliseForPresence(extractRawText(html));
  const presentInRawArchive = phrasePresent(rawText, phrase);

  if (storedText === undefined) {
    return {
      ...base,
      outcome: 'CHECKED',
      presentInRawArchive,
      presentInStoredSnapshot: null,
      extractionDivergence: null,
      characters: { raw: rawText.length, stored: null, retainedPercent: null },
    };
  }

  const stored = normaliseForPresence(storedText);
  const presentInStoredSnapshot = phrasePresent(stored, phrase);

  return {
    ...base,
    outcome: 'CHECKED',
    presentInRawArchive,
    presentInStoredSnapshot,
    extractionDivergence: presentInRawArchive !== presentInStoredSnapshot,
    characters: {
      raw: rawText.length,
      stored: stored.length,
      retainedPercent: rawText.length === 0 ? 0 : Math.round((stored.length / rawText.length) * 100),
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
