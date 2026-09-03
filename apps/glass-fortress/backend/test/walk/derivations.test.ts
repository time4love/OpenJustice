import { chromeRulesetId, chromeTextVersion } from '../../src/lib/chromeRuleset';
import {
  authority,
  rulesInForce,
  rulesetId,
  rulesetIdAt,
  trusted,
  approvedBefore,
  resolved,
  seen,
  stale,
  extractorOf,
  predecessor,
  knownText,
  nextRow,
  type Outcome,
} from '../../src/walk/derivations';
import { T09, T14, T2, T3, T4, T5, BASE, EMPTY_ID, OUTCOMES, rule, D, log, row, ids, sequences } from './fixtures';

// ---------------------------------------------------------------------------
// A3 OF THE FLOWS APPENDIX, AS ASSERTIONS. Step 0 of docs/gf-refactor-plan.md.
//
// This file is RED until step 3 builds `src/walk/derivations`. It was written
// from docs/gf-interaction-flows.md §A3 before that module existed, and the
// module is built to it — not the other way round. Nothing here imports a
// retired module; the walk's source scan holds that from step 0.
//
// EVERY DERIVATION IS A PURE FUNCTION OVER IN-MEMORY ROWS, built by
// ./fixtures. No database, no jsdom, no chain reaches this file.
//
// TWO RULINGS THIS FILE ENCODES, both from the 2026-09-02 contract amendment
// (PR #340), because a test written against the earlier wording would have
// resolved them silently and wrongly:
//
//   - AUTHORITY orders by `sequence`, never `createdAt`. Rows written in one
//     transaction share `now()`, so a timestamp cannot order them.
//   - Every derivation takes `t`, a 14-digit wayback TIMESTAMP, never a day. A
//     rule marked against the 14:00 capture must not govern 09:00 of that day.
// ---------------------------------------------------------------------------

describe('AUTHORITY — decisions after the newest RESET, by sequence', () => {
  it('with no RESET, every decision', () => {
    const decisions = log([], [D.corrected(T2), D.accepted(T2), D.accepted(T3)]);
    expect(sequences(authority(decisions))).toEqual([1, 2, 3]);
  });

  it('with one RESET, only the decisions after it — the RESET itself excluded', () => {
    const decisions = log([], [D.corrected(T2), D.accepted(T2), D.reset(), D.accepted(T3)]);
    expect(sequences(authority(decisions))).toEqual([4]);
  });

  it('with two RESETs, after the newest only', () => {
    const decisions = log([], [D.accepted(T2), D.reset(), D.accepted(T3), D.reset(), D.accepted(T4)]);
    expect(sequences(authority(decisions))).toEqual([5]);
  });
});

