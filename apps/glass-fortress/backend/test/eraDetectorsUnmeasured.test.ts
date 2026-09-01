import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// THE GATE, ENFORCED RATHER THAN WRITTEN DOWN.
//
// Level 4's build order: "automatic mode may be BUILT before the detector
// thresholds are measured, and may NOT be ENABLED", because a batch running
// unattended on guessed thresholds is the one configuration in this design that
// can silently corrupt a corpus — an over-match nobody is watching.
//
// A rule stated in a plan is not a control; this repository has a memory file
// about that. So no `src/` module may carry threshold VALUES until a measurement
// justifies them. One page currently gives 19→5 across a boundary and 16 of 19
// within one, which is a data point.
//
// WHEN THE MEASUREMENT LANDS, THIS TEST CHANGES IN THE SAME COMMIT — that is the
// point of it. It is not an obstacle to route around: it makes "we measured
// this" a thing someone had to do deliberately, in a diff a reviewer can see.
// ---------------------------------------------------------------------------

const THRESHOLD_FIELDS = ['minMatchRateRatio', 'minKeptLengthRatio', 'minBaselineSamples'];

/** The module that DEFINES the type, which necessarily names the fields. */
const DEFINITION = join('src', 'lib', 'eraDetectors.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('the detector thresholds are not yet measured, so nothing may supply them', () => {
  it('no src/ module carries threshold values', () => {
    const offenders = sourceFiles('src')
      .filter((path) => path !== DEFINITION)
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        return THRESHOLD_FIELDS.some((field) => source.includes(field));
      });

    expect(offenders).toEqual([]);
  });

  // Guards the guard: if the fields are renamed and this list is not updated, the
  // scan above would pass by looking for strings that no longer exist anywhere —
  // a check that cannot fail, which is the shape this level keeps finding.
  it('the definition still names every field this scan looks for', () => {
    const source = readFileSync(DEFINITION, 'utf8');
    for (const field of THRESHOLD_FIELDS) expect(source).toContain(field);
  });
});
