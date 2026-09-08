import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authority, rulesInForce, rulesUnderAuthority, trusted, type Decision, type Outcome, type Rule } from '../derivations';
import { bytesOf } from '../captureBytes';
import { loadWorkListRows, type LoadedRow } from '../rows';
import { answer, refusal, shared, type Refusal } from '../refusals';

// ---------------------------------------------------------------------------
// get_rule_history({ url, ruleId }) — docs/gf-interaction-flows.md A5, amended
// 2026-09-07. A READ, GATED in WRITE_TOOLS by the standing precedent that a
// researcher's working state is not published evidence, while the handler
// answers without an identity — the same shape as the other two reads.
//
// WHY IT EXISTS. Judgement moved to the chat after the first live stop under
// PR 3's panel: a researcher was asked to trust a rule while looking at a page
// that could tell them nothing about it. "Is this element furniture whatever it
// contains" is answerable only from the rule's HISTORY — when it was created
// and against which capture, whether a human has trusted it, what it has
// matched since, and above all WHAT IT ACTUALLY REMOVED, in the page's own
// words. That is this read, and Flow 2's per-rule script is what reads it.
//
// IT DECIDES NOTHING, and it must not look as though it does. No verdict, no
// threshold, no ordering by anything but time: a series and its texts, and the
// caller says what the series shows. The whole design refuses a number here.
//
// REMOVED IS RE-DERIVED UNDER THAT CAPTURE'S RULESET, NEVER TODAY'S. A rule's
// removals on a 2020 capture are what the ruleset in force in 2020 produced.
// Deriving them under today's would attribute to this rule text that a LATER
// rule takes — showing the researcher a rule doing more than it ever did, at
// the moment they decide whether to trust it forever.
//
// AND ONLY WHERE BYTES ARE HELD. ACQUIRED and PENDING_JUDGEMENT rows hold some;
// DUPLICATE and IDENTICAL keep no body by the 2026-09-02 ruling, and UNFETCHED,
// UNSERVABLE and SKIPPED never had one. `null` is that fact. An empty array
// would read as "this rule removed nothing there", which is a different claim
// and one this read cannot make.
//
// THE JSDOM BOUNDARY. `deriveTextUnderRuleset` is ESM-only through jsdom and is
// loaded by dynamic import, once per call, exactly as the walk loads it
// (refactor plan §8): a static import drags it into every unit suite that
// touches this module, which has broken the suite twice.
// ---------------------------------------------------------------------------

export const getRuleHistorySchema = {
  url: z.url().describe('The page — exact URL'),
  ruleId: z.string().describe('The rule, by the id the stop material and get_article_rules name it with'),
  maxCaptures: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('How many of the LATEST captures it matched to return; an operational bound, never a judgement'),
};

interface HistoryInput {
  url: string;
  ruleId: string;
  maxCaptures?: number;
}

interface RuleDecision {
  type: string;
  waybackTimestamp: string | null;
  researcherId: string;
  createdAt: Date;
}

interface MatchEntry {
  capture: string;
  outcome: Outcome;
  matchedNodes: number;
  /** The texts this rule removed from that capture, re-derived; null where the corpus holds no body. */
  removed: string[] | null;
  removedCount: number | null;
}

interface RuleHistory {
  rule: {
    ruleId: string;
    selector: string;
    validFrom: string;
    validTo: string | null;
    trusted: boolean;
    createdAt: Date;
    createdById: string;
    decisions: RuleDecision[];
  };
  matches: MatchEntry[];
}

