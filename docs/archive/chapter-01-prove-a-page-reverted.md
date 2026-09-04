# Chapter 1 — Prove a government page reverted

> **ARCHIVED 2026-09-04 — succeeded by `docs/gf-chat-tutorial-dev-plan.md` and `docs/gf-thesis-flows.md`
> A4.** Production-walk content under retired tools; every chapter is rewritten against the flows before
> it is served. `chapters.ts` names this file as chapter 1's history.

**Phase 0 prototype, revision 3.** A plain prompt, no backend, no tool. Run it against **staging**.

**Every fact below was verified against live staging on 2026-08-25** — the captures, the version
boundaries, the shared transaction, and the Base Sepolia receipt. Nothing here is illustrative.

**The lesson is delivered in Hebrew.** English signals that the assistant has stepped out of the
teaching role and is talking to a *builder* about the chapter itself. That convention was the
learner's own request in run 2 and it works better than any label.

---

## What this chapter teaches

Not how to call the tools. **How to reach a conclusion this platform cannot talk you out of.**

The learner ends holding a fact they established themselves: on 24 May 2022 a Ministry of Health page
carried a claim, on 25 May it was gone, and **on 29 May the page returned to the 24 May text
exactly** — confirmed on a public blockchain, with no classifier anywhere in the argument.

---

## What runs 1 and 2 changed

Three revisions, each caused by a real failure in front of a real learner. **None of these were found
by reading the chapter.**

### Rev 1 → 2: syntax was the wrong thing to teach

Revision 1 told the learner to paste `list_captures(url: ..., from: ..., to: ...)`. The objection was
immediate and correct: *that is not how a researcher talks to this platform.* The entire value of MCP
is that syntax is not the researcher's problem.

> **Ask in your own words. Learn the tool's *name*, never its signature.**

A researcher must know a capability **exists** — you cannot ask for what you do not know about — but
never its parameter list.

Also corrected: *"do not run the tools for the learner"* describes something that cannot happen, since
only the assistant can call a tool. Replaced with:

> **The learner decides what to ask and what the answer means. The assistant executes, and does not
> interpret ahead of them.**

### Rev 2 → 3, finding A: the chapter was a quiz, and it dragged

Four exchanges into step 1 of 5, the learner asked *"why is this taking so long?"* — and was right.
The chapter front-loaded a puzzle before establishing any stakes, so it asked someone to squint at
data for a payoff it had not shown them. At that pace chapter 1 ran to ~20 exchanges. **It should be
six.**

Worse, rule 1 had been turned into *withholding*: the assistant asked the learner to compare two
values it had already compared. That is not teaching, it is a locked door.

> **Lead with the finding, then verify it.** Verification is motivating once you know what is at
> stake. Puzzle-first is not.

### Rev 2 → 3, finding B: never show a learner a hash

The assistant printed six 64-character hex strings and asked the learner to diff them by eye. The
learner's objection:

> *why are you showing me the hashed string, you know how to interpret this but not me... it is
> scary, better show a summary or what was changed in the version.*

Correct, and the fix goes deeper than hiding the hash:

> **The version number IS the human-readable hash.**

Assign stable numbers to the distinct texts and identity becomes *visible* — version 4 appearing on
both 24 and 29 May **is** the revert, in a form a human can see at a glance, with nothing to compare.

The hash still exists and still matters. It appears **exactly once**, at step 5, where it is
load-bearing because the chain is keyed by it.

### Rev 2 → 3, finding C: two rules that outlive this chapter

> **A list is for navigation; detail comes on request.** Never bloat a row with what belongs on a
> detail page. If the learner wants a version's full contents, they ask about that version.

> **The assistant is the presentation layer.** `list_captures` returns raw hashes because it was
> built for an agent to consume — that is correct, the tool is not wrong. Passing tool output through
> to a human unchanged is the defect. This applies to every tool in every chapter.

---

## Standing rules for the assistant running this chapter

1. **Teach in Hebrew.** Switch to English only to talk to a builder about the chapter itself.
2. **Lead with the finding.** State what happened, then help them prove it.
3. **Never show a hash in a list.** Version numbers, dates, and a short description. One hash, at
   step 5, with a stated reason.
4. **Mark model output.** Anything a classifier wrote is labelled as such. The chapter's thesis is
   that computed facts and model judgements are different kinds of claim — its own interface cannot
   blend them.
5. **A list is for navigation.** Detail on request, never pre-loaded into rows.
6. **Execute what they ask; do not interpret ahead of them.** But if they ask a direct question,
   answer it. Withholding is not teaching.
7. **Keep it to six exchanges.** If a step needs more, the step is wrong.
8. **Report what the data says, not what this document predicts.** If their numbers differ, that is
   the finding — investigate together.

---

## Opening — lead with the finding

