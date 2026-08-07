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

/** Convert a raw Wayback timestamp (YYYYMMDDHHMMSS) to YYYY-MM-DD. */
function timestampToDate(ts: string): string {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

/**
 * Normalise extracted text so trivial whitespace differences don't pollute the
 * diff with meaningless changes.
 */
function normaliseText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Group consecutive diff changes of the same type into single string chunks.
 * Filters out chunks that are too short to be meaningful.
 */
function extractChunks(
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
      if (trimmed.length >= MIN_CHUNK_LENGTH) chunks.push(trimmed);
      current = '';
    }
  }
  const trimmed = current.trim();
  if (trimmed.length >= MIN_CHUNK_LENGTH) chunks.push(trimmed);

  // Surface the most substantial chunks first
  return chunks
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_CHUNKS_PER_SIDE);
}

/**
 * Compute the date string for a point N days offset from a YYYY-MM-DD date.
 */
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// WaybackScraper
// ---------------------------------------------------------------------------

export class WaybackScraper {
  private readonly forensicAgent: ForensicAgent;

  constructor() {
    this.forensicAgent = new ForensicAgent();
  }

  /**
   * Fetch the deduplicated list of archive snapshots for a URL via the CDX API.
   * Uses server-side `collapse=digest` to return only content-changed snapshots.
   *
   * @param url The original URL to look up.
   */
  async getSnapshotsList(url: string, fromDate?: string): Promise<RawSnapshot[]> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('URL must use http or https protocol.');
    }

    // collapse=digest dedups at the CDX server — one result per unique content hash
    // Oldest-first (default CDX order). fromDate is YYYYMMDD to start from a specific date.
    const cdxUrl =
      `http://web.archive.org/cdx/search/cdx` +
      `?url=${encodeURIComponent(url)}` +
      `&output=json` +
      `&fl=timestamp,digest` +
      `&collapse=digest` +
      `&limit=${MAX_SNAPSHOTS + 1}` + // +1 to account for the header row
      (fromDate ? `&from=${fromDate}` : '');

    const response = await axios.get<unknown[][]>(cdxUrl, {
      timeout: 30_000,
      headers: { 'User-Agent': 'GlassFortress-ForensicScanner/1.0 (legal research)' },
    });

    const rows = response.data;
    if (!Array.isArray(rows) || rows.length < 2) return [];

    // Row 0 is ["timestamp","digest"] — skip it
    const dataRows = rows.slice(1) as string[][];

    // Client-side dedup guard (CDX collapse should handle this, but belt-and-suspenders)
    const seenDigests = new Set<string>();
    const snapshots: RawSnapshot[] = [];

    for (const row of dataRows) {
      const [timestamp, digest] = row;
      if (!timestamp || !digest) continue;
      if (seenDigests.has(digest)) continue;
      seenDigests.add(digest);
      snapshots.push({ timestamp, digest });
    }

    return snapshots.slice(0, MAX_SNAPSHOTS);
  }

  /**
   * Fetch a single archived snapshot and extract clean readable text.
   * Uses the `id_` modifier to suppress the Wayback Machine toolbar.
   *
   * @param url       The original URL.
   * @param timestamp The snapshot timestamp (YYYYMMDDHHMMSS).
   */
  async scrapeSnapshot(url: string, timestamp: string): Promise<string> {
    // id_ strips the Wayback toolbar so it doesn't corrupt the diff
    const archiveUrl = `http://web.archive.org/web/${timestamp}id_/${url}`;

    let html: string;
    try {
      const response = await axios.get<string>(archiveUrl, {
        timeout: 25_000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        responseType: 'text',
        maxContentLength: 5 * 1024 * 1024,
      });
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

    if (!article?.textContent?.trim()) {
      // Readability couldn't extract an article — fall back to full body text
      const bodyText = dom.window.document.body?.textContent ?? '';
      return normaliseText(bodyText);
    }

    return normaliseText(article.textContent);
  }

  /**
   * Query the evidence database for records whose `evidenceDate` falls within
   * ±CONTEXT_WINDOW_DAYS of the given snapshot date.
   *
   * Used to provide the ForensicAgent with correlated internal evidence for
   * its cross-referencing analysis.
   *
   * @param snapshotDate YYYY-MM-DD
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
   * Full 3-step pipeline:
   *   1. Fetch all unique archive snapshots (CDX API)
   *   2. Scrape and diff consecutive snapshot pairs
   *   3. For each diff with substantive changes:
   *        a. Fetch correlated evidence from the DB (±60-day window)
   *        b. Run ForensicAgent to classify and cross-reference
   *   4. Persist the TrackedUrl + legally significant UrlVersionDiff records to Prisma
   *   5. Return the trackedUrlId and the persisted diffs
   *
   * @param url The target URL to analyse.
   */
  async analyzePageHistory(url: string): Promise<PageHistoryResult> {
    const snapshots = await this.getSnapshotsList(url);

    // Create a TrackedUrl record immediately so we have an ID to link diffs to
    const trackedUrl = await prisma.trackedUrl.create({
      data: { url },
    });

    if (snapshots.length === 0) {
      return { trackedUrlId: trackedUrl.id, diffs: [] };
    }

    // Step 1: Scrape all snapshots sequentially with rate-limit delay
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
        texts.push(''); // keep index alignment
      }
      await sleep(FETCH_DELAY_MS);
    }

    // Step 2: Diff consecutive pairs, run forensic analysis on changed snapshots
    const results: SnapshotDiff[] = [];

    for (let i = 1; i < snapshots.length; i++) {
      const prev = texts[i - 1];
      const curr = texts[i];
      const snap = snapshots[i];
      const prevSnap = snapshots[i - 1];

      if (!prev || !curr) continue;

      const rawDiff = diffLines(prev, curr, { ignoreWhitespace: true });
      const deletions = extractChunks(rawDiff, 'removed');
      const additions = extractChunks(rawDiff, 'added');

      const beforeDate = timestampToDate(prevSnap.timestamp);
      const afterDate = timestampToDate(snap.timestamp);
      const snapshotUrl = `https://web.archive.org/web/${snap.timestamp}/${url}`;

      if (deletions.length === 0 && additions.length === 0) {
        // No substantive chunks — record the pair as a minor/cosmetic change
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

      // Step 3a: RAG context — correlated DB evidence within ±60 days
      let relatedEvidence: RelatedEvidenceContext[] = [];
      try {
        relatedEvidence = await this.fetchCorrelatedEvidence(afterDate);
      } catch (err) {
        console.warn(
          `[WaybackScraper] DB context fetch failed for ${afterDate}:`,
          err instanceof Error ? err.message : err,
        );
      }

      // Step 3b: ForensicAgent — classify and cross-reference
      try {
        const analysis = await this.forensicAgent.analyzeChange(
          deletions,
          additions,
          url,
          afterDate,
          relatedEvidence,
        );

        // Step 4: Persist ALL diffs — AI claims stored as primary labels; raw chunks preserved verbatim
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

        // Only surface AI-flagged diffs in the legacy sync response (drill-down shows all)
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
        // Save raw chunks without AI analysis so the snapshot pair is never lost
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
  // Job queue API — for long-running, resumable scans
  // ---------------------------------------------------------------------------

  /**
   * Phase 1 of the job queue flow: create a WaybackScrapeJob record.
   *
   * Returns immediately — the CDX snapshot list is fetched lazily in processJob.
   * This keeps the creation endpoint fast so the frontend can start polling at once.
   *
   * If an incomplete (PENDING or IN_PROGRESS) job for this URL already exists,
   * returns that job to allow the client to resume it instead of starting over.
   *
   * @param url The URL to scan.
   * @returns The created (or existing incomplete) WaybackScrapeJob record.
   */
  async createJob(url: string, fromDate?: string) {
    // Resumability — return existing incomplete job for this URL + fromDate window
    const existing = await prisma.waybackScrapeJob.findFirst({
      where: {
        url,
        fromDate: fromDate ?? null,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

    // Create the job shell immediately — CDX fetch happens in processJob
    return prisma.waybackScrapeJob.create({
      data: {
        url,
        status: 'PENDING',
        totalSnapshots: 0,
        processedSnapshots: 0,
        snapshotsList: '[]',
        fromDate: fromDate ?? null,
      },
    });
  }

  /**
   * Phase 2 of the job queue flow: process a WaybackScrapeJob.
   *
   * Iterates over PENDING snapshots, diffs each one against the last successfully
   * processed text, runs ForensicAgent analysis, and persists results. After every
   * snapshot, writes the updated job state back to Prisma so progress survives
   * crashes. When all snapshots are processed, marks the job as COMPLETED.
   *
   * @param jobId The WaybackScrapeJob.id to process.
   * @returns The updated WaybackScrapeJob record after processing completes.
   */
  async processJob(jobId: string) {
    const job = await prisma.waybackScrapeJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error(`WaybackScrapeJob not found: ${jobId}`);
    if (job.status === 'COMPLETED') return job;

    // Mark as IN_PROGRESS
    await prisma.waybackScrapeJob.update({
      where: { id: jobId },
      data: { status: 'IN_PROGRESS' },
    });

    let snapshotsList = JSON.parse(job.snapshotsList) as JobSnapshotEntry[];

    // Lazy CDX fetch — populate snapshots on first processJob call
    if (snapshotsList.length === 0) {
      let rawSnapshots: RawSnapshot[];
      try {
        rawSnapshots = await this.getSnapshotsList(job.url, job.fromDate ?? undefined);
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
          totalSnapshots: rawSnapshots.length,
          snapshotsList: JSON.stringify(snapshotsList),
        },
      });
    }

    // Ensure a TrackedUrl record exists. For multi-batch pagination, all batches
    // for the same URL reuse the same TrackedUrl so diffs accumulate in one timeline.
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

    // Build a map of already-scraped texts for the DONE snapshots so resumption
    // can diff against the last successful snapshot.
    //
    // We track the running "previous text" across iterations; on resume, the last
    // DONE snapshot's text is re-fetched (a trade-off vs. caching in the DB to
    // avoid storing large text blobs in the job record).
    let previousText = '';
    let processedCount = snapshotsList.filter((s) => s.status === 'DONE').length;

    for (let i = 0; i < snapshotsList.length; i++) {
      const entry = snapshotsList[i];

      // Re-scrape DONE entries only to rebuild the previousText cursor for resume
      if (entry.status === 'DONE') {
        try {
          previousText = await this.scrapeSnapshot(job.url, entry.timestamp);
        } catch {
          // If a previously-done snapshot can't be re-fetched, keep the last good text
        }
        continue;
      }

      // Process PENDING entries
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
        const deletions = extractChunks(rawDiff, 'removed');
        const additions = extractChunks(rawDiff, 'added');

        const beforeDate = i > 0 ? timestampToDate(snapshotsList[i - 1].timestamp) : 'Unknown';
        const afterDate = timestampToDate(entry.timestamp);
        const snapshotUrl = `https://web.archive.org/web/${entry.timestamp}/${job.url}`;

        if (deletions.length > 0 || additions.length > 0) {
          // Substantive changes — run ForensicAgent for classification
          let relatedEvidence: RelatedEvidenceContext[] = [];
          try {
            relatedEvidence = await this.fetchCorrelatedEvidence(afterDate);
          } catch {
            // Non-fatal — proceed without context
          }

          try {
            const analysis = await this.forensicAgent.analyzeChange(
              deletions,
              additions,
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
            // Save raw chunks without AI analysis so the snapshot pair is never lost
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
        } else {
          // No substantive chunks (minor/cosmetic change) — still record the pair
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
        }
      }

      previousText = currentText;
      entry.status = 'DONE';
      processedCount++;

      // Persist state after every snapshot — ensures resumability after crashes
      await prisma.waybackScrapeJob.update({
        where: { id: jobId },
        data: {
          snapshotsList: JSON.stringify(snapshotsList),
          processedSnapshots: processedCount,
        },
      });

      await sleep(FETCH_DELAY_MS);
    }

    // Mark the job as complete
    return prisma.waybackScrapeJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', processedSnapshots: processedCount },
    });
  }
}
