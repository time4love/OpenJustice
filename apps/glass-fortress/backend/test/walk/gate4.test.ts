import type { CurrentExtraction } from '../../src/lib/extractionDrift';
import { gate4 } from '../../src/walk/gates';
import { T09, T2, T3, rule, D, log } from './fixtures';

// ---------------------------------------------------------------------------
// GATE 4 — A REMOVAL NO HUMAN HAS SEEN, UNDER A RULE NO HUMAN HAS TRUSTED.
// A4 of the flows appendix:
//
//     GATE 4   ∃ segment s ∈ removed(c) removed by a REVIEWED rule AND s ∉ SEEN(page)
//
// THE ANSWER TO THE BLIND SPOT. Gates 1 and 2 judge text present in both of two
// captures; text appearing for the first time has no side history. New article
// text inside an element a rule removes would be lost silently, and no signal
// can be built from the text alone. So every never-seen removal is shown to a
// human until they say, of ONE rule, "this element is furniture whatever it
// contains" — RULE_TRUSTED, logged and reversible. The walk stops constantly
// while the rules are new and thins as trust accumulates. A gate, not an
// interval: a review on an interval samples the removed side; this covers it.
//
// SEEN is derived per page and cached by the walk (A3), so the gate receives
// it. TRUSTED is folded per rule from the log, so the gate receives the log.
// The removed side arrives as `removedSegments`, one entry per selector, and
// the gate splits each into segments under the same definition Gate 1 uses.
//
// TWO RULINGS, 2026-09-02. A removal whose selector is no live rule cannot arise
// when derivation runs under RULES_IN_FORCE; it is a walk defect and the gate
// THROWS, naming the selector and the timestamp — never ruleId null. And a
// segment two REVIEWED rules both remove is listed once PER RULE, because trust
// is per rule and the researcher must see every rule that claims the text.
//
// RED until step 4 builds `src/walk/gates`.
// ---------------------------------------------------------------------------

const current = (removed: readonly { selector: string; text: string }[]): CurrentExtraction => ({
  keptText: 'headline\nbody paragraph',
  removedText: removed.map((r) => r.text).join('\n'),
  removedSegments: removed,
});

const r1 = rule('r1', '.ticker', T09, 'd1');
const r2 = rule('r2', '.related', T09, 'd1');
const reviewed = log([r1, r2], [D.corrected(T09)]);
const NOTHING_SEEN = new Set<string>();

