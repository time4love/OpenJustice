import { createHash } from 'node:crypto';
import { built } from './built';

// ---------------------------------------------------------------------------
// A1 :1230-:1257 — IDENTITY. The name from bytes handed over.
//
// THE NAME IS PLAIN SHA-256 WITH NOTHING PREPENDED, so the check an outsider runs is
// `sha256sum file` (§2 :229-:231). Every case below is written from A1 and never from
// what the module returns.
// ---------------------------------------------------------------------------

interface Identity {
  docId: (bytes: Uint8Array) => string;
  commitment: (docId: string, salt: Uint8Array) => string;
  contentVersionHashOf: (text: string | null, docId: string) => string;
  HASH_VECTOR: { bytes: string; docId: string };
}

const identity = () => built<Identity>('lib/documentIdentity');

const sha256 = (bytes: Uint8Array): string => '0x' + createHash('sha256').update(bytes).digest('hex');

describe('A1 — DOC_ID is the SHA-256 of the bytes, and nothing else', () => {
  it('docId = sha256(bytes), displayed as 0x + 64 lowercase hex (A1 :1232, :1244)', async () => {
    const { docId } = await identity();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(docId(bytes)).toBe(sha256(bytes));
    expect(docId(bytes)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('NO NORMALISATION OF ANY KIND — a paste with a trailing newline is a DIFFERENT document (§2 :185-:186)', async () => {
    const { docId } = await identity();
    const withOut = new TextEncoder().encode('a line');
    const withNewline = new TextEncoder().encode('a line\n');
    expect(docId(withOut)).not.toBe(docId(withNewline));
  });

  it('the file AS GIVEN: a HELD document is hashed UNSTRIPPED (A1 :1233-:1235)', async () => {
    const { docId } = await identity();
    // The stripped and unstripped forms of one file are different bytes and therefore
    // different names. SEALED hashes after the browser's strip; HELD hashes as the
    // researcher gave it. One vector, two stated subjects — never one assumed for both.
    const unstripped = new TextEncoder().encode('%PDF-1.7 meta=author\nbody');
    const stripped = new TextEncoder().encode('%PDF-1.7\nbody');
    expect(docId(unstripped)).not.toBe(docId(stripped));
  });
});

describe('A1 — COMMITMENT is the public name, and DOC_ID is gated behind the bytes', () => {
  it('commitment = sha256(bytes32(docId) ‖ salt) (A1 :1236-:1238)', async () => {
    const { commitment, docId } = await identity();
    const bytes = new Uint8Array([9, 9, 9]);
    const salt = new Uint8Array(32).fill(3);
    const raw = Buffer.concat([Buffer.from(docId(bytes).slice(2), 'hex'), Buffer.from(salt)]);
    expect(commitment(docId(bytes), salt)).toBe('0x' + createHash('sha256').update(raw).digest('hex'));
  });

  it('a FRESH salt gives one document two different commitments — the leak detector §4 :429-:438 removes', async () => {
    const { commitment, docId } = await identity();
    const name = docId(new Uint8Array([1]));
    expect(commitment(name, new Uint8Array(32).fill(1))).not.toBe(commitment(name, new Uint8Array(32).fill(2)));
  });
});

describe('A1 — contentVersionHash, and the arm where the content IS the bytes', () => {
  it('sha256(utf8(text)) over the extractor output as emitted (A1 :1242)', async () => {
    const { contentVersionHashOf } = await identity();
    const text = 'the ministry instructed that the channel stay open.';
    expect(contentVersionHashOf(text, '0x' + '0'.repeat(64))).toBe(sha256(new TextEncoder().encode(text)));
  });

  it('EQUALS DOC_ID when the content is the bytes — text null (A1 :1243, §3 :284)', async () => {
    const { contentVersionHashOf } = await identity();
    const name = '0x' + 'ab'.repeat(32);
    expect(contentVersionHashOf(null, name)).toBe(name);
  });
});

describe('A1 :1254-:1257 — two implementations of one hash, and the vector that tests them', () => {
  it('the shared vector is exported for the BROWSER half, which lands at step 30 (plan :412 as amended)', async () => {
    const { HASH_VECTOR, docId } = await identity();
    // THE FLOOR: a vector with no bytes would make the browser half agree with the
    // server half about nothing at all.
    expect(HASH_VECTOR.bytes.length).toBeGreaterThan(0);
    expect(HASH_VECTOR.docId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(docId(Buffer.from(HASH_VECTOR.bytes, 'base64'))).toBe(HASH_VECTOR.docId);
  });

  it('ONE BYTE ALTERED breaks the vector — which is what NAME_MISMATCH fires on (A1 :1256)', async () => {
    const { HASH_VECTOR, docId } = await identity();
    const bytes = Buffer.from(HASH_VECTOR.bytes, 'base64');
    const altered = Buffer.from(bytes);
    altered[0] = (altered[0] ?? 0) ^ 0xff;
    expect(docId(altered)).not.toBe(HASH_VECTOR.docId);
  });
});
