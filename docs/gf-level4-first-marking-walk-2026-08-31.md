# The first marking walk — Level 4's page, used by a human for the first time, 2026-08-31

**Bears on: Level 4**

A findings record, not a plan. Run against **staging**, `get_environment` → `CONFIRMED` on both
axes: database ref `elws…ae` (pinned), chain **84532**, registry
`0x65b9a7acb45Aa05e7Ed207844F93a2b308373853`, deployed.

The page had never been rendered by anyone. `next build` passed and the route was in the table, and
that was all. This is the record of the first twenty minutes a researcher spent in front of it.

**Nothing was committed.** No `ArticleRuleset` was written, no capture was re-derived, no chain write
occurred. The calibration run `cmthffvwu0001xlvibn62hc1r` was left `OPEN` holding one selector.

---

## What the walk was for

Level 4's own `STATUS:` records the central question as unmeasured: *"THE FILTERING QUESTION IS STILL
UNMEASURED, and the first marking walk IS that measurement: a human judging newly created state, never
a re-measurement of the corpus."*

**That question is not answered here, and this document does not claim it is.** One selector on one
capture cannot establish whether human-marked filtering is safe. What the walk did establish is that
the page is not yet usable enough to answer it, and it produced eight findings — three of them in the
instrument that Level 4 relies on to know when to stop.

## The subject, and why

`https://corona.health.gov.il/vaccine-for-covid/`, chosen by the researcher from two candidates.

| | corona vaccine page | `news.walla.co.il/item/3403847` |
|---|---|---|
| In archive | 133 | 9 (**8** — see F5) |
| Stored | **83** | 7 |
| Span | 2021-12-23 → 2026-03-05 | 2020-12-09 → 2025-03-26 |
| Distinct stored document states | **12** | 7 |
| Furniture | government template, no ad slots | real ad and analytics slots |

Corona was chosen for stratification depth and because it is the page the published thesis and the 90
MOH claims rest on. **The Walla page remains the better adversarial-furniture subject** and is worth
its own run once the page is rebuilt — it is simply too small to baseline anything.

---

## What was actually marked

One selector, on capture 1 of 12 (`2021-12-23`, body 4,731 characters).

```
selector   #header
matched    1
removed    250 characters — 5% of the derived text
positional no
```

### The removed text, in full — this is the measurement

```
למידע בכל הנושאים        For information on all topics
• בית                    Home
• תו ירוק                Green Pass
• תעודת קורונה           Corona certificate
• חו"ל                   Abroad
• חיסונים                Vaccines
• בידוד                  Isolation
• בדיקות                 Tests
• הנחיות לשגרה           Routine guidelines
• מאומתים וחולים         Confirmed cases and patients
• לימודים וחינוך         Studies and education
• תמונת מצב              Situation report
• • • • • • •            seven bare bullets — icons whose stylesheet the archive dropped
חיפוש                    Search
עברית · English · العربية · Русский
```

**Nothing in it is content.** No claim, no number, no date, no prose. Site navigation, a search
affordance and a language switcher. Removing it loses nothing the corpus should ever diff.

**One observation worth keeping, because it is the case for this level's design made by example
rather than by argument.** Those nav labels are the *same vocabulary as the article* — "חיסונים",
"בידוד", "תו ירוק" are the words the page's content uses. Any classifier scoring "does this look like
content?" has a genuinely hard case here. The human did not hesitate. The plan asserts *"identifying
furniture is perception, not inference"*; this is the first observation of that being true rather than
argued.

### Final run state

```
version                  4
selectors                ["#header"]
rulesetId                1b8c72f8
capturesShown            1
corrections              2
correctionRate           2          ← see F3
consecutiveCleanCaptures 0
staleSelectors           []
status                   OPEN
```

---

## What passed

- **The positive control.** With `selectors: []` the removed pane read *"לא הוסר דבר"* and the
  fraction read **0%**. Step 1's guarantee — that the chrome ruleset derives byte-identically on an
  empty ruleset — holds in the rendered page, not only in tests. Every later reading means something
  because this one did.
- **The sampler does what it claims.** `stratifiedSample`'s formula was applied to the 83 stored
  captures *before* the page was opened, predicting twelve dates. The page offered exactly those
  twelve. The projection in F8 is therefore measured, not inferred.
- **The selector came out non-positional.** `#header`, an id. The page carries a `מיקומי` (positional)
  warning for the bad case and it did not fire. The outline prefers a stable id where one exists.
- **The outline says when it truncates.** *"המבנה נקטע. אינכם רואים את המסמך כולו."* It does not
  truncate silently, which was the explicit design intent (`chromeRulesetApply.ts:259`).

