import { readFileSync } from 'fs';
import { join } from 'path';
import { gzipSync, deflateSync, brotliCompressSync } from 'zlib';
import {
  DECODABLE_CAPTURE_SELECT,
  captureHtml,
  deriveText,
} from '../src/lib/captureDocument';
import { stripComments } from './detectionVersionPinned.test';

// ---------------------------------------------------------------------------
// READING A STORED PAYLOAD AS HTML IS ONE OPERATION, NOT TWO.
//
// `inflate -> decode`, and the first step is easy to forget because a payload
// that was never compressed reads perfectly without it. Every test written
// against an uncompressed fixture passes either way — which is exactly how
// `measureHrefChanges` came to call `decodeDocument` alone, read gzip bytes as
// text, and report ZERO hrefs for every capture whose origin served gzip.
//
// It did not crash. It produced a MEASUREMENT: 7 of the MOH page's 103 captures
// appeared to lose ~50 links each and get them back, read as 12 changes
// "invisible to the derived text", including the adverse-event reporting channel
// appearing and vanishing 13 times. The page never changed.
//
// So every case here uses a COMPRESSED fixture. An uncompressed one cannot fail.
// ---------------------------------------------------------------------------

const HTML = '<html lang="he"><body><a href="/report/">לדיווח על תופעות לוואי</a></body></html>';

/** Every module allowed to spell the two-step decode itself. */
const DECODE_OWNER = ['src', 'lib', 'captureDocument.ts'];

/** Modules that read a stored payload. None may decode it their own way. */
const PAYLOAD_READERS = [
  ['src', 'services', 'measureHrefChanges.ts'],
  ['src', 'services', 'WaybackScraper.ts'],
  ['src', 'services', 'recoverMissingCaptures.ts'],
];

function sourceOf(parts: string[]): string {
  return readFileSync(join(__dirname, '..', ...parts), 'utf8');
}

describe('captureHtml is the only way to read a stored payload', () => {
  it.each([
    ['gzip', gzipSync(Buffer.from(HTML, 'utf8'))],
    ['deflate', deflateSync(Buffer.from(HTML, 'utf8'))],
    ['br', brotliCompressSync(Buffer.from(HTML, 'utf8'))],
  ])('inflates %s before decoding', (encoding, bytes) => {
    expect(
      captureHtml({
        document: bytes,
        documentContentType: 'text/html; charset=utf-8',
        documentContentEncoding: encoding,
      }),
    ).toBe(HTML);
  });

  it('DETECTS the defect — decoding without inflating loses everything', () => {
    // The case that makes the three above load-bearing. Without it they would
    // still pass against an implementation that ignored the encoding entirely,
    // because an uncompressed payload decodes correctly either way.
    const gzipped = gzipSync(Buffer.from(HTML, 'utf8'));
    const undecoded = new TextDecoder('utf-8').decode(gzipped);
    expect(undecoded).not.toContain('href');
    expect(undecoded).not.toContain('תופעות לוואי');
  });

  it('passes an uncompressed payload through untouched', () => {
    expect(
      captureHtml({
        document: Buffer.from(HTML, 'utf8'),
        documentContentType: 'text/html; charset=utf-8',
        documentContentEncoding: 'identity',
      }),
    ).toBe(HTML);
  });

  it('a null encoding is not an excuse to guess', () => {
    // Null means "we never observed the headers", which is not "there was none".
    // Passing the bytes through is right: they are stored and re-readable forever.
    const plain = Buffer.from(HTML, 'utf8');
    expect(
      captureHtml({
        document: plain,
        documentContentType: null,
        documentContentEncoding: null,
      }),
    ).toBe(HTML);
  });

  it('deriveText reaches the same text through the same path', () => {
    // The two consumers of a payload must not drift: `text` was correct
    // throughout the incident precisely because `deriveText` inflated, and the
    // href instrument was wrong because it did not.
    const gzipped = gzipSync(Buffer.from(HTML, 'utf8'));
    const fromBytes = deriveText(gzipped, 'text/html; charset=utf-8', 'gzip');
    expect(fromBytes.text).toContain('לדיווח על תופעות לוואי');
  });

  it('the select carries the encoding column — the bug was a missing COLUMN too', () => {
    // `measureHrefChanges` listed its payload columns by hand and omitted
    // `documentContentEncoding`. No type complained, because the omission only
    // showed up as a wrong answer.
    expect(Object.keys(DECODABLE_CAPTURE_SELECT).sort()).toEqual([
      'document',
      'documentContentEncoding',
      'documentContentType',
    ]);
  });

  it('no payload reader spells the two-step decode itself', () => {
    for (const parts of PAYLOAD_READERS) {
      const code = stripComments(sourceOf(parts));
      expect(code).not.toMatch(/\bdecodeDocument\s*\(/);
      expect(code).not.toMatch(/\binflateDocument\s*\(/);
    }
  });

  it('DETECTS a re-inlined decode — proven against a decoy', () => {
    // Without this the guard could stop matching anything and report a clean
    // codebase forever, which this repository has shipped before.
    const decoy = stripComments(`const html = decodeDocument(inflateDocument(b, e), t);`);
    expect(decoy).toMatch(/\bdecodeDocument\s*\(/);
    expect(decoy).toMatch(/\binflateDocument\s*\(/);
  });

  it('the owner module still spells it, so the guard is scoped not universal', () => {
    // A guard that forbade the call everywhere would forbid its definition.
    expect(stripComments(sourceOf(DECODE_OWNER))).toMatch(/\binflateDocument\s*\(/);
  });
});
