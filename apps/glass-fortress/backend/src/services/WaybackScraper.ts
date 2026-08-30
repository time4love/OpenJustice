import axios from 'axios';
import { CaptureProvenance } from '@prisma/client';
import { recordCapture, waybackTimestampToDate } from './recordCapture';
import { extractArticleText, timestampToDate } from '../lib/archiveText';
import { captureHtml } from '../lib/captureDocument';
import {
  CDX_MAX_RETRIES,
  CDX_TIMEOUT_MS,
  CDX_USER_AGENT,
  fetchCaptureBytes,
  isWaybackOffline,
  rawCaptureUrl,
  sleep,
  viewerCaptureUrl,
  WaybackFetchError,
  withRetry,
} from '../lib/archiveHttp';
import { requireSnapshotIdentity } from './forensicEvidence';
import { ForensicAgent, type DiffItem, type RelatedEvidenceContext } from './ForensicAgent';
import { prisma } from '../lib/prisma';
import {
  buildForensicEvidence,
  type ForensicEvidenceSource,
} from './forensicEvidence';
import { diffChunkPair, classifierInputChunks, DIFF_INPUT_VERSION } from '../lib/diffChunking';
import { CLASSIFIER_VERSION, classifierPromptHash } from '../lib/classifierVersion';
import { getClaimTrajectories } from './claimTrajectory';
import { ARCHIVED_CAPTURES_ONLY } from '../lib/archivedCaptures';
import { admitUrl } from './admitUrl';
import { recordDiff } from './recordDiff';
import { fetchContentForRelevanceCheck } from './fetchContentForRelevanceCheck';
import {
  recordCdxObservation,
  markCdxEntryStored,
  markCdxEntryUnchanged,
  markCdxEntryUnservable,
} from './recordCdxObservation';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SnapshotDiff {
  /** DB primary key of the persisted UrlVersionDiff record */
  id: string;
  /** Raw Wayback Machine timestamp: YYYYMMDDHHMMSS */
  timestamp: string;
  /** Human-readable date of the previous snapshot: YYYY-MM-DD */
  beforeDate: string;
  /** Human-readable date of this snapshot: YYYY-MM-DD */
  date: string;
  /** Direct link to this snapshot in the Wayback Machine viewer */
  snapshotUrl: string;
  /** Substantive items deleted vs. the previous snapshot — coupled Hebrew summary + verbatim quote */
  deletedItems: DiffItem[];
  /** Substantive items added vs. the previous snapshot — coupled Hebrew summary + verbatim quote */
  addedItems: DiffItem[];
  /** AI forensic explanation cross-referencing correlated DB evidence (Hebrew) */
  legalSignificance: string;
}

export interface PageHistoryResult {
  /** DB primary key of the created TrackedUrl record */
  trackedUrlId: string;
  /** The diffs found (only legally significant ones) */
  diffs: SnapshotDiff[];
}

