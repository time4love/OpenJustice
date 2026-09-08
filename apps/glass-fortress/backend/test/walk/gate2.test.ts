import { gate2, type CaptureMatches } from '../../src/walk/gates';
import type { Decision, Rule } from '../../src/walk/derivations';
import { T09, T2, T3, T4, rule, D, log } from './fixtures';

// ---------------------------------------------------------------------------
// GATE 2 — A RULE WENT SILENT. A4 of the flows appendix:
//
//     GATE 2   ∃ rule r in force for both timestamps:
//              RuleMatch(r, p) > 0 AND RuleMatch(r, c) = 0
//
// A rule that matched the previous capture and matches nothing here is a rule
// the page may have stopped describing — or furniture that legitimately left.
// The gate cannot tell which, so it stops. Its false alarm is accepted and
// cheap: a CONTINUE at that stop is the last stop for that rule, because the
// next capture's predecessor did not match either.
//
// `RuleMatch` is one row per rule per capture examined, keyed to the RULE (I12:
// keyed to a ruleset hash, every correction orphaned every observation). The
// gate reads two captures' rows and the rules in force at both timestamps,
// which it derives itself from the log.
//
// A RULE IN FORCE WITH NO ROW IS A WALK DEFECT, ruled 2026-09-02. The walk
// writes a row for every rule in force on every capture it examines. A missing
// one is not "matched nothing" and not "nothing to check": the gate THROWS,
// naming the rule and the timestamp. A defect in the instrument must never read
// as a finding about the page, in either direction.
//
// RED until step 4 builds `src/walk/gates`.
// ---------------------------------------------------------------------------

interface Matched {
  ruleId: string;
  matchedNodes: number;
}

const capture = (waybackTimestamp: string, matches: readonly Matched[] = []) =>
  ({ waybackTimestamp, matches });
const m = (ruleId: string, matchedNodes: number): Matched => ({ ruleId, matchedNodes });
/** No silence judged — the fresh-walk case every case below this helper describes. */
const NONE: ReadonlySet<string> = new Set();
const gate2Fresh = (rules: readonly Rule[], decisions: readonly Decision[], p: CaptureMatches, c: CaptureMatches) =>
  gate2(rules, decisions, p, c, NONE);

const r1 = rule('r1', '.ticker', T09, 'd1');
const r2 = rule('r2', '.related', T09, 'd1');
const oneRule = [r1];
const oneRuleLog = log(oneRule, [D.corrected(T09)]);

