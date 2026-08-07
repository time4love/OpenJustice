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
// GET /api/forensics/wayback?url=<target-url>
//
// 3-step forensic pipeline:
//   1. CDX API → unique archived snapshots
//   2. Diff consecutive snapshot pairs for substantive text changes
//   3. ForensicAgent: classify + cross-reference with correlated DB evidence
//
// Persists a TrackedUrl record + all significant UrlVersionDiff records to Prisma.
// Returns ONLY legally significant changes with the trackedUrlId for drill-down navigation.
//
// NOTE: Multiple sequential HTTP requests + AI inference — typical response: 1–3 minutes.
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
// GET /api/forensics/tracked/:id
//
// Returns the TrackedUrl record and all its persisted UrlVersionDiff records.
// Used by the drill-down page at /forensics/[trackedUrlId].
// ---------------------------------------------------------------------------

router.get('/tracked/:id', async (req: Request, res: Response): Promise<void> => {
  // req.params is typed as Record<string, string | string[]> — coerce to string
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

    // Separate queries avoid deep-include TypeScript inference issues
    const rawDiffs = await prisma.urlVersionDiff.findMany({
      where: { trackedUrlId, isLegallySignificant: true },
      orderBy: { afterDate: 'asc' },
    });

    const promotedEvidence = await prisma.evidence.findMany({
      where: { urlVersionDiffId: { in: rawDiffs.map((d) => d.id) } },
      select: { id: true, fileHash: true, urlVersionDiffId: true },
    });

    const promotedByDiffId = new Map(promotedEvidence.map((e) => [e.urlVersionDiffId, e]));

    // Deserialise JSON arrays stored as strings
    const diffs = rawDiffs.map((d) => ({
      id: d.id,
      beforeDate: d.beforeDate,
      date: d.afterDate,
      snapshotUrl: d.snapshotUrl,
      deletedClaims: JSON.parse(d.deletedText) as string[],
      addedClaims: JSON.parse(d.addedText) as string[],
      legalSignificance: d.aiSignificance,
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
// POST /api/forensics/promote
//
// Promotes a UrlVersionDiff to a main Evidence record:
//   1. Fetches the diff and its parent TrackedUrl from Prisma
//   2. Derives a deterministic analysis object from the diff data
//   3. Hashes the diff content → registers on Ethereum → writes Evidence record
//   4. Links the new Evidence record back to the UrlVersionDiff
//
// Body: { urlVersionDiffId: string }
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

    // Guard against duplicate promotions of the same diff
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

    // Deterministic content representation — same diff always produces the same hash
    const content = [
      diff.trackedUrl.url,
      diff.afterDate,
      diff.deletedText,
      diff.addedText,
    ].join('\n');
    const fileHash = Web3Service.hashFile(Buffer.from(content, 'utf8'));

    // Build analysis compatible with IntakeOutputSchema for on-chain registration
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

    // Register on-chain anonymously
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

    // Create the linked Evidence record
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

// ---------------------------------------------------------------------------
// POST /api/forensics/wayback/job
//
// Phase 1 — create a new WaybackScrapeJob for a URL.
// Calls the CDX API, records all snapshots as PENDING, and persists the job.
// If an incomplete job for this URL already exists, returns it (resumability).
//
// Body: { url: string }
// ---------------------------------------------------------------------------

router.post('/wayback/job', async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({ url: z.string().url() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  try {
    const job = await getWaybackScraper().createJob(parsed.data.url);
    res.status(201).json(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[forensics/wayback/job] Error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: 'Failed to create scan job', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/forensics/wayback/job/:jobId/process
//
// Phase 2 — process a WaybackScrapeJob.
// Iterates over PENDING snapshots sequentially, persists state after each one,
// and marks the job COMPLETED when done. Safe to call again after a crash
// (resumes from the last PENDING snapshot).
//
// Returns the final job record.
// ---------------------------------------------------------------------------

router.post('/wayback/job/:jobId/process', async (req: Request, res: Response): Promise<void> => {
  const jobId = String(req.params['jobId'] ?? '');
  if (!jobId) {
    res.status(400).json({ error: 'Missing jobId' });
    return;
  }

  try {
    const job = await getWaybackScraper().processJob(jobId);
    res.status(200).json(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[forensics/wayback/job/process] Error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: 'Job processing failed', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/forensics/wayback/job/:jobId
//
// Returns the current state of a WaybackScrapeJob for polling.
// The frontend calls this every 3 seconds to update the progress bar.
// ---------------------------------------------------------------------------

router.get('/wayback/job/:jobId', async (req: Request, res: Response): Promise<void> => {
  const jobId = String(req.params['jobId'] ?? '');
  if (!jobId) {
    res.status(400).json({ error: 'Missing jobId' });
    return;
  }

  try {
    const job = await prisma.waybackScrapeJob.findUnique({ where: { id: jobId } });
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.status(200).json(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch job', message });
  }
});

export { router as forensicsRouter };
