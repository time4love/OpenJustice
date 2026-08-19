# מדריך חיבור ChatGPT ל-MCP של "צדק לעם – תיק הקורונה"

> **הערה למודל שקורא את המסמך הזה (ChatGPT):** המסמך מיועד לך. המשתמש/ת ביקש/ה ממך עזרה
> בחיבור שרת MCP חיצוני. עברי על השלבים למטה יחד עם המשתמש/ת, שלב אחר שלב, ואל תניחי
> שהיא/הוא מכיר/ה את ממשק ה-Connectors של ChatGPT. אם שלב לא מסתדר — בקשי צילום מסך של
> המסך הרלוונטי לפני שאת מנחשת.
>
> **שני שרתים במסמך הזה:** production (חי לכל המשתמשים, כלי קריאה בלבד) ו-staging
> (סביבת בדיקות פנימית, כולל OAuth לכלי כתיבה — עדיין לא זמין לציבור). ברירת המחדל היא
> production, אלא אם המשתמש/ת מציין/ת במפורש שהוא/היא בודק/ת staging.

## מה זה השרת הזה

זהו שרת [MCP](https://modelcontextprotocol.io) של הפרויקט **צדק לעם – תיק הקורונה**
(שם קוד פנימי בקוד: Glass Fortress). הוא חושף כלי מחקר לחיפוש בכספת הראיות הציבורית של
הפרויקט — תיעוד שינויים באתרי ממשלה, פרופילים של גורמים מעורבים, טיעונים משפטיים
(theses) ועוד, וכלי כתיבה (יצירת ראיות, ניהול טיעונים) לחוקרים מאושרים.

- **Server URL (production):** `https://glass-fortress-backend-production.up.railway.app/api/mcp`
- **Transport:** Streamable HTTP (תואם ל-`server_url` שדורש ChatGPT)
- **HTTPS:** כן
- **אימות (auth) לכלי הקריאה:** אין צורך — `None` / "ללא אימות", בכל סביבה

## שלבים לחיבור ב-ChatGPT (Developer Mode → Custom Connector)

1. ב-ChatGPT: **Settings → Connectors**.
2. גלילה עד **Advanced settings**, והפעלת המתג **Developer mode**.
   (אם האפשרות לא מופיעה — ייתכן שה-Workspace/תוכנית המשתמש עדיין לא כוללים Developer
   Mode; זהו רול-אאוט הדרגתי מצד OpenAI, לא בעיה בשרת שלנו.)
3. חזרה ללשונית **Connectors** → **Create** (או "Add connector").
4. מילוי הטופס:
   - **Name:** `Glass Fortress — צדק לעם`
   - **MCP Server URL:** `https://glass-fortress-backend-production.up.railway.app/api/mcp`
   - **Authentication:** `None`
5. שמירה. ChatGPT יתחבר לשרת, יבצע `initialize` ו-`tools/list`, ואמור להציג רשימת כלים.
6. בשיחה חדשה — הפעלת ה-connector (בתפריט הכלים/`+`), ובדיקה עם שאילתה כמו:
   *"חפש/י בכספת הראיות של Glass Fortress ראיות שקשורות למשרד הבריאות"*

## הכלים הזמינים (קריאה בלבד, ללא אימות) — production

| כלי | מה הוא עושה |
|---|---|
| `search_evidence` | חיפוש סמנטי בכספת הראיות הציבורית. מסנן לפי גורם או Tier. לעולם לא מחזיר מידע מזהה אישי. |
| `get_forensic_timeline` | ציר זמן פורנזי של שינויים באתר ממשלתי מעוקב (Wayback Machine diffs) כולל הערכת משמעות משפטית. |
| `get_figure_dossier` | כל הראיות המשויכות לגורם ציבורי בשם נתון (עברית/אנגלית, התאמה חלקית). |
| `get_thesis_context` | טיעון משפטי (thesis) מלא לפי מזהה — כולל הראיות המצוטטות וביקורת ה-AI ("עורך דין השטן"). |
| `get_research_agenda` | פערי הראיות שנותרו בטיעון נתון, עם הצעות ראיות מהכספת שעשויות לסתום אותם. |
| `get_session_summary` | סיכום סשן מחקר פעיל/אחרון על טיעון נתון. |

## כלי כתיבה ב-production: עדיין לא זמינים דרך ChatGPT

לשרת יש גם כלי **כתיבה** (יצירת ראיה, פתיחת טיעון, הפעלת ניתוח AI וכו') — ב-production הם
עדיין דורשים `Authorization: Bearer <token>` אישי-סטטי לחוקר/ת (מונפק דרך
`POST /api/auth/mcp-token` באתר), וה-401/403 יחזרו בניסיון להפעיל אותם דרך ChatGPT (שלא
תומך באימות מסוג bearer/API key סטטי בחיבורי MCP — ראו §"רקע טכני" למטה).

> 💡 למי שצריך גם כלי כתיבה **היום, ב-production** — יש להשתמש ב-Claude Desktop או
> Claude Code, ששניהם תומכים בהעברת `Authorization: Bearer` סטטי בקונפיגורציית
> ה-MCP server. ראו את התגובה של `GET /api/mcp` לדוגמת קונפיגורציה.

## מצב staging — OAuth 2.1 בנוי ופעיל, עדיין לא עבר בדיקת לקוח אמיתי

שרת OAuth 2.1 מלא (Dynamic Client Registration + PKCE, עוטף את ה-Google/Supabase login
הקיים) **בנוי ופרוס על סביבת ה-staging הפנימית** — ראו `docs/gf-mcp-oauth-dev-plan.md`
לתיעוד המלא. זה עדיין **לא** ב-production; אין תאריך יעד קבוע, וזה טעון אישור מפורש
לפני שזה יעלה.

- **Server URL (staging):** `https://glass-fortress-backend-staging.up.railway.app/api/mcp`
- **Authentication:** `OAuth` (במקום `None`) — ChatGPT אמור לגלות את שרת ה-authorization
  אוטומטית דרך תגובת `GET /api/mcp` (שדה `oauth.authorizationServer`).

✅ **עודכן 2026-08-19:** `/api/mcp` שוחרר מהגנת ה-staging (`X-Staging-Token`), באותו הגיון
שכבר חל על `/oauth/*` — קריאות כלים אמיתיות (כתיבה וקריאה) עוברות היום בלי header נוסף,
ואימות הכתיבה בפועל ממשיך להתבצע כרגיל דרך ה-OAuth token (או הטוקן הישן) בלבד. אומת
ישירות: קריאת GET/POST ל-`/api/mcp` ללא header כלל, כתיבה עם טוקן OAuth תקין (ללא header
כלל) עברה בהצלחה עד ל-handler עצמו, וכתיבה ללא שום credential עדיין מחזירה 401 (מה-MCP
layer, לא מה-staging gate) — כלומר שאר סביבת ה-staging (למשל `/api/evidence`) עדיין
מוגנת כרגיל, השחרור מוגבל ל-`/api/mcp` בלבד. Phase 5 (בדיקת לקוחות אמיתיים — Claude
Desktop, Claude Code, ChatGPT) עדיין לא בוצע.

## פתרון בעיות

- **"Developer mode" לא מופיע ב-Settings:** תלוי בתוכנית/Workspace ב-ChatGPT, לא קשור לשרת שלנו.
- **חיבור נכשל / timeout:** ודאו שה-URL מסתיים ב-`/api/mcp` בדיוק (לא `/api/mcp/` עם סלאש בסוף).
- **תוצאות חיפוש ריקות:** ייתכן והכספת עדיין לא מכילה ראיות מאושרות (`CONFIRMED`) שתואמות
  לשאילתה — נסו שאילתה כללית יותר.
- **בדיקת בריאות ידנית:** `GET https://glass-fortress-backend-production.up.railway.app/api/mcp`
  (או staging, בהתאמה) מחזיר JSON עם שם השרת, רשימת הכלים, ופרטי ה-OAuth — שימושי לוודא
  שהשרת חי לפני שמנסים לחבר את ChatGPT.

## רקע טכני: למה ChatGPT דרש OAuth מלא מלכתחילה

ChatGPT connectors תומכים רק ב-`OAuth 2.1` (עם Dynamic Client Registration) או ללא
אימות בכלל — לעולם לא ב-bearer token/API key סטטי. זו הסיבה שכלי הכתיבה, שהיו תלויים
בטוקן סטטי בלבד, לא היו זמינים דרך ChatGPT מלכתחילה, ולמה נבנה שרת ה-OAuth ב-staging.
