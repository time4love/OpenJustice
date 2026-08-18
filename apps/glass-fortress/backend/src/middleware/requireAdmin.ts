import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

// ---------------------------------------------------------------------------
// Admin-role gate — chain after requireSupabaseAuth, which populates
// req.supabaseUserId. Looks up the caller's Researcher record and rejects
// with 403 unless role === 'ADMIN'.
// ---------------------------------------------------------------------------

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const caller = await prisma.researcher.findUnique({ where: { supabaseUserId: req.supabaseUserId! } });
  if (!caller || caller.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
