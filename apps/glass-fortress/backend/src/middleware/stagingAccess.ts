// ---------------------------------------------------------------------------
// Staging API access gate
//
// The frontend password gate covers pages only — Next.js proxy necessarily
// excludes /api/* from its own routing, so the staging backend's public
// Railway URL was reachable by anyone who had it, gate or no gate. This
// closes that gap with a static bearer token, checked only when
// APP_ENV=staging; production is never gated, matching the frontend gate's
// own fail-safe-by-absence design.
// ---------------------------------------------------------------------------

import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { getAppEnv } from '../lib/appEnv';

/** Header name for the staging gate token — deliberately not `Authorization`,
 * which researcher/MCP auth (`resolveResearcher`) and Supabase auth
 * (`requireSupabaseAuth`) also read on the same requests for a different
 * secret. Sharing that header meant no request could satisfy both checks. */
const STAGING_TOKEN_HEADER = 'x-staging-token';

/** Constant-time comparison — the token is a bearer credential. */
function isValidToken(candidate: string, secret: string): boolean {
  const expected = Buffer.from(secret, 'utf8');
  const actual = Buffer.from(candidate, 'utf8');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Requires an `X-Staging-Token: <STAGING_API_TOKEN>` header on every request
 * once APP_ENV=staging. Fails closed: a staging deploy with no token
 * configured returns 503 rather than serving the API unauthenticated — the
 * same failure mode as the frontend's password gate, for the same reason.
 */
export function requireStagingAccess(req: Request, res: Response, next: NextFunction): void {
  if (getAppEnv() === 'production') {
    next();
    return;
  }

  const secret = process.env['STAGING_API_TOKEN'];
  if (!secret) {
    res.status(503).json({ error: 'Staging API access is not configured.' });
    return;
  }

  const token = req.headers[STAGING_TOKEN_HEADER];
  if (!token || typeof token !== 'string' || !isValidToken(token, secret)) {
    res.status(401).json({
      error: 'Unauthorized',
      message: `Staging requires ${STAGING_TOKEN_HEADER}: <token>.`,
    });
    return;
  }

  next();
}
