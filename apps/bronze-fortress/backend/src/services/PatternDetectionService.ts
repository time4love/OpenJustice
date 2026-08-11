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

export interface SuggestAllegationsResult {
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
  async suggestAllegations(
    caseId: string,
    figureId: string,
    courtId: string,
  ): Promise<SuggestAllegationsResult> {
    const [complaints, orders, welfareReports, evaluatorSessions, guardianContacts, existingAllegations] =
      await Promise.all([
        prisma.criminalComplaint.findMany({ where: { caseId } }),
        prisma.nzakutOrder.findMany({ where: { caseId } }),
        prisma.welfareReport.findMany({ where: { caseId } }),
        prisma.evaluatorSession.findMany({ where: { caseId } }),
        prisma.guardianContact.findMany({ where: { caseId } }),
        prisma.allegation.findMany({
          where: { caseId, figureId, courtId },
          select: { patternCategory: true },
        }),
      ]);

    const registered = new Set(existingAllegations.map((a) => a.patternCategory));

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

    // ── Domain C: Welfare Professional Violations ────────────────────────────
    for (const w of welfareReports) {
      if (w.welfareReferralAtFirstHearing) {
        suggest(
          PatternCategory.WELFARE_REFERRAL_AT_FIRST_HEARING,
          'Welfare services were referred to the case at the opening hearing, before any evidence was examined.',
        );
      }
      if (w.interviewOneSided === true) {
        suggest(
          PatternCategory.WELFARE_REPORT_ONE_SIDED_INTERVIEW,
          'The welfare report was written based on interviews with only one party.',
        );
      }
      if (w.homeVisitConducted === false) {
        suggest(
          PatternCategory.WELFARE_REPORT_NO_HOME_VISIT,
          'The welfare worker did not visit the requesting parent\'s home before writing the report.',
        );
      }
      if (w.citedDroppedAllegations === true) {
        suggest(
          PatternCategory.WELFARE_REPORT_CITES_DROPPED_ALLEGATIONS,
          'The welfare report relies on allegations that were closed or unproven.',
        );
      }
      if (w.recommendationChanged === true) {
        suggest(
          PatternCategory.WELFARE_RECOMMENDATION_CHANGED_UNEXPLAINED,
          'The welfare position reversed between reports without a substantiated reason.',
        );
      }
    }

    // ── Domain D: Evaluator Violations ──────────────────────────────────────
    for (const e of evaluatorSessions) {
      if (e.sessionCount === 1 && e.totalDurationMinutes !== null && e.totalDurationMinutes < 90) {
        suggest(
          PatternCategory.EVALUATOR_SINGLE_SESSION_UNDER_90_MIN,
          `The evaluator conducted only one session of ${e.totalDurationMinutes} minutes — shorter than the minimum required for a proper evaluation.`,
        );
      }
      if (!e.bothParentsInterviewed) {
        suggest(
          PatternCategory.EVALUATOR_SINGLE_PARENT_ONLY,
          'The evaluator interviewed only one parent without assessing both sides independently.',
        );
      }
      if (!e.feedbackSessionHeld) {
        suggest(
          PatternCategory.EVALUATOR_NO_FEEDBACK_SESSION,
          'The evaluator did not hold a feedback session before submitting the opinion to the court.',
        );
      }
      if (e.judgeAdoptedWithoutReview === true) {
        suggest(
          PatternCategory.JUDGE_RUBBER_STAMPS_EVALUATOR,
          'The court adopted the evaluator\'s opinion in full without independent critical review.',
        );
      }
    }

    // ── Domain E: Guardian Ad Litem ──────────────────────────────────────────
    for (const g of guardianContacts) {
      if (g.childMeetingCount <= 1) {
        suggest(
          PatternCategory.GUARDIAN_MINIMAL_CHILD_CONTACT,
          `The guardian ad litem met the child ${g.childMeetingCount === 0 ? 'zero times' : 'only once'}.`,
        );
      }
      if (g.positionContradictsChild === true) {
        suggest(
          PatternCategory.GUARDIAN_CONTRADICTS_CHILD_WISHES,
          "The guardian ad litem advocated a position contrary to the child's expressed wishes.",
        );
      }
      // Cross-case: detect if this guardian was appointed by the same judge in other cases
      if (g.appointingJudgeFigureId) {
        const repeatCount = await prisma.guardianContact.count({
          where: {
            appointingJudgeFigureId: g.appointingJudgeFigureId,
            caseId: { not: caseId },
            legalCase: { allegations: { some: { figureId } } },
          },
        });
        if (repeatCount >= 1) {
          suggest(
            PatternCategory.GUARDIAN_REPEATEDLY_BY_SAME_JUDGE,
            'This guardian ad litem was appointed by the same judge in at least one other case.',
          );
        }
      }
    }

    return {
      caseId,
      figureId,
      courtId,
      suggestions: Array.from(seen.values()),
      domainsAnalyzed: [
        'A (criminal-to-family interface)',
        'B (חוק הנוער procedural violations)',
        'C (welfare professional violations)',
        'D (evaluator violations)',
        'E (guardian ad litem)',
      ],
      note: 'Domains F (judicial conduct) and G (parental alienation) require additional structured intake data not yet collected.',
    };
  }
}