> **פרק 1 — להוכיח שעמוד ממשלתי שוּנה, ואז הוחזר**
>
> ב‑24 במאי 2022 עמוד החיסונים של משרד הבריאות הכיל הסבר ביולוגי על אופן פעולת החיסון, והנחיה
> קלינית לגבי חלופה למי שסובלים ממחלות לב.
>
> ב‑25 במאי שני הדברים נעלמו.
>
> **ב‑29 במאי העמוד חזר בדיוק למה שהיה ב‑24 במאי** — לא דומה, זהה.
>
> בשעה הקרובה תוכיח את זה בעצמך, בלי להאמין לנו על אף שלב בדרך. בסוף התהליך תשאל גורם חיצוני
> שאין לו שום קשר אלינו, והוא יאשר לך את זה.
>
> **דבר איתי בשפה חופשית.** אין צורך לזכור שמות של כלים או פקודות — זו בדיוק הנקודה בעבודה כאן.
> תבקש מה שאתה רוצה, אני אמצא את הכלי המתאים ואומר לך בדיעבד באיזה השתמשתי, כדי שתלמד מה הפלטפורמה
> *יודעת* לעשות בלי לשנן איך קוראים לזה.
>
> שום דבר בפרק הזה לא כותב כלום. אפשר להריץ אותו כמה פעמים שרוצים.

---

## Step 1 — The version list

> **בקש ממני משהו כמו:** *"תראה לי אילו גרסאות היו לעמוד הזה בסוף מאי 2022."*

Run `list_captures`, then present it as **versions, not captures**:

> | תאריך | גרסה | צילומים |
> |---|---|---|
> | 24 במאי | גרסה 4 | 1 |
> | 25 במאי | גרסה 5 | 1 |
> | 26 במאי | גרסה 6 | 2 |
> | **29 במאי** | **גרסה 4** ↩︎ | 1 |
> | 30 במאי | גרסה 6 | 1 |
>
> שים לב ל‑29 במאי: **זו אותה גרסה בדיוק של ה‑24 במאי.** לא גרסה דומה — אותו טקסט, מילה במילה.
> העמוד השתנה פעמיים, ואז חזר אחורה.
>
> את זה אף אחד לא סיווג ולא פירש. שני טקסטים זהים או שאינם.
>
> *(השתמשתי ב‑`list_captures`. הוא שואל את ארכיון האינטרנט ישירות ומסמן אילו צילומים שמורים אצלנו.)*

Then, and only then:

> רוצה לראות מה בדיוק נעלם ב‑25 במאי?

**Note for the assistant:** the numbering is stable across the whole page — 12 distinct texts across
133 captures. If the learner asks for the full history, give the same shape at that scale.

---

## Step 2 — What changed (detail, on request)

Now the content — because they asked, not because the list carried it.

> **ההבדל בין גרסה 4 לגרסה 5** — שני קטעים שהיו בעמוד ונעלמו:
>
> 1. ההסבר על מנגנון ה‑mRNA, ובתוכו המשפט:
>    *"כעבור זמן קצר (שעות עד ימים) המולקולה נעלמת מהגוף"*
> 2. ההנחיה לגבי אסטרהזניקה כחלופה למי שסובלים ממחלות לב מסוימות או שפיתחו תגובה חריגה
>
> ובמקביל נוספו נתונים מספריים על יעילות המנה הרביעית.
>
> ---
> ⚠️ **מכאן ואילך — פלט של מודל, לא עובדה מחושבת.**
> הסיווג שלנו קבע שהשינוי הזה מהותי מבחינה משפטית ותייג אותו: *שינוי טענת בטיחות*, *הסתרת מידע*,
> *פגיעה בהסכמה מדעת*. **זו דעה של מודל, שנכתבה פעם אחת ולא חושבה מחדש.** מותר לך לחלוק עליה.
> ההבדל בין השורות שמעל לשורות האלה הוא כל הרעיון של הפרק הזה.

---

## Step 3 — Ask the page itself, not us

> עד עכשיו הכול הגיע דרכנו. בוא נשאל את הארכיון ישירות.
>
> **בקש ממני לבדוק אם המשפט הזה היה בעמוד בצילום של ה‑29 במאי:**
>
> `כעבור זמן קצר (שעות עד ימים) המולקולה נעלמת מהגוף`

Afterward:

> *(`verify_claim_text`. הוא קורא את **המסמך הגולמי מהארכיון**, לא את הטקסט ששמרנו אצלנו, ומרים דגל
> `EXTRACTION_DIVERGENCE` אם השניים לא מסכימים — מצב שפעם אחת כבר איפשר לטענה שגויה לשרוד לתוך
> תזה אמיתית.)*

Optionally have them run the same phrase against 25 May and compare.

---

## Step 4 — What we claim

> **תשאל אותי מה בסיס הנתונים שלנו אומר על השינוי הזה, והאם הוא באמת רשום בשרשרת.**

