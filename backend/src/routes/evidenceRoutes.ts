import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ethers } from 'ethers';
import { IntakeAgent, IntakeOutputSchema } from '../services/IntakeAgent';
import { Web3Service, DuplicateEvidenceError } from '../services/Web3Service';
import { VectorStoreService } from '../services/VectorStoreService';
import { encryptContact } from '../lib/encrypt';
import { prisma } from '../lib/prisma';
import { scrapeUrl } from '../utils/webScraper';

const router = Router();

// ---------------------------------------------------------------------------
// Multer — in-memory storage, images and PDFs only, max 10 MB
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, PDF.`));
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
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let analysisRaw: unknown;
      let fileHash: string;

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
        const { url, scrapedText, analysis: analysisStr } = urlBodyParsed.data;
        try {
          analysisRaw = JSON.parse(analysisStr);
        } catch {
          res.status(400).json({ error: 'Invalid JSON', message: 'The "analysis" field must be valid JSON.' });
          return;
        }
        // Hash URL + scraped content for legal provenance — proves exactly what
        // existed at this link at the moment of submission.
        fileHash = Web3Service.hashFile(Buffer.from(`${url}\n\n${scrapedText}`, 'utf8'));
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
        txHash = await getWeb3Service().registerEvidenceHash(fileHash, ethers.ZeroAddress, analysis.category);
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

      // Upsert to vector store — no PII stored here
      try {
        const vectorStore = await getVectorStore();
        await vectorStore.upsertEvidence(analysis.summary, {
          fileHash,
          category: analysis.category,
          tier: analysis.evidenceTier,
          summary: analysis.summary,
          targetEntity: analysis.targetEntity,
          evidenceDate: analysis.evidenceDate,
          keyFigures: analysis.keyFigures,
          medicalConditions: analysis.medicalConditions,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('[confirm] VectorStoreService upsert error (non-fatal):', err);
      }

      res.status(201).json({
        relevant: analysis.isRelevant,
        fileHash,
        txHash,
        analysis,
      });
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
});

router.get('/timeline', async (req: Request, res: Response): Promise<void> => {
  const parsed = TimelineQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    return;
  }

  const { targetEntity } = parsed.data;

  try {
    const vectorStore = await getVectorStore();
    const results = await vectorStore.getTimeline(targetEntity);
    res.status(200).json({ targetEntity: targetEntity ?? null, count: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[timeline] VectorStoreService error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: 'Timeline fetch failed', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/evidence/stats
// Returns aggregate counts by tier and category across all stored evidence.
// ---------------------------------------------------------------------------

router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const vectorStore = await getVectorStore();
    const stats = await vectorStore.getEvidenceStats();
    res.status(200).json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stats] VectorStoreService error:', err instanceof Error ? err.stack : err);
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
    const results = await vectorStore.searchSimilarEvidence(q, limit);
    res.status(200).json({ query: q, count: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[search] VectorStoreService error:', err instanceof Error ? err.stack : err);
    console.error('[search] Hint: if this is a dimension mismatch, your Pinecone index was likely created for OpenAI (1536-dim). Gemini text-embedding-004 uses 768 dimensions — recreate the index with dimension=768.');
    res.status(500).json({ error: 'Search failed', message });
  }
});

export { router as evidenceRouter };
