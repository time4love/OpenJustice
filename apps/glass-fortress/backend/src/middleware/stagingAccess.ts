// ---------------------------------------------------------------------------
// Staging API access gate
//
// The frontend password gate covers pages only — Next.js proxy necessarily
// excludes /api/* from its own routing, so the staging backend's public
// Railway URL was reachable by anyone who had it, gate or no gate. This closes
// that gap with a static bearer token.
//
// IT USED TO FAIL OPEN, and that is what this file is now shaped around. The
// gate applied only when `APP_ENV=staging`; `APP_ENV` unset means production;
// so losing one variable on the staging deployment would have removed the gate
// silently, leaving the public Railway URL open — the exact hole the middleware
// exists to close. ABSENCE IS SAFE FOR A LABEL AND UNSAFE FOR A GATE, and one
// variable was doing both jobs.
//
// TWO VOICES NOW, and the gate applies unless BOTH say production. The database
// is the one that cannot go missing: without DATABASE_URL nothing runs at all,
// so a staging deployment that lost its label is still holding staging's
// project ref and is still gated.
//
// AND ONLY IN THAT DIRECTION. An unrecognised project ref does NOT gate — it is
// not evidence of anything, and failing closed on it would take the production
// API down over a renamed Supabase project. The dangerous direction is
// "staging, unlabelled"; the harmless one is "production, unrecognised", and
// they are deliberately not treated alike.
//
// `assertEnvironmentIdentity` refuses to BOOT on the same disagreement, which
// is where a misconfiguration should be caught. This is the net under it: a
// gate that is correct only because a check elsewhere passed is a gate that
// stops being correct the moment that check moves.
// ---------------------------------------------------------------------------

import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { getAppEnv } from '../lib/appEnv';
import { identifyEnvironment } from '../lib/dbEnvironment';

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

/** Ungated only when the label AND the database both say production. */
export function isUngatedProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return getAppEnv(env) === 'production' && identifyEnvironment(env).appEnv !== 'staging';
}

/**
 * Requires an `X-Staging-Token: <STAGING_API_TOKEN>` header on every request to
 * anything that is not cross-checked production. Fails closed: a staging deploy
 * with no token configured returns 503 rather than serving the API
 * unauthenticated — the same failure mode as the frontend's password gate, for
 * the same reason.
 */
export function requireStagingAccess(req: Request, res: Response, next: NextFunction): void {
  if (isUngatedProduction()) {
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
