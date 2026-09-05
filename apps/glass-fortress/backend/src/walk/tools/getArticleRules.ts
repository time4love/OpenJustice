import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { TEXT_EXTRACTION_VERSION } from '../../lib/captureDocument';
import { OUTCOMES, rulesUnderAuthority, stale, trusted, type Outcome, type Rule } from '../derivations';
import { loadWorkListRows } from '../rows';
import { pendingStopOf, type Stop } from '../stop';
import { markingUrl } from '../markingUrl';
import { answer, shared, type Refusal } from '../refusals';

// ---------------------------------------------------------------------------
// get_article_rules({ url }) — docs/gf-interaction-flows.md A5, a READ, GATED
// in WRITE_TOOLS by the standing precedent (a researcher's working state is
// not published evidence) while the handler answers without an identity.
// BUILT UNDER ITS FINAL NAME, REGISTERED ONLY AT STEP 8: the old
// get_article_rules(runId) owns the name until the switch.
//
// The CURRENT extractor is the one constant `captureDocument` defines; STALE
// is over that axis and the ruleset axis both (A3).
// ---------------------------------------------------------------------------

export const getArticleRulesSchema = { url: z.url().describe('The page — exact URL') };

interface RuleListed {
  ruleId: string;
  selector: string;
  validFrom: string;
  validTo: string | null;
  trusted: boolean;
  lastMatched: string | null;
}

interface PendingStop extends Stop {
  capture: string;
  markingUrl: string;
}

interface ArticleRules {
  rules: RuleListed[];
  pendingStop: PendingStop | null;
  counts: Record<Outcome, number>;
  stale: number;
  decisions: number;
  lastDecisionAt: Date | null;
}

/** Every outcome at zero, from the one list. */
const zeroCounts = (): Record<Outcome, number> =>
  Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<Outcome, number>;

export async function getArticleRulesHandler(input: { url: string }): Promise<string> {
  return answer(async (): Promise<ArticleRules | Refusal> => {
    const page = await prisma.trackedUrl.findUnique({ where: { url: input.url } });
    if (page === null) return shared.notSurveyed(input.url);

    const rows = await loadWorkListRows(prisma, page.id);
    const rules: Rule[] = await prisma.rule.findMany({ where: { trackedUrlId: page.id } });
    const decisions = await prisma.pageDecision.findMany({
      where: { trackedUrlId: page.id },
      orderBy: { sequence: 'asc' },
    });
    const matches = await prisma.ruleMatch.findMany({
      where: { ruleId: { in: rules.map((r) => r.id) }, matchedNodes: { gt: 0 } },
    });

    // The latest timestamp at which each rule matched anything. The where
    // above already excludes zero matches; the filter is applied here as well
    // so the two cannot disagree.
    const lastMatched = new Map<string, string>();
    for (const m of matches) {
      if (m.matchedNodes <= 0) continue;
      const current = lastMatched.get(m.ruleId);
      if (current === undefined || current < m.waybackTimestamp) lastMatched.set(m.ruleId, m.waybackTimestamp);
    }

    const listed = rulesUnderAuthority(rules, decisions).map((rule) => ({
      ruleId: rule.id,
      selector: rule.selector,
      validFrom: rule.validFrom,
      validTo: rule.validTo,
      trusted: trusted(rule, decisions) === 'TRUSTED',
      lastMatched: lastMatched.get(rule.id) ?? null,
    }));

    const counts = zeroCounts();
    for (const row of rows) counts[row.outcome] += 1;

    const pending = rows.find((row) => pendingStopOf(row) !== null);
    const stop = pending === undefined ? null : pendingStopOf(pending);
    const pendingStop =
      pending !== undefined && stop !== null
        ? { capture: pending.waybackTimestamp, ...stop, markingUrl: markingUrl(page.id, pending.waybackTimestamp) }
        : null;

    const newest = decisions.at(-1);
    return {
      rules: listed,
      pendingStop,
      counts,
      stale: rows.filter((row) => stale(row, rules, decisions, TEXT_EXTRACTION_VERSION)).length,
      decisions: decisions.length,
      lastDecisionAt: newest?.createdAt ?? null,
    };
  });
}
