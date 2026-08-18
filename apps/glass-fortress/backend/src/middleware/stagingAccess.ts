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
import { extractBearerToken } from '../lib/bearerToken';

/** Constant-time comparison — the token is a bearer credential. */
function isValidToken(candidate: string, secret: string): boolean {
  const expected = Buffer.from(secret, 'utf8');
  const actual = Buffer.from(candidate, 'utf8');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Requires `Authorization: Bearer <STAGING_API_TOKEN>` on every request once
 * APP_ENV=staging. Fails closed: a staging deploy with no token configured
 * returns 503 rather than serving the API unauthenticated — the same failure
 * mode as the frontend's password gate, for the same reason.
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

  const token = extractBearerToken(req);
  if (!token || !isValidToken(token, secret)) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Staging requires Authorization: Bearer <token>.',
    });
    return;
  }

  next();
}
