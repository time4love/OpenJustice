// Client-side document vault utilities.
//
// stripMetadata is re-exported from the shared @openjustice/document-vault
// workspace package (kept in sync with Bronze Fortress there). encryptFile
// and uint8ToBase64 stay local: GF's encrypt result exports the AES key as a
// JWK (`aesKeyJwk`) rather than the package's raw CryptoKey, because GF sends
// the key to the server for ephemeral (RAM-only, never-persisted) analysis —
// a GF-specific flow the shared package doesn't need to know about.
export { stripMetadata, type StripResult } from '@openjustice/document-vault';

const IV_LENGTH = 12;

// ─── Encryption ───────────────────────────────────────────────────────────────

export interface EncryptResult {
  /** IV (12 bytes) prepended to AES-GCM-256 ciphertext */
  ciphertext: Uint8Array;
  /** Exportable JWK of the AES key — pass to the server for ephemeral analysis only */
  aesKeyJwk: JsonWebKey;
}

export async function encryptFile(file: File): Promise<EncryptResult> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = await file.arrayBuffer();
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  const combined = new Uint8Array(IV_LENGTH + cipherBuffer.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipherBuffer), IV_LENGTH);

  const aesKeyJwk = await crypto.subtle.exportKey('jwk', key);
  return { ciphertext: combined, aesKeyJwk };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}
