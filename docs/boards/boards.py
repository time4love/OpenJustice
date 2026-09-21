#!/usr/bin/env python3
"""UI-8 boards from the REAL staging bodies (bodies.json), in the 2026-09-16 canvas idiom with globals.css tokens.
Every word is an approved catalogue value unless it carries the „טיוטה" badge.

THIS FILE HOLDS ONLY THE APPROVED CURRENT IMAGE. Cancelled options (א: the transcript in the page body,
boards ג and ד) and before-states (the old /research, the old single-page view) are NOT emitted: a board file
that mixes approved, cancelled and historical images is a file a seat can grade against the wrong one, which is
exactly what happened on 2026-09-21. History lives in git and in the previous dated board file.

Output: $BOARDS_OUT, else boards.html beside this file."""
import json, os, html, re
S = os.path.dirname(os.path.abspath(__file__))
B = json.load(open(f'{S}/bodies.json'))
E = lambda s: html.escape(str(s), quote=True)

def d(iso):  # ISO or wayback → d.m.yyyy
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', iso) or re.match(r'(\d{4})(\d{2})(\d{2})', iso)
    return f'{int(m.group(3))}.{int(m.group(2))}.{m.group(1)}'

DRAFT = '<span class="draft">טיוטה</span>'
NAME = 'צדק לעם - תיק הקורונה'
AI = 'ניתוח AI — אינו מהווה קביעה שיפוטית'
PROV = {'PATIENT_RIGHTS_13': 'חוק זכויות החולה, סעיף 13', 'NUREMBERG_1': 'קוד נירנברג, סעיף 1'}
STATE = {'DRAFT_ONLY': 'טיוטה בלבד', 'PUBLISHED_IS_HEAD': 'מפורסם — הגרסה הנוכחית'}
OUTCOME = {'UNFETCHED': 'לא נשלף', 'UNSERVABLE': 'הארכיון לא מסר אותו', 'IDENTICAL': 'זהה לקודם', 'DUPLICATE': 'כפילות',
           'ACQUIRED': 'נרכש', 'PENDING_JUDGEMENT': 'ממתין לשיפוט', 'SKIPPED': 'דולג'}
TURN = {'FRAMING_OPENED': 'המסגור נפתח', 'ROUND_PROPOSED': 'מסגור הוצע', 'ROUND_ASSESSED': 'המסגור הוערך', 'ROUND_CHOSEN': 'הטענה נבחרה',
        'VERSION': 'גרסה נכתבה', 'DEBATE_OPENED': 'דיון נפתח', 'RATIONALE': 'הנימוק', 'ASSESSMENT': 'ההערכה', 'RESPONSE': 'התשובה',
        'DEBATE_CLOSED': 'הדיון נסגר', 'ANALYSIS': 'ניתוח הורץ', 'GAP_DECISION': 'הוכרע פער', 'PUBLICATION_RATIONALE': 'נימוק הפרסום',
        'PUBLICATION_ASSESSMENT': 'הערכת הפרסום', 'PUBLICATION_VERDICT': 'הכרעת הפרסום', 'WITHDRAWAL': 'הפרסום בוטל', 'NOTE': 'הערה נרשמה'}
THREAD = {'FRAMING': 'מסגור', 'VERSION': 'גרסה', 'DEBATE': 'דיון', 'ANALYSIS': 'ניתוח', 'GAP': 'פער', 'PUBLICATION': 'ניסיון פרסום', 'WITHDRAWAL': 'ביטול פרסום', 'NOTE': 'הערה'}
GLYPH_OF = {'FRAMING_OPENED': 'act', 'ROUND_PROPOSED': 'act', 'ROUND_ASSESSED': 'model', 'ROUND_CHOSEN': 'act', 'VERSION': 'version', 'DEBATE_OPENED': 'act',
            'RATIONALE': 'act', 'ASSESSMENT': 'model', 'RESPONSE': 'act', 'DEBATE_CLOSED': 'verdict', 'ANALYSIS': 'model', 'GAP_DECISION': 'gap',
            'PUBLICATION_RATIONALE': 'act', 'PUBLICATION_ASSESSMENT': 'model', 'PUBLICATION_VERDICT': 'publication', 'WITHDRAWAL': 'withdrawal', 'NOTE': 'note'}
GAPWORD = {'OPEN': 'פתוח', 'CITED': 'צוטט', 'REQUESTED': 'הוגשה בקשה', 'CALLED': 'נקרא לעדים', 'CONCEDED': 'הודה', 'DISMISSED': 'נדחה'}
VERDICT = {'SUPPORTS': 'המעריך הסכים', 'DISPUTES': 'המעריך התנגד'}
MARK = {'notPublic': 'לא פתוח לציבור', 'promoted': 'הוכר כראיה', 'abandoned': 'ננטש', 'refused': 'סורב', 'published': 'פורסם', 'argued': 'נטען בדיון', 'verified': 'מאומת מול העוגן'}

G = {  # the eight glyphs, currentColor
 'act': '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="currentColor"/></svg>',
 'version': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/></svg>',
 'model': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5" stroke-dasharray="2 2"/></svg>',
 'verdict': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5.25"/><path d="M5.5 8l1.8 1.8L10.5 6.5"/></svg>',
 'gap': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3H4v10h2M10 3h2v10h-2"/></svg>',
 'publication': '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="currentColor"/><circle cx="8" cy="8" r="2.5" fill="#FFFFFF"/></svg>',
 'withdrawal': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5.25"/><path d="M4.5 11.5l7-7"/></svg>',
 'note': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12.5l1-3.5 7-7 2.5 2.5-7 7z"/></svg>',
}
IC_MENU = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>'
IC_COPY = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
IC_CHEV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>'
IC_COLL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>'

