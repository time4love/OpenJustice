import { encryptContact, decryptContact } from '../src/lib/encrypt';

// ---------------------------------------------------------------------------
// Tests for the Dark Vault encryption utilities
// ---------------------------------------------------------------------------

const TEST_KEY = 'a'.repeat(64); // 32-byte key as 64 hex chars

beforeEach(() => {
  process.env['PII_SECRET_KEY'] = TEST_KEY;
});

afterEach(() => {
  delete process.env['PII_SECRET_KEY'];
});

describe('encryptContact()', () => {
  it('returns a string in iv:ciphertext hex format', () => {
    const result = encryptContact('test@example.com');
    expect(result).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/);
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const a = encryptContact('same input');
    const b = encryptContact('same input');
    expect(a).not.toBe(b);
  });

  it('round-trips correctly through decryptContact', () => {
    const plaintext = 'whistleblower@protonmail.com';
    expect(decryptContact(encryptContact(plaintext))).toBe(plaintext);
  });

  it('round-trips a phone number', () => {
    const phone = '+972-50-123-4567';
    expect(decryptContact(encryptContact(phone))).toBe(phone);
  });

  it('throws when PII_SECRET_KEY is missing', () => {
    delete process.env['PII_SECRET_KEY'];
    expect(() => encryptContact('test')).toThrow('PII_SECRET_KEY');
  });

  it('throws when PII_SECRET_KEY is too short', () => {
    process.env['PII_SECRET_KEY'] = 'tooshort';
    expect(() => encryptContact('test')).toThrow('PII_SECRET_KEY');
  });
});

describe('decryptContact()', () => {
  it('throws on malformed stored string', () => {
    expect(() => decryptContact('notvalid')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ContactBodySchema validation (unit test without spinning up the server)
// ---------------------------------------------------------------------------

import { z } from 'zod';

const ContactBodySchema = z.object({
  fileHash: z.string().min(1, 'fileHash is required'),
  contactInfo: z.string().min(1, 'contactInfo must not be empty'),
  consentGiven: z.literal(true, { error: 'Consent is required to save contact information.' }),
});

describe('ContactBodySchema', () => {
  it('accepts a valid payload', () => {
    const result = ContactBodySchema.safeParse({
      fileHash: '0xabc',
      contactInfo: 'test@example.com',
      consentGiven: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when consentGiven is false', () => {
    const result = ContactBodySchema.safeParse({
      fileHash: '0xabc',
      contactInfo: 'test@example.com',
      consentGiven: false,
    });
    expect(result.success).toBe(false);
    const errors = result.error!.flatten().fieldErrors;
    expect(errors['consentGiven']).toBeDefined();
  });

  it('rejects when consentGiven is missing', () => {
    const result = ContactBodySchema.safeParse({
      fileHash: '0xabc',
      contactInfo: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty contactInfo', () => {
    const result = ContactBodySchema.safeParse({
      fileHash: '0xabc',
      contactInfo: '',
      consentGiven: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing fileHash', () => {
    const result = ContactBodySchema.safeParse({
      contactInfo: 'test@example.com',
      consentGiven: true,
    });
    expect(result.success).toBe(false);
  });
});
