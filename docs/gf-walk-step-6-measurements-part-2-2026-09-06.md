# Step 6, the measurements — PART 2: Gates 1, 2 and 4 under rules created by MARKING — 2026-09-06

A findings record, never edited. Bears on `docs/gf-refactor-plan.md` §3 step 4 and §6 item 4; pointed
at from step 4's dated note beside part 1 (`docs/gf-walk-step-4-measurements-2026-09-05.md`). This is
PART 2, a second dated record: the three measurements that need rules — Gate 1 stops, Gate 2 stops and
whether each was a widget legitimately leaving, Gate 4 stops before and after trust — taken on staging
under rules the researcher created through MARKING on STORED captures (Flow 3), after step 6. Nothing
here is recomputed from an earlier document; every number names the call or the file it was read from,
and a number derived from recorded material says "derived".

**What was run.** The reviewer session drove every call below through the staging MCP connector, one
approval at a time: `get_environment` first, then for each page a loop of `scan_captures` with
`maxCaptures` at least the page's row count (walla 8, corona 133 — the reporting walk writes nothing, so
NEXT_ROW never advances and a shorter call re-walks the same rows) → the stop and its material shown in
the chat → the researcher marking in the page, which opened every capture in the CORRECTING shape (no
stop is written on the row before step 5) → `approve_article_rules` exactly as the page's line was
pasted → the next scan. Every raw return is in the session's handoffs directory as
`R25-*-2026-09-06.*`, counted with `jq`; the marking page was read after each approval in a browser
with no session, display reads only (`R25-walla-<capture>-page-reading-2026-09-06.md`). Total spend:
**zero classifier calls** — Gate 5 was reached by no call. The frontend served PR #362 (`40d922d`, the
trust tick in a folded section) from the second walla stop on; the backend was `c5a351f` throughout.

**Seats.** The researcher marked, answered every stop and ruled on every gate's material; the reviewer
ran the calls, read the pages and wrote this. Where the reviewer read a page to answer a question the
researcher could not answer from memory (which segments a draft reached), the reading is quoted as the
page showed it, never inferred from selector names — the one inference of that kind made in the chat
was wrong and is recorded below.

## 1 — the environment

`get_environment()` → `R25-environment-2026-09-06.json`:

```json
{"environment":"staging","verdict":"CONFIRMED","warnings":[],"database":{"projectRef":"elws…ae","pinned":true},"chain":{"reachable":true,"chainId":84532,"registryAddress":"0x65b9a7acb45Aa05e7Ed207844F93a2b308373853","registryDeployed":true,"expectedChainId":84532,"matchesEnvironment":true},"corpus":{"trackedUrls":3,"snapshots":112,"snapshotsUnanchored":0,"diffs":109,"diffsSignificant":7,"evidence":9,"evidenceConfirmed":8,"evidencePendingReview":1,"theses":1,"thesesPublished":1,"activeResearchSessions":0}}
```

Staging, CONFIRMED on both axes, before any write. The corpus counts are recognition only.

## 2 — walla: the stops, in walk order

`https://news.walla.co.il/item/3403847`, page `38da8d89-7acf-4874-b8c8-43dbff78d229`, 8 rows (7
stored old-path rows, 1 UNFETCHED). Rules in force before this walk: 17 from `20201209134003`, none
trusted (step 6). Every `scan_captures` below is `(url, maxCaptures=8)`; every `next` equalled the
stopped capture, as the reporting walk's contract says.

