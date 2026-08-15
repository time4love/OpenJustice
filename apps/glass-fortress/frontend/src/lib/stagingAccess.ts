import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Shared-secret gate for non-production deployments.
 *
 * Server-only: both the proxy and the unlock server action run on the Node
 * runtime, so `node:crypto` is available. The value never reaches the browser
 * bundle.
 */
export const STAGING_ACCESS_COOKIE = 'gf_staging_access';

/** Seven days — long enough to survive a rehearsal week, short enough to expire. */
export const STAGING_ACCESS_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * The cookie holds a hash of the shared secret, never the secret itself, so a
 * leaked cookie jar does not hand over the password someone may have reused.
 */
export function deriveAccessToken(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** Constant-time comparison — the cookie is a bearer credential. */
export function isValidAccessToken(candidate: string | undefined, secret: string): boolean {
  if (!candidate) return false;
  const expected = Buffer.from(deriveAccessToken(secret), 'utf8');
  const actual = Buffer.from(candidate, 'utf8');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** Whether the submitted password matches the configured secret. */
export function isCorrectSecret(submitted: string, secret: string): boolean {
  return isValidAccessToken(deriveAccessToken(submitted), secret);
}
