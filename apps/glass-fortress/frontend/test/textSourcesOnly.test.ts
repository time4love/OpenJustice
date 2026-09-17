import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { FRONTEND, requireSubjects } from './scan';

// ---------------------------------------------------------------------------
// text-sources-only — R58, the sketch's §6-12 and §(e) H1-1/H1-2/H1-3.
//
// A FILE WITH A SOURCE EXTENSION IS TEXT. `src/components/shell/RightPane.tsx` :65 carried a raw
// 0x00 and a raw 0x01 inside a template literal. `git diff --numstat` on any edit to it returned
// `-` `-` rather than a line count, so a DECLARED edit's asserted size could not be reported by the
// sweep that exists to report it; `grep` was silent on it; and the COMMIT-time secret scan was blind
// to it, because that scan takes its subject from `git diff`, which emits no content lines for a
// blob git calls binary.
//
// AND THE CAUSE IS THE NUL ALONE, WHICH MATTERS BECAUSE IT MAKES THIS SCAN WIDER THAN GIT'S OWN
// HEURISTIC, NOT NARROWER. Measured, each byte planted alone in an otherwise ordinary file:
//
//     byte        git --numstat   grep -c   file(1)
//     0x00 NUL       -   -          0       data          <- git and grep both go blind
//     0x01 SOH       1 / 1          2       data
//     0x0C FF        1 / 1          2       ASCII text
//     0x1B ESC       1 / 1          2       ASCII text, with escape sequences
//
// So git's binary heuristic is NUL-SPECIFIC: 0x01 alone would never have produced `-` `-`, and
// `file(1)` is broader than git but still calls 0x0C and 0x1B ordinary text. THIS SCAN IS BROADER
// THAN BOTH — it catches a class git reports as a normal text diff and `file(1)` reports as ASCII,
// which is the whole reason it exists rather than a `file(1)` check or a trust in git's heuristic.
//
// THE SUBJECT SET IS THE SCOPING, AND THAT IS THE WHOLE DESIGN. `src/` holds SIX tracked binaries:
// the four `.woff2` faces, `src/app/icon.png` — FIVE of them entirely legitimate — and the one
// defect. A scan stated over "every file under src/" would be RED FOREVER on the five, and the only
// cure would be an allow-list naming them, which rots the day a sixth face lands. The extension set
// excludes all five BY CONSTRUCTION and admits the one that matters, because the defect is precisely
// A SOURCE EXTENSION THAT IS NOT TEXT. There is no allow-list here, and none is possible.
//
// WHAT IT DOES NOT COVER, said plainly, because a scan that does not state its limit is read as
// covering everything: this holds that a file with a SOURCE extension is text. It says nothing about
// the five legitimate binaries under `src/`, which are binary by nature and correctly so; and it is
// the only guard of its kind, since the COMMIT-time secret scan is equally blind to all six.
//
// THE BYTE CENSUS LIVES HERE AND NOT IN `test/scan.ts` on purpose: this is the only scan that reads
// BYTES rather than parsed nodes, and the only one whose subjects include `.css` and `.json`. Moving
// it into the shared helper would also break R58's D3, which asserts that file's diff is exactly
// −17/+0. If a second byte scan is ever written, the reader moves there then.
// ---------------------------------------------------------------------------

/** The roots a source file lives under. */
const ROOTS = ['src', 'test'] as const;

/**
 * The extensions a SOURCE file has — the subject set, as a VALUE. Every text format this workspace
 * writes, and nothing else; `.woff2`, `.png` and `.txt` are absent by construction rather than by
 * exception.
 */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.css', '.json'] as const;

/**
 * The floor, beside the vacuity guard. `requireSubjects` alone is satisfied by ONE file — a glob
 * that has silently collapsed still passes it — and a case asserting today's exact 170 would fail
 * the day a legitimate file is deleted, teaching nobody anything. 160 sits below the measured 170 by
 * a margin that survives ordinary deletion and far above any blinded glob.
 */