---

## Findings

### F1 — the outline's depth bound hides 76% of the page. **Blocking for the next walk.**

`documentOutline` bounds at `maxDepth = 6`, `maxNodes = 400`. On this page the tree stops at roughly
**40 nodes**, nowhere near the node cap: **depth is the binding constraint.**

This government template spends six levels on wrappers before reaching content:

```
body.rtl (4731)
└─ #wrapper → div → #main → div → div.article-page.w-100
   ├─ div.banner-section (115)
   ├─ div.subtitle-wrap (106)
   ├─ div.articles-block (3587)   ← depth 6. LEAF. Cannot be opened.
   └─ div.related-content-component (41)
```

**`div.articles-block` holds 3,587 of 4,731 characters — 75.8% of the document — and is handed to the
researcher as a single unopenable leaf.** Roughly 1,000 characters of plausible furniture are
reachable; everything inside the article body is not.

The page's own instruction compounds it. It asks the researcher to mark *"ניווט, פרסומות, כותרות
תחתונות **וחותמות זמן**"* — navigation, ads, footers **and timestamps**. Timestamps live inside
article bodies. **The page asks for something its own outline makes unreachable.**

This answers the handoff's question about whether 400 nodes at depth 6 is the wrong bound: the node
cap is generous and **the depth cap is far too shallow** for real templates. The fix is not simply a
larger number — a depth that reaches content on this page may blow the node cap on another. Bounding
by *reachable content* rather than by raw depth is the shape worth considering.

### F2 — the stopping indicator counts captures nobody judged. **Corrupts Level 4's only ground truth.**

`foldEpisodes` (`services/calibrationRun.ts:178`):

```ts
if (decision.type === CalibrationDecisionType.CAPTURE_SHOWN) {
  clean.push(true);          // merely displaying a capture scores it clean
  continue;
}
if (decision.type === RULESET_CORRECTED && clean.length > 0) {
  clean[clean.length - 1] = false;
}
```

`CAPTURE_ACCEPTED` — the event the accept button writes, and the only one that *is* a human judgement
— **is never read by the fold.** The schema documents the event that is counted in its own words:

> `/// The system chose this capture and showed it. Nothing is judged yet.`
> `CAPTURE_SHOWN`

**Observed, not deduced:** on first load, before the researcher had touched anything, the page read
*"1 ברצף לא נזקקו לתיקון, על פני 1 צילומים שונים"* — one in a row needed no correction.

Level 4's stopping rule is *"no corrections on the last three versions"*. **It is reachable by paging
through three captures and marking nothing.**

The irony is local. The neighbouring field carries a nine-line comment insisting **null is not zero**
because *"a rate of 0 from an empty denominator reads as a ruleset that has been tested and never
needed fixing, which is the opposite of the truth."* That guard was put on `correctionRate` and not on
`consecutiveCleanCaptures` — and the streak is the one the plan calls the stopping indicator. Same
vacuity shape the integrity board already found in itself twice; a third instance.

### F3 — `correctionRate` is not a rate and is unbounded. **Measured at 2.0.**

```
capturesShown  1
corrections    2
correctionRate 2
```

The numerator counts `RULESET_CORRECTED` decisions — every edit to the selector list. The denominator
counts captures *shown*. A researcher making N edits while looking at one capture scores N. There is
no upper bound and the value is not in `[0, 1]`.

This interacts with F2 in opposite directions: **the streak is overstated** (unjudged captures score
clean) while **the rate is diluted** by every capture displayed and not decided. Neither number can
currently be quoted as evidence of anything, and neither should be until both are fixed.

The `stoppingIndicator` prose string is well written and carries its own caveat honestly. The numbers
underneath it are the problem.

### F4 — the researcher's UX findings, recorded as theirs

Verbatim in substance, from twenty minutes of first use:

1. **The structure pane is very technical** — cryptic code, hard to know what to click.
   `div.footer-top > div:nth-of-type(1) (479)` is what the *system* needs; the human needs a label.
2. **The rules created by clicking are not visible**, and cannot be changed from where the marking
   happens.
3. **Anything clickable should be un-clickable** — marking is a click on the tree, unmarking is a
   `הסר` link in a list elsewhere. Free exploration requires a toggle.
4. **The page should open with inferred default rules**, so the researcher makes small fixes rather
   than building a ruleset from scratch. → see F7, which is where this gets constrained.
5. **This needs a wide screen**, and overriding the mobile-first rule is acceptable here. Later
   refined to: **before / after / rules as tabs** rather than side-by-side panes.