describe('RULES_IN_FORCE(t) — created under AUTHORITY, validFrom ≤ t < validTo, not retired', () => {
  it('a rule is in force from its validFrom and not before', () => {
    const rules = [rule('r1', '.ad', T2, 'd1')];
    const decisions = log(rules, [D.corrected(T2)]);
    expect(ids(rulesInForce(rules, decisions, T2))).toEqual(['r1']);
    expect(ids(rulesInForce(rules, decisions, T5))).toEqual(['r1']);
    expect(ids(rulesInForce(rules, decisions, T09))).toEqual([]);
  });

  // THE SAME-DAY CASE, ruled 2026-09-02: validFrom is a timestamp, not a day.
  // On a news page several captures a day is the normal case, and a rule the
  // researcher marked at 14:00 was never judged against 09:00.
  it('a rule created against the 14:00 capture does not govern 09:00 of the same day', () => {
    const rules = [rule('r1', '.ticker', T14, 'd1')];
    const decisions = log(rules, [D.corrected(T14)]);
    expect(ids(rulesInForce(rules, decisions, T14))).toEqual(['r1']);
    expect(ids(rulesInForce(rules, decisions, T09))).toEqual([]);
  });

  it('an ended rule governs up to, and not including, its validTo', () => {
    const rules = [rule('r1', '.ad', T2, 'd1', T4)];
    const decisions = log(rules, [D.corrected(T2), D.ended('r1', T4)]);
    expect(ids(rulesInForce(rules, decisions, T3))).toEqual(['r1']);
    expect(ids(rulesInForce(rules, decisions, T4))).toEqual([]);
    expect(ids(rulesInForce(rules, decisions, T5))).toEqual([]);
  });

  it('a RULE_RETIRED under AUTHORITY removes the rule at every timestamp', () => {
    const rules = [rule('r1', '.ad', T2, 'd1'), rule('r2', '.share', T2, 'd1')];
    const decisions = log(rules, [D.corrected(T2), D.retired('r1', T4)]);
    expect(ids(rulesInForce(rules, decisions, T2))).toEqual(['r2']);
    expect(ids(rulesInForce(rules, decisions, T5))).toEqual(['r2']);
  });

  // THE LOAD-BEARING ASSERTION. Under the earlier wording a reset was a RESET row
  // plus one RULE_RETIRED per rule, ordered by createdAt — and rows written in one
  // transaction share now(), so the retirements would have fallen outside
  // AUTHORITY and the rules would have stayed in force after the reset. The
  // ruling: a rule's authority IS its creating decision's, so a RESET is ONE row
  // and the predicate alone empties the ruleset. This asserts both halves: empty
  // at every t, AND no RULE_RETIRED row anywhere in the log.
  it('after a RESET, RULES_IN_FORCE is empty at every timestamp, with no RULE_RETIRED row in the log', () => {
    const rules = [rule('r1', '.ad', T09, 'd1'), rule('r2', '.share', T2, 'd3')];
    const decisions = log(rules, [D.corrected(T09), D.accepted(T09), D.corrected(T2), D.accepted(T2), D.reset()]);
    expect(decisions.some((d) => d.type === 'RULE_RETIRED')).toBe(false);
    for (const t of [T09, T14, T2, T3, T5]) {
      expect(ids(rulesInForce(rules, decisions, t))).toEqual([]);
    }
  });

  it('a rule created after the RESET is in force — a reset ends the past, not the future', () => {
    const rules = [rule('r1', '.ad', T09, 'd1'), rule('r2', '.share', T2, 'd3')];
    const decisions = log(rules, [D.corrected(T09), D.reset(), D.corrected(T2)]);
    expect(ids(rulesInForce(rules, decisions, T5))).toEqual(['r2']);
  });

  // A rule created after the RESET is under AUTHORITY, so only a RULE_RETIRED
  // under the same AUTHORITY can remove it. (A rule created BEFORE the reset is
  // out by its creating decision alone, which is the assertion above this one.)
  it('a rule created after the RESET and then retired is out of force', () => {
    const rules = [rule('r1', '.ad', T09, 'd1'), rule('r2', '.share', T2, 'd3')];
    const decisions = log(rules, [D.corrected(T09), D.reset(), D.corrected(T2), D.retired('r2', T4)]);
    expect(ids(rulesInForce(rules, decisions, T5))).toEqual([]);
  });
});

describe('RULESET_ID — sha256 over the sorted, de-duplicated selectors, first 8 hex', () => {
  it('is the reused chromeRulesetId of the same set', () => {
    expect(rulesetId(['.a', '.b'])).toBe(chromeRulesetId({ selectors: ['.a', '.b'] }));
  });

  it('is order-independent and duplicate-insensitive', () => {
    expect(rulesetId(['.b', '.a', '.a'])).toBe(rulesetId(['.a', '.b']));
  });

  it('the empty set has an id, and it is not any one-rule id', () => {
    expect(rulesetId([])).toBe('e3b0c442');
    expect(rulesetId([])).toBe(EMPTY_ID);
    expect(rulesetId([])).not.toBe(rulesetId(['.a']));
  });

  it('RULESET_ID(page, t) is the id over RULES_IN_FORCE(t), so a later rule does not change an earlier id', () => {
    const rules = [rule('r1', '.ad', T2, 'd1'), rule('r2', '.share', T4, 'd2')];
    const decisions = log(rules, [D.corrected(T2), D.corrected(T4)]);
    expect(rulesetIdAt(rules, decisions, T09)).toBe(EMPTY_ID);
    expect(rulesetIdAt(rules, decisions, T3)).toBe(rulesetId(['.ad']));
    expect(rulesetIdAt(rules, decisions, T5)).toBe(rulesetId(['.ad', '.share']));
  });
});

