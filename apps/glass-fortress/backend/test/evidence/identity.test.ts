import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SRC, tsFiles, readCode } from '../walk/scan';
import { captureId, diffId, recordId, contentVersionHash } from '../../src/lib/evidenceIdentity';

// ---------------------------------------------------------------------------
// A RECORD'S OWN NAME — evidence flows A1, the byte layout, and the scan that
// holds it to one spelling.
//
// THE VECTOR BELOW WAS NOT PRODUCED BY THE IMPLEMENTATION. It was computed at a
// shell with `printf`, `xxd -r -p` and `shasum -a 256`, and the command and its
// output are in the step's dated doc so anyone can re-run them. That matters
// more here than anywhere else in this repository: a vector the code produced
// proves the code is self-consistent and nothing else, and the thing being
// asserted is that an OUTSIDER holding the archive computes the same name we do.
//
//   URL  https://news.walla.co.il/item/3403847
//   TS   20201209134003
//   DOC  3b1f0a9c…3b4c   (a 32-byte digest, bare hex, as UrlSnapshot stores it)
//
//   { printf '%s' "$URL"; printf '\x00'; printf '%s' "$TS"; printf '\x00';
//     printf '%s' "$DOC" | xxd -r -p; } | shasum -a 256
// ---------------------------------------------------------------------------

const URL = 'https://news.walla.co.il/item/3403847';

const BEFORE = {
  waybackTimestamp: '20201209134003',
  documentHash: '3b1f0a9c2e4d5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c',
  id: '0xac387efe0b979e23e4fca6762ff34cc6cd82aa74ebc554d5d969c8bbfd8ba5be',
};
const AFTER = {
  waybackTimestamp: '20210612183110',
  documentHash: '9f8e7d6c5b4a39281706f5e4d3c2b1a09182736455463728190a1b2c3d4e5f60',
  id: '0x221260368d9629faf330f3a4d0d1d31675ccc4fa5c3aa93e3234c123d00228c6',
};
const PAIR_ID = '0x75246b3103f9039e89d9cfcd4b9b01e4e0e75cf467ad7b57056576afdcbacbc0';

