import { stratifiedSample } from '../src/lib/timelineSample';

// ---------------------------------------------------------------------------
// LEVEL 4 — the decided half of the next-capture policy.
//
// The plan's reason for stratifying is specific and testable: "The first
// captures are consecutive and from the page's earliest era — possibly a
// template that no longer exists, possibly predating the site's advertising
// entirely." So the property under test is not "returns N items", it is
// "reaches the whole history", which is the thing a first-N sample fails at.
// ---------------------------------------------------------------------------

const history = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe('a stratified sample reaches the whole history', () => {
  it('includes BOTH ENDPOINTS — where a redesign shows up', () => {
    const picked = stratifiedSample(history(100), 5);
    expect(picked.at(0)).toBe(0);
    expect(picked.at(-1)).toBe(99);
  });

  it('is not the first N — the failure this exists to prevent', () => {
    const picked = stratifiedSample(history(100), 5);
    expect(picked).not.toEqual([0, 1, 2, 3, 4]);
    // Spread across the range rather than bunched at one end.
    expect(picked).toEqual([0, 25, 50, 74, 99]);
  });

  it('spreads evenly enough that no era is skipped', () => {
    const picked = stratifiedSample(history(1000), 10);
    const gaps = picked.slice(1).map((v, i) => v - (picked[i] as number));
    const max = Math.max(...gaps);
    const min = Math.min(...gaps);
    expect(max - min).toBeLessThanOrEqual(1);
  });
});

describe('the edges', () => {
  it('returns everything, in order, when asked for more than exists', () => {
    // A short history is not an error.
    expect(stratifiedSample(history(3), 10)).toEqual([0, 1, 2]);
  });

  it('takes the MIDDLE when asked for one, not the first', () => {
    // The first capture is the earliest era, which is exactly the bias this
    // module removes. Asking for a single sample must not reintroduce it.
    expect(stratifiedSample(history(101), 1)).toEqual([50]);
  });

  it('returns nothing for an empty history or a non-positive count', () => {
    expect(stratifiedSample([], 5)).toEqual([]);
    expect(stratifiedSample(history(10), 0)).toEqual([]);
    expect(stratifiedSample(history(10), -1)).toEqual([]);
  });

  it('never repeats an item when rounding collides', () => {
    // With count close to population, two indices can round to the same slot.
    for (let n = 2; n <= 20; n += 1) {
      for (let k = 2; k <= n; k += 1) {
        const picked = stratifiedSample(history(n), k);
        expect(new Set(picked).size).toBe(picked.length);
      }
    }
  });
});

describe('it is deterministic, and that is a requirement not an accident', () => {
  it('gives the same sample for the same history every time', () => {
    // A marking session that cannot be reproduced cannot be reviewed. Every
    // other instrument in this repository is held to that; a random sample
    // would quietly exempt this one.
    const a = stratifiedSample(history(57), 7);
    const b = stratifiedSample(history(57), 7);
    expect(a).toEqual(b);
  });
});
