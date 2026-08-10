import crypto from 'crypto';

// ---------------------------------------------------------------------------
// MCP token hashing — HMAC-SHA256 with server-side secret.
//
// Tokens are 256-bit cryptographically random values (not passwords), so
// HMAC-SHA256 with a strong secret is sufficient — bcrypt's slowness only
// helps for low-entropy inputs like passwords.
//
// Env: TOKEN_HMAC_SECRET — required, fail-closed if missing.
// ---------------------------------------------------------------------------

function getSecret(): string {
  const secret = process.env['TOKEN_HMAC_SECRET'];
  if (!secret) throw new Error('TOKEN_HMAC_SECRET env var is not set');
  return secret;
}

export function hashToken(plaintext: string): string {
  return crypto.createHmac('sha256', getSecret()).update(plaintext).digest('hex');
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Constant-time comparison of two hex-encoded token hashes. */
export function tokensEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
