/**
 * THE PROVISION TABLE — thesis flows A1 :1251–:1254: ONE importable table naming each provision and its element
 * shapes. A thesis carries at most one provision, fixed at creation (A2 :1262); a framing may name one (A2 :1296);
 * both columns hold a key of this table, validated at the write — never a Postgres enum, which would be a second
 * spelling of the table.
 *
 * EACH ELEMENT CARRIES ITS MEANING, since 2026-09-13. The first table held element NAMES only, and the framing
 * assessor was handed bare tokens ("DUTY_HOLDER · KNOWLEDGE_POINT …") as "the test" it was to apply. For the one
 * provision the researcher had designed by hand that was survivable; for a second provision it is not — the first
 * live framing under Israeli law found the table knew one row, opened with no provision, and a model in a chat
 * invented the article's shape ad hoc. The shape is the design's to fix (prosecutor plan §5: each article "implies
 * a record shape" — what the corpus must contain to demonstrate it), here, by the researcher, in a PR. The meaning
 * is what the assessor reads as the test, what `open_framing` returns beside each empty element, and what the
 * connector instructions derive their provision list from — one spelling, three readers.
 *
 * THE ROWS AND THEIR GROUND. ALL TEN ARTICLES OF THE NUREMBERG CODE are rows — the researcher, 2026-09-13: the
 * case is the whole Code, article by article, and Article 1 is the example, never the scope. Four follow
 * docs/gf-prosecutor-dev-plan.md §5's table verbatim in substance (Article 1: knowledge point + disclosure
 * timeline + divergence; 10: a harm signal reaching the responsible body + continuation or expansion; 7: a
 * protective mechanism present or absent; 5: a risk assessment held before the intervention began). The other
 * six — 2, 3, 4, 6, 8, 9 — are DRAFT SHAPES written here for the first time, each asking the same question §5
 * asks of an article: what must the corpus contain to demonstrate it? Every one is read against the two
 * timelines this platform holds — what the public was told, capture by capture, and what the office knew or
 * did — so an article about the CONDUCT of the intervention (4, 8, 9) is shaped by what the public record
 * shows of that conduct, which is the weakest reading and is said so in its elements. PATIENT_RIGHTS_13 rests on חוק זכויות החולה, התשנ"ו-1996 §13(b)(3) — the
 * medical information a caregiver owes before consent includes "הסיכונים הכרוכים בטיפול, לרבות תופעות לוואי" — and
 * ADMIN_DISCLOSURE_DUTY on the basis the published thesis itself argued (prosecutor plan §4: "Israeli
 * administrative duties of disclosure and negligence"). THE ISRAELI-LAW ROWS ARE THE RESEARCHER'S LEGAL READING TO
 * CONFIRM, and counsel's where COMPLIANCE.md says so; this file records shapes, not legal advice.
 *
 * DUTY_HOLDER IS THE OFFICE in every row (prosecutor plan §6): a person adds nothing to a charge and is the
 * platform's most exposed assertion. Where a statute's own words place the duty on a person — §13's "מטפל" — the
 * element says so and says what the thesis rests on instead.
 *
 * Extending or amending the table is the researcher's, in a PR. Nothing here imports anything.
 */

/** One provision: its title, and each element the framing must fill with what that element means. */
export interface ProvisionShape {
  readonly title: string;
  readonly elements: Readonly<Record<string, string>>;
}

const DUTY_HOLDER_THE_OFFICE = 'נושא החובה — המשרד, הגוף שיזם, הנחה או ניהל את ההתערבות; לעולם לא אדם בשמו';
const DIVERGENCE_FROM_CAPTURES =
  'הפער בין שני הצירים על פני מרווח המחושב מצילומי הארכיון — לעולם לא מזוג תאריכים שמור';

