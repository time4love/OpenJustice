import {
  PatternCategory,
  PoliceCaseStatus,
  NzakutOrderType,
} from '../generated/prisma';
import { prisma } from '../lib/prisma';

// ---------------------------------------------------------------------------
// PatternDetectionService
//
// Deterministic rule engine — maps structured intake records (CriminalComplaint,
// NzakutOrder) to PatternCategory values. No LLM involved: rules derive directly
// from the legal definitions in חוק הנוער and family court procedure.
//
// Only covers domains A and B because those are the only structured intake
// models currently in the schema. Domains C–G require additional models.
// ---------------------------------------------------------------------------

export interface PatternSuggestion {
  patternCategory: PatternCategory;
  evidence: string;         // human-readable rationale, suitable for legal notes
  alreadyRegistered: boolean;
}

export interface SuggestCommitmentsResult {
  caseId: string;
  figureId: string;
  courtId: string;
  suggestions: PatternSuggestion[];
  domainsAnalyzed: string[];
  note: string;
}

const CLOSED_STATUSES: PoliceCaseStatus[] = [
  PoliceCaseStatus.CLOSED_LACK_OF_EVIDENCE,
  PoliceCaseStatus.CLOSED_CLEARED,
  PoliceCaseStatus.CLOSED_OTHER,
];

export class PatternDetectionService {
  async suggestCommitments(
    caseId: string,
    figureId: string,
    courtId: string,
  ): Promise<SuggestCommitmentsResult> {
    const [complaints, orders, existingCommitments] = await Promise.all([
      prisma.criminalComplaint.findMany({ where: { caseId } }),
      prisma.nzakutOrder.findMany({ where: { caseId } }),
      prisma.commitment.findMany({
        where: { caseId, figureId, courtId },
        select: { patternCategory: true },
      }),
    ]);

    const registered = new Set(existingCommitments.map((c) => c.patternCategory));

    // Accumulate suggestions, deduplicating by patternCategory.
    // Multiple intake records can evidence the same pattern — record the first
    // matched evidence string and skip further matches for that category.
    const seen = new Map<PatternCategory, PatternSuggestion>();

    function suggest(category: PatternCategory, evidence: string): void {
      if (!seen.has(category)) {
        seen.set(category, {
          patternCategory: category,
          evidence,
          alreadyRegistered: registered.has(category),
        });
      }
    }

    // ── Domain A: Criminal-to-Family Interface ──────────────────────────────
    for (const c of complaints) {
      if (CLOSED_STATUSES.includes(c.policeStatus) && c.closureConsideredByCourt === false) {
        suggest(
          PatternCategory.CRIMINAL_EXONERATION_IGNORED,
          `Police case closed (${c.policeStatus}) and family court did not consider the closure when making custody determinations.`,
        );
      }
    }

    // ── Domain B: חוק הנוער Procedural Violations ───────────────────────────
    for (const o of orders) {
      if (o.orderType === NzakutOrderType.EMERGENCY && !o.evidentiaryHearingHeld) {
        suggest(
          PatternCategory.EMERGENCY_ORDER_NO_HEARING_30_DAYS,
          `Emergency נזקקות order issued without an evidentiary hearing within the statutory 30-day limit (חוק הנוער section 4).`,
        );
      }

      if (!o.evidentiaryHearingHeld) {
        suggest(
          PatternCategory.NZAKUT_NO_EVIDENTIARY_HEARING,
          `נזקקות order issued or extended without a full evidentiary hearing as required by חוק הנוער section 7.`,
        );
      }

      if (o.daysWithoutMeritsHearing !== null && o.daysWithoutMeritsHearing >= 365) {
        suggest(
          PatternCategory.CHILD_REMOVED_OVER_YEAR_NO_HEARING,
          `Child separated for ${o.daysWithoutMeritsHearing} days without a merits hearing — exceeds the one-year threshold.`,
        );
      }
    }

    return {
      caseId,
      figureId,
      courtId,
      suggestions: Array.from(seen.values()),
      domainsAnalyzed: ['A (criminal-to-family interface)', 'B (חוק הנוער procedural violations)'],
      note: 'Domains C–G (welfare, evaluator, guardian, judicial conduct, parental alienation) require additional structured intake data not yet collected.',
    };
  }
}
