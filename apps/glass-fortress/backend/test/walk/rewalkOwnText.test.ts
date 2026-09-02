import type { CurrentExtraction } from '../../src/lib/extractionDrift';
import { gate1OwnText } from '../../src/walk/gates';
import { evaluateCapture, type EvaluateInput } from '../../src/walk/evaluate';
import { rulesetId } from '../../src/walk/derivations';
import { T09, T2, rule, D, log, row } from './fixtures';

// ---------------------------------------------------------------------------
// THE RE-WALK'S OWN-PREVIOUS-TEXT CHECK. A4's last sentence:
//
//     On a STALE ACQUIRED row (Flow 3) one more test runs with the others:
//         removed(c_new) ∩ kept(c_previous_version) ≠ ∅   → STOP,
//     reported as Gate 1 with "against its own approved text".
//
// Flow 3 corrects the past by walking again over rows that already have an
// outcome. A stale ACQUIRED capture is re-derived from bytes we hold, under the
// rules now in force for its timestamp, and the previous text is kept as a
// TextVersion. Before that supersession is written, ONE more question: did the
// correction eat text a human approved on this very capture? kept → removed
// against its own approved text is that finding, and it stops.
//
// ONE DIRECTION ONLY. The previous version holds only its stored `text`, which
// is its kept side; nothing was recorded of its removed side. removed → kept
// against it is not asked here — new text on the kept side is the predecessor
// comparison's business, and Gate 4's and Gate 5's.
//
// RULED 2026-09-02: Gate 1's material carries `against: 'PREDECESSOR' |
// 'OWN_PREVIOUS_TEXT'`, set by both checks; and in the stop the order is Gate 1
// against the predecessor, Gate 1 against own text, then 2, then 4.
//
// This is the assertion that survives `reconcileAgainstCdx`'s retirement: its
// "superset check" — text moved while bytes did not — re-expressed against the
// new contract, not copied with its old fixtures (refactor plan §4).
//
// RED until step 4 builds `src/walk/gates` and `src/walk/evaluate`.
// ---------------------------------------------------------------------------

const approved = (keptText: string) => ({ keptText });

const current = (
  keptText: string,
  removed: readonly { selector: string; text: string }[] = [],
): CurrentExtraction => ({
  keptText,
  removedText: removed.map((r) => r.text).join('\n'),
  removedSegments: removed,
});

/** r1 was in force when the capture was approved; r2 is the correction, created later against T09. */
const r1 = rule('r1', '.ticker', T09, 'd1');
const r2 = rule('r2', '.byline', T09, 'd3');
const corrected = log([r1, r2], [D.corrected(T09), D.accepted(T09), D.corrected(T09)]);

describe('gate1OwnText — the new derivation removed text a human approved on this capture', () => {
  it('fires when an approved segment is now removed, naming the rule that took it', () => {
    const c = current('headline\nbody', [{ selector: '.byline', text: 'by the correspondent' }]);
    expect(gate1OwnText(approved('headline\nbody\nby the correspondent'), c, [r1, r2])).toEqual({
      gate: 1,
      material: {
        nowRemoved: [{ text: 'by the correspondent', ruleId: 'r2' }],
        nowKept: [],
        against: 'OWN_PREVIOUS_TEXT',
      },
    });
  });

  it('quiet when a segment absent from the approved text is now kept — one direction only', () => {
    const c = current('headline\nbody\nnewly kept line');
    expect(gate1OwnText(approved('headline\nbody'), c, [r1, r2])).toBeNull();
  });

  it('quiet when the new text equals the approved text', () => {
    const c = current('headline\nbody', [{ selector: '.ticker', text: 'ticker item' }]);
    expect(gate1OwnText(approved('headline\nbody'), c, [r1, r2])).toBeNull();
  });

  it('fires when the approved segment reappears on the removed side with different whitespace', () => {
    const c = current('headline', [{ selector: '.byline', text: 'by   the   correspondent' }]);
    expect(gate1OwnText(approved('headline\nby the correspondent'), c, [r1, r2])?.material.nowRemoved).toEqual([
      { text: 'by the correspondent', ruleId: 'r2' },
    ]);
  });
});

