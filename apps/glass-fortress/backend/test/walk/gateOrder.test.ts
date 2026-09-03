import { evaluateCapture, type EvaluateInput } from '../../src/walk/evaluate';
import { T09, T2, rule, D, log, row } from './fixtures';

// ---------------------------------------------------------------------------
// THE ORDER OF THE GATES, THE RESOLVED SKIP, AND THE DIGEST STOP.
//
// A4: "Order of evaluation: 0, then 1, 2, 4 together, then 5. A RESOLVED row
// skips all five." A5: Gate 5 runs only on a NOVEL capture, and a digest
// mismatch at fetch time stops the walk before any gate.
//
// `evaluateCapture` is the one function the walk calls per capture between
// fetch and store, and the only place the gates are composed. Each gate
// returns its own `{ gate, material } | null` (files gate0–gate5); this
// function collects them.
//
// RULED 2026-09-02: Gates 1, 2 and 4 are ALL evaluated, and the stop carries
// EVERY gate that fired, each with its own material, in order —
// `{ capture, gates: [{ gate, material }, …] }`. Gate 0, Gate 5 and DIGEST
// arrive alone by construction. A walk defect in any of the three (a rule in
// force with no RuleMatch row; a removal under no live rule) THROWS whether or
// not another gate fired first: a defect in the instrument surfaces on the
// capture where it happened. The marking URL is the tool's to add (A6), not
// this function's.
//
// HOW THE ORDER IS OBSERVED. `derive` is lazy and mocked, so a gate that needs
// no derivation is proven not to have caused one. The classifier is mocked, so
// Gate 5 is proven to run or not. Gates 2 and 4 are observed through their
// throw rulings: a defect input throws when the gate runs and cannot when it
// does not.
//
// RED until step 4 builds `src/walk/evaluate`.
// ---------------------------------------------------------------------------

type Derived = ReturnType<EvaluateInput['derive']>;
type Matched = Derived['matches']['c'][number];

const m = (ruleId: string, matchedNodes: number): Matched => ({ ruleId, matchedNodes });

const r1 = rule('r1', '.ticker', T09, 'd1');
/** A page with one REVIEWED rule and an approval at T09, so Gate 0 is quiet from T09 on. */
const calibrated = log([r1], [D.corrected(T09), D.accepted(T09)]);

/** Nothing changed sides, the rule still matches, the removal has been seen. */
const quiet = (): Derived => ({
  previous: { keptText: 'headline\nbody', removedText: 'ticker item' },
  current: {
    keptText: 'headline\nbody',
    removedText: 'ticker item',
    removedSegments: [{ selector: '.ticker', text: 'ticker item' }],
  },
  matches: { p: [m('r1', 1)], c: [m('r1', 1)] },
  seen: new Set(['ticker item']),
});

/** Gate 1: furniture removed before is kept now. */
const gate1Fires = (): Derived => ({
  ...quiet(),
  current: { keptText: 'headline\nbody\nticker item', removedText: '', removedSegments: [] },
  matches: { p: [m('r1', 1)], c: [m('r1', 0)] },
});

/** Gate 1 AND Gate 4: the seen furniture is kept now, and a never-seen removal lands under REVIEWED r1. */
const gates1And4Fire = (): Derived => ({
  ...quiet(),
  current: {
    keptText: 'headline\nbody\nticker item',
    removedText: 'never seen item',
    removedSegments: [{ selector: '.ticker', text: 'never seen item' }],
  },
});

/** The walk defect Gate 2 throws on: r1 is in force here and this capture has no row for it. */
const gate2Defect = (base: Derived): Derived => ({ ...base, matches: { p: base.matches.p, c: [] } });

const ABC = Buffer.from('<html>abc</html>');
const DIGEST_OF_ABC = '2ALYL55WYSWHKBLTC6NABOPUYCJ36ZBI';
const DIGEST_OF_XYZ = 'XO6R53JL6SS554OEGXG5BTSJQOSBAOL4';

const editorial = (): jest.MockedFunction<EvaluateInput['classify']> =>
  jest.fn(async () => ({ editorial: true, reason: 'an edit' }));
const notEditorial = (): jest.MockedFunction<EvaluateInput['classify']> =>
  jest.fn(async () => ({ editorial: false, reason: 'a widget entered the text' }));

function input(overrides: Partial<EvaluateInput> = {}): EvaluateInput {
  return {
    t: T2,
    rules: [r1],
    decisions: calibrated,
    row: row(T2, 'UNFETCHED'),
    fetched: null,
    derive: jest.fn(quiet),
    novel: false,
    classify: editorial(),
    ...overrides,
  };
}

