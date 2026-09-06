import { prisma } from '../lib/prisma';
import { ARCHIVED_CAPTURES_ONLY, requireArchived } from '../lib/archivedCaptures';
import {
  fetchCaptureBytes,
  isTransientFetchFailure,
  rawCaptureUrl,
  sleep,
  WaybackFetchError,
} from '../lib/archiveHttp';
import { extractArticleText } from '../lib/archiveText';
import {
  captureHtml,
  DECODABLE_CAPTURE_SELECT,
  sha256Bytes,
  sha256Text,
} from '../lib/captureDocument';
import { cdxDigestOf } from './verifyAgainstCdx';

// ---------------------------------------------------------------------------
// CUSTODY PER CAPTURE. Evidence flows §8; refactor plan §3 step 9, sub-steps
// 1(a) and 1(c). READ-ONLY: nothing is stored, nothing is anchored.
//
// (a) EXTRACTOR EQUALITY. The rebuild registers each capture's payload afresh on
//     a new contract with today's block time; the date a page was first held is
//     attested by the OLD contract's extraction anchor over contentHash. The
//     two are tied by one measurement per capture: does the pinned extractor
//     over the stored bytes reproduce the stored contentHash? Where it does, an
//     outsider can verify that the bytes registered today produce the text
//     registered then. Where it does not, the ledger records a text the bytes
//     no longer reproduce — still custody, weaker, and said so.
//
//     The function measured is the one both writers ran:
//     `extractArticleText(captureHtml(payload), rawCaptureUrl(ts, url))` —
//     WaybackScraper and recoverMissingCaptures both extract under the `id_`
//     URL. Readability resolves against the document URL, so passing the viewer
//     URL instead would measure a different function and call it the same.
//
// (c) THE ARCHIVE STILL SERVES. One GET of the raw capture, no retry, its
//     status recorded; on 200 the bytes are hashed against documentHash and,
//     where a CDX row exists, against the Archive's own digest — what
//     `digestVerified` means, on a dry fetch. A GET rather than a HEAD because
//     "answers" and "serves these bytes" are different claims and only the
//     second is the one the rebuild relies on.
//
//     A 429 IS RATE_LIMITED, NEVER NOT_FOUND. The Archive declined to answer
//     now; that says nothing about the capture. It rate-limited walla three
//     times in one afternoon, and a measurement that read that as "gone" would
//     invent a custody gap and hand the cleanup session a false scope.
// ---------------------------------------------------------------------------

export type ExtractionVerdict = 'EQUAL' | 'UNEQUAL' | 'NO_BYTES';

export type ServingOutcome =
  /** 200, and the bytes hash to the stored documentHash. */
  | 'SERVED_VERIFIED'
  /** 200, but the bytes are not the ones we hold. */
  | 'SERVED_DIFFERENT'
  /** 404 or 410 — the Archive says it does not hold this capture. Durable. */
  | 'NOT_FOUND'
  /** 429 — transient by the Archive's own rule; recorded, never counted as gone. */
  | 'RATE_LIMITED'
  /** 5xx, timeout, no response — the check could not be made. */
  | 'UNAVAILABLE'
  /**
   * Any other answer, with its status: a 403, a 451, a 2xx whose body never
   * arrived (WaybackFetchError carries the status of a transfer that failed
   * AFTER a successful response). None of these says "not held", and a
   * measurement that filed them under NOT_FOUND would hand the cleanup session
   * a false custody scope — the same harm the 429 rule guards against.
   */
  | 'UNCLASSIFIED'
  /** Fetching was off for this run. */
  | 'NOT_FETCHED';

export interface ServingVerdict {
  outcome: ServingOutcome;
  status: number | null;
  /** SHA-256 of what the Archive served, on a 200. */
  fetchedDocumentHash: string | null;
  /** Fetched bytes against the CDX row's digest; null without a 200 or a row. */
  cdxDigestMatch: boolean | null;
}

export interface CaptureCustody {
  snapshotId: string;
  waybackTimestamp: string;
  extraction: ExtractionVerdict;
  /** sha256(fullText) === contentHash — the row agrees with itself, apart from the extractor. */
  storedTextAgrees: boolean;
  /** The URL the extractor was run under, so the doc can say which function was measured. */
  extractedUnder: string;
  serving: ServingVerdict;
}

export interface CaptureCustodyReport {
  url: string;
  captures: number;
  extraction: Record<ExtractionVerdict, number>;
  serving: Record<ServingOutcome, number>;
  rows: CaptureCustody[];
}

export interface CustodyOptions {
  /** Whether to GET each capture from the Archive. */
  fetch: boolean;
  /** Pause between fetches. Public endpoint; a burst is how a 429 is earned. */
  delayMs: number;
}

