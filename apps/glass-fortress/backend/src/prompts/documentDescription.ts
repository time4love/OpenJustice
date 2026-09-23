import { LEGAL } from '../mcp/instructions';

/**
 * THE DESCRIBER'S PROMPT — docs/gf-document-flows.md A4 :1437-:1441 (`describe_document`), §3 :293-:305
 * (the OPINION register) and §6 :686-:691 (the researcher asks for a reading to be recorded).
 *
 * A PAID CALL, ON THE RESEARCHER'S WORD, AND ITS TEXT IS SHOWN TO THE RESEARCHER BEFORE IT LANDS (R76 chunk-2
 * prompt §3; COMPLIANCE :113-:124). The model reads ONE document — an image or a PDF AS ITS FILE, a spreadsheet
 * THROUGH ITS COMPUTED TEXT (A4 :1441 as ruled 2026-09-23) — and returns a reading that is stored as an OPINION:
 * labelled with the model and this prompt's version, never pinned, never cited, never published (§3 :291-:296;
 * architecture §11.7 :707).
 *
 * WHAT IT MUST NOT DO, and each is a clause: judge whether the document is authentic, credible, relevant or
 * important — credibility is the researcher's reading, argued in the citation, never a kind (§1 :62-:68); decide
 * anything — a model writes an opinion and no state (thesis §2 :176-:179); present a guess as a fact — a reading
 * that could not see a field leaves it out rather than inventing it.
 *
 * THE LEGAL FRAMING IS IMPORTED, NEVER RETYPED — `LEGAL` from `mcp/instructions.ts`, the one spelling the
 * connector's own instructions carry.
 */
export const DOCUMENT_DESCRIPTION_PROMPT = `אתה קורא מסמך אחד שחוקר מחזיק, ומתאר אותו. מה שתכתוב יישמר כ**קריאה של מודל** — מתויגת כניתוח AI, לעולם לא כעובדה, לעולם לא כציטוט, ולעולם לא תפורסם. החוקר ביקש את הקריאה הזו במפורש, והיא עולה כסף.

## מה לפניך

מסמך אחד: או הקובץ עצמו (תמונה או PDF), או הטקסט שהפלטפורמה חילצה ממנו (גיליון נתונים — תאים לפי גיליון, שורה אחר שורה, מופרדים בטאבים). לצידו השם שהחוקר נתן למסמך, כדי שתדע על מה מדובר. השם אינו חלק מהמסמך: אל תתאר אותו, אל תצטט אותו ואל תסיק ממנו דבר שאינו כתוב במסמך עצמו. אין לפניך דבר נוסף: לא דף, לא תזה, לא הקשר. אל תביא עובדות מבחוץ.

## מה להחזיר — כל שדה רק אם אתה רואה אותו במסמך

- **description** — מה המסמך נראה להיות, כפי שהוא מציג את עצמו: נייר מכתבים, טופס, חותמת, חתימה, נמענים, תאריך כפי שהודפס. תאר את הסימנים, אל תקבע מה הם מוכיחים.
- **transcription** — לתמונה או ל-PDF סרוק: הטקסט הנראה, מילה במילה, בסדר הקריאה. סמן [לא קריא] במקום שאינך יכול לקרוא. לגיליון: השאר ריק — הטקסט המחושב כבר קיים.
- **summary** — שניים-שלושה משפטים: על מה המסמך מדבר, במילותיו.
- **date** — התאריך כפי שהוא מודפס במסמך, אם יש כזה. לא תאריך שאתה מסיק.
- **actors** — הגופים, היחידות והתפקידים שהמסמך עצמו מזכיר, כפי שהוא כותב אותם.
- **categories** — השאר ריק, אלא אם המסמך עצמו מסווג את נושאו.

## מה אסור

- אל תקבע אם המסמך אמיתי, אמין, שלם או חשוב. האמינות היא קריאה של החוקר, ונטענת בציטוט — לא שלך.
- אל תנחש. שדה שאינך רואה — השמט אותו.
- אל תכתוב על כוונות, אשמה או אופי של אדם.

${LEGAL}`;

/**
 * Moves with every change to the prompt's text — stored on every reading beside the model (COMPLIANCE rule 3), and
 * PINNED to the text's hash in `test/documentDescriber.test.ts`. v2 (R78 round 2): the title is the researcher's name
 * for the document, not part of it, and is not described.
 */
export const DOCUMENT_DESCRIPTION_PROMPT_VERSION = 'v2-one-document-title-not-described';
