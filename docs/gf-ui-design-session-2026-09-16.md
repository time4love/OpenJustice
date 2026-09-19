# The UX design session — 2026-09-16: the shell, every screen, the system

**What this is.** The record of the design session that followed UI-5 (R56). The researcher ruled that the UI is designed
upfront, as images, screen set by screen set, before any further UI code (`docs/gf-ui-refactor-plan.md` §6's localhost rule
gains a sibling: the visual is approved as an image before the code). Seven steps were rendered on ONE design canvas —
**https://claude.ai/artifact/EMGriAH1BuBX1t6XbkWgUM**, 30 artboards on 7 pages, each page one step — every one built from the
LIVE staging bodies of run B's published thesis (`GET /api/thesis/:id`, `/call`, `/api/corpus`, `/api/corpus/claims`,
`/api/corpus/search`) and from the copy already in `messages/he.json`; every invented word carries a „טיוטה” badge on the board.
The generators and the bodies live beside the session memory, outside this public repo. **A mockup is not the page:** the
built page is read at 375 and 1440 and compared against the approved board before it lands, the way a staging exercise is
compared against its predictions.

**Steps 1–7 were approved by the researcher on 2026-09-16**, each after its read, with the corrections §1 records.

## 1. The rulings

1. **The UX reference is Claude's own shell** — claude.ai on the desktop, Claude Code's panes, the Claude mobile app. A LEFT
   SIDEBAR of categories (תזות · הארכיון, the archive with a search icon whose results use the centre), each listing the
   items opened in this browser, ordered by LAST WATCHED, as sessions sit under a project; the sidebar is RESIZABLE by its
   edge and COLLAPSIBLE. A CENTRE and a RIGHT PANE with a movable splitter; the right pane is MULTI-TAB, as Claude Code's
   artifacts. Wide screens get their own layout; the phone follows the Claude app: the sidebar a drawer, one pane, whatever
   the right pane would hold opens full-screen with a back control, one layer at a time.