/** Shape of one entry in the WaybackScrapeJob.snapshotsList JSON array */
export interface JobSnapshotEntry {
  timestamp: string;
  digest: string;
  status: 'PENDING' | 'DONE' | 'FAILED';
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface RawSnapshot {
  timestamp: string;
  digest: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum unique snapshots to process per URL per scan window. */
const MAX_SNAPSHOTS = 50;

/** Milliseconds to wait between Wayback Machine HTTP requests — respects rate limits. */
const FETCH_DELAY_MS = 1_500;

/** Days on each side of the snapshot date to search for correlated DB evidence. */
const CONTEXT_WINDOW_DAYS = 60;

/** Maximum correlated evidence records to pass to the AI (keep prompt manageable). */
const MAX_CONTEXT_RECORDS = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A capture as the scan paths see it, INCLUDING WHY IT LOOKS THAT WAY.
 *
 * `outcome` is not decoration. `UNCHANGED` means `recordCapture` found this
 * capture text-identical to its predecessor and returned THE PREDECESSOR'S id —
 * so a caller that reads only `id` sees the previous capture and cannot know it.
 */
interface StoredCapture {
  id: string;
  waybackTimestamp: string;
  contentHash: string;
  outcome: 'CREATED' | 'UNCHANGED' | 'EXISTS';
}

/**
 * Record one archived capture.
 *
 * A thin adapter over `recordCapture`, which is the ONLY way a capture is
 * written (Level 1 of docs/gf-factual-layer-rebuild-dev-plan.md). Everything
 * this function used to do itself — hashing, anchoring, idempotency on resume —
 * now lives there, so the URL-tracking path gets the same guarantees rather
 * than a second implementation of them.
 *
 * Returns the identity, not just the key: evidence derived from a change
 * between two captures is hashed from their timestamps and content hashes, so
 * every caller needs those to hand rather than a second query.
 */
async function recordArchivedCapture(
  trackedUrlId: string,
  timestamp: string,
  url: string,
  fullText: string,
  document: Buffer,
  documentContentType: string | null,
  documentContentEncoding: string | null,
  /**
   * The digest CDX published for this capture. Links the stored capture back to
   * the index entry it came from, HERE rather than at each call site, so the two
   * writers of captures cannot disagree about whether the link is made.
   */
  cdxDigest: string,
): Promise<StoredCapture> {
  const recorded = await recordCapture({
    trackedUrlId,
    provenance: CaptureProvenance.WAYBACK,
    capturedAt: waybackTimestampToDate(timestamp),
    waybackTimestamp: timestamp,
    sourceUrl: viewerCaptureUrl(timestamp, url),
    document,
    documentContentType,
    documentContentEncoding,
    extraction: fullText,
  });

  // An UNCHANGED outcome returns the PRECEDING capture, which for this path is
  // necessarily archived too. Narrowing here rather than asserting: if it is
  // ever null, the write path returned something this caller cannot describe.
  if (recorded.waybackTimestamp === null) {
    throw new Error(
      `recordArchivedCapture: capture ${recorded.id} came back without an Archive timestamp.`,
    );
  }
  // Advance the index entry, and DO NOT LINK ON AN UNCHANGED OUTCOME.
  //
  // This distinction is not cosmetic. On UNCHANGED, `recordCapture` returns the
  // PRECEDING capture's id — that is what UNCHANGED means — so linking it here
  // would attach this index entry to a capture it did not produce, and every
  // "which capture came from this entry" answer would be quietly wrong for
  // exactly the eleven rows this status exists to describe.
  //
  // Keyed on the digest as well as the timestamp so the link lands on the entry
  // we actually fetched rather than on a drifted re-observation of the same
  // instant. Done here, in the one function both scan paths go through, so it
  // cannot be handled by one writer and forgotten by the other.
  if (recorded.outcome === 'UNCHANGED') {
    // `recorded.id` IS the predecessor — that is what UNCHANGED means — so it is
    // both the capture this must NOT be linked to as its own, and exactly the one
    // the verdict was computed against.
    await markCdxEntryUnchanged({
      trackedUrlId,
      waybackTimestamp: timestamp,
      digest: cdxDigest,
      comparedToSnapshotId: recorded.id,
    });
  } else {
    await markCdxEntryStored({
      trackedUrlId,
      waybackTimestamp: recorded.waybackTimestamp,
      digest: cdxDigest,
      snapshotId: recorded.id,
    });
  }

  return {
    id: recorded.id,
    waybackTimestamp: recorded.waybackTimestamp,
    contentHash: recorded.contentHash,
    // THE OUTCOME TRAVELS WITH THE CAPTURE, and this line is the fix for a real
    // defect. It used to be consumed here for the CDX link and then DISCARDED,
    // so the diff paths could not tell UNCHANGED from CREATED even though the
    // distinction was already known — and on UNCHANGED both sides of the diff
    // resolve to the same surviving snapshot, producing a row that compares a
    // capture against itself. A caller cannot honour a distinction its input
    // does not carry.
    outcome: recorded.outcome,
  };
}

/**
 * Record a classified UrlVersionDiff as a PENDING_REVIEW Evidence record.
 *
 * This deliberately does NOT promote. Until 2026-08-22 it registered the hash
 * on-chain, wrote CONFIRMED, and indexed the record for public search — all on
 * the strength of an LLM classification, with no human ever seeing it.
 *
 * The reason that was wrong is visible in the data model. A UrlSnapshot's
 * contentHash is anchored automatically and correctly: it claims "this page
 * held exactly this text on this date", a factual observation anyone can
 * re-verify, and its value depends on being anchored promptly. An Evidence
 * record claims "this change is evidence in this investigation" — a legal
 * characterization. Automating the first is chain of custody; automating the
 * second is asserting a legal conclusion nobody reviewed.
 *
 * Nothing evidential is lost by waiting, because the snapshot anchor already
 * froze the underlying fact at scan time. What is gained is that CONFIRMED
 * keeps meaning what it says.
 *
 * Findings are reviewed and promoted per tracked URL — see the get_scan_findings
 * and promote_scan_findings MCP tools.
 *
 * Only diffs that advance at least one standing investigative concern are
 * recorded at all: a change can be unusual, or even legally interesting, and
 * still not be evidence for THIS investigation. Callers gate on
 * isLegallySignificant, which derives from the same classification; the guard
 * below makes the invariant explicit at the boundary rather than relying on
 * every caller to hold it.
 *
 * Idempotent — upserts by fileHash so re-runs are safe. Non-fatal — logs and
 * continues on failure, so one bad diff cannot abort a scan.
 */
export async function recordScanFinding(source: ForensicEvidenceSource): Promise<void> {
  // The automatic path only. Manual promotion via /forensics/promote is a
  // researcher's deliberate override and is intentionally not gated on this.
  if (source.investigativeCategories.length === 0) {
    console.warn(
      `[WaybackScraper] Refusing to record diff ${source.diffId} — no investigative category matched.`,
    );
    return;
  }

  const { fileHash, data } = buildForensicEvidence(source);

  try {
    await prisma.evidence.upsert({
      where: { fileHash },
      // An existing row is left exactly as it is. If it was already reviewed and
      // confirmed, a re-scan must not quietly reopen it; if it is still pending,
      // there is nothing new to write.
      update: {},
      create: { ...data, status: 'PENDING_REVIEW' },
    });
  } catch (err) {
    console.warn(
      '[WaybackScraper] Recording scan finding failed for diff', source.diffId,
      ':', err instanceof Error ? err.message : err,
    );
    return;
  }

  console.info(
    `[WaybackScraper] Recorded scan finding ${fileHash} as PENDING_REVIEW — awaiting review.`,
  );
}

/**
 * Register a UrlSnapshot's contentHash on-chain and persist the tx hash.
 * Fire-and-forget — non-fatal. Skips silently if Web3Service is unavailable.
 */
/**
 * Record a scan's terminal status, tolerating a row that has since been deleted.
 *
 * These updates race a TrackedUrl deletion, which is why they were written to
 * swallow. Swallowing is still the behaviour — the scan is already over and there
 * is nothing to retry — but the reason is now stated and the rejection is logged,
 * so a failure that is NOT a benign race is visible instead of silent.
 */
async function setScanStatus(trackedUrlId: string, status: 'PAUSED' | 'FAILED'): Promise<void> {
  try {
    await prisma.trackedUrl.update({ where: { id: trackedUrlId }, data: { status } });
  } catch (err) {
    console.warn(
      `[WaybackScraper] could not record ${status} for ${trackedUrlId} (row deleted mid-scan?):`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Compute the date string for a point N days offset from a YYYY-MM-DD date.
 */
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The CDX `from` value for the NEXT PAGE of the scan currently running.
 *
 * WITHIN-RUN PAGINATION ONLY. Null means "CDX signalled no further rows after
 * this batch", which is a statement about one paginated walk and nothing more.
 *
 * IT IS NOT AN ANSWER TO "IS THERE ANYTHING LEFT TO SCAN?" and using it as one
 * is the defect this contract now spells out. `totalSnapshots` carries a
 * sentinel (MAX_SNAPSHOTS + 1) meaning "CDX had more", so a FINISHED scan always
 * ends with `totalSnapshots < MAX_SNAPSHOTS` — that is what finishing means. Read
 * across runs, this function therefore returns null for every completed job
 * forever, and a later scan request short-circuits to COMPLETED without one
 * request to the Archive.
 *
 * Staging sat in exactly that state (`totalSnapshots: 41`), which is why Level
 * 1's capture recovery needed its own instrument. See resumePointFromCaptures
 * for the across-run question, which can only be answered by ASKING.
 */
function computeNextFromDate(snapshotsListJson: string, totalSnapshots: number): string | null {
  try {
    if (totalSnapshots < MAX_SNAPSHOTS) return null;
    const list = JSON.parse(snapshotsListJson) as Array<{ timestamp: string; status: string }>;
    const done = list.filter((s) => s.status === 'DONE');
    if (done.length === 0) return null;
    // `done.length > 0` above makes this defined, but noUncheckedIndexedAccess is
    // OFF project-wide, so the compiler types every index as non-undefined and the
    // linter calls this guard redundant. It is not: an index read is `T | undefined`
    // at runtime whatever the types say, and deleting these is how `extractHrefs`
    // nearly started returning empty strings. See the debt ratchet.
    const last = done[done.length - 1]?.timestamp; // YYYYMMDDHHMMSS (14 digits)
    if (!last) return null;
    // Increment by 1 second so the next batch starts strictly after this snapshot
    return (BigInt(last) + BigInt(1)).toString().padStart(14, '0');
  } catch {
    return null;
  }
}

/**
 * Where a FRESH scan of an already-completed URL should resume from.
 *
 * DERIVED FROM STORED STATE, NEVER FROM THE PREVIOUS RUN'S FINAL TRANSITION.
 * "Has the Archive gained captures since we last looked?" is a question about
 * the world, and the only honest way to answer it is to ask CDX. What we may
 * decide locally is merely where to start asking, and that comes from the
 * newest capture we actually hold.
 *
 * This repository has now learned the same lesson three times in one day and
 * again here: derive from state, not from a transition. The old code read a
 * pagination sentinel left behind by the last batch of the last run and treated
 * it as a fact about the Archive.
 *
 * `undefined` — meaning no `from=` bound, scan from the beginning — when we hold
 * no archived capture at all. That is the Level 2 Phase B case: the scan runs,
 * CDX answers, and "the Archive holds none" becomes an OBSERVATION rather than
 * an inference from a counter nobody set.
 *
 * INCREMENTAL BY CONSTRUCTION, and this is a real limit rather than a caveat: it
 * looks only for captures NEWER than our newest, so it will not rediscover a gap
 * in the middle of the history. Filling those is what
 * `forensics:recover-captures` exists for — it fetches the whole CDX index with
 * no pagination and no client-side dedup.
 */
async function resumePointFromCaptures(trackedUrlId: string): Promise<string | undefined> {
  const newest = await prisma.urlSnapshot.findFirst({
    where: { trackedUrlId, ...ARCHIVED_CAPTURES_ONLY },
    orderBy: { capturedAt: 'desc' },
    select: { waybackTimestamp: true },
  });
  if (!newest?.waybackTimestamp) return undefined;
  // One second past the newest we hold, so CDX cannot return it again. Same
  // convention as computeNextFromDate, for the same reason.
  return (BigInt(newest.waybackTimestamp) + BigInt(1)).toString().padStart(14, '0');
}

/** Thrown when a scan is cancelled mid-flight so runFullScan exits cleanly. */
class ScanCancelledError extends Error {
  constructor(trackedUrlId: string) {
    super(`Scan cancelled: ${trackedUrlId}`);
    this.name = 'ScanCancelledError';
  }
}

/** Thrown when a scan is paused mid-flight so runFullScan exits cleanly. */
class ScanPausedError extends Error {
  constructor(trackedUrlId: string) {
    super(`Scan paused: ${trackedUrlId}`);
    this.name = 'ScanPausedError';
  }
}

// ---------------------------------------------------------------------------
// WaybackScraper
// ---------------------------------------------------------------------------

export class WaybackScraper {
  private readonly forensicAgent: ForensicAgent;
  /** In-memory guard preventing concurrent runFullScan calls for the same TrackedUrl. */
  private readonly _runningScanIds = new Set<string>();
  /** TrackedUrl IDs that have been cancelled — processJob checks this and aborts. */
  private readonly _cancelledScanIds = new Set<string>();
  /** TrackedUrl IDs that the user has paused — processJob checks this and suspends. */
  private readonly _pausedScanIds = new Set<string>();

  constructor() {
    this.forensicAgent = new ForensicAgent();
  }

  /**
   * Signal a running scan to stop at its next checkpoint.
   * Called by the delete handler so the scan stops creating new DB records
   * before the deletion begins.
   */
  cancelScan(trackedUrlId: string): void {
    this._cancelledScanIds.add(trackedUrlId);
  }

  /**
   * Signal a running scan to pause at its next snapshot boundary.
   * The TrackedUrl status is set to PAUSED once the scan loop exits.
   * Resume by calling POST /scan for the same URL.
   */
  pauseScan(trackedUrlId: string): void {
    this._pausedScanIds.add(trackedUrlId);
  }

  /**
   * Ask CDX what the Archive holds, AND RECORD THAT WE ASKED.
   *
   * `trackedUrlId` is required rather than optional, so the observation cannot be
   * lost by a caller forgetting to pass it — the same reason `recordCapture`
   * takes `document` as a required parameter. A CDX answer is an observation of an
   * external system, which §3 says must be stored because it cannot be
   * re-derived, and a zero-row answer is the one Level 2 Phase B routes on.
   *
   * For the pre-tracking case, where there is no TrackedUrl to attach an
   * observation to, use `probeSnapshotsList` — which says so in its name rather
   * than hiding it behind an optional argument.
   */
  async getSnapshotsList(
    url: string,
    trackedUrlId: string,
    fromDate?: string,
  ): Promise<{ snapshots: RawSnapshot[]; hasMore: boolean }> {
    const queriedAt = new Date();
    const { snapshots, hasMore, rawRows } = await this.queryCdxIndex(url, fromDate);
    await recordCdxObservation({ trackedUrlId, queriedAt, fromDate, rows: rawRows, hasMore });
    return { snapshots, hasMore };
  }

  /**
   * The same CDX query, for a URL that is NOT tracked yet.
   *
   * Used by the relevance pre-check, which runs before anything decides whether
   * the URL is worth tracking — so there is no TrackedUrl for an observation to
   * belong to. Named for that rather than expressed as an optional parameter,
   * because "records sometimes" is how a rule acquires two implementations.
   *
   * It shares `queryCdxIndex` with the recording path, so there is exactly one
   * CDX query in this class.
   */
  async probeSnapshotsList(url: string): Promise<{ snapshots: RawSnapshot[]; hasMore: boolean }> {
    const { snapshots, hasMore } = await this.queryCdxIndex(url);
    return { snapshots, hasMore };
  }

  /**
   * Fetch the deduplicated list of archive snapshots for a URL via the CDX API.
   * Uses server-side `collapse=digest` to return only content-changed snapshots.
   *
   * Pure: it queries and parses, and writes nothing. `rawRows` is every row CDX
   * returned before the MAX_SNAPSHOTS slice, which is what the observation record
   * needs — the stored index must reflect what the Archive said, not what one
   * batch happened to keep.
   */
  private async queryCdxIndex(
    url: string,
    fromDate?: string,
  ): Promise<{ snapshots: RawSnapshot[]; hasMore: boolean; rawRows: RawSnapshot[] }> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('URL must use http or https protocol.');
    }

    const cdxUrl =
      `http://web.archive.org/cdx/search/cdx` +
      `?url=${encodeURIComponent(url)}` +
      `&output=json` +
      `&fl=timestamp,digest` +
      `&collapse=digest` +
      `&limit=${MAX_SNAPSHOTS + 1}` + // request one extra row to detect "more exist"
      (fromDate ? `&from=${fromDate}` : '');

    const response = await withRetry(
      () =>
        axios.get<unknown[][]>(cdxUrl, {
          timeout: CDX_TIMEOUT_MS,
          headers: { 'User-Agent': CDX_USER_AGENT },
        }),
      { maxRetries: CDX_MAX_RETRIES },
    );

    const rows = response.data;
    if (!Array.isArray(rows) || rows.length < 2)
      return { snapshots: [], hasMore: false, rawRows: [] };

    // Row 0 is ["timestamp","digest"] — skip it
    const dataRows = rows.slice(1) as string[][];

    // If CDX returned MAX_SNAPSHOTS+1 rows, there are more snapshots beyond this batch.
    const hasMore = dataRows.length > MAX_SNAPSHOTS;

    // No client-side digest dedup here, deliberately — this is where it used to be.
    //
    // A `seenDigests` Set skipped ANY previously-seen digest, and its own comment
    // named the case it was discarding: "non-consecutive ones where content
    // reverts to a previously-seen digest". A page returning to a former state is
    // not a duplicate. It is the whole-page form of what claim trajectories
    // detect, and on a government page under investigation it is among the most
    // significant things the Archive can show.
    //
    // Measured against the real corpus on 2026-08-27: CDX holds 95 captures of
    // the tracked MOH page, of which 12 revert to an earlier state. ELEVEN were
    // discarded. The page returned to one earlier state twice within six hours on
    // 2022-06-22, and to another three times across May 2022; none of that was
    // stored.
    //
    // The twelfth survived — and why it survived is the reason this could not be
    // fixed by narrowing the rule. The Set was scoped to ONE CDX batch, so a
    // revert whose twin fell in the previous batch was invisible to it.
    // `20220703090600` is in staging solely because a page boundary landed
    // between it and its twin. Whether a page state was recorded depended on
    // pagination.
    //
    // Novelty is now decided in exactly one place, on content rather than on the
    // Archive's digest, against the immediately preceding capture only — see
    // recordCapture.
    const snapshots: RawSnapshot[] = [];
    for (const row of dataRows) {
      const [timestamp, digest] = row;
      if (!timestamp || !digest) continue;
      snapshots.push({ timestamp, digest });
    }

    // CDX defaults to ascending-by-timestamp order, but that's an assumption about a
    // third-party API, not a guarantee — sort explicitly so beforeDate/afterDate in
    // processJob() can never be derived from a reversed pair.
    snapshots.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

    return { snapshots: snapshots.slice(0, MAX_SNAPSHOTS), hasMore, rawRows: snapshots };
  }

  /**
   * Fetch a single archived snapshot and extract clean readable text.
   * Uses the `id_` modifier to suppress the Wayback Machine toolbar.
   */
  async scrapeSnapshot(url: string, timestamp: string): Promise<string> {
    return (await this.scrapeSnapshotReadings(url, timestamp)).extracted;
  }

  /**
   * Both readings of one archived capture, from one fetch.
   *
   * The raw document used to be discarded on the line that produced the
   * extraction. It is the only thing that can ever say whether a change the
   * pipeline reports actually happened on the page: the extraction keeps roughly
   * two thirds of a capture and a DIFFERENT two thirds of the next one, so a
   * diff computed over it manufactures removals and restorations that never
   * occurred. One such artifact reached a published thesis.
   *
   * No extra fetch and no third-party dependency — both readings come from the
   * HTML already in hand, which makes this the one integrity check in
   * docs/gf-factual-layer-rebuild-dev-plan.md that cannot be defeated by the
   * Internet Archive being unreachable.
   */
  async scrapeSnapshotReadings(
    url: string,
    timestamp: string,
  ): Promise<{
    extracted: string;
    bytes: Buffer;
    contentType: string | null;
    contentEncoding: string | null;
  }> {
    // ONE fetch, and it returns the payload rather than a decoded string.
    //
    // This used to fetch with responseType 'text' and return `raw:
    // extractRawText(html)` — text stripped of markup, stored under the name of
    // the document. That is what reopened Level 1: hrefs were discarded while
    // anchor text was kept, so two different links reading the same were the
    // same page to us, on a corpus whose central finding is a removed
    // reporting-channel link.
    //
    // The extraction is still derived here because Readability wants a string;
    // the bytes travel to recordCapture untouched.
    const { bytes, contentType, contentEncoding } = await fetchCaptureBytes(url, timestamp);
    const html = captureHtml({
      document: bytes,
      documentContentType: contentType,
      documentContentEncoding: contentEncoding,
    });
    return {
      extracted: extractArticleText(html, rawCaptureUrl(timestamp, url)),
      bytes,
      contentType,
      contentEncoding,
    };
  }

  /**
   * Query the evidence database for records whose `evidenceDate` falls within
   * ±CONTEXT_WINDOW_DAYS of the given snapshot date.
   *
   * `excludeTrackedUrlId` keeps a page from corroborating itself.
   *
   * Correlation is only worth anything when it comes from a DIFFERENT source
   * than the page being classified. Evidence derived from this same tracked URL
   * is not independent support — it is the same page, one snapshot earlier.
   *
   * This is not hypothetical. Because recordScanFinding writes evidence as the
   * scan walks forward, later diffs find earlier ones already in their ±60-day
   * window, and the 2022-05-29 classification of corona.health.gov.il cited
   * "הראיות הפנימיות שנרשמו בימים 25 ו-29 במאי" — its own page's prior diffs,
   * described as internal corroborating evidence. A page could inflate the
   * significance of every one of its changes on the strength of its neighbours.
   *
   * The oscillation such neighbours reveal is a genuine finding — deleted,
   * restored, deleted again within six days. It belongs at the thesis level,
   * where a researcher cites several records and the pattern reads as a pattern,
   * not inside a per-diff verdict dressed as outside support.
   */
  async fetchCorrelatedEvidence(
    snapshotDate: string,
    excludeTrackedUrlId?: string,
  ): Promise<RelatedEvidenceContext[]> {
    const windowStart = offsetDate(snapshotDate, -CONTEXT_WINDOW_DAYS);
    const windowEnd = offsetDate(snapshotDate, +CONTEXT_WINDOW_DAYS);

    const rows = await prisma.evidence.findMany({
      where: {
        AND: [
          { evidenceDate: { gte: windowStart } },
          { evidenceDate: { lte: windowEnd } },
          { NOT: { evidenceDate: 'Unknown' } },
          ...(excludeTrackedUrlId
            ? [{ NOT: { urlVersionDiff: { trackedUrlId: excludeTrackedUrlId } } }]
            : []),
        ],
      },
      orderBy: { evidenceDate: 'asc' },
      take: MAX_CONTEXT_RECORDS,
    });

    return rows.map((r) => ({
      date: r.evidenceDate,
      summary: r.summary,
      investigativeCategories: r.investigativeCategories,
      targetEntity: r.targetEntity,
      evidenceRole: r.evidenceRole,
    }));
  }

  /**
   * Legacy synchronous pipeline (used by GET /api/forensics/wayback).
   * Prefer runFullScan() for new usage.
   */
  async analyzePageHistory(url: string): Promise<PageHistoryResult> {
    // ADMISSION, NOT AN UPSERT. This method reached `GET /api/forensics/wayback`
    // and created a TrackedUrl directly, so that route admitted URLs with no
    // relevance check and no recorded verdict — the third of four admission paths
    // that bypassed the gate.
    //
    // The TrackedUrl is still created BEFORE the CDX query, because the query's
    // answer is an observation that has to belong to something. Ordering it the
    // other way round would mean the first observation of a URL — the one saying
    // whether the Archive holds it at all — is the one we cannot store.
    const admission = await admitUrl({ url, fetchContent: fetchContentForRelevanceCheck });
    if (!admission.admitted) {
      // Refusal is not an error here: the caller asked for a page's history and
      // the page is not admissible. An empty result with no TrackedUrl created is
      // the honest answer, and the verdict is on the record either way.
      console.log(
        `[WaybackScraper] ${url} not admitted (${admission.verdict}): ${admission.reason}`,
      );
      return { trackedUrlId: '', diffs: [] };
    }
    const trackedUrl = { id: admission.trackedUrlId };

    const { snapshots } = await this.getSnapshotsList(url, trackedUrl.id);

    if (snapshots.length === 0) {
      return { trackedUrlId: trackedUrl.id, diffs: [] };
    }

    // ONE array of observations, not three parallel ones kept in step by index.
    //
    // `texts[i]`, `snaps[i]` and `snapshots[i]` were correct only while all three
    // stayed exactly the same length, which nothing enforced — and reading them
    // back required index arithmetic (`i - 1`) that no type system can check while
    // noUncheckedIndexedAccess is off. Binding the three facts about one capture
    // together removes the class: there is no index to get wrong, so the guard
    // below is about DATA (a failed fetch stores empty text) rather than about
    // whether an array position exists.
    //
    // `stored` is the full identity rather than a key: evidence derived from a
    // change between two captures is hashed from their timestamps and content
    // hashes.
    interface Observation {
      snap: RawSnapshot;
      text: string;
      stored: StoredCapture | null;
    }
    const observations: Observation[] = [];
    for (const snap of snapshots) {
      try {
        const readings = await this.scrapeSnapshotReadings(url, snap.timestamp);
        let stored: Observation['stored'] = null;
        try {
          stored = await recordArchivedCapture(
            trackedUrl.id, snap.timestamp, url, readings.extracted, readings.bytes, readings.contentType, readings.contentEncoding, snap.digest,
          );
        } catch {
          stored = null;
        }
        observations.push({ snap, text: readings.extracted, stored });
      } catch (err) {
        console.warn(
          `[WaybackScraper] Skipping ${snap.timestamp}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        // Empty text, deliberately kept in sequence: a failed fetch must break the
        // chain at that point rather than silently diff across the hole.
        observations.push({ snap, text: '', stored: null });
      }
      await sleep(FETCH_DELAY_MS);
    }

    const results: SnapshotDiff[] = [];

    // Carry the previous observation rather than indexing backwards. `prev` is
    // genuinely undefined on the first iteration, so this guard is real in both
    // directions — the compiler agrees it can be undefined, and the linter agrees
    // the check is not redundant. Indexing `[i - 1]` satisfied neither.
    let previous: Observation | undefined;
    for (const current of observations) {
      const prev = previous;
      previous = current;

      // Skip the pair when either side failed to fetch. Unchanged behaviour: a
      // hole breaks the chain on both sides of itself rather than being diffed
      // across, which would report the whole page as removed and re-added.
      if (!prev?.text || !current.text) continue;

      const snap = current.snap;
      const prevSnap = prev.snap;

      // All changed chunks (any size) — stored verbatim for display, claimed at
      // the granularity Level 5 checks at.
      const { removed: deletions, added: additions } = diffChunkPair(prev.text, current.text);
      // The one selection step both classification paths go through.
      const deletionsForAI = classifierInputChunks(deletions);
      const additionsForAI = classifierInputChunks(additions);

      const beforeDate = timestampToDate(prevSnap.timestamp);
      const afterDate = timestampToDate(snap.timestamp);
      const snapshotUrl = viewerCaptureUrl(snap.timestamp, url);
      // A DIFF REQUIRES BOTH CAPTURES, and skipping is the honest outcome when one
      // is missing rather than writing a row with a null pair.
      //
      // Level 5's invariant is that a reported change survives the DOCUMENTS. If a
      // capture failed to store there are no documents, so such a diff is
      // unverifiable by construction — a row that can never be validated and can
      // never be promoted, occupying the corpus as though it had been checked.
      //
      // The gap is NOT lost by declining to write it: it lives at the capture
      // layer, where CdxIndexEntry records UNSERVABLE / UNFETCHED as first-class
      // queryable state. Recording it twice, once as a half-formed diff, would be
      // the weaker of the two records claiming the stronger one's ground.
      const beforeSnapshotId = prev.stored?.id;
      const afterSnapshotId = current.stored?.id;
      if (!beforeSnapshotId || !afterSnapshotId) {
        console.warn(
          `[WaybackScraper] no diff for ${prevSnap.timestamp} -> ${snap.timestamp}: ` +
            'a capture is missing, so the pair cannot be checked against its documents.',
        );
        continue;
      }

      // AN UNCHANGED CAPTURE IS NOT A TRANSITION, SO IT GETS NO DIFF.
      //
      // `recordCapture` deliberately does not store a capture whose text is
      // identical to its predecessor — that novelty rule is correct and preserves
      // same-day revert material. On that outcome it returns THE PREDECESSOR'S
      // id, which is what UNCHANGED means. Both sides of this diff therefore
      // resolve to the same snapshot, and the row compares a capture against
      // itself: a transition that never happened, reported as one that did.
      //
      // DERIVED FROM THE OUTCOME, NOT FROM ID EQUALITY. Equality is the symptom.
      // Skipping on it alone would also swallow a genuine future bug that
      // produced equal ids for some other reason — `recordDiff` refuses that case
      // loudly instead, so the two guards catch different things.
      if (current.stored?.outcome === 'UNCHANGED') {
        console.warn(
          `[WaybackScraper] no diff for ${prevSnap.timestamp} -> ${snap.timestamp}: ` +
            'the later capture is text-identical to its predecessor, so there is no transition.',
        );
        continue;
      }

      // Truly identical after normalisation — record pair but skip AI
      if (deletions.length === 0 && additions.length === 0) {
        await recordDiff({
            trackedUrlId: trackedUrl.id,
            diffInputVersion: DIFF_INPUT_VERSION,
            beforeDate,
            afterDate,
            snapshotUrl,
            deletedText: '[]',
            addedText: '[]',
            aiSignificance: '',
            isLegallySignificant: false,
            beforeSnapshotId,
            afterSnapshotId,
          });
        continue;
      }

      // Minor changes exist but nothing substantial enough for AI
      if (deletionsForAI.length === 0 && additionsForAI.length === 0) {
        await recordDiff({
            trackedUrlId: trackedUrl.id,
            diffInputVersion: DIFF_INPUT_VERSION,
            beforeDate,
            afterDate,
            snapshotUrl,
            deletedText: '[]',
            addedText: '[]',
            rawDeletedText: JSON.stringify(deletions),
            rawAddedText: JSON.stringify(additions),
            aiSignificance: '',
            isLegallySignificant: false,
            beforeSnapshotId,
            afterSnapshotId,
          });
        continue;
      }

      let relatedEvidence: RelatedEvidenceContext[] = [];
      try {
        relatedEvidence = await this.fetchCorrelatedEvidence(afterDate, trackedUrl.id);
      } catch (err) {
        console.warn(
          `[WaybackScraper] DB context fetch failed for ${afterDate}:`,
          err instanceof Error ? err.message : err,
        );
      }

      try {
        const analysis = await this.forensicAgent.analyzeChange(
          deletionsForAI,
          additionsForAI,
          url,
          afterDate,
          relatedEvidence,
        );

        const diffRecord = await recordDiff({
            trackedUrlId: trackedUrl.id,
            diffInputVersion: DIFF_INPUT_VERSION,
            beforeDate,
            afterDate,
            snapshotUrl,
            deletedText: JSON.stringify(analysis.deletedItems),
            addedText: JSON.stringify(analysis.addedItems),
            rawDeletedText: JSON.stringify(deletions),
            rawAddedText: JSON.stringify(additions),
            aiSignificance: analysis.legalSignificance,
            isLegallySignificant: analysis.isLegallySignificant,
            classifierVersion: CLASSIFIER_VERSION,
            // WHAT THE CLASSIFIER READ, which on a scan is the chunks computed
            // above and written in this same statement. A version for the
            // procedure is not a version for what the procedure was fed — see
            // lib/classificationProvenance.
            classifiedInputVersion: DIFF_INPUT_VERSION,
            classifierModel: this.forensicAgent.modelId,
            classifierDraws: analysis.draws,
            classifierPromptHash: classifierPromptHash(),
            investigativeCategories: analysis.investigativeCategories,
            beforeSnapshotId,
            afterSnapshotId,
          });

        if (analysis.isLegallySignificant) {
          results.push({
            id: diffRecord.id,
            timestamp: snap.timestamp,
            beforeDate,
            date: afterDate,
            snapshotUrl,
            deletedItems: analysis.deletedItems,
            addedItems: analysis.addedItems,
            legalSignificance: analysis.legalSignificance,
          });
          recordScanFinding({
            diffId: diffRecord.id,
            url,
            afterDate,
            snapshotUrl,
            beforeSnapshot: requireSnapshotIdentity(prev.stored, 'before'),
            afterSnapshot: requireSnapshotIdentity(current.stored, 'after'),
            aiSignificance: analysis.legalSignificance,
            investigativeCategories: analysis.investigativeCategories,
            deletedText: JSON.stringify(analysis.deletedItems),
            addedText: JSON.stringify(analysis.addedItems),
            deletedItems: analysis.deletedItems,
            addedItems: analysis.addedItems,
          }).catch((err) =>
            console.warn('[WaybackScraper] recordScanFinding failed:', err instanceof Error ? err.message : err),
          );
        }
      } catch (err) {
        console.error(
          `[WaybackScraper] ForensicAgent failed for ${snap.timestamp}:`,
          err instanceof Error ? err.message : err,
        );
        await recordDiff({
            trackedUrlId: trackedUrl.id,
            diffInputVersion: DIFF_INPUT_VERSION,
            beforeDate,
            afterDate,
            snapshotUrl,
            deletedText: '[]',
            addedText: '[]',
            rawDeletedText: JSON.stringify(deletions),
            rawAddedText: JSON.stringify(additions),
            aiSignificance: '',
            isLegallySignificant: false,
            beforeSnapshotId,
            afterSnapshotId,
          });
      }

      await sleep(FETCH_DELAY_MS);
    }

    return { trackedUrlId: trackedUrl.id, diffs: results };
  }

  // ---------------------------------------------------------------------------
  // Job queue API — internal; called by runFullScan
  // ---------------------------------------------------------------------------

  /**
   * Create or reset the single WaybackScrapeJob for a TrackedUrl.
   *
   * Since each TrackedUrl has at most one job (unique constraint), this upserts:
   * - If a job already exists for this trackedUrlId, it is reset to PENDING
   *   with the given fromDate (for the next CDX batch).
   * - Otherwise a fresh job is created.
   *
   * The CDX snapshot list is populated lazily on the first processJob call.
   */
  async createJob(url: string, trackedUrlId: string, fromDate?: string) {
    return prisma.waybackScrapeJob.upsert({
      where: { trackedUrlId },
      update: {
        status: 'PENDING',
        fromDate: fromDate ?? null,
        snapshotsList: '[]',
        totalSnapshots: 0,
        processedSnapshots: 0,
        failureReason: null,
      },
      create: {
        url,
        status: 'PENDING',
        trackedUrlId,
        fromDate: fromDate ?? null,
      },
    });
  }

  /**
   * Process a WaybackScrapeJob: fetch snapshots, diff pairs, run ForensicAgent,
   * persist results. Saves state after every snapshot for crash-resumability.
   * When all snapshots are processed, marks the job COMPLETED.
   */
  async processJob(jobId: string) {
    const job = await prisma.waybackScrapeJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error(`WaybackScrapeJob not found: ${jobId}`);
    if (job.status === 'COMPLETED') return job;

    await prisma.waybackScrapeJob.update({
      where: { id: jobId },
      data: { status: 'IN_PROGRESS' },
    });

    let snapshotsList = JSON.parse(job.snapshotsList) as JobSnapshotEntry[];

    // Lazy CDX fetch — populate snapshots on first processJob call
    if (snapshotsList.length === 0) {
      let rawSnapshots: RawSnapshot[];
      let hasMore: boolean;
      try {
        ({ snapshots: rawSnapshots, hasMore } = await this.getSnapshotsList(
          job.url,
          job.trackedUrlId,
          job.fromDate ?? undefined,
        ));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[WaybackScraper] Job ${jobId} — CDX fetch failed:`, message);
        return prisma.waybackScrapeJob.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            failureReason: isWaybackOffline(err) ? 'WAYBACK_OFFLINE' : 'ALL_FETCHES_FAILED',
          },
        });
      }
      snapshotsList = rawSnapshots.map((s) => ({
        timestamp: s.timestamp,
        digest: s.digest,
        status: 'PENDING' as const,
      }));
      await prisma.waybackScrapeJob.update({
        where: { id: jobId },
        data: {
          // Store MAX_SNAPSHOTS+1 as a sentinel when CDX signalled more data exists.
          // computeNextFromDate checks totalSnapshots >= MAX_SNAPSHOTS to decide whether to
          // chain — this must reflect the raw CDX response, not the post-dedup count, because
          // dedup can reduce the count below MAX_SNAPSHOTS even when CDX has more batches.
          totalSnapshots: hasMore ? MAX_SNAPSHOTS + 1 : rawSnapshots.length,
          snapshotsList: JSON.stringify(snapshotsList),
        },
      });
    }

    const trackedUrlId = job.trackedUrlId;

    let previousText = '';
    let previousSnapshot: StoredCapture | null = null;
    let processedCount = snapshotsList.filter((s) => s.status === 'DONE').length;
    // Tallied across this call only — used solely to classify a total-failure
    // outcome (see the end of this method). A prior run's failures aren't
    // reflected here, but doneCount already accounts for any prior successes.
    let offlineFailures = 0;
    let otherFailures = 0;

    // `.entries()` rather than an index, deliberately: it yields `[number, T]`, so
    // `entry` is typed as present instead of needing a guard the linter would then
    // call redundant. Mutation through the yielded reference still works — this
    // loop sets entry.status — because it is the same object, not a copy.
    for (const [i, entry] of snapshotsList.entries()) {

      // Cancellation/pause checkpoint — throw so runFullScan exits cleanly without marking FAILED
      if (trackedUrlId && this._cancelledScanIds.has(trackedUrlId)) {
        throw new ScanCancelledError(trackedUrlId);
      }
      if (trackedUrlId && this._pausedScanIds.has(trackedUrlId)) {
        throw new ScanPausedError(trackedUrlId);
      }

      if (entry.status === 'DONE') {
        try {
          const readings = await this.scrapeSnapshotReadings(job.url, entry.timestamp);
          previousText = readings.extracted;
          previousSnapshot = await recordArchivedCapture(
            trackedUrlId, entry.timestamp, job.url, readings.extracted, readings.bytes, readings.contentType, readings.contentEncoding, entry.digest,
          );
        } catch {
          // Keep last good values if re-fetch fails during resume
        }
        continue;
      }

      let currentText = '';
      let currentSnapshot: StoredCapture | null = null;
      try {
        const readings = await this.scrapeSnapshotReadings(job.url, entry.timestamp);
        currentText = readings.extracted;
        currentSnapshot = await recordArchivedCapture(
          trackedUrlId, entry.timestamp, job.url, readings.extracted, readings.bytes, readings.contentType, readings.contentEncoding, entry.digest,
        );
      } catch (err) {
        console.warn(
          `[WaybackScraper] Job ${jobId} — snapshot ${entry.timestamp} fetch failed:`,
          err instanceof Error ? err.message : err,
        );
        if (err instanceof WaybackFetchError && err.offline) {
          offlineFailures++;
        } else {
          otherFailures++;
        }
        entry.status = 'FAILED';
        // A 404 from the replay is the Archive telling us it indexes this capture
        // and will not serve it — a DURABLE third-party fact, and the state
        // `20240829085520` has been in since the original scan while existing
        // only as a string in this job's JSON blob. Recorded as first-class,
        // queryable state so nobody keeps retrying it.
        //
        // Only a 404. A timeout or a 5xx is transient and must stay UNFETCHED:
        // collapsing the two would make a permanent gap indistinguishable from a
        // retryable one, which is the distinction this status exists to keep.
        if (err instanceof WaybackFetchError && err.status === 404) {
          await markCdxEntryUnservable({
            trackedUrlId,
            waybackTimestamp: entry.timestamp,
            digest: entry.digest,
          });
        }
        processedCount++;
        await prisma.waybackScrapeJob.update({
          where: { id: jobId },
          data: {
            snapshotsList: JSON.stringify(snapshotsList),
            processedSnapshots: processedCount,
          },
        });
        await sleep(FETCH_DELAY_MS);
        continue;
      }

      // Belt-and-suspenders against a reversed pair: getSnapshotsList() sorts ascending
      // before persisting, but a job resumed from a snapshotsList written before that
      // sort existed could still carry an out-of-order pair. Skip rather than diff
      // backwards and mislabel additions as deletions.
      const prevEntry = i > 0 ? snapshotsList[i - 1] : null;
      const isChronological = !prevEntry || prevEntry.timestamp < entry.timestamp;
      if (previousText && !isChronological) {
        console.error(
          `[WaybackScraper] Job ${jobId} — snapshot order violation: ${prevEntry?.timestamp} is not before ${entry.timestamp}. Skipping diff for this pair.`,
        );
      } else if (previousText) {
        // All changed chunks (any size) — for storage and display, claimed at
        // the granularity Level 5 checks at.
        const { removed: deletions, added: additions } = diffChunkPair(previousText, currentText);
        // Substantial subset — for AI input only
        const deletionsForAI = classifierInputChunks(deletions);
        const additionsForAI = classifierInputChunks(additions);

        const beforeDate = prevEntry ? timestampToDate(prevEntry.timestamp) : 'Unknown';
        const afterDate = timestampToDate(entry.timestamp);
        const snapshotUrl = viewerCaptureUrl(entry.timestamp, job.url);
        // Same rule as analyzePageHistory: a diff requires both captures, and the
        // capture layer already records why one is missing.
        const beforeSnapshotId = previousSnapshot?.id;
        const afterSnapshotId = currentSnapshot?.id;

        // THE FIRST BRANCH, not an early `continue`. Continuing would skip the
        // loop tail — `processedCount++` and the job progress write — so a capture
        // would be fetched and stored while the job reported no progress for it.
        // The missing-pair case belongs in the diff chain, because it is a
        // statement about the DIFF and not about the capture.
        if (!beforeSnapshotId || !afterSnapshotId) {
          console.warn(
            `[WaybackScraper] Job ${jobId} — no diff for ${entry.timestamp}: a capture is ` +
              'missing, so the pair cannot be checked against its documents.',
          );
        } else if (currentSnapshot.outcome === 'UNCHANGED') {
          // A BRANCH IN THE CHAIN, not an early `continue` — same reason the
          // missing-pair case is: continuing would skip the loop tail's
          // `processedCount++` and job progress write, so a capture would be
          // fetched while the job reported no progress for it. See the note above.
          //
          // The cause, not the symptom: an UNCHANGED capture resolves to its
          // predecessor's id, so both sides of this diff would be the same
          // snapshot. That is a transition that never happened.
          console.warn(
            `[WaybackScraper] Job ${jobId} — no diff for ${entry.timestamp}: the capture is ` +
              'text-identical to its predecessor, so there is no transition.',
          );
        } else if (deletions.length === 0 && additions.length === 0) {
          // Truly identical after normalisation — skip AI
          await recordDiff({
              trackedUrlId,
              diffInputVersion: DIFF_INPUT_VERSION,
              beforeDate,
              afterDate,
              snapshotUrl,
              deletedText: '[]',
              addedText: '[]',
              aiSignificance: '',
              isLegallySignificant: false,
              beforeSnapshotId,
              afterSnapshotId,
            });
        } else if (deletionsForAI.length === 0 && additionsForAI.length === 0) {
          // Minor changes only — store raw chunks, skip AI
          await recordDiff({
              trackedUrlId,
              diffInputVersion: DIFF_INPUT_VERSION,
              beforeDate,
              afterDate,
              snapshotUrl,
              deletedText: '[]',
              addedText: '[]',
              rawDeletedText: JSON.stringify(deletions),
              rawAddedText: JSON.stringify(additions),
              aiSignificance: '',
              isLegallySignificant: false,
              beforeSnapshotId,
              afterSnapshotId,
            });
        } else {
          let relatedEvidence: RelatedEvidenceContext[] = [];
          try {
            relatedEvidence = await this.fetchCorrelatedEvidence(afterDate, trackedUrlId);
          } catch {
            // Non-fatal — proceed without context
          }

          try {
            const analysis = await this.forensicAgent.analyzeChange(
              deletionsForAI,
              additionsForAI,
              job.url,
              afterDate,
              relatedEvidence,
            );

            const diffRecord = await recordDiff({
                trackedUrlId,
                diffInputVersion: DIFF_INPUT_VERSION,
                beforeDate,
                afterDate,
                snapshotUrl,
                deletedText: JSON.stringify(analysis.deletedItems),
                addedText: JSON.stringify(analysis.addedItems),
                rawDeletedText: JSON.stringify(deletions),
                rawAddedText: JSON.stringify(additions),
                aiSignificance: analysis.legalSignificance,
                isLegallySignificant: analysis.isLegallySignificant,
                classifierVersion: CLASSIFIER_VERSION,
                // As above: the chunks this classification read are the ones
                // written beside it, at the current input rule.
                classifiedInputVersion: DIFF_INPUT_VERSION,
                classifierModel: this.forensicAgent.modelId,
                classifierDraws: analysis.draws,
                classifierPromptHash: classifierPromptHash(),
                investigativeCategories: analysis.investigativeCategories,
                beforeSnapshotId,
                afterSnapshotId,
              });

            if (analysis.isLegallySignificant) {
              const trackedUrl = await prisma.trackedUrl.findUnique({ where: { id: trackedUrlId } });
              if (trackedUrl) {
                recordScanFinding({
                  beforeSnapshot: requireSnapshotIdentity(previousSnapshot, 'before'),
                  afterSnapshot: requireSnapshotIdentity(currentSnapshot, 'after'),
                  diffId: diffRecord.id,
                  url: trackedUrl.url,
                  afterDate,
                  snapshotUrl,
                  aiSignificance: analysis.legalSignificance,
                  investigativeCategories: analysis.investigativeCategories,
                  deletedText: JSON.stringify(analysis.deletedItems),
                  addedText: JSON.stringify(analysis.addedItems),
                  deletedItems: analysis.deletedItems,
                  addedItems: analysis.addedItems,
                }).catch((err) =>
                  console.warn('[WaybackScraper] recordScanFinding failed:', err instanceof Error ? err.message : err),
                );
              }
            }
          } catch (err) {
            console.error(
              `[WaybackScraper] Job ${jobId} — ForensicAgent failed for ${entry.timestamp}:`,
              err instanceof Error ? err.message : err,
            );
            await recordDiff({
                trackedUrlId,
                diffInputVersion: DIFF_INPUT_VERSION,
                beforeDate,
                afterDate,
                snapshotUrl,
                deletedText: '[]',
                addedText: '[]',
                rawDeletedText: JSON.stringify(deletions),
                rawAddedText: JSON.stringify(additions),
                aiSignificance: '',
                isLegallySignificant: false,
                beforeSnapshotId,
                afterSnapshotId,
              });
          }
        }
      }

      previousText = currentText;
      previousSnapshot = currentSnapshot;
      entry.status = 'DONE';
      processedCount++;

      await prisma.waybackScrapeJob.update({
        where: { id: jobId },
        data: {
          snapshotsList: JSON.stringify(snapshotsList),
          processedSnapshots: processedCount,
        },
      });

      await sleep(FETCH_DELAY_MS);
    }

    // Every entry failed and nothing was ever persisted for this job — including
    // prior runs, since doneCount below reflects the full snapshotsList, not just
    // this call. Report FAILED instead of a misleading COMPLETED/0-diffs result.
    const doneCount = snapshotsList.filter((s) => s.status === 'DONE').length;
    if (snapshotsList.length > 0 && doneCount === 0) {
      return prisma.waybackScrapeJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          processedSnapshots: processedCount,
          failureReason: offlineFailures > 0 && otherFailures === 0 ? 'WAYBACK_OFFLINE' : 'ALL_FETCHES_FAILED',
        },
      });
    }

    const completed = await prisma.waybackScrapeJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', processedSnapshots: processedCount, failureReason: null },
    });

    // Detect trajectories now that the snapshot set is final.
    //
    // A trajectory is state computed after a scan completes, and this is the
    // only writer that runs without a human asking for it. Doing it here is what
    // lets the public read path stay read-only: an unauthenticated route must
    // never compute, because a miss inserts rows.
    //
    // Deliberately after the job is marked COMPLETED, and deliberately swallowed.
    // Detection is derived data that can always be recomputed; a scan that fetched
    // and stored every snapshot has succeeded, and reporting it FAILED because a
    // derived view could not be built would strand the archived text — the
    // expensive, irreplaceable half — behind a cheap, repeatable failure.
    try {
      const tracked = await prisma.trackedUrl.findUnique({
        where: { id: trackedUrlId },
        select: { url: true },
      });
      if (tracked) await getClaimTrajectories(tracked.url);
    } catch (err) {
      console.warn(
        `[WaybackScraper] trajectory detection failed for tracked URL ${trackedUrlId}:`,
        err instanceof Error ? err.message : err,
      );
    }

    return completed;
  }

  // ---------------------------------------------------------------------------
  // Primary API — replaces manual job orchestration
  // ---------------------------------------------------------------------------

  /**
   * Run a full forensic scan for the given TrackedUrl.
   *
   * Handles all CDX batch pagination server-side: creates jobs, processes them,
   * chains batches automatically until CDX history is exhausted.
   *
   * Idempotent for SCANNING TrackedUrls — safe to call again to resume after
   * a server crash (in-memory guard prevents concurrent runs for the same id).
   *
   * A previously FAILED job is reset and retried: scan failures are transient
   * by construction, and refusing to retry left URLs permanently unscannable.
   *
   * @param trackedUrlId  The TrackedUrl to scan (must already exist with status SCANNING).
   * @param url           The original URL (needed to create jobs).
   */
  async runFullScan(trackedUrlId: string, url: string): Promise<void> {
    if (this._runningScanIds.has(trackedUrlId)) return; // concurrent guard
    this._runningScanIds.add(trackedUrlId);

    // Cost guard: each batch runs a ForensicAgent (LLM) call per snapshot pair
    // (up to 50/batch), so an unbounded loop over a long-CDX-history URL can
    // rack up hundreds of Claude calls from a single /api/forensics/scan
    // request. Cap batches per invocation and pause — reuses the existing
    // pause/resume flow, so a legitimate long scan just needs another /scan
    // call (subject to its own rate limit) to continue. See
    // docs/gf-cost-exposure-dev-plan.md.
    const MAX_BATCHES_PER_INVOCATION = 5;
    let batchesProcessedThisRun = 0;

    try {
      while (true) {
        // One job per TrackedUrl — find or create it
        let job = await prisma.waybackScrapeJob.findUnique({ where: { trackedUrlId } });

        if (!job) {
          // Fresh scan
          job = await this.createJob(url, trackedUrlId);
        } else if (job.status === 'COMPLETED') {
          // TWO DIFFERENT QUESTIONS REACH THIS BRANCH, and conflating them is
          // what made a scan report success while fetching nothing.
          //
          //   batchesProcessedThisRun > 0  — we just finished a page of THIS
          //                                  run's walk. "Is there another
          //                                  page?" is within-run pagination,
          //                                  and the sentinel answers it.
          //
          //   batchesProcessedThisRun === 0 — a FRESH request against a job some
          //                                  earlier run completed. "Has the
          //                                  Archive gained captures since?" is
          //                                  a question about the world, and no
          //                                  stored counter can answer it.
          //
          // The old code asked the sentinel both times. A finished scan always
          // ends with totalSnapshots < MAX_SNAPSHOTS — that is what finishing
          // means — so every later scan request short-circuited to COMPLETED
          // WITHOUT ONE REQUEST TO THE ARCHIVE. Silence was indistinguishable
          // from "nothing new", which is the same family as the diff truncation
          // this whole rebuild descends from.
          if (batchesProcessedThisRun > 0) {
            const nextFromDate = computeNextFromDate(job.snapshotsList, job.totalSnapshots);
            if (nextFromDate === null) {
              await prisma.trackedUrl.update({
                where: { id: trackedUrlId },
                data: { status: 'COMPLETED' },
              });
              return;
            }
            job = await this.createJob(url, trackedUrlId, nextFromDate);
          } else {
            // A fresh scan ALWAYS reaches the Archive at least once. If CDX
            // returns nothing, processJob still completes with totalSnapshots 0
            // — and that zero now means "we asked and there is nothing newer",
            // which it never did before.
            job = await this.createJob(
              url,
              trackedUrlId,
              await resumePointFromCaptures(trackedUrlId),
            );
          }
        } else if (job.status === 'FAILED') {
          // A previous attempt failed. Retry it rather than refusing forever.
          //
          // This branch used to mark the TrackedUrl FAILED and return, without
          // attempting a single fetch. Because there is exactly one job row per
          // TrackedUrl, updated in place, the first transient failure made the
          // URL permanently unscannable: every later scan request short-
          // circuited here, produced no logs, and reported FAILED. A 30s CDX
          // timeout against an archive that is merely slow was enough to brick
          // a page for good — and it did, on 2026-08-22.
          //
          // Reaching this branch means someone explicitly asked to scan a URL
          // whose last attempt failed, and the only sane reading of that
          // request is "try again". Failure here is transient by construction:
          // the job is marked FAILED only when fetches fail, never when the
          // archive simply holds nothing (that path completes with no
          // snapshots). The concurrent-run guard above already prevents a
          // retry from racing a live scan.
          //
          // fromDate is preserved so a failure partway through a long history
          // resumes at the batch that failed instead of restarting from the
          // beginning.
          console.log(
            `[WaybackScraper] Retrying previously FAILED job for ${trackedUrlId}` +
              (job.failureReason ? ` (was: ${job.failureReason})` : ''),
          );
          job = await this.createJob(url, trackedUrlId, job.fromDate ?? undefined);
        }
        // PENDING or IN_PROGRESS — process (or resume) it

        const processedJob = await this.processJob(job.id);

        if (processedJob.status === 'FAILED') {
          await prisma.trackedUrl.update({
            where: { id: trackedUrlId },
            data: { status: 'FAILED' },
          });
          return;
        }
        // COMPLETED — pause if this invocation has hit its batch cap, else loop
        // back: next iteration checks whether another CDX batch exists.
        batchesProcessedThisRun++;
        if (batchesProcessedThisRun >= MAX_BATCHES_PER_INVOCATION) {
          await setScanStatus(trackedUrlId, 'PAUSED');
          console.log(
            `[WaybackScraper] runFullScan for ${trackedUrlId} paused after ` +
              `${String(batchesProcessedThisRun)} batches this invocation (cost guard) — ` +
              `call /scan again to resume.`,
          );
          return;
        }
      }
    } catch (err) {
      if (err instanceof ScanCancelledError) {
        // Clean exit — TrackedUrl is being deleted, do nothing
        console.log(`[WaybackScraper] runFullScan for ${trackedUrlId} stopped by cancellation.`);
      } else if (err instanceof ScanPausedError) {
        // Clean exit — user paused; persist PAUSED status so frontend can show resume button
        console.log(`[WaybackScraper] runFullScan for ${trackedUrlId} paused by user.`);
        await setScanStatus(trackedUrlId, 'PAUSED');
      } else {
        console.error(
          `[WaybackScraper] runFullScan error for ${trackedUrlId}:`,
          err instanceof Error ? err.stack : err,
        );
        await setScanStatus(trackedUrlId, 'FAILED');
      }
    } finally {
      this._runningScanIds.delete(trackedUrlId);
      this._cancelledScanIds.delete(trackedUrlId);
      this._pausedScanIds.delete(trackedUrlId);
    }
  }
}
