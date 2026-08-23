import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { extractBearerToken } from '../lib/bearerToken';
import { verifySupabaseUserId } from './supabaseAuth';

// ---------------------------------------------------------------------------
// Researcher identity on REST routes.
//
// Until the publication gate, no thesis route knew who was calling: the thesis
// page and the call page served the head version to everyone. Publication is
// now a pinned version, so reads are viewer-dependent — the public gets the
// published version, an approved researcher gets the head — and the publish
// controls are researcher-only.
//
//   identifyResearcher — OPTIONAL. Sets req.researcherId when the bearer is a
//                        valid Supabase session belonging to an APPROVED
//                        researcher; otherwise continues anonymously. Never
//                        rejects: an anonymous read is a valid read.
//   requireResearcher  — REQUIRED. 401 without a valid session, 403 without
//                        an approved researcher record.
//
// Approval is re-checked on every request, never cached — it can be revoked.
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      researcherId?: string;
    }
  }
}

type Identity =
  | { kind: 'anonymous' }
  | { kind: 'unverified' }
  | { kind: 'not_researcher' }
  | { kind: 'not_approved'; handle: string }
  | { kind: 'ok'; researcherId: string };

async function identify(req: Request): Promise<Identity> {
  const token = extractBearerToken(req);
  if (!token) return { kind: 'anonymous' };

  const supabaseUserId = await verifySupabaseUserId(token);
  if (!supabaseUserId) return { kind: 'unverified' };

  const researcher = await prisma.researcher.findUnique({
    where: { supabaseUserId },
    select: { id: true, handle: true, approved: true },
  });
  if (!researcher) return { kind: 'not_researcher' };
  if (!researcher.approved) return { kind: 'not_approved', handle: researcher.handle };
  return { kind: 'ok', researcherId: researcher.id };
}

export async function identifyResearcher(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const identity = await identify(req);
    if (identity.kind === 'ok') req.researcherId = identity.researcherId;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Auth check failed', message });
  }
}

export async function requireResearcher(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const identity = await identify(req);
    switch (identity.kind) {
      case 'ok':
        req.researcherId = identity.researcherId;
        next();
        return;
      case 'anonymous':
        res.status(401).json({ error: 'Unauthorized', message: 'Missing Authorization: Bearer <token>' });
        return;
      case 'unverified':
        res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired Supabase token' });
        return;
      case 'not_researcher':
        res.status(403).json({ error: 'Forbidden', message: 'No researcher account for this login. Register first.' });
        return;
      case 'not_approved':
        res.status(403).json({ error: 'Forbidden', message: `Account '${identity.handle}' is not yet approved.` });
        return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Auth check failed', message });
  }
}