2. **The centre is the conversation. Two centres, decided by the URL, never by identity.** Public `/theses/[id]`: the
   thesis page in the centre; a cited record, the call page and a previous version open as right-pane tabs. Gated
   `/research/theses/[id]`: the event stream in the centre, three voices; the thesis page is the first right-pane tab, then
   ציטוטים · פערים · ניתוח · מסגור · פניות לציבור (§11's state segments become tabs). `/corpus` and `/corpus/search`: the
   stream or the results in the centre, the record opened from a row on the right.
3. **The dove and the light animation live in the centre's EMPTY state** — the door, when nothing is selected — and never
   in the sidebar, whose top is the name as text. The dove logo also heads `/about`, without the glow. **AMENDED 2026-09-17: the door's field is DARK, not paper — the researcher, reading the built shell beside board A: „נראה טוב, שמור את הכחול והאנימציה כתיקון לעיצוב”. The warm light reads as light BECAUSE the field is dark, so the animation and the field are one decision, not two.**
4. **„צילום”, never „לכידה”** — the researcher: „השתמש במילה ״צילום״ במקום במילה ״לכידה״ שנשמעת לא טבעית בעברית”. One
   landed string still says it (`theses.sheet.capture`); every corpus and record label says „צילום” from the start.
5. **The preface is FOLDED.** The public-interest statement and the full disclaimer stay the first two elements of `<main>`
   in document order; on screen they are ONE line — the statement's first words and a chevron — that opens. Applies to the
   thesis page, the version page and the call page.
6. **The call page and the letter** (settling the brief's decisions 1–6): ONE name field, blank = „[שם מגיש/ת הבקשה]” as
   the legacy printer did · the letter's date is the DOWNLOAD date · the paragraphs render plain, no colon heuristic · the
   records a request rests on are dated ticks on the card, not in the letter · with zero CALLED items „קריאה לעדים” is drawn
   MUTED and is NOT an anchor, the body's own intake sentence under it · the letter is a dialog on the desktop and a full-screen
   sheet on the phone, and ONE Sheet primitive with Escape, a focus trap and return-focus serves every sheet and modal.
7. **The research stream** renders each of §11's eleven kinds as one row and one sheet; the gap decision has both shapes,
   REQUESTED and CALLED. The published body of run B carries `appeals.call = []` — the CALLED shape is drawn from the design.
8. **The system:** paper `#FAF7F1` · sidebar `#F3EEE4` · surface `#FFFFFF` · ink `#1F1B16` · muted `#6B6157` · line `#E4DCCF`; **AMENDED 2026-09-17: and ONE field colour, the door's alone — `--door-field` `#0F172A`. It is a SURFACE, not a meaning: it joins none of the four below, and no record, mark or state is ever drawn in it. It lands as a TOKEN in `globals.css` at UI-6, never as a utility class.** **AMENDED 2026-09-18 (the researcher), against Claude’s own surface as the reference — SAMPLED and not assumed: claude.ai’s page background reads `#FCFCFB` and its `--bg-100` `#F9F9F7`. Paper becomes `#FCFCFB`, sidebar `#F2F1EE`, muted `#4E463F`, line `#E6E5E2`. The cream was measurably four to nine times warmer than the reference — red-minus-blue **9** on the paper and **15** on the sidebar against **1** — and the sidebar, not the centre, was the browniest surface on screen. THE PAPER AND THE MUTED ANSWER DIFFERENT COMPLAINTS AND NEITHER SUBSTITUTES FOR THE OTHER: every paper between the old value and the new moves the muted’s contrast by **0.23**, while the muted’s own change moves it 5.66 → **9.00** on the paper and 5.23 → **8.18** on the sidebar, from passing AA and failing AAA to passing both; no element failed AA before the change, so lightening the paper alone would have reported a fix over an unchanged reading. The LINE loses its warmth by this file’s own rule — `globals.css` :10, "Four meaning colours and no more" — since a border carries no meaning and may not carry a hue that says nothing; it is REVIEW’s call and the researcher’s to overturn. Ink, surface and the four meaning colours DO NOT MOVE, and all four still carry on the new paper (olive 5.85 · gold 3.04 · amber 3.55 · seal-red 6.48).** **AMENDED 2026-09-18 (the researcher): and ONE FILL, the letter’s alone — `--letter-fill` `#FBEFC9`, marking a value the PLATFORM filled into a draft letter (the requester’s name and the date, `LetterDialog.tsx` :167). Like `--door-field` it is a SURFACE and not a meaning: it joins none of the four above, and no record, mark or state is ever drawn in it. THE MARKING IS A BOUNDARY OF AUTHORSHIP, not decoration — the letter goes out under the researcher’s own name, so a reader has to see which words are not theirs. It measures **1.118 : 1** against the paper, i.e. it works by HUE ALONE, which is why the researcher ruled it „א+ג”: the fill AND a `--line` underline on the same span, so a greyscale reader sees the second where the first is invisible. Removing either cue as redundant re-opens a ruling. Ink reads 14.91 : 1 on it and the muted 8.05 : 1, so text laid on it stays legible.** **AMENDED 2026-09-18 (the researcher, choosing on three rendered options against the published text): THE RESEARCHER’S WORDS AND HEADINGS MOVE TO `--font-sans` — the claim, the read, every prose field and the researcher’s own headings are Heebo, as the chrome already was. `--font-serif` is NOT retired and is NOT left applied to nothing, which would return R57’s F8: it takes a NARROWER and clearer job — A DOCUMENT BROUGHT VERBATIM THAT THE PLATFORM DID NOT AUTHOR. Two members: the archive’s captured text (`.record-captured`, the researcher’s ruling „א" of 2026-09-18) and the drafted letter’s body (`.letter-body`, REVIEW’s reading of the same rule and the researcher’s to overturn). WHAT THIS COSTS, stated because it was MEASURED and not guessed: R59 found the three voices read apart by TYPOGRAPHY and not by the component split docs/gf-ui-flows.md §16 :517–:521 describes, so this removes the very mechanism that passed the reading test — the test is therefore RE-RUN after this lands and its earlier answer is not carried over.**
   colour only for meaning — olive `#4F6B3A` verified·added·present, gold `#B08D3B` anchor·seal·publication, amber `#B7791F`
   flagged·missing·draft, seal red `#A8322A` removed·absent·withdrawal; actions are ink on paper. Frank Ruhl Libre (already in
   the repo, unused) for the researcher's words and headings, Heebo for the chrome and the marks; the claim 24/22 px, the
   text 17/16 px at 1.75. A citation in the text is a DATED TICK with one status dot; the domain and the marks' words live in
   the record. Eight monochrome glyphs for the stream's families. Watercolour illustrations only at 40 px on doors and buttons,
   never inline, **no English** (the no-English FOIA variant is promoted).
9. **Illustrations placed with the system sheet:** research → `/researchers` and the door's card; the fingerprint seal →
   the record page's second witness; the two pages → the diff page and card; the folder → the archive card; the sent letter →
   `/reports/new`; submit waits for the document plan's step 32. Without a place: vault, ephemeral, file_type, target_entity.
   **Missing, as one set in the same hand:** the archive/chronology, a single record, a claim, a published version, the theses
   category.

## 2. The canvas, page by page — what is real and what is draft

| page | boards | real | draft (badged) |
|---|---|---|---|
| 1 the shell | the door · public thesis with a record tab · research view with the stream and the thesis tab · phone: thesis, drawer, record | the body, the copy | „תזות”, the four state tabs, the owed line, every stream row without a public body |
| 2 the thesis page | the column whole with every fold open · the preface ruled vs folded · a version page | the rationale, the history row, the pages, the real hashes in VERIFY | — |
| 3 record · call · letter | the call tab · the letter dialog · phone call and letter · a DIFF record tab | the request, its addresses, the real 28.6→5.8.2022 diff (117 chunks), the classifier's `significance` | „להכנת המכתב”, „…ועוד N” |
| 4 the corpus | `/corpus` with the page card and the time strip · search · claims · phone · a capture page whole · a diff page | 43 entries, 26 trajectories, 22 search verdicts, the archive URL composed | the lens names, the filter chips, „מופיע/נעדר בטקסט השמור”, „בדיקה מול השרשרת”, „העד השני” |
| 5 the stream | the eleven kinds, row + sheet · phone stream · a version sheet | the claim, the version, the records, the hash, the rationale, „המעריך תמך בפרסום” | every date but the publication's, all model text, the framing question, the withdrawal and the note |
| 6 door · about · safety · researchers | `/about` in six sections · `/safety` interim · `/researchers` · phone door and about | the lede (`metadata.description`), the kept researchers copy, the staging MCP URL | the six `/about` paragraphs, the three `/safety` lines, the two `/researchers` corrections |
| 7 the system | one sheet | the values used on every board | the five placements marked „הצעה” (approved with the sheet) |

## 3. Amendments to `docs/gf-ui-flows.md`, in place, dated 2026-09-16

- **§4, §14, §22, §30 (widening):** the wide layout is designed as its own shell — sidebar · centre · right pane — not the
  compact page widened; a sheet at width is a RIGHT-PANE TAB; the phone keeps §4's one column and sheets.
- **§32 (the layout):** the sidebar IS the nav; it gains the two categories with their last-watched lists; the name at its
  top is text; the dove is the door's. `nav-is-the-map` holds the sidebar.
- **§17 region 4 (the appeals on the thesis page):** removed by the R56 ruling; one card leads to the call page. **§20:** the
  call page is the legacy shape — the folded preface, the claim, the requests as cards with the letter behind a button, the
  muted call, share, the short disclaimer — and it is also a right-pane tab beside the thesis.
- **§18 (the sheets):** the citation record opens as a right-pane tab at width and full-screen on the phone; the chip in the
  text is the dated tick.
- **§24 (the chronology):** the page card with the TIME STRIP is the first region and the scrubber; a capture is a thin row
  (date · time · anchor mark · cited mark · copy), a diff a card (interval · removed/added bars · the labelled opinion clamped).
- **§6 (public routes):** `GET /api/corpus/search` gains a PAGE, `/corpus/search?phrase=`, one row per capture: present or
  absent in the stored text; the plan's UI-7 gains it.
- **§33 (the door):** the door is the centre's empty state, the dove and the glow above the paragraph and the cards.
  **§34:** the dove heads `/about`.

## 4. What each step of `docs/gf-ui-refactor-plan.md` now builds, and the page that grounds it

- **The shell** — a step of its own between UI-4 and the re-briefed UI-5 (the researcher numbers it): the sidebar with its
  categories and last-watched lists (browser-local), the splitter, the tabbed right pane, the drawer and the full-screen
  layer on the phone, the two fonts self-hosted, the tokens of §1.8, the Sheet primitive of §1.6, the eight glyphs. Page 1.
- **UI-5** — the thesis page as page 2 draws it (the folded preface, the tick line, the folds), the version page, the call
  page and the letter as page 3 draws them; `theses.sheet.capture` renamed. Pages 1–3.
- **UI-6** — the door as the empty centre, page 1 board A and page 6 board D.
- **UI-7** — the chronology, the search page, the claims lens, the capture and diff pages as page 4 draws them; Hebrew
  names for the classifier's `categories` (English enum strings today) are copy the step drafts and the researcher approves.
- **UI-8** — the research view as page 1 board C and page 5 draw it: the stream with the eight glyphs, the eleven sheets, the
  state segments as right-pane tabs.
- **UI-9** — `/about` with the dove and the six sections, `/safety` interim, `/researchers` corrected, page 6.

## 5. Copy

- **Ruled:** „צילום” everywhere a capture is named.
- **Approved and reused:** the door's lede is `metadata.description`; the disclaimer is COMPLIANCE.md's verbatim; every
  label that already exists in `theses`, `call`, `common`, `researchers` is reused as it stands.
- **Drafted on the boards, badged, and NOT approved by being on them** — each waits for the researcher's word before it
  lands, in both languages: the six `/about` paragraphs · the three `/safety` lines · the two `/researchers` sentences ·
  the sidebar category „תזות” · the state tabs ציטוטים · פערים · ניתוח · מסגור · the owed line · the lens names זרם · טענות
  · רשומות and the filter chips · „העמודים שנפתחו” · „מופיע/נעדר בטקסט השמור” · „בדיקה מול השרשרת” · „העד השני” · „הגזירה
  טרם בוצעה” · „בצילום האחרון: נעדרת/מופיעה” · „N צילומים נבדקו” · „להכנת המכתב” · „…ועוד N” · the stream rows' bracketed text.

## 6. Owed to the steps

- `theses.sheet.capture`: „לכידה של העמוד מ־{date}” → „צילום של העמוד מ־{date}” (the one landed string).
- The public pages render raw `{{REQUESTER_NAME}}` / `{{DATE}}` today (R56's F3); the call page of page 3 resolves them
  only inside the letter, by construction.
- The Sheet primitive with keyboard behaviour for every sheet and modal (R56's F1, settled here for the set).
- `public/icon_foia.png` replaced by the no-English variant; the five missing illustrations, drawn by the researcher.
- Hebrew names for the classifier's categories before the corpus lands.
- `no-id-as-text` against the real body (R56's F2): the researcher's rationale carries an analysis id as text, verbatim; the
  rule's scope is the researcher's to settle.

## 7. Open, the researcher's

- Whether run B holds a CALLED gap decision at all — readable only through the gated `get_thesis_context`.
- The five missing illustrations, and the step number the shell takes in the plan.