describe('TRUSTED — a RULE_TRUSTED under AUTHORITY; REVIEWED otherwise', () => {
  const r1 = rule('r1', '.ticker', T2, 'd1');

  it('REVIEWED with no RULE_TRUSTED', () => {
    expect(trusted(r1, log([r1], [D.corrected(T2)]))).toBe('REVIEWED');
  });

  it('TRUSTED once a RULE_TRUSTED names it', () => {
    expect(trusted(r1, log([r1], [D.corrected(T2), D.trusted('r1', T3)]))).toBe('TRUSTED');
  });

  it('REVIEWED again when the RULE_TRUSTED precedes a RESET', () => {
    expect(trusted(r1, log([r1], [D.corrected(T2), D.trusted('r1', T3), D.reset()]))).toBe('REVIEWED');
  });
});

describe('APPROVED_BEFORE(t) — a CAPTURE_ACCEPTED under AUTHORITY at a timestamp ≤ t', () => {
  it('true from the accepted capture onwards, false before it', () => {
    const decisions = log([], [D.accepted(T2)]);
    expect(approvedBefore(decisions, T2)).toBe(true);
    expect(approvedBefore(decisions, T5)).toBe(true);
    expect(approvedBefore(decisions, T14)).toBe(false);
  });

  it('false with no decision at all', () => {
    expect(approvedBefore([], T5)).toBe(false);
  });

  // A skip is a verdict that the capture does not speak. It approves no ruleset,
  // so Gate 0 still fires on the next capture.
  it('a CAPTURE_SKIPPED does not count', () => {
    expect(approvedBefore(log([], [D.skipped(T2)]), T5)).toBe(false);
  });

  // Flow 3: after a reset the first capture stops on Gate 0 like any page's first.
  it('an acceptance before a RESET does not count', () => {
    expect(approvedBefore(log([], [D.accepted(T2), D.reset()]), T5)).toBe(false);
  });
});