Confirmed independently from the DOM: the removed pane sits roughly **three screens below** the
outline node the researcher clicks, and both text panes are fixed-height (`h-64 overflow-auto`) boxes
that open mid-content — the amber removed pane was displaying its *tail* while the nav list it had
removed was scrolled out of view inside the box. **The single most important thing the page has to say
is the thing the researcher must go looking for.**

**On tabs, one constraint the layout must respect.** The page's own text states the reason: *"סימון־יתר
אינו נראה בטקסט שנשמר: כלל שבולע פסקה משאיר על המסך משהו נקי ומשכנע"* — over-marking is invisible in the
kept text; a rule that swallows a paragraph leaves something clean and convincing on screen.
Over-matching is the dangerous direction. **Before and after are alternatives and may be tabs; REMOVED
is not an alternative, it is the instrument, and must stay visible whichever tab is active.**

### F5 — `list_captures` double-counts a duplicated archive index row

The Walla page's `20210612183110` capture is returned **twice**, byte-identical in every field.

`archiveVerification.ts:376` builds one output row per *index* entry, while the stored side is a `Map`
keyed by timestamp. A CDX index returning a timestamp twice therefore inflates `inArchive`, inflates
`counts.storedLocally` (`archiveVerification.ts:446`), and emits a duplicate capture row.

**It does not reach the marking sample**, which reads `urlSnapshot` directly. Walla holds **7** stored
captures, not 8. The defect is in the reporting tool only.

### F6 — no MCP tool enumerates tracked URLs

`get_environment` reports `trackedUrls: 3`. Nothing can name them. `list_captures`,
`get_forensic_timeline` and `correct_article_rules` all *require* a URL; `check_on_chain_status` keys
on a file hash. Two of the three were recovered from this repository's own docs; **the third is still
unidentified**.

Same class as the recorded gap that no MCP tool can enumerate theses. It bit directly here: the walk's
instruction was *"do not guess a URL, list what the corpus holds and let the researcher choose"*, and
the corpus cannot be listed.

### F7 — seeding is not the re-rejected signal, but its SOURCE decides that

The researcher's F4-item-4 borders a design ruled against twice. The plan's rejection is narrower than
it first reads:

> *"Putting a new, uncalibrated **statistic** in front of a reliable human instrument is a bad trade."*

What was killed is **frequency across captures** — a block present for 80 of 83 captures and then
genuinely removed scores 96%, a 95% threshold classifies it chrome, and 29 real changes vanish on
staging (84 at 80%). What the plan *endorses* two paragraphs later is structure: *"Only structure
can"* generalise, which is the entire reason Level 4 acts on HTML before `htmlToText`.

| seed source | verdict |
|---|---|
| frequency / transitions across captures | the re-rejected signal. **Not available.** |
| a model's confidence that a block is chrome | the same thing in a different hat. **Not available.** |
| semantic HTML — `<nav>`, `<footer>`, `<header>`, `role`, `aria-label`, skip-links | **not the rejected thing.** Deterministic, threshold-free, corpus-independent, cannot silently drift — the properties the plan demands of its null check. |

**Caution on "infer like we do today":** what is done today is Readability, on record discarding
**~31%** of the document including real content. Seeding from Readability's output would inherit a
known over-removal into the defaults, invisibly.

**An argument for seeding the plan has not made, and it is the strongest one.** Building from scratch
means `corrections` counts *construction*, not correction — the stopping indicator has nothing to be a
correction *of*, which is a third way (alongside F2 and F3) in which the current instrument measures
nothing. Seed the page and every correction becomes a genuine disagreement with the machine, which is
exactly the quantity Level 4 says it wants.

**The risk it introduces is automation bias** — a rubber-stamped default is an automatic classifier
laundered through a human click, which would reproduce the 29-lost-changes outcome by a different
route. Mitigation is cheap: record which selectors were seeded and which the human added, so a later
reader can distinguish *the human agreed* from *the human never looked*.

**Not decided here.** Restating this level's invariant — *"no block unique to a capture is ever
classified chrome"* — for structural marks is reserved for the researcher, and a structural seed is
precisely that decision.

### F8 — the sample spreads over captures, not over document states

`CAPTURE_SAMPLE = 12`, spread evenly by `stratifiedSample` over 83 stored captures in `capturedAt`
order. Predicted before opening the page and **confirmed exactly** by what the page offered:

`2021-12-23` · `2022-03-07` · `2022-04-01` · `2022-05-02` · `2022-05-25` · `2022-06-20` ·
`2022-07-09` · `2022-08-10` · `2022-09-21` · `2023-03-16` · `2025-04-21` · `2026-03-05`

