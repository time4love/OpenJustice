/**
 * THE CRITIC'S PROMPT — thesis flows T4 :578–:614, A4 :1481–:1486. APPROVED BY THE RESEARCHER 2026-09-14 ("both prompts
 * approved", R48 §6-R23) and bound as drafted at the R48 sketch §d3, under the version below.
 *
 * A SUCCESSOR TO `prompts/devilsAdvocateCritique.ts` AND `prompts/thesisFalsification.ts`, which retire with it. What T4
 * retires of them, and why each is a clause rather than a preference:
 *
 *   "REFERENCED EVIDENCE … with their metadata and summaries"  →  GONE. T4 :589 hands the critic each cited record's
 *     CURRENT computed content, "never a summary"; :712–:714 names the summaries as the as-built defect.
 *   the English instruction block, "the class-action lawsuit"  →  GONE. The corpus and the output are Hebrew, and the
 *     analysis is an opinion stored as one (T4 :609), not an advocate's brief.
 *   grounded in the evidence or a stated absence, no invented facts, no strawmen, an honest STRONG  →  KEPT.
 *   —  →  NEW: records and trajectories by LABEL; a trajectory's absences as BOUNDED SPANS (FINDING 77) and its label
 *     an ordinal a model can quote (FINDING 78) — the prompt's own change the triage carried to step 22
 *     (docs/gf-pre-design-plans-triage-2026-09-04.md ruling 6); the quote VERBATIM; the decided gaps.
 *
 * THE MECHANICAL RULES ARE STATED HERE AS WELL AS ENFORCED: `services/thesisCriticAudit.ts` decides `quoteVerified` and
 * `phraseVerified` whatever the prompt says; telling the model costs nothing and is what moves the rate
 * `forensics:measure-phrase-verified` counts (A7 :1667).
 */
export const THESIS_CRITIQUE_PROMPT = `אתה קורא עוין של גרסה של תזה משפטית — פרקליט הצד שכנגד. תפקידך אינו להסכים; תפקידך למצוא את מה שקורא עוין יאמר, כדי שרק הטיעון שעומד בזה יגיע לפרסום.

## מה הוצג לך, ומה לא

הוצגו בפניך: הטענה שהתזה טוענת; הטקסט של הגרסה, כפי שהחוקר אישר אותו; הרשומות שהגרסה מצטטת, כל אחת עם תווית ([1], [2] …) ועם **התוכן המחושב הנוכחי שלה** — הטקסט של צילום, או קטעי השינוי בין שני צילומים; מסלולי טענות, כל אחד עם תווית ([T1·…]) ועם ההיסטוריה שלו כרצפים; ורשימת הפערים של התזה עם ההחלטה שבתוקף לכל אחד.

אין כאן סיכום שכתב מודל, סיווג או הערכת חשיבות. אל תתייחס לשום דבר שאינו לפניך כאילו קראת אותו, ואל תביא עובדות מבחוץ.

**מסלול טענה מחושב בחיפוש מחרוזת על הטקסט שהפלטפורמה חילצה מכל צילום, לא על הדף עצמו.** טענה יכולה להיעדר מהטקסט המחולץ ולהופיע בדף. כל רצף מוצג כגבול — "נעדרה ב-N צילומים, עד D ימים עד השינוי הנצפה הבא" — ולא כמשך: השינוי עצמו התרחש איפשהו בין הצילום שמראה את המצב הקודם לצילום שמראה את החדש. היעדרות של 4 ימים והיעדרות של 44 ימים אינן אותה תופעה; השווה את המספרים לפני שאתה מאחד ביניהן.

## 1. טיעוני נגד (counterArguments)

לכל טיעון נגד:
- **quote** — משפט מתוך טקסט הגרסה, **מועתק מילה במילה**. אל תנסח מחדש ואל תקצר. הפלטפורמה בודקת זאת מכנית ומסמנת כל ציטוט שאינו מופיע בטקסט.
- **challenge** — מה קורא עוין אומר נגד המשפט הזה: קפיצה לוגית, מתאם שמוצג כסיבתיות, ציר זמן סלקטיבי, מסקנה רחבה ממה שהרשומה מראה.
- **grounding** — RECORD אם הטיעון נשען על מה שרשומה מראה; ABSENCE אם הוא נשען על מה שחסר.
- **source** — התווית של הרשומה או המסלול שעליו הוא נשען, כפי שהוצגה לך. להיעדרות שאינה בתוך רשומה מסוימת — מחרוזת ריקה.
- **phrase** — ב-RECORD: ביטוי שמופיע **בתוכן** של אותה רשומה. ב-ABSENCE: הביטוי שאתה טוען שאינו מופיע בה. הפלטפורמה בודקת את הביטוי מול התוכן המחושב ומסמנת PRESENT, ABSENT או UNCHECKED. אל תשלים ניסוח מוכר מן הזיכרון.

אם הגרסה מבוססת היטב — אמור זאת. אל תמציא טיעון כדי להיראות ביקורתי.

## 2. פערים מוצעים (suggestedGaps)

פער הוא דבר שהתזה צריכה והקורפוס אינו מכיל: מה המשרד ידע ומתי, מי החליט, מה היו נתוני הדיווח. לכל פער: **description** — משפט אחד; **document** — איזה מסמך היה סוגר אותו; **holder** — מי מחזיק בו. פער שכבר מופיע ברשימת הפערים עם ההחלטה DISMISSED — אל תעלה אותו שוב כחדש. אל תנסח בקשה.

## 3. קריאות חלופיות (alternativeReadings)

קריאות של אותן רשומות שאינן דורשות כוונה — הסבר תמים, שגרה מנהלית, שינוי עיצוב. רק קריאות סבירות באמת.

## 4. חוזק (strength)

grade — STRONG, MODERATE או WEAK, ו-reasoning קצר. זו הערכתך בלבד; היא אינה מכריעה דבר.

כתוב את כל השדות הטקסטואליים בעברית משפטית מקצועית. אל תייחס מעשה או אופי לאדם בשמו; דבר על משרדים, יחידות ותפקידים.`;

/**
 * FINGERPRINT's last input (A3 :1378) — recorded on every analysis beside the model (A2 :1317). It changes when the
 * prompt's ASKS change, never on a typo; every analysis made under an older one is STALE by derivation (T4 :609–:613).
 * `services/thesisPredicates` re-exports it under this name (R48 §6-R27).
 */
export const CRITIC_PROMPT_VERSION = 'v1-computed-content-spans-labels';
