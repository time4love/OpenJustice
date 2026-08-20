import {
  MedicalSymptomCategory,
  MedicalSeriousness,
  CancerPresentationType,
  CancerCourse,
  CancerType,
  CognitiveSymptomType,
  SymptomPersistence,
  MedicalCareEngagement,
  VaccineManufacturer,
  ReportTimingWindow,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Hebrew labels for the medical adverse-event report taxonomy.
//
// GF is Hebrew-first — every enum a reporter or reader sees needs a real
// Hebrew label, not a transliterated identifier. This file is the backend
// source of truth (used for any Hebrew-language text generation); the
// frontend's messages/he.json carries its own copy under matching
// namespaces (medicalSymptomCategories, cancerTypes, etc.) for the same
// reason investigativeCategories.ts's labels are mirrored into
// messages/he.json's "categories" namespace — the two layers can't share a
// module across the Express/Next.js boundary, so keep them in step by hand.
//
// Terminology grounded per docs/gf-adverse-event-report-schema-dev-plan.md's
// citations, not translated casually. Two categories have no settled
// single-word Hebrew term (confirmed by search, not assumed):
// NEUROCOGNITIVE_PVS ("post-vaccination syndrome" is itself an emerging
// English term) and CancerCourse.UNUSUALLY_RAPID_PROGRESSION
// ("hyperprogression" has no established Hebrew translation in the medical
// literature searched) — both use a transliteration + plain-Hebrew gloss
// rather than inventing a term that would read as more authoritative than
// it is.
// ---------------------------------------------------------------------------

export const MEDICAL_SYMPTOM_CATEGORY_LABELS: Record<MedicalSymptomCategory, string> = {
  CARDIOVASCULAR: 'לב וכלי דם',
  NEUROLOGICAL: 'נוירולוגי',
  NEUROCOGNITIVE_PVS: 'קוגניטיבי (תסמונת שלאחר חיסון)',
  AUTOIMMUNE_IMMUNE: 'אוטואימוני / מערכת החיסון',
  HEMATOLOGIC: 'המטולוגי (דם וקרישה)',
  ONCOLOGIC: 'אונקולוגי (סרטן)',
  REPRODUCTIVE_MENSTRUAL: 'רבייה ומחזור חודשי',
  MUSCULOSKELETAL: 'שרירים ושלד',
  DERMATOLOGIC: 'עור',
  GENERAL_SYSTEMIC: 'כללי-מערכתי (עייפות, חום)',
  OTHER: 'אחר',
};

export const MEDICAL_SERIOUSNESS_LABELS: Record<MedicalSeriousness, string> = {
  HOSPITALIZATION: 'אשפוז',
  LIFE_THREATENING: 'מסכן חיים',
  PERMANENT_DISABILITY: 'נכות קבועה',
  DEATH: 'פטירה',
  CONGENITAL_ANOMALY: 'מום מולד',
  NONE: 'ללא',
};

export const CANCER_PRESENTATION_TYPE_LABELS: Record<CancerPresentationType, string> = {
  NEW_DIAGNOSIS: 'אבחנה חדשה',
  RECURRENCE_OR_PROGRESSION: 'הישנות או התקדמות המחלה',
  OTHER: 'אחר',
};

export const CANCER_COURSE_LABELS: Record<CancerCourse, string> = {
  TYPICAL_PACE: 'קצב אופייני',
  UNUSUALLY_RAPID_PROGRESSION: 'התקדמות מהירה באופן חריג (היפרפרוגרסיה)',
};

export const CANCER_TYPE_LABELS: Record<CancerType, string> = {
  LYMPHOMA_LEUKEMIA: 'לימפומה / לוקמיה',
  BREAST: 'שד',
  LUNG: 'ריאה',
  MELANOMA_SKIN: 'מלנומה / עור',
  PANCREATIC: 'לבלב',
  BRAIN_CNS: 'מוח / מערכת עצבים מרכזית',
  OTHER_SOLID: 'גידול מוצק אחר',
  OTHER_BLOOD: 'סרטן דם אחר',
  NOT_YET_TYPED: 'טרם סווג',
};

export const COGNITIVE_SYMPTOM_TYPE_LABELS: Record<CognitiveSymptomType, string> = {
  BRAIN_FOG: 'ערפל מוחי',
  MEMORY_IMPAIRMENT: 'פגיעה בזיכרון',
  CONCENTRATION_DIFFICULTY: 'קושי בריכוז',
  MULTIPLE: 'מספר תסמינים קוגניטיביים',
  OTHER: 'אחר',
};

export const SYMPTOM_PERSISTENCE_LABELS: Record<SymptomPersistence, string> = {
  RESOLVED: 'חלף',
  ONGOING_PERSISTENT: 'מתמשך',
  UNKNOWN: 'לא ידוע',
};

export const MEDICAL_CARE_ENGAGEMENT_LABELS: Record<MedicalCareEngagement, string> = {
  NOT_SOUGHT: 'לא פנה/תה לטיפול רפואי',
  SOUGHT_UNCONFIRMED: 'פנה/תה לטיפול, האבחנה טרם אושרה',
  SOUGHT_CONFIRMED: 'פנה/תה לטיפול והאבחנה אושרה',
  UNKNOWN: 'לא ידוע',
};

export const VACCINE_MANUFACTURER_LABELS: Record<VaccineManufacturer, string> = {
  PFIZER: 'פייזר',
  MODERNA: 'מודרנה',
  ASTRAZENECA: 'אסטרהזניקה',
  JOHNSON_JOHNSON: "ג'ונסון אנד ג'ונסון",
  OTHER: 'אחר',
  UNKNOWN: 'לא ידוע',
};

// Shared between Medical and SocialEconomic reports.
export const REPORT_TIMING_WINDOW_LABELS: Record<ReportTimingWindow, string> = {
  WITHIN_24H: 'תוך 24 שעות',
  WITHIN_1_WEEK: 'תוך שבוע',
  WITHIN_1_MONTH: 'תוך חודש',
  WITHIN_6_MONTHS: 'תוך חצי שנה',
  OVER_6_MONTHS: 'מעל חצי שנה',
  UNKNOWN: 'לא ידוע',
};