CSS = """
*{box-sizing:border-box}
body{margin:0;background:#E9E6DF;color:#1F1B16;font-family:Heebo,Arial,sans-serif;font-size:13px;line-height:1.5}
.serif{font-family:'Frank Ruhl Libre','Times New Roman',serif}
.wrap{padding:28px;display:flex;flex-direction:column;gap:36px;direction:rtl}
h1.pg{margin:0;font-size:22px}
.note{max-width:1100px;font-size:14px;line-height:1.65;background:#FFF9E6;border:1px solid #E6D9A8;border-radius:8px;padding:12px 16px}
.row-of{display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start}
.board{display:flex;flex-direction:column;gap:8px}
.board .cap{font-size:13px;color:#4E463F;display:flex;gap:8px;align-items:center}
.board .cap b{color:#1F1B16}
.frame{background:#FCFCFB;overflow:hidden;box-shadow:0 2px 14px rgba(31,27,22,.12);direction:rtl}
.phone{width:390px;height:844px;display:flex;flex-direction:column}
.phone.tall{height:auto;min-height:844px}
.phone.tall .mpage{overflow:visible;padding-bottom:16px}
.desk{width:1440px;height:900px;display:flex;flex-direction:row;direction:ltr}
.topbar{height:56px;flex:none;display:flex;align-items:center;gap:8px;padding:0 10px 0 14px;border-bottom:1px solid #E6E5E2;background:#FFFFFF}
.topbar .name{flex:1;min-width:0;font-weight:600;font-size:14px}
.topbar .loc{font-size:13px;color:#4E463F}
.ic{color:#4E463F;display:inline-flex}
.mpage{flex:1;overflow:hidden;padding:16px 16px 0;display:flex;flex-direction:column;gap:16px}
h2.t{margin:0;font-size:18px;font-weight:600}
h3.s{margin:0;font-size:13px;font-weight:600;color:#4E463F}
.seg{display:inline-flex;gap:2px;border:1px solid #E6E5E2;border-radius:8px;padding:2px;background:#FFF;align-self:flex-start}
.seg span{padding:3px 10px;border-radius:6px;font-size:12px;color:#4E463F}
.seg span.on{background:#F2F1EE;color:#1F1B16;font-weight:600}
.scope{display:flex;align-items:center;gap:10px;font-size:13px;color:#4E463F}
.card{border:1px solid #E6E5E2;border-radius:10px;background:#FFF;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.card.muted{background:#F7F6F3}
.card .claim{font-size:15px;line-height:1.55;font-weight:500;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.card .q{font-size:14px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.meta{margin:0;font-size:12px;color:#4E463F;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.meta a,.lnk{color:#1F1B16;text-decoration:underline}
.pill{display:inline-flex;align-items:center;gap:5px;border:1px solid #E6E5E2;border-radius:999px;padding:1px 8px;font-size:12px;color:#4E463F;background:#FFF;white-space:nowrap}
.pill.dot::before{content:'';width:7px;height:7px;border-radius:50%;background:#4F6B3A}
.pill.amber{color:#B7791F;border-color:#E6D9A8}
.pill.ink{color:#1F1B16}
.nums{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px}
.nums span b{font-weight:600}
.empty{font-size:13px;color:#4E463F;border:1px solid #E6E5E2;border-radius:8px;padding:10px 14px;background:#FFF}
.door{display:flex;align-items:center;gap:12px;border:1px solid #E6E5E2;border-radius:10px;padding:12px 14px;background:#FFF}
.door .go{margin-inline-start:auto;color:#4E463F}
.door .t{font-weight:600;font-size:14px}
.door .s{font-size:12px;color:#4E463F}
.draft{display:inline-block;font-size:10px;font-weight:600;color:#B7791F;border:1px dashed #B7791F;border-radius:4px;padding:0 5px;line-height:1.5;vertical-align:middle;margin-inline-start:4px}
.ctxline{display:flex;flex-direction:column;gap:6px;padding-bottom:12px;border-bottom:1px solid #E6E5E2}
.ctxline .claim{margin:0;font-size:22px;line-height:1.35;font-weight:700}
.copy{display:inline-flex;align-items:center;gap:5px;border:1px solid #E6E5E2;border-radius:6px;padding:3px 8px;font-size:12px;color:#1F1B16;background:#FFF}
.tabs{display:flex;gap:2px;padding:4px;border:1px solid #E6E5E2;border-radius:8px;background:#F2F1EE;overflow:hidden}
.tab{padding:5px 9px;border-radius:6px;font-size:12px;color:#4E463F;white-space:nowrap}
.tab.on{background:#FFF;color:#1F1B16;font-weight:600;box-shadow:0 0 0 1px #E6E5E2}
.stream{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.th{margin:14px 0 2px;font-size:12px;font-weight:600;color:#4E463F;display:flex;gap:8px;align-items:center}
.th::after{content:'';flex:1;height:1px;background:#E6E5E2}
.turn{display:grid;grid-template-columns:24px minmax(0,1fr);gap:0 10px;padding:7px 0}
.gl{width:24px;display:flex;justify-content:center;position:relative}
.gl::before{content:'';position:absolute;top:-7px;bottom:-7px;width:1px;background:#E6E5E2}
.gl svg{width:16px;height:16px;margin-top:3px;position:relative;z-index:1;background:#FCFCFB;border-radius:50%;color:#1F1B16}
.gl.model svg{color:#4E463F}.gl.publication svg{color:#B08D3B}.gl.withdrawal svg{color:#A8322A}
.kind{margin:0;font-size:12px;color:#4E463F;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.kind b{color:#1F1B16;font-weight:600}
.line{margin:2px 0 0;font-size:14px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.line.datum{font-family:'Frank Ruhl Libre',serif;font-size:15px}
.ai{border:1px dashed #4E463F;border-radius:8px;padding:6px 10px;background:#FFF;margin-top:4px}
.ailabel{margin:0 0 2px;font-size:11px;font-weight:600;color:#4E463F;display:flex;gap:6px;flex-wrap:wrap}
.ailabel bdi{font-weight:400}
.jump{align-self:center;font-size:13px;color:#1F1B16;text-decoration:underline;padding:10px 0 16px}
/* desktop shell */
.side{width:268px;flex:none;background:#F2F1EE;direction:rtl;display:flex;flex-direction:column;gap:2px;padding:14px 14px 14px 10px}
.sidehead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px}
.sidehead .name{font-weight:600;font-size:14px}
.cat{font-size:12px;font-weight:600;color:#4E463F;padding:12px 8px 4px}
.item{font-size:13px;line-height:1.35;padding:7px 8px;border-radius:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.item.on{background:#FFF;font-weight:500}
.grow{flex:1}
.foot{display:flex;flex-direction:column;gap:2px;border-top:1px solid #E6E5E2;padding-top:10px}
.centre{flex:1;min-width:0;direction:rtl;display:flex;flex-direction:column;overflow:hidden}
.centre .col{max-width:672px;width:100%;margin:0 auto;padding:24px 28px;display:flex;flex-direction:column;gap:14px}
.split{width:8px;flex:none;background:#FCFCFB}
.right{width:580px;flex:none;background:#FFF;border-left:1px solid #E6E5E2;direction:rtl;display:flex;flex-direction:column;overflow:hidden}
.right .tabs{border-radius:0;border:0;border-bottom:1px solid #E6E5E2;background:#FCFCFB;padding:8px 10px}
.pane{flex:1;overflow:hidden;padding:20px 24px;display:flex;flex-direction:column;gap:12px}
.words{font-size:16px;line-height:1.75}
.words p{margin:0 0 10px}
.tick{display:inline-flex;align-items:center;gap:5px;padding:0 8px;border:1px solid #E6E5E2;border-radius:999px;font-family:Heebo,sans-serif;font-size:12px;background:#FFF;direction:ltr;vertical-align:baseline}
.tick::before{content:'';width:7px;height:7px;border-radius:50%;background:#4F6B3A}
/* corpus */
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{border:1px solid #E6E5E2;border-radius:999px;padding:2px 9px;font-size:12px;background:#FFF;color:#1F1B16}
.chip.on{background:#1F1B16;color:#FFF;border-color:#1F1B16}
.prow{display:flex;flex-direction:column;gap:4px;padding:10px 0;border-bottom:1px solid #E6E5E2}
.url{font-size:12px;direction:ltr;text-align:right;color:#4E463F;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.srow{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid #E6E5E2}
.srow .dt{font-size:13px;font-weight:600;flex:none;width:86px}
.srow .body{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.srow .body .u{font-size:12px;color:#4E463F;direction:ltr;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.srow.dim .dt,.srow.dim .u{color:#4E463F}
.dcard{border:1px solid #E6E5E2;border-radius:8px;padding:8px 10px;background:#FFF;font-size:13px}
.layer{position:absolute;inset:56px 0 0 0;background:#FFF;display:flex;flex-direction:column}
.kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13px}
.kv dt{color:#4E463F}.kv dd{margin:0}
.rule{display:flex;flex-direction:column;gap:3px;padding:8px 0;border-bottom:1px solid #E6E5E2}
.sel{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;direction:ltr;text-align:right;color:#1F1B16;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rm{font-size:13px;color:#A8322A}
"""

