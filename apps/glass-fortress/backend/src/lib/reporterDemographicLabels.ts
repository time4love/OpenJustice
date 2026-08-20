import { ReporterAgeRange, ReporterGender } from '@prisma/client';

// ---------------------------------------------------------------------------
// Hebrew/English labels for Report's bucketed demographic fields.
//
// Separate file from reportCategoryLabels.ts / socialEconomicCategoryLabels.ts
// deliberately — these describe the reporter, shared by both domains, not a
// domain-specific taxonomy value.
// ---------------------------------------------------------------------------

export const REPORTER_AGE_RANGE_LABELS: Record<ReporterAgeRange, string> = {
  UNDER_18: 'מתחת לגיל 18',
  AGE_18_29: '18–29',
  AGE_30_44: '30–44',
  AGE_45_59: '45–59',
  AGE_60_74: '60–74',
  AGE_75_PLUS: '75 ומעלה',
  UNKNOWN: 'לא ידוע',
};

// UNKNOWN doubles as "prefer not to say" for this field — a reporter
// choosing not to disclose and a field simply left blank are the same
// state on a public form, so one value covers both rather than forcing an
// artificial distinction.
export const REPORTER_GENDER_LABELS: Record<ReporterGender, string> = {
  FEMALE: 'נקבה',
  MALE: 'זכר',
  OTHER: 'אחר',
  UNKNOWN: 'לא צוין',
};
