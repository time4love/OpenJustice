import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { LegalMasterAgent } from '../services/LegalMasterAgent';
import { VectorStoreService } from '../services/VectorStoreService';
import { INVESTIGATIVE_CATEGORIES } from '../lib/investigativeCategories';

const router = Router();

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const GenerateBodySchema = z.object({
  concern: z.enum(INVESTIGATIVE_CATEGORIES),
  targetEntity: z.string().min(1, 'targetEntity must not be empty'),
});

// ---------------------------------------------------------------------------
// Lazy singleton — agent is expensive to construct (vector store connection).
// ---------------------------------------------------------------------------

let _agentPromise: Promise<LegalMasterAgent> | null = null;

function getAgent(): Promise<LegalMasterAgent> {
  if (!_agentPromise) {
    _agentPromise = VectorStoreService.create().then((vs) => new LegalMasterAgent(vs));
  }
  return _agentPromise;
}

// ---------------------------------------------------------------------------
// POST /api/arguments/generate
// ---------------------------------------------------------------------------

router.post('/generate', async (req: Request, res: Response): Promise<void> => {
  const parsed = GenerateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { concern, targetEntity } = parsed.data;

  try {
    const agent = await getAgent();
    const argument = await agent.generateArgument(concern, targetEntity);
    res.status(200).json(argument);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isNotFound = message.startsWith('No evidence found');
    console.error('[arguments/generate] LegalMasterAgent error:', err);
    res.status(isNotFound ? 404 : 500).json({ error: 'Argument generation failed', message });
  }
});

export { router as argumentRouter };
