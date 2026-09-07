import { z } from 'zod';
import { CdxEntryStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { rulesetIdAt, type Rule, type Decision } from '../derivations';
import { loadWorkListRow } from '../rows';
import { appendDecisions, WRITE_TRANSACTION } from '../pageLog';
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
    .literal('BAD_CAPTURE')
    .describe(
      'The one resolution that is not a draft: this capture does not speak. Every other answer is given in the marking page.',
    ),
  reason: z.string().describe('Why this capture does not speak — REQUIRED, recorded with the decision'),
};

/** The handler answers the contract's refusals itself; the schema is the MCP layer's. */
interface ResolveInput {
  url: string;
  capture: string;
  resolution: string;
  reason?: string;
}

interface Resolution {
  capture: string;
  outcome: 'SKIPPED';
  decisionSequence: number;
}

export async function resolveScanStopHandler(input: ResolveInput): Promise<string> {
  return answer(async () => {
    const researcherId = getResearcherId();
    if (researcherId === null) return shared.noResearcher('A skip');
    if (input.resolution !== 'BAD_CAPTURE') {
      return refusal(
        'INVALID_RESOLUTION',
        `${input.resolution} is not a resolution. BAD_CAPTURE is the one answer given here; CONTINUE, CORRECT and TRUST are given in the marking page and promoted by approve_article_rules.`,
      );
    }
    const reason = input.reason?.trim() ?? '';
    if (reason.length === 0) return shared.reasonRequired('A skip');
    return prisma.$transaction((tx: Prisma.TransactionClient) => skip(tx, researcherId, input.url, input.capture, reason), WRITE_TRANSACTION);
  });
}

async function skip(
  tx: Prisma.TransactionClient,
  researcherId: string,
  url: string,
  t: string,
  reason: string,
): Promise<Resolution | Refusal> {
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
