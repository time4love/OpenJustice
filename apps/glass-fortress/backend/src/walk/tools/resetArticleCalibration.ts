import { z } from 'zod';
import { CdxEntryStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { authority, rulesUnderAuthority, type Rule, type Decision } from '../derivations';
import { appendDecisions } from '../pageLog';
import { clearDraft } from '../draft';
import { answer, refusal, shared, type Refusal } from '../refusals';

// ---------------------------------------------------------------------------
// reset_article_calibration — docs/gf-interaction-flows.md Flow 3 and A5, as
// amended 2026-09-02. BUILT UNDER ITS FINAL NAME, REGISTERED ONLY AT STEP 8:
// the old tool owns the name until the switch (refactor plan §3 step 3, §8).
//
// "START AGAIN" IS FREE. ONE RESET decision, reason REQUIRED. The rules stay,
// readable, their dates untouched; they lose authority because AUTHORITY is
// "decisions after the newest RESET" and a rule's authority is its creating
// decision's — no per-rule row is written, and RULES_IN_FORCE is empty at
// every timestamp by the predicate alone. The next capture stops on Gate 0
// like any page's first.
//
// In the same transaction: the draft cleared, whatever it named; and `stop`
// cleared on every PENDING_JUDGEMENT row of the page, held bytes kept, so the
// next scan_captures EVALUATES those rows (Gate 0, by construction) instead of
// returning a stop written under the authority just ended (ruled 2026-09-03).
//
// NOTHING_TO_RETIRE when no decision is under AUTHORITY — a rule in force
// implies one, so that covers "no rule in force and no decision under
// AUTHORITY" — including when the newest decision is already a RESET.
// ---------------------------------------------------------------------------

export const resetArticleCalibrationSchema = {
  url: z.url().describe('The page — exact URL'),
  reason: z.string().describe('Why the calibration is being ended — REQUIRED, recorded with the decision'),
};

/** The handler answers the contract's refusals itself; the schema is the MCP layer's. */
interface ResetInput {
  url: string;
  reason?: string;
}

interface Reset {
  rulesLostAuthority: number;
  decisionsSuperseded: number;
}

export async function resetArticleCalibrationHandler(input: ResetInput): Promise<string> {
  return answer(async () => {
    const researcherId = getResearcherId();
    if (researcherId === null) return shared.noResearcher('A reset');
    const reason = input.reason?.trim() ?? '';
    if (reason.length === 0) return shared.reasonRequired('A reset');
    return prisma.$transaction((tx: Prisma.TransactionClient) => reset(tx, researcherId, input.url, reason));
  });
}

async function reset(tx: Prisma.TransactionClient, researcherId: string, url: string, reason: string): Promise<Reset | Refusal> {
  const page = await tx.trackedUrl.findUnique({ where: { url } });
  if (page === null) return shared.notSurveyed(url);

  const rules: Rule[] = await tx.rule.findMany({ where: { trackedUrlId: page.id } });
  const decisions: Decision[] = await tx.pageDecision.findMany({
    where: { trackedUrlId: page.id },
    orderBy: { sequence: 'asc' },
  });

  const superseded = authority(decisions);
  if (superseded.length === 0) {
    return refusal(
      'NOTHING_TO_RETIRE',
      'No decision is under authority on this page — nothing to end. A reset that supersedes nothing is refused.',
    );
  }
  const losing = rulesUnderAuthority(rules, decisions);

  // Counted before the write, over the authority being ended.
  await appendDecisions(tx, page.id, [{ type: 'RESET', researcherId, reason }]);

  // Every pending stop was written under the authority just ended: cleared
  // (SQL NULL — Prisma.DbNull, ruled 2026-09-05), bytes kept, rows still
  // PENDING_JUDGEMENT, so the walk evaluates them afresh.
  await tx.cdxIndexEntry.updateMany({
    where: { trackedUrlId: page.id, status: CdxEntryStatus.PENDING_JUDGEMENT },
    data: { stop: Prisma.DbNull },
  });

  await clearDraft(tx, page.id);

  return { rulesLostAuthority: losing.length, decisionsSuperseded: superseded.length };
}