const FLOOR = 160;

/**
 * The predicate, as a VALUE and not a description: a byte a source file may NOT carry. TAB (0x09),
 * LF (0x0A) and CR (0x0D) are the three control bytes a source file legitimately holds.
 *
 * NOT "every other byte below 0x20 makes the file binary" — that is false for every byte but NUL, and
 * measured above. Only 0x00 makes git report `-` `-` and silences grep. The predicate is deliberately
 * WIDER than git's heuristic: 0x01, 0x0C and 0x1B are invisible to a source file's reader, survive
 * review, and mean a keyboard or a tool boundary put something in the file that nobody chose. The one
 * that has already cost this project a round is NUL; the rest are the same class caught earlier.
 */
function isControlByte(byte: number): boolean {
  return byte < 0x09 || (byte >= 0x0b && byte <= 0x0c) || (byte >= 0x0e && byte <= 0x1f);
}

function subjects(): string[] {
  const walk = (at: string): string[] =>
    readdirSync(at).flatMap((entry) => {
      const full = join(at, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension)) ? [full] : [];
    });
  const found = ROOTS.flatMap((root) => walk(join(FRONTEND, root)))
    .map((file) => relative(FRONTEND, file))
    .sort();
  return [...requireSubjects('tracked text sources under src/ and test/', found)];
}

/** Every control byte a file carries, with the 1-based line it first appears on. */
function offence(file: string): string | null {
  const bytes = readFileSync(join(FRONTEND, file));
  const found = new Set<number>();
  let line = 0;
  let at = 1;
  for (const byte of bytes) {
    if (byte === 0x0a) at += 1;
    if (isControlByte(byte)) {
      found.add(byte);
      if (line === 0) line = at;
    }
  }
  if (found.size === 0) return null;
  const names = [...found].sort((a, b) => a - b).map((byte) => `0x${byte.toString(16)}`);
  return `${file}:${String(line)} [${names.join(',')}]`;
}

describe('text-sources-only', () => {
  it('the predicate CATCHES a control byte — every family it is built from', () => {
    const missed = [0x00, 0x01, 0x07, 0x0b, 0x0c, 0x0e, 0x1f]
      .filter((byte) => !isControlByte(byte))
      .map((byte) => `0x${byte.toString(16)}`);
    expect(missed).toEqual([]);
  });

  it('the predicate is SILENT on TAB, LF and CR — the three a source file legitimately carries', () => {
    const caught = [
      [0x09, 'TAB'],
      [0x0a, 'LF'],
      [0x0d, 'CR'],
    ]
      .filter(([byte]) => isControlByte(byte as number))
      .map(([byte, name]) => `${String(name)} 0x${(byte as number).toString(16)}`);
    expect(caught).toEqual([]);
  });

  it(`the subject set is the EXTENSION set, and it holds at least ${String(FLOOR)} files`, () => {
    const found = subjects();
    // Printed, because the number is the thing a later reader has to be able to check. `no-console` is
    // not enabled in this workspace, so no directive is needed and one would itself be a warning.
    console.log(`text-sources-only subjects: ${String(found.length)} (floor ${String(FLOOR)})`);
    // The FLOOR alone is asserted. A case comparing `count` against `found.length` would compare the
    // number to itself and assert nothing — R57's P0, a case that asserts a number does not grow being
    // satisfied by zero. On failure the received value IS the real count, which is what a reader needs.
    expect({ subjects: found.length >= FLOOR ? `>= ${String(FLOOR)}` : found.length }).toEqual({
      subjects: `>= ${String(FLOOR)}`,
    });
  });

  it('no source file under src/ or test/ carries a control byte', () => {
    const offenders = subjects()
      .map((file) => offence(file))
      .filter((found): found is string => found !== null);
    expect(offenders).toEqual([]);
  });
});
