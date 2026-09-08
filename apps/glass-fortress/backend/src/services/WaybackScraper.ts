import axios from 'axios';
import { extractArticleText } from '../lib/archiveText';
import { captureHtml } from '../lib/captureDocument';
import {
  CDX_MAX_RETRIES,
  CDX_TIMEOUT_MS,
  CDX_USER_AGENT,
  fetchCaptureBytes,
  rawCaptureUrl,
  withRetry,
} from '../lib/archiveHttp';
import { recordCdxObservation } from './recordCdxObservation';

// ---------------------------------------------------------------------------
// WHAT SURVIVES OF THE SCRAPER — the switch (docs/gf-refactor-plan.md §3 step
// 8, pulled before step 5 on 2026-09-06) deleted the scan job, its pause and
// cancel guards, the synchronous page-history pipeline and the capture
// recorder it wrote through. What is left is what the target reuses: the CDX
// query the survey runs (`queryCdxIndex`), the raw fetch and the Readability
// reading (`scrapeSnapshot`, `scrapeSnapshotReadings`), the correlated-evidence
// read the diff preview and the re-classifier still take, and the scan-finding
// writer the re-classifier still calls until the evidence steps retire it.
// ---------------------------------------------------------------------------

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

/** Captures per CDX page — the survey's page size. */
const MAX_SNAPSHOTS = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// WaybackScraper
// ---------------------------------------------------------------------------

export class WaybackScraper {
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
   * By default uses server-side `collapse=digest` to return only content-changed
   * snapshots — the old path's contract, pinned by its tests.
   *
   * `collapse: false` asks for EVERY capture the index holds. The walk's survey
   * (docs/gf-interaction-flows.md Phase 0) needs the uncollapsed answer: it
   * counts byte-distinct captures against the one immediately before, and the
   * walk records a capture whose digest equals its predecessor's IDENTICAL
   * without fetching. Neither exists under a query that has already removed
   * those rows. PUBLIC for that caller; the two recording methods above remain
   * the old path's only entry.
   *
   * Pure: it queries and parses, and writes nothing. `rawRows` is every row CDX
   * returned before the MAX_SNAPSHOTS slice, which is what the observation record
   * needs — the stored index must reflect what the Archive said, not what one
   * batch happened to keep.
   */
  async queryCdxIndex(
    url: string,
    fromDate?: string,
    options: { collapse: boolean } = { collapse: true },
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
      (options.collapse ? `&collapse=digest` : '') +
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

  // `fetchCorrelatedEvidence` LEFT AT EVIDENCE STEP 11b, WITH THE PROSE IT READ.
  //
  // It searched a ±60-day window for other evidence about the same page and
  // handed the classifier their summaries as context. Every column it selected —
  // summary, tier, role, categories, entity, date — left the evidence row: they
  // are prose and opinion the design keeps on a version or a citation, or nowhere
  // (evidence flows §3).
  //
  // AND THE DOCBLOCK BELOW IT ALREADY SAID WHY IT SHOULD NOT EXIST. Correlation
  // is worth something only from a DIFFERENT source, and on 2026-05-29 the
  // classification of corona.health.gov.il cited "the internal evidence recorded
  // on 25 and 29 May" — its own page's earlier diffs, described as outside
  // support. `excludeTrackedUrlId` was the guard; deleting the reader is the fix.
  // The oscillation such neighbours reveal is a genuine finding and belongs at
  // the thesis level, where a researcher cites several records and the pattern
  // reads as a pattern.
}
