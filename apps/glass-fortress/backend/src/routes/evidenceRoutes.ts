import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ethers } from 'ethers';
import { IntegrityCheckSubject } from '@prisma/client';
import { IntakeAgent, IntakeOutputSchema } from '../services/IntakeAgent';
import { Web3Service, DuplicateEvidenceError } from '../services/Web3Service';
import { VectorStoreService } from '../services/VectorStoreService';
import { encryptContact } from '../lib/encrypt';
import { prisma } from '../lib/prisma';
import {
  diffSurvivalView,
  loadPromotionBlock,
  SURVIVAL_VIEW_SELECT,
} from '../services/auditDiffSurvival';
import { scrapeUrl } from '../utils/webScraper';
import {
  CAPTURE_EXTRACTOR_CLIENT_SUPPLIED,
  evidenceHashFromCapture,
} from '../lib/evidenceCapture';
import { StorageService } from '../services/StorageService';
import {
  INVESTIGATIVE_CATEGORIES,
  onChainCategoryLabel,
} from '../lib/investigativeCategories';
import { mapEvidenceToRecord } from '../lib/evidenceRecord';
import { buildEvidenceAnalysisData } from '../lib/evidenceCreateData';
import { evidenceWhereForViewer, viewerSeesUnreviewed } from '../lib/evidenceVisibility';
import { identifyResearcher } from '../middleware/researcherIdentity';
import { upsertKeyFigures } from '../lib/upsertKeyFigures';
import { recordOnChainCheckNeverThrowing } from '../services/onChainVerification';
import { parseDiffItems } from '../lib/diffItems';
import { aiCostLimiter } from '../middleware/rateLimiting';
import { ALLOWED_EVIDENCE_MIME_TYPES, MAX_EVIDENCE_FILE_BYTES } from '../lib/evidenceFileConstraints';
import { persistScreenshotEvidence } from '../lib/persistScreenshotEvidence';

const router = Router();