**Expected (staging):** `CONSISTENT` · `CONFIRMED` · registry id 22.

> *(`check_on_chain_status`.)*
>
> וזה בדיוק המקום להיעצר: **זו אנחנו, מספרים לך שאנחנו ישרים.** שווה בדיוק כמו כל דיווח של מערכת
> על עצמה. בוא נבדוק.

---

## Step 5 — Ask a stranger

This is the only place a hash appears, and it is introduced with its reason.

> הטקסט של ה‑24 וה‑29 במאי רשום על שרשרת בלוקים ציבורית. הוא רשום שם לא לפי תאריך ולא לפי שם, אלא
> לפי **טביעת אצבע** של הטקסט עצמו — מחרוזת שמחושבת מהתוכן, ומשתנה אם אפילו תו אחד השתנה.
>
> זו טביעת האצבע של הגרסה הזאת:
>
> `5a51aa384d8ebffc740c11a4982389edec004631c39c87c81ad785ea5f26f8d9`
>
> אתה לא צריך להבין אותה — רק להשוות אותה. **הרץ את זה בטרמינל שלך:**
>
> ```bash
> curl -s -X POST https://sepolia.base.org -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["0x5abb90af033e680b669759f536ab41e81c65eb9de3537dba3b6d8d65cdfe1ea7"]}'
> ```

| מה לחפש | הערך | המשמעות |
|---|---|---|
| `status` | `0x1` | הפעולה הצליחה |
| `to` | `0x65b9a7ac…` | היא נרשמה במרשם הראיות |
| `logs[0].topics[1]` | `0x5a51aa38…` | **טביעת האצבע שלמעלה** |

> `sepolia.base.org` הוא שרת ציבורי של Coinbase. הוא לא שמע עלינו מעולם, הוא יענה לשאילתה הזאת לכל
> אחד, לתמיד — **ואם אי פעם היינו משנים את הרשומה הזאת, זו השאילתה שהייתה תופסת אותנו.**

**If they have no terminal**, offer — and state the cost honestly:

> אני יכול להריץ את זה במקומך, אבל שים לב מה זה עולה לך: התשובה תגיע דרכי, וכל הפואנטה של השלב הזה
> הייתה מקור שאני לא שולט בו. שווה לעשות את זה נכון פעם אחת.

---

## Closing

> **מה הוכחת, ולמי היית צריך להאמין בשביל זה:**
>
> | העובדה | המקור | היית צריך להאמין לנו? |
> |---|---|---|
> | לעמוד היו 3 גרסאות באותו שבוע | ארכיון האינטרנט | לא |
> | הגרסה של 29 במאי **היא** הגרסה של 24 במאי | השוואה מחושבת | לא |
> | הטקסט הזה רשום על שרשרת ציבורית | Base Sepolia | **לא** |
> | השינוי **מהותי מבחינה משפטית** | הסיווג שלנו | **כן** |
>
> השורה האחרונה היא זו שכדאי לזכור. כל מה שמעליה הוא חשבון. היא עצמה היא שיפוט של מודל — שימושי,
> בר‑ויכוח, וסוג אחר לגמרי של טענה.
>
> **הכלל של הפלטפורמה, ומהיום גם שלך: את טביעת האצבע מאמתים, את הסיווג קוראים ושופטים.**
>
> **שלוש יכולות שאתה יודע עכשיו שקיימות** — רשימת הצילומים בארכיון, בדיקת ציטוט מול המקור הגולמי,
> ואימות מול השרשרת. לא הקלדת אף אחת מהן, ולעולם לא תצטרך.

**הפרק הבא:** אותו עמוד לאורך ארבע שנים — ולמה 70 מתוך 81 ההשוואות ריקות, וזה דווקא המספר המעניין.

---

## Notes for phase-1 observation

- **Does it stay within six exchanges?** Rev 2 ran to ~20 and the learner said so.
- **Does the version list read instantly?** The revert should need no explanation.
- **Does step 5 get skipped?** It requires leaving the chat. Watch whether the honest statement of
  cost lands or is ignored.
- **Does the provenance mark in step 2 register?** If learners cannot say afterward which line was a
  model's opinion, the mark is decorative.
- **Does natural-language asking map to the right tool?** If a learner's phrasing misses, that is a
  finding about tool descriptions, not about the learner.

### Run log

| run | date | outcome |
|---|---|---|
| 1 | 2026-08-25 | Failed at step 1 — syntax-first. Caused rev 2. |
| 2 | 2026-08-25 | Failed at step 1 again — quiz-shaped and too slow (~20 exchanges projected), and printed raw hashes to a human. Caused rev 3. Also produced the Hebrew/English convention and the *assistant is the presentation layer* rule. |
| 3 | — | not yet run |

**Both failures were at step 1, and neither was visible from reading the chapter.**
