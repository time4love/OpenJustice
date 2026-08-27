import { gzipSync } from 'zlib';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  deriveText,
  inflateDocument,
  TEXT_EXTRACTION_VERSION,
} from '../src/lib/captureDocument';
import { base32, cdxDigestOf } from '../src/services/verifyAgainstCdx';

const CT = 'text/html; charset=utf-8';
const PAGE = Buffer.from('<p>חיסונים</p><a href="/report">דיווח על תופעות לוואי</a>', 'utf8');

// ---------------------------------------------------------------------------
// The fetch must take the bytes AS SERVED.
//
// axios decompresses transparently in Node, so a gzipped archived record
// arrived INFLATED and was stored under the name of the payload — a derivative
// under the name of the original, the same defect as rawText one layer lower.
// `responseType: 'arraybuffer'` looks like it settles the question; it does not.
// ---------------------------------------------------------------------------

describe('the fetch asks for the bytes as served', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'lib', 'archiveHttp.ts'), 'utf8');

  it('disables transparent decompression on the payload fetch', () => {
    // A behavioural test cannot catch this: with axios mocked, the option is
    // never exercised. The option's PRESENCE is the guarantee, so this reads it.
    expect(source).toMatch(/decompress:\s*false/);
  });

  it("asks the archive not to encode, so there is usually nothing to undo", () => {
    expect(source).toMatch(/'Accept-Encoding':\s*'identity'/);
  });

  it('DETECTS the defect returning — proven against a decoy', () => {
    // Without this, a pattern that silently stopped matching would report a
    // clean codebase forever.
    const decoy = `axios.get(url, { responseType: 'arraybuffer', maxContentLength: 5 })`;
    expect(decoy).not.toMatch(/decompress:\s*false/);
  });

  it('returns the Content-Encoding rather than discarding it', () => {
    expect(source).toMatch(/contentEncoding:/);
  });
});

// ---------------------------------------------------------------------------
// Inflate is a named, versioned step — not a library default
// ---------------------------------------------------------------------------

describe('inflateDocument', () => {
  it('undoes gzip when the source declared gzip', () => {
    expect(inflateDocument(gzipSync(PAGE), 'gzip')).toEqual(PAGE);
  });

  it.each(['GZIP', ' gzip ', 'x-gzip'])('accepts %p as gzip', (label) => {
    expect(inflateDocument(gzipSync(PAGE), label)).toEqual(PAGE);
  });

  it('leaves bytes untouched when no encoding was declared', () => {
    expect(inflateDocument(PAGE, null)).toEqual(PAGE);
  });

  it('returns the bytes unchanged rather than throwing when they will not inflate', () => {
    // A payload that does not match its declared encoding is a finding, not a
    // reason to lose the capture — the bytes as served are already stored.
    const notGzip = Buffer.from('<p>plain</p>', 'utf8');
    expect(inflateDocument(notGzip, 'gzip')).toEqual(notGzip);
  });

  it('ignores an encoding it cannot act on', () => {
    expect(inflateDocument(PAGE, 'x-nonsense-9000')).toEqual(PAGE);
  });
});

describe('deriveText runs the whole chain', () => {
  it('produces the SAME text from gzipped and plain bytes of one page', () => {
    // bytes -> inflate -> decode -> htmlToText -> normalise. The chain is what
    // the version names; a gzipped capture must not derive different text from
    // its own uncompressed twin.
    const plain = deriveText(PAGE, CT, null);
    const gzipped = deriveText(gzipSync(PAGE), CT, 'gzip');
    expect(gzipped.text).toBe(plain.text);
    expect(gzipped.textHash).toBe(plain.textHash);
  });

  it('derives GIBBERISH if the encoding is ignored — which is why it is stored', () => {
    // The failure this column prevents: reading gzipped bytes as though they
    // were text produces something that is not the page and does not announce it.
    const ignored = deriveText(gzipSync(PAGE), CT, null);
    expect(ignored.text).not.toBe(deriveText(PAGE, CT, null).text);
    expect(ignored.text).not.toContain('דיווח');
  });

  it('names the whole chain in its version, pinned to the literal', () => {
    // Pinned to the value, not to the constant — comparing the constant to
    // itself passes for any value including ''.
    expect(TEXT_EXTRACTION_VERSION).toBe('v2-inflate-decode-htmltotext-normalised');
    expect(deriveText(PAGE, CT, null).textExtractionVersion).toBe(
      'v2-inflate-decode-htmltotext-normalised',
    );
  });
});

// ---------------------------------------------------------------------------
// The external witness
// ---------------------------------------------------------------------------

describe('cdxDigestOf reproduces the Archive s digest format', () => {
  it('base32-encodes RFC 4648 without padding', () => {
    // Pinned against a known vector rather than against our own encoder.
    expect(base32(Buffer.from('foobar', 'utf8'))).toBe('MZXW6YTBOI');
  });

  it('produces a 32-character digest, the shape CDX publishes', () => {
    const d = cdxDigestOf(PAGE);
    expect(d).toHaveLength(32);
    expect(d).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('distinguishes gzipped bytes from their inflated form', () => {
    // The entire reason the check caught the defect: it hashes what is stored,
    // so storing the wrong thing shows up as a different digest.
    expect(cdxDigestOf(gzipSync(PAGE))).not.toBe(cdxDigestOf(PAGE));
  });

  it('matches a digest computed independently for a known payload', () => {
    // sha1('') = da39a3ee5e6b4b0d3255bfef95601890afd80709, base32 of those bytes.
    expect(cdxDigestOf(Buffer.alloc(0))).toBe('3I42H3S6NNFQ2MSVX7XZKYAYSCX5QBYJ');
  });
});
