import { z } from 'zod';
import { CdxEntryStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { resolved, rulesetIdAt, rulesInForce, type Rule, type Decision } from '../derivations';
import { loadWorkListRow } from '../rows';
import { appendDecisions, WRITE_TRANSACTION, type DecisionEntry } from '../pageLog';
import { clearDraft } from '../draft';
import { answer, refusal, shared, type Refusal } from '../refusals';

// ---------------------------------------------------------------------------
// resolve_scan_stop — docs/gf-interaction-flows.md Flow 2 and A5.
//
// THE ONE ANSWER AT A STOP THAT IS NOT A DRAFT. BAD CAPTURE: this capture does
// not speak — a truncated archive page, a paywall redirect — and the reason is
// REQUIRED, because a silent hole in the record is the one outcome this corpus
// does not permit. It is not UNSERVABLE (a fact about the archive); it is a
// human's verdict about bytes we hold, and it is attributed.
//
// ONE transaction: CAPTURE_SKIPPED carrying RULESET_ID(page, t) · the row
// becomes SKIPPED with the reason, its held bytes and its stop cleared — from a
// stop the capture is always unstored, so nothing holds it but its row · the
// draft cleared IF it names this capture (a draft for a skipped capture is
// void) and left alone if it names another. No rule is touched: a skip is a
// verdict on one capture and says nothing about the rules, however many bad
// captures occur in a row.
//
// AN UNFETCHED ROW MAY BE SKIPPED TOO (ruled 2026-09-07, step 5's staging
// exercise; flows A5 amended). The archive answered 429 for one capture for
// over an hour, from three clients, while its neighbours served — a third
// archive answer, neither transient nor a durable 404, indistinguishable from
// transient on any one call. The walk keeps asking, forever; NEXT_ROW is the
// earliest UNFETCHED row, so the page waits behind it until a human says stop.
// No count of attempts ever decides that: the researcher retries as often as
// they like, and skips with a reason that says the archive would not serve it
// — the one skip where the human has not seen the bytes. Same act, same
// decision, same row update (nothing held, nothing to clear).
//
// CONTINUE — AMENDED 2026-09-07 (Flow 2, "judgement in the chat"). After the
// first live stop under PR 3's panel the researcher ruled that a stop is a task
// inside the walk, and the chat is where a task with judgement in it is done.
// CONTINUE, TRUST per rule and END per rule are given there and recorded by ONE
// call; only CORRECT — marking or unmarking with the element under the cursor —
// still goes through the page, and on a mixed stop MARKING comes first.
//
// ONE transaction, in A5's order: RULE_TRUSTED per trusted selector,
// RULE_ENDED per ended one with validTo = this capture, then CAPTURE_ACCEPTED
// carrying the ruleset id AFTER those changes. The row STAYS
// PENDING_JUDGEMENT holding its bytes — CONTINUE resolves the stop and does not
// acquire the capture; the retry does, exactly as after approve_article_rules,
// which is what keeps "no capture is stored under rules a gate has doubted"
// true with a second way to resolve a stop.
//
// ON AN ALREADY-RESOLVED ROW, NO SECOND CAPTURE_ACCEPTED. A mixed stop is
// marked first and answered after, so the capture already carries an acceptance
// under the ruleset the marking left. A second one would be a decision nobody
// made, and RESOLVED is the predicate that says so.
//
// NOTHING PAID, NOTHING FETCHED, inside the transaction: every input is the
// researcher's word and the page's own rows.
//
// INVALID_RESOLUTION and REASON_REQUIRED are decided on the input, before the
// database is touched; NOT_PENDING is decided on the transaction's own
// snapshot, like approve's row checks.
// ---------------------------------------------------------------------------

/** The outcomes a human may skip: held at a stop, or never served by the archive. */
const SKIPPABLE: ReadonlySet<CdxEntryStatus> = new Set([CdxEntryStatus.PENDING_JUDGEMENT, CdxEntryStatus.UNFETCHED]);

export const resolveScanStopSchema = {
  url: z.url().describe('The page — exact URL'),
  capture: z
    .string()
    .regex(/^\d{14}$/)
    .describe('The capture at the stop: its 14-digit wayback timestamp'),
  resolution: z
    .enum(['CONTINUE', 'BAD_CAPTURE'])
    .describe(
      'CONTINUE: the rules are right here — accept the capture, and with it any rules you TRUST (Gate 4 stops ' +
        "asking about that element's contents on later captures; Gate 1 still catches its text if it changes " +
        'sides — but ONLY if it changes sides, so text appearing inside a trusted element, never having been ' +
        'kept, is seen by nothing; and there is NO UNTRUST DECISION, the way back being END or retiring the ' +
        'rule and marking the element afresh, which starts REVIEWED) or END (the rule stops from this ' +
        'capture\'s date, its text ' +
        'enters the article from here, earlier captures untouched). CONTINUE without trust accepts this capture ' +
        "and the element's new contents will stop the walk again. BAD_CAPTURE: this capture does not speak; " +
        'reason REQUIRED. CORRECT is the one answer given in the marking page, and on a stop that needs both, ' +
        'marking comes first.',
    ),
  trust: z
    .array(z.string())
    .optional()
    .describe('CONTINUE only: the selectors of rules whose removals need no more review, read to the researcher first'),
  end: z
    .array(z.string())
    .optional()
    .describe('CONTINUE only: the selectors of rules that are taking article text and stop from this capture'),
  reason: z.string().optional().describe('BAD_CAPTURE only: why this capture does not speak — REQUIRED there'),
};

/** The handler answers the contract's refusals itself; the schema is the MCP layer's. */
interface ResolveInput {
  url: string;
  capture: string;
  resolution: string;
  trust?: string[];
  end?: string[];
  reason?: string;
}

interface NamedRule {
  ruleId: string;
  selector: string;
}

interface Skip {
  capture: string;
  outcome: 'SKIPPED';
  decisionSequence: number;
}

interface Continued {
  capture: string;
  resolution: 'CONTINUE';
  changes: { trusted: NamedRule[]; ended: NamedRule[] };
  decisionSequence: number;
}

export async function resolveScanStopHandler(input: ResolveInput): Promise<string> {
  return answer(async () => {
    const researcherId = getResearcherId();
    if (researcherId === null) return shared.noResearcher('A stop resolution');

    const trust = selectorSet(input.trust ?? []);
    const end = selectorSet(input.end ?? []);

    if (input.resolution === 'BAD_CAPTURE') {
      // A skip is a verdict on ONE CAPTURE and says nothing about the rules, so
      // it cannot carry a rule decision. Refusing is not pedantry: silently
      // dropping them would record a skip while the researcher believed a rule
      // had been trusted.
      if (trust.length > 0 || end.length > 0) {
        return refusal(
          'INVALID_RESOLUTION',
          'BAD_CAPTURE carries no rule decision: a skip is a verdict on this capture and says nothing about the rules. ' +
            'Trust or end them with CONTINUE on a capture that speaks.',
        );
      }
      const reason = input.reason?.trim() ?? '';
      if (reason.length === 0) return shared.reasonRequired('A skip');
      return inOneTransaction((tx) => skip(tx, researcherId, input.url, input.capture, reason));
    }

    if (input.resolution !== 'CONTINUE') {
      return refusal(
        'INVALID_RESOLUTION',
        `${input.resolution} is not a resolution. CONTINUE accepts this capture, with any rules trusted or ended; ` +
          'BAD_CAPTURE says it does not speak. CORRECT is given in the marking page.',
      );
    }

    // A selector in BOTH lists is a contradiction the researcher must resolve,
    // not one this tool may pick a side of — trusting a rule it is also ending
    // would write two decisions that disagree about the same element.
    const both = trust.filter((selector) => end.includes(selector));
    if (both.length > 0) {
      return refusal(
        'INVALID_RESOLUTION',
        `${both.join(', ')} is given as both trusted and ended. A rule is one or the other at this capture: ` +
          'trust it and its removals stop being shown, end it and it stops applying from here.',
      );
    }

    return inOneTransaction((tx) => proceed(tx, researcherId, input.url, input.capture, trust, end));
  });
}

/**
 * A7's "every write tool is one transaction", with two resolutions behind it.
 *
 * ONE CALL SITE, not one per resolution: exactly one of `skip` and `proceed`
 * runs per call, so two `prisma.$transaction(` sites would be two spellings of
 * one rule — the shape the source scan in pageLog.test.ts exists to catch, and
 * it caught this when the second was written.
 */
function inOneTransaction<T>(body: (tx: Prisma.TransactionClient) => Promise<T | Refusal>): Promise<T | Refusal> {
  return prisma.$transaction((tx: Prisma.TransactionClient) => body(tx), WRITE_TRANSACTION);
}

/** Selectors as a set, in the researcher's order: trimmed, blanks dropped, repeats dropped. */
function selectorSet(selectors: readonly string[]): string[] {
  return [...new Set(selectors.map((s) => s.trim()).filter((s) => s.length > 0))];
}

const named = (rule: Rule): NamedRule => ({ ruleId: rule.id, selector: rule.selector });

/**
 * CONTINUE: the rules are right here. A5's order, one transaction, and the row
 * left PENDING_JUDGEMENT holding its bytes for the retry that acquires it.
 */
async function proceed(
  tx: Prisma.TransactionClient,
  researcherId: string,
  url: string,
  t: string,
  trust: readonly string[],
  end: readonly string[],
): Promise<Continued | Refusal> {
  const page = await tx.trackedUrl.findUnique({ where: { url } });
  if (page === null) return shared.notSurveyed(url);

  const row = await loadWorkListRow(tx, page.id, t);
  if (row === null) {
    return refusal('NOT_PENDING', `The page has no work-list row for capture ${t}; there is no stop to resolve.`);
  }
  if (row.outcome !== 'PENDING_JUDGEMENT') {
    return refusal(
      'NOT_PENDING',
      `Capture ${t} is ${row.outcome}; only a capture held at a stop can be continued. An UNFETCHED capture the ` +
        'archive will not serve is SKIPPED with a reason, not continued.',
    );
  }

  const rules: Rule[] = await tx.rule.findMany({ where: { trackedUrlId: page.id } });
  const decisions: Decision[] = await tx.pageDecision.findMany({
    where: { trackedUrlId: page.id },
    orderBy: { sequence: 'asc' },
  });

  // Every selector resolved BEFORE anything is written: a NO_SUCH_RULE halfway
  // through would leave half the researcher's answer recorded.
  const inForce = new Map(rulesInForce(rules, decisions, t).map((rule) => [rule.selector, rule]));
  const resolve = (selectors: readonly string[]): Rule[] | Refusal => {
    const found: Rule[] = [];
    for (const selector of selectors) {
      const rule = inForce.get(selector);
      if (rule === undefined) {
        return refusal(
          'NO_SUCH_RULE',
          `${selector} names no rule in force at ${t}. get_article_rules lists the rules in force, with their ids.`,
        );
      }
      found.push(rule);
    }
    return found;
  };
  const toTrust = resolve(trust);
  if (!Array.isArray(toTrust)) return toTrust;
  const toEnd = resolve(end);
  if (!Array.isArray(toEnd)) return toEnd;

  const stamp = (entry: Omit<DecisionEntry, 'researcherId'>): DecisionEntry => ({ ...entry, researcherId });

  // The rules as they will stand, so the acceptance carries the ruleset id
  // AFTER the changes — the same shape approve_article_rules uses.
  const rulesAfter: Rule[] = rules.map((rule) => (toEnd.some((r) => r.id === rule.id) ? { ...rule, validTo: t } : rule));

  // RESOLVED on the state as it will be: a mixed stop was marked first, so the
  // capture may already carry an acceptance under the ruleset the marking left,
  // and a second one would be a decision nobody made.
  const alreadyResolved = resolved(row, rulesAfter, decisions);

  const written = await appendDecisions(tx, page.id, [
    ...toTrust.map((rule) => stamp({ type: 'RULE_TRUSTED', waybackTimestamp: t, ruleId: rule.id })),
    ...toEnd.map((rule) => stamp({ type: 'RULE_ENDED', waybackTimestamp: t, ruleId: rule.id })),
    ...(alreadyResolved
      ? []
      : [stamp({ type: 'CAPTURE_ACCEPTED', waybackTimestamp: t, rulesetId: rulesetIdAt(rulesAfter, decisions, t) })]),
  ]);
  const last = written.at(-1);
  if (last === undefined) throw new Error('appendDecisions returned no row for a CONTINUE');

  for (const rule of toEnd) await tx.rule.update({ where: { id: rule.id }, data: { validTo: t } });

  // The stop is answered; the bytes stay, because the capture is not yet
  // acquired. A2: heldBody is non-null exactly while PENDING_JUDGEMENT.
  await tx.cdxIndexEntry.update({ where: { id: row.id }, data: { stop: Prisma.DbNull } });

  return {
    capture: t,
    resolution: 'CONTINUE',
    changes: { trusted: toTrust.map(named), ended: toEnd.map(named) },
    decisionSequence: last.sequence,
  };
}

async function skip(
  tx: Prisma.TransactionClient,
  researcherId: string,
  url: string,
  t: string,
  reason: string,
): Promise<Skip | Refusal> {
  const page = await tx.trackedUrl.findUnique({ where: { url } });
  if (page === null) return shared.notSurveyed(url);

  const row = await loadWorkListRow(tx, page.id, t);
  if (row === null) {
    return refusal('NOT_PENDING', `The page has no work-list row for capture ${t}; there is no stop to resolve.`);
  }
  if (!SKIPPABLE.has(row.outcome)) {
    return refusal(
      'NOT_PENDING',
      `Capture ${t} is ${row.outcome}; only a capture held at a stop (PENDING_JUDGEMENT) or one the archive ` +
        'has not served (UNFETCHED) can be skipped.',
    );
  }

  const rules: Rule[] = await tx.rule.findMany({ where: { trackedUrlId: page.id } });
  const decisions: Decision[] = await tx.pageDecision.findMany({
    where: { trackedUrlId: page.id },
    orderBy: { sequence: 'asc' },
  });

  const skipped = (
    await appendDecisions(tx, page.id, [
      {
        type: 'CAPTURE_SKIPPED',
        researcherId,
        waybackTimestamp: t,
        reason,
        rulesetId: rulesetIdAt(rules, decisions, t),
      },
    ])
  ).at(0);
  if (skipped === undefined) throw new Error('appendDecisions returned no row for CAPTURE_SKIPPED');

  // SQL NULL, the state A2 calls "cleared" — Prisma.DbNull, never JsonNull,
  // which would store a JSON null in a non-null column. Ruled 2026-09-05.
  await tx.cdxIndexEntry.update({
    where: { id: row.id },
    data: { status: CdxEntryStatus.SKIPPED, reason, heldBody: null, stop: Prisma.DbNull },
  });

  if (page.draftCapture === t) await clearDraft(tx, page.id);

  return { capture: t, outcome: 'SKIPPED', decisionSequence: skipped.sequence };
}
