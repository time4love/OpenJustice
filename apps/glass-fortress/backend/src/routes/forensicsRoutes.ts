import { Router, Request, Response } from 'express';
import { evidenceWhereForViewer } from '../lib/evidenceVisibility';
import { identifyResearcher } from '../middleware/researcherIdentity';
import { z } from 'zod';
import { WaybackScraper } from '../services/WaybackScraper';
import { prisma } from '../lib/prisma';
import { type DiffItem } from '../services/ForensicAgent';
import { parseDiffItems } from '../lib/diffItems';
import { scanLimiter } from '../middleware/rateLimiting';
import { admitUrl } from '../services/admitUrl';
import { fetchContentForRelevanceCheck } from '../services/fetchContentForRelevanceCheck';
import { getStoredClaimTrajectories } from '../services/claimTrajectory';

const router = Router();

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const WaybackQuerySchema = z.object({
  url: z.string().url('A valid URL is required'),
});

const ScanBodySchema = z.object({
  url: z.string().url('A valid URL is required'),
});

const DiffPageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Lazy singletons
// ---------------------------------------------------------------------------

let _waybackScraper: WaybackScraper | null = null;

function getWaybackScraper(): WaybackScraper {
  if (!_waybackScraper) _waybackScraper = new WaybackScraper();
  return _waybackScraper;
}

// ---------------------------------------------------------------------------
// POST /api/forensics/scan
//
// Start (or resume) a forensic scan for a URL.
//
// - If a TrackedUrl already exists for this URL, resumes it — already vetted
//   the first time, so the relevance check below only runs once per URL.
// - Otherwise: screens the URL with ScanRelevanceAgent (one cheap call) before
//   creating a TrackedUrl (status=SCANNING) and starting the scan (which can
//   run hundreds of LLM calls) — see docs/gf-cost-exposure-dev-plan.md.
//
// Returns immediately with { trackedUrlId }. Processing runs server-side via
// runFullScan() (fire-and-forget). Poll GET /api/forensics/tracked/:id/status
// to track progress.
// ---------------------------------------------------------------------------