describe('RESOLVED(row) — an ACCEPTED or SKIPPED whose rulesetId is RULESET_ID at its timestamp now', () => {
  const subject = row(T2, 'PENDING_JUDGEMENT');

  it('true on an acceptance carrying the ruleset now in force at its timestamp', () => {
    const rules = [rule('r1', '.ad', T2, 'd1')];
    const decisions = log(rules, [D.corrected(T2), D.accepted(T2)]);
    expect(resolved(subject, rules, decisions)).toBe(true);
  });

  it('true on a skip the same way', () => {
    const rules = [rule('r1', '.ad', T2, 'd1')];
    expect(resolved(subject, rules, log(rules, [D.corrected(T2), D.skipped(T2)]))).toBe(true);
  });

  it('false once a later correction changes the ruleset at its timestamp', () => {
    const rules = [rule('r1', '.ad', T2, 'd1'), rule('r2', '.share', T09, 'd3')];
    const decisions = log(rules, [D.corrected(T2), D.accepted(T2), D.corrected(T09)]);
    expect(resolved(subject, rules, decisions)).toBe(false);
  });

  it('still true when the later correction is after its timestamp', () => {
    const rules = [rule('r1', '.ad', T2, 'd1'), rule('r2', '.share', T4, 'd3')];
    const decisions = log(rules, [D.corrected(T2), D.accepted(T2), D.corrected(T4)]);
    expect(resolved(subject, rules, decisions)).toBe(true);
  });

  // The Rule row is static in a fixture, so its validTo is already set when the
  // acceptance is stamped; the acceptance carries the id it WAS stamped with —
  // r1 in force — explicitly.
  it('false once a rule in force at its timestamp is ended there or before', () => {
    const rules = [rule('r1', '.ad', T09, 'd1', T2)];
    const decisions = log(rules, [D.corrected(T09), D.accepted(T2, rulesetId(['.ad'])), D.ended('r1', T2)]);
    expect(resolved(subject, rules, decisions)).toBe(false);
  });

  // Ruled 2026-09-02: trust changes no text, so it never un-resolves.
  it('a RULE_TRUSTED after the acceptance leaves it resolved', () => {
    const rules = [rule('r1', '.ad', T2, 'd1')];
    const decisions = log(rules, [D.corrected(T2), D.accepted(T2), D.trusted('r1', T3)]);
    expect(resolved(subject, rules, decisions)).toBe(true);
  });

  it('false when the acceptance precedes a RESET', () => {
    const rules = [rule('r1', '.ad', T2, 'd1')];
    expect(resolved(subject, rules, log(rules, [D.corrected(T2), D.accepted(T2), D.reset()]))).toBe(false);
  });

  // The decision's OWN stored rulesetId is what is read — never a recomputation
  // of what it would have been. A decision stamped with a foreign id resolves
  // nothing.
  it('reads the decision’s stored rulesetId, not a recomputed one', () => {
    const rules = [rule('r1', '.ad', T2, 'd1')];
    const decisions = log(rules, [D.corrected(T2), D.accepted(T2, 'deadbeef')]);
    expect(resolved(subject, rules, decisions)).toBe(false);
  });

  it('false with no decision naming the capture', () => {
    const rules = [rule('r1', '.ad', T2, 'd1')];
    expect(resolved(subject, rules, log(rules, [D.corrected(T2), D.accepted(T3)]))).toBe(false);
  });
});

describe('SEEN — removed-side segments of judged ACQUIRED captures, plus the PENDING one', () => {
  const judged = (outcome: Outcome, removed: string[]) => ({ waybackTimestamp: T2, outcome, removed });

  it('an ACQUIRED capture with a decision under AUTHORITY contributes its removed side', () => {
    const decisions = log([], [D.accepted(T2)]);
    const set = seen([judged('ACQUIRED', ['ticker line', 'related box'])], decisions);
    expect(set).toBeInstanceOf(Set);
    expect(set.has('ticker line')).toBe(true);
    expect(set.has('related box')).toBe(true);
  });

  it('an ACQUIRED capture with no decision contributes nothing', () => {
    expect(seen([judged('ACQUIRED', ['ticker line'])], []).size).toBe(0);
  });

  it('the PENDING_JUDGEMENT capture being judged contributes, decision or not', () => {
    expect(seen([judged('PENDING_JUDGEMENT', ['ticker line'])], []).has('ticker line')).toBe(true);
  });

  // A SKIPPED capture holds no bytes, so its removed side cannot be recomputed;
  // its removals may be shown again. Ruled 2026-09-02.
  it('a SKIPPED capture contributes nothing, even with its CAPTURE_SKIPPED in the log', () => {
    const decisions = log([], [D.skipped(T2)]);
    expect(seen([judged('SKIPPED', ['ticker line'])], decisions).size).toBe(0);
  });

  it('nothing from before a RESET', () => {
    const decisions = log([], [D.accepted(T2), D.reset()]);
    expect(seen([judged('ACQUIRED', ['ticker line'])], decisions).size).toBe(0);
  });

  it('exhaustively: only ACQUIRED (with a decision) and PENDING_JUDGEMENT contribute', () => {
    const decisions = log([], [D.accepted(T2)]);
    for (const outcome of OUTCOMES) {
      const contributes = seen([judged(outcome, ['segment'])], decisions).has('segment');
      expect({ outcome, contributes }).toEqual({
        outcome,
        contributes: outcome === 'ACQUIRED' || outcome === 'PENDING_JUDGEMENT',
      });
    }
  });
});

