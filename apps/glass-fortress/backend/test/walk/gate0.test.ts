import { gate0 } from '../../src/walk/gates';
import { T09, T14, T2, T3, EMPTY_ID, D, log } from './fixtures';

// ---------------------------------------------------------------------------
// GATE 0 — THE BOOTSTRAP. A4 of the flows appendix:
//
//     GATE 0   NOT APPROVED_BEFORE(page, c.timestamp)
//
// "No approved capture on or before this timestamp — nothing a human has
// judged governs it." It is a gate rather than a tool so that the first capture,
// a capture the archive back-filled before the first approved one, and the first
// capture after a reset are ONE mechanism: the walk stopping on the first thing
// it cannot check.
//
// RED until step 4 builds `src/walk/gates`. Every gate returns the same shape —
// null when quiet, `{ gate, material }` when it fires — so the walk's stop is
// the first non-null result and `material` is A5's per gate. Gate 0's material
// is `{}`: there is nothing to show, because nothing could be derived.
//
// This module never imports `chromeRulesetApply`; Gate 0 reads the log alone.
// ---------------------------------------------------------------------------

describe('Gate 0 — nothing a human has judged governs this timestamp', () => {
  it('fires on a page with no decision at all — the bootstrap', () => {
    expect(gate0([], T09)).not.toBeNull();
  });

  // The archive can back-fill an older capture. Nothing judged governs it, and
  // the walk must stop there rather than derive it under rules from its future.
  it('fires when the only acceptance is at a later timestamp', () => {
    expect(gate0(log([], [D.accepted(T2)]), T09)).not.toBeNull();
  });

  // THE SAME-DAY PAIR. An acceptance is a judgement about one capture and
  // governs from its timestamp, not from midnight.
  it('fires at 09:00 when the only acceptance is at 14:00 of the same day', () => {
    expect(gate0(log([], [D.accepted(T14)]), T09)).not.toBeNull();
  });

  it('quiet at the accepted capture’s own timestamp', () => {
    expect(gate0(log([], [D.accepted(T2)]), T2)).toBeNull();
  });

  it('quiet after an earlier acceptance', () => {
    expect(gate0(log([], [D.accepted(T2)]), T3)).toBeNull();
  });

  // Flow 3: a reset is "start again", and the first capture after it stops on
  // Gate 0 like any page's first. No second mechanism.
  it('fires after a RESET, whatever was accepted before it', () => {
    expect(gate0(log([], [D.accepted(T09), D.accepted(T2), D.reset()]), T3)).not.toBeNull();
  });

  // A skip is the verdict that a capture does not speak. It approves nothing.
  it('fires when the only decision is a CAPTURE_SKIPPED', () => {
    expect(gate0(log([], [D.skipped(T2)]), T3)).not.toBeNull();
  });

  // "A zero-rule approval is a ruleset." A page with no furniture is approved
  // with rules=0, an empty ruleset is in force from that timestamp, and Gate 0
  // does not fire again.
  it('quiet after a zero-rule approval — an empty ruleset is a ruleset', () => {
    expect(gate0(log([], [D.accepted(T2, EMPTY_ID)]), T3)).toBeNull();
  });

  it('when it fires, it names gate 0 with empty material, exactly as A5 says', () => {
    expect(gate0([], T09)).toEqual({ gate: 0, material: {} });
  });
});
