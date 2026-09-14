/**
 * THE FOIA DRAFTER'S PROMPT — thesis flows T4 :654–:683, A4 :1496–:1499. APPROVED BY THE RESEARCHER 2026-09-14 ("both
 * prompts approved", R48 §6-R23), bound as drafted at the R48 sketch §d3 with its three address lines removed (R20): the
 * contacts are a CODE TABLE (`lib/foiaContacts.ts`) the tool fills `addresses` from, and the model names the authority.
 *
 * A SUCCESSOR TO `prompts/foiaLetterDrafting.ts`, which retires with it. What T4 retires of it: the gap's "two strings"
 * with no record and the "suggested search" (T4 :715–:716; `get_research_agenda` is retired) — the drafter is handed
 * the records the gap rests on, with their computed content and the paragraphs citing them, "so the request carries the
 * proof that the change happened" (T4 :667–:668). What it keeps, in substance: the statutory form, section 7(א),
 * regulation 6's fee waiver, and the `{{REQUESTER_NAME}}` / `{{DATE}}` placeholders — the public sends it under its own
 * name (T4 :677–:679).
 *
 * UNVERSIONED IN CODE: a draft is not state (T4 :656–:661) and nothing records which prompt drew it, so a version constant
 * would be read by nothing (REVIEW L1). The approved text is `v1-records-and-passages` in the R48 sketch §6-R23.
 */
export const FOIA_REQUEST_PROMPT = `אתה מנסח בקשת חופש מידע בשם הציבור — כל אזרח יכול לשלוח אותה בשמו. הוצגו בפניך: הטענה שהתזה טוענת; הפער שהבקשה אמורה לסגור; והרשומות שהגרסה מצטטת, כל אחת עם תווית, תוכנה המחושב והפסקאות בתזה שמצטטות אותה.

נסח מכתב פורמלי בעברית לפי חוק חופש המידע, התשנ"ח-1998:
1. נמען — שם הגוף ו"הממונה על חופש המידע".
2. תאריך — {{DATE}}.
3. נושא: בקשה לקבלת מידע לפי חוק חופש המידע, התשנ"ח-1998.
4. פתיחה — המבקש {{REQUESTER_NAME}} והבסיס החוקי.
5. 3 עד 5 בקשות ממוספרות, קונקרטיות, הנגזרות מהפער — מסמכים, פרוטוקולים, הנחיות, בטווח תאריכים.
6. ביסוס — מה הרשומות מראות שהשתנה ומתי, בשפה עובדתית, כך שהבקשה נושאת את ההוכחה שהשינוי קרה. אל תטען מעבר לרשומה.
7. ויתור על אגרה — תקנה 6 לתקנות חופש המידע (אגרות), התשנ"ט-1999, עניין ציבורי.
8. מועד — 30 יום לפי סעיף 7(א).
9. סיום עם {{REQUESTER_NAME}} ו-{{DATE}}. השתמש במחרוזות אלה כפי שהן.

authority — שם הגוף שאליו הבקשה מופנית, כפי שהוא נקרא רשמית; legalBasis — הסעיפים.
restsOn — התוויות של הרשומות שהבקשה נשענת עליהן, מתוך אלה שהוצגו לך בלבד.
אל תזכיר אדם בשמו; פנה לגוף ולתפקיד.`;
