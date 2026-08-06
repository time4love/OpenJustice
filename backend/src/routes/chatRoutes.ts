import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TrustAgent, ChatMessage } from '../services/TrustAgent';

const router = Router();

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
});

const ChatBodySchema = z.object({
  message: z.string().min(1, 'message is required').max(2000, 'message too long'),
  history: z.array(ChatMessageSchema).max(50).default([]),
  locale: z.enum(['he', 'en']).default('he'),
});

// ---------------------------------------------------------------------------
// Lazy singleton
// ---------------------------------------------------------------------------

let _trustAgent: TrustAgent | null = null;

function getTrustAgent(): TrustAgent {
  if (!_trustAgent) _trustAgent = new TrustAgent();
  return _trustAgent;
}

// ---------------------------------------------------------------------------
// POST /api/chat
// Accepts { message, history, locale } — returns the Trust Agent's response
// in the requested language.
// ---------------------------------------------------------------------------

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = ChatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { message, history, locale } = parsed.data;

  try {
    const agent = getTrustAgent();
    const response = await agent.chat(message, history as ChatMessage[], locale);
    res.status(200).json({ response });
  } catch (err) {
    console.error('[chat] TrustAgent error:', err);
    res.status(500).json({ error: 'Chat failed', message: String(err) });
  }
});

export { router as chatRouter };
