import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireSupabaseAuth } from '../middleware/supabaseAuth';
import { generateToken, hashToken } from '../lib/tokenHash';

const router = Router();

// ---------------------------------------------------------------------------
// Helper: look up the Researcher for the authenticated Supabase user.
// Returns null if no Researcher record exists yet.
// ---------------------------------------------------------------------------

async function getResearcher(supabaseUserId: string) {
  return prisma.researcher.findUnique({ where: { supabaseUserId } });
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
//
// Creates a Researcher record for the authenticated Supabase user.
// handle must be unique — this is the only public identifier.
// Account starts as approved=false; admin must approve before MCP token works.
// ---------------------------------------------------------------------------

router.post('/register', requireSupabaseAuth, async (req: Request, res: Response): Promise<void> => {
  const { handle } = req.body as { handle?: string };

  if (!handle || typeof handle !== 'string' || handle.trim().length < 2) {
    res.status(400).json({ error: 'handle must be at least 2 characters' });
    return;
  }

  const trimmedHandle = handle.trim();
  if (!/^[\w\u0590-\u05FF\u200f\u200e _-]{2,30}$/.test(trimmedHandle)) {
    res.status(400).json({
      error: 'handle may only contain letters (including Hebrew), digits, spaces, hyphens, and underscores (2–30 chars)',
    });
    return;
  }

  const supabaseUserId = req.supabaseUserId!;

  const existing = await prisma.researcher.findUnique({ where: { supabaseUserId } });
  if (existing) {
    res.status(409).json({ error: 'Researcher account already exists for this user' });
    return;
  }

  const handleTaken = await prisma.researcher.findUnique({ where: { handle: trimmedHandle } });
  if (handleTaken) {
    res.status(409).json({ error: 'Handle is already taken — choose a different one' });
    return;
  }

  const researcher = await prisma.researcher.create({
    data: { supabaseUserId, handle: trimmedHandle },
    select: { id: true, handle: true, role: true, approved: true, createdAt: true },
  });

  res.status(201).json({
    ...researcher,
    message: 'Account created. Awaiting admin approval before MCP write access is granted.',
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
//
// Returns the Researcher record for the authenticated Supabase user.
// Does NOT return supabaseUserId — only the public/internal fields.
// ---------------------------------------------------------------------------

router.get('/me', requireSupabaseAuth, async (req: Request, res: Response): Promise<void> => {
  const researcher = await getResearcher(req.supabaseUserId!);
  if (!researcher) {
    res.status(404).json({ error: 'No researcher account found. Call POST /api/auth/register first.' });
    return;
  }

  res.json({
    id: researcher.id,
    handle: researcher.handle,
    role: researcher.role,
    approved: researcher.approved,
    hasMcpToken: researcher.mcpTokenHash !== null,
    createdAt: researcher.createdAt,
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/mcp-token
//
// Generates (or rotates) the caller's MCP bearer token.
// The plaintext token is returned exactly once — we store only the HMAC hash.
// Requires an approved account.
// ---------------------------------------------------------------------------

router.post('/mcp-token', requireSupabaseAuth, async (req: Request, res: Response): Promise<void> => {
  const researcher = await getResearcher(req.supabaseUserId!);
  if (!researcher) {
    res.status(404).json({ error: 'No researcher account found. Call POST /api/auth/register first.' });
    return;
  }

  if (!researcher.approved) {
    res.status(403).json({
      error: 'Account not yet approved',
      message: 'An admin must approve your researcher account before you can generate an MCP token.',
    });
    return;
  }

  const plaintext = generateToken();
  const tokenHash = hashToken(plaintext);

  await prisma.researcher.update({
    where: { id: researcher.id },
    data: { mcpTokenHash: tokenHash },
  });

  res.json({
    token: plaintext,
    message:
      'Store this token securely — it will not be shown again. ' +
      'Add it to your Claude Desktop config: { "headers": { "Authorization": "Bearer <token>" } }',
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/researchers   [ADMIN only]
//
// Lists all researcher accounts (handle, role, approved, joined date).
// Never returns supabaseUserId or mcpTokenHash.
// ---------------------------------------------------------------------------

router.get('/researchers', requireSupabaseAuth, async (req: Request, res: Response): Promise<void> => {
  const caller = await getResearcher(req.supabaseUserId!);
  if (!caller || caller.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const researchers = await prisma.researcher.findMany({
    select: { id: true, handle: true, role: true, approved: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  res.json(researchers);
});

// ---------------------------------------------------------------------------
// PATCH /api/auth/researchers/:id   [ADMIN only]
//
// Approve or revoke a researcher account, or change their role.
// Body: { approved?: boolean; role?: 'RESEARCHER' | 'ADMIN' }
// ---------------------------------------------------------------------------

router.patch('/researchers/:id', requireSupabaseAuth, async (req: Request, res: Response): Promise<void> => {
  const caller = await getResearcher(req.supabaseUserId!);
  if (!caller || caller.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const id = String(req.params['id']);
  const { approved, role } = req.body as { approved?: boolean; role?: 'RESEARCHER' | 'ADMIN' };

  if (approved === undefined && role === undefined) {
    res.status(400).json({ error: 'Provide at least one field: approved or role' });
    return;
  }

  if (role !== undefined && role !== 'RESEARCHER' && role !== 'ADMIN') {
    res.status(400).json({ error: 'role must be RESEARCHER or ADMIN' });
    return;
  }

  const target = await prisma.researcher.findUnique({ where: { id } });
  if (!target) {
    res.status(404).json({ error: 'Researcher not found' });
    return;
  }

  const updated = await prisma.researcher.update({
    where: { id },
    data: {
      ...(approved !== undefined ? { approved } : {}),
      ...(role !== undefined ? { role } : {}),
    },
    select: { id: true, handle: true, role: true, approved: true, createdAt: true },
  });

  res.json(updated);
});

export { router as authRouter };
