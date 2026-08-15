export type EncryptInput = File | Uint8Array | ArrayBuffer;

export interface EncryptResult {
  /** IV (12 bytes) prepended to AES-GCM ciphertext */
  ciphertext: Uint8Array;
  aesKey: CryptoKey;
}

const IV_LENGTH = 12; // 96-bit IV for AES-GCM

// Always returns Uint8Array<ArrayBuffer> — required by SubtleCrypto's BufferSource.
async function toUint8Array(input: EncryptInput): Promise<Uint8Array<ArrayBuffer>> {
  if (input instanceof Uint8Array) return new Uint8Array(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}

export async function encrypt(file: EncryptInput): Promise<EncryptResult> {
  const plaintext = await toUint8Array(file);

  const aesKey = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );

  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext);

  const ciphertext = new Uint8Array(IV_LENGTH + encrypted.byteLength);
  ciphertext.set(iv, 0);
  ciphertext.set(new Uint8Array(encrypted), IV_LENGTH);

  return { ciphertext, aesKey };
}

export async function decrypt(ciphertext: Uint8Array, aesKey: CryptoKey): Promise<ArrayBuffer> {
  const iv = new Uint8Array(ciphertext.slice(0, IV_LENGTH));
  const data = new Uint8Array(ciphertext.slice(IV_LENGTH));
  return globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
}