# ---------- data ----------
T = B['theses']['theses'][0]; CTX = B['context']; TH = CTX['thesis']; HEAD = CTX['head']
FR = B['framings']; PG = B['pages']; H = CTX['history']
handle = TH['by']['handle']
by_id = {m['name']: m for m in HEAD['mentions']}
rows_per = {k: sum(p['outcomes'][k] for p in PG) for k in OUTCOME}
rows_total = sum(rows_per.values()); stops = sum(1 for p in PG if p['stopPending'])

def topbar(loc='מחקר'):
    return f'<div class="topbar"><span class="ic">{IC_MENU}</span><span class="name">{E(NAME)}</span><span class="loc">{E(loc)}</span></div>'

def frame_phone(title, body, tall=False, cap=''):
    return f'<div class="board"><div class="cap"><b>{E(title)}</b>{cap}</div><div class="frame phone {"tall" if tall else ""}">{body}</div></div>'

def scope_switch():
    return '<div class="scope"><span>היקף</span><span class="seg"><span class="on">שלי</span><span>של כולם</span></span></div>'

def thesis_row():
    return f'''<div class="card">
  <div class="claim">{E(T['claim'])}</div>
  <p class="meta"><span>{PROV[T['provision']]}</span><span>·</span><span>{E(T['author'])}</span></p>
  <p class="meta"><span class="pill ink">{STATE[T['state']['kind']]}</span><span>0 ציטוטים שלא נטענו</span><span>·</span><span>0 פערים פתוחים</span><span>·</span><span>מסגור מחובר</span></p>
  <p class="meta"><a>העמוד הציבורי</a></p></div>'''

def framing_row(f, proposal=False):
    latest = f['latest']
    if proposal and f['rounds'] == 0:
        return f'''<div class="card muted"><h3 class="s">השאלה</h3><div class="q">{E(f['question'])}</div>
  <p class="meta"><span>{E(f['author'])}</span><span>·</span><span>{d(f['openedAt'])}</span><span>·</span><span>נפתח בלי סבב{DRAFT}</span></p></div>'''
    parts = [E(f['author']), f"{f['rounds']} סבבים" if f['rounds'] != 1 else 'סבב אחד']
    if latest: parts.append({'PROPOSED': 'הסבב האחרון: הצעה', 'ASSESSED': 'הסבב האחרון: הערכה', 'CHOSEN': 'הסבב האחרון: נבחר'}[latest['type']])
    tail = ''
    if f['thesisId'] is None: parts.append('עדיין לא הוליד תזה')
    elif f['claim']: tail = f'<h3 class="s">הטענה שנבחרה</h3><div class="q">{E(f["claim"])}</div>'
    return f'''<div class="card"><h3 class="s">השאלה</h3><div class="q">{E(f['question'])}</div>
  <p class="meta">{'<span>·</span>'.join(f'<span>{p}</span>' for p in parts)}</p>{tail}</div>'''