export async function getRuleHistoryHandler(input: HistoryInput): Promise<string> {
  return answer(async (): Promise<RuleHistory | Refusal> => {
    const page = await prisma.trackedUrl.findUnique({ where: { url: input.url } });
    if (page === null) return shared.notSurveyed(input.url);

    // The page is checked as well as the id: a rule id from another page is not
    // readable through this page's name, and the refusal says the same thing
    // either way rather than confirming the id exists elsewhere.
    const found = await prisma.rule.findUnique({ where: { id: input.ruleId } });
    if (found?.trackedUrlId !== page.id) {
      return refusal(
        'NO_SUCH_RULE',
        `The page has no rule ${input.ruleId}. get_article_rules lists every rule under AUTHORITY with its id.`,
      );
    }
    // The stored rows, not the derivations' structural minimums: this read
    // returns `createdAt`, `createdById` and each decision's researcher, none of
    // which the predicates need and all of which a history is made of. The
    // predicates take them structurally.
    const rule = found;
    const rules = await prisma.rule.findMany({ where: { trackedUrlId: page.id } });
    const decisions = await prisma.pageDecision.findMany({
      where: { trackedUrlId: page.id },
      orderBy: { sequence: 'asc' },
    });
    const rows = await loadWorkListRows(prisma, page.id);
    const matches = await prisma.ruleMatch.findMany({ where: { ruleId: rule.id } });

    // A rule out of AUTHORITY — created before the newest RESET, or retired —
    // still has a history worth reading; what it does NOT have is trust or
    // decisions in force, and both are folded over AUTHORITY so they answer
    // that way by construction.
    const underAuthority = rulesUnderAuthority(rules, decisions).some((r) => r.id === rule.id);
    const underAuthorityIds = new Set(authority(decisions).map((d) => d.id));

    const rowByCapture = new Map<string, LoadedRow>(rows.map((row) => [row.waybackTimestamp, row]));
    const series = matches
      .filter((match) => rowByCapture.has(match.waybackTimestamp))
      .sort((a, b) => (a.waybackTimestamp < b.waybackTimestamp ? -1 : 1));
    // The bound keeps the LATEST captures — what a rule did recently is what a
    // decision about it rests on — and the answer stays in timestamp order.
    const bounded = input.maxCaptures === undefined ? series : series.slice(-input.maxCaptures);

    const entries: MatchEntry[] = [];
    for (const match of bounded) {
      const row = rowByCapture.get(match.waybackTimestamp);
      if (row === undefined) continue;
      const removed = await removedBy(rule, rules, decisions, row);
      entries.push({
        capture: row.waybackTimestamp,
        outcome: row.outcome,
        matchedNodes: match.matchedNodes,
        removed,
        removedCount: removed === null ? null : removed.length,
      });
    }

    return {
      rule: {
        ruleId: rule.id,
        selector: rule.selector,
        validFrom: rule.validFrom,
        validTo: rule.validTo,
        trusted: underAuthority && trusted(rule, decisions) === 'TRUSTED',
        createdAt: rule.createdAt,
        createdById: rule.createdById,
        // AUTHORITY through the one predicate, applied to the STORED rows by id:
        // `authority` answers in the derivations' narrow shape, which carries no
        // researcher and no time, and re-deriving the boundary here would be a
        // second implementation of the rule a RESET is made of.
        decisions: decisions
          .filter((d) => d.ruleId === rule.id && underAuthorityIds.has(d.id))
          .map((d) => ({
            type: d.type,
            waybackTimestamp: d.waybackTimestamp,
            researcherId: d.researcherId,
            createdAt: d.createdAt,
          })),
      },
      matches: entries,
    };
  });
}

/**
 * What this rule removed from that capture, derived from the bytes the corpus
 * holds under the ruleset in force FOR THAT CAPTURE'S DATE; null where no body
 * is held.
 *
 * The whole ruleset is applied and this rule's segments are then selected,
 * rather than applying the rule alone: a segment is attributed to a selector by
 * the same derivation the walk and the marking page use, and a one-rule ruleset
 * would attribute to this rule text that another rule takes first.
 */
async function removedBy(
  rule: Rule,
  rules: readonly Rule[],
  decisions: readonly Decision[],
  row: LoadedRow,
): Promise<string[] | null> {
  const bytes = await bytesOf(prisma, row);
  if (bytes === null) return null;
  const { deriveTextUnderRuleset } = await import('../../lib/chromeRulesetApply');
  const derived = deriveTextUnderRuleset(bytes.document, bytes.documentContentType, bytes.documentContentEncoding, {
    selectors: rulesInForce(rules, decisions, row.waybackTimestamp).map((r) => r.selector),
  });
  return derived.chrome.removedSegments.filter((segment) => segment.selector === rule.selector).map((segment) => segment.text);
}
