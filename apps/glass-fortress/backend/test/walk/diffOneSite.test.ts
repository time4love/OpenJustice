import { basename } from 'node:path';
import { WALK, SRC, tsFiles, readCode, codeOf } from './scan';

// ---------------------------------------------------------------------------
// THE DIFF IS WRITTEN FROM ONE SITE, IN THE WALK — refactor plan §4: "that
// urlVersionDiff is written from exactly one site"; the successor of
// test/unchangedNoDiff.test.ts, whose scan over eight diff sites in the scan
// job became a scan over one, in the walk (as-built §8, REWRITE).
//
// Two layers, two scans. test/diffSingleWriter.test.ts holds that the ROW is
// written by `recordDiff` and nothing else; this holds that `recordDiff` is
// CALLED from exactly one site under src/walk — the acquisition, after the
// store and before the row becomes ACQUIRED — so a diff can only exist for a
// capture the walk stored, and "once per acquired novel capture" has one place
// to be true. A second caller tomorrow — a re-diff, a repair — fails here
// before it writes anything.
//
// The scan reads CODE ONLY and carries a DECOY, as every scan in this suite.
// ---------------------------------------------------------------------------

/** A call of the diff writer — never its definition, its import, or a mention in a comment. */
const DIFF_CALL = /(?<![\w.]|function\s)recordDiff\s*\(/g;

const callersUnder = (dir: string) =>
  tsFiles(dir)
    .map((file) => ({ file: basename(file), calls: [...readCode(file).matchAll(DIFF_CALL)].length }))
    .filter((m) => m.calls > 0);

describe('recordDiff is called from exactly one site under src/walk', () => {
  it('the walk exists — the guard the scan rests on', () => {
    expect(tsFiles(WALK).length).toBeGreaterThan(0);
  });

  it('exactly one module calls it, once: the acquisition in scan_captures', () => {
    expect(callersUnder(WALK)).toEqual([{ file: 'scanCaptures.ts', calls: 1 }]);
  });

  it('nothing else under src calls it either — the writer defines it, the walk calls it', () => {
    const outsideTheWalk = tsFiles(SRC)
      .filter((file) => !file.startsWith(WALK))
      .map((file) => ({ file: file.slice(SRC.length + 1), calls: [...readCode(file).matchAll(DIFF_CALL)].length }))
      .filter((m) => m.calls > 0);
    expect(outsideTheWalk).toEqual([]);
  });

  it('DETECTS a call and ignores an import and a comment — proven against decoys', () => {
    const decoy = codeOf(`
      import { recordDiff } from '../../services/recordDiff';
      export async function recordDiff(input) {}   // the definition is not a call
      // recordDiff( in a comment must not count
      const diff = await recordDiff({ trackedUrlId, beforeSnapshotId, afterSnapshotId });
      await this.recordDiff(x); // a method of that name is not the writer
    `);
    expect([...decoy.matchAll(DIFF_CALL)]).toHaveLength(1);
    expect([...codeOf(`import { recordDiff } from './recordDiff';`).matchAll(DIFF_CALL)]).toHaveLength(0);
  });
});