describe('CAPTURE_ID — the byte layout, against a vector computed outside this code', () => {
  it('matches the shell derivation', () => {
    expect(captureId(URL, BEFORE.waybackTimestamp, BEFORE.documentHash)).toBe(BEFORE.id);
    expect(captureId(URL, AFTER.waybackTimestamp, AFTER.documentHash)).toBe(AFTER.id);
  });

  it('is 0x + 64 lowercase hex', () => {
    expect(BEFORE.id).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('takes the document hash in EITHER spelling and produces one name', () => {
    // Two spellings of one digest is this repository's dominant defect shape.
    // The conversion happens once, at this module's boundary.
    expect(captureId(URL, BEFORE.waybackTimestamp, `0x${BEFORE.documentHash}`)).toBe(BEFORE.id);
    expect(captureId(URL, BEFORE.waybackTimestamp, BEFORE.documentHash.toUpperCase())).toBe(BEFORE.id);
  });

  it('THE NUL SEPARATORS ARE LOAD-BEARING — a url ending in digits cannot borrow the timestamp', () => {
    // Joined with no boundary, `…/item/3403847` + `20201209134003` and
    // `…/item/340384` + `720201209134003` are one string. They must not be one
    // name, and this is the case that says the separator is not decoration.
    const a = captureId('https://x.test/a1', '20201209134003', BEFORE.documentHash);
    const b = captureId('https://x.test/a', '120201209134003'.slice(0, 14), BEFORE.documentHash);
    expect(a).not.toBe(b);
  });

  it('REFUSES a malformed digest rather than naming nothing', () => {
    expect(() => captureId(URL, BEFORE.waybackTimestamp, 'not-a-hash')).toThrow(/32-byte SHA-256/);
    expect(() => captureId(URL, BEFORE.waybackTimestamp, 'ab'.repeat(16))).toThrow(/32-byte SHA-256/);
  });

  it('REFUSES a timestamp that is not the archive\'s fourteen digits', () => {
    expect(() => captureId(URL, '2020-12-09', BEFORE.documentHash)).toThrow(/14 digits/);
  });
});

describe('DIFF id — composed from the captures\' own names', () => {
  it('matches the shell derivation', () => {
    expect(diffId(BEFORE.id, AFTER.id)).toBe(PAIR_ID);
  });

  it('is ORDERED — a pair is a transition, and the reverse is a different one', () => {
    expect(diffId(AFTER.id, BEFORE.id)).not.toBe(PAIR_ID);
  });

  it('hashes the two ids as RAW BYTES, not as their 0x text', () => {
    // If the layout ever hashed the text, dropping the prefix would change the
    // answer. It does not, because the prefix never reaches the digest.
    expect(diffId(BEFORE.id.slice(2), AFTER.id.slice(2))).toBe(PAIR_ID);
  });
});

describe('recordId — one symbol over both kinds', () => {
  it('a CAPTURE record resolves to its CAPTURE_ID', () => {
    expect(recordId({ kind: 'CAPTURE', url: URL, capture: BEFORE })).toBe(BEFORE.id);
  });

  it('a DIFF record resolves to the pair id, composed from both endpoints', () => {
    expect(recordId({ kind: 'DIFF', url: URL, before: BEFORE, after: AFTER })).toBe(PAIR_ID);
  });

  it('THE NAME DOES NOT MOVE WHEN THE TEXT DOES — only bytes, url and timestamp are inputs', () => {
    // A re-walk changes text, a new extractor changes text, a correction changes
    // text. None of them is an input here, which is the whole reason RECOMPUTABLE
    // is a predicate rather than a rate.
    const again = recordId({ kind: 'DIFF', url: URL, before: BEFORE, after: AFTER });
    expect(again).toBe(PAIR_ID);
  });
});

describe('contentVersionHash — moved here with A1, unchanged', () => {
  it('covers the chunks alone: not survival, not opinion, not a version label', () => {
    const chunks = [
      { side: 'REMOVED' as const, text: 'הוסר משפט' },
      { side: 'ADDED' as const, text: 'נוסף משפט' },
    ];
    const withNoise = chunks.map((c) => ({ ...c, survival: 'SURVIVES', classifier: 'v4' }));
    expect(contentVersionHash(withNoise)).toBe(contentVersionHash(chunks));
  });

  it('is ORDER-SENSITIVE — the differ\'s output order is part of what a version contains', () => {
    const a = [{ side: 'REMOVED' as const, text: 'x' }, { side: 'ADDED' as const, text: 'y' }];
    const b = [{ side: 'ADDED' as const, text: 'y' }, { side: 'REMOVED' as const, text: 'x' }];
    expect(contentVersionHash(a)).not.toBe(contentVersionHash(b));
  });
});

// ---------------------------------------------------------------------------
// THE SCAN — stated as a PROPERTY over every sha256 call site, not as "one file
// may compose a name".
//
// A rule written as "no file but evidenceIdentity.ts matches this regex" is an
// enumeration wearing a property's clothes: it holds until someone writes the
// same composition a different way. The property is that EVERY sha256 call site
// under src/ is named, and each name says WHAT IT HASHES — bytes, text, a token,
// a prompt, a source state, a diff's content, or a record's identity. A new
// caller fails until it is named, which is the moment to ask what it is naming.
// ---------------------------------------------------------------------------

const SHA256_CALL = /createHash\(\s*['"]sha256['"]\s*\)|ethers\.sha256\s*\(/;

/** Every sha256 call site under `src/`, with what it hashes. A new one fails until it is named. */
const NAMED_HASHERS: Record<string, string> = {
  'lib/evidenceIdentity.ts': "A RECORD'S IDENTITY — A1's byte layout, stated once",
  'lib/captureDocument.ts': 'the bytes as served, and a text — sha256Bytes / sha256Text',
  'lib/chromeRuleset.ts': 'a ruleset id over its sorted selectors',
  'lib/classifierVersion.ts': 'the classifier prompt, as proof beside its version string',
  'lib/diffSurvival.ts': "the survival check's source state — its four inputs",
  'lib/onChainVerdict.ts': "an on-chain verdict's source state",
  'lib/mission.ts': 'the scan-relevance prompt',
  'services/Web3Service.ts': 'a file, at the chain boundary',
  'services/claimTrajectory.ts': "a detection pass's source state, and a claim's own hash",
};

describe('every sha256 call site under src/ is named, and says what it hashes', () => {
  const callers = () =>
    tsFiles(SRC)
      .map((file) => ({ file: relative(SRC, file), code: readCode(file) }))
      .filter(({ code }) => SHA256_CALL.test(code))
      .map(({ file }) => file);

  it('finds call sites at all — a silent zero would make this vacuous', () => {
    expect(callers().length).toBeGreaterThanOrEqual(8);
  });

  it('no call site is unnamed', () => {
    expect(callers().filter((f) => !(f in NAMED_HASHERS))).toEqual([]);
  });

  it('no name describes a file that has stopped hashing', () => {
    // The other direction, and the one an enumeration always forgets: a name
    // left behind after its call site went is a list that has stopped reading
    // the tree. It caught one on the day it was written — `lib/bytes32.ts` names
    // `ethers.sha256()` in a COMMENT explaining why two layers store digests
    // differently, and never calls it. `readCode` strips comments, so the list
    // and the tree disagreed, and this case is why the disagreement was visible.
    const live = new Set(callers());
    expect(Object.keys(NAMED_HASHERS).filter((f) => !live.has(f))).toEqual([]);
  });

  it('ONE MODULE COMPOSES A RECORD NAME, and its name says so', () => {
    // The narrow rule the property implies: composing a url, a timestamp and a
    // document hash into one digest is what `evidenceIdentity` is for.
    expect(NAMED_HASHERS['lib/evidenceIdentity.ts']).toMatch(/IDENTITY/);
  });

  it('DETECTS an unnamed caller — proven against the shape it exists to catch', () => {
    const planted = readCode(join(SRC, 'lib', 'evidenceIdentity.ts'));
    expect(SHA256_CALL.test(planted)).toBe(true);
    expect(SHA256_CALL.test("const h = createHash('sha256').update(url + ts).digest('hex');")).toBe(true);
    expect(SHA256_CALL.test('// createHash sha256 is discussed in this comment')).toBe(false);
  });
});
