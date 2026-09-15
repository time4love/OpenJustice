import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { TEXT_EXTRACTION_VERSION } from '../../lib/captureDocument';
import { OUTCOMES, inTimestampOrder, stale, type Outcome, type Rule } from '../derivations';
import { loadWorkListRows, snapshotDateOf } from '../rows';
import { pendingStopOf, type Gate } from '../stop';
import type { PageRef } from '../../services/corpusReads';
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

/**
 * THE ONE FUNCTION behind the tool and `GET /api/research/pages/:trackedUrlId/captures` (UI-3): INVALID_OUTCOME from
 * the input, then the page through its door's ref.
 */
export async function capturesOf(ref: PageRef, outcome: string | undefined): Promise<CaptureListed[] | Refusal<'INVALID_OUTCOME' | 'NOT_SURVEYED'>> {
  if (outcome !== undefined && !isOutcome(outcome)) {
    return refusal('INVALID_OUTCOME', `${outcome} is not an outcome. One of: ${OUTCOMES.join(', ')}.`);
  }
  const page = await ref.load();
  if (page === null) return ref.missing();

  const rows = await loadWorkListRows(prisma, page.id);
  const rules: Rule[] = await prisma.rule.findMany({ where: { trackedUrlId: page.id } });
  const decisions = await prisma.pageDecision.findMany({
    where: { trackedUrlId: page.id },
    orderBy: { sequence: 'asc' },
  });

  return inTimestampOrder(rows)
    .filter((row) => outcome === undefined || row.outcome === outcome)
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
}

export async function listCapturesHandler(input: { url: string; outcome?: string }): Promise<string> {
  const ref: PageRef = { load: () => prisma.trackedUrl.findUnique({ where: { url: input.url } }), missing: () => shared.notSurveyed(input.url) };
  return answer(() => capturesOf(ref, input.outcome));
}
