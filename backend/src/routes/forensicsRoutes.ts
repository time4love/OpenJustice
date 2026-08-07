import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ethers } from 'ethers';
import { WaybackScraper } from '../services/WaybackScraper';
import { prisma } from '../lib/prisma';
import { Web3Service } from '../services/Web3Service';
import { IntakeOutputSchema } from '../services/IntakeAgent';

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

const PromoteSchema = z.object({
  urlVersionDiffId: z.string().min(1, 'urlVersionDiffId is required'),
});

// ---------------------------------------------------------------------------
// Lazy singletons
// ---------------------------------------------------------------------------

let _waybackScraper: WaybackScraper | null = null;
let _web3Service: Web3Service | null = null;

function getWaybackScraper(): WaybackScraper {
  if (!_waybackScraper) _waybackScraper = new WaybackScraper();
  return _waybackScraper;
}

function getWeb3Service(): Web3Service {
  if (!_web3Service) _web3Service = new Web3Service();
  return _web3Service;
}

// ---------------------------------------------------------------------------
// POST /api/forensics/scan
//
// Start (or resume) a forensic scan for a URL.
//
// - If a SCANNING TrackedUrl already exists for this URL, resumes it.
// - Otherwise creates a new TrackedUrl (status=SCANNING) and starts fresh.
//
// Returns immediately with { trackedUrlId }. Processing runs server-side via
// runFullScan() (fire-and-forget). Poll GET /api/forensics/tracked/:id/status
// to track progress.
// ---------------------------------------------------------------------------