describe('STALE(row) — derived under a ruleset or extractor that is no longer the one for its timestamp', () => {
  it('an ACQUIRED row under the current ruleset and extractor is not stale', () => {
    expect(stale(row(T2, 'ACQUIRED'), [], [], BASE)).toBe(false);
  });

  it('a new rule with validFrom ≤ its timestamp makes it stale', () => {
    const rules = [rule('r1', '.ad', T09, 'd1')];
    expect(stale(row(T2, 'ACQUIRED'), rules, log(rules, [D.corrected(T09)]), BASE)).toBe(true);
  });

  it('a new rule with validFrom > its timestamp does not', () => {
    const rules = [rule('r1', '.ad', T4, 'd1')];
    expect(stale(row(T2, 'ACQUIRED'), rules, log(rules, [D.corrected(T4)]), BASE)).toBe(false);
  });

  it('a row whose rulesetId is the one now in force is not stale', () => {
    const rules = [rule('r1', '.ad', T09, 'd1')];
    const current = row(T2, 'ACQUIRED', { rulesetId: rulesetId(['.ad']) });
    expect(stale(current, rules, log(rules, [D.corrected(T09)]), BASE)).toBe(false);
  });

  it('an older extractor makes it stale', () => {
    expect(stale(row(T2, 'ACQUIRED', { version: 'v1-older-extractor' }), [], [], BASE)).toBe(true);
  });

  // The version a non-empty ruleset produces is `<base>+chrome-<id>`, per the
  // reused chromeTextVersion. The EXTRACTOR is the base; the suffix names the
  // ruleset, which the rulesetId axis already checks.
  it('the ruleset suffix on the version is not an extractor change', () => {
    const rules = [rule('r1', '.ad', T09, 'd1')];
    const version = chromeTextVersion(BASE, { selectors: ['.ad'] });
    expect(extractorOf(version)).toBe(BASE);
    expect(extractorOf(BASE)).toBe(BASE);
    const current = row(T2, 'ACQUIRED', { rulesetId: rulesetId(['.ad']), version });
    expect(stale(current, rules, log(rules, [D.corrected(T09)]), BASE)).toBe(false);
  });

  it('a DUPLICATE goes stale on either axis, exactly as an ACQUIRED does', () => {
    const rules = [rule('r1', '.ad', T09, 'd1')];
    expect(stale(row(T2, 'DUPLICATE'), rules, log(rules, [D.corrected(T09)]), BASE)).toBe(true);
    expect(stale(row(T2, 'DUPLICATE', { version: 'v1-older-extractor' }), [], [], BASE)).toBe(true);
    expect(stale(row(T2, 'DUPLICATE'), [], [], BASE)).toBe(false);
  });

  it('exhaustively: no other outcome is ever stale, whatever its ruleset or version says', () => {
    for (const outcome of OUTCOMES) {
      const mismatched = row(T2, outcome, { rulesetId: 'deadbeef', version: 'v1-older-extractor' });
      expect({ outcome, stale: stale(mismatched, [], [], BASE) }).toEqual({
        outcome,
        stale: outcome === 'ACQUIRED' || outcome === 'DUPLICATE',
      });
    }
  });
});

