import { chromeRulesetId } from '../lib/chromeRuleset';

// ---------------------------------------------------------------------------
// A3 OF docs/gf-interaction-flows.md — the derivations, as pure functions over
// in-memory rows. Built to test/walk/derivations.test.ts, never the other way.
//
// STEP 2 BUILDS THE SUBSET THE SURVEY NEEDS: AUTHORITY, RULES_IN_FORCE and
// RULESET_ID, with the row shapes every walk file's fixtures share. The legacy
// join stamps a joined row with RULESET_ID(page, t), and that is the whole of
// the survey's dependency on this module. Step 3 completes it — TRUSTED,
// APPROVED_BEFORE, RESOLVED, SEEN, STALE, PREDECESSOR, KNOWN_TEXT, NEXT_ROW —
// and derivations.test.ts stays red on those imports until then.
//
// The shapes are MINIMAL on purpose: a Prisma row satisfies each structurally,
// so the same predicate serves the tests' fixtures and the tools' query
// results. Nothing here reaches a database, jsdom or a chain.
// ---------------------------------------------------------------------------

/** The seven outcomes of a work-list row (A2). */
export type Outcome =
  | 'UNFETCHED'
  | 'UNSERVABLE'
  | 'IDENTICAL'
  | 'DUPLICATE'
  | 'ACQUIRED'
  | 'PENDING_JUDGEMENT'
  | 'SKIPPED';

/** The eight decision types of the page's log (A2). */
export type DecisionType =
  | 'RULESET_CORRECTED'
  | 'CAPTURE_ACCEPTED'
  | 'CAPTURE_SKIPPED'
  | 'RULE_TRUSTED'
  | 'RULE_ENDED'
  | 'RULE_RETIRED'
  | 'RULE_EXTENDED'
  | 'RESET';

export interface Rule {
  id: string;
  selector: string;
  /** waybackTimestamp of the capture it was created against; in force from here. */
  validFrom: string;
  /** waybackTimestamp set by RULE_ENDED; in force strictly before it. Null while live. */
  validTo: string | null;
  /** A rule's AUTHORITY is its creating decision's. */
  createdByDecisionId: string;
}

export interface Decision {
  id: string;
  /** The page's order. SEQUENCE, never createdAt: rows written in one transaction share now(). */
  sequence: number;
  type: DecisionType;
  waybackTimestamp: string | null;
  ruleId: string | null;
  rulesetId: string | null;
}

export interface WorkListRow {
  waybackTimestamp: string;
  outcome: Outcome;
  rulesetId: string | null;
  textExtractionVersion: string | null;
}

/**
 * AUTHORITY(page): the decisions with sequence greater than the newest RESET's;
 * every decision when there is none. The RESET itself is excluded — it is the
 * boundary, not a decision under its own authority.
 *
 * The "none" branch is literal, not a sentinel: A2 fixes no origin for the
 * sequence, so "greater than 0" would drop a first decision numbered 0.
 */
export function authority(decisions: readonly Decision[]): Decision[] {
  const resets = decisions.filter((d) => d.type === 'RESET').map((d) => d.sequence);
  if (resets.length === 0) return [...decisions];
  const newestReset = Math.max(...resets);
  return decisions.filter((d) => d.sequence > newestReset);
}

/**
 * RULES_IN_FORCE(page, t): rules whose creating decision EXISTS in the log
 * under AUTHORITY, with validFrom ≤ t and (validTo is null or t < validTo),
 * and no RULE_RETIRED naming them under AUTHORITY.
 *
 * `t` is a 14-digit wayback timestamp, never a day: a rule marked against the
 * 14:00 capture does not govern 09:00 of the same day. Timestamps of equal
 * length compare correctly as strings.
 *
 * After a RESET this is empty at every t with no RULE_RETIRED row written —
 * the rule's authority IS its creating decision's, and the reset moved the
 * boundary past it.
 */
export function rulesInForce(rules: readonly Rule[], decisions: readonly Decision[], t: string): Rule[] {
  const underAuthority = authority(decisions);
  const creating = new Set(underAuthority.map((d) => d.id));
  const retired = new Set(
    underAuthority.filter((d) => d.type === 'RULE_RETIRED' && d.ruleId !== null).map((d) => d.ruleId),
  );
  return rules.filter(
    (r) =>
      creating.has(r.createdByDecisionId) &&
      !retired.has(r.id) &&
      r.validFrom <= t &&
      (r.validTo === null || t < r.validTo),
  );
}

/**
 * RULESET_ID over a set of selectors: sha256 of the sorted, de-duplicated
 * selectors, first 8 hex — the reused `chromeRulesetId`, so the walk's id and
 * the extractor's are one function. The empty set has an id: `e3b0c442`.
 */
export function rulesetId(selectors: readonly string[]): string {
  return chromeRulesetId({ selectors: [...selectors] });
}

/** RULESET_ID(page, t): the id over RULES_IN_FORCE(page, t). */
export function rulesetIdAt(rules: readonly Rule[], decisions: readonly Decision[], t: string): string {
  return rulesetId(rulesInForce(rules, decisions, t).map((r) => r.selector));
}