router.post('/scan', async (req: Request, res: Response): Promise<void> => {
  const parsed = ScanBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { url } = parsed.data;

  try {
    // Resume an existing in-progress scan, or start fresh
    let trackedUrl = await prisma.trackedUrl.findFirst({
      where: { url, status: 'SCANNING' },
      orderBy: { createdAt: 'desc' },
    });

    if (!trackedUrl) {
      trackedUrl = await prisma.trackedUrl.create({ data: { url, status: 'SCANNING' } });
    }

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
      prisma.waybackScrapeJob.findFirst({
        where: { trackedUrlId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          totalSnapshots: true,
          processedSnapshots: true,
          updatedAt: true,
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
      deletedClaims: JSON.parse(d.deletedText) as string[],
      addedClaims: JSON.parse(d.addedText) as string[],
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
// GET /api/forensics/tracked/:id
//
// Returns the TrackedUrl record and all its persisted UrlVersionDiff records.
// ---------------------------------------------------------------------------

router.get('/tracked/:id', async (req: Request, res: Response): Promise<void> => {
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

    const rawDiffs = await prisma.urlVersionDiff.findMany({
      where: { trackedUrlId },
      orderBy: { afterDate: 'asc' },
    });

    const promotedEvidence = await prisma.evidence.findMany({
      where: { urlVersionDiffId: { in: rawDiffs.map((d) => d.id) } },
      select: { id: true, fileHash: true, urlVersionDiffId: true },
    });

    const promotedByDiffId = new Map(promotedEvidence.map((e) => [e.urlVersionDiffId, e]));

    const diffs = rawDiffs.map((d) => ({
      id: d.id,
      beforeDate: d.beforeDate,
      date: d.afterDate,
      snapshotUrl: d.snapshotUrl,
      deletedClaims: JSON.parse(d.deletedText) as string[],
      addedClaims: JSON.parse(d.addedText) as string[],
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
      count: diffs.length,
      diffs,
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

router.delete('/tracked/:id', async (req: Request, res: Response): Promise<void> => {
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

    // Signal any running scan to stop creating new records
    getWaybackScraper().cancelScan(trackedUrlId);

    // Unlink Evidence records (keep them — they are on-chain)
    await prisma.evidence.updateMany({
      where: { urlVersionDiff: { trackedUrlId } },
      data: { urlVersionDiffId: null },
    });

    // Delete children then parent with retry: a concurrent scan may still be inserting
    // UrlVersionDiff records during the first attempt. Retrying after a brief delay lets the
    // cancellation signal take effect so the scan stops writing before the next attempt.
    let deleted = false;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= 3 && !deleted; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2_000));
      try {
        await prisma.urlVersionDiff.deleteMany({ where: { trackedUrlId } });
        await prisma.waybackScrapeJob.deleteMany({ where: { trackedUrlId } });
        await prisma.trackedUrl.delete({ where: { id: trackedUrlId } });
        deleted = true;
      } catch (err) {
        lastErr = err;
        // Only retry on FK constraint violations (P2003 = concurrent scan still writing)
        const isFKError = err instanceof Error && 'code' in err && err.code === 'P2003';
        if (!isFKError) throw err;
        console.warn(`[forensics/delete] FK constraint on attempt ${attempt + 1}, retrying…`);
      }
    }
    if (!deleted) throw lastErr;

    res.status(200).json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[forensics/tracked/delete] Error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: 'Delete failed', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/forensics/promote
//
// Promotes a UrlVersionDiff to a main Evidence record:
//   1. Fetches the diff and its parent TrackedUrl from Prisma
//   2. Derives a deterministic analysis object from the diff data
//   3. Hashes the diff content → registers on Ethereum → writes Evidence record
//   4. Links the new Evidence record back to the UrlVersionDiff
// ---------------------------------------------------------------------------

router.post('/promote', async (req: Request, res: Response): Promise<void> => {
  const parsed = PromoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { urlVersionDiffId } = parsed.data;

  try {
    const diff = await prisma.urlVersionDiff.findUnique({
      where: { id: urlVersionDiffId },
      include: { trackedUrl: true },
    });

    if (!diff) {
      res.status(404).json({ error: 'UrlVersionDiff not found' });
      return;
    }

    const existing = await prisma.evidence.findFirst({ where: { urlVersionDiffId } });
    if (existing) {
      res.status(409).json({
        error: 'already_promoted',
        message: 'This diff has already been promoted to main evidence.',
        fileHash: existing.fileHash,
      });
      return;
    }

    const deletedClaims = JSON.parse(diff.deletedText) as string[];
    const addedClaims = JSON.parse(diff.addedText) as string[];
    const targetEntity = (() => {
      try { return new URL(diff.trackedUrl.url).hostname; } catch { return 'Unknown'; }
    })();

    const content = [
      diff.trackedUrl.url,
      diff.afterDate,
      diff.deletedText,
      diff.addedText,
    ].join('\n');
    const fileHash = Web3Service.hashFile(Buffer.from(content, 'utf8'));

    const analysis = IntakeOutputSchema.parse({
      evidenceRole: 'Incriminating',
      isRelevant: true,
      category: 'Regulatory Misleading',
      summary: diff.aiSignificance || `שינוי שקט זוהה בדף ${targetEntity} בתאריך ${diff.afterDate}.`,
      missingInformation: [],
      targetEntity,
      evidencePerspective: 'Public Statement',
      tierReasoning: 'מסמך זה מסווג כדרגה 2 — שינוי שקט שנעשה בדף ממשלתי רשמי המהווה ראיה ישירה לכוונת הטעיה.',
      evidenceTier: 'Tier 2: Material',
      keyFigures: [],
      medicalConditions: [],
      statisticalClaims: deletedClaims.concat(addedClaims),
      regulatoryMentions: [],
      euaOmissionStatus: 'Not Applicable',
      evidenceDate: diff.afterDate,
    });

    let txHash: string;
    try {
      txHash = await getWeb3Service().registerEvidenceHash(
        fileHash,
        ethers.ZeroAddress,
        analysis.category,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[forensics/promote] Web3 error:', err);
      res.status(500).json({ error: 'Blockchain registration failed', message });
      return;
    }

    await prisma.evidence.create({
      data: {
        fileHash,
        evidenceRole: analysis.evidenceRole,
        category: analysis.category,
        targetEntity: analysis.targetEntity,
        evidenceTier: analysis.evidenceTier,
        evidencePerspective: analysis.evidencePerspective ?? null,
        tierReasoning: analysis.tierReasoning ?? null,
        summary: analysis.summary,
        evidenceDate: analysis.evidenceDate,
        keyFigures: JSON.stringify(analysis.keyFigures),
        medicalConditions: JSON.stringify(analysis.medicalConditions),
        statisticalClaims: JSON.stringify(analysis.statisticalClaims),
        regulatoryMentions: JSON.stringify(analysis.regulatoryMentions),
        euaOmissionStatus: analysis.euaOmissionStatus,
        sourceUrl: diff.trackedUrl.url,
        urlVersionDiffId,
      },
    });

    res.status(201).json({ promoted: true, fileHash, txHash });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[forensics/promote] Error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: 'Promotion failed', message });
  }
});

export { router as forensicsRouter };
