import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { TEXT_EXTRACTION_VERSION } from '../../lib/captureDocument';
import { OUTCOMES, inTimestampOrder, stale, type Outcome, type Rule } from '../derivations';
import { loadWorkListRows, snapshotDateOf } from '../rows';
import { pendingStopOf, type Gate } from '../stop';
import { answer, refusal, shared, type Refusal } from '../refusals';

// ---------------------------------------------------------------------------
// list_captures({ url, outcome? }) — docs/gf-interaction-flows.md A5, a READ,
// GATED like get_article_rules; never the held bytes. BUILT UNDER ITS FINAL
// NAME, REGISTERED ONLY AT STEP 8: the old list_captures owns the name — the
// suite's addition to step 3 (articleRulesReads.test.ts), ruled 2026-09-05.
// ---------------------------------------------------------------------------

export const listCapturesSchema = {
  url: z.url().describe('The page — exact URL'),
  outcome: z.enum(OUTCOMES).optional().describe('Only rows with this outcome'),
};

interface CaptureListed {
  capture: string;
  snapshotDate: string;
  outcome: Outcome;
  digest: string;
  comparedTo: string | null;
  rulesetId: string | null;
  snapshotId: string | null;
  stale: boolean;
  stopGates: Gate[] | null;
}

const isOutcome = (value: string): value is Outcome => (OUTCOMES as readonly string[]).includes(value);

export async function listCapturesHandler(input: { url: string; outcome?: string }): Promise<string> {
  return answer(async (): Promise<CaptureListed[] | Refusal> => {
    if (input.outcome !== undefined && !isOutcome(input.outcome)) {
      return refusal('INVALID_OUTCOME', `${input.outcome} is not an outcome. One of: ${OUTCOMES.join(', ')}.`);
    }
    const page = await prisma.trackedUrl.findUnique({ where: { url: input.url } });
    if (page === null) return shared.notSurveyed(input.url);

    const rows = await loadWorkListRows(prisma, page.id);
    const rules: Rule[] = await prisma.rule.findMany({ where: { trackedUrlId: page.id } });
    const decisions = await prisma.pageDecision.findMany({
      where: { trackedUrlId: page.id },
      orderBy: { sequence: 'asc' },
    });

    return inTimestampOrder(rows)
      .filter((row) => input.outcome === undefined || row.outcome === input.outcome)
      .map((row) => ({
        capture: row.waybackTimestamp,
        snapshotDate: snapshotDateOf(row.waybackTimestamp),
        outcome: row.outcome,
        digest: row.digest,
        comparedTo: row.comparedTo,
        rulesetId: row.rulesetId,
        snapshotId: row.snapshotId,
        stale: stale(row, rules, decisions, TEXT_EXTRACTION_VERSION),
        stopGates: pendingStopOf(row)?.gates.map((g) => g.gate) ?? null,
      }));
  });
}
