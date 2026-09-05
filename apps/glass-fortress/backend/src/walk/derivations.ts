import { chromeRulesetId } from '../lib/chromeRuleset';

// ---------------------------------------------------------------------------
// A3 OF docs/gf-interaction-flows.md — the derivations, as pure functions over
// in-memory rows. Built to test/walk/derivations.test.ts, never the other way.
//
// STEP 2 BUILT THE SUBSET THE SURVEY NEEDS — AUTHORITY, RULES_IN_FORCE and
// RULESET_ID; step 3 completes the appendix: TRUSTED, APPROVED_BEFORE,
// RESOLVED, SEEN, STALE, PREDECESSOR, KNOWN_TEXT, NEXT_ROW, and the
// extractor-of-a-version read STALE's second axis needs. Every one is a pure
// function over rows; the CURRENT extractor is a parameter, never read here,
// so this module still reaches no constant of the extraction pipeline.
//
// The shapes are MINIMAL on purpose: a Prisma row satisfies each structurally,
// so the same predicate serves the tests' fixtures and the tools' query
// results. Nothing here reaches a database, jsdom or a chain.
// ---------------------------------------------------------------------------

/**
 * The seven outcomes of a work-list row (A2) — ONE list, the type derived from
 * it, so a schema, a filter and a zero-filled count all read the same seven
 * and none can drop one silently (ruled 2026-09-05).
 */
export const OUTCOMES = ['UNFETCHED', 'UNSERVABLE', 'IDENTICAL', 'DUPLICATE', 'ACQUIRED', 'PENDING_JUDGEMENT', 'SKIPPED'] as const;
export type Outcome = (typeof OUTCOMES)[number];

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
 * RULES_UNDER_AUTHORITY(page): rules whose creating decision EXISTS in the log
 * under AUTHORITY and that no RULE_RETIRED under AUTHORITY names — in force,
 * ended, or not yet in force alike. What a RESET takes authority from, and
 * what get_article_rules lists.
 */
export function rulesUnderAuthority(rules: readonly Rule[], decisions: readonly Decision[]): Rule[] {
  const underAuthority = authority(decisions);
  const creating = new Set(underAuthority.map((d) => d.id));
  const retired = new Set(
    underAuthority.filter((d) => d.type === 'RULE_RETIRED' && d.ruleId !== null).map((d) => d.ruleId),
  );
  return rules.filter((r) => creating.has(r.createdByDecisionId) && !retired.has(r.id));
}

/**
 * LIVE(page, t): the rules under AUTHORITY not ended at t (validTo is null or
 * t < validTo) — A2's "live". validFrom is not consulted: a live rule with
 * validFrom > t is the one a gap-fill approval EXTENDS rather than
 * duplicates. Several live rules may share a selector across disjoint spans
 * (a rule ended at T3 and the same selector re-marked at T5 are both live at
 * T14); at most one of them GOVERNS any t.
 */
export function liveRules(rules: readonly Rule[], decisions: readonly Decision[], t: string): Rule[] {
  return rulesUnderAuthority(rules, decisions).filter((r) => r.validTo === null || t < r.validTo);
}

/**
 * RULES_IN_FORCE(page, t): the live rules with validFrom ≤ t.
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
  return liveRules(rules, decisions, t).filter((r) => r.validFrom <= t);
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

/** What SEEN folds over: a capture's outcome and the removed side of its derivation. */
export interface CaptureRemovals {
  waybackTimestamp: string;
  outcome: Outcome;
  removed: readonly string[];
}

/** TRUSTED(rule): a RULE_TRUSTED naming it under AUTHORITY; REVIEWED otherwise. */
export function trusted(rule: Rule, decisions: readonly Decision[]): 'TRUSTED' | 'REVIEWED' {
  const isTrusted = authority(decisions).some((d) => d.type === 'RULE_TRUSTED' && d.ruleId === rule.id);
  return isTrusted ? 'TRUSTED' : 'REVIEWED';
}

/**
 * APPROVED_BEFORE(page, t): a CAPTURE_ACCEPTED under AUTHORITY on a capture
 * with waybackTimestamp ≤ t. A skip approves no ruleset, so it does not count —
 * Gate 0 still fires on the next capture.
 */
export function approvedBefore(decisions: readonly Decision[], t: string): boolean {
  return authority(decisions).some(
    (d) => d.type === 'CAPTURE_ACCEPTED' && d.waybackTimestamp !== null && d.waybackTimestamp <= t,
  );
}

/**
 * RESOLVED(row): a CAPTURE_ACCEPTED or CAPTURE_SKIPPED for its capture, under
 * AUTHORITY, whose STORED rulesetId equals RULESET_ID(page, row.t) now. The
 * decision's own stamp is read, never a recomputation of what it would have
 * been. Trust changes no text, so RULE_TRUSTED never un-resolves a capture.
 */
