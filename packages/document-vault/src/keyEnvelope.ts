const RSA_PARAMS: RsaHashedKeyGenParams = {
  name: 'RSA-OAEP',
  modulusLength: 4096,
  publicExponent: new Uint8Array([1, 0, 1]), // 65537
  hash: 'SHA-256',
};

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_HASH = 'SHA-256';
const IV_LENGTH = 12;

/**
 * Wrap an AES document key with a recipient's RSA-OAEP public key.
 * The returned envelope can be stored alongside the encrypted document.
 * Only the holder of the corresponding private key can unwrap it.
 */
export async function wrapKey(aesKey: CryptoKey, recipientPublicKey: CryptoKey): Promise<ArrayBuffer> {
  return globalThis.crypto.subtle.wrapKey('raw', aesKey, recipientPublicKey, { name: 'RSA-OAEP' });
}

/**
 * Unwrap a key envelope using the recipient's RSA-OAEP private key.
 * Returns the AES-GCM key ready for decryption.
 */
export async function unwrapKey(envelope: ArrayBuffer, recipientPrivateKey: CryptoKey): Promise<CryptoKey> {
  return globalThis.crypto.subtle.unwrapKey(
    'raw',
    envelope,
    recipientPrivateKey,
    { name: 'RSA-OAEP' },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Generate a fresh RSA-OAEP 4096-bit key pair for an authorized viewer.
 * Public key → store in GF/BF DB (used to create per-document key envelopes).
 * Private key → protect with `protectPrivateKey` before storing in browser IndexedDB.
 */
export async function generateViewerKeyPair(): Promise<CryptoKeyPair> {
  return globalThis.crypto.subtle.generateKey(RSA_PARAMS, true, ['wrapKey', 'unwrapKey']);
}

/**
 * Encrypt a viewer's RSA private key with a passphrase-derived AES key.
 * Returns: salt (32 bytes) || IV (12 bytes) || AES-GCM(PKCS8 private key bytes).
 * Store this blob in browser IndexedDB — the passphrase is never stored.
 */
export async function protectPrivateKey(
  privateKey: CryptoKey,
  passphrase: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const wrappingKey = await deriveWrappingKey(passphrase, salt, ['wrapKey']);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const wrapped = await globalThis.crypto.subtle.wrapKey('pkcs8', privateKey, wrappingKey, {
    name: 'AES-GCM',
    iv,
  });

  const out = new Uint8Array(salt.byteLength + IV_LENGTH + wrapped.byteLength);
  out.set(new Uint8Array(salt), 0);
  out.set(iv, salt.byteLength);
  out.set(new Uint8Array(wrapped), salt.byteLength + IV_LENGTH);
  return out;
}

/**
 * Recover a viewer's RSA private key from the blob produced by `protectPrivateKey`.
 * The passphrase must match the one used to protect the key.
 */
export async function recoverPrivateKey(protected_: Uint8Array, passphrase: string): Promise<CryptoKey> {
  const salt = protected_.slice(0, 32);
  const iv = protected_.slice(32, 32 + IV_LENGTH);
  const wrapped = protected_.slice(32 + IV_LENGTH);

  const wrappingKey = await deriveWrappingKey(passphrase, salt, ['unwrapKey']);
  return globalThis.crypto.subtle.unwrapKey(
    'pkcs8',
    new Uint8Array(wrapped),
    wrappingKey,
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    RSA_PARAMS,
    true,
    ['unwrapKey'],
  );
}

/**
 * Generate a fresh 32-byte random salt for use with `protectPrivateKey`.
 */
export function generateSalt(): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function deriveWrappingKey(
  passphrase: string,
  salt: Uint8Array,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}