def corpus_numbers_today():
    n = ' '.join(f'<span>{OUTCOME[k]} · <b>{rows_per[k]}</b></span>' for k in OUTCOME)
    return f'''<div class="card"><div class="nums"><span><b>{len(PG)}</b> דפים נסקרו</span><span><b>{rows_total}</b> שורות</span></div>
  <div class="nums">{n}</div><div class="nums"><span><b>{stops}</b> עצירות ממתינות</span></div></div>'''

def corpus_door():
    return f'''<div class="door"><div><div class="t">הארכיון של החוקרים</div>
  <div class="s">{len(PG)} דפים נסקרו · {rows_per['ACQUIRED']} צילומים נרכשו · {rows_per['UNFETCHED']} לא נשלפו · {stops} עצירות ממתינות{DRAFT}</div></div><span class="go">{IC_CHEV}</span></div>'''

def research_page(proposal=False):
    fr_rows = ''.join(framing_row(f, proposal) for f in FR)
    reg4 = corpus_door() if proposal else f'<h3 class="s">הארכיון במספרים</h3>{corpus_numbers_today()}<p class="meta"><a>הארכיון של החוקרים</a></p>'
    return f'''{topbar()}<div class="mpage">
  <h2 class="t">מחקר</h2>{scope_switch()}
  <h3 class="s">מה אני חייב/ת</h3><div class="empty">אין כרגע מה שחייבים.</div>
  <h3 class="s">תזות</h3>{thesis_row()}
  <h3 class="s">מסגורים</h3>{fr_rows}
  {reg4}</div>'''

# ---------- the working view ----------
def model_box(by, inner):
    if by.get('model') is None and by.get('promptVersion') is None:
        ver = '<span>הדגם וגרסת ההנחיה לא נרשמו</span>'
    else:
        ver = f'<bdi dir="ltr">{E(by["model"])}</bdi><bdi dir="ltr">{E(by["promptVersion"])}</bdi>'
    spent = f'<span>את הקריאה שילם/ה {E(by["spentBy"]["handle"])}</span>'
    return f'<div class="ai"><p class="ailabel"><span>{AI}</span>{ver}{spent}</p>{inner}</div>'

def composed_line(t):
    k, b = t['kind'], t['body']
    if k == 'ROUND_ASSESSED':
        c = b['content']; filled = sum(1 for e in c.get('elements', []) if e.get('filled'))
        return f'הוערך: {len(c.get("contradictions", []))} סתירות, {filled} רכיבים שמולאו'
    if k == 'VERSION':
        return f'+{len(b["citationsVsParent"]["added"])} ציטוטים, {len(CTX["unargued"])} לא נטענו'
    if k == 'ASSESSMENT':
        return VERDICT.get(b['verdict'], '')
    if k == 'ANALYSIS':
        st = b["opinion"].get("strength", "")
        return f'ניתוח: {E(st.get("grade", "") if isinstance(st, dict) else st)}'
    if k == 'DEBATE_CLOSED':
        return MARK['promoted' if b['outcome'] == 'PROMOTED' else 'abandoned']
    if k == 'PUBLICATION_VERDICT':
        return MARK['published'] if b['outcome'] == 'PUBLISHED' else f'נדחה על ידי: {", ".join(b["refusedBy"])}'
    if k == 'PUBLICATION_ASSESSMENT':
        return VERDICT.get(b['verdict'], '')
    if k == 'GAP_DECISION':
        return GAPWORD.get(b['decision'], b['decision'])
    return ''

def turn_row(t, expanded=False):
    k = t['kind']; by = t['by']; g = GLYPH_OF[k]
    who = by['handle'] if by['voice'] == 'RESEARCHER' else ('הפלטפורמה' if by['voice'] == 'PLATFORM' else '')
    head = f'<p class="kind"><b>{TURN[k]}</b>{"<span>·</span><span>" + E(who) + "</span>" if who else ""}<span>·</span><span>{d(t["at"])}</span></p>'
    datum = f'<p class="line datum">{E(t["line"])}</p>' if t['line'] else ''
    comp = composed_line(t)
    compl = f'<p class="line">{comp}</p>' if comp else ''
    body = datum + compl
    if by['voice'] == 'MODEL':
        body = model_box(by, compl or '<p class="line">—</p>')
    if k == 'DEBATE_OPENED':
        body = f'<p class="line"><span class="tick">{d(t["body"]["record"]["capture"])}</span> {E(t["body"]["record"]["url"].replace("https://", ""))}</p>'
    if k == 'RATIONALE' and expanded:
        body = f'<p class="line datum" style="-webkit-line-clamp:5">{E(t["body"]["text"])}</p>'
    return f'<li class="turn"><div class="gl {g}">{G[g]}</div><div>{head}{body}</div></li>'

def transcript(turns, expand_first_rationale=False):
    out, cur, seen_rat = [], None, False
    for t in turns:
        th = t['thread']['step']
        if th != cur or (th == 'DEBATE' and t['kind'] == 'DEBATE_OPENED') or (th == 'VERSION' and t['kind'] == 'VERSION') or (th == 'GAP' and cur != 'GAP'):
            if th != cur or t['kind'] in ('DEBATE_OPENED',):
                out.append(f'<li class="th">{THREAD[th]}</li>'); cur = th
        ex = expand_first_rationale and t['kind'] == 'RATIONALE' and not seen_rat
        if ex: seen_rat = True
        out.append(turn_row(t, ex))
    return '<ul class="stream">' + ''.join(out) + '</ul>'

TABS = ['התזה', 'ציטוטים', 'פערים', 'ניתוח', 'מסגור', 'פניות לציבור']
def tabs(on=0, extra=''):
    return '<div class="tabs">' + ''.join(f'<span class="tab {"on" if i == on else ""}">{t}</span>' for i, t in enumerate(TABS)) + extra + '</div>'

def context_line():
    return f'''<div class="ctxline"><h2 class="claim serif">{E(HEAD['claim'])}</h2>
  <p class="meta"><span>{PROV[TH['provision']]}</span><span>·</span><span>{E(handle)}</span><span>·</span><span class="pill ink">{STATE[TH['state']['kind']]}</span></p>
  <p class="meta"><span class="copy">{IC_COPY} מזהה התזה לשיחה חדשה</span></p></div>'''

