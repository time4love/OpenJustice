import { createClient } from '@supabase/supabase-js';
import { Request, Response, NextFunction } from 'express';
import { extractBearerToken } from '../lib/bearerToken';

// ---------------------------------------------------------------------------
// Supabase JWT verification middleware
//
// Verifies the caller's Supabase access token against the Supabase Auth API.
// Attaches the validated supabaseUserId to the request for downstream use.
// Use on auth-management endpoints (POST /register, POST /mcp-token, etc.).
//
// Note: MCP bearer tokens use a separate path (mcpRoutes DB lookup).
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      supabaseUserId?: string;
    }
  }
}

function getSupabaseClient() {
  const url = process.env['SUPABASE_URL'];
  const anonKey = process.env['SUPABASE_ANON_KEY'];
  if (!url || !anonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY env vars are required');
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------------------
// verifySupabaseUserId
//
// Shared by requireSupabaseAuth (header-based, standard fetch() call sites)
// and the OAuth interaction routes (body-based — those are real browser form
// submissions, not fetch, so a custom Authorization header isn't an option;
// see oauthInteractionRoutes.ts for why).
// ---------------------------------------------------------------------------

export async function verifySupabaseUserId(token: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export async function requireSupabaseAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearerToken(req);

  if (!token) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing Authorization: Bearer <token>' });
    return;
  }

  try {
    const supabaseUserId = await verifySupabaseUserId(token);
    if (!supabaseUserId) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired Supabase token' });
      return;
    }

    req.supabaseUserId = supabaseUserId;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Auth check failed', message });
  }
}