export const PROVISIONS = {
  NUREMBERG_1: {
    title: 'קוד נירנברג, סעיף 1 — הסכמה מרצון על יסוד ידיעה והבנה מספקות של הסיכונים',
    elements: {
      DUTY_HOLDER: DUTY_HOLDER_THE_OFFICE,
      KNOWLEDGE_POINT:
        'מה ידע המשרד, ומתי — פרוטוקול, מצגת, תכתובת, ממצא שהוצג לו; או פרסום המדווח על כך, הנרשם כפרסום ולא כעובדה',
      DISCLOSURE_TIMELINE: 'מה נאמר לציבור, צילום אחר צילום, בדף שהמשרד עצמו מפרסם',
      DIVERGENCE: DIVERGENCE_FROM_CAPTURES,
    },
  },
  NUREMBERG_2: {
    title: 'קוד נירנברג, סעיף 2 — הניסוי יביא תוצאות מועילות לחברה שאין להשיגן בדרך אחרת, ולא ייערך באקראי או ללא צורך',
    elements: {
      DUTY_HOLDER: DUTY_HOLDER_THE_OFFICE,
      STATED_NECESSITY: 'הצורך וההצדקה כפי שהוצגו לציבור — למה נחוץ, למי, ומדוע עכשיו — צילום אחר צילום',
      ALTERNATIVE_KNOWN:
        'חלופה שהייתה ידועה למשרד — דרך אחרת להשגת אותה תועלת, או ראיה שהתועלת אינה מושגת — ומתי ידע עליה',
      DIVERGENCE: DIVERGENCE_FROM_CAPTURES,
    },
  },
  NUREMBERG_3: {
    title: 'קוד נירנברג, סעיף 3 — הניסוי יתבסס על ניסויים קודמים וידע על טבע המחלה, כך שהתוצאות הצפויות מצדיקות אותו',
    elements: {
      DUTY_HOLDER: DUTY_HOLDER_THE_OFFICE,
      PRIOR_EVIDENCE_BASE:
        'בסיס הראיות שהיה בידי המשרד לפני ההתערבות או הרחבתה — ניסויים, נתונים, ידע על המחלה באוכלוסייה הנדונה — ומתי',
      CLAIMED_BASIS: 'הבסיס שהוצג לציבור כהצדקה — "נבדק", "נמצא בטוח", "מאושר" — צילום אחר צילום',
      DIVERGENCE: DIVERGENCE_FROM_CAPTURES,
    },
  },
  NUREMBERG_4: {
    title: 'קוד נירנברג, סעיף 4 — הניסוי ייערך כך שיימנעו כל סבל ופגיעה גופניים ונפשיים שאינם הכרחיים',
    elements: {
      DUTY_HOLDER: DUTY_HOLDER_THE_OFFICE,
      KNOWN_HARM: 'פגיעה או סבל שהיו ידועים למשרד — ממצא, דיווח, אות — ומתי נודעו לו',
      AVOIDABLE_MEASURE:
        'צעד שהיה מונע או מצמצם את הפגיעה — הנחיה, התוויית-נגד, סינון, אזהרה — והאם ננקט, ומתי, כפי שהדף הרשמי מתעד',
      OMISSION_WINDOW: 'המרווח שבין הידיעה לצעד, או שבו הצעד נעדר, מחושב מצילומי הארכיון',
    },
  },
  NUREMBERG_5: {
    title: 'קוד נירנברג, סעיף 5 — אין לבצע ניסוי כשיש סיבה מראש להאמין שייגרמו מוות או נכות',
    elements: {
      DUTY_HOLDER: DUTY_HOLDER_THE_OFFICE,
      PRIOR_RISK_ASSESSMENT:
        'הערכת סיכון שהייתה בידי המשרד לפני תחילת ההתערבות או לפני הרחבתה לאוכלוסייה נוספת — ומתי הייתה בידיו',
      INTERVENTION_START:
        'מועד תחילת ההתערבות או הרחבתה — הרחבת זכאות, מנה נוספת, קבוצת גיל — כפי שהדף הרשמי מתעד אותו צילום אחר צילום',
      DIVERGENCE: DIVERGENCE_FROM_CAPTURES,
    },
  },
  NUREMBERG_6: {
    title: 'קוד נירנברג, סעיף 6 — דרגת הסיכון לא תעלה לעולם על החשיבות ההומניטרית של הבעיה שהניסוי אמור לפתור',
    elements: {
      DUTY_HOLDER: DUTY_HOLDER_THE_OFFICE,
      RISK_KNOWN: 'הסיכון כפי שהיה ידוע למשרד — שיעורו, חומרתו, האוכלוסייה — ומתי היה ידוע',
      BENEFIT_CLAIMED: 'התועלת כפי שהוצגה לציבור — לאותה אוכלוסייה, באותו זמן — צילום אחר צילום',
      PROPORTION_GAP:
        'הפער בין הסיכון הידוע לתועלת שהוצגה, לאוכלוסייה מוגדרת ועל פני מרווח המחושב מצילומים — לא שיפוט רפואי, אלא מה נאמר מול מה נודע',
    },
  },
  NUREMBERG_7: {
    title: 'קוד נירנברג, סעיף 7 — הכנות ואמצעים נאותים להגנה על הנבדק מפני פגיעה',
    elements: {
      DUTY_HOLDER: DUTY_HOLDER_THE_OFFICE,
      PROTECTIVE_MECHANISM:
        'מנגנון ההגנה — ערוץ הדיווח על תופעות לוואי, מערכת מעקב, הנחיה רפואית — והאם היה קיים, זמין ומוצג לציבור',
      MECHANISM_TIMELINE: 'קיומו, היעדרו או הסרתו של המנגנון מן הדף הרשמי, צילום אחר צילום',
      HARM_EXPOSURE:
        'האוכלוסייה שהייתה חשופה להתערבות בזמן שהמנגנון נעדר — כפי שהדף עצמו מתעד: המלצה, זכאות, קמפיין',
    },
  },
  NUREMBERG_8: {
    title: 'קוד נירנברג, סעיף 8 — הניסוי ייערך רק על ידי אנשים בעלי כישורים מדעיים, ובמידת המיומנות והזהירות הגבוהה ביותר',
    elements: {
      DUTY_HOLDER: DUTY_HOLDER_THE_OFFICE,
      DECIDING_BODY:
        'הגוף שקבע את ההתערבות או את הרחבתה — ועדה, יחידה, תפקיד; לעולם לא אדם בשמו — כפי שהרשומות מתעדות אותו',
      CARE_STANDARD_KNOWN:
        'אמת המידה של זהירות שהייתה ידועה — הנחיה מקצועית, המלצת גוף מקצועי, ממצא שדרש שיקול — ומתי',
      DEPARTURE_RECORD:
        'החריגה מאמת המידה כפי שהרשומה הציבורית מתעדת אותה — צעד שננקט, או נעדר, בניגוד לידוע — על פני מרווח מחושב מצילומים',
    },
  },
  NUREMBERG_9: {
    title: 'קוד נירנברג, סעיף 9 — הנבדק חופשי להפסיק את השתתפותו בכל עת',
    elements: {
      DUTY_HOLDER: DUTY_HOLDER_THE_OFFICE,
      COERCIVE_MEASURE:
        'האמצעי שכרך את ההתערבות בתנאי — תו, הגבלת גישה, דרישת תעסוקה, מנה נוספת כתנאי לתוקף — כפי שהדף הרשמי מתעד',
      MEASURE_TIMELINE: 'תוקפו, היקפו והרחבתו של האמצעי, צילום אחר צילום',
      EXIT_COST: 'מה עלתה הפסקה או הימנעות — מה נשלל ממי שלא המשיך — כפי שהרשומה הציבורית אומרת, לא כפי שנטען',
    },
  },
  NUREMBERG_10: {
    title: 'קוד נירנברג, סעיף 10 — חובה להפסיק כשיש סיבה סבירה להאמין שהמשך ההתערבות יגרום פגיעה',
    elements: {
      DUTY_HOLDER: DUTY_HOLDER_THE_OFFICE,
      HARM_SIGNAL: 'אות פגיעה שהגיע לגוף האחראי — ממצא, דיווח, אזהרה — ומועד הגעתו אליו',
      CONTINUATION_OR_EXPANSION:
        'המשך ההתערבות או הרחבתה אחרי האות — הרחבת גיל, מנה נוספת, המלצה מחודשת — כפי שהדף הרשמי מתעד צילום אחר צילום',
      DIVERGENCE: 'הפער בזמן בין האות לבין ההמשך או ההרחבה, מחושב מצילומי הארכיון',
    },
  },
  PATIENT_RIGHTS_13: {
    title: 'חוק זכויות החולה, התשנ"ו-1996, סעיף 13 — הסכמה מדעת: מסירת המידע הרפואי הדרוש, ובכללו הסיכונים ותופעות הלוואי (13(ב)(3))',
    elements: {
      DUTY_HOLDER:
        'החב בגילוי — לפי לשון הסעיף המטפל המקבל את ההסכמה; כאשר התזה נשענת על הדף הרשמי, הרשות הציבורית שקבעה מה ייאמר לציבור — ויש לומר במפורש על מה נשען היסוד',
      MATERIAL_INFORMATION:
        'המידע שהיה חייב להימסר — סיכונים ותופעות לוואי שהיו ידועים — ומה ידע הגורם החב על אודותיו, ומתי',
      DISCLOSURE_GIVEN: 'מה נמסר בפועל בערוץ הגילוי — הדף הרשמי — צילום אחר צילום',
      OMISSION_WINDOW: 'המרווח שבו המידע נעדר מן הגילוי, מחושב מצילומי הארכיון — לעולם לא מזוג תאריכים שמור',
    },
  },
  ADMIN_DISCLOSURE_DUTY: {
    title: 'חובת הגילוי של רשות מנהלית — חובת ההגינות והשקיפות של רשות ציבורית כלפי הציבור, הבסיס שעליו עמדה התזה שפורסמה',
    elements: {
      DUTY_HOLDER: 'הרשות הציבורית — המשרד, בתוקף סמכותו כלפי הציבור',
      KNOWLEDGE_POINT:
        'מה ידעה הרשות, ומתי — מסמך, ממצא, דיון; או פרסום המדווח על כך, הנרשם כפרסום ולא כעובדה',
      PUBLIC_RECORD: 'מה פרסמה הרשות לציבור, צילום אחר צילום, בדף שהיא עצמה מפרסמת',
      OMISSION_WINDOW: 'המרווח שבו הידוע לרשות נעדר מן הפרסום, מחושב מצילומי הארכיון',
    },
  },
} as const satisfies Readonly<Record<string, ProvisionShape>>;

export type Provision = keyof typeof PROVISIONS;

/** The element names a provision requires, in the table's order; none for no provision or an unknown one. */
export function elementNamesOf(provision: string | null): readonly string[] {
  return elementsOf(provision).map((e) => e.element);
}

/** Each element with its meaning — what the assessor reads as the test and what open_framing returns. */
export function elementsOf(provision: string | null): readonly { element: string; means: string }[] {
  if (provision === null) return [];
  // Values typed as possibly undefined so the guard below is NECESSARY under both debt ratchets
  // (CLAUDE.md, the .at() note): a record lookup by an arbitrary string can miss.
  const shapes: Readonly<Record<string, ProvisionShape | undefined>> = PROVISIONS;
  const shape = shapes[provision];
  if (shape === undefined) return [];
  return Object.entries(shape.elements).map(([element, means]) => ({ element, means }));
}