def working_phone():
    return f'''{topbar('מחקר')}<div class="mpage">{context_line()}
  <h3 class="s">מה חייבים על התזה הזו</h3><div class="empty">אין כרגע מה שחייבים.</div>
  {tabs(0)}
  {transcript(H, True)}<a class="jump">לקפוץ לסוף</a></div>'''

def ticks_text(text):
    blocks = [b for b in re.split(r'\n\s*\n', text) if b.strip()]
    def sub(m):
        c = by_id.get(m.group(1)); return f'<span class="tick">{d(c["pin"]) if c and c.get("pin") else "?"}</span>' if False else '<span class="tick">צילום</span>'
    ps = []
    for b in blocks:
        j = E(b.replace('\n', ' ').strip())
        j = re.sub(r'#ev_(0x[0-9a-f]{64})', lambda m: '<span class="tick">' + (d(next((x['capture'] for x in [t['body']['record'] for t in H if t['kind']=='DEBATE_OPENED']), '')) or '') + '</span>', j)
        ps.append(f'<p>{j}</p>')
    return ''.join(ps[:4])

def sidebar():
    return f'''<div class="side"><div class="sidehead"><span class="name">{E(NAME)}</span><span class="ic">{IC_COLL}</span></div>
  <div class="cat">תזות</div><div class="item on">{E(T['claim'])}</div>
  <div class="cat">הארכיון</div><div class="item" style="direction:ltr;text-align:right">corona.health.gov.il/vaccine-for-covid/</div>
  <div class="grow"></div><div class="foot"><div class="item on">מחקר</div><div class="item">{E(handle)}</div><div class="item">אודות</div><div class="item">לחוקרים</div><div class="item" style="color:#4E463F">English</div></div></div>'''

def working_desktop():
    return f'''<div class="frame desk">{sidebar()}
  <div class="centre"><div class="col">{context_line()}<h3 class="s">מה חייבים על התזה הזו</h3><div class="empty">אין כרגע מה שחייבים.</div>{transcript(H)}</div></div>
  <div class="split"></div>
  <div class="right">{tabs(0)}<div class="pane"><h3 class="s">הגרסה הנוכחית</h3><div class="words serif">{ticks_text(HEAD['text'])}</div>
  <p class="meta"><span class="pill">הגרסה שפורסמה</span><span class="pill">מה שונה ביניהן</span></p></div></div></div>'''


# ---------- option ב: the thesis is ALWAYS the centre; the transcript is a pane tab ----------
TABS_B = ['תמליל', 'ציטוטים', 'פערים', 'ניתוח', 'מסגור', 'פניות לציבור']
def tabs_b(on=0):
    out = []
    for i, t in enumerate(TABS_B):
        out.append(f'<span class="tab {"on" if i == on else ""}">{t}{DRAFT if i == 0 else ""}</span>')
    return '<div class="tabs">' + ''.join(out) + '</div>'

def thesis_column_public_like():
    ticks = ''.join(f'<span class="tick">{d(t["body"]["record"]["capture"])}</span>' for t in H if t['kind'] == 'DEBATE_OPENED')
    return f'''<div class="ctxline" style="border:0;padding:0">
  <p class="meta"><span class="pill ink">{STATE[TH['state']['kind']]}</span><span>·</span><span>{E(handle)}</span><span>·</span><span>{d(TH['publishedAt'])}</span></p>
  <h2 class="claim serif" style="font-size:24px">{E(HEAD['claim'])}</h2>
  <p class="meta"><span>{PROV[TH['provision']]}</span></p>
  <p class="meta"><span class="copy">{IC_COPY} מזהה התזה לשיחה חדשה</span></p></div>
  <h3 class="s">מה חייבים על התזה הזו</h3><div class="empty">אין כרגע מה שחייבים.</div>
  <div class="card" style="flex-direction:row;align-items:center;gap:8px;padding:8px 12px"><span class="meta" style="direction:ltr">corona.health.gov.il</span><span style="flex:1;height:1px;background:#E6E5E2"></span>{ticks}</div>
  <div class="words serif">{ticks_text(HEAD['text'])}</div>
  <p class="meta"><span class="pill">הגרסה שפורסמה</span><span class="pill">מה שונה ביניהן</span></p>'''

def working_desktop_b():
    return f'''<div class="frame desk">{sidebar()}
  <div class="centre"><div class="col">{thesis_column_public_like()}</div></div>
  <div class="split"></div>
  <div class="right">{tabs_b(0)}<div class="pane" style="padding-top:8px">{transcript(H)}</div></div></div>'''

def working_phone_b():
    return f'''{topbar('מחקר')}<div class="mpage">{thesis_column_public_like()}</div>'''

def working_phone_b_layer():
    # THE PHONE'S PANE IS A FULL-SCREEN LAYER (usePaneLayer, paneSwipe.ts): revealed by a swipe from the edge or a tap on a tick;
    # its tabs sit at the TOP of the layer, under the top bar — never in the page body.
    return f'''{topbar('מחקר')}<div class="layer" style="position:relative;inset:auto;flex:1;display:flex;flex-direction:column;overflow:hidden">
  <div class="tabs" style="border-radius:0;border:0;border-bottom:1px solid #E6E5E2;background:#FCFCFB;padding:8px 10px">{tabs_b(0)[len('<div class="tabs">'):-len('</div>')]}</div>
  <div class="pane" style="padding:8px 16px 16px;overflow:visible">{transcript(H)}</div></div>'''