describe('evaluateCapture — the digest check, then Gate 0, then 1, 2, 4 together, then 5 last', () => {
  it('stops on DIGEST when a fresh fetch’s bytes hash to a different digest — before any derivation or spend', async () => {
    const derive = jest.fn(quiet);
    const classify = notEditorial();
    const stop = await evaluateCapture(
      input({ fetched: { bytes: ABC, expectedDigest: DIGEST_OF_XYZ }, derive, classify, novel: true }),
    );
    expect(stop).toEqual({
      capture: T2,
      gates: [{ gate: 'DIGEST', material: { expected: DIGEST_OF_XYZ, got: DIGEST_OF_ABC } }],
    });
    expect(derive).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
  });

  it('proceeds to the gates when a fresh fetch’s bytes match the digest', async () => {
    const bare = input({ rules: [], decisions: [], fetched: { bytes: ABC, expectedDigest: DIGEST_OF_ABC } });
    await expect(evaluateCapture(bare)).resolves.toEqual({ capture: T2, gates: [{ gate: 0, material: {} }] });
  });

  it('runs no digest check when the bytes were held on the row or come from the snapshot', async () => {
    const bare = input({ rules: [], decisions: [], fetched: null });
    await expect(evaluateCapture(bare)).resolves.toEqual({ capture: T2, gates: [{ gate: 0, material: {} }] });
  });

  // The check is at FETCH time. A page with nothing judged still has its bytes
  // verified before the bootstrap stop, or the bootstrap would mark bytes the
  // archive did not attest.
  it('reports DIGEST, not Gate 0, on a mismatch on a page with no approval', async () => {
    const bare = input({ rules: [], decisions: [], fetched: { bytes: ABC, expectedDigest: DIGEST_OF_XYZ } });
    await expect(evaluateCapture(bare)).resolves.toEqual({
      capture: T2,
      gates: [{ gate: 'DIGEST', material: { expected: DIGEST_OF_XYZ, got: DIGEST_OF_ABC } }],
    });
  });

  it('Gate 0 fires first and alone: nothing is derived, and a Gate 2 defect downstream cannot throw', async () => {
    const derive = jest.fn(() => gate2Defect(quiet()));
    const stop = await evaluateCapture(input({ decisions: log([r1], [D.corrected(T09)]), derive }));
    expect(stop).toEqual({ capture: T2, gates: [{ gate: 0, material: {} }] });
    expect(derive).not.toHaveBeenCalled();
  });

  it('when Gate 1 fires, the classifier is not called — Gate 5 only if 0 to 4 are quiet', async () => {
    const classify = notEditorial();
    const stop = await evaluateCapture(input({ derive: jest.fn(gate1Fires), classify, novel: true }));
    expect(stop?.gates).toEqual([{ gate: 1, material: expect.anything() }]);
    expect(classify).not.toHaveBeenCalled();
  });

  it('with 1, 2 and 4 quiet on a NOVEL capture, the classifier is called once and its verdict decides', async () => {
    const fires = notEditorial();
    const stop = await evaluateCapture(input({ novel: true, classify: fires }));
    expect(fires).toHaveBeenCalledTimes(1);
    expect(stop?.gates).toEqual([{ gate: 5, material: expect.objectContaining({ editorial: false }) }]);

    const passes = editorial();
    await expect(evaluateCapture(input({ novel: true, classify: passes }))).resolves.toBeNull();
    expect(passes).toHaveBeenCalledTimes(1);
  });

  it('with 1, 2 and 4 quiet on a capture that is NOT novel, nothing is classified and nothing stops — the DUPLICATE path', async () => {
    const classify = notEditorial();
    await expect(evaluateCapture(input({ novel: false, classify }))).resolves.toBeNull();
    expect(classify).not.toHaveBeenCalled();
  });

  // The human just ruled on this capture under the ruleset now in force. The
  // gates would fire again on the same drift, so none of them runs.
  it('a RESOLVED row skips all five: nothing derived, nothing classified, and a Gate 2 defect cannot throw', async () => {
    const resolvedLog = log([r1], [D.corrected(T09), D.accepted(T09), D.accepted(T2)]);
    const derive = jest.fn(() => gate2Defect(quiet()));
    const classify = notEditorial();
    const result = await evaluateCapture(
      input({ decisions: resolvedLog, row: row(T2, 'PENDING_JUDGEMENT'), derive, classify, novel: true }),
    );
    expect(result).toBeNull();
    expect(derive).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
  });

  // RULED: 1, 2 and 4 are all evaluated; the stop carries every gate that fired,
  // in order, each with its own material; and a defect in any of them throws
  // even though another fired first.
  it('Gates 1 and 4 firing together are both reported, in order, with both materials — and a Gate 2 defect still throws', async () => {
    const stop = await evaluateCapture(input({ derive: jest.fn(gates1And4Fire) }));
    expect(stop).toEqual({
      capture: T2,
      gates: [
        { gate: 1, material: { nowRemoved: [], nowKept: ['ticker item'], against: 'PREDECESSOR' } },
        { gate: 4, material: { removals: [{ text: 'never seen item', ruleId: 'r1', selector: '.ticker' }] } },
      ],
    });

    const defective = input({ derive: jest.fn(() => gate2Defect(gates1And4Fire())) });
    await expect(evaluateCapture(defective)).rejects.toThrow('r1');
  });
});
