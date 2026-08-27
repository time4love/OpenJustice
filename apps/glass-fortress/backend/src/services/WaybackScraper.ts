import axios from 'axios';
import { createHash } from 'crypto';
import { anchorOneSnapshot } from './anchorSnapshots';
import { extractArticleText, extractRawText, timestampToDate } from '../lib/archiveText';
import {
  CDX_MAX_RETRIES,
  CDX_TIMEOUT_MS,
  CDX_USER_AGENT,
  fetchCaptureHtml,
  isWaybackOffline,
  rawCaptureUrl,
  sleep,
  viewerCaptureUrl,
  WaybackFetchError,
  withRetry,
} from '../lib/archiveHttp';
import { requireSnapshotIdentity } from './forensicEvidence';
import { diffLines } from 'diff';
import { ForensicAgent, type DiffItem, type RelatedEvidenceContext } from './ForensicAgent';
import { Web3Service } from './Web3Service';
import { prisma } from '../lib/prisma';
import {
  buildForensicEvidence,
  type ForensicEvidenceSource,
} from './forensicEvidence';
import { groupDiffChunks, classifierInputChunks, DIFF_INPUT_VERSION } from '../lib/diffChunking';
import { CLASSIFIER_VERSION, classifierPromptHash } from '../lib/classifierVersion';
import { getClaimTrajectories } from './claimTrajectory';

// ---------------------------------------------------------------------------
// Lazy singletons — non-fatal if unavailable
// ---------------------------------------------------------------------------

let _web3Service: Web3Service | null = null;
let _web3Attempted = false;
function getWeb3Service(): Web3Service | null {
  if (_web3Attempted) return _web3Service;
  _web3Attempted = true;
  try {
    _web3Service = new Web3Service();
  } catch {
    // env vars not set — on-chain registration disabled
  }
  return _web3Service;
}

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

/** SHA-256 hex digest of a string. Bare hex — see toBytes32 before any chain call. */
function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}


/**
 * Upsert a UrlSnapshot row for a given scraped page text.
 * Idempotent — safe to call again on resume (update: {} is a no-op).
 */