| # | call · file | walked · superseded | stop | gates | Gate 1 (nowRemoved / nowKept) | Gate 2 silent rules | Gate 4 unseen removals, per rule | researcher's answer | approve · file → seq · added / ended / trusted / extended |
|---|---|---|---|---|---|---|---|---|---|
| 1 | scan 1 · `R25-scan-walla-1` | 2 · 1 | `20201218044603` | 1, 2, 4 | 0 / 8 | 3 | **80**: aside 58 · `section.css-1tkogwg` 13 · main header 8 · breadcrumb 1 | CORRECT: the author line, the date line, both "עוד בוואלה!" boxes, the photo caption; Gate 2 ruled **hashes moved, the element did not leave** (not a widget leaving) | approve 1 · `R25-approve-walla-1` → 4 · 4 / 0 / 0 / 0 |
| 2 | scan 2 · `R25-scan-walla-2` | 3 · 2 | `20210612183110` | 1, 2, 4 | 0 / 126 (114 menu items + 12) | 8 | **66**: aside 55 · `section.css-1tkogwg` 9 · `#main-footer` 1 · first box 1 | CORRECT: headers, breadcrumb, author/date, second box, tags (7 added); the photo caption was left kept → second approval, 1 added | approve 2 → 6 · 7 / 0 / 0 / 0 · approve 3 → 8 · 1 / 0 / 0 / 0 |
| 3 | scan 3 · `R25-scan-walla-3` | 4 · 3 | `20220523123302` | 1, 2, 4 | 0 / 135 (121 menu and share items + 14) | 14 | **8**: `#main-footer` 7 · `#xlandingzone` 1 | CORRECT: headers, share panels, breadcrumbs-and-tags, author/date, boxes (12 added); the video caption was left kept → second approval, 1 added | approve 4 → 10 · 12 / 0 / 0 / 0 · approve 5 → 12 · 1 / 0 / 0 / 0 |
| 4 | scan 4 · `R25-scan-walla-4` | 5 · 4 | `20240520195927` | 1, 2, 4 | 0 / 129 (120 + 9) | 12 | **2**: `section.tags-and-breadcrumbs` 2 | CORRECT: header, breadcrumbs box, share panels, author/date, boxes, both captions, font slider (13 added); one added rule pointed at ARTICLE TEXT → second approval: that rule ENDED, the comments counter added | approve 6 → 14 · 13 / 0 / 0 / 0 · approve 7 → 17 · 1 / **1** / 0 / 0 |
| — | scans 5, 6, 7 · `R25-scan-walla-{5,6,7}` | 5 · 5 | `20250208221410` (UNFETCHED) | — | `ARCHIVE_UNAVAILABLE` ×3 | | | the stretch ends here | — |

Rules in force at the newest walla date after approval 7: **55**, of which 44 carry a `css-` class and 7 are
positional; **0 trusted; 1 ended** (jq over `R25-approve-walla-7`). Decisions on the page: 17 (step 6's
2 + 15 today). Five of eight rows accepted; the two stored captures after `20250208221410` were not
reached.

**Gate 1 at every walla stop fired in ONE direction: removed → kept**, nowRemoved 0 each time — the
corpus-pollution direction. What came back kept was, each time, the text the previous capture's rules
had removed and this capture's rules no longer reached: at stop 1 the author and date lines and the
two boxes (8 segments, quoted in full in `R25-scan-walla-1`); at stops 2–4 the whole site menu (114,
121, 120 bulleted items) plus the header labels, author/date, captions, boxes, tags and the
`walla_ssr_page_has_been_loaded_successfully` span.

**Gate 2 at every walla stop named rules whose CSS class hash had moved**: 3 of 3, 8 of 8, 12 of 14 and
11 of 12 silent rules carry a `css-` class (jq over the four scan files); the others are positional
(`… > div:nth-of-type(1)`) or, at stop 4, `#main-footer` after three redesigns. At stop 3 ALL eight
rules created at stop 2 were silent after eleven months; at stop 4, eleven of the thirteen created at
stop 3 — the two survivors are the two without a hash, `div.left-side` and `section.tags-and-breadcrumbs`.
The researcher's ruling at stop 1 — hashes moved, the element did not leave — was confirmed for every
later stop by the page: the same elements were re-marked under a new hash each time. **Widgets
legitimately leaving: 0 of 37 silent-rule entries.**

**Gate 4's unseen removals fell 80 → 66 → 8 → 2 with no trust given.** The rules that produced them —
the related-box aside (58, 55) and `section.css-1tkogwg` (13, 9) — went silent at stop 3. The fall is
rule mortality, not trust.

**The three second approvals.** Twice the page's kept text still held a segment Gate 1 had named after
the researcher's CORRECT — the photo caption at `20210612183110` (its 2020-12-18 rule silent, no new
rule reaching it) and the video caption at `20220523123302` — read from the page after the approval
(`R25-walla-20210612183110-page-reading`, `…20220523123302…`), and corrected by a second approval on the
same capture. Once, at `20240520195927`, an added rule was a positional path six levels into
`section.article-content` ending at an anchor inside a body paragraph, labelled by the page with article
text (`מסמכים שפורסמו היום על ידי ה-FDA`); it matched nothing under derivation and the phrase stayed in the
kept text, and it was ENDED by a second approval — the walk's only RULE_ENDED, with `validTo` equal to
its `validFrom`, so it governs no date. Each is a decision pair recorded on the page.

**Two rules shadowed by an older rule.** `footer.video-description` (2020-12-09) and the new
`div.css-0.vertical-1 > span:nth-of-type(1)` (2021-06-12) each showed `לא תאם דבר` on the capture the
page displayed while an older rule removed the same element first; Gate 2 did not name them, which under
A4 means their predecessor count was 0 too. Read from the page; recorded, not chased.

