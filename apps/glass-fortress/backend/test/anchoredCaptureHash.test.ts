import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ANCHORABLE_CAPTURE_SELECT,
  anchoredCaptureHash,
  attestationOf,
  capturesAnchoredBy,
  storedAnchorHash,
} from '../src/lib/anchoredCaptureHash';
import { stripComments } from './detectionVersionPinned.test';

// ---------------------------------------------------------------------------
// ONE RULE, ONE HOME: which hash of a capture the chain attests to.
//
// Before `anchoredCaptureHash` this was spelled at nine sites. A behavioural
// test cannot catch a tenth: a re-inlined `contentHash` would pass every
// behavioural test the day it was written, and diverge later — silently, on the
// one path where divergence produces FALSE CUSTODY rather than a wrong number.
// So this reads the source, in the same style as the twin-check guard next door.
//
// It matters most right now. Level 3 clause 1 moves the anchor from the
// Readability extraction to the document, and the value of the consolidation is
// that the move is ONE line. A site that kept its own spelling would keep asking
// the chain about the extraction after everything else had moved, and the anchor
// audit would stay green about it — the audit measures whether a claim is
// CHECKED, never WHAT was anchored.
// ---------------------------------------------------------------------------

/** Every module that decides, asks about, or reports an anchoring claim. */
const ANCHORING_PATH = [
  ['src', 'services', 'anchorSnapshots.ts'],
  ['src', 'services', 'auditOnChainAnchors.ts'],
  ['src', 'services', 'onChainVerification.ts'],
];

function sourceOf(parts: string[]): string {
  return readFileSync(join(__dirname, '..', ...parts), 'utf8');
}

describe('anchoredCaptureHash is the only answer to "which hash is anchored"', () => {
  it.each(ANCHORING_PATH.map((p) => [p.join('/'), p] as const))(
    '%s names no capture hash column of its own',
    (_label, parts) => {
      // Comments stripped, so the prose that explains WHY the rule exists — and
      // the measurement that prices it — stays free. The guard is about code.
      const code = stripComments(sourceOf(parts));
      expect(code).not.toMatch(/\bcontentHash\b/);
      expect(code).not.toMatch(/\bdocumentHash\b/);
    },
  );

  it('every anchoring-path module reaches the rule through the shared module', () => {
    for (const parts of ANCHORING_PATH) {
      expect(sourceOf(parts)).toMatch(/from\s+'(?:\.\.\/)+lib\/anchoredCaptureHash'/);
    }
  });

  it('DETECTS a re-inlined column — proven against a decoy', () => {
    // Without this the guard could stop matching anything and report a clean
    // codebase forever. The repository has already shipped a source-hash guard
    // that balanced on a parameter type and hashed almost nothing while passing.
    const decoy = stripComments(`
      // contentHash in a comment must NOT trip it
      const snapshots = await prisma.urlSnapshot.count({
        where: { contentHash: fileHash.replace(/^0x/, '') },
      });
    `);
    expect(decoy).not.toMatch(/\/\/ contentHash in a comment/);
    expect(decoy).toMatch(/\bcontentHash\b/);
  });
});

describe('the rule itself', () => {
  it('derives the anchored hash from the capture, bare hex as stored', () => {
    expect(anchoredCaptureHash({ documentHash: 'abc123' })).toBe('abc123');
  });

  it('finds captures by either spelling of the same hash', () => {
    // The 0x strip is the rule, not a caller's detail. Forgetting it returns
    // zero rows, and zero rows turns SNAPSHOT_ANCHOR into ORPHANED_ANCHOR — a
    // correctly anchored capture reported as a custody incident.
    expect(capturesAnchoredBy('0xabc123')).toEqual(capturesAnchoredBy('abc123'));
  });

  it('no module on the anchoring path strips the prefix itself', () => {
    // ONE NORMALISER, NOT A CONVENTION. The column had two writers and two
    // spellings until 2026-08-30 — bare from the write path, `0x` from the
    // transaction log — and a confirmed row then matched neither arm of
    // `capturesAnchoredBy`, making `VERIFIED` unreachable for every snapshot.
    //
    // `storedAnchorHash` is now the only place that decides the spelling, and
    // the branded return type keeps a raw string out of both write sites. This
    // guard covers the rest: a module that writes its own `replace(/^0x/)` has
    // re-created the second implementation whatever the types say.
    for (const parts of ANCHORING_PATH) {
      expect(stripComments(sourceOf(parts))).not.toMatch(/replace\(\s*\/\^0x/);
    }
  });

  it('DETECTS a re-inlined prefix strip — proven against a decoy', () => {
    // Same discipline as the column guard above: without a case proving the
    // pattern still matches something, this could silently cover nothing.
    const decoy = stripComments(`const bare = hash.replace(/^0x/, '');`);
    expect(decoy).toMatch(/replace\(\s*\/\^0x/);
  });

  it('normalises case as well as the prefix — the two used to disagree', () => {
    // `capturesAnchoredBy` stripped without lower-casing while `attestationOf`
    // did both, inside the module written to end duplicate implementations.
    expect(storedAnchorHash(`0X${'AB'.repeat(32)}`)).toBe('ab'.repeat(32));
    expect(capturesAnchoredBy(`0X${'AB'.repeat(32)}`)).toEqual(
      capturesAnchoredBy('ab'.repeat(32)),
    );
  });

  it('selects exactly the columns the rule reads', () => {
    // Pins the select to the interface. A select that grew a column the type
    // does not carry would be a select nobody is required to keep in step.
    expect(Object.keys(ANCHORABLE_CAPTURE_SELECT).sort()).toEqual(['documentHash']);
  });
});

// ---------------------------------------------------------------------------
// WHAT A RECORDED ANCHOR ATTESTS — the capture's documentHash, or something else.
//
// Until R45-B there was a third answer, ATTESTS_SUPERSEDED: an anchor over a hash
// the capture really had under a rule no longer in force — the Readability
// extraction's `contentHash`. That column left the schema with the legacy register;
// VERIFIED is over `documentHash` alone (evidence flows A3 :1043–:1044, A7 :1275),
// and the frozen registries' extraction anchors are explained by their committed
// ledgers, never by a capture row. An anchor over anything but `documentHash`
// therefore attests nothing this capture is.
// ---------------------------------------------------------------------------
describe('what an anchor attests to', () => {
  const CURRENT = 'a'.repeat(64);
  const STRANGER = 'c'.repeat(64);

  it('the current rule’s hash is the only one that may pass', () => {
    expect(attestationOf({ anchoredHash: CURRENT, current: CURRENT })).toBe('ATTESTS_CURRENT');
  });

  it('any other hash is misanchored — there is no superseded answer left to give', () => {
    expect(attestationOf({ anchoredHash: STRANGER, current: CURRENT })).toBe('UNRECOGNISED');
  });

  it('no recorded anchor is not a verdict about the anchor', () => {
    // A row whose anchor has not been observed must not read as a finding, or the
    // audit goes red on a corpus that is fine.
    expect(attestationOf({ anchoredHash: null, current: CURRENT })).toBe('UNCONFIRMED');
  });

  it('compares across the 0x boundary and casing, as every hash comparison must', () => {
    expect(attestationOf({ anchoredHash: `0x${CURRENT.toUpperCase()}`, current: CURRENT })).toBe('ATTESTS_CURRENT');
  });
});
