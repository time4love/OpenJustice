import { PatternCategory } from '../generated/prisma';

export interface PatternLabel {
  he: string;   // Hebrew label for legal documents
  en: string;   // English label
  domain: string; // legal domain group
}

// Human-readable labels for each PatternCategory.
// Hebrew is the authoritative label — these are referenced in legal filings.
export const PATTERN_LABELS: Record<PatternCategory, PatternLabel> = {
  // Domain A — Criminal-to-Family Interface
  [PatternCategory.CRIMINAL_EXONERATION_IGNORED]: {
    he: 'עיכוב בהצגת הסגירה הפלילית לבית המשפט',
    en: 'Criminal exoneration not acknowledged by family court',
    domain: 'A',
  },

  // Domain B — חוק הנוער Procedural Violations
  [PatternCategory.EMERGENCY_ORDER_NO_HEARING_30_DAYS]: {
    he: 'צו חירום ללא דיון תוך 30 יום (סעיף 4 חוק הנוער)',
    en: 'Emergency order issued without evidentiary hearing within 30 days',
    domain: 'B',
  },
  [PatternCategory.NZAKUT_NO_EVIDENTIARY_HEARING]: {
    he: 'צו נזקקות ללא דיון ראייתי',
    en: 'Nzakut order issued without evidentiary hearing',
    domain: 'B',
  },
  [PatternCategory.CHILD_REMOVED_OVER_YEAR_NO_HEARING]: {
    he: 'ילד הורחק מעל שנה ללא דיון לגופו',
    en: 'Child removed for over one year without merits hearing',
    domain: 'B',
  },

  // Domain C — Welfare Professional Violations
  [PatternCategory.WELFARE_REFERRAL_AT_FIRST_HEARING]: {
    he: 'הפנייה לרווחה בדיון הראשון ללא עילה',
    en: 'Welfare referral made at first hearing without stated basis',
    domain: 'C',
  },
  [PatternCategory.WELFARE_REPORT_ONE_SIDED_INTERVIEW]: {
    he: 'תסקיר רווחה המבוסס על ראיון חד-צדדי',
    en: 'Welfare report based on single-parent interview only',
    domain: 'C',
  },
  [PatternCategory.WELFARE_REPORT_NO_HOME_VISIT]: {
    he: 'תסקיר ללא ביקור בית',
    en: 'Welfare report issued without home visit',
    domain: 'C',
  },
  [PatternCategory.WELFARE_REPORT_CITES_DROPPED_ALLEGATIONS]: {
    he: 'תסקיר מאזכר טענות שנסגרו',
    en: 'Welfare report cites allegations dismissed by police or court',
    domain: 'C',
  },
  [PatternCategory.WELFARE_RECOMMENDATION_CHANGED_UNEXPLAINED]: {
    he: 'שינוי המלצת רווחה ללא הסבר',
    en: 'Welfare recommendation changed without documented reason',
    domain: 'C',
  },

  // Domain D — Evaluator Violations
  [PatternCategory.EVALUATOR_SINGLE_SESSION_UNDER_90_MIN]: {
    he: 'חוות דעת מוערך על בסיס פגישה אחת בלבד מתחת ל-90 דקות',
    en: 'Evaluator opinion based on single session under 90 minutes',
    domain: 'D',
  },
  [PatternCategory.EVALUATOR_SINGLE_PARENT_ONLY]: {
    he: 'מוערך פגש הורה אחד בלבד',
    en: 'Evaluator met with only one parent',
    domain: 'D',
  },
  [PatternCategory.EVALUATOR_NO_FEEDBACK_SESSION]: {
    he: 'מוערך לא קיים פגישת משוב',
    en: 'Evaluator conducted no feedback session with parents',
    domain: 'D',
  },
  [PatternCategory.JUDGE_RUBBER_STAMPS_EVALUATOR]: {
    he: 'שופט אימץ חוות דעת מוערך ללא בחינה עצמאית',
    en: 'Judge adopted evaluator opinion without independent scrutiny',
    domain: 'D',
  },

  // Domain E — Guardian Ad Litem
  [PatternCategory.GUARDIAN_MINIMAL_CHILD_CONTACT]: {
    he: 'אפוטרופוס לדין קיים מגע מינימלי עם הילד',
    en: 'Guardian ad litem had minimal contact with child',
    domain: 'E',
  },
  [PatternCategory.GUARDIAN_REPEATEDLY_BY_SAME_JUDGE]: {
    he: 'אותו אפוטרופוס מונה שוב ושוב על ידי אותו שופט',
    en: 'Same guardian repeatedly appointed by the same judge',
    domain: 'E',
  },
  [PatternCategory.GUARDIAN_CONTRADICTS_CHILD_WISHES]: {
    he: 'אפוטרופוס לדין הגיש המלצה הפוכה לרצון הילד',
    en: 'Guardian ad litem recommendation contradicts expressed child wishes',
    domain: 'E',
  },

  // Domain F — Judicial Conduct
  [PatternCategory.EX_PARTE_HEARING]: {
    he: 'דיון חד-צדדי (ex parte) ללא הודעה לצד השני',
    en: 'Ex parte hearing held without notice to the opposing party',
    domain: 'F',
  },
  [PatternCategory.RECUSAL_DENIED_CONFLICT]: {
    he: 'בקשת פסלות נדחתה על אף ניגוד עניינים',
    en: 'Recusal request denied despite documented conflict of interest',
    domain: 'F',
  },
  [PatternCategory.SYSTEMIC_HEARING_DELAYS]: {
    he: 'עיכובים שיטתיים בדיונים',
    en: 'Systemic hearing delays beyond statutory timeframes',
    domain: 'F',
  },
  [PatternCategory.MULTIPLE_JUDGE_HANDOFFS]: {
    he: 'מינוי שופטים מרובים לאותו תיק ללא הסבר',
    en: 'Multiple judge handoffs in the same case without explanation',
    domain: 'F',
  },

  // Domain G — ניכור הורי (Parental Alienation)
  [PatternCategory.ALIENATION_CHILD_WISHES_AS_RULING_BASIS]: {
    he: 'פסיקה המבוססת על רצון הילד ללא בחינת ניכור',
    en: 'Ruling based on child wishes without investigating alienation',
    domain: 'G',
  },
  [PatternCategory.ALIENATION_RAISED_IGNORED]: {
    he: 'טענת ניכור הורי הועלתה ולא נחקרה',
    en: 'Parental alienation allegation raised and not investigated',
    domain: 'G',
  },
  [PatternCategory.EVALUATOR_NO_ALIENATION_ASSESSMENT]: {
    he: 'מוערך לא בחן אינדיקטורים לניכור הורי',
    en: 'Evaluator did not screen for parental alienation indicators',
    domain: 'G',
  },
  [PatternCategory.CONNECTED_PARENT_SYSTEM_TIES]: {
    he: 'הורה מנכר הוכח כבעל קשרים עם אנשי מקצוע בתיק',
    en: 'Alienating parent has undisclosed ties to case professionals',
    domain: 'G',
  },
  [PatternCategory.SEPARATION_WINDOW_USED_FOR_ALIENATION]: {
    he: 'תקופת ההפרדה שימשה לניכור',
    en: 'Court-ordered separation period used to conduct alienation campaign',
    domain: 'G',
  },
};

export const DOMAIN_LABELS: Record<string, { he: string; en: string }> = {
  A: { he: 'ממשק פלילי-משפחתי', en: 'Criminal-to-Family Interface' },
  B: { he: 'הפרות פרוצדורליות — חוק הנוער', en: 'Procedural Violations — Youth Law' },
  C: { he: 'הפרות אנשי מקצוע רווחה', en: 'Welfare Professional Violations' },
  D: { he: 'הפרות מוערך', en: 'Evaluator Violations' },
  E: { he: 'אפוטרופוס לדין', en: 'Guardian Ad Litem Violations' },
  F: { he: 'התנהלות שיפוטית', en: 'Judicial Conduct' },
  G: { he: 'ניכור הורי', en: 'Parental Alienation' },
};
