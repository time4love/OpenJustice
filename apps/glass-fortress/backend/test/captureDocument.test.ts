import { createHash } from 'crypto';
import {
  charsetFromContentType,
  decodeDocument,
  deriveText,
  sha256Bytes,
  sha256Text,
  TEXT_EXTRACTION_VERSION,
} from '../src/lib/captureDocument';

const html = (s: string) => Buffer.from(s, 'utf8');
const UTF8 = 'text/html; charset=utf-8';

describe('charsetFromContentType', () => {
  it.each([
    ['text/html; charset=utf-8', 'utf-8'],
    ['text/html;charset=UTF-8', 'utf-8'],
    ['text/html; charset="windows-1255"', 'windows-1255'],
    ['text/html', null],
    [null, null],
    [undefined, null],
  ])('reads %p as %p', (header, expected) => {
    expect(charsetFromContentType(header)).toBe(expected);
  });
});

describe('decodeDocument', () => {
  it('decodes Hebrew UTF-8 exactly', () => {
    const hebrew = 'אין סיכוי לחלות בקורונה בגלל החיסון';
    expect(decodeDocument(Buffer.from(hebrew, 'utf8'), UTF8)).toBe(hebrew);
  });

  it('defaults to UTF-8 when the payload declares no charset', () => {
    const hebrew = 'דיווח על תופעת לוואי';
    expect(decodeDocument(Buffer.from(hebrew, 'utf8'), 'text/html')).toBe(hebrew);
  });

  it('falls back rather than throwing on a charset label it cannot resolve', () => {
    // Falling back is right: the BYTES are stored, so they can be re-decoded
    // forever once the label is understood. Throwing would lose the capture over
    // a header.
    const out = decodeDocument(html('<p>hello</p>'), 'text/html; charset=x-nonsense-9000');
    expect(out).toBe('<p>hello</p>');
  });
});

describe('deriveText', () => {
  it('stamps a version that actually identifies the derivation', () => {
    // PINNED TO ITS VALUE, not to the constant. Asserting
    // `textExtractionVersion === TEXT_EXTRACTION_VERSION` compares the constant
    // to itself and passes for ANY value including '' — a tautology, and the
    // same shape as the hash-shape assertions mutation testing already caught
    // here once. Blanking the constant survived that assertion; it does not
    // survive this one.
    expect(TEXT_EXTRACTION_VERSION).toBe('v2-inflate-decode-htmltotext-normalised');
    expect(TEXT_EXTRACTION_VERSION.length).toBeGreaterThan(0);
    expect(deriveText(html('<p>x</p>'), UTF8).textExtractionVersion).toBe(
      'v2-inflate-decode-htmltotext-normalised',
    );
  });

  it('hashes the text it returns, not the bytes it was given', () => {
    const d = deriveText(html('<p>the article</p>'), UTF8);
    expect(d.textHash).toBe(sha256Text(d.text));
    expect(d.textHash).not.toBe(sha256Bytes(html('<p>the article</p>')));
  });

  it('DISCARDS hrefs while keeping anchor text — the loss the payload column exists to cover', () => {
    // Not a defect in this function; it is what a text view is. The point is
    // that it must never be the only thing stored, because this platform's
    // central finding is that a REPORTING-CHANNEL LINK was removed and two
    // different links reading the same are identical here.
    const a = deriveText(html('<a href="/report-adverse-event">דיווח</a>'), UTF8);
    const b = deriveText(html('<a href="/removed">דיווח</a>'), UTF8);

    expect(a.text).toBe(b.text);
    expect(a.textHash).toBe(b.textHash);
    expect(sha256Bytes(html('<a href="/report-adverse-event">דיווח</a>'))).not.toBe(
      sha256Bytes(html('<a href="/removed">דיווח</a>')),
    );
  });

  it('drops script bodies so a phrase in source cannot look like page text', () => {
    const d = deriveText(html('<p>visible</p><script>var hidden = "invisible";</script>'), UTF8);
    expect(d.text).toContain('visible');
    expect(d.text).not.toContain('invisible');
  });

  it('is stable across a decode round trip, so the same payload always derives the same text', () => {
    const bytes = html('<p>שלום</p>');
    expect(deriveText(bytes, UTF8).textHash).toBe(deriveText(Buffer.from(bytes), UTF8).textHash);
  });
});

describe('the two hashes are over different things', () => {
  it('sha256Bytes hashes bytes and sha256Text hashes UTF-8 of a string', () => {
    const s = 'שלום';
    expect(sha256Text(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    expect(sha256Bytes(Buffer.from(s, 'utf8'))).toBe(sha256Text(s));
  });

  it('a payload and its derived text hash differently', () => {
    const bytes = html('<p>the article</p>');
    expect(sha256Bytes(bytes)).not.toBe(deriveText(bytes, UTF8).textHash);
  });
});
