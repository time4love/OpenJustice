import {
  SocialEconomicImpactCategory,
  FormalBasisAsserted,
  ConsequenceSeverity,
  SocialOutcomeStatus,
  VaccinationStatus,
  ReportCalendarPeriod,
  EmploymentSector,
  RemedyPursued,
  RelationshipAffected,
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

// Vaccination status — the field that tells a refusal-side consequence apart
// from a vaccination-side one. "לא נמסר" rather than "לא ידוע": the reporter
// knows perfectly well, they have chosen not to say, and the label should not
// misdescribe that as ignorance.
export const VACCINATION_STATUS_LABELS: Record<VaccinationStatus, string> = {
  RECEIVED: 'התחסנתי',
  NOT_RECEIVED: 'לא התחסנתי',
  PARTIALLY_RECEIVED: 'התחסנתי חלקית',
  UNDISCLOSED: 'לא נמסר',
};

// Calendar periods, split where the mandate waves fell — Israel's Green Pass
// (Feb 2021) in H1, the large US federal/employer mandates (Sep 2021 on) in H2.
export const REPORT_CALENDAR_PERIOD_LABELS: Record<ReportCalendarPeriod, string> = {
  YEAR_2020_OR_EARLIER: '2020 או קודם',
  YEAR_2021_H1: 'המחצית הראשונה של 2021',
  YEAR_2021_H2: 'המחצית השנייה של 2021',
  YEAR_2022: '2022',
  YEAR_2023_OR_LATER: '2023 ואילך',
  UNKNOWN: 'לא ידוע',
};

// Employment sector. "כוחות הביטחון" covers military/police/prison service as
// one bucket rather than splitting a distinction this dataset cannot support.
export const EMPLOYMENT_SECTOR_LABELS: Record<EmploymentSector, string> = {
  HEALTHCARE: 'מערכת הבריאות',
  EDUCATION: 'מערכת החינוך',
  PUBLIC_SECTOR: 'המגזר הציבורי',
  PRIVATE_SECTOR: 'המגזר הפרטי',
  SECURITY_SERVICES: 'כוחות הביטחון',
  OTHER: 'אחר',
  UNKNOWN: 'לא ידוע',
};

// Escalation ladder, in Israeli terms rather than translated EEOC ones — the
// regulator is נציבות שוויון הזדמנויות בעבודה and the forum is בית הדין לעבודה,
// following this file's existing practice of using the real local institutions.
export const REMEDY_PURSUED_LABELS: Record<RemedyPursued, string> = {
  NONE: 'לא ננקטה פעולה',
  INTERNAL_APPEAL: 'ערעור או בירור פנימי במקום העבודה',
  REGULATOR_COMPLAINT: 'תלונה לגורם רגולטורי (כגון נציבות שוויון הזדמנויות בעבודה)',
  LITIGATION: 'הליך משפטי (כגון בית הדין לעבודה)',
  UNKNOWN: 'לא ידוע',
};

export const RELATIONSHIP_AFFECTED_LABELS: Record<RelationshipAffected, string> = {
  SPOUSE_PARTNER: 'בן/בת זוג',
  PARENT: 'הורה',
  CHILD: 'בן/בת',
  SIBLING: 'אח/אחות',
  EXTENDED_FAMILY: 'משפחה מורחבת',
  FRIENDS_COMMUNITY: 'חברים או קהילה',
  MULTIPLE: 'יותר מקשר אחד',
  UNKNOWN: 'לא ידוע',
};
