import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// A HEURISTIC GETS EXACTLY ONE IMPORTABLE NAME.
//
// Not merely one implementation — one SYMBOL, because a symbol is what the
// compiler can enumerate.
//
// `MIN_CLAIM_LENGTH` was retired safely only because it was a shared export:
// deleting it made `tsc` name every dependent, and that is the only reason
// `trajectoryContext` was found. It carried the same 40 and would have recovered
// the reporting-link trajectory and then hidden it from every agent that reasons
// over one — a change that delivered nothing, silently, while its own tests
// passed.
//
// A private literal at the use site is invisible to that. Two implementations of
// a rule are findable; two anonymous literals of it are not.
//
// SCOPED DELIBERATELY NARROW. `.length > 0` is an emptiness check, not a
// threshold, and it appears in 59 files — a scan that flagged it would be noise,
// and a noisy guard gets switched off. This flags only a NON-ZERO literal
// compared against a length, and only in the three modules that decide what a
// trajectory is.
// ---------------------------------------------------------------------------

const BACKEND = join(__dirname, '..');

/** The modules that decide what a trajectory IS, and therefore hold its knobs. */
const TRAJECTORY_PATH = [
  'src/services/claimTrajectory.ts',
  'src/lib/trajectoryContext.ts',
  'src/services/measureClaimLength.ts',
];

/** `.length >= 40` — a threshold. Zero is excluded: that is emptiness, not a knob. */
const BARE_THRESHOLD = /\.length\s*(?:>=|<=|>|<)\s*(?!0\b)\d+/g;

describe('every length threshold in the trajectory path is a named symbol', () => {
  it.each(TRAJECTORY_PATH)('%s holds no bare numeric threshold', (relative) => {
    const source = readFileSync(join(BACKEND, relative), 'utf8');

    // Vacuity: an empty read would make the assertion below pass about nothing,
    // which is the failure this repository names most often.
    expect(source.length).toBeGreaterThan(500);

    expect(source.match(BARE_THRESHOLD) ?? []).toEqual([]);
  });

  it('recognises a bare threshold when one is there', () => {
    // The guard is only worth having if it can fail. Without this, a regex that
    // silently stopped matching would leave every case above green forever.
    expect('normalised.length >= 40'.match(BARE_THRESHOLD)).toHaveLength(1);
    expect('items.length > 0'.match(BARE_THRESHOLD)).toBeNull();
  });
});