**Twelve slots, nine distinct documents.** `2022-03-07` / `04-01` / `05-02` are identical bytes
(`5a51aa38…`); `2023-03-16` / `2025-04-21` are identical bytes (`1d2b92f6…`). **Three of the page's
twelve known states are never shown at all** — the January 2022 state (`1359af3a…`), the single-capture
state of 2022-01-27 (`37937bbf…`), and the whole November–December 2022 state (`173f1e0e…`).

The cause is that even spacing is over *capture count*: twenty-four consecutive captures in March–May
2022 are one document and take three slots, while a state that existed for one capture takes none.

**This bears on the adaptive half of the next-capture policy, which is open.** It is evidence about
what that half should reach for — stratifying over distinct `contentHash` runs rather than over
captures would cover all twelve states in twelve slots. It is **not** a proposal to be adopted here;
the open question is named in the plan and belongs to its own design pass. Recording it as evidence,
not as a decision.

### F9 — the commit sentence is untranslated

At the foot of a Hebrew RTL page, in English: *"Approving will save the ruleset as a new version, and
re-derive the text of 83 stored captures…"* The string arrives from the backend tool's `effect` field
rather than from `he.json`, so it never passed through localization. **It is the one sentence on the
page describing what approval actually does.**

### F10 — at 3,000 snapshots the UI holds, the query does not, and F8 gets worse

Raised by the researcher during the walk: what does the צילומים section do when a page has been
scanned 3,000 times?

**The UI is already safe.** `ArticleRulesClient.tsx:254` renders `captures.sample` — always twelve
rows — and `total` appears only as a number inside *"{shown} מתוך {total}"*. At 3,000 captures the
section reads *"12 מתוך 3000"* and lists twelve dates. Nothing unbounded reaches the screen.

**Two things do not scale, in increasing order of importance:**

1. **The query is unbounded.** `articleRulesRoutes.ts:142` issues a `findMany` with no `take`,
   loading every snapshot row for the URL in order to select twelve. Four small columns × 3,000 rows
   is survivable; the shape is not, and the fix (sample by index in SQL, or bound the read) is
   mechanical.

2. **F8's distortion grows with the corpus, and this is the real one.** Twelve slots is a *constant*,
   so coverage of distinct document states degrades as captures accumulate. At 83 captures twelve
   slots reached nine of twelve states. At 3,000 captures spread over the same twelve states, even
   spacing by capture count would concentrate almost the entire sample in whichever eras were scanned
   most densely — and a state that existed briefly would be as invisible as `37937bbf…` already is.
   **Stratifying over distinct `contentHash` runs is scale-invariant; stratifying over captures is
   not.**

**This is not, by itself, an argument that twelve is too few.** The plan accepts the generalisation
explicitly — *"a mark must generalise from a handful of sampled pages to thousands"* — and marks are
structural precisely so that they can. What covers the other 2,988 is not the sample but the
deviation check: *"the page stopped resembling the approved set"*, whose formula is an **open
question** with `RulesetObservation` already holding its inputs. **The larger the corpus, the more
load that undecided formula bears.** At 83 captures a weak deviation check is a small gap; at 3,000 it
is the only thing standing between a twelve-capture approval and a corpus-wide filter.

---

## Incidental, noted and not chased

- The archive holds a **404** for this page at `2024-08-29` which was never stored. This corroborates
  the recorded Level 8 defect where a diff reports `2024-08-29 → 2025-01-11` over a capture the corpus
  does not hold, overstating precision by ~177 days.
- `2022-05-29` reverts to the `5a51aa38…` bytes after `6cf389c4…` had already appeared on 05-26. A
  genuine content revert, not an artifact.

## What was NOT measured, and must not be read as measured

- **Whether human-marked filtering is safe.** One selector on one capture. The removed text contained
  no content, which is one honest data point and nothing more.
- **The removal fraction across captures**, which step 2b needs as its deviation baseline. Only
  capture 1 was marked; 5% of one capture is not a baseline.
- **Whether the outline is usable at real page size** — F1 makes this unanswerable as built, since
  the researcher cannot see 76% of the document.
- **Anything derived from `correctionRate` or `consecutiveCleanCaptures`.** F2 and F3 make both
  unquotable until fixed.

## Why the walk stopped at one capture

Marking eleven more captures would have measured a page that the same session had already established
needs rebuilding — F1 puts three quarters of the document out of reach, and F4 is five independent
usability defects found in twenty minutes of first contact. The remaining eleven captures cost real
researcher time and would have produced a measurement of an instrument about to be replaced.

The run was left `OPEN` rather than committed. Nothing about the 83 stored captures changed.
