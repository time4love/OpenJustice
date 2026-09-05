import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { liveRules, rulesInForce, rulesetIdAt, trusted, type Rule, type Decision } from '../derivations';
import { loadWorkListRow } from '../rows';
import { clearDraft } from '../draft';
import { appendDecisions, asDecision, type DecisionEntry } from '../pageLog';
import { answer, refusal, shared, type Refusal } from '../refusals';

// ---------------------------------------------------------------------------
// approve_article_rules — docs/gf-interaction-flows.md MARKING and A5.
//
// MARKING'S ONE COMMAND, WHICHEVER ANSWER IT WAS. CONTINUE hands back an
// unchanged draft, CORRECT a changed one, TRUST a draft carrying selectors;
// this promotes all of it, in order, as ONE transaction:
//
//   new selectors        → Rule rows, validFrom = THIS capture's timestamp,
//                          created by ONE RULESET_CORRECTED naming the capture
//   a live rule with a   → its validFrom moves back to this timestamp, one
//   later validFrom        RULE_EXTENDED; no second row — one live rule per
//                          selector (ruled 2026-09-03)
//   selectors removed    → RULE_ENDED each, validTo = this timestamp
//   draftTrusted         → RULE_TRUSTED each, mapped to the live rule — created
//                          here or existing; a rule can be created and trusted
//                          in one draft
//   then                 → CAPTURE_ACCEPTED, carrying RULESET_ID after the changes
//   the draft cleared
//
// The work-list row is never written here: acquisition is the walk's retry.
// An empty ruleset is approved explicitly or not at all — `rules: 0` — because
// an approval of nothing has twice gone through unnoticed.
// ---------------------------------------------------------------------------

export const approveArticleRulesSchema = {
  url: z.url().describe('The page — exact URL'),
  capture: z
    .string()
    .regex(/^\d{14}$/)
    .describe('The capture the draft was handed back for: its 14-digit wayback timestamp'),
  rules: z
    .literal(0)
    .optional()
    .describe('Pass 0 to approve a draft that leaves NO rule in force; the marking page shows `rules=0` when that is so'),
};

interface ApproveInput {
  url: string;
  capture: string;
  rules?: 0;
}

interface NamedRule {
  ruleId: string;
  selector: string;
}

interface RuleInForce extends NamedRule {
  validFrom: string;
  validTo: string | null;
  trusted: boolean;
}

interface Approval {
  rules: RuleInForce[];
  changes: { added: NamedRule[]; ended: NamedRule[]; trusted: NamedRule[]; extended: NamedRule[] };
  decisionSequence: number;
}

/** Selectors as a set, in the page's order: trimmed, blanks dropped, repeats dropped. */
function selectorSet(selectors: readonly string[]): string[] {
  return [...new Set(selectors.map((s) => s.trim()).filter((s) => s.length > 0))];
}

/**
 * The rules GOVERNING t, one per selector — A2's invariant, which this tool
 * keeps. Two rules governing one t for one selector is the invariant broken,
 * and a defect this tool must not build on. (Two LIVE rules for one selector
 * is not: a rule ended at T3 and the same selector re-marked at T5 are both
 * live at T14 and exactly one governs it — Flow 3's "right in 2020, wrong
 * after the redesign, keeps governing 2020".)
 */
function governing(rules: readonly Rule[]): Map<string, Rule> {
  const map = new Map<string, Rule>();
  for (const rule of rules) {
    if (map.has(rule.selector)) {
      throw new Error(
        `Two rules govern selector ${rule.selector} at once (${map.get(rule.selector)?.id ?? '?'}, ${rule.id}); the invariant is broken upstream.`,
      );
    }
    map.set(rule.selector, rule);
  }
  return map;
}

/**
 * The live rule a gap-fill approval at t EXTENDS for a selector not in force
 * there: of the live rules for that selector — all with validFrom > t, or one
 * would be in force — the one with the EARLIEST validFrom, the only one that
 * can move back to t without putting two rules in force at a later timestamp.
 * Null when none is live: the selector is new here.
 */
function extendable(live: readonly Rule[], selector: string): Rule | null {
  const candidates = live.filter((rule) => rule.selector === selector).sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));
  return candidates.at(0) ?? null;
}

const named = (rule: Rule): NamedRule => ({ ruleId: rule.id, selector: rule.selector });

export async function approveArticleRulesHandler(input: ApproveInput): Promise<string> {
  return answer(async () => {
    const researcherId = getResearcherId();
    if (researcherId === null) return shared.noResearcher('An approval');
    return prisma.$transaction((tx: Prisma.TransactionClient) => approve(tx, researcherId, input));
  });
}