# ---------- /research/corpus ----------
facet = {p['trackedUrlId']: p for p in B['corpus']['pages']}
def pages_list(proposal_counts=True):
    rows = []
    for p in PG:
        f = facet.get(p['trackedUrlId'], {})
        mark = '' if p['public'] else f'<span class="pill amber">{MARK["notPublic"]}</span>'
        counts = ' · '.join(f'{OUTCOME[k]} {p["outcomes"][k]}' for k in ('ACQUIRED', 'UNFETCHED', 'IDENTICAL', 'DUPLICATE') if p['outcomes'][k])
        stop = '<span class="pill amber">עצירה ממתינה; היא נפתרת בשיחה</span>' if p['stopPending'] else ''
        interval = f"<bdi dir='ltr'>{d(f['first'])} – {d(f['last'])}</bdi>" if f.get('first') else ''
        rows.append(f'''<div class="prow"><div class="url">{E(p['url'].replace('https://',''))}</div>
  <p class="meta"><span>{interval}</span><span>·</span><span>{f.get('entries', 0)} רשומות</span>{mark}{stop}</p>
  <p class="meta"><span>{p['total']} שורות</span><span>·</span><span>{counts}</span></p></div>''')
    return ''.join(rows)

def stream_rows(n=6):
    out = []
    for e in B['corpus']['entries'][:n]:
        pub = e['page']['public']; dim = '' if pub else ' dim'
        mark = '' if pub else f'<span class="pill amber">{MARK["notPublic"]}</span>'
        if e['kind'] == 'CAPTURE':
            body = f'<div class="u">{E(e["page"]["url"].replace("https://",""))}</div><p class="meta"><span>צילום</span>{mark}<span class="lnk">כיצד חולץ הטקסט הזה</span></p>'
            out.append(f'<div class="srow{dim}"><span class="dt">{d(e["capture"])}</span><div class="body">{body}</div></div>')
        else:
            body = f'<div class="u">{E(e["page"]["url"].replace("https://",""))}</div><div class="dcard">שינוי בעמוד בין {d(e["before"])} ל־{d(e["after"])}{" · ההפרש טרם חושב" if e.get("awaitingDerivation") else ""}</div><p class="meta">{mark}</p>'
            out.append(f'<div class="srow{dim}"><span class="dt">{d(e["after"])}</span><div class="body">{body}</div></div>')
    return ''.join(out)

def corpus_phone():
    return f'''{topbar('הארכיון של החוקרים')}<div class="mpage">
  <div class="chips"><span class="chip on">של כולם</span><span class="chip">דף</span><span class="chip">צילומים</span><span class="chip">שינויים</span><span class="chip">מצוטטות</span></div>
  <h3 class="s">עמודים</h3>{pages_list()}
  <h3 class="s">הרשומות</h3>{stream_rows(6)}</div>'''

def extraction_sheet():
    cap = next(c for c in B['captures'] if c['outcome'] == 'ACQUIRED' and c['comparedTo'])
    rules = B['rules']['rules']; hist = B['history']
    rule_rows = ''.join(f'<div class="rule"><div class="sel">{E(r["selector"])}</div><p class="meta"><span>בתוקף מ־{d(r["validFrom"])}</span>{"<span class=pill>כלל שנסמך</span>" if r["trusted"] else ""}</p></div>' for r in rules)
    matches = ''.join(f'<div class="rule"><p class="meta"><span><b>{d(m["capture"])}</b></span><span>·</span><span>{OUTCOME[m["outcome"]]}</span><span>·</span><span>{m["matchedNodes"]} התאמות{DRAFT}</span></p>' + (f'<div class="rm">הטקסט שהוסר: {E(" · ".join(m["removed"][:3]))}</div>' if m['removed'] else '') + '</div>' for m in hist['matches'][:4])
    return f'''{topbar('הארכיון של החוקרים')}<div class="mpage" style="position:relative">
  <div class="tabs"><span class="tab on">כיצד חולץ הטקסט הזה</span><span class="tab">הכללים שהיו בתוקף בתאריך הצילום</span><span class="tab">ההיסטוריה של הכלל</span></div>
  <h3 class="s">השורה ברשימת העבודה</h3>
  <dl class="kv"><dt>צילום</dt><dd>{d(cap['capture'])}</dd><dt>תוצאה</dt><dd>{OUTCOME[cap['outcome']]}</dd><dt></dt><dd>הושווה לצילום מ־{d(cap['comparedTo'])}</dd><dt></dt><dd>{'ישן ביחס לכללים' if cap['stale'] else '—'}</dd><dt>שערי העצירה</dt><dd>—</dd></dl>
  <h3 class="s">הכללים שהיו בתוקף בתאריך הצילום</h3>{rule_rows}
  <h3 class="s">ההיסטוריה של הכלל</h3><div class="sel">{E(hist['rule']['selector'])}</div>{matches}</div>'''

def claims_phone():
    rows = []
    for c in B['claims']['entries'][:7]:
        cl = c['claims'][0]['claimText']; st = 'קיימת בצילום האחרון' if c['finalState'] == 'PRESENT' else 'אינה בצילום האחרון'
        tr = 'מעבר אחד' if c['transitions'] == 1 else f'{c["transitions"]} מעברים'
        rows.append(f'<div class="prow"><div class="q serif" style="font-size:14px;line-height:1.5">{E(cl)}</div><p class="meta"><span>{tr}</span><span>·</span><span>{st}</span><span>·</span><bdi dir="ltr">{d(c["firstSeen"])} – {d(c["lastSeen"])}</bdi></p></div>')
    return f'''{topbar('הארכיון של החוקרים')}<div class="mpage"><h2 class="t">טענות הדף</h2>
  <div class="chips"><span class="chip on">של כולם</span><span class="chip">דף: corona.health.gov.il</span></div>{''.join(rows)}</div>'''

def framing_sheet():
    f = B['framingDetails'][2]
    return f'''{topbar('מחקר')}<div class="mpage">{tabs(4)}
  <h3 class="s">השאלה</h3><div class="q serif" style="font-size:15px">{E(f['question'])}</div>
  <p class="meta"><span>{PROV.get(f['provision'], f['provision'])}</span><span>·</span><span>{E(f['by']['handle'])}</span></p>
  {transcript(f['turns'])}</div>'''