**The stretch's end.** Scans 5, 6 and 7 (the last after corona's two calls) each returned
`ARCHIVE_UNAVAILABLE` at `20250208221410`, walla's one UNFETCHED row, the walk having re-derived the five
accepted rows each time. The archive, asked directly from the laptop for that capture's raw replay,
answered HTTP 429 three times (`R25-archive-429-walla-20250208221410-2026-09-06.txt`): rate-limiting, a
transient refusal, reported by the walk as its contract says. The two stored captures after that row
were therefore not reached, and no stop on an UNFETCHED row was observed.

## 3 — corona: the stops, in walk order

`https://corona.health.gov.il/vaccine-for-covid/`, page `45ce88aa-02a1-4361-be40-977a8e2fb050`, 133
rows (83 ACQUIRED, 1 UNCHANGED, 49 UNFETCHED). Rules in force: 4 from `20211223211940` — the skip menu,
`#header`, `#footer`, `div.back-top.d-none` — none trusted (step 6). Every scan is `(url, maxCaptures=133)`.

| # | call · file | walked · superseded | stop | gates | Gate 1 | Gate 4 | researcher's answer | approve → seq · changes |
|---|---|---|---|---|---|---|---|---|
| 1 | scan 1 · `R25-scan-corona-1` | 2 · 1 | `20220105113501` | 1, 4 | nowRemoved `חיסונים` (under `#header`) / nowKept `חיסונים` | `#footer` 1: `כל הזכויות שמורות למשרד הבריאות © 2022` | **CONTINUE, no trust** — "the existing rules were good" | approve 1 · `R25-approve-corona-1` → 3 · 0 / 0 / 0 / 0 |
| 2 | scan 2 · `R25-scan-corona-2` | 3 · 2 | `20220109225622` | 1 | nowRemoved `חיסונים` / nowKept `חיסונים` | quiet (the footer line was SEEN at stop 1) | the stretch ends here, by the researcher's ruling | — |