describe('Gate 2 — a rule that matched the previous capture matches nothing here', () => {
  it('quiet when every rule that matched the predecessor matches this capture', () => {
    expect(gate2Fresh(oneRule, oneRuleLog, capture(T2, [m('r1', 3)]), capture(T3, [m('r1', 2)]))).toBeNull();
  });

  it('fires when a rule matched the predecessor and matches nothing here, naming it and its count', () => {
    expect(gate2Fresh(oneRule, oneRuleLog, capture(T2, [m('r1', 3)]), capture(T3, [m('r1', 0)]))).toEqual({
      gate: 2,
      material: { rules: [{ ruleId: 'r1', selector: '.ticker', matchedOnPredecessor: 3 }] },
    });
  });

  // Flow 2: "the rule does not fire again". Silent before and silent now is
  // not a transition, so a CONTINUE at the first stop is the last stop for it.
  it('quiet when the rule matched neither — a silent rule stays silent', () => {
    expect(gate2Fresh(oneRule, oneRuleLog, capture(T2, [m('r1', 0)]), capture(T3, [m('r1', 0)]))).toBeNull();
  });

  it('quiet when a rule matches here but not the predecessor — waking is not going silent', () => {
    expect(gate2Fresh(oneRule, oneRuleLog, capture(T2, [m('r1', 0)]), capture(T3, [m('r1', 4)]))).toBeNull();
  });

  // "In force for BOTH timestamps." A rule created between the two captures has
  // no predecessor it governed, whatever a stray row on the predecessor says.
  it('quiet when the rule is in force here but was created after the predecessor', () => {
    const late = [rule('r1', '.ticker', T3, 'd1')];
    const decisions = log(late, [D.corrected(T3)]);
    expect(gate2Fresh(late, decisions, capture(T2, [m('r1', 3)]), capture(T4, [m('r1', 0)]))).toBeNull();
  });

  // A rule a human ended is not a rule gone silent. It is not in force here, so
  // no row is owed for it here either.
  it('quiet when the rule was in force on the predecessor and ended at or before this capture', () => {
    const ended = [rule('r1', '.ticker', T09, 'd1', T4)];
    const decisions = log(ended, [D.corrected(T09), D.ended('r1', T4)]);
    expect(gate2Fresh(ended, decisions, capture(T2, [m('r1', 3)]), capture(T4))).toBeNull();
  });

  it('quiet when the rule is retired under AUTHORITY, whatever its rows say', () => {
    const decisions = log(oneRule, [D.corrected(T09), D.retired('r1', T2)]);
    expect(gate2Fresh(oneRule, decisions, capture(T2, [m('r1', 3)]), capture(T3, [m('r1', 0)]))).toBeNull();
  });

  it('quiet with no rule in force at all', () => {
    expect(gate2Fresh([], [], capture(T2), capture(T3))).toBeNull();
  });

  it('lists every silent rule at once, each with its own predecessor count', () => {
    const two = [r1, r2];
    const decisions = log(two, [D.corrected(T09)]);
    const fired = gate2Fresh(two, decisions, capture(T2, [m('r1', 3), m('r2', 7)]), capture(T3, [m('r1', 0), m('r2', 0)]));
    const listed = [...(fired?.material.rules ?? [])].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
    expect(listed).toEqual([
      { ruleId: 'r1', selector: '.ticker', matchedOnPredecessor: 3 },
      { ruleId: 'r2', selector: '.related', matchedOnPredecessor: 7 },
    ]);
  });

  it('the material is exactly A5’s: { rules }, each entry { ruleId, selector, matchedOnPredecessor }', () => {
    const fired = gate2Fresh(oneRule, oneRuleLog, capture(T2, [m('r1', 3)]), capture(T3, [m('r1', 0)]));
    expect(Object.keys(fired?.material ?? {})).toEqual(['rules']);
    const entry = fired?.material.rules.at(0);
    expect(Object.keys(entry ?? {}).sort()).toEqual(['matchedOnPredecessor', 'ruleId', 'selector']);
  });

  // THE WALK DEFECT, LOUD. Never 0, never quiet.
  it('throws when a rule in force here has no row for this capture, naming the rule and the timestamp', () => {
    const attempt = () => gate2Fresh(oneRule, oneRuleLog, capture(T2, [m('r1', 3)]), capture(T3));
    expect(attempt).toThrow('r1');
    expect(attempt).toThrow(T3);
  });

  it('throws when a rule in force on the predecessor has no row for it, naming the rule and the timestamp', () => {
    const attempt = () => gate2Fresh(oneRule, oneRuleLog, capture(T2), capture(T3, [m('r1', 0)]));
    expect(attempt).toThrow('r1');
    expect(attempt).toThrow(T2);
  });
});

// A SILENCE A HUMAN HAS ALREADY JUDGED DOES NOT FIRE AGAIN — A4, amended
// 2026-09-08 from the first re-walk driven from the chat: ending one rule
// un-resolved every later capture, and the re-walk re-fired at 2021-06-12 the
// same ten silences the first walk had already put to the researcher. The
// gate takes the judged set folded by `judgedSilences` and lists nothing from
// it; the count is still owed for every rule in force, judged or not.
describe('Gate 2 — a silence a human has already judged does not fire again (amended 2026-09-08)', () => {
  it('lists nothing when the only silent rule is judged', () => {
    expect(gate2(oneRule, oneRuleLog, capture(T2, [m('r1', 3)]), capture(T3, [m('r1', 0)]), new Set(['r1']))).toBeNull();
  });

  it('lists only the unjudged silent rule beside a judged one', () => {
    const twoRules = [r1, r2];
    const twoRuleLog = log(twoRules, [D.corrected(T09)]);
    expect(
      gate2(twoRules, twoRuleLog, capture(T2, [m('r1', 3), m('r2', 1)]), capture(T3, [m('r1', 0), m('r2', 0)]), new Set(['r1'])),
    ).toEqual({
      gate: 2,
      material: { rules: [{ ruleId: 'r2', selector: '.related', matchedOnPredecessor: 1 }] },
    });
  });

  it('a judged rule is still owed its count — the defect check runs before the filter', () => {
    const attempt = () => gate2(oneRule, oneRuleLog, capture(T2, [m('r1', 3)]), capture(T3), new Set(['r1']));
    expect(attempt).toThrow('r1');
    expect(attempt).toThrow(T3);
  });
});
