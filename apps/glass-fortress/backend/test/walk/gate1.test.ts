import type { CaptureExtraction, CurrentExtraction } from '../../src/lib/extractionDrift';
import { gate1 } from '../../src/walk/gates';
import { T09, rule } from './fixtures';

// ---------------------------------------------------------------------------
// GATE 1 — A SEGMENT CHANGED SIDES. A4 of the flows appendix:
//
//     GATE 1   (removed(c) ∩ kept(p)) ∪ (kept(c) ∩ removed(p)) ≠ ∅
//
// Both directions stop. kept → removed is DATA LOSS: a rule is taking article
// text. removed → kept is CORPUS POLLUTION: furniture is entering `text`, which
// feeds `textHash`, so every later capture looks novel. The researcher's ruling:
// "we are dealing with the very foundation of the system, we DO want to get
// human judgement when in doubt."
//
// WHY IT NEEDS NO NUMBER. An editorial edit removes text from the DOCUMENT, so
// it lands on neither side and does not fire. Only a rule failure leaves text
// present and on the other side of the line. Measured: 0 to 1 drifting segments
// across a stable stretch, 129 at a real break. A threshold would sit in a gap
// nothing occupies.
//
// THE REUSED MODULE IS `compareExtractions` (src/lib/extractionDrift), whose own
// contract is held by the KEEP file test/extractionDrift.test.ts. This file
// asserts what the GATE adds: the stop shape, A5's material with the selector
// hint resolved to a ruleId, and the segment definition A4 states — asserted
// here, not assumed from the reused module.
//
// RED until step 4 builds `src/walk/gates`. The gates module never imports
// `chromeRulesetApply`; it receives extractions already derived.
// ---------------------------------------------------------------------------

const previous = (keptText: string, removedText = ''): CaptureExtraction => ({ keptText, removedText });

const current = (
  keptText: string,
  removed: readonly { selector: string; text: string }[] = [],
): CurrentExtraction => ({
  keptText,
  removedText: removed.map((r) => r.text).join('\n'),
  removedSegments: removed,
});

const r1 = rule('r1', '.ticker', T09, 'd1');
const inForce = [r1];

