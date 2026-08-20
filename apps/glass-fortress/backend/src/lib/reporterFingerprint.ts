/**
 * Reporter fingerprint hashing — for public adverse-event self-reports
 * (Report.reporterFingerprintHash).
 *
 * Unlike tokenHash.ts's HMAC-SHA256 (safe only because its input is a
 * 256-bit random token), a verified email is low-entropy and enumerable —
 * the same reasoning tokenHash.ts documents for why bcrypt-style slowness
 * matters for passwords applies here. scrypt (slow, memory-hard, built into
 * Node — no new dependency) is used instead.
 *
 * The salt is a single static application secret, not a per-record random
 * salt: dedup requires the same verified email to always produce the same
 * hash, which a random salt would break. This means REPORTER_FINGERPRINT_SALT
 * sits in the same trust boundary as TOKEN_HMAC_SECRET/PII_SECRET_KEY —
 * secret to the backend, not a defense against someone who already holds it.
 *
 * REPORTER_FINGERPRINT_SALT must be set — fail-closed if missing.
 */

import crypto from 'crypto';

const KEY_LENGTH = 64;

function getSalt(): string {
  const salt = process.env['REPORTER_FINGERPRINT_SALT'];
  if (!salt) throw new Error('REPORTER_FINGERPRINT_SALT env var is not set');
  return salt;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Deterministic one-way hash of a verified reporter email, for dedup lookups. */
export function hashReporterEmail(email: string): string {
  return crypto.scryptSync(normalizeEmail(email), getSalt(), KEY_LENGTH).toString('hex');
}
