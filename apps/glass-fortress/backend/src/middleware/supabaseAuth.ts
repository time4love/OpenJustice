import { createClient, User } from '@supabase/supabase-js';
import { Request, Response, NextFunction } from 'express';
import { extractBearerToken } from '../lib/bearerToken';

// ---------------------------------------------------------------------------
// Supabase JWT verification middleware
//
// Verifies the caller's Supabase access token against the Supabase Auth API.
// Two consumers, two different needs:
//   - requireSupabaseAuth: Researcher auth-management endpoints (POST
//     /register, POST /mcp-token, etc.) — attaches supabaseUserId, account
//     is meant to persist.
//   - requireVerifiedReporterEmail: public adverse-event report intake — a
//     one-time proof of a controllable email, nothing more. Deletes the
//     Supabase Auth account immediately after verifying it (Admin API,
//     service-role key) — see
//     docs/gf-adverse-event-report-schema-dev-plan.md §2.8: Report retains
//     no identity-derived field at all, so leaving the account behind would
//     be the one standing, easy-to-breach directory of who reported. This
//     is required behavior, not a nicety — do not make it conditional or
//     best-effort. Does NOT attach the email to `req` — nothing downstream
//     needs it once verification has happened, and holding it past this
//     point would undermine the whole point of the deletion.
//
// Note: MCP bearer tokens use a separate path (mcpRoutes DB lookup).
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      supabaseUserId?: string;
      reporterVerified?: boolean;
    }
  }
}

function getSupabaseClient() {
  const url = process.env['SUPABASE_URL'];
  const anonKey = process.env['SUPABASE_ANON_KEY'];
  if (!url || !anonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY env vars are required');
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

// Service-role client — required for auth.admin.* calls (deleting the
// reporter's account). Same env var StorageService already uses for
// Supabase Storage; scoped here strictly to auth.admin, not reused broadly.
function getSupabaseAdminClient() {
  const url = process.env['SUPABASE_URL'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required');
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function getSupabaseUser(token: string): Promise<User | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
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
  const user = await getSupabaseUser(token);
  return user?.id ?? null;
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

// ---------------------------------------------------------------------------
// requireVerifiedReporterEmail
//
// Public report intake's auth gate. Verifies the bearer token proves a real,
// controllable email (Supabase magic-link/OTP session), then immediately
// deletes that Supabase Auth account before calling next() — see the file
// header for why this is required, not optional. Sets req.reporterVerified
// = true only; the email itself never leaves this function's scope.
// ---------------------------------------------------------------------------

export async function requireVerifiedReporterEmail(
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
    const user = await getSupabaseUser(token);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired verification token' });
      return;
    }

    try {
      const admin = getSupabaseAdminClient();
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
      if (deleteError) {
        // Fail closed: if we can't guarantee the account is deleted, do not
        // proceed with a report that was supposed to leave nothing behind.
        console.error('[requireVerifiedReporterEmail] Failed to delete verified reporter account:', deleteError);
        res.status(500).json({ error: 'Verification cleanup failed', message: 'Please try again.' });
        return;
      }
    } catch (deleteErr) {
      console.error('[requireVerifiedReporterEmail] Failed to delete verified reporter account:', deleteErr);
      res.status(500).json({ error: 'Verification cleanup failed', message: 'Please try again.' });
      return;
    }

    req.reporterVerified = true;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Auth check failed', message });
  }
}
