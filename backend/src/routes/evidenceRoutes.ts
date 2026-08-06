import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { IntakeAgent, IntakeOutputSchema } from '../services/IntakeAgent';
import { Web3Service, DuplicateEvidenceError } from '../services/Web3Service';
import { VectorStoreService } from '../services/VectorStoreService';

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

const ConfirmBodySchema = z.object({
  analysis: z.string().min(1, 'analysis JSON is required'),
  submitterAddress: z.string().min(1, 'submitterAddress must not be empty'),
});

// ---------------------------------------------------------------------------
// Lazy singletons
// ---------------------------------------------------------------------------

let _vectorStorePromise: Promise<VectorStoreService> | null = null;
let _intakeAgentPromise: Promise<IntakeAgent> | null = null;
let _web3Service: Web3Service | null = null;

function getVectorStore(): Promise<VectorStoreService> {
  if (!_vectorStorePromise) _vectorStorePromise = VectorStoreService.create();
  return _vectorStorePromise;
}

function getIntakeAgent(): Promise<IntakeAgent> {
  if (!_intakeAgentPromise) {
    _intakeAgentPromise = getVectorStore().then((vs) => new IntakeAgent(vs));
  }
  return _intakeAgentPromise;
}

function getWeb3Service(): Web3Service {
  if (!_web3Service) _web3Service = new Web3Service();
  return _web3Service;
}

// ---------------------------------------------------------------------------
// POST /api/evidence/intake
// Accepts a multipart file upload. Runs vision extraction + AI classification.
// Returns a draft analysis — NO hashing, blockchain, or vector store writes.
// ---------------------------------------------------------------------------

router.post(
  '/intake',
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded', message: 'A file field named "file" is required.' });
      return;
    }

    let analysis;
    try {
      const agent = await getIntakeAgent();
      analysis = await agent.analyzeEvidence(req.file.buffer, req.file.mimetype);
    } catch (err) {
      console.error('[intake] IntakeAgent error:', err);
      res.status(500).json({ error: 'AI analysis failed', message: String(err) });
      return;
    }

    res.status(200).json({ analysis });
  },
);

// ---------------------------------------------------------------------------
// POST /api/evidence/confirm
// Accepts the original file + user-approved analysis JSON + submitterAddress.
// Hashes the file, registers on-chain, upserts to vector store.
// ---------------------------------------------------------------------------

router.post(
  '/confirm',
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded', message: 'A file field named "file" is required.' });
      return;
    }

    // Parse the multipart text fields
    const bodyParsed = ConfirmBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: 'Invalid request', details: bodyParsed.error.flatten() });
      return;
    }

    // Parse the nested analysis JSON
    let analysisRaw: unknown;
    try {
      analysisRaw = JSON.parse(bodyParsed.data.analysis);
    } catch {
      res.status(400).json({ error: 'Invalid JSON', message: 'The "analysis" field must be valid JSON.' });
      return;
    }

    const analysisParsed = IntakeOutputSchema.safeParse(analysisRaw);
    if (!analysisParsed.success) {
      res.status(400).json({ error: 'Invalid analysis', details: analysisParsed.error.flatten() });
      return;
    }

    const analysis = analysisParsed.data;
    const { submitterAddress } = bodyParsed.data;

    // If the AI marked as not relevant, still allow registration but flag it
    // (the user consciously confirmed — their choice overrides the AI flag)

    // Hash the file
    const fileHash = Web3Service.hashFile(req.file.buffer);

    // Register on-chain
    let txHash: string;
    try {
      txHash = await getWeb3Service().registerEvidenceHash(fileHash, submitterAddress, analysis.category);
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

    // Upsert to vector store (non-fatal)
    try {
      const vectorStore = await getVectorStore();
      await vectorStore.upsertEvidence(analysis.summary, {
        fileHash,
        category: analysis.category,
        tier: analysis.evidenceTier,
        summary: analysis.summary,
        targetEntity: analysis.targetEntity,
        submitterAddress,
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
  },
);

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
    console.error('[search] VectorStoreService error:', err);
    res.status(500).json({ error: 'Search failed', message: String(err) });
  }
});

export { router as evidenceRouter };