async function upsertSnapshot(
  trackedUrlId: string,
  timestamp: string,
  url: string,
  fullText: string,
  rawText: string,
): Promise<{ id: string; waybackTimestamp: string; contentHash: string }> {
  const snapshotDate = timestampToDate(timestamp);
  const snapshotUrl = viewerCaptureUrl(timestamp, url);
  const contentHash = sha256(fullText);
  const rawContentHash = sha256(rawText);
  const snap = await prisma.urlSnapshot.upsert({
    where: { trackedUrlId_waybackTimestamp: { trackedUrlId, waybackTimestamp: timestamp } },
    update: {},
    create: {
      trackedUrlId,
      waybackTimestamp: timestamp,
      snapshotDate,
      snapshotUrl,
      fullText,
      contentHash,
      rawText,
      rawContentHash,
    },
    select: { id: true, onChainTxHash: true },
  });

  // No legacy-fill branch here, deliberately.
  //
  // Until 20260827120000_snapshot_document_required this function repaired rows
  // created before the document was stored, guarded by `rawText: null`. The
  // constraint makes that row impossible, so the branch became unreachable and
  // was removed rather than left as reassuring dead code — an unreachable repair
  // reads to the next person as though the hazard is still handled here.
  //
  // Repairing an environment whose captures predate the column is the job of
  // `forensics:backfill-raw-text`, which is built to run against exactly that
  // state. The `update: {}` above still means a resumed scan never rewrites
  // stored text: a refetch that DISAGREES with a stored document means the
  // Archive's own copy changed, which is a finding to surface and never
  // something to silently paper over.

  // Register on-chain only for newly created snapshots (no existing txHash)
  if (!snap.onChainTxHash) {
    // Fire-and-forget on purpose: a chain hiccup must not fail a scan that has
    // already fetched and stored archived text, which is the irreplaceable half.
    // But the rejection is LOGGED, never discarded — an empty catch here hid a
    // permanent bug behind what looked like a transient one for 83 snapshots.
    // Whether it actually worked is answered by counting unanchored snapshots
    // from state, not by trusting this call. See countUnanchoredSnapshots.
    registerSnapshotOnChain(snap.id, contentHash).catch((err: unknown) => {
      console.warn(
        '[WaybackScraper] snapshot anchoring rejected for', snap.id, ':',
        err instanceof Error ? err.message : err,
      );
    });
  }
  // The identity, not just the key. Evidence derived from a change between two
  // captures is hashed from their timestamps and content hashes, so every caller
  // that creates a snapshot needs those to hand rather than a second query.
  return { id: snap.id, waybackTimestamp: timestamp, contentHash };
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

async function registerSnapshotOnChain(snapshotId: string, contentHash: string): Promise<void> {
  const web3 = getWeb3Service();
  if (!web3) return;

  try {
    // Shared with the repair pass rather than reimplemented here. This function
    // used to call registerEvidenceHash unconditionally: for a capture whose
    // text a twin had already anchored, the registry rejected the duplicate, the
    // rejection was logged as a failure, and the row kept its null forever —
    // even though the fact was on-chain the whole time. Production still holds
    // 71 rows in that state. anchorOneSnapshot checks for the twin first and
    // copies its transaction, so no transaction is spent and no pointer is lost.
    await anchorOneSnapshot(web3, snapshotId, contentHash);
  } catch (err) {
    console.warn(
      '[WaybackScraper] On-chain snapshot registration failed for', snapshotId,
      ':', err instanceof Error ? err.message : err,
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
 * Compute the CDX `from` value for the next batch given a completed job's
 * snapshotsList. Returns null when the batch had fewer than MAX_SNAPSHOTS
 * (meaning CDX history is exhausted) or when no snapshots were processed.
 */
function computeNextFromDate(snapshotsListJson: string, totalSnapshots: number): string | null {
  try {
    if (totalSnapshots < MAX_SNAPSHOTS) return null;
    const list = JSON.parse(snapshotsListJson) as Array<{ timestamp: string; status: string }>;
    const done = list.filter((s) => s.status === 'DONE');
    if (done.length === 0) return null;
    const last = done[done.length - 1].timestamp; // YYYYMMDDHHMMSS (14 digits)
    // Increment by 1 second so the next batch starts strictly after this snapshot
    return (BigInt(last) + BigInt(1)).toString().padStart(14, '0');
  } catch {
    return null;
  }
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
   * Fetch the deduplicated list of archive snapshots for a URL via the CDX API.
   * Uses server-side `collapse=digest` to return only content-changed snapshots.
   */
  async getSnapshotsList(
    url: string,
    fromDate?: string,
  ): Promise<{ snapshots: RawSnapshot[]; hasMore: boolean }> {
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
    if (!Array.isArray(rows) || rows.length < 2) return { snapshots: [], hasMore: false };

    // Row 0 is ["timestamp","digest"] — skip it
    const dataRows = rows.slice(1) as string[][];

    // If CDX returned MAX_SNAPSHOTS+1 rows, there are more snapshots beyond this batch.
    // This must be checked BEFORE dedup since dedup can reduce the count below MAX_SNAPSHOTS
    // even when CDX has more data — which would otherwise cause premature batch termination.
    const hasMore = dataRows.length > MAX_SNAPSHOTS;

    // Client-side dedup guard (CDX collapse removes consecutive duplicates; this handles
    // non-consecutive ones where content reverts to a previously-seen digest)
    const seenDigests = new Set<string>();
    const snapshots: RawSnapshot[] = [];

    for (const row of dataRows) {
      const [timestamp, digest] = row;
      if (!timestamp || !digest) continue;
      if (seenDigests.has(digest)) continue;
      seenDigests.add(digest);
      snapshots.push({ timestamp, digest });
    }

    // CDX defaults to ascending-by-timestamp order, but that's an assumption about a
    // third-party API, not a guarantee — sort explicitly so beforeDate/afterDate in
    // processJob() can never be derived from a reversed pair.
    snapshots.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

    return { snapshots: snapshots.slice(0, MAX_SNAPSHOTS), hasMore };
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
  ): Promise<{ extracted: string; raw: string }> {
    const html = await fetchCaptureHtml(url, timestamp);
    return {
      extracted: extractArticleText(html, rawCaptureUrl(timestamp, url)),
      raw: extractRawText(html),
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
    const { snapshots } = await this.getSnapshotsList(url);

    const trackedUrl = await prisma.trackedUrl.upsert({
      where: { url },
      update: {},
      create: { url },
    });

    if (snapshots.length === 0) {
      return { trackedUrlId: trackedUrl.id, diffs: [] };
    }

    const texts: string[] = [];
    // Full identities, not just keys: evidence derived from a change between two
    // captures is hashed from their timestamps and content hashes.
    const snaps: ({ id: string; waybackTimestamp: string; contentHash: string } | null)[] = [];
    for (const snap of snapshots) {
      try {
        const readings = await this.scrapeSnapshotReadings(url, snap.timestamp);
        texts.push(readings.extracted);
        try {
          snaps.push(
            await upsertSnapshot(
              trackedUrl.id, snap.timestamp, url, readings.extracted, readings.raw,
            ),
          );
        } catch {
          snaps.push(null);
        }
      } catch (err) {
        console.warn(
          `[WaybackScraper] Skipping ${snap.timestamp}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        texts.push('');
        snaps.push(null);
      }
      await sleep(FETCH_DELAY_MS);
    }

    const results: SnapshotDiff[] = [];

    for (let i = 1; i < snapshots.length; i++) {
      const prev = texts[i - 1];
      const curr = texts[i];
      const snap = snapshots[i];
      const prevSnap = snapshots[i - 1];

      if (!prev || !curr) continue;

      const rawDiff = diffLines(prev, curr, { ignoreWhitespace: true });
      // All changed chunks (any size) — stored verbatim for display
      const deletions = groupDiffChunks(rawDiff, 'removed');
      const additions = groupDiffChunks(rawDiff, 'added');
      // The one selection step both classification paths go through.
      const deletionsForAI = classifierInputChunks(deletions);
      const additionsForAI = classifierInputChunks(additions);

      const beforeDate = timestampToDate(prevSnap.timestamp);
      const afterDate = timestampToDate(snap.timestamp);
      const snapshotUrl = viewerCaptureUrl(snap.timestamp, url);
      const beforeSnapshotId = snaps[i - 1]?.id ?? undefined;
      const afterSnapshotId = snaps[i]?.id ?? undefined;

      // Truly identical after normalisation — record pair but skip AI
      if (deletions.length === 0 && additions.length === 0) {
        await prisma.urlVersionDiff.create({
          data: {
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
          },
        });
        continue;
      }

      // Minor changes exist but nothing substantial enough for AI
      if (deletionsForAI.length === 0 && additionsForAI.length === 0) {
        await prisma.urlVersionDiff.create({
          data: {
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
          },
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

        const diffRecord = await prisma.urlVersionDiff.create({
          data: {
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
            classifierModel: this.forensicAgent.modelId,
            classifierDraws: analysis.draws,
            classifierPromptHash: classifierPromptHash(),
            investigativeCategories: analysis.investigativeCategories,
            beforeSnapshotId,
            afterSnapshotId,
          },
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
            url: trackedUrl.url,
            afterDate,
            snapshotUrl,
            beforeSnapshot: requireSnapshotIdentity(snaps[i - 1], 'before'),
            afterSnapshot: requireSnapshotIdentity(snaps[i], 'after'),
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
        await prisma.urlVersionDiff.create({
          data: {
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
          },
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
    let previousSnapshot: { id: string; waybackTimestamp: string; contentHash: string } | null = null;
    let processedCount = snapshotsList.filter((s) => s.status === 'DONE').length;
    // Tallied across this call only — used solely to classify a total-failure
    // outcome (see the end of this method). A prior run's failures aren't
    // reflected here, but doneCount already accounts for any prior successes.
    let offlineFailures = 0;
    let otherFailures = 0;

    for (let i = 0; i < snapshotsList.length; i++) {
      const entry = snapshotsList[i];

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
          previousSnapshot = await upsertSnapshot(
            trackedUrlId, entry.timestamp, job.url, readings.extracted, readings.raw,
          );
        } catch {
          // Keep last good values if re-fetch fails during resume
        }
        continue;
      }

      let currentText = '';
      let currentSnapshot: { id: string; waybackTimestamp: string; contentHash: string } | null = null;
      try {
        const readings = await this.scrapeSnapshotReadings(job.url, entry.timestamp);
        currentText = readings.extracted;
        currentSnapshot = await upsertSnapshot(
          trackedUrlId, entry.timestamp, job.url, readings.extracted, readings.raw,
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
        const rawDiff = diffLines(previousText, currentText, { ignoreWhitespace: true });
        // All changed chunks (any size) — for storage and display
        const deletions = groupDiffChunks(rawDiff, 'removed');
        const additions = groupDiffChunks(rawDiff, 'added');
        // Substantial subset — for AI input only
        const deletionsForAI = classifierInputChunks(deletions);
        const additionsForAI = classifierInputChunks(additions);

        const beforeDate = i > 0 ? timestampToDate(snapshotsList[i - 1].timestamp) : 'Unknown';
        const afterDate = timestampToDate(entry.timestamp);
        const snapshotUrl = viewerCaptureUrl(entry.timestamp, job.url);
        const beforeSnapshotId = previousSnapshot?.id ?? undefined;
        const afterSnapshotId = currentSnapshot?.id ?? undefined;

        if (deletions.length === 0 && additions.length === 0) {
          // Truly identical after normalisation — skip AI
          await prisma.urlVersionDiff.create({
            data: {
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
            },
          });
        } else if (deletionsForAI.length === 0 && additionsForAI.length === 0) {
          // Minor changes only — store raw chunks, skip AI
          await prisma.urlVersionDiff.create({
            data: {
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
            },
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

            const diffRecord = await prisma.urlVersionDiff.create({
              data: {
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
                classifierModel: this.forensicAgent.modelId,
                classifierDraws: analysis.draws,
                classifierPromptHash: classifierPromptHash(),
                investigativeCategories: analysis.investigativeCategories,
                beforeSnapshotId,
                afterSnapshotId,
              },
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
            await prisma.urlVersionDiff.create({
              data: {
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
              },
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
          // Previous batch done — check if CDX has more
          const nextFromDate = computeNextFromDate(job.snapshotsList, job.totalSnapshots);
          if (nextFromDate === null) {
            await prisma.trackedUrl.update({
              where: { id: trackedUrlId },
              data: { status: 'COMPLETED' },
            });
            return;
          }
          // Reset the same job record for the next batch
          job = await this.createJob(url, trackedUrlId, nextFromDate);
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