Gate 2 never fired on corona: all four id- and class-based rules matched on every row walked. Decisions
on the page: 3 (step 6's 2 + 1 today). Rules unchanged: 4, none trusted, none ended.

**Gate 1's alarm on corona is permanent, and that is read from the code, not from the second
occurrence.** A4's Gate 1 is (removed(c) ∩ kept(p)) ∪ (kept(c) ∩ removed(p)) ≠ ∅ over SETS, and
`src/walk/gates.ts` (`changedSides`, over the reused `compareExtractions`) implements exactly that. The
word `חיסונים` is a nav item inside `#header` (removed) AND a body heading (kept) on every corona
capture, so both intersections are non-empty on every consecutive pair for as long as the page carries
the word in both places. The step 6 record's reading — that the word was on one side only on the other
capture — was wrong; the gate does not ask whether a segment CHANGED sides, only whether it is on
opposite sides across two captures, and a segment on both sides of both satisfies that trivially. Every
remaining corona row would stop on Gate 1 with CONTINUE the only answer. Under the researcher's rule
that a defect readable from the code is ruled and not measured, corona's stretch was ended after the
second consecutive alarm; the stops after it are DERIVED. The candidate predicate is recorded for the
flows doc (§7 below); nothing changed today.

## 4 — the counts per gate

All from the calls named in §2 and §3 (six stops: four on walla, two on corona).

| gate | walla | corona | direction / ruling |
|---|---|---|---|
| Gate 1 | 4 stops of 4 | 2 of 2 | walla: removed → kept every time (nowRemoved 0), 8 / 126 / 135 / 129 segments; corona: one word on both sides, both directions, the same word twice — a false alarm on the researcher's ruling, permanent by the code |
| Gate 1' | 0 | 0 | never asked — see §6 |
| Gate 2 | 4 stops of 4, 37 silent-rule entries (3 · 8 · 14 · 12) | 0 | widget legitimately leaving: **0**; hashes moved: 34 of 37 carry a `css-` class, the rest positional or `#main-footer` at stop 4 |
| Gate 4 | 4 stops of 4, 156 unseen removals (80 · 66 · 8 · 2) | 1 stop of 2, 1 removal | every claiming rule REVIEWED throughout — no trust was given |
| Gate 5 | not reached | not reached | 0 classifier calls |

**Before trust / after trust.** The researcher ticked no trust on either page, so the whole walk is the
"before trust" stretch and there is no observed "after". The derived "after the obvious ones are trusted"
is computed from the recorded material as the plan asks: a stop is prevented by trust only if Gate 4 was
the ONLY gate that fired on it, since trust silences Gate 4 alone. **Six stops; Gate 4 was the only gate
on 0 of them.** Every walla stop carried gates 1 and 2 beside 4; corona's first carried gate 1 beside 4
and its second was gate 1 alone. Trusting the aside, `section.css-1tkogwg`, `#main-footer`, `#footer` and
every other rule Gate 4 named would have removed 157 removal entries from the material and prevented no
stop — derived.

## 5 — the premise's verdict, in one sentence

**On walla the premise did not apply, and on corona it could not be tested: of six stops, none would have
been prevented by trust (derived, §4), because every one carried Gate 1 — on walla from CSS-hash churn
that silenced 34 of 37 rules across four redesigns and returned the removed furniture to the kept text,
on corona from a one-word segment that sits on both sides of every capture — so the stop rate is set by
the selectors' mortality and by A4's set semantics, not by how many rules are trusted.** Both causes are
readable and both are ruled in the flows doc, not here (§7). The rules created today are not durable —
§9.6's rebuild drops them with the staging database — so the counts and the two findings are this
measurement's product.

## 6 — not measured, and why

- **Gate 5 at a stop.** Reached by no call: at every stop gates 1, 2 or 4 had fired first. Zero
  classifier spend across nine `scan_captures` calls.
- **A stop on an UNFETCHED row.** Walla's one such row was refused by the archive three times (429);
  corona's stretch ended before its first (`20220307110948`).
- **Gate 1'.** Never asked. It runs on a STALE ACQUIRED row carrying a CAPTURE_ACCEPTED, and every
  accepted row stayed RESOLVED: its acceptance records the ruleset in force at its own date, and every
  rule created today has a later `validFrom`, so RULESET_ID at the accepted dates did not change. The
  `superseded` counts (1 · 2 · 3 · 4 · 5 on walla) are the accepted rows re-derived as would-bes, not
  Gate 1' material.
- **Trust ticks, and Gate 4 "after trust" observed.** The researcher gave none; the derived figure is §4's.
- **Walla's last two stored captures** (after `20250208221410`) and **corona's rows after
  `20220109225622`**: not walked, for the reasons in §2 and §3.
- **The digest match count**: read from `digestVerified` after step 5's walk, as the plan's note says.

## 7 — findings for the flows doc and step 5's brief (recorded, nothing changed)

Detail in `handoffs/R25-notes-for-step-5-brief-2026-09-06.md`, notes 1–5. In one line each:

1. **An actionable element with no defined moment is a design or UX miss** (the researcher's ruling):
   the trust tick was the first instance, unmarking a silent rule the second — Flow 2 calls a silent rule
   "expected and cheap" and names its cleanup, expiry, as "still open".
2. **Guidance on silent rules**: end one only when the researcher knows why it went silent and has
   replaced it; otherwise leave it for expiry; never tick trust on a silent rule.
3. **Before the button, did the draft answer what the gate raised?** Twice a CORRECT left a Gate 1
   segment kept (§2). The check is a fact the preview already has the inputs for; it belongs to the
   JUDGING moment (step 5), as ONE function with two callers — the preview route and `approve_article_rules`.
   It could not have helped today: the reporting walk writes no stop, so the page held no material.
4. **Generated selectors carry build hashes, so rules die at every redesign** — 34 of 37 Gate 2 entries;
   the hashless siblings (`main-header`, `breadcrumb`, `tags-list`, `left-side`, `tags-and-breadcrumbs`)
   survived. The selector generator over-specifies; a design matter for MARKING and A6's preview.
5. **A4's Gate 1 fires forever on a segment present on both sides of the same capture** (§3). Candidate:
   intersect kept*(x) = kept(x) \ removed(x) and removed*(x) = removed(x) \ kept(x). A4's ruling.

Also recorded: the marking page and its GET answered a browser with no session (whether PUT /draft is
equally open was not tested; auth is `docs/gf-mcp-oauth-dev-plan.md`'s); a stray click can create a rule
inside article text and nothing on the page says so (§2, the ended rule).

## 8 — warnings and refusals, counted from raw output

- `ARCHIVE_UNAVAILABLE`: **3** (walla scans 5, 6, 7), all at `20250208221410`; HTTP 429 from the archive
  on each of three direct probes.
- `approve_article_rules` refusals: **0** of 8 calls. Classifier warnings: none — no classifier ran.
- **One count disagrees with yesterday's record.** The step 6 doc counted Gate 4 at `20201218044603` as
  84 removals (8 · 61 · 1 · 14) "by hand from the raw return"; today's file, counted by jq, holds 80
  (8 · 58 · 1 · 13). The bytes and the rules were the same, so the material should be one set; either the
  hand count or the transcription of today's return into the file is off by four. This doc carries the
  file's count and says so.

## 9 — the state left on staging

Walla: 56 Rule rows (55 in force at `20240520195927`, 1 ended at its own `validFrom`), 17 decisions,
draft cleared. Corona: 4 Rule rows, 3 decisions, draft cleared. Nothing anchored, nothing stored by any
walk: every `scan_captures` here was the reporting walk. These rules go with the database at §9.6's
rebuild; the record of what they showed is this document.