router.post('/scan', scanLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = ScanBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { url } = parsed.data;

  try {
    // ONE ADMISSION PATH. This route was the only one that gated; the two MCP
    // tools and GET /wayback did not. The check now lives in admitUrl, which a
    // source scan makes the only writer of TrackedUrl.
    const admission = await admitUrl({ url, fetchContent: fetchContentForRelevanceCheck });
    if (!admission.admitted) {
      res
        .status(admission.verdict === 'UNREADABLE' ? 502 : 422)
        .json({
          error:
            admission.verdict === 'UNREADABLE'
              ? admission.reason
              : 'URL not relevant to this investigation',
          verdict: admission.verdict,
          reason: admission.reason,
        });
      return;
    }
    const trackedUrl = { id: admission.trackedUrlId };

    res.status(201).json({ trackedUrlId: trackedUrl.id });

    // Fire-and-forget — concurrent-guard inside runFullScan prevents double-runs
    void getWaybackScraper()
      .runFullScan(trackedUrl.id, url)
      .catch((err: unknown) => {
        console.error('[forensics/scan] runFullScan error:', err instanceof Error ? err.stack : err);
      });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[forensics/scan] Error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: 'Failed to start scan', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/forensics/pause/:id
//
// Signals a running scan to stop at its next snapshot boundary and set the
// TrackedUrl status to PAUSED. Resume by calling POST /scan with the same URL.
// ---------------------------------------------------------------------------

router.post('/pause/:id', async (req: Request, res: Response): Promise<void> => {
  const trackedUrlId = String(req.params['id'] ?? '');
  if (!trackedUrlId) {
    res.status(400).json({ error: 'Missing trackedUrl id' });
    return;
  }

  try {
    const trackedUrl = await prisma.trackedUrl.findUnique({ where: { id: trackedUrlId } });
    if (!trackedUrl) {
      res.status(404).json({ error: 'TrackedUrl not found' });
      return;
    }
    if (trackedUrl.status !== 'SCANNING') {
      res.status(409).json({ error: 'Scan is not currently running', status: trackedUrl.status });
      return;
    }

    getWaybackScraper().pauseScan(trackedUrlId);
    res.status(200).json({ paused: true, trackedUrlId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to pause scan', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/forensics/tracked/:id/status
//
// Polling endpoint. Returns the TrackedUrl status, active job progress, and
// all legally significant diffs found so far — enabling the frontend to render
// diff cards incrementally while the scan is still running.
//
// Frontend polls this every 3 s until status is COMPLETED or FAILED.
// ---------------------------------------------------------------------------

router.get('/tracked/:id/status', async (req: Request, res: Response): Promise<void> => {
  const trackedUrlId = String(req.params['id'] ?? '');
  if (!trackedUrlId) {
    res.status(400).json({ error: 'Missing trackedUrl id' });
    return;
  }

  try {
    const trackedUrl = await prisma.trackedUrl.findUnique({ where: { id: trackedUrlId } });
    if (!trackedUrl) {
      res.status(404).json({ error: 'TrackedUrl not found' });
      return;
    }

    const [activeJob, rawDiffs] = await Promise.all([
      prisma.waybackScrapeJob.findUnique({
        where: { trackedUrlId },
        select: {
          id: true,
          status: true,
          totalSnapshots: true,
          processedSnapshots: true,
          updatedAt: true,
          failureReason: true,
        },
      }),
      prisma.urlVersionDiff.findMany({
        where: { trackedUrlId, isLegallySignificant: true },
        orderBy: { afterDate: 'asc' },
        select: {
          id: true,
          beforeDate: true,
          afterDate: true,
          snapshotUrl: true,
          deletedText: true,
          addedText: true,
          rawDeletedText: true,
          rawAddedText: true,
          aiSignificance: true,
        },
      }),
    ]);

    const liveDiffs = rawDiffs.map((d) => ({
      id: d.id,
      beforeDate: d.beforeDate,
      date: d.afterDate,
      snapshotUrl: d.snapshotUrl,
      deletedItems: parseDiffItems(d.deletedText),
      addedItems: parseDiffItems(d.addedText),
      rawDeletedChunks: JSON.parse(d.rawDeletedText) as string[],
      rawAddedChunks: JSON.parse(d.rawAddedText) as string[],
      legalSignificance: d.aiSignificance,
    }));

    res.status(200).json({
      id: trackedUrl.id,
      url: trackedUrl.url,
      status: trackedUrl.status,
      activeJob: activeJob ?? null,
      liveDiffs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch scan status', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/forensics/wayback?url=<target-url>
//
// Legacy synchronous pipeline (kept for backward compatibility).
// NOTE: This blocks for 1–3 minutes. Prefer POST /scan for new usage.
// ---------------------------------------------------------------------------

router.get('/wayback', async (req: Request, res: Response): Promise<void> => {
  const parsed = WaybackQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    return;
  }

  const { url } = parsed.data;

  try {
    console.log(`[forensics/wayback] Starting scan for: ${url}`);
    const { trackedUrlId, diffs } = await getWaybackScraper().analyzePageHistory(url);
    console.log(`[forensics/wayback] Complete — ${diffs.length} significant changes for: ${url}`);
    res.status(200).json({ url, trackedUrlId, count: diffs.length, diffs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[forensics/wayback] Error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: 'Wayback forensic scan failed', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/forensics/tracked
//
// Returns all TrackedUrl records ordered by most recently created.
// ---------------------------------------------------------------------------

router.get('/tracked', async (_req: Request, res: Response): Promise<void> => {
  try {
    const trackedUrls = await prisma.trackedUrl.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { diffs: true } } },
    });

    const items = trackedUrls.map((t) => ({
      id: t.id,
      url: t.url,
      title: t.title,
      status: t.status,
      createdAt: t.createdAt,
      totalDiffs: t._count.diffs,
    }));

    res.status(200).json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to list tracked URLs', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/forensics/tracked/:id/jobs
//
// Returns all WaybackScrapeJob records for a TrackedUrl, ordered oldest-first.
// Used by the history panel to show per-batch progress in the expanded view.
// ---------------------------------------------------------------------------

router.get('/tracked/:id/jobs', async (req: Request, res: Response): Promise<void> => {
  const trackedUrlId = String(req.params['id'] ?? '');
  if (!trackedUrlId) {
    res.status(400).json({ error: 'Missing trackedUrl id' });
    return;
  }

  try {
    const jobs = await prisma.waybackScrapeJob.findMany({
      where: { trackedUrlId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        fromDate: true,
        totalSnapshots: true,
        processedSnapshots: true,
        createdAt: true,
        failureReason: true,
      },
    });
    res.status(200).json({ jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch jobs', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/forensics/tracked/:id
//
// Returns the TrackedUrl record and all its persisted UrlVersionDiff records.
// ---------------------------------------------------------------------------

router.get('/tracked/:id', identifyResearcher, async (req: Request, res: Response): Promise<void> => {
  const trackedUrlId = String(req.params['id'] ?? '');

  if (!trackedUrlId) {
    res.status(400).json({ error: 'Missing trackedUrl id' });
    return;
  }

  const parsed = DiffPageQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
    return;
  }
  const { cursor, limit } = parsed.data;

  try {
    const trackedUrl = await prisma.trackedUrl.findUnique({ where: { id: trackedUrlId } });

    if (!trackedUrl) {
      res.status(404).json({ error: 'TrackedUrl not found' });
      return;
    }

    // Totals for the summary bar. Both are computed over the WHOLE timeline,
    // never over the page — the client cannot derive either from a paginated
    // response, and until 2026-08-22 it tried: the UI counted
    // isLegallySignificant across the diffs it had loaded so far and rendered
    // the result as "N legally significant changes were identified". With two
    // of five pages loaded it reported 3 of the 5 that existed, and the number
    // grew silently as the reader scrolled. Under-reporting findings on an
    // evidence platform is a correctness bug, not a cosmetic one.
    const [totalCount, significantCount] = await Promise.all([
      prisma.urlVersionDiff.count({ where: { trackedUrlId } }),
      prisma.urlVersionDiff.count({ where: { trackedUrlId, isLegallySignificant: true } }),
    ]);

    // Fetch one extra record to determine if there is a next page
    const rawDiffs = await prisma.urlVersionDiff.findMany({
      where: { trackedUrlId },
      orderBy: { afterDate: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { beforeSnapshot: { select: { snapshotUrl: true } } },
    });

    const hasMore = rawDiffs.length > limit;
    const page = hasMore ? rawDiffs.slice(0, limit) : rawDiffs;
    const nextCursor = hasMore ? page[page.length - 1]?.id : null;

    // Filtered like every other evidence read. Two reasons, and the second is
    // not about privacy: an unreviewed record here marks its diff as "promoted"
    // in the UI, which is a claim the review has not yet made.
    const promotedEvidence = await prisma.evidence.findMany({
      where: {
        ...evidenceWhereForViewer(req),
        urlVersionDiffId: { in: page.map((d) => d.id) },
      },
      // `status` travels with the record because the UI must distinguish a
      // CANDIDATE from a PROMOTION. An Evidence row existing means a scan
      // recorded a finding; only CONFIRMED means a person reviewed it. Sending
      // the row without its status forced the client to guess, and it guessed
      // "promoted" — asserting a review that had not happened.
      select: { id: true, fileHash: true, status: true, urlVersionDiffId: true },
    });

    const promotedByDiffId = new Map(promotedEvidence.map((e) => [e.urlVersionDiffId, e]));

    const diffs = page.map((d) => ({
      id: d.id,
      beforeDate: d.beforeDate,
      date: d.afterDate,
      snapshotUrl: d.snapshotUrl,
      beforeSnapshotUrl: d.beforeSnapshot?.snapshotUrl ?? null,
      deletedItems: parseDiffItems(d.deletedText),
      addedItems: parseDiffItems(d.addedText),
      rawDeletedChunks: JSON.parse(d.rawDeletedText) as string[],
      rawAddedChunks: JSON.parse(d.rawAddedText) as string[],
      legalSignificance: d.aiSignificance,
      isLegallySignificant: d.isLegallySignificant,
      promotedEvidence: promotedByDiffId.get(d.id) ?? null,
    }));

    res.status(200).json({
      trackedUrlId,
      url: trackedUrl.url,
      title: trackedUrl.title,
      createdAt: trackedUrl.createdAt,
      totalCount,
      significantCount,
      diffs,
      nextCursor,
      hasMore,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[forensics/tracked] Error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: 'Failed to fetch tracked URL history', message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/forensics/tracked/:id
//
// Deletes a TrackedUrl, all its UrlVersionDiff children, and all associated
// WaybackScrapeJob records. Evidence records promoted from this TrackedUrl
// are NOT deleted — they are on-chain and must remain.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Deleting a tracked page is deliberately NOT exposed over REST.
//
// It was, as DELETE /api/forensics/tracked/:id, with no authentication. It
// cancelled any running scan, unlinked the Evidence, then removed every diff
// and every archived capture beneath the page. The ids it takes are published
// by GET /api/forensics/tracked, so the whole corpus for a page — years of
// archived text that the Internet Archive may no longer serve — was removable
// by an anonymous request naming an id this API hands out.
//
// The archived captures are the irreplaceable half of this system: a snapshot's
// value is that it survives the archive losing the page. Nothing that erases
// them belongs on an unauthenticated endpoint, and its only client was a button
// in the researcher UI.
//
// Removing a scanned corpus is a destructive database operation. CLAUDE.md
// gives those their own dedicated session, with the scope written down first
// and every statement simulated before it runs — not a button beside "view
// timeline".
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Promotion is deliberately NOT exposed over REST.
//
// It was, as POST /api/forensics/promote, with no authentication: a request
// carrying a diff id registered evidence on-chain and published it. Promotion
// is the step where a person accepts a machine's classification as a legal
// claim, so an anonymous caller could make that claim on the platform's behalf.
//
// The only client was a button in the researcher UI. Adding data to this system
// goes through MCP, where the caller is an authenticated, approved researcher —
// see promote_evidence and promote_scan_findings.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers for HTML report
// ---------------------------------------------------------------------------

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReportHtml(
  url: string,
  title: string | null,
  diffs: Array<{
    beforeDate: string;
    date: string;
    snapshotUrl: string;
    beforeSnapshotUrl: string | null;
    deletedItems: DiffItem[];
    addedItems: DiffItem[];
    legalSignificance: string;
    isLegallySignificant: boolean;
  }>,
): string {
  const QUOTE_LIMIT = 400;
  const truncate = (s: string) => (s.length > QUOTE_LIMIT ? `${s.slice(0, QUOTE_LIMIT)}…` : s);
  const flaggedCount = diffs.filter((d) => d.isLegallySignificant).length;
  const reportDate = new Date().toISOString().split('T')[0] ?? '';

  const diffCards = diffs
    .map((d, i) => {
      const sig = d.isLegallySignificant;

      const deletedHtml =
        d.deletedItems.length > 0
          ? `<div class="section deleted">
              <div class="section-label deleted-label">DELETED</div>
              ${d.deletedItems
                .map(
                  (item) => `<div class="claim-block">
                  <div class="claim-summary" dir="auto">${escHtml(item.summary)}</div>
                  ${item.exactQuote ? `<div class="claim-quote" dir="auto">"${escHtml(truncate(item.exactQuote))}"</div>` : ''}
                </div>`,
                )
                .join('')}
            </div>`
          : '';

      const addedHtml =
        d.addedItems.length > 0
          ? `<div class="section added">
              <div class="section-label added-label">ADDED</div>
              ${d.addedItems
                .map(
                  (item) => `<div class="claim-block">
                  <div class="claim-summary" dir="auto">${escHtml(item.summary)}</div>
                  ${item.exactQuote ? `<div class="claim-quote" dir="auto">"${escHtml(truncate(item.exactQuote))}"</div>` : ''}
                </div>`,
                )
                .join('')}
            </div>`
          : '';

      const analysisHtml = d.legalSignificance
        ? `<div class="forensic-analysis" dir="auto">${escHtml(d.legalSignificance)}</div>`
        : '';

      const beforeSnapshotHtml = d.beforeSnapshotUrl
        ? `<div class="snapshot-link">Compared against (before): <a href="${escHtml(d.beforeSnapshotUrl)}">${escHtml(d.beforeSnapshotUrl)}</a></div>`
        : '';

      return `<div class="diff-card ${sig ? 'sig' : 'audit'}">
        <div class="diff-header">
          <span class="date-range">
            <span class="before-date">${escHtml(d.beforeDate)}</span>
            <span class="arrow">→</span>
            <span class="after-date">${escHtml(d.date)}</span>
          </span>
          ${sig ? '<span class="badge badge-flagged">AI-FLAGGED AS SIGNIFICANT</span>' : '<span class="badge badge-audit">VERSION CHANGE</span>'}
          <span class="diff-num">#${i + 1}</span>
        </div>
        <div class="diff-body">
          ${analysisHtml}
          ${deletedHtml}
          ${addedHtml}
          ${beforeSnapshotHtml}
          <div class="snapshot-link">Archive snapshot (after): <a href="${escHtml(d.snapshotUrl)}">${escHtml(d.snapshotUrl)}</a></div>
        </div>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forensic Timeline Report — ${escHtml(url)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 11pt; color: #1a1a2e; background: #fff; padding: 20mm; line-height: 1.5; }
    @page { margin: 15mm 20mm; size: A4 portrait; }
    @media print { body { padding: 0; } }
    .cover { margin-bottom: 24pt; padding-bottom: 16pt; border-bottom: 2px solid #1a1a2e; }
    .cover-title { font-size: 20pt; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 6pt; }
    .cover-subtitle { font-size: 11pt; color: #334155; margin-bottom: 4pt; }
    .cover-url { font-family: monospace; font-size: 9pt; color: #555; word-break: break-all; margin-bottom: 12pt; }
    .cover-meta { display: flex; gap: 16pt; flex-wrap: wrap; font-size: 9pt; color: #666; }
    .cover-meta .label { font-weight: 600; color: #333; }
    .cover-meta .flagged-count { color: #b91c1c; font-weight: 700; }
    .cover-watermark { margin-top: 8pt; font-size: 8pt; color: #aaa; font-style: italic; }
    .timeline-heading { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 10pt; }
    .diff-card { page-break-inside: avoid; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 10pt; overflow: hidden; }
    .diff-card.sig { border-color: #f87171; }
    .diff-header { display: flex; align-items: center; flex-wrap: wrap; gap: 6pt; padding: 5pt 10pt; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 8.5pt; }
    .diff-card.sig .diff-header { background: #fff1f2; border-bottom-color: #fecaca; }
    .date-range { font-family: monospace; display: inline-flex; align-items: center; gap: 4pt; }
    .before-date { color: #94a3b8; }
    .arrow { color: #cbd5e1; }
    .after-date { font-weight: 600; color: #334155; }
    .badge { font-size: 7pt; font-weight: 700; letter-spacing: 0.05em; padding: 2pt 5pt; border-radius: 100px; }
    .badge-flagged { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
    .badge-audit { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
    .diff-num { margin-left: auto; font-family: monospace; color: #cbd5e1; font-size: 8pt; }
    .diff-body { padding: 8pt 10pt; }
    .forensic-analysis { font-size: 9.5pt; color: #374151; border-left: 2px solid #f87171; padding-left: 8pt; margin-bottom: 8pt; line-height: 1.6; }
    .section { margin-top: 6pt; }
    .section-label { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4pt; }
    .deleted-label { color: #dc2626; }
    .added-label { color: #16a34a; }
    .claim-block { margin-bottom: 4pt; padding: 4pt 6pt; border-radius: 3px; }
    .deleted .claim-block { background: #fff5f5; border-left: 2px solid #fca5a5; }
    .added .claim-block { background: #f0fdf4; border-left: 2px solid #86efac; }
    .claim-summary { font-size: 9.5pt; font-weight: 500; color: #1e293b; }
    .claim-quote { font-size: 8.5pt; color: #64748b; font-style: italic; margin-top: 2pt; }
    .snapshot-link { font-size: 7.5pt; color: #94a3b8; margin-top: 8pt; word-break: break-all; }
    .snapshot-link a { color: #3b82f6; }
    .no-diffs { color: #94a3b8; font-size: 9pt; font-style: italic; }
    .footer { margin-top: 24pt; padding-top: 8pt; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #aaa; text-align: center; }
  </style>
</head>
<body>
  <div class="cover">
    <div class="cover-title">Forensic Timeline Report</div>
    ${title ? `<div class="cover-subtitle">${escHtml(title)}</div>` : ''}
    <div class="cover-url">${escHtml(url)}</div>
    <div class="cover-meta">
      <span><span class="label">Report generated:</span> ${reportDate}</span>
      <span><span class="label">Total version changes:</span> ${diffs.length}</span>
      <span><span class="label">AI-flagged as significant:</span> <span class="flagged-count">${flaggedCount}</span></span>
    </div>
    <div class="cover-watermark">Generated by Glass Fortress · OpenJustice · For legal review purposes only.</div>
  </div>
  <div class="timeline-heading">Change Timeline</div>
  ${diffs.length === 0 ? '<p class="no-diffs">No version changes recorded for this URL.</p>' : diffCards}
  <div class="footer">Glass Fortress — Forensic Evidence Platform · This document is auto-generated for legal review. Verify all claims independently.</div>
  <script>window.addEventListener('load', function() { window.print(); });</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// GET /api/forensics/tracked/:id/report
//
// Returns a print-ready HTML document containing the full diff timeline for
// a TrackedUrl. Opens in a new tab; the browser auto-triggers the print
// dialog so the user can save as PDF.
// ---------------------------------------------------------------------------

/**
 * Claim trajectories for a tracked page.
 *
 * The timeline above this shows diffs — each a comparison of two snapshots. This
 * shows what no diff can: one assertion followed across the entire archived
 * history, so "removed, restored, removed again" reads as a pattern rather than
 * as three unrelated edits.
 *
 * Public for the same reason the diff timeline is: it asserts nothing a reader
 * has to take on trust. Every finding ships the archived snapshot URLs it was
 * computed from, and the computation is a string search anyone can repeat.
 *
 * READ-ONLY, and that is load-bearing. Detection is stored state now, so
 * computing on a miss would insert rows — and this route is unauthenticated.
 * It serves what has been detected and reports NOT_COMPUTED otherwise; the
 * writers are the scan that completes and the gated MCP tool.
 */
router.get('/tracked/:id/trajectories', async (req: Request, res: Response): Promise<void> => {
  const trackedUrlId = String(req.params['id'] ?? '');
  try {
    const trackedUrl = await prisma.trackedUrl.findUnique({
      where: { id: trackedUrlId },
      select: { url: true },
    });
    if (!trackedUrl) {
      res.status(404).json({ error: 'TrackedUrl not found' });
      return;
    }

    const minTransitions = Number(req.query['minTransitions'] ?? 2);
    const result = await getStoredClaimTrajectories(trackedUrl.url, {
      minTransitions: Number.isFinite(minTransitions) ? Math.max(1, minTransitions) : 2,
    });

    if (!result) {
      // Distinct from "no claim oscillated". Detection has not run for this
      // state — reporting an empty result would make an unanswered question look
      // like a negative answer.
      res.status(200).json({
        state: 'NOT_COMPUTED',
        findingCount: 0,
        findings: [],
        explanation:
          'Claim trajectories have not been detected for this page yet. They are computed when a ' +
          'scan completes; re-scan the page to populate them.',
      });
      return;
    }

    res.status(200).json({
      state: 'COMPUTED',
      url: result.url,
      snapshotsExamined: result.snapshotsExamined,
      candidatesConsidered: result.candidatesConsidered,
      // Surfaced rather than hidden: candidates the archive never contained mean
      // extraction is drifting, and a thin result would otherwise look thorough.
      candidatesNotFoundInArchive: result.candidatesUnmatched,
      findingCount: result.groups.length,
      claimsTracked: result.trajectories.length,
      provenance: result.provenance,
      findings: result.groups.map((g) => ({
        patternHash: g.patternHash,
        transitions: g.transitions,
        firstSeen: g.firstSeen,
        lastSeen: g.lastSeen,
        finalState: g.finalState,
        claimCount: g.claims.length,
        changes: g.changes,
        claims: g.claims,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Trajectory detection failed' });
  }
});

router.get('/tracked/:id/report', async (req: Request, res: Response): Promise<void> => {
  const trackedUrlId = String(req.params['id'] ?? '');
  if (!trackedUrlId) {
    res.status(400).send('<h1>Missing trackedUrl id</h1>');
    return;
  }

  try {
    const trackedUrl = await prisma.trackedUrl.findUnique({ where: { id: trackedUrlId } });
    if (!trackedUrl) {
      res.status(404).send('<h1>TrackedUrl not found</h1>');
      return;
    }

    const allDiffs = await prisma.urlVersionDiff.findMany({
      where: { trackedUrlId },
      orderBy: { afterDate: 'asc' },
      include: { beforeSnapshot: { select: { snapshotUrl: true } } },
    });

    const diffs = allDiffs
      .map((d) => ({
        beforeDate: d.beforeDate,
        date: d.afterDate,
        snapshotUrl: d.snapshotUrl,
        beforeSnapshotUrl: d.beforeSnapshot?.snapshotUrl ?? null,
        deletedItems: parseDiffItems(d.deletedText),
        addedItems: parseDiffItems(d.addedText),
        legalSignificance: d.aiSignificance,
        isLegallySignificant: d.isLegallySignificant,
      }))
      .filter((d) => d.deletedItems.length > 0 || d.addedItems.length > 0);

    const html = buildReportHtml(trackedUrl.url, trackedUrl.title, diffs);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[forensics/report] Error:', err instanceof Error ? err.stack : err);
    res.status(500).send(`<h1>Error generating report</h1><p>${escHtml(message)}</p>`);
  }
});

export { router as forensicsRouter };
