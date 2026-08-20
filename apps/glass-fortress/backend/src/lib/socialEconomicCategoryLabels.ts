import {
  SocialEconomicImpactCategory,
  FormalBasisAsserted,
  ConsequenceSeverity,
  SocialOutcomeStatus,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Hebrew labels for the social/economic impact report taxonomy.
//
// Separate file from reportCategoryLabels.ts deliberately — this is a
// different terminology register (Israeli employment/disability law) from
// that file's clinical Hebrew, not the same taxonomy split across two files.
//
// RELIGIOUS_ACCOMMODATION_DENIED and MEDICAL_DISABILITY_ACCOMMODATION_DENIED
// use the actual Israeli legal terms — "התאמה דתית" (religious accommodation,
// Equal Opportunities in Employment Law 1988 §2(c)) and "התאמה סבירה"
// (reasonable accommodation, Equal Rights for Persons with Disabilities Law
// 1998) — confirmed by search against nevo.co.il/kolzchut.org.il, not
// invented, even though the categories themselves were designed around
// American EEOC/DoD data (docs/gf-adverse-event-report-schema-dev-plan.md
// §2.5): the underlying legal concept (a formal accommodation request being
// denied) is the same, and Israeli reporters need the term their own law
// actually uses, not a literal translation of the American one.
// ---------------------------------------------------------------------------

export const SOCIAL_ECONOMIC_IMPACT_CATEGORY_LABELS: Record<SocialEconomicImpactCategory, string> = {
  EMPLOYMENT_TERMINATION: 'פיטורים מהעבודה',
  MILITARY_DISCHARGE: 'שחרור כפוי מהצבא',
  DEMOTION_REASSIGNMENT: 'הורדה בדרגה / העברה בתפקיד',
  DENIED_HIRE: 'סירוב לקבלה לעבודה',
  ACCESS_DENIAL_SERVICES: 'מניעת גישה לשירותים',
  ACCESS_DENIAL_HEALTHCARE: 'מניעת גישה לטיפול רפואי',
  EDUCATION_ACCESS_DENIAL: 'מניעת גישה לחינוך',
  FAMILY_RELATIONSHIP_RUPTURE: 'קרע משפחתי',
  SOCIAL_OSTRACIZATION: 'נידוי חברתי',
  OTHER: 'אחר',
};

export const FORMAL_BASIS_ASSERTED_LABELS: Record<FormalBasisAsserted, string> = {
  RELIGIOUS_ACCOMMODATION_DENIED: 'סירוב בקשת התאמה דתית',
  MEDICAL_DISABILITY_ACCOMMODATION_DENIED: 'סירוב בקשת התאמה רפואית / נכות',
  NO_FORMAL_BASIS_STATED: 'לא צוינה עילה רשמית',
  UNKNOWN: 'לא ידוע',
};

export const CONSEQUENCE_SEVERITY_LABELS: Record<ConsequenceSeverity, string> = {
  INCOME_LOSS: 'אובדן הכנסה',
  BENEFITS_LOSS: 'אובדן זכויות והטבות',
  CAREER_TRAJECTORY_IMPACT: 'פגיעה במסלול הקריירה',
  RELATIONSHIP_LOSS: 'אובדן קשר משפחתי או חברתי',
  HOUSING_FINANCIAL_HARDSHIP: 'מצוקה כלכלית או דיור',
  NONE: 'ללא',
};

export const SOCIAL_OUTCOME_STATUS_LABELS: Record<SocialOutcomeStatus, string> = {
  ONGOING: 'מתמשך',
  RESOLVED_REVERSED: 'בוטל / שוקם',
  RESOLVED_UNCHANGED: 'נותר ללא שינוי',
  UNKNOWN: 'לא ידוע',
};
