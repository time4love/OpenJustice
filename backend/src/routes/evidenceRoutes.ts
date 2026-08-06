import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { IntakeAgent } from '../services/IntakeAgent.js';
import { Web3Service, DuplicateEvidenceError } from '../services/Web3Service.js';
import { VectorStoreService } from '../services/VectorStoreService.js';

const router = Router();

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const IntakeBodySchema = z.object({
  rawText: z.string().min(1, 'rawText must not be empty'),
  submitterAddress: z.string().min(1, 'submitterAddress must not be empty'),
});

const SearchQuerySchema = z.object({
  q: z.string().default(''),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

// ---------------------------------------------------------------------------
// Lazy singletons — constructed once on first request to avoid startup
// failures when env vars may not yet be set during testing.
// ---------------------------------------------------------------------------

let _intakeAgent: IntakeAgent | null = null;
let _web3Service: Web3Service | null = null;
let _vectorStorePromise: Promise<VectorStoreService> | null = null;

function getIntakeAgent(): IntakeAgent {
  if (!_intakeAgent) _intakeAgent = new IntakeAgent();
  return _intakeAgent;
}

function getWeb3Service(): Web3Service {
  if (!_web3Service) _web3Service = new Web3Service();
  return _web3Service;
}

function getVectorStore(): Promise<VectorStoreService> {
  if (!_vectorStorePromise) _vectorStorePromise = VectorStoreService.create();
  return _vectorStorePromise;
}

// ---------------------------------------------------------------------------
// POST /api/evidence/intake
// ---------------------------------------------------------------------------

router.post('/intake', async (req: Request, res: Response): Promise<void> => {
  // 1. Validate request body
  const parsed = IntakeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { rawText, submitterAddress } = parsed.data;

  // 2. Run AI intake analysis
  let analysis;
  try {
    analysis = await getIntakeAgent().analyzeEvidence(rawText);
  } catch (err) {
    console.error('[intake] IntakeAgent error:', err);
    res.status(500).json({ error: 'AI analysis failed', message: String(err) });
    return;
  }

  // 3. If not relevant, return early — no blockchain or vector DB action
  if (!analysis.isRelevant) {
    res.status(200).json({
      relevant: false,
      message: 'Evidence was analysed but deemed not relevant to the lawsuit.',
      analysis,
    });
    return;
  }

  // 4. Hash the raw text to produce a bytes32 file hash
  const fileHash = Web3Service.hashFile(Buffer.from(rawText, 'utf8'));

  // 5. Register the hash on-chain
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
    console.error('[intake] Web3Service error:', err);
    res.status(500).json({ error: 'Blockchain registration failed', message: String(err) });
    return;
  }

  // 6. Upsert the analysis into the vector store
  try {
    const vectorStore = await getVectorStore();
    await vectorStore.upsertEvidence(rawText, {
      fileHash,
      category: analysis.category,
      tier: analysis.evidenceTier,
      summary: analysis.summary,
      targetEntity: analysis.targetEntity,
      submitterAddress,
      timestamp: Date.now(),
    });
  } catch (err) {
    // Vector store failure is non-fatal: the on-chain record is the source of truth.
    // Log and continue so the caller still gets their tx hash.
    console.error('[intake] VectorStoreService upsert error (non-fatal):', err);
  }

  // 7. Return full result
  res.status(201).json({
    relevant: true,
    fileHash,
    txHash,
    analysis,
  });
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
    console.error('[search] VectorStoreService error:', err);
    res.status(500).json({ error: 'Search failed', message: String(err) });
  }
});

export { router as evidenceRouter };
