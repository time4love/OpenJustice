import {
  wrapKey,
  unwrapKey,
  generateViewerKeyPair,
  protectPrivateKey,
  recoverPrivateKey,
  generateSalt,
} from '../src/keyEnvelope';
import { encrypt } from '../src/encrypt';

const PASSPHRASE = 'correct-horse-battery-staple-אמת';

// RSA-4096 key generation is slow — share one pair across tests in this suite.
let viewerKeyPair: CryptoKeyPair;

beforeAll(async () => {
  viewerKeyPair = await generateViewerKeyPair();
}, 30_000);

describe('wrapKey / unwrapKey', () => {
  it('round-trip: wrapping then unwrapping recovers the original AES key', async () => {
    const { aesKey } = await encrypt(new Uint8Array([1, 2, 3]));
    const envelope = await wrapKey(aesKey, viewerKeyPair.publicKey);
    const recovered = await unwrapKey(envelope, viewerKeyPair.privateKey);

    // Verify the recovered key actually decrypts data encrypted with the original
    const { ciphertext } = await encrypt(new Uint8Array([42, 43, 44]));
    // Both keys should be functionally equivalent — test via a known-plaintext encrypt/decrypt
    const plaintext = new Uint8Array([0xca, 0xfe]);
    const { ciphertext: ct, aesKey: originalKey } = await encrypt(plaintext);
    const envelope2 = await wrapKey(originalKey, viewerKeyPair.publicKey);
    const recoveredKey = await unwrapKey(envelope2, viewerKeyPair.privateKey);

    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ct.slice(0, 12) },
      recoveredKey,
      ct.slice(12),
    );
    expect(new Uint8Array(decrypted)).toEqual(plaintext);
  });

  it('unwrapping with a wrong private key throws', async () => {
    const { aesKey } = await encrypt(new Uint8Array([1, 2, 3]));
    const envelope = await wrapKey(aesKey, viewerKeyPair.publicKey);

    const wrongPair = await generateViewerKeyPair();
    await expect(unwrapKey(envelope, wrongPair.privateKey)).rejects.toThrow();
  }, 30_000);
});

describe('protectPrivateKey / recoverPrivateKey', () => {
  it('round-trip: protect then recover returns a working private key', async () => {
    const salt = generateSalt();
    const protected_ = await protectPrivateKey(viewerKeyPair.privateKey, PASSPHRASE, salt);

    const recovered = await recoverPrivateKey(protected_, PASSPHRASE);

    // Verify the recovered key works: wrap an AES key with the original public key,
    // then unwrap with the recovered private key.
    const { aesKey } = await encrypt(new Uint8Array([5, 6, 7]));
    const envelope = await wrapKey(aesKey, viewerKeyPair.publicKey);
    const recoveredAes = await unwrapKey(envelope, recovered);

    const plaintext = new Uint8Array([0xab, 0xcd]);
    const { ciphertext, aesKey: originalKey } = await encrypt(plaintext);
    const env2 = await wrapKey(originalKey, viewerKeyPair.publicKey);
    const aesFromRecoveredKey = await unwrapKey(env2, recovered);

    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ciphertext.slice(0, 12) },
      aesFromRecoveredKey,
      ciphertext.slice(12),
    );
    expect(new Uint8Array(decrypted)).toEqual(plaintext);

    void recoveredAes; // used above
  });

  it('same passphrase+salt consistently recovers the key (deterministic wrapping)', async () => {
    const salt = generateSalt();
    const protected_ = await protectPrivateKey(viewerKeyPair.privateKey, PASSPHRASE, salt);

    // Two independent recoveries from the same blob + passphrase should both work
    const key1 = await recoverPrivateKey(protected_, PASSPHRASE);
    const key2 = await recoverPrivateKey(protected_, PASSPHRASE);

    // Both should unwrap the same envelope successfully
    const { aesKey } = await encrypt(new Uint8Array([1]));
    const envelope = await wrapKey(aesKey, viewerKeyPair.publicKey);

    const aes1 = await unwrapKey(envelope, key1);
    const aes2 = await unwrapKey(envelope, key2);

    // Both decryptions should produce the same result
    const plaintext = new Uint8Array([0xff]);
    const { ciphertext, aesKey: k } = await encrypt(plaintext);
    const env = await wrapKey(k, viewerKeyPair.publicKey);

    const d1 = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ciphertext.slice(0, 12) },
      await unwrapKey(env, key1),
      ciphertext.slice(12),
    );
    const d2 = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ciphertext.slice(0, 12) },
      await unwrapKey(env, key2),
      ciphertext.slice(12),
    );

    expect(new Uint8Array(d1)).toEqual(plaintext);
    expect(new Uint8Array(d2)).toEqual(plaintext);

    void aes1; void aes2;
  });

  it('wrong passphrase fails to recover the private key', async () => {
    const salt = generateSalt();
    const protected_ = await protectPrivateKey(viewerKeyPair.privateKey, PASSPHRASE, salt);
    await expect(recoverPrivateKey(protected_, 'wrong-passphrase')).rejects.toThrow();
  });
});