// ---------------------------------------------------------------------------
// Multer — in-memory storage, images and PDFs only, max 10 MB
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EVIDENCE_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if ((ALLOWED_EVIDENCE_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, PDF.`));
    }
  },
});

// Screenshot-recovery — images only (no PDF; a screenshot is always a raster
// capture), up to 10 files per submission via .array('screenshots', 10) below.
const uploadScreenshots = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EVIDENCE_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Screenshots must be JPEG or PNG.`));
    }
  },
});

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const SearchQuerySchema = z.object({
  q: z.string().default(''),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

// submitterAddress removed — anonymised to ZeroAddress on-chain
const ConfirmBodySchema = z.object({
  analysis: z.string().min(1, 'analysis JSON is required'),
});

const UrlIntakeSchema = z.object({
  url: z.string().url('A valid URL is required'),
});

const UrlConfirmBodySchema = z.object({
  url: z.string().url(),
  scrapedText: z.string().min(1, 'scrapedText is required'),
  analysis: z.string().min(1, 'analysis JSON is required'),
  urlVersionDiffId: z.string().optional(),
});

const RecoverIntakeBodySchema = z.object({
  sourceUrl: z.string().url('A valid sourceUrl is required'),
  failureReason: z.string().optional(),
});

const RecoverConfirmBodySchema = z.object({
  sourceUrl: z.string().url(),
  analysis: z.string().min(1, 'analysis JSON is required'),
});

const ContactBodySchema = z.object({
  fileHash: z.string().min(1, 'fileHash is required'),
  contactInfo: z.string().min(1, 'contactInfo must not be empty'),
  consentGiven: z.literal(true, { error: 'Consent is required to save contact information.' }),
});

// ---------------------------------------------------------------------------
// Lazy singletons
// ---------------------------------------------------------------------------

let _intakeAgent: IntakeAgent | null = null;
let _vectorStorePromise: Promise<VectorStoreService> | null = null;
let _web3Service: Web3Service | null = null;
let _storageService: StorageService | null = null;

function getIntakeAgent(): IntakeAgent {
  if (!_intakeAgent) _intakeAgent = new IntakeAgent();
  return _intakeAgent;
}

function getVectorStore(): Promise<VectorStoreService> {
  if (!_vectorStorePromise) {
    _vectorStorePromise = VectorStoreService.create().catch((err) => {
      // Reset so the next request retries initialisation (e.g. after an env fix)
      _vectorStorePromise = null;
      throw err;
    });
  }
  return _vectorStorePromise;
}

function getWeb3Service(): Web3Service {
  if (!_web3Service) _web3Service = new Web3Service();
  return _web3Service;
}

function getStorageService(): StorageService {
  if (!_storageService) _storageService = new StorageService();
  return _storageService;
}

// ---------------------------------------------------------------------------
// POST /api/evidence/intake
// Accepts either:
//   • multipart/form-data with a "file" field (image/PDF), OR
//   • application/json with { "url": "https://..." }
// Runs AI classification. Returns a draft analysis — NO hashing, blockchain,
// or vector store writes.
// ---------------------------------------------------------------------------

router.post(
  '/intake',
  aiCostLimiter,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const agent = getIntakeAgent();

      // --- File upload path ---
      if (req.file) {
        let analysis;
        try {
          analysis = await agent.analyzeEvidence(req.file.buffer, req.file.mimetype);
        } catch (err) {
          console.error('[intake] IntakeAgent error:', err);
          res.status(500).json({ error: 'AI analysis failed', message: String(err) });
          return;
        }
        res.status(200).json({ analysis });
        return;
      }

      // --- URL scraping path ---
      const urlParsed = UrlIntakeSchema.safeParse(req.body);
      if (urlParsed.success) {
        const { url } = urlParsed.data;

        let scraped;
        try {
          scraped = await scrapeUrl(url);
        } catch (err) {
          console.error('[intake] scrapeUrl error:', err);
          res.status(422).json({ error: 'URL scraping failed', message: String(err) });
          return;
        }

        let analysis;
        try {
          analysis = await agent.analyzeText(scraped.textContent, url);
        } catch (err) {
          console.error('[intake] IntakeAgent.analyzeText error:', err);
          res.status(500).json({ error: 'AI analysis failed', message: String(err) });
          return;
        }

        res.status(200).json({ analysis, scrapedText: scraped.textContent, url });
        return;
      }

      res.status(400).json({
        error: 'Invalid request',
        message: 'Provide either a multipart "file" field or a JSON body with a "url" field.',
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/evidence/confirm
// Accepts either:
//   • multipart/form-data — original file + analysis JSON string, OR
//   • application/json   — { url, scrapedText, analysis } for URL submissions.
// Hashes the content, registers on-chain anonymously (ZeroAddress), upserts to
// vector store. No submitter identity is required or stored.
// ---------------------------------------------------------------------------

router.post(
  '/confirm',
  aiCostLimiter,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let analysisRaw: unknown;
      let fileHash: string;
      // The text the hash was taken over, stored so this record's identity can
      // be rechecked without refetching a page that may since have changed.
      // This route anchors on-chain immediately, which is exactly where an
      // unverifiable identity is most expensive.
      let capturedText: string | null = null;
      let sourceUrl: string | null = null;
      let fileUrl: string | null = null;
      let urlVersionDiffId: string | null = null;

      if (req.file) {
        // --- File upload path ---
        const bodyParsed = ConfirmBodySchema.safeParse(req.body);
        if (!bodyParsed.success) {
          res.status(400).json({ error: 'Invalid request', details: bodyParsed.error.flatten() });
          return;
        }
        try {
          analysisRaw = JSON.parse(bodyParsed.data.analysis);
        } catch {
          res.status(400).json({ error: 'Invalid JSON', message: 'The "analysis" field must be valid JSON.' });
          return;
        }
        fileHash = Web3Service.hashFile(req.file.buffer);

        // Upload original file to Supabase Storage before registering on-chain.
        // If storage fails we abort cleanly — nothing is written to chain or DB.
        try {
          fileUrl = await getStorageService().uploadEvidenceFile(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype,
          );
        } catch (err) {
          console.error('[confirm] StorageService upload error:', err);
          res.status(500).json({ error: 'File storage failed', message: String(err) });
          return;
        }
      } else {
        // --- URL submission path ---
        const urlBodyParsed = UrlConfirmBodySchema.safeParse(req.body);
        if (!urlBodyParsed.success) {
          res.status(400).json({
            error: 'Invalid request',
            message: 'Provide either a multipart "file" field, or a JSON body with "url", "scrapedText", and "analysis".',
            details: urlBodyParsed.error.flatten(),
          });
          return;
        }
        const { url, scrapedText, analysis: analysisStr, urlVersionDiffId: diffId } = urlBodyParsed.data;
        try {
          analysisRaw = JSON.parse(analysisStr);
        } catch {
          res.status(400).json({ error: 'Invalid JSON', message: 'The "analysis" field must be valid JSON.' });
          return;
        }
        sourceUrl = url;
        urlVersionDiffId = diffId ?? null;
        // Hash URL + scraped content for legal provenance — proves exactly what
        // existed at this link at the moment of submission.
        //
        // Through the shared function, not an inline copy. The copy that used to
        // live here omitted the 40,000-character bound the MCP path applies, so
        // the same URL and text submitted through the website and through MCP
        // produced DIFFERENT identities on any long document — and the unique
        // constraint that is supposed to deduplicate them never fired.
        fileHash = evidenceHashFromCapture(url, scrapedText);
        capturedText = scrapedText;
      }

      // LEVEL 5. THE SECOND OF THE TWO PATHS THAT CREATE EVIDENCE FROM A DIFF,
      // and the one that was on nobody's list — it writes status CONFIRMED with
      // an on-chain tx hash, so a refuted change promoted here is anchored as
      // though the page had done it.
      //
      // It hid the way `getDiffInput` hid from the display scan: enumerating by
      // the field name finds the paths that mention `urlVersionDiffId` and misses
      // the ones that delegate it to `buildForensicEvidence`. Enumerate by what a
      // path WRITES. Guarded by test/diffPromotionGate.test.ts.
      //
      // Refused BEFORE the chain write and before the upsert, because an anchored
      // record built on a contradicted diff is the expensive, hard-to-unwind
      // version of this mistake.
      if (urlVersionDiffId !== null) {
        const refuted = await loadPromotionBlock(urlVersionDiffId);
        if (refuted !== null) {
          res.status(409).json({ error: 'Diff is contradicted', message: refuted });
          return;
        }
      }

      const analysisParsed = IntakeOutputSchema.safeParse(analysisRaw);
      if (!analysisParsed.success) {
        res.status(400).json({ error: 'Invalid analysis', details: analysisParsed.error.flatten() });
        return;
      }

      const analysis = analysisParsed.data;

      // Register on-chain anonymously — backend wallet pays gas, ZeroAddress preserves whistleblower privacy
      let txHash: string;
      try {
        txHash = await getWeb3Service().registerEvidenceHash(
          fileHash,
          ethers.ZeroAddress,
          onChainCategoryLabel(analysis.investigativeCategories, analysis.evidenceRole),
        );
      } catch (err) {
        if (err instanceof DuplicateEvidenceError) {
          res.status(409).json({
            error: 'duplicate',
            message: 'This evidence has already been registered on-chain.',
            fileHash,
          });
          return;
        }
        console.error('[confirm] Web3Service error:', err);
        res.status(500).json({ error: 'Blockchain registration failed', message: String(err) });
        return;
      }

      // Ensure all KeyFigure records exist before linking (idempotent via skipDuplicates)
      const figureNames = analysis.keyFigures;
      await upsertKeyFigures(figureNames);

      // Write structured metadata to Prisma — this is the authoritative structured store.
      // status/onChainTxHash set explicitly here, not left to the schema default: this
      // point is only reached after registerEvidenceHash() above already succeeded (or
      // was a confirmed duplicate), so CONFIRMED is correct — but it must never be
      // implicit, since Evidence.status defaults to PENDING_REVIEW precisely so a future
      // create() that forgets this can't silently claim on-chain registration.
      const analysisData = buildEvidenceAnalysisData(analysis);
      // `capturedAt` is the submission moment, not the scrape moment: the client
      // fetched the page at /intake and posted the text back here. It is an
      // upper bound on when the text was taken, and is recorded as such rather
      // than as a precision the route does not have.
      const captureData =
        capturedText !== null && sourceUrl !== null
          ? {
              sourceUrl,
              extractor: CAPTURE_EXTRACTOR_CLIENT_SUPPLIED,
              text: capturedText,
              capturedAt: new Date(),
            }
          : null;

      await prisma.evidence.upsert({
        where: { fileHash },
        update: {
          ...analysisData,
          status: 'CONFIRMED',
          onChainTxHash: txHash,
          figures: { set: figureNames.map((name) => ({ name })) },
          sourceUrl,
          fileUrl,
          urlVersionDiffId,
          // Upsert, not create: this branch runs for a record that already
          // exists, which may or may not already carry a capture. Re-writing it
          // is safe because a matching fileHash means the text reproduces it.
          ...(captureData ? { capture: { upsert: { create: captureData, update: captureData } } } : {}),
        },
        create: {
          fileHash,
          ...analysisData,
          status: 'CONFIRMED',
          onChainTxHash: txHash,
          figures: { connect: figureNames.map((name) => ({ name })) },
          sourceUrl,
          fileUrl,
          urlVersionDiffId,
          ...(captureData ? { capture: { create: captureData } } : {}),
        },
      });

      // Upsert embedding to Pinecone — fire-and-forget; stores ONLY the summary text
      // and fileHash. All structured metadata lives in Prisma.
      getVectorStore()
        .then((vs) => vs.upsertEvidence(analysis.summary, fileHash))
        .catch((err) => console.error('[confirm] VectorStoreService upsert error (non-fatal):', err));

      // LEVEL 3a — the row above now CLAIMS an anchor; this CHECKS it.
      //
      // This route is a fourth anchoring path, and covering only the promotion
      // services would have left it as the one that asserts CONFIRMED without
      // ever asking the contract — one rule with an implementation that opted
      // out, which is this repository's most-repeated defect shape.
      //
      // Looked up by fileHash: the upsert above may have created or updated,
      // and the check's subject is the row's id either way.
      const confirmed = await prisma.evidence.findUnique({
        where: { fileHash },
        select: { id: true },
      });
      const anchorVerification = confirmed
        ? await recordOnChainCheckNeverThrowing({
            subjectType: IntegrityCheckSubject.EVIDENCE,
            subjectId: confirmed.id,
            fileHash,
          })
        : null;

      res.status(201).json({
        relevant: analysis.isRelevant,
        fileHash,
        txHash,
        analysis,
        // Reported, never assumed. Null means the check could not be recorded,
        // which a client must read as "not verified" and never as a pass.
        anchorVerification,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/evidence/recover-intake
// Blocked-URL screenshot recovery, draft step. Multipart "screenshots"
// (1-10 files) + { sourceUrl, failureReason? }. Runs multi-image AI
// classification and returns the draft analysis — no persistence, mirrors
// /intake's role. No auth: a screenshot doesn't need a vetted submitter,
// same reasoning as the plain file-upload path.
// ---------------------------------------------------------------------------

router.post(
  '/recover-intake',
  aiCostLimiter,
  uploadScreenshots.array('screenshots', 10),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        res.status(400).json({
          error: 'Invalid request',
          message: 'At least one "screenshots" file is required.',
        });
        return;
      }

      const bodyParsed = RecoverIntakeBodySchema.safeParse(req.body);
      if (!bodyParsed.success) {
        res.status(400).json({ error: 'Invalid request', details: bodyParsed.error.flatten() });
        return;
      }
      const { sourceUrl, failureReason } = bodyParsed.data;

      const images = files.map((f) => ({ buffer: f.buffer, mimeType: f.mimetype }));
      const contextNote =
        `Source URL (blocked — not fetched directly): ${sourceUrl}` +
        (failureReason ? `\nFailure reason: ${failureReason}` : '');

      let analysis;
      try {
        analysis = await getIntakeAgent().analyzeMultiImageEvidence(images, contextNote);
      } catch (err) {
        console.error('[recover-intake] IntakeAgent error:', err);
        res.status(500).json({ error: 'AI analysis failed', message: String(err) });
        return;
      }

      res.status(200).json({ analysis, sourceUrl });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/evidence/recover-confirm
// Blocked-URL screenshot recovery, persist step. Same multipart shape as
// /recover-intake plus the already-computed "analysis" JSON (round-tripped
// after the user reviews the draft, same pattern as /confirm). Always saves
// PENDING_REVIEW — the paired sourceUrl is asserted, never fetched — no
// on-chain registration, no vector-store upsert. createdById is always null:
// no researcher context exists on this public route.
// ---------------------------------------------------------------------------

router.post(
  '/recover-confirm',
  aiCostLimiter,
  uploadScreenshots.array('screenshots', 10),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        res.status(400).json({
          error: 'Invalid request',
          message: 'At least one "screenshots" file is required.',
        });
        return;
      }

      const bodyParsed = RecoverConfirmBodySchema.safeParse(req.body);
      if (!bodyParsed.success) {
        res.status(400).json({ error: 'Invalid request', details: bodyParsed.error.flatten() });
        return;
      }
      const { sourceUrl, analysis: analysisStr } = bodyParsed.data;

      let analysisRaw: unknown;
      try {
        analysisRaw = JSON.parse(analysisStr);
      } catch {
        res.status(400).json({ error: 'Invalid JSON', message: 'The "analysis" field must be valid JSON.' });
        return;
      }

      const analysisParsed = IntakeOutputSchema.safeParse(analysisRaw);
      if (!analysisParsed.success) {
        res.status(400).json({ error: 'Invalid analysis', details: analysisParsed.error.flatten() });
        return;
      }

      const images = files.map((f) => ({ buffer: f.buffer, mimeType: f.mimetype }));

      let result;
      try {
        result = await persistScreenshotEvidence({
          images,
          analysis: analysisParsed.data,
          sourceUrl,
          createdById: null,
        });
      } catch (err) {
        console.error('[recover-confirm] persistScreenshotEvidence error:', err);
        res.status(500).json({ error: 'Evidence recovery failed', message: String(err) });
        return;
      }

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/evidence/contact
// Dark Vault endpoint — stores encrypted whistleblower contact info in SQLite.
// Pinecone is never touched. Requires explicit consent.
// ---------------------------------------------------------------------------

router.post('/contact', async (req: Request, res: Response): Promise<void> => {
  const parsed = ContactBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { fileHash, contactInfo } = parsed.data;

  try {
    const encryptedContact = encryptContact(contactInfo);
    await prisma.whistleblower.upsert({
      where: { fileHash },
      update: { encryptedContact, consentGiven: true },
      create: { fileHash, encryptedContact, consentGiven: true },
    });
    res.status(200).json({ saved: true });
  } catch (err) {
    console.error('[contact] Dark Vault error:', err instanceof Error ? err.stack : err);
    res.status(500).json({
      error: 'Failed to save contact',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/evidence/timeline?targetEntity=...
// Returns evidence sorted chronologically by evidenceDate (ascending).
// ---------------------------------------------------------------------------

const TimelineQuerySchema = z.object({
  targetEntity: z.string().optional(),
  fileHash: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/timeline', identifyResearcher, async (req: Request, res: Response): Promise<void> => {
  const parsed = TimelineQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    return;
  }

  const { targetEntity, fileHash, cursor, limit } = parsed.data;
  const where = {
    // Unreviewed records are not public. See lib/evidenceVisibility.
    ...evidenceWhereForViewer(req),
    ...(targetEntity ? { targetEntity } : {}),
    ...(fileHash ? { fileHash } : {}),
  };

  try {
    const [totalCount, rows] = await Promise.all([
      prisma.evidence.count({ where }),
      prisma.evidence.findMany({
        where,
        orderBy: [{ evidenceDate: 'asc' }, { createdAt: 'asc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { fileHash: cursor }, skip: 1 } : {}),
        include: {
          urlVersionDiff: { select: { trackedUrlId: true } },
          figures: { select: { id: true, name: true } },
        },
      }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.fileHash ?? null) : null;

    // Wrap in { content, metadata } to match the TimelineRecord shape the frontend expects.
    const results = page.map((r) => ({
      content: r.summary,
      metadata: mapEvidenceToRecord(r, r.urlVersionDiff?.trackedUrlId ?? null),
    }));

    res.status(200).json({
      targetEntity: targetEntity ?? null,
      fileHash: fileHash ?? null,
      totalCount,
      results,
      nextCursor,
      hasMore,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[timeline] Prisma error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: 'Timeline fetch failed', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/evidence/promote
//
// Promotes a PENDING_REVIEW evidence record to CONFIRMED:
//   1. Registers the file hash on-chain (Web3Service)
//   2. Upserts the summary embedding to Pinecone (VectorStoreService)
//   3. Sets status = CONFIRMED in Prisma
//
// Idempotent for already-CONFIRMED records — returns 200 with existing txHash.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Promotion is deliberately NOT exposed over REST.
//
// It was, as POST /api/evidence/promote, taking a fileHash and no credentials.
// The hash is not a secret: for a forensic record it is derived from the page
// URL, the two archive timestamps and the two capture hashes, every one of
// which this API publishes. So a pending record's identifier could be computed
// from public data and posted back to force its promotion — registering it
// on-chain and publishing an AI-written allegation that no person had approved.
//
// Promotion goes through MCP, where the caller is an authenticated, approved
// researcher — see promote_evidence and promote_scan_findings.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /api/evidence/stats
// Returns aggregate counts by tier and category across all stored evidence.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /api/evidence/latest?limit=
//
// Most recently submitted CONFIRMED evidence, newest first — for the
// homepage "Latest Evidence" highlight strip. Distinct from /timeline, which
// sorts by evidenceDate (the real-world event date) for the investigation
// view; this sorts by createdAt (submission recency), a freshness signal.
// Response is deliberately trimmed to teaser fields, not the full
// EvidenceRecord shape — full detail is one click away at /evidence/:id.
// ---------------------------------------------------------------------------

const LatestQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).default(6),
});

router.get('/latest', async (req: Request, res: Response): Promise<void> => {
  const parsed = LatestQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    return;
  }
  const { limit } = parsed.data;

  try {
    const rows = await prisma.evidence.findMany({
      where: { status: 'CONFIRMED' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        fileHash: true,
        summary: true,
        targetEntity: true,
        evidenceTier: true,
        investigativeCategories: true,
        evidenceDate: true,
        createdAt: true,
      },
    });

    res.status(200).json({
      results: rows.map((r) => ({
        evidenceId: r.id,
        fileHash: r.fileHash,
        summary: r.summary,
        targetEntity: r.targetEntity,
        evidenceTier: r.evidenceTier,
        investigativeCategories: r.investigativeCategories,
        evidenceDate: r.evidenceDate,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[latest] Prisma error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: 'Latest evidence fetch failed', message });
  }
});

router.get('/stats', identifyResearcher, async (req: Request, res: Response): Promise<void> => {
  try {
    // A count discloses EXISTENCE. An unreviewed record showing up as
    // "1 · Tier 1: Smoking Gun" tells a reader one exists and how it was graded,
    // which is most of what the review was meant to withhold.
    const where = evidenceWhereForViewer(req);
    const [total, tierGroups, classified] = await Promise.all([
      prisma.evidence.count({ where }),
      prisma.evidence.groupBy({ by: ['evidenceTier'], where, _count: { evidenceTier: true } }),
      prisma.evidence.findMany({ where, select: { investigativeCategories: true } }),
    ]);

    const byTier: Record<string, number> = {};
    for (const g of tierGroups) byTier[g.evidenceTier] = g._count.evidenceTier;

    // investigativeCategories is multi-valued, so counts overlap by design: one
    // record advancing two concerns is counted under both, and the totals here
    // will exceed `total`. groupBy cannot express this — Postgres cannot group
    // by an array column element-wise.
    const byCategory: Record<string, number> = {};
    for (const category of INVESTIGATIVE_CATEGORIES) byCategory[category] = 0;
    for (const row of classified) {
      for (const category of row.investigativeCategories) {
        byCategory[category] = (byCategory[category] ?? 0) + 1;
      }
    }

    res.status(200).json({ total, byTier, byCategory });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stats] Prisma error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: 'Stats fetch failed', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/evidence/search?q=query&limit=5
// ---------------------------------------------------------------------------

router.get('/search', async (req: Request, res: Response): Promise<void> => {
  const parsed = SearchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    return;
  }

  const { q, limit } = parsed.data;

  try {
    const vectorStore = await getVectorStore();
    const vectorResults = await vectorStore.searchSimilarEvidence(q, limit);

    // Enrich with structured metadata from Prisma, preserving semantic score order.
    const fileHashes = vectorResults.map((r) => r.fileHash);
    const rows = await prisma.evidence.findMany({
      where: { fileHash: { in: fileHashes } },
      include: { figures: { select: { id: true, name: true } } },
    });

    const byHash = new Map(rows.map((r) => [r.fileHash, r]));
    const results = vectorResults
      .filter((r) => byHash.has(r.fileHash))
      .map((r) => {
        const row = byHash.get(r.fileHash)!;
        return {
          content: r.content,
          score: r.score,
          metadata: mapEvidenceToRecord(row),
        };
      });

    res.status(200).json({ query: q, count: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[search] error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: 'Search failed', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/evidence/key-figures?q=&limit=20
//
// Returns distinct key figures extracted from evidence records.
// Used by the TipTap @mention autocomplete in the thesis editor.
// ---------------------------------------------------------------------------

const KeyFiguresQuerySchema = z.object({
  q: z.string().default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/key-figures', async (req: Request, res: Response): Promise<void> => {
  const parsed = KeyFiguresQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    return;
  }

  const { q, limit } = parsed.data;

  try {
    const keyFigures = await prisma.keyFigure.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      take: limit,
      select: {
        id: true,
        name: true,
        _count: { select: { evidence: true } },
      },
    });

    res.status(200).json({
      keyFigures: keyFigures.map((f) => ({
        id: f.id,
        name: f.name,
        evidenceCount: f._count.evidence,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch key figures', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/evidence/:id — full record by UUID
// ---------------------------------------------------------------------------

router.get('/:id', identifyResearcher, async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id']);
  try {
    const [record, mentions] = await Promise.all([
      prisma.evidence.findUnique({
        where: { id },
        include: {
          figures: { select: { id: true, name: true } },
          urlVersionDiff: {
            select: {
              trackedUrlId: true,
              trackedUrl: { select: { url: true } },
              beforeDate: true,
              afterDate: true,
              snapshotUrl: true,
              deletedText: true,
              addedText: true,
              aiSignificance: true,
              isLegallySignificant: true,
              // LEVEL 5 MATTERS MOST HERE. This is the diff a promoted — and
              // possibly ANCHORED — evidence record is built from. If the
              // archived documents refute the change, the record above it rests
              // on a fault in the pipeline rather than on something the page did,
              // and this page is where a reader would find that out.
              //
              // rawDeletedText / rawAddedText and the snapshot relations arrive
              // with the shared select; `snapshotUrl` is merged into the before
              // relation rather than named twice.
              ...SURVIVAL_VIEW_SELECT,
              beforeSnapshot: {
                select: { snapshotUrl: true, textHash: true, textExtractionVersion: true },
              },
            },
          },
          createdBy: { select: { handle: true } },
        },
      }),
      // ThesisMention uses refId = fileHash — resolved after we have the record
      prisma.evidence.findUnique({ where: { id }, select: { fileHash: true } }).then(async (e) => {
        if (!e) return [];
        return prisma.thesisMention.findMany({
          where: { type: 'EVIDENCE', refId: e.fileHash },
          select: { thesisVersion: { select: { thesis: { select: { id: true, title: true } } } } },
          distinct: ['thesisVersionId'],
        });
      }),
    ]);

    // 404, not 403: a distinguishable response would confirm the record exists,
    // and existence is part of what the review withholds.
    if (!record || (record.status !== 'CONFIRMED' && !viewerSeesUnreviewed(req))) {
      res.status(404).json({ error: 'Evidence not found', id });
      return;
    }

    // Deduplicate theses (same thesis may have multiple versions cited)
    const seenThesisIds = new Set<string>();
    const citingTheses: { id: string; title: string | null }[] = [];
    for (const m of mentions) {
      const thesis = m.thesisVersion.thesis;
      if (!seenThesisIds.has(thesis.id)) {
        seenThesisIds.add(thesis.id);
        citingTheses.push(thesis);
      }
    }

    // For FORENSIC_DIFF evidence, surface the same diff shape the timeline page
    // renders — deletions/additions, AI rationale, and both archive snapshot
    // links — so a reader doesn't have to leave the evidence record to see what
    // the evidence actually consists of.
    const diffRecord = record.urlVersionDiff;
    const diff = diffRecord
      ? {
          id: record.urlVersionDiffId,
          beforeDate: diffRecord.beforeDate,
          date: diffRecord.afterDate,
          snapshotUrl: diffRecord.snapshotUrl,
          beforeSnapshotUrl: diffRecord.beforeSnapshot?.snapshotUrl ?? null,
          deletedItems: parseDiffItems(diffRecord.deletedText),
          addedItems: parseDiffItems(diffRecord.addedText),
          rawDeletedChunks: JSON.parse(diffRecord.rawDeletedText) as string[],
          rawAddedChunks: JSON.parse(diffRecord.rawAddedText) as string[],
          legalSignificance: diffRecord.aiSignificance,
          isLegallySignificant: diffRecord.isLegallySignificant,
          survival: diffSurvivalView(diffRecord),
          // An Evidence row for this diff — NOT necessarily a promotion of it.
          //
          // This said "always already promoted", which was true when every
          // Evidence row was created by promoting something. recordScanFinding
          // then began writing PENDING_REVIEW candidates and the assumption was
          // never revisited, so an unreviewed finding rendered as promoted on
          // its own page — the claim the review exists to make, made on its
          // behalf. The status decides; the caller no longer infers it.
          promotedEvidence: { id: record.id, fileHash: record.fileHash, status: record.status },
        }
      : null;

    res.status(200).json({
      evidenceId: record.id,
      fileHash: record.fileHash,
      status: record.status,
      evidenceType: record.evidenceType,
      evidenceRole: record.evidenceRole,
      investigativeCategories: record.investigativeCategories,
      evidenceTier: record.evidenceTier,
      evidencePerspective: record.evidencePerspective,
      tierReasoning: record.tierReasoning,
      summary: record.summary,
      targetEntity: record.targetEntity,
      // This route hand-builds its response rather than using
      // mapEvidenceToRecord, so a field added to the shared mapper never
      // reaches it. That is how canonicalTargetEntity came to be resolved in
      // the database and null in this endpoint.
      canonicalTargetEntity: record.canonicalTargetEntity,
      evidenceDate: record.evidenceDate,
      figures: record.figures,
      medicalConditions: JSON.parse(record.medicalConditions ?? '[]') as string[],
      statisticalClaims: JSON.parse(record.statisticalClaims ?? '[]') as string[],
      regulatoryMentions: JSON.parse(record.regulatoryMentions ?? '[]') as string[],
      euaOmissionStatus: record.euaOmissionStatus,
      sourceUrl: record.sourceUrl,
      fileUrl: record.fileUrl,
      additionalScreenshotUrls: record.additionalScreenshotUrls,
      trackedUrlId: record.urlVersionDiff?.trackedUrlId ?? null,
      trackedUrl: record.urlVersionDiff?.trackedUrl?.url ?? null,
      diff,
      citingTheses,
      createdAt: record.createdAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch evidence', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/evidence/backfill-pinecone — one-shot admin: index all CONFIRMED
// ---------------------------------------------------------------------------

export { router as evidenceRouter };