# ---------- board ט: the single-page view — as built (א) vs the subject as HEADER (ב) ----------
def _corona_entries():
    return [e for e in B['corpus']['entries'] if e['page']['trackedUrlId'] == B['pid']]
def _strip(entries, first, last, thin=True):
    # dots by time between first and last; month labels thinned to years when the span is long
    import datetime as dt
    def ts(t): return dt.datetime(int(t[:4]), int(t[4:6]), int(t[6:8]))
    a, b = ts(first), ts(last); span = max((b - a).days, 1)
    x = lambda t: 6 + 348 * (ts(t) - a).days / span
    dots = ''.join(f'<circle cx="{x(e["capture"]):.1f}" cy="18" r="2.2" fill="#1F1B16"/>' for e in entries if e['kind'] == 'CAPTURE')
    bars = ''.join(f'<rect x="{(x(e["before"])+x(e["after"]))/2-1.2:.1f}" y="6" width="2.4" height="10" fill="#4E463F"/>' for e in entries if e['kind'] == 'DIFF')
    months = (b.year - a.year) * 12 + b.month - a.month
    labels = []
    if months > 15:
        for y in range(a.year, b.year + 1):
            t = f'{y}0101000000'
            if a <= ts(t) <= b: labels.append(f'<text x="{x(t):.1f}" y="32" font-size="9" fill="#4E463F" text-anchor="middle">{y}</text>')
    else:
        yy, mm = a.year, a.month
        heb = ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ']
        while (yy, mm) <= (b.year, b.month):
            t = f'{yy}{mm:02d}01000000'
            if a <= ts(t) <= b: labels.append(f'<text x="{x(t):.1f}" y="32" font-size="9" fill="#4E463F" text-anchor="middle">{heb[mm-1]}</text>')
            mm += 1
            if mm == 13: mm, yy = 1, yy + 1
    return f'<svg viewBox="0 0 360 36" width="100%" height="36" style="direction:ltr"><line x1="6" y1="18" x2="354" y2="18" stroke="#E6E5E2"/>{bars}{dots}{"".join(labels)}</svg>'

def single_page_current():
    f = next(p for p in B['corpus']['pages'] if p['trackedUrlId'] == B['pid']); ents = _corona_entries()
    chips = ''.join(f'<span class="chip {"on" if p["trackedUrlId"]==B["pid"] else ""}" style="white-space:nowrap">{E(p["url"].replace("https://",""))}</span>' for p in B['corpus']['pages'])
    return f"""{topbar('הארכיון של החוקרים')}<div class="mpage">
  <p class="meta">{len(ents)} רשומות עד כה</p>
  <div class="chips" style="flex-wrap:nowrap;overflow-x:auto">{chips}<span class="chip">צילומים</span><span class="chip">שינויים</span><span class="chip">מצוטטות</span></div>
  <p class="meta"><span>עמודים</span><span>·</span><a class="lnk">רשומות מצוטטות</a></p>
  <div class="card"><div class="url">{E(f['url'].replace('https://',''))}</div><p class="meta"><bdi dir="ltr">{d(f['first'])} – {d(f['last'])}</bdi><span>·</span><span>{f['entries']} רשומות</span></p><p class="meta"><a class="lnk">הטענות בדף הזה</a></p>{_strip(ents, f['first'], f['last'])}</div>
  {stream_rows_of(ents[:4])}</div>"""

def single_page_proposed():
    f = next(p for p in B['corpus']['pages'] if p['trackedUrlId'] == B['pid']); ents = _corona_entries()
    return f"""{topbar('הארכיון של החוקרים')}<div class="mpage">
  <p class="meta"><a class="lnk">כל העמודים{DRAFT}</a></p>
  <div class="card" style="gap:8px"><h2 class="t" style="font-size:16px;direction:ltr;text-align:right;word-break:break-all">{E(f['url'].replace('https://',''))}</h2>
    <p class="meta"><bdi dir="ltr">{d(f['first'])} – {d(f['last'])}</bdi><span>·</span><span>{f['entries']} רשומות</span></p>
    {_strip(ents, f['first'], f['last'])}
    <p class="meta"><a class="lnk">הטענות בדף הזה</a></p></div>
  <div class="chips" style="align-items:center"><span class="meta">סינון{DRAFT}</span><span class="chip">צילומים</span><span class="chip">שינויים</span><span class="chip">מצוטטות</span><span class="chip">מתאריך</span></div>
  <p class="meta">{len(ents)} רשומות עד כה</p>
  {stream_rows_of(ents[:4])}</div>"""

def stream_rows_of(ents):
    out = []
    for e in ents:
        if e['kind'] == 'CAPTURE':
            out.append(f'<div class="srow"><span class="dt">{d(e["capture"])}</span><div class="body"><p class="meta"><span>צילום</span><span class="lnk">כיצד חולץ הטקסט הזה</span></p></div></div>')
        else:
            out.append(f'<div class="srow"><span class="dt">{d(e["after"])}</span><div class="body"><div class="dcard">שינוי בעמוד בין {d(e["before"])} ל־{d(e["after"])}</div></div></div>')
    return ''.join(out)

# ---------- assemble ----------
note_top = '''<div class="note"><b>מה זה.</b> שמונה לוחות של תצוגת הקריאה של החוקר (UI-8), מצוירים מהגופים האמיתיים ב־staging (ריצה B, 37 תורות · 3 מסגורים · 3 דפים · 51 רשומות · 5 כללים). כל מילה היא ערך מאושר מהקטלוג, אלא אם היא נושאת תג <span class="draft">טיוטה</span>. אישור לוח = אישור לבנות; מילה עם תג = שאלת ניסוח שלך.</div>'''
note_research = f'''<div class="note"><b>שני שינויים בין א ל־ב.</b> (1) <b>מסגורים</b> — שני המסגורים בלי סבבים מצוירים כרשומות מושתקות עם „נפתח בלי סבב” <span class="draft">טיוטה</span> במקום „עדיין לא הוליד תזה”. <b>הנתון חסר:</b> לפלטפורמה אין שום רשומה שמסגור 3 נולד מ־1 ו־2 — `open_framing` לא מקבל „מחליף את”, ו־`fromRunId` שייך לתובע שלא נבנה. הדף אינו רשאי לגזור את הקשר מסמיכות בזמן; לצייר „תוקן ל־” דורש שדה חדש בכתיבה (שינוי backend, שלך). (2) <b>הארכיון במספרים</b> → <b>דלת אחת</b> לארכיון החוקרים עם שורת סיכום אחת (ההרכב לפי תוצאה עובר לרשימת העמודים ב־<code>/research/corpus</code>, לוח E, שם הוא לצד כל דף). ניסוח השורה <span class="draft">טיוטה</span>.</div>'''