export function resolved(row: WorkListRow, rules: readonly Rule[], decisions: readonly Decision[]): boolean {
  const current = rulesetIdAt(rules, decisions, row.waybackTimestamp);
  return authority(decisions).some(
    (d) =>
      (d.type === 'CAPTURE_ACCEPTED' || d.type === 'CAPTURE_SKIPPED') &&
      d.waybackTimestamp === row.waybackTimestamp &&
      d.rulesetId === current,
  );
}

/**
 * SEEN(page): the removed-side segments of every ACQUIRED capture a human has
 * judged — a CAPTURE_ACCEPTED for it under AUTHORITY — plus the
 * PENDING_JUDGEMENT capture being judged. Computed from bytes held, so a
 * SKIPPED capture contributes nothing and its removals may be shown again.
 *
 * "Has a decision" is an ACCEPTANCE, not any row naming the timestamp (ruled
 * 2026-09-05): a RULE_EXTENDED carries the rule's NEW validFrom, a capture the
 * rule reaches back to and nobody looked at. Under the broader reading an
 * extension landing on an unjudged ACQUIRED capture would mark its removals
 * seen, and Gate 4 would never show them.
 */
export function seen(captures: readonly CaptureRemovals[], decisions: readonly Decision[]): Set<string> {
  const judged = new Set(
    authority(decisions)
      .filter((d) => d.type === 'CAPTURE_ACCEPTED')
      .map((d) => d.waybackTimestamp)
      .filter((t): t is string => t !== null),
  );
  const out = new Set<string>();
  for (const capture of captures) {
    const contributes =
      capture.outcome === 'PENDING_JUDGEMENT' ||
      (capture.outcome === 'ACQUIRED' && judged.has(capture.waybackTimestamp));
    if (contributes) for (const segment of capture.removed) out.add(segment);
  }
  return out;
}

/**
 * The EXTRACTOR of a text version: the base before the ruleset suffix the
 * reused `chromeTextVersion` appends (`<base>+chrome-<id>`). The suffix names
 * the ruleset, which STALE's other axis already compares.
 */
export function extractorOf(textExtractionVersion: string): string {
  const suffix = textExtractionVersion.indexOf('+chrome-');
  return suffix < 0 ? textExtractionVersion : textExtractionVersion.slice(0, suffix);
}

/**
 * STALE(row): outcome ∈ {DUPLICATE, ACQUIRED} AND (its rulesetId is not
 * RULESET_ID(page, t) now, OR its extractor is not the current one). A derived
 * row missing either stamp was derived under something it cannot name, and is
 * stale on that axis — the survey's legacy join stamps both so this is never
 * reached from its rows.
 */
export function stale(
  row: WorkListRow,
  rules: readonly Rule[],
  decisions: readonly Decision[],
  currentExtractor: string,
): boolean {
  if (row.outcome !== 'ACQUIRED' && row.outcome !== 'DUPLICATE') return false;
  const rulesetMoved = row.rulesetId !== rulesetIdAt(rules, decisions, row.waybackTimestamp);
  const extractorMoved =
    row.textExtractionVersion === null || extractorOf(row.textExtractionVersion) !== currentExtractor;
  return rulesetMoved || extractorMoved;
}

/** Rows in waybackTimestamp order, whatever order they arrived in. */
export function inTimestampOrder<T extends WorkListRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) =>
    a.waybackTimestamp < b.waybackTimestamp ? -1 : a.waybackTimestamp > b.waybackTimestamp ? 1 : 0,
  );
}

/** PREDECESSOR(row): the latest row before it in timestamp order with outcome ACQUIRED; never itself. */
export function predecessor<T extends WorkListRow>(rows: readonly T[], row: WorkListRow): T | null {
  const earlier = inTimestampOrder(rows).filter(
    (r) => r.outcome === 'ACQUIRED' && r.waybackTimestamp < row.waybackTimestamp,
  );
  return earlier.at(-1) ?? null;
}

/** KNOWN_TEXT(row): the row's text is known — ACQUIRED, DUPLICATE or IDENTICAL. */
export function knownText(row: WorkListRow): boolean {
  return row.outcome === 'ACQUIRED' || row.outcome === 'DUPLICATE' || row.outcome === 'IDENTICAL';
}

/**
 * NEXT_ROW(page): the earliest row in timestamp order that is UNFETCHED,
 * PENDING_JUDGEMENT or STALE. Where the walk got to is derived, never stored —
 * this is the one answer, and the re-walk needs no starting parameter.
 */
export function nextRow<T extends WorkListRow>(
  rows: readonly T[],
  rules: readonly Rule[],
  decisions: readonly Decision[],
  currentExtractor: string,
): T | null {
  return (
    inTimestampOrder(rows).find(
      (r) =>
        r.outcome === 'UNFETCHED' ||
        r.outcome === 'PENDING_JUDGEMENT' ||
        stale(r, rules, decisions, currentExtractor),
    ) ?? null
  );
}
