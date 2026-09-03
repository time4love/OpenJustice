import { chromeRulesetId } from '../../src/lib/chromeRuleset';
import {
  rulesetIdAt,
  type Rule,
  type Decision,
  type DecisionType,
  type WorkListRow,
  type Outcome,
} from '../../src/walk/derivations';

// ---------------------------------------------------------------------------
// THE WALK'S FIXTURES, shared by every file under test/walk.
//
// In-memory rows in the minimal shapes `src/walk/derivations` declares — a
// Prisma row satisfies them structurally, so the same builders serve the pure
// predicates here and, later, the tests that seed a database. Nothing in this
// file reaches a database, jsdom or a chain, and nothing imports a retired
// module.
//
// Two rulings from the 2026-09-02 contract amendment (PR #340) shape these
// builders: a decision's order is its `sequence`, never `createdAt`; and every
// timestamp is a 14-digit wayback TIMESTAMP, never a day.
// ---------------------------------------------------------------------------

/** Timestamps in walk order. `T09` and `T14` are the same day. */
export const T09 = '20200301090000';
export const T14 = '20200301140000';
export const T2 = '20200302120000';
export const T3 = '20200303120000';
export const T4 = '20200304120000';
export const T5 = '20200305120000';

/** The current extractor's base version in these fixtures — a fixture, not the constant. */
export const BASE = 'v2-fixture-extractor';
export const EMPTY_ID = chromeRulesetId({ selectors: [] });

// A missing key here fails to compile, so an exhaustive assertion cannot
// silently cover six of seven outcomes when the module adds one.
const EVERY_OUTCOME: Record<Outcome, null> = {
  UNFETCHED: null,
  UNSERVABLE: null,
  IDENTICAL: null,
  DUPLICATE: null,
  ACQUIRED: null,
  PENDING_JUDGEMENT: null,
  SKIPPED: null,
};
export const OUTCOMES = Object.keys(EVERY_OUTCOME) as Outcome[];

export function rule(
  id: string,
  selector: string,
  validFrom: string,
  createdByDecisionId: string,
  validTo: string | null = null,
): Rule {
  return { id, selector, validFrom, validTo, createdByDecisionId };
}

/** A log entry before `log()` assigns its sequence and id. */
export interface Entry {
  type: DecisionType;
  waybackTimestamp?: string;
  ruleId?: string;
  rulesetId?: string;
}

export const D = {
  corrected: (ts: string): Entry => ({ type: 'RULESET_CORRECTED', waybackTimestamp: ts }),
  accepted: (ts: string, rulesetId?: string): Entry =>
    ({ type: 'CAPTURE_ACCEPTED', waybackTimestamp: ts, rulesetId }),
  skipped: (ts: string, rulesetId?: string): Entry =>
    ({ type: 'CAPTURE_SKIPPED', waybackTimestamp: ts, rulesetId }),
  trusted: (ruleId: string, ts: string): Entry => ({ type: 'RULE_TRUSTED', waybackTimestamp: ts, ruleId }),
  ended: (ruleId: string, ts: string): Entry => ({ type: 'RULE_ENDED', waybackTimestamp: ts, ruleId }),
  retired: (ruleId: string, ts: string): Entry => ({ type: 'RULE_RETIRED', waybackTimestamp: ts, ruleId }),
  reset: (): Entry => ({ type: 'RESET' }),
};

/**
 * The page's log: sequence is position, id is `d<sequence>` so a rule can name
 * its creating decision. CAPTURE_ACCEPTED and CAPTURE_SKIPPED carry the
 * RULESET_ID at their capture's timestamp AS OF THAT POINT IN THE LOG, exactly
 * as the tool writes it — unless a test supplies one, which is how a mismatch is
 * made.
 */
export function log(rules: Rule[], entries: Entry[]): Decision[] {
  const out: Decision[] = [];
  entries.forEach((entry, index) => {
    const sequence = index + 1;
    const ts = entry.waybackTimestamp ?? null;
    const carriesRuleset = entry.type === 'CAPTURE_ACCEPTED' || entry.type === 'CAPTURE_SKIPPED';
    const stampedRuleset = carriesRuleset && ts !== null ? rulesetIdAt(rules, out, ts) : null;
    out.push({
      id: `d${sequence}`,
      sequence,
      type: entry.type,
      waybackTimestamp: ts,
      ruleId: entry.ruleId ?? null,
      rulesetId: entry.rulesetId ?? stampedRuleset,
    });
  });
  return out;
}

export function row(
  ts: string,
  outcome: Outcome,
  fields: { rulesetId?: string; version?: string } = {},
): WorkListRow {
  const derived = outcome === 'ACQUIRED' || outcome === 'DUPLICATE';
  return {
    waybackTimestamp: ts,
    outcome,
    rulesetId: fields.rulesetId ?? (derived ? EMPTY_ID : null),
    textExtractionVersion: fields.version ?? (derived ? BASE : null),
  };
}

export const ids = (rules: readonly Rule[]): string[] => rules.map((r) => r.id).sort();
export const sequences = (decisions: readonly Decision[]): number[] => decisions.map((d) => d.sequence);
