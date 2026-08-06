/**
 * Dark Vault encryption utilities.
 *
 * Uses AES-256-CBC with a random IV per call so that identical plaintexts
 * produce different ciphertexts.
 *
 * PII_SECRET_KEY must be a 64-character lowercase hex string (32 bytes).
 * Generate one with:  openssl rand -hex 32
 *
 * Stored format:  <iv_hex>:<ciphertext_hex>
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_BYTES = 16;

function getKey(): Buffer {
  const hex = process.env['PII_SECRET_KEY'] ?? '';
  if (hex.length < 64) {
    throw new Error(
      'PII_SECRET_KEY must be a 64-character hex string. Generate with: openssl rand -hex 32',
    );
  }
  return Buffer.from(hex.slice(0, 64), 'hex');
}

export function encryptContact(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptContact(stored: string): string {
  const key = getKey();
  const [ivHex, encHex] = stored.split(':');
  if (!ivHex || !encHex) throw new Error('Invalid encrypted contact format');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