async function approve(tx: Prisma.TransactionClient, researcherId: string, input: ApproveInput): Promise<Approval | Refusal> {
  const page = await tx.trackedUrl.findUnique({ where: { url: input.url } });
  if (page === null) return shared.notSurveyed(input.url);
  const t = input.capture;

  if (page.draftCapture === null) {
    return refusal('NO_DRAFT', 'The page holds no draft. Open the marking page for this capture and hand a draft back first.');
  }
  if (page.draftReturnedAt === null) {
    return refusal(
      'DRAFT_NOT_RETURNED',
      `The draft for ${page.draftCapture} has not been handed back. Press the return button in the marking page first.`,
    );
  }
  if (page.draftCapture !== t) {
    return refusal(
      'DRAFT_FOR_OTHER_CAPTURE',
      `The page's draft names capture ${page.draftCapture}, not ${t}. The wrong marking page is open, or the command was pasted for the wrong capture.`,
    );
  }
  const row = await loadWorkListRow(tx, page.id, t);
  if (row === null) {
    return refusal(
      'CAPTURE_NOT_MARKABLE',
      `The page has no work-list row for capture ${t}. Survey the page; the archive may have added it since.`,
    );
  }
  if (row.outcome !== 'PENDING_JUDGEMENT' && row.outcome !== 'ACQUIRED') {
    return refusal(
      'CAPTURE_NOT_MARKABLE',
      `Capture ${t} is ${row.outcome}; only a PENDING_JUDGEMENT or an ACQUIRED capture holds bytes to mark.`,
    );
  }

  const rules: Rule[] = await tx.rule.findMany({ where: { trackedUrlId: page.id } });
  const decisions: Decision[] = await tx.pageDecision.findMany({
    where: { trackedUrlId: page.id },
    orderBy: { sequence: 'asc' },
  });

  const wanted = selectorSet(page.draftSelectors);
  const inForce = governing(rulesInForce(rules, decisions, t));
  const live = liveRules(rules, decisions, t);

  const toExtend: Rule[] = [];
  const toCreate: string[] = [];
  for (const selector of wanted) {
    if (inForce.has(selector)) continue;
    const later = extendable(live, selector);
    if (later !== null) toExtend.push(later);
    else toCreate.push(selector);
  }
  const toEnd = [...inForce.values()].filter((rule) => !wanted.includes(rule.selector));

  // After this approval the rules in force at t are exactly the draft's
  // selectors — new, extended, or already in force — so the draft's own count
  // decides EMPTY_RULESET_UNCONFIRMED, before anything is written.
  if (wanted.length === 0 && input.rules !== 0) {
    return refusal(
      'EMPTY_RULESET_UNCONFIRMED',
      `This approval would leave no rule in force at ${t}. A page with no furniture exists, but an approval of nothing is stated, never assumed: paste approve_article_rules url=${input.url} capture=${t} rules=0`,
    );
  }

  const stamp = (entry: Omit<DecisionEntry, 'researcherId'>): DecisionEntry => ({ ...entry, researcherId });

  // 1. New rules need their creating decision's id, so RULESET_CORRECTED is
  //    written first, alone, and the Rule rows follow it.
  const created: Rule[] = [];
  const log: Decision[] = [...decisions];
  if (toCreate.length > 0) {
    const corrected = (await appendDecisions(tx, page.id, [stamp({ type: 'RULESET_CORRECTED', waybackTimestamp: t })])).at(0);
    if (corrected === undefined) throw new Error('appendDecisions returned no row for RULESET_CORRECTED');
    log.push(asDecision(corrected));
    for (const selector of toCreate) {
      created.push(
        await tx.rule.create({
          data: {
            trackedUrlId: page.id,
            selector,
            validFrom: t,
            validTo: null,
            createdById: researcherId,
            createdByDecisionId: corrected.id,
          },
        }),
      );
    }
  }

  // 2. The rules as they will stand, in memory, so RULESET_ID after the changes
  //    and the return are one derivation over one state.
  const rulesAfter: Rule[] = [
    ...rules.map((rule) => {
      if (toExtend.some((r) => r.id === rule.id)) return { ...rule, validFrom: t };
      if (toEnd.some((r) => r.id === rule.id)) return { ...rule, validTo: t };
      return rule;
    }),
    ...created,
  ];
  const inForceAfter = governing(rulesInForce(rulesAfter, log, t));
  const toTrust = selectorSet(page.draftTrusted).map((selector) => {
    const rule = inForceAfter.get(selector);
    if (rule === undefined) {
      throw new Error(
        `The draft trusts selector ${selector}, which names no rule in force at ${t} after this approval; the page handed back a selector it does not have.`,
      );
    }
    return rule;
  });

  // 3. Everything else in A5's order, one append: EXTENDED, ENDED, TRUSTED, ACCEPTED.
  const written = await appendDecisions(tx, page.id, [
    ...toExtend.map((rule) => stamp({ type: 'RULE_EXTENDED', waybackTimestamp: t, ruleId: rule.id })),
    ...toEnd.map((rule) => stamp({ type: 'RULE_ENDED', waybackTimestamp: t, ruleId: rule.id })),
    ...toTrust.map((rule) => stamp({ type: 'RULE_TRUSTED', waybackTimestamp: t, ruleId: rule.id })),
    stamp({ type: 'CAPTURE_ACCEPTED', waybackTimestamp: t, rulesetId: rulesetIdAt(rulesAfter, log, t) }),
  ]);
  log.push(...written.map(asDecision));
  const last = written.at(-1);
  if (last === undefined) throw new Error('appendDecisions returned no row for CAPTURE_ACCEPTED');

  // 4. The Rule rows follow their decisions.
  for (const rule of toExtend) await tx.rule.update({ where: { id: rule.id }, data: { validFrom: t } });
  for (const rule of toEnd) await tx.rule.update({ where: { id: rule.id }, data: { validTo: t } });

  // 5. The draft is discarded on promotion.
  await clearDraft(tx, page.id);

  return {
    rules: rulesInForce(rulesAfter, log, t).map((rule) => ({
      ...named(rule),
      validFrom: rule.validFrom,
      validTo: rule.validTo,
      trusted: trusted(rule, log) === 'TRUSTED',
    })),
    changes: {
      added: created.map(named),
      ended: toEnd.map(named),
      trusted: toTrust.map(named),
      extended: toExtend.map(named),
    },
    decisionSequence: last.sequence,
  };
}