describe('evaluateCapture — the own-text check runs with 1, 2 and 4, on a STALE ACQUIRED row only', () => {
  type Derived = ReturnType<EvaluateInput['derive']>;
  type Matched = Derived['matches']['c'][number];
  const m = (ruleId: string, matchedNodes: number): Matched => ({ ruleId, matchedNodes });

  /** The old ruleset id this row was acquired under: r1 alone. It is stale under r1 + r2. */
  const staleRow = (outcome: 'ACQUIRED' | 'DUPLICATE') => row(T2, outcome, { rulesetId: rulesetId(['.ticker']) });

  /** The predecessor comparison fires on removed → kept; the own-text check fires on kept → removed. */
  const bothFire = (): Derived => ({
    previous: { keptText: 'headline\nbody', removedText: 'ticker item' },
    current: {
      keptText: 'headline\nbody\nticker item',
      removedText: 'by the correspondent',
      removedSegments: [{ selector: '.byline', text: 'by the correspondent' }],
    },
    matches: { p: [m('r1', 1), m('r2', 0)], c: [m('r1', 0), m('r2', 1)] },
    seen: new Set(['ticker item', 'by the correspondent']),
    ownPrevious: approved('headline\nbody\nby the correspondent'),
  });

  const noClassifier: EvaluateInput['classify'] = jest.fn(async () => ({ editorial: true, reason: 'unused' }));

  function input(overrides: Partial<EvaluateInput> = {}): EvaluateInput {
    return {
      t: T2,
      rules: [r1, r2],
      decisions: corrected,
      row: staleRow('ACQUIRED'),
      fetched: null,
      derive: jest.fn(bothFire),
      novel: true,
      classify: noClassifier,
      ...overrides,
    };
  }

  it('reports Gate 1 against the predecessor, then Gate 1 against own text, before 2 and 4', async () => {
    const stop = await evaluateCapture(input());
    expect(stop).toEqual({
      capture: T2,
      gates: [
        { gate: 1, material: { nowRemoved: [], nowKept: ['ticker item'], against: 'PREDECESSOR' } },
        {
          gate: 1,
          material: {
            nowRemoved: [{ text: 'by the correspondent', ruleId: 'r2' }],
            nowKept: [],
            against: 'OWN_PREVIOUS_TEXT',
          },
        },
        { gate: 2, material: { rules: [{ ruleId: 'r1', selector: '.ticker', matchedOnPredecessor: 1 }] } },
      ],
    });
  });

  it('runs no own-text check on an UNFETCHED or PENDING_JUDGEMENT row — there is no approved text of its own', async () => {
    const withoutOwn = (): Derived => ({ ...bothFire(), ownPrevious: null });
    for (const outcome of ['UNFETCHED', 'PENDING_JUDGEMENT'] as const) {
      const stop = await evaluateCapture(input({ row: row(T2, outcome), derive: jest.fn(withoutOwn) }));
      expect(stop?.gates).toEqual([
        { gate: 1, material: expect.objectContaining({ against: 'PREDECESSOR' }) },
        { gate: 2, material: expect.anything() },
      ]);
    }
  });

  // A DUPLICATE was never stored: its text was its predecessor's, so it has no
  // approved text of its own to be eaten. Re-derived stale, it is compared
  // against the predecessor like any other capture.
  it('runs no own-text check on a STALE DUPLICATE row', async () => {
    const stop = await evaluateCapture(input({ row: staleRow('DUPLICATE') }));
    expect(stop?.gates).toEqual([
      { gate: 1, material: expect.objectContaining({ against: 'PREDECESSOR' }) },
      { gate: 2, material: expect.anything() },
    ]);
  });

  // The correction was approved AT this capture, so it carries a CAPTURE_ACCEPTED
  // under the ruleset now in force: RESOLVED, and the skip covers this check too.
  it('a RESOLVED stale ACQUIRED row skips the own-text check with the rest', async () => {
    const resolvedLog = log([r1, r2], [D.corrected(T09), D.accepted(T09), D.corrected(T09), D.accepted(T2)]);
    const derive = jest.fn(bothFire);
    await expect(evaluateCapture(input({ decisions: resolvedLog, derive }))).resolves.toBeNull();
    expect(derive).not.toHaveBeenCalled();
  });
});
