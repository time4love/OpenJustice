import { encrypt, decrypt } from '../src/encrypt';

const PLAINTEXT = new TextEncoder().encode('Top secret document content — תוכן סודי ביותר');

describe('encrypt', () => {
  it('produces a ciphertext longer than the plaintext (IV + auth tag overhead)', async () => {
    const { ciphertext } = await encrypt(PLAINTEXT);
    expect(ciphertext.byteLength).toBeGreaterThan(PLAINTEXT.byteLength);
  });

  it('ciphertext differs from plaintext', async () => {
    const { ciphertext } = await encrypt(PLAINTEXT);
    const ciphertextData = ciphertext.slice(12); // skip IV prefix
    expect(ciphertextData).not.toEqual(PLAINTEXT);
  });

  it('two encryptions of the same plaintext produce different ciphertext (random IV)', async () => {
    const { ciphertext: ct1 } = await encrypt(PLAINTEXT);
    const { ciphertext: ct2 } = await encrypt(PLAINTEXT);
    expect(ct1).not.toEqual(ct2);
  });

  it('accepts ArrayBuffer input', async () => {
    const buf = PLAINTEXT.buffer.slice(0);
    const { ciphertext, aesKey } = await encrypt(buf);
    const decrypted = await decrypt(ciphertext, aesKey);
    expect(new Uint8Array(decrypted)).toEqual(PLAINTEXT);
  });
});

describe('decrypt', () => {
  it('round-trip: decrypt returns original plaintext', async () => {
    const { ciphertext, aesKey } = await encrypt(PLAINTEXT);
    const decrypted = await decrypt(ciphertext, aesKey);
    expect(new Uint8Array(decrypted)).toEqual(PLAINTEXT);
  });

  it('rejects a wrong key', async () => {
    const { ciphertext } = await encrypt(PLAINTEXT);
    const wrongKey = await globalThis.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    await expect(decrypt(ciphertext, wrongKey)).rejects.toThrow();
  });

  it('rejects truncated ciphertext', async () => {
    const { ciphertext, aesKey } = await encrypt(PLAINTEXT);
    const truncated = ciphertext.slice(0, 10); // only partial IV — no real data
    await expect(decrypt(truncated, aesKey)).rejects.toThrow();
  });
});
