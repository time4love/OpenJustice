import {
  CAPTURE_EXTRACTOR_READABILITY,
  HASHED_PREFIX_CHARS,
  captureHashPayload,
  evidenceHashFromCapture,
  verifyEvidenceCapture,
} from '../src/lib/evidenceCapture';

const URL_A = 'https://example.gov/article';
const URL_B = 'https://mirror.example.org/article';

describe('evidence identity from a stored capture', () => {
  it('is deterministic for the same url and text', () => {
    expect(evidenceHashFromCapture(URL_A, 'hello')).toBe(evidenceHashFromCapture(URL_A, 'hello'));
  });

  it('treats the same text at two addresses as two pieces of evidence', () => {
    // Deliberate: a paragraph republished elsewhere is separately citable to
    // where it was found. Collapsing them would make provenance unrecoverable.
    expect(evidenceHashFromCapture(URL_A, 'hello')).not.toBe(evidenceHashFromCapture(URL_B, 'hello'));
  });

  it('covers only the first HASHED_PREFIX_CHARS characters', () => {
    const base = 'x'.repeat(HASHED_PREFIX_CHARS);
    expect(evidenceHashFromCapture(URL_A, base)).toBe(evidenceHashFromCapture(URL_A, `${base}ignored`));
    // ...and everything inside the bound still counts.
    expect(evidenceHashFromCapture(URL_A, base)).not.toBe(
      evidenceHashFromCapture(URL_A, `${'y'}${base.slice(1)}`),
    );
  });

  it('hashes the url and text separated, so a boundary shift changes the identity', () => {
    // Without the separator, ('ab', 'c') and ('a', 'bc') would collide.
    expect(captureHashPayload('ab', 'c').toString('utf8')).toBe('ab\n\nc');
    expect(evidenceHashFromCapture('ab', 'c')).not.toBe(evidenceHashFromCapture('a', 'bc'));
  });
});

describe('verifyEvidenceCapture — "cannot check" is not "does not match"', () => {
  const text = 'the captured article text';
  const fileHash = evidenceHashFromCapture(URL_A, text);

  it('confirms a record its stored capture reproduces', () => {
    const v = verifyEvidenceCapture({ fileHash, sourceUrl: URL_A }, { sourceUrl: URL_A, text });
    expect(v).toMatchObject({ matches: true, notChecked: false, expectedFileHash: fileHash });
  });

  it('reports a record with NO capture as unchecked, never as matching-by-default', () => {
    // The distinction is the whole point. A legacy record must not read as
    // verified, and must not read as tampered with either.
    const v = verifyEvidenceCapture({ fileHash, sourceUrl: URL_A }, null);
    expect(v.notChecked).toBe(true);
    expect(v.expectedFileHash).toBeNull();
    expect(v.reason).toContain('cannot be recomputed');
  });

  it('flags a capture that does not reproduce the recorded hash', () => {
    const v = verifyEvidenceCapture({ fileHash, sourceUrl: URL_A }, { sourceUrl: URL_A, text: `${text} tampered` });
    expect(v).toMatchObject({ matches: false, notChecked: false });
    expect(v.expectedFileHash).not.toBe(fileHash);
    expect(v.reason).toContain('do not anchor');
  });

  it('flags a capture taken from a different url, even with identical text', () => {
    const v = verifyEvidenceCapture({ fileHash, sourceUrl: URL_A }, { sourceUrl: URL_B, text });
    expect(v.matches).toBe(false);
  });

  it('names an extractor, so an old hash stays explainable after the extractor changes', () => {
    expect(CAPTURE_EXTRACTOR_READABILITY).toBe('readability-article-v1');
  });
});
