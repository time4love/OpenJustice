import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ANCHORABLE_CAPTURE_SELECT,
  anchoredCaptureHash,
  attestationOf,
  capturesAnchoredBy,
  capturesKnownHashes,
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
  ['src', 'mcp', 'tools', 'checkOnChainStatus.ts'],
  ['src', 'services', 'confirmAnchors.ts'],
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

  it('the write path anchors a CAPTURE, never a hash it chose itself', () => {
    // `registerSnapshotOnChain(id, capture)` rather than
    // `registerSnapshotOnChain(id, contentHash)`. Passing the hash would put the
    // choice back at the call site, which is where it was.
    const code = stripComments(sourceOf(['src', 'services', 'recordCapture.ts']));
    expect(code).toMatch(/registerSnapshotOnChain\(snapshotId, capture\)/);
    expect(code).not.toMatch(/anchorNeverRejecting\([^)]*\.contentHash\)/);
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

  it('selects exactly the columns the rule reads', () => {
    // Pins the select to the interface. A select that grew a column the type
    // does not carry would be a select nobody is required to keep in step.
    expect(Object.keys(ANCHORABLE_CAPTURE_SELECT).sort()).toEqual(['documentHash']);
  });
});

// ---------------------------------------------------------------------------
// THREE WAYS AN ANCHOR CAN RELATE TO ITS SUBJECT, not two.
//
// The middle case is the whole reason this exists. After Level 3 moves the
// anchor to the document, all 105 legacy captures attest the Readability
// extraction — a hash they really have, under a rule no longer in force. A
// two-way split (matches one of mine / matches none) puts them in the first
// bucket, the audit goes green, and the flip "closes" Level 3 with nothing
// changed on chain. That is the plan's own warning coming true through the fix
// for it: "it would stay green if the answer were a hash of the page title."
// ---------------------------------------------------------------------------
describe('what an anchor attests to', () => {
  const CURRENT = 'a'.repeat(64);
  const SUPERSEDED = 'b'.repeat(64);
  const STRANGER = 'c'.repeat(64);
  const known = [CURRENT, SUPERSEDED];

  it('the current rule’s hash is the only one that may pass', () => {
    expect(attestationOf({ anchoredHash: CURRENT, current: CURRENT, known })).toBe(
      'ATTESTS_CURRENT',
    );
  });

  it('EXPLAINABLE IS NOT PASSING: a superseded hash is its own answer', () => {
    // The case a two-way split loses. This must never be ATTESTS_CURRENT.
    const verdict = attestationOf({ anchoredHash: SUPERSEDED, current: CURRENT, known });
    expect(verdict).toBe('ATTESTS_SUPERSEDED');
    expect(verdict).not.toBe('ATTESTS_CURRENT');
  });

  it('a hash the subject does not have by any rule is misanchored', () => {
    expect(attestationOf({ anchoredHash: STRANGER, current: CURRENT, known })).toBe('UNRECOGNISED');
  });

  it('no recorded anchor is not a verdict about the anchor', () => {
    // Every row is in this state until forensics:confirm-anchors has run. It must
    // not read as a finding, or the audit goes red on a corpus that is fine.
    expect(attestationOf({ anchoredHash: null, current: CURRENT, known })).toBe('UNCONFIRMED');
  });

  it('compares across the 0x boundary and casing, as every hash comparison must', () => {
    expect(
      attestationOf({ anchoredHash: `0x${CURRENT.toUpperCase()}`, current: CURRENT, known }),
    ).toBe('ATTESTS_CURRENT');
  });

  it('SURVIVES THE FLIP: the same row reclassifies when the rule moves', () => {
    // Simulates Level 3 clause 1 landing. A capture anchored on its extraction
    // passes today and must stop passing the moment the document becomes the
    // rule — without any row changing.
    const capture = { contentHash: CURRENT, documentHash: SUPERSEDED };
    const anchoredHash = capture.contentHash;

    const beforeFlip = attestationOf({
      anchoredHash,
      current: capture.contentHash,
      known: capturesKnownHashes(capture),
    });
    const afterFlip = attestationOf({
      anchoredHash,
      current: capture.documentHash,
      known: capturesKnownHashes(capture),
    });

    expect(beforeFlip).toBe('ATTESTS_CURRENT');
    expect(afterFlip).toBe('ATTESTS_SUPERSEDED');
  });
});