describe('Gate 4 — a removed segment no human has seen, under a rule still REVIEWED', () => {
  it('fires on a never-seen removal under a REVIEWED rule, naming the text, the rule and its selector', () => {
    const c = current([{ selector: '.ticker', text: 'ticker item' }]);
    expect(gate4(T2, c, [r1], reviewed, NOTHING_SEEN)).toEqual({
      gate: 4,
      material: { removals: [{ text: 'ticker item', ruleId: 'r1', selector: '.ticker' }] },
    });
  });

  it('quiet when the segment is already in SEEN', () => {
    const c = current([{ selector: '.ticker', text: 'ticker item' }]);
    expect(gate4(T2, c, [r1], reviewed, new Set(['ticker item']))).toBeNull();
  });

  // "This element is furniture whatever it contains, stop showing me its
  // removals." Once said, never-seen text under that rule is not shown.
  it('quiet under a TRUSTED rule, even for text never seen', () => {
    const trustedLog = log([r1], [D.corrected(T09), D.trusted('r1', T2)]);
    const c = current([{ selector: '.ticker', text: 'brand new ticker item' }]);
    expect(gate4(T3, c, [r1], trustedLog, NOTHING_SEEN)).toBeNull();
  });

  it('fires again when the RULE_TRUSTED precedes a RESET — the rule is REVIEWED once more', () => {
    const resetLog = log([r1], [D.corrected(T09), D.trusted('r1', T2), D.reset(), D.corrected(T2)]);
    const reborn = rule('r1', '.ticker', T2, 'd4');
    const c = current([{ selector: '.ticker', text: 'ticker item' }]);
    expect(gate4(T3, c, [reborn], resetLog, NOTHING_SEEN)?.material.removals).toEqual([
      { text: 'ticker item', ruleId: 'r1', selector: '.ticker' },
    ]);
  });

  it('lists only the REVIEWED rule’s removals when a TRUSTED rule also removes never-seen text', () => {
    const mixed = log([r1, r2], [D.corrected(T09), D.trusted('r1', T2)]);
    const c = current([
      { selector: '.ticker', text: 'ticker item' },
      { selector: '.related', text: 'related story' },
    ]);
    expect(gate4(T3, c, [r1, r2], mixed, NOTHING_SEEN)?.material.removals).toEqual([
      { text: 'related story', ruleId: 'r2', selector: '.related' },
    ]);
  });

  it('lists one entry per never-seen segment under one rule', () => {
    const c = current([{ selector: '.ticker', text: 'first item\nsecond item\nthird item' }]);
    expect(gate4(T2, c, [r1], reviewed, NOTHING_SEEN)?.material.removals).toEqual([
      { text: 'first item', ruleId: 'r1', selector: '.ticker' },
      { text: 'second item', ruleId: 'r1', selector: '.ticker' },
      { text: 'third item', ruleId: 'r1', selector: '.ticker' },
    ]);
  });

  // TRUST IS PER RULE. Two REVIEWED rules claiming one segment are two
  // judgements the researcher has yet to make, and they must see both.
  it('lists a segment removed by two REVIEWED rules once per rule', () => {
    const c = current([
      { selector: '.ticker', text: 'shared widget text' },
      { selector: '.related', text: 'shared widget text' },
    ]);
    const listed = [...(gate4(T2, c, [r1, r2], reviewed, NOTHING_SEEN)?.material.removals ?? [])].sort((a, b) =>
      a.ruleId.localeCompare(b.ruleId),
    );
    expect(listed).toEqual([
      { text: 'shared widget text', ruleId: 'r1', selector: '.ticker' },
      { text: 'shared widget text', ruleId: 'r2', selector: '.related' },
    ]);
  });

  it('quiet when the removal differs from a seen segment by whitespace alone', () => {
    const c = current([{ selector: '.ticker', text: 'ticker   item' }]);
    expect(gate4(T2, c, [r1], reviewed, new Set(['ticker item']))).toBeNull();
  });

  it('quiet when the removal is a line of bullets — not a segment', () => {
    const c = current([{ selector: '.ticker', text: '•\n—\n***' }]);
    expect(gate4(T2, c, [r1], reviewed, NOTHING_SEEN)).toBeNull();
  });

  it('fires on a two-letter Hebrew removal — no length threshold', () => {
    const c = current([{ selector: '.ticker', text: 'כן' }]);
    expect(gate4(T2, c, [r1], reviewed, NOTHING_SEEN)?.material.removals).toEqual([
      { text: 'כן', ruleId: 'r1', selector: '.ticker' },
    ]);
  });

  // SEEN IS A SET OF SEGMENTS, not of segment-and-rule pairs — exactly as A3
  // states it. Text a human has looked at on the removed side is seen whichever
  // rule removes it now.
  it('quiet when a seen segment is now removed by a different REVIEWED rule', () => {
    const c = current([{ selector: '.related', text: 'ticker item' }]);
    expect(gate4(T2, c, [r1, r2], reviewed, new Set(['ticker item']))).toBeNull();
  });

  it('quiet when nothing is removed', () => {
    expect(gate4(T2, current([]), [r1], reviewed, NOTHING_SEEN)).toBeNull();
  });

  it('the material is exactly A5’s: { removals }, each entry { text, ruleId, selector }', () => {
    const fired = gate4(T2, current([{ selector: '.ticker', text: 'ticker item' }]), [r1], reviewed, NOTHING_SEEN);
    expect(Object.keys(fired?.material ?? {})).toEqual(['removals']);
    const entry = fired?.material.removals.at(0);
    expect(Object.keys(entry ?? {}).sort()).toEqual(['ruleId', 'selector', 'text']);
  });

  // THE WALK DEFECT, LOUD. Derivation under RULES_IN_FORCE cannot remove under a
  // selector that is no live rule; if it did, the instrument is wrong, and a
  // wrong instrument must not read as a finding about the page.
  it('throws when a removal’s selector is no live rule, naming the selector and the timestamp', () => {
    const c = current([{ selector: '.orphan', text: 'ticker item' }]);
    const attempt = () => gate4(T2, c, [r1], reviewed, NOTHING_SEEN);
    expect(attempt).toThrow('.orphan');
    expect(attempt).toThrow(T2);
  });
});
