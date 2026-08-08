import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { diffLines } from 'diff';
import { ForensicAgent, type RelatedEvidenceContext } from './ForensicAgent';
import { prisma } from '../lib/prisma';

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
  /** Substantive claims deleted vs. the previous snapshot (Hebrew summaries) */
  deletedClaims: string[];
  /** Substantive claims added vs. the previous snapshot (Hebrew summaries) */
  addedClaims: string[];
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

/** Retry attempts for transient CDX / snapshot 503s before giving up. */
const CDX_MAX_RETRIES = 4;

/** Base delay (ms) for exponential back-off on 503 retries. Doubles each attempt. */
const CDX_RETRY_BASE_MS = 8_000;

/** Minimum character length for a diff chunk to be considered substantive. */
const MIN_CHUNK_LENGTH = 40;

/** Maximum raw diff chunks per side sent to the AI. */
const MAX_CHUNKS_PER_SIDE = 8;

/** Days on each side of the snapshot date to search for correlated DB evidence. */
const CONTEXT_WINDOW_DAYS = 60;

/** Maximum correlated evidence records to pass to the AI (keep prompt manageable). */
const MAX_CONTEXT_RECORDS = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Thin retry wrapper for Wayback Machine HTTP requests.
 * Retries up to CDX_MAX_RETRIES times on 503 responses, with exponential back-off.
 * All other errors are rethrown immediately.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= CDX_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 503 && attempt < CDX_MAX_RETRIES) {
        const delay = CDX_RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(
          `[WaybackScraper] 503 received — retrying in ${delay}ms (attempt ${attempt + 1}/${CDX_MAX_RETRIES})`,
        );
        await sleep(delay);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** Convert a raw Wayback timestamp (YYYYMMDDHHMMSS) to YYYY-MM-DD. */
function timestampToDate(ts: string): string {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

/**
 * Convert an HTML string to plain text with structural line breaks preserved.
 *
 * Readability's .content is clean article HTML. Using .textContent instead
 * smashes adjacent words together when they are separated only by tags
 * (e.g. <p>word.</p><p>Word</p> → "word.Word"). This function inserts
 * newlines at block boundaries so diffLines produces surgical, line-level
 * diffs rather than one massive changed block per page.
 */
function htmlToText(html: string): string {
  return html
    // Block-level endings → paragraph break
    .replace(/<\/(?:p|h[1-6]|blockquote|pre|table|tr|ul|ol|dl)>/gi, '\n\n')
    // Inline block endings / single-line elements → line break
    .replace(/<\/(?:div|li|td|th|dt|dd|section|article|header|footer|nav|main|figure|figcaption)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // List items get a bullet prefix
    .replace(/<li[^>]*>/gi, '• ')
    // Strip all remaining tags
    .replace(/<[^>]*>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:x27|39);/gi, "'")
    .replace(/&#x2019;/gi, '\u2019')
    .replace(/&#x201[89];/gi, '\u201c');
}

/**
 * Normalise extracted text so trivial whitespace differences don't pollute the
 * diff with meaningless changes.
 */
function normaliseText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')   // strip leading spaces after newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Group consecutive diff changes of the same type into single string chunks.
 * Returns ALL non-empty chunks (no minimum length), largest first, capped at
 * MAX_CHUNKS_PER_SIDE. Use this for storage and display.
 */
function groupDiffChunks(
  raw: ReturnType<typeof diffLines>,
  type: 'added' | 'removed',
): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const part of raw) {
    const isMatch = type === 'added' ? part.added : part.removed;
    if (isMatch) {
      current += part.value;
    } else {
      const trimmed = current.trim();
      if (trimmed.length > 0) chunks.push(trimmed);
      current = '';
    }
  }
  const trimmed = current.trim();
  if (trimmed.length > 0) chunks.push(trimmed);

  return chunks
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_CHUNKS_PER_SIDE);
}

/**
 * Returns only chunks long enough to be meaningful AI input (≥ MIN_CHUNK_LENGTH).
 * Use this exclusively when deciding whether to invoke the ForensicAgent.
 */
function chunksForAI(chunks: string[]): string[] {
  return chunks.filter((c) => c.length >= MIN_CHUNK_LENGTH);
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

// ---------------------------------------------------------------------------
// WaybackScraper
// ---------------------------------------------------------------------------

export class WaybackScraper {
  private readonly forensicAgent: ForensicAgent;
  /** In-memory guard preventing concurrent runFullScan calls for the same TrackedUrl. */
  private readonly _runningScanIds = new Set<string>();
  /** TrackedUrl IDs that have been cancelled — processJob checks this and aborts. */
  private readonly _cancelledScanIds = new Set<string>();

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

    const response = await withRetry(() =>
      axios.get<unknown[][]>(cdxUrl, {
        timeout: 30_000,
        headers: { 'User-Agent': 'GlassFortress-ForensicScanner/1.0 (legal research)' },
      }),
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

    return { snapshots: snapshots.slice(0, MAX_SNAPSHOTS), hasMore };
  }

  /**
   * Fetch a single archived snapshot and extract clean readable text.
   * Uses the `id_` modifier to suppress the Wayback Machine toolbar.
   */
  async scrapeSnapshot(url: string, timestamp: string): Promise<string> {
    const archiveUrl = `http://web.archive.org/web/${timestamp}id_/${url}`;

    let html: string;
    try {
      const response = await withRetry(() =>
        axios.get<string>(archiveUrl, {
          timeout: 25_000,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          responseType: 'text',
          maxContentLength: 5 * 1024 * 1024,
        }),
      );
      html = response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        throw new Error(
          `Failed to fetch snapshot ${timestamp}: HTTP ${err.response?.status ?? 'unknown'}`,
        );
      }
      throw err;
    }

    const dom = new JSDOM(html, { url: archiveUrl });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    // Prefer article.content (clean HTML from Readability) so htmlToText can
    // insert proper line breaks. article.textContent smashes words together.
    if (article?.content?.trim()) {
      return normaliseText(htmlToText(article.content));
    }

    // Fallback: convert full body HTML if Readability found nothing
    const bodyHtml = dom.window.document.body?.innerHTML ?? '';
    return normaliseText(htmlToText(bodyHtml));
  }

  /**
   * Query the evidence database for records whose `evidenceDate` falls within
   * ±CONTEXT_WINDOW_DAYS of the given snapshot date.
   */
  async fetchCorrelatedEvidence(snapshotDate: string): Promise<RelatedEvidenceContext[]> {
    const windowStart = offsetDate(snapshotDate, -CONTEXT_WINDOW_DAYS);
    const windowEnd = offsetDate(snapshotDate, +CONTEXT_WINDOW_DAYS);

    const rows = await prisma.evidence.findMany({
      where: {
        AND: [
          { evidenceDate: { gte: windowStart } },
          { evidenceDate: { lte: windowEnd } },
          { NOT: { evidenceDate: 'Unknown' } },
        ],
      },
      orderBy: { evidenceDate: 'asc' },
      take: MAX_CONTEXT_RECORDS,
    });

    return rows.map((r) => ({
      date: r.evidenceDate,
      summary: r.summary,
      category: r.category,
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

    const trackedUrl = await prisma.trackedUrl.create({
      data: { url },
    });

    if (snapshots.length === 0) {
      return { trackedUrlId: trackedUrl.id, diffs: [] };
    }

    const texts: string[] = [];
    for (const snap of snapshots) {
      try {
        texts.push(await this.scrapeSnapshot(url, snap.timestamp));
      } catch (err) {
        console.warn(
          `[WaybackScraper] Skipping ${snap.timestamp}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        texts.push('');
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
      // Subset sent to AI — only substantial chunks worth analysing
      const deletionsForAI = chunksForAI(deletions);
      const additionsForAI = chunksForAI(additions);

      const beforeDate = timestampToDate(prevSnap.timestamp);
      const afterDate = timestampToDate(snap.timestamp);
      const snapshotUrl = `https://web.archive.org/web/${snap.timestamp}/${url}`;

      // Truly identical after normalisation — record pair but skip AI
      if (deletions.length === 0 && additions.length === 0) {
        await prisma.urlVersionDiff.create({
          data: {
            trackedUrlId: trackedUrl.id,
            beforeDate,
            afterDate,
            snapshotUrl,
            deletedText: '[]',
            addedText: '[]',
            aiSignificance: '',
            isLegallySignificant: false,
          },
        });
        continue;
      }

      // Minor changes exist but nothing substantial enough for AI
      if (deletionsForAI.length === 0 && additionsForAI.length === 0) {
        await prisma.urlVersionDiff.create({
          data: {
            trackedUrlId: trackedUrl.id,
            beforeDate,
            afterDate,
            snapshotUrl,
            deletedText: '[]',
            addedText: '[]',
            rawDeletedText: JSON.stringify(deletions),
            rawAddedText: JSON.stringify(additions),
            aiSignificance: '',
            isLegallySignificant: false,
          },
        });
        continue;
      }

      let relatedEvidence: RelatedEvidenceContext[] = [];
      try {
        relatedEvidence = await this.fetchCorrelatedEvidence(afterDate);
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
            beforeDate,
            afterDate,
            snapshotUrl,
            deletedText: JSON.stringify(analysis.deletedClaims),
            addedText: JSON.stringify(analysis.addedClaims),
            rawDeletedText: JSON.stringify(deletions),
            rawAddedText: JSON.stringify(additions),
            aiSignificance: analysis.legalSignificance,
            isLegallySignificant: analysis.isLegallySignificant,
          },
        });

        if (analysis.isLegallySignificant) {
          results.push({
            id: diffRecord.id,
            timestamp: snap.timestamp,
            beforeDate,
            date: afterDate,
            snapshotUrl,
            deletedClaims: analysis.deletedClaims,
            addedClaims: analysis.addedClaims,
            legalSignificance: analysis.legalSignificance,
          });
        }
      } catch (err) {
        console.error(
          `[WaybackScraper] ForensicAgent failed for ${snap.timestamp}:`,
          err instanceof Error ? err.message : err,
        );
        await prisma.urlVersionDiff.create({
          data: {
            trackedUrlId: trackedUrl.id,
            beforeDate,
            afterDate,
            snapshotUrl,
            deletedText: '[]',
            addedText: '[]',
            rawDeletedText: JSON.stringify(deletions),
            rawAddedText: JSON.stringify(additions),
            aiSignificance: '',
            isLegallySignificant: false,
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
   * Create a WaybackScrapeJob for a given TrackedUrl.
   *
   * Returns immediately — the CDX snapshot list is fetched lazily in processJob.
   * If an incomplete (PENDING or IN_PROGRESS) job for this trackedUrlId + fromDate
   * already exists, returns that job to allow resumption.
   */
  async createJob(url: string, fromDate?: string, trackedUrlId?: string) {
    const existing = await prisma.waybackScrapeJob.findFirst({
      where: {
        url,
        fromDate: fromDate ?? null,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        ...(trackedUrlId ? { trackedUrlId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

    return prisma.waybackScrapeJob.create({
      data: {
        url,
        status: 'PENDING',
        totalSnapshots: 0,
        processedSnapshots: 0,
        snapshotsList: '[]',
        fromDate: fromDate ?? null,
        trackedUrlId: trackedUrlId ?? null,
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
          data: { status: 'FAILED' },
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

    // Resolve the TrackedUrl — should be set upfront in new flow; fallback for legacy jobs
    let trackedUrlId = job.trackedUrlId;
    if (!trackedUrlId) {
      const existing = await prisma.trackedUrl.findFirst({
        where: { url: job.url },
        orderBy: { createdAt: 'asc' },
      });
      const trackedUrl =
        existing ?? (await prisma.trackedUrl.create({ data: { url: job.url } }));
      trackedUrlId = trackedUrl.id;
      await prisma.waybackScrapeJob.update({
        where: { id: jobId },
        data: { trackedUrlId },
      });
    }

    let previousText = '';
    let processedCount = snapshotsList.filter((s) => s.status === 'DONE').length;

    for (let i = 0; i < snapshotsList.length; i++) {
      const entry = snapshotsList[i];

      // Cancellation checkpoint — throw so runFullScan exits cleanly without marking FAILED
      if (trackedUrlId && this._cancelledScanIds.has(trackedUrlId)) {
        throw new ScanCancelledError(trackedUrlId);
      }

      if (entry.status === 'DONE') {
        try {
          previousText = await this.scrapeSnapshot(job.url, entry.timestamp);
        } catch {
          // Keep last good text if re-fetch fails during resume
        }
        continue;
      }

      let currentText = '';
      try {
        currentText = await this.scrapeSnapshot(job.url, entry.timestamp);
      } catch (err) {
        console.warn(
          `[WaybackScraper] Job ${jobId} — snapshot ${entry.timestamp} fetch failed:`,
          err instanceof Error ? err.message : err,
        );
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

      if (previousText) {
        const rawDiff = diffLines(previousText, currentText, { ignoreWhitespace: true });
        // All changed chunks (any size) — for storage and display
        const deletions = groupDiffChunks(rawDiff, 'removed');
        const additions = groupDiffChunks(rawDiff, 'added');
        // Substantial subset — for AI input only
        const deletionsForAI = chunksForAI(deletions);
        const additionsForAI = chunksForAI(additions);

        const beforeDate = i > 0 ? timestampToDate(snapshotsList[i - 1].timestamp) : 'Unknown';
        const afterDate = timestampToDate(entry.timestamp);
        const snapshotUrl = `https://web.archive.org/web/${entry.timestamp}/${job.url}`;

        if (deletions.length === 0 && additions.length === 0) {
          // Truly identical after normalisation — skip AI
          await prisma.urlVersionDiff.create({
            data: {
              trackedUrlId,
              beforeDate,
              afterDate,
              snapshotUrl,
              deletedText: '[]',
              addedText: '[]',
              aiSignificance: '',
              isLegallySignificant: false,
            },
          });
        } else if (deletionsForAI.length === 0 && additionsForAI.length === 0) {
          // Minor changes only — store raw chunks, skip AI
          await prisma.urlVersionDiff.create({
            data: {
              trackedUrlId,
              beforeDate,
              afterDate,
              snapshotUrl,
              deletedText: '[]',
              addedText: '[]',
              rawDeletedText: JSON.stringify(deletions),
              rawAddedText: JSON.stringify(additions),
              aiSignificance: '',
              isLegallySignificant: false,
            },
          });
        } else {
          let relatedEvidence: RelatedEvidenceContext[] = [];
          try {
            relatedEvidence = await this.fetchCorrelatedEvidence(afterDate);
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

            await prisma.urlVersionDiff.create({
              data: {
                trackedUrlId,
                beforeDate,
                afterDate,
                snapshotUrl,
                deletedText: JSON.stringify(analysis.deletedClaims),
                addedText: JSON.stringify(analysis.addedClaims),
                rawDeletedText: JSON.stringify(deletions),
                rawAddedText: JSON.stringify(additions),
                aiSignificance: analysis.legalSignificance,
                isLegallySignificant: analysis.isLegallySignificant,
              },
            });
          } catch (err) {
            console.error(
              `[WaybackScraper] Job ${jobId} — ForensicAgent failed for ${entry.timestamp}:`,
              err instanceof Error ? err.message : err,
            );
            await prisma.urlVersionDiff.create({
              data: {
                trackedUrlId,
                beforeDate,
                afterDate,
                snapshotUrl,
                deletedText: '[]',
                addedText: '[]',
                rawDeletedText: JSON.stringify(deletions),
                rawAddedText: JSON.stringify(additions),
                aiSignificance: '',
                isLegallySignificant: false,
              },
            });
          }
        }
      }

      previousText = currentText;
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

    return prisma.waybackScrapeJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', processedSnapshots: processedCount },
    });
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
   * @param trackedUrlId  The TrackedUrl to scan (must already exist with status SCANNING).
   * @param url           The original URL (needed to create jobs).
   */
  async runFullScan(trackedUrlId: string, url: string): Promise<void> {
    if (this._runningScanIds.has(trackedUrlId)) return; // concurrent guard
    this._runningScanIds.add(trackedUrlId);

    try {
      while (true) {
        // Check for an existing incomplete job (resume path)
        let job = await prisma.waybackScrapeJob.findFirst({
          where: { trackedUrlId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
          orderBy: { createdAt: 'desc' },
        });

        if (!job) {
          // Determine where to start the next batch
          const lastCompleted = await prisma.waybackScrapeJob.findFirst({
            where: { trackedUrlId, status: 'COMPLETED' },
            orderBy: { createdAt: 'desc' },
          });

          if (lastCompleted) {
            const nextFromDate = computeNextFromDate(
              lastCompleted.snapshotsList,
              lastCompleted.totalSnapshots,
            );
            if (nextFromDate === null) {
              // Last batch had < MAX_SNAPSHOTS — CDX history exhausted
              await prisma.trackedUrl.update({
                where: { id: trackedUrlId },
                data: { status: 'COMPLETED' },
              });
              return;
            }
            job = await this.createJob(url, nextFromDate, trackedUrlId);
          } else {
            // Fresh scan — no batches yet
            job = await this.createJob(url, undefined, trackedUrlId);
          }
        }

        const processedJob = await this.processJob(job.id);

        if (processedJob.status === 'FAILED') {
          await prisma.trackedUrl.update({
            where: { id: trackedUrlId },
            data: { status: 'FAILED' },
          });
          return;
        }

        // COMPLETED — check if another batch is needed
        const nextFromDate = computeNextFromDate(
          processedJob.snapshotsList,
          processedJob.totalSnapshots,
        );
        if (nextFromDate === null) {
          await prisma.trackedUrl.update({
            where: { id: trackedUrlId },
            data: { status: 'COMPLETED' },
          });
          return;
        }
        // Loop: next iteration will find no incomplete job, compute nextFromDate
        // from this newly-COMPLETED job, and create the following batch.
      }
    } catch (err) {
      if (err instanceof ScanCancelledError) {
        // Clean exit — TrackedUrl is being deleted, do nothing
        console.log(`[WaybackScraper] runFullScan for ${trackedUrlId} stopped by cancellation.`);
      } else {
        console.error(
          `[WaybackScraper] runFullScan error for ${trackedUrlId}:`,
          err instanceof Error ? err.stack : err,
        );
        await prisma.trackedUrl
          .update({ where: { id: trackedUrlId }, data: { status: 'FAILED' } })
          .catch(() => {});
      }
    } finally {
      this._runningScanIds.delete(trackedUrlId);
      this._cancelledScanIds.delete(trackedUrlId);
    }
  }
}