describe('PREDECESSOR(row) — the latest earlier row in timestamp order with outcome ACQUIRED', () => {
  it('null for the first capture', () => {
    const first = row(T09, 'UNFETCHED');
    expect(predecessor([first, row(T2, 'ACQUIRED')], first)).toBeNull();
  });

  it('the nearest earlier ACQUIRED, not the earliest', () => {
    const subject = row(T3, 'UNFETCHED');
    const rows = [row(T09, 'ACQUIRED'), row(T2, 'ACQUIRED'), subject];
    expect(predecessor(rows, subject)?.waybackTimestamp).toBe(T2);
  });

  // Flow 3 re-walks a STALE ACQUIRED row; its predecessor is the row before it,
  // never itself.
  it('an ACQUIRED subject is not its own predecessor — the re-walk case', () => {
    const subject = row(T2, 'ACQUIRED');
    const rows = [row(T09, 'ACQUIRED'), subject, row(T3, 'ACQUIRED')];
    expect(predecessor(rows, subject)?.waybackTimestamp).toBe(T09);
  });

  it('a later ACQUIRED is never a predecessor — the gap-fill case', () => {
    const gap = row(T2, 'UNFETCHED');
    expect(predecessor([row(T09, 'ACQUIRED'), gap, row(T3, 'ACQUIRED')], gap)?.waybackTimestamp).toBe(T09);
  });

  it('timestamp order, not insertion order', () => {
    const subject = row(T3, 'UNFETCHED');
    const rows = [subject, row(T2, 'ACQUIRED'), row(T09, 'ACQUIRED')];
    expect(predecessor(rows, subject)?.waybackTimestamp).toBe(T2);
  });

  it('exhaustively: every non-ACQUIRED outcome in between is stepped over', () => {
    const subject = row(T3, 'UNFETCHED');
    for (const outcome of OUTCOMES.filter((o) => o !== 'ACQUIRED')) {
      const rows = [row(T09, 'ACQUIRED'), row(T2, outcome), subject];
      expect({ outcome, predecessor: predecessor(rows, subject)?.waybackTimestamp }).toEqual({
        outcome,
        predecessor: T09,
      });
    }
  });
});

describe('KNOWN_TEXT(row) — ACQUIRED, DUPLICATE or IDENTICAL', () => {
  it('exhaustively over the seven outcomes', () => {
    for (const outcome of OUTCOMES) {
      expect({ outcome, known: knownText(row(T2, outcome)) }).toEqual({
        outcome,
        known: outcome === 'ACQUIRED' || outcome === 'DUPLICATE' || outcome === 'IDENTICAL',
      });
    }
  });
});

describe('NEXT_ROW — the earliest row in timestamp order that is UNFETCHED, PENDING_JUDGEMENT or STALE', () => {
  it('the earliest UNFETCHED after the acquired stretch', () => {
    const rows = [row(T09, 'ACQUIRED'), row(T2, 'UNFETCHED'), row(T3, 'UNFETCHED')];
    expect(nextRow(rows, [], [], BASE)?.waybackTimestamp).toBe(T2);
  });

  it('an earlier PENDING_JUDGEMENT beats a later UNFETCHED — timestamp order, not outcome priority', () => {
    const rows = [row(T3, 'UNFETCHED'), row(T2, 'PENDING_JUDGEMENT')];
    expect(nextRow(rows, [], [], BASE)?.waybackTimestamp).toBe(T2);
  });

  it('an earlier STALE ACQUIRED beats a later UNFETCHED — the re-walk needs no starting parameter', () => {
    const rules = [rule('r1', '.ad', T09, 'd1')];
    const rows = [row(T2, 'ACQUIRED'), row(T3, 'UNFETCHED')];
    expect(nextRow(rows, rules, log(rules, [D.corrected(T09)]), BASE)?.waybackTimestamp).toBe(T2);
  });

  it('null when every row is terminal and current', () => {
    const rows = [
      row(T09, 'ACQUIRED'),
      row(T14, 'IDENTICAL'),
      row(T2, 'DUPLICATE'),
      row(T3, 'SKIPPED'),
      row(T4, 'UNSERVABLE'),
    ];
    expect(nextRow(rows, [], [], BASE)).toBeNull();
  });

  it('timestamp order, not insertion order', () => {
    const rows = [row(T3, 'UNFETCHED'), row(T2, 'UNFETCHED'), row(T09, 'ACQUIRED')];
    expect(nextRow(rows, [], [], BASE)?.waybackTimestamp).toBe(T2);
  });
});