describe('Gate 1 — a segment present in both captures changed sides', () => {
  it('quiet when nothing changed sides', () => {
    const p = previous('headline\nbody paragraph', 'ticker item');
    const c = current('headline\nbody paragraph', [{ selector: '.ticker', text: 'ticker item' }]);
    expect(gate1(p, c, inForce)).toBeNull();
  });

  it('fires when text kept before is removed now, naming the rule that took it', () => {
    const p = previous('headline\nbody paragraph');
    const c = current('headline', [{ selector: '.ticker', text: 'body paragraph' }]);
    expect(gate1(p, c, inForce)).toEqual({
      gate: 1,
      material: { nowRemoved: [{ text: 'body paragraph', ruleId: 'r1' }], nowKept: [], against: 'PREDECESSOR' },
    });
  });

  it('fires when furniture removed before is kept now', () => {
    const p = previous('headline', 'ticker item');
    const c = current('headline\nticker item');
    expect(gate1(p, c, inForce)).toEqual({
      gate: 1,
      material: { nowRemoved: [], nowKept: ['ticker item'], against: 'PREDECESSOR' },
    });
  });

  // An editorial deletion leaves the text in NEITHER side. That is the whole
  // discrimination: an article being edited never calls a human.
  it('quiet when text kept before is absent from both sides now', () => {
    const p = previous('headline\nold paragraph');
    const c = current('headline');
    expect(gate1(p, c, inForce)).toBeNull();
  });

  it('quiet when furniture removed before is absent now — a widget rotating out', () => {
    const p = previous('headline', 'yesterday’s ticker item');
    const c = current('headline', [{ selector: '.ticker', text: 'today’s ticker item' }]);
    expect(gate1(p, c, inForce)).toBeNull();
  });

  // THE BLIND SPOT, STATED. Text appearing for the first time has no side
  // history, so whichever side it lands on is unjudged here. Gate 4 shows every
  // never-seen removal; Gate 5 classifies the novel capture's diff. This gate
  // does not pretend to see it.
  it('quiet on new text, on either side, that the predecessor never had', () => {
    const p = previous('headline');
    const c = current('headline\nnew paragraph', [{ selector: '.ticker', text: 'new widget' }]);
    expect(gate1(p, c, inForce)).toBeNull();
  });

  it('fires with ruleId null when no rule in force accounts for the removal — the attribution is a hint', () => {
    const p = previous('headline\nbody paragraph');
    const c = current('headline', [{ selector: '.unknown', text: 'body paragraph' }]);
    expect(gate1(p, c, inForce)?.material).toEqual({
      nowRemoved: [{ text: 'body paragraph', ruleId: null }],
      nowKept: [],
      against: 'PREDECESSOR',
    });
  });

  // ONE SELECTOR, ONE LIVE RULE — ruled 2026-09-02. Approving a selector that
  // already exists as a live rule with a later validFrom EXTENDS that rule's
  // validFrom and writes RULE_EXTENDED; no second row is ever created. So the
  // lookup from the selector hint to a ruleId is unique by invariant, and the
  // gate attributes to the one live rule carrying the selector, null when none.

  // SETS, NOT MULTISETS. A partial move is still a move, and it is reported once.
  it('a segment repeated on one side and moved once fires once, with one material entry', () => {
    const p = previous('body paragraph\nbody paragraph\nbody paragraph');
    const c = current('', [{ selector: '.ticker', text: 'body paragraph' }]);
    expect(gate1(p, c, inForce)?.material.nowRemoved).toEqual([{ text: 'body paragraph', ruleId: 'r1' }]);
  });

  it('quiet on whitespace differences alone — segments are whitespace-normalised', () => {
    const p = previous('headline', 'ticker   item');
    const c = current('headline', [{ selector: '.ticker', text: 'ticker item' }]);
    expect(gate1(p, c, inForce)).toBeNull();
  });

  // MEASURED, NOT SUPPOSED: 69 single bullets swamped the first real drift run.
  it('quiet when only bullets and separators change sides — a segment needs a letter or digit', () => {
    const p = previous('headline\n•\n—\n***');
    const c = current('headline', [{ selector: '.ticker', text: '•\n—\n***' }]);
    expect(gate1(p, c, inForce)).toBeNull();
  });

  // A length threshold would have dropped this; "contains something readable"
  // does not.
  it('fires on a two-letter Hebrew line changing sides — no length threshold', () => {
    const p = previous('headline\nכן');
    const c = current('headline', [{ selector: '.ticker', text: 'כן' }]);
    expect(gate1(p, c, inForce)?.material.nowRemoved).toEqual([{ text: 'כן', ruleId: 'r1' }]);
  });

  // THE UNIT IS THE LINE. Two sentences on one line are one segment; the same
  // text on two lines is two other segments, and neither equals the first.
  it('quiet when one kept line reappears as two removed lines — the segment is the line, not the sentence', () => {
    const p = previous('headline\nFirst sentence. Second sentence.');
    const c = current('headline', [{ selector: '.ticker', text: 'First sentence.\nSecond sentence.' }]);
    expect(gate1(p, c, inForce)).toBeNull();
  });

  it('the material is exactly A5’s, against the predecessor — no character counts, no combined score', () => {
    const p = previous('headline\nbody paragraph', 'ticker item');
    const c = current('headline\nticker item', [{ selector: '.ticker', text: 'body paragraph' }]);
    const fired = gate1(p, c, inForce);
    expect(fired).not.toBeNull();
    expect(Object.keys(fired?.material ?? {}).sort()).toEqual(['against', 'nowKept', 'nowRemoved']);
    expect(fired?.material).toEqual({
      nowRemoved: [{ text: 'body paragraph', ruleId: 'r1' }],
      nowKept: ['ticker item'],
      against: 'PREDECESSOR',
    });
  });
});
