import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// A FINDINGS DOC MUST BE REACHABLE FROM THE LEVEL IT BEARS ON.
//
// WHY THIS EXISTS. The plan holds decisions; a dated record holds findings. That
// split is what stopped the plan growing 310 -> 2,839 lines by absorbing its own
// findings — but it creates a new failure: a session planning Level N reads the
// plan and never learns that a dated record already measured it. The convention
// is that the pointer rides in the level's `STATUS:` line, because
// `grep -n '^\*\*STATUS:' <plan>` is already the documented authority for level
// state. The pointer is therefore delivered by a ritual that exists rather than
// one anybody has to remember.
//
// A CONVENTION IN PROSE IS NOT A CONTROL. That was established the hard way on
// 2026-08-30, when a memory entry was loaded into context and violated anyway
// across three consecutive thesis versions. The answer to a rule that is read and
// broken is a check, not a firmer sentence — so this scan is the convention's
// enforcement and not its description.
//
// WHAT IT DOES NOT DO. It does not require every dated doc to declare `Bears on:`.
// Six documents predate the convention and some bear on no level at all, and
// retrofitting judgements onto documents this check's author did not write would
// be guessing, not enforcing. It holds the direction that decays: a doc that says
// it bears on a level must be findable from that level.
//
// THE VACUITY GUARD IS NOT OPTIONAL. An empty scan reporting success is the exact
// defect this repository has now found twice in one day — `FIGURES_HEDGED` passed
// by finding no sentence to inspect, and the integrity board scores an empty check
// BELOW "never run". So the last case asserts the scan actually examined something.
// ---------------------------------------------------------------------------

const REPO = join(__dirname, '..', '..', '..', '..');
const DOCS = join(REPO, 'docs');
const PLAN = join(DOCS, 'gf-factual-layer-rebuild-dev-plan.md');

const DATED = /-\d{4}-\d{2}-\d{2}\.md$/;
const BEARS_ON = /Bears on:\s*([^\n*]+)/;
const LEVEL = /Level\s+(\d+)/g;

interface Declaration {
  file: string;
  levels: number[];
}

function declarations(): Declaration[] {
  return readdirSync(DOCS)
    .filter((f) => DATED.test(f))
    .map((file) => {
      const match = BEARS_ON.exec(readFileSync(join(DOCS, file), 'utf8'));
      if (!match) return null;
      const levels = [...(match[1] ?? '').matchAll(LEVEL)].map((m) => Number(m[1]));
      return { file, levels };
    })
    .filter((d): d is Declaration => d !== null);
}

/**
 * The `STATUS:` line for a level, or null when the plan has no such level. Read
 * by scanning forward from the level's heading, which is how the authority
 * command finds it too.
 */
function statusLineFor(level: number): string | null {
  const lines = readFileSync(PLAN, 'utf8').split('\n');
  const heading = lines.findIndex((l) => l.startsWith(`### Level ${level} `));
  if (heading < 0) return null;
  const status = lines.slice(heading).findIndex((l) => l.startsWith('**STATUS:'));
  return status < 0 ? null : (lines[heading + status] ?? null);
}

describe('dated findings docs are reachable from the levels they bear on', () => {
  const declared = declarations();

  it('every declared level exists in the plan', () => {
    for (const { file, levels } of declared) {
      for (const level of levels) {
        expect({ file, level, status: statusLineFor(level) }).toEqual(
          expect.objectContaining({ status: expect.any(String) }),
        );
      }
    }
  });

  it("each doc is named in the STATUS line of every level it bears on", () => {
    const unreachable: string[] = [];
    for (const { file, levels } of declared) {
      for (const level of levels) {
        const status = statusLineFor(level);
        if (status !== null && !status.includes(file)) {
          unreachable.push(
            `${file} declares "Bears on: Level ${level}" but Level ${level}'s STATUS line does not name it. ` +
              `Add "→ \`docs/${file}\`" to that STATUS line, or correct the declaration.`,
          );
        }
      }
    }
    expect(unreachable).toEqual([]);
  });

  it('examined something — an empty scan is not a pass', () => {
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.flatMap((d) => d.levels).length).toBeGreaterThan(0);
  });
});