const SERVING_OUTCOMES: readonly ServingOutcome[] = [
  'SERVED_VERIFIED',
  'SERVED_DIFFERENT',
  'NOT_FOUND',
  'RATE_LIMITED',
  'UNAVAILABLE',
  'UNCLASSIFIED',
  'NOT_FETCHED',
];

/** The statuses by which the Archive says it does not hold a capture. */
const NOT_HELD_STATUSES: readonly number[] = [404, 410];

/** One attempt, its status classified by the Archive's own transient rule. */
async function dryFetch(
  url: string,
  timestamp: string,
  storedDocumentHash: string,
  cdxDigest: string | null,
): Promise<ServingVerdict> {
  try {
    const { bytes } = await fetchCaptureBytes(url, timestamp, { maxRetries: 0 });
    const fetchedDocumentHash = sha256Bytes(bytes);
    return {
      outcome: fetchedDocumentHash === storedDocumentHash ? 'SERVED_VERIFIED' : 'SERVED_DIFFERENT',
      status: 200,
      fetchedDocumentHash,
      cdxDigestMatch: cdxDigest === null ? null : cdxDigestOf(bytes) === cdxDigest,
    };
  } catch (err) {
    // Anything that is not the Archive's failure is the caller's bug, and a bug
    // recorded as UNAVAILABLE would be a measurement of the wrong thing.
    if (!(err instanceof WaybackFetchError)) throw err;
    const status = err.status;
    const outcome: ServingOutcome =
      status === 429
        ? 'RATE_LIMITED'
        : isTransientFetchFailure(err)
          ? 'UNAVAILABLE'
          : status !== null && NOT_HELD_STATUSES.includes(status)
            ? 'NOT_FOUND'
            : 'UNCLASSIFIED';
    return { outcome, status, fetchedDocumentHash: null, cdxDigestMatch: null };
  }
}

export async function measureCaptureCustody(
  url: string,
  options: CustodyOptions,
): Promise<CaptureCustodyReport> {
  const tracked = await prisma.trackedUrl.findUnique({ where: { url }, select: { id: true, url: true } });
  if (!tracked) throw new Error(`No tracked URL found for: ${url}`);

  // Archive-scoped, and correctly so for (c): only an archived capture has a raw
  // capture URL to fetch. For (a) the scope costs nothing today — every capture
  // in both environments is WAYBACK — and a DIRECT capture, when one exists,
  // was extracted under its live URL by a writer this measurement does not model.
  const captures = await prisma.urlSnapshot.findMany({
    where: { trackedUrlId: tracked.id, ...ARCHIVED_CAPTURES_ONLY },
    orderBy: { capturedAt: 'asc' },
    select: {
      id: true,
      waybackTimestamp: true,
      ...DECODABLE_CAPTURE_SELECT,
      documentHash: true,
      contentHash: true,
      fullText: true,
      cdxIndexEntry: { select: { digest: true } },
    },
  });

  const rows: CaptureCustody[] = [];
  for (const [i, raw] of captures.entries()) {
    const capture = requireArchived(raw, 'measureCaptureCustody');
    const extractedUnder = rawCaptureUrl(capture.waybackTimestamp, tracked.url);

    let extraction: ExtractionVerdict;
    if (capture.document.length === 0) {
      extraction = 'NO_BYTES';
    } else {
      const recomputed = sha256Text(extractArticleText(captureHtml(capture), extractedUnder));
      extraction = recomputed === capture.contentHash ? 'EQUAL' : 'UNEQUAL';
    }

    let serving: ServingVerdict = {
      outcome: 'NOT_FETCHED',
      status: null,
      fetchedDocumentHash: null,
      cdxDigestMatch: null,
    };
    if (options.fetch) {
      if (i > 0) await sleep(options.delayMs);
      serving = await dryFetch(
        tracked.url,
        capture.waybackTimestamp,
        capture.documentHash,
        capture.cdxIndexEntry?.digest ?? null,
      );
    }

    rows.push({
      snapshotId: capture.id,
      waybackTimestamp: capture.waybackTimestamp,
      extraction,
      storedTextAgrees: sha256Text(capture.fullText) === capture.contentHash,
      extractedUnder,
      serving,
    });
  }

  const extraction: Record<ExtractionVerdict, number> = { EQUAL: 0, UNEQUAL: 0, NO_BYTES: 0 };
  const serving = Object.fromEntries(SERVING_OUTCOMES.map((o) => [o, 0])) as Record<ServingOutcome, number>;
  for (const row of rows) {
    extraction[row.extraction] += 1;
    serving[row.serving.outcome] += 1;
  }

  return { url: tracked.url, captures: rows.length, extraction, serving, rows };
}
