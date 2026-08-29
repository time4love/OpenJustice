import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DETECTION_VERSION } from '../src/services/claimTrajectory';

// ---------------------------------------------------------------------------
// CHANGE DETECTION, BUMP DETECTION_VERSION. This is what makes that true.
//
// `DETECTION_VERSION` is what tells a stored trajectory it no longer describes
// the corpus. Nothing enforced it: on 2026-08-29 the containment rule replaced
// the length filter, and reverting the version string to v1 left all 2178 tests
// passing — every v1 trajectory would have read as CURRENT under a rule that
// never produced it.
//
// That is not hypothetical, it is the same failure one subsystem over. When the
// survival rule changed, 88 stored verdicts became wrong while every hash still
// matched and every count stayed green, because the hash committed to the check's
// INPUTS and nothing committed to its RULE.
//
// WHY A HASH OF FUNCTION BODIES, NOT OF THE FILE. Hashing the whole file trips on
// every comment edit, and a guard that cries wolf gets switched off — this
// repository has that written down. Comments are stripped and only the functions
// that DECIDE what a trajectory is are hashed, so prose can be improved freely
// and behaviour cannot change quietly.
//
// WHAT IT CAN AND CANNOT DO. It cannot force a correct version STRING — someone
// can update the pin without thinking. It converts a silent omission into a
// deliberate act: the suite fails, names the functions that moved, and says to
// bump the version first. That is the same bargain `classifierPromptHash` makes
// one layer down, and the same one the lint ratchets make.
// ---------------------------------------------------------------------------

const SOURCE = join(__dirname, '..', 'src', 'services', 'claimTrajectory.ts');

/**
 * The functions that decide what a trajectory IS.
 *
 * Mirrors `DETECTION_VERSION`'s own list — candidate discovery, the presence
 * test, normalisation, identity, transition counting, and the containment rule.
 * Anything added here that changes an answer belongs in this list.
 */
const DETECTION_FUNCTIONS = [
  'normaliseClaim',
  'claimHash',
  'countTransitions',
  'buildTrajectory',
  'containmentOf',
  'isDerivativeTrajectory',
  'loadDetectionInputs',
  'detect',
];

/**
 * THE PIN. Regenerate ONLY after bumping DETECTION_VERSION — the failure message
 * says so, and updating this without the bump is the one way past the guard.
 */
const PINNED = {
  version: 'v2-collapse-ws-containment-substring-presence',
  sourceHash: '017a82a2e0c8657713299c7e07a7aaeb822e10900f6d6acc08665d177a7409f1',
};

/** Removes block and line comments so prose edits cannot trip the guard. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * One function's body: its declaration line to the `}` that closes it at column
 * zero.
 *
 * LINE-BASED, NOT BRACE-MATCHED, and the first version got this wrong. Counting
 * braces from the declaration stops at the first `}` it balances — which for
 *
 *     export function buildTrajectory(
 *       snapshots: readonly { snapshotDate: string; ... }[],
 *
 * is the PARAMETER TYPE, so the captured "body" was a signature fragment and the
 * presence test was never hashed at all. The guard reported nothing wrong while
 * covering almost nothing, which is precisely the vacuity it exists to prevent.
 * Return types have the same hazard.
 *
 * Every detection function is top-level and the file is prettier-formatted, so a
 * lone `}` at column zero is its end. Narrower assumption, and one that fails
 * loudly rather than silently.
 */
function bodyOf(source: string, name: string): string {
  const lines = source.split('\n');
  const declaration = new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*[(<]`);
  const start = lines.findIndex((l) => declaration.test(l));
  if (start === -1) throw new Error(`detection function not found: ${name}`);

  const end = lines.findIndex((l, i) => i > start && /^\}\s*$/.test(l));
  if (end === -1) throw new Error(`unterminated function body: ${name}`);

  return lines.slice(start, end + 1).join('\n');
}

export function detectionSourceHash(rawSource: string): string {
  const stripped = stripComments(rawSource);
  // Whitespace-collapsed so reformatting is not a behaviour change.
  const bodies = DETECTION_FUNCTIONS.map((n) => bodyOf(stripped, n).replace(/\s+/g, ' ')).join('\n');
  return createHash('sha256').update(bodies, 'utf8').digest('hex');
}

const source = readFileSync(SOURCE, 'utf8');

describe('detection cannot change without DETECTION_VERSION moving', () => {
  it('finds every detection function — a missing one would hash less than it claims', () => {
    // Vacuity: if a rename silently dropped a function from the hash, the pin
    // would keep matching while the rule it was meant to cover moved freely.
    for (const name of DETECTION_FUNCTIONS) {
      expect(() => bodyOf(stripComments(source), name)).not.toThrow();
    }
    expect(DETECTION_FUNCTIONS.length).toBeGreaterThanOrEqual(8);
  });

  it('the pin still describes the code', () => {
    const actual = detectionSourceHash(source);

    expect({ version: DETECTION_VERSION, sourceHash: actual }).toEqual(
      expect.objectContaining({
        version: PINNED.version,
        sourceHash: PINNED.sourceHash,
      }),
    );
  });

  it('CAN FAIL — a changed body changes the hash', () => {
    // Without this, a `bodyOf` that quietly returned '' would leave every case
    // above green forever. The guard has to be shown to bite.
    // `s.` matters: the same expression appears in a COMMENT a hundred lines
    // above, and replacing that one instead changed nothing — which is the
    // comment-blindness below, demonstrating itself while this case was written.
    const mutated = source.replace(
      's.normalisedText.includes(normalisedClaim)',
      's.normalisedText.startsWith(normalisedClaim)',
    );
    expect(mutated).not.toBe(source);
    expect(detectionSourceHash(mutated)).not.toBe(detectionSourceHash(source));
  });

  it('is BLIND to comments, so prose can be improved freely', () => {
    // The property that keeps it from being noise. A guard that fires on a
    // clarifying comment is a guard someone deletes.
    const commented = source.replace(
      'export function normaliseClaim',
      '// a clarifying remark that changes nothing\nexport function normaliseClaim',
    );
    expect(commented).not.toBe(source);
    expect(detectionSourceHash(commented)).toBe(detectionSourceHash(source));
  });
});