boards = f'''<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>UI-8 boards</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700&family=Heebo:wght@400;500;600;700&display=swap"><style>{CSS}</style></head><body><div class="wrap">
<h1 class="pg">UI-8 · תצוגת הקריאה של החוקר — לוחות מהגופים האמיתיים (2026-09-21)</h1>{note_top}
<div class="row-of">
{frame_phone('ב · /research', research_page(True), tall=True, cap='<span>390 · גלילה מלאה</span>')}
</div>{note_research}
<div class="note"><b>נפסק 2026-09-21: אפשרות ב.</b> אפשרות א — התמליל במרכז והתזה כלשונית, כפי שאושר בקנבס (עמוד 1 לוח C; ui §14, תוכנית §10 :1224) — <b>בטלה</b>, ולוחותיה אינם מצוירים כאן: קובץ הלוחות מחזיק את התמונה המאושרת בלבד, וההיסטוריה שמורה ב-git ובקובץ הלוחות הקודם. <b>ב</b> שומר על עקביות עם דף התזה הציבורי שכבר נבנה: התזה היא תמיד המרכז (אותה עמודה: הטענה, הסעיף, שורת הצילומים, הטקסט, הקיפולים), ובתצוגת החוקר נוספים לה שורת המצב, „מה חייבים” והחלונית הימנית — שנפתחת כברירת מחדל על <b>התמליל</b> ומחזיקה גם ציטוטים · פערים · ניתוח · מסגור · פניות לציבור. המילה „תמליל” לא בקטלוג <span class="draft">טיוטה</span>.</div>
<div class="board"><div class="cap"><b>ד2 · תצוגת העבודה — 1440 — אפשרות ב (עקבי עם דף התזה הציבורי)</b><span>התזה במרכז · התמליל בחלונית הימנית, פתוח כברירת מחדל</span></div>{working_desktop_b()}</div>
<div class="row-of">{frame_phone('ג2 · תצוגת העבודה בטלפון — אפשרות ב — הדף (אין תפריט בגוף הדף)', working_phone_b(), tall=True)}
{frame_phone('ג3 · אותו דף, החלונית פתוחה (החלקה מהקצה או הקשה) — הלשוניות בראש השכבה, „תמליל” פתוח', working_phone_b_layer(), tall=True)}</div>
<div class="note"><b>נפסק 2026-09-21: אפשרות ב.</b> התזה היא המרכז בשתי הדלתות; החלונית הימנית — במסך רחב עמודה ימנית עם הלשוניות בראשה, בטלפון שכבה במסך מלא שנחשפת בהחלקה, ולשוניותיה בראש השכבה. <b>אין תפריט לשוניות בגוף הדף</b> — לוח ג (אפשרות א) בטל.</div>
<div class="row-of">
{frame_phone('ה · /research/corpus — העמודים עם „לא פתוח לציבור” והרשומות', corpus_phone(), tall=True, cap='<span>390 · גלילה מלאה</span>')}
{frame_phone('ו · גיליון החילוץ — שלוש לשוניות מקוננות', extraction_sheet(), tall=True, cap='<span>390 · נפתח מכל שורת צילום</span>')}
{frame_phone('ז · /research/corpus/claims', claims_phone(), tall=False)}
{frame_phone('ח · גיליון המסגור — 7 תורות דרך אותן שורות', framing_sheet(), tall=True)}
</div>
<h1 class="pg">ט · תצוגת דף יחיד — הנושא ככותרת</h1>
<div class="note"><b>השאלה (החוקר, 2026-09-21):</b> „לא ברור שמטרת הפאנל היא סינון; שמות דפים ו־צילומים/שינויים/מצוטטות אינם אותה חיה; רצועת הזמן מוצגת רק בהקשר של דף יחיד, אז כותרת צריכה להגיד בבירור שזה דף אחד." <b>ב</b> מפריד: <b>הנושא</b> (הדף: כתובת, מרווח, מספר רשומות, הרצועה, הטענות) הוא הכותרת של הדף; מתחתיו <b>סינון</b> של השורות בלבד (צילומים · שינויים · מצוטטות · תאריכים) עם תווית; בלי צ'יפים של דפים — החלפת דף נעשית ברשימת העמודים („כל העמודים"); בלי בורר תצוגה בתוך דף יחיד. תוויות הרצועה: שנים בלבד כשהטווח ארוך. מילים חדשות: <span class="draft">טיוטה</span>.</div>
<div class="row-of">
{frame_phone('ט·ב · /research/corpus?page= — כותרת של דף יחיד, ואז סינון', single_page_proposed(), tall=True)}
</div>
<div class="note"><b>מה לא מופיע כאן בכוונה:</b> הסתייגות משפטית (רק דפי תזה וקריאה, COMPLIANCE :92) · מזהה כטקסט (רק ב־URL ובכפתור ההעתקה) · קישור לדף הסימון (עצירה היא עובדה) · כל פעולת כתיבה. <b>בלוח ה:</b> שורה של דף „לא פתוח לציבור” מצוירת מושתקת, בלי קישור לרשומה ובלי קריאת טקסט — Q2 כפי שנפסק; גיליון החילוץ נפתח מכל שורה.</div>
</div></body></html>'''
OUT = os.environ.get('BOARDS_OUT', f'{S}/boards.html')
open(OUT, 'w').write(boards)
print(OUT, len(boards.encode()), 'bytes')
