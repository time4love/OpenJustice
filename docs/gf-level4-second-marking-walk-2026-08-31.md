# The second marking walk — the filtering question, answered, 2026-08-31

**Bears on: Level 4**

A findings record, not a plan. Run against **staging**, `get_environment` → `CONFIRMED` on both
axes: database ref `elws…ae` (pinned), chain **84532**.

The first walk (`docs/gf-level4-first-marking-walk-2026-08-31.md`) stopped at one selector on one
capture and produced ten findings about the instrument. Those were fixed in PRs #288, #289, #290 and
#291. **This is the walk the level was actually waiting for**, on the same calibration run,
`cmthffvwu0001xlvibn62hc1r`, against `https://corona.health.gov.il/vaccine-for-covid/`.

**Nothing was committed.** The run is still `OPEN`. No `ArticleRuleset` was written, no capture was
re-derived, no chain write occurred. All 83 stored captures are untouched.

---

## THE ANSWER, and its scope

Level 4's `STATUS:` has said *"THE FILTERING QUESTION IS STILL UNMEASURED"* since the level was
designed. It is now measured, on two captures **4.2 years apart**, and the answer is:

> **Human-marked structural filtering removed furniture and nothing else. Every substantive claim
> survived. The marks generalised across a site redesign.**

The scope of that claim is narrow and must not be widened: **one page, two captures, one
researcher, nine selectors, nothing committed.** It is not a claim about the corpus, about other
sites, or about pages with real advertising — the news page that carries ad slots is still unmarked.

---

## What was marked

Nine selectors, ruleset `cc335da7`, built on the earliest capture and never rebuilt:

```
#header
#footer
#link-dictionary
ul.skipMenu.noPrint.list-unstyled.d-none.d-lg-block
ul.skipMenu… > li:nth-of-type(1)          positional
ul.skipMenu… > li:nth-of-type(2)          positional
ul.skipMenu… > li:nth-of-type(3)          positional — NEVER MATCHED, see below
body.rtl > noscript:nth-of-type(1)        positional
body.rtl > script:nth-of-type(1)          positional
```

Five of the nine are positional, and the page said so on every one of them. Three are redundant:
the parent `ul.skipMenu…` covers all three `li` children, which the researcher added after seeing
them listed.

## Capture 1 — `2021-12-23`, the era the rules were built on

**12% removed, 577 of 4,731 characters.** Every removed block was site furniture: the site menu, the
footer's link columns (*Services and information*, *Tools*, *About the site*), the contact channels,
"follow us", the app-download prompt, the skip-to-content link.

Kept text, probed for substance — **all present**:

```
FDA ✓   פייזר ✓   מודרנה ✓   אסטרהזניקה ✓   בוסטר ✓   מנות ✓   מגיל 12 ✓
```

## Capture 12 — `2026-03-05`, across a redesign

**The cross-redesign test, and the result that matters.** The same ruleset, unchanged, applied to a
capture 4.2 years later:

| | result |
|---|---|
| removal fraction | **13%** (654 chars) — against 12% on the 2021 capture |
| selectors still matching | **8 of 9** |
| `#header` | matches, 200 chars |
| `#footer` | matches, 394 chars |
| `ul.skipMenu…` | matches, 56 chars |
| substantive claims kept | FDA, Pfizer, Moderna, AstraZeneca, booster — **all present** |

**Structural marks generalise.** This is the plan's central bet — *"a mark must generalise from a
handful of sampled pages to thousands… only structure can"* — tested against a real redesign rather
than argued, and it held.

### The one selector that broke is the one the system caught by itself

`ul.skipMenu… > li:nth-of-type(3)` reports `lastMatchedAt: null` — **it has never matched anything**.
`findStaleSelectors` flagged it without being asked, which is the only automated part of this level
and the one it was built for: *"a selector either matches or it does not — no threshold, no
calibration, and nothing that can silently drift."*

It is also the predicted failure: the page labelled it **positional** before it was committed, and
positional is precisely the kind that stops meaning the same thing. Prediction and outcome agreed.

---

## THE HARD CASE, and the researcher's ruling

The removed text is **not identical** across the two captures, and the differences are real:

| | 2021-12-23 | 2026-03-05 |
|---|---|---|
| `תו ירוק` (Green Pass) in the footer nav | present | **gone** |
| `כלים` (Tools) — issue Green Pass, issue Covid certificate, isolation calculator, entry/exit declarations, country classifications | 6 items | **heading present, section EMPTY** |
| contact hours | absent | **added** (Sun–Thu 08:00–18:00; Fri/eve 08:00–13:00) |
| `תוכנית רמזור רשויות מקומיות` | present | gone |
| copyright | © 2021 | © 2026 |

These are dated traces of the Covid apparatus being dismantled, and under this ruleset the differ
will never see any of them.

**The invariant as written could not resolve this.** *"No block unique to a capture is ever
classified chrome"* is **capture-scoped**, and the footer appears in every capture, so it passes.
What changed was its contents.

### The researcher's ruling: the footer is chrome, and the reasoning is the restatement

Given verbatim, and recorded as theirs:

1. **The footer is common to many pages and cannot be considered article content of this specific
   page.**
2. **The Green Pass link disappeared because it is no longer required. That it left a toolbar of
   links pointing at other pages of the site is a trivial fact, not evidence.**
3. **The adverse-events reporting link is different, and was probably inside the article body rather
   than a footer tool.**

**Clause 3 was verified rather than assumed.** `שאלון תופעות לוואי` is in the KEPT text and absent
from the removed text on both captures, sitting in the article body immediately after the lede:

```
…available at all the health funds | • שאלון תופעות לוואי | • מוקדי התחסנות | • Covid vaccine 12+…
```

`מוקדי התחסנות` and `דיווח` are kept as well. **The reporting path is protected by where it sits in
the document, not by luck** — which matters, because adding the MOH reporting portal as a tracked URL
is on the researcher's own reserved list.

### The candidate restatement, derived from clause 1 — NOT YET ADOPTED

Clause 1 is not merely a judgement about this footer; it supplies the criterion the invariant lacked.
The invariant is capture-scoped; the researcher's reason is **page-scoped**:

> A block may be classified chrome only if it appears across **other pages of the site**, not merely
> across captures of this one. A block unique to this page is never chrome, however constant it is —
> and a shared block stays chrome even when its contents change, because those changes belong to the
> site rather than to this page.

This is the same principle as the recorded rule that **the tracked unit is the PAGE**, applied to
marking. It resolves the Green Pass case exactly: the link vanishing is a fact about the site's
navigation, not about what this page claimed.

**The wording is proposed, not adopted.** Restating this level's invariant is reserved for the
researcher, and the plan should not record it until they have confirmed or amended the sentence.

---

## What the instrument did, now that it works

The stopping indicator, live, at the end of the walk:

```
capturesShown             10
capturesJudged             4      ← six captures shown and never judged
corrections               16
capturesNeedingCorrection  2
correctionRate           0.5
consecutiveCleanCaptures   2      ← two of the three the stopping rule wants
staleSelectors             1      (li:nth-of-type(3), never matched)
```

**`capturesShown: 10` against `capturesJudged: 4` is the F2 fix demonstrating itself on real data.**
Before PR #288 those six unjudged captures would each have scored as a clean episode, the streak
would have read 10, and the stopping rule — *"no corrections on the last three versions"* — would
have been satisfied by scrolling. It now reads 2, from four actual judgements.

**`corrections: 16` counts CONSTRUCTION, not correction.** The researcher built a nine-selector
ruleset from an empty one, and every added selector is an adopted ruleset. The episode-level number
is the honest one: `correctionRate 0.5`, two of four judged captures needed the rules changed. This
is the concrete argument for F7 seeding — with a seeded default, every correction would be a real
disagreement with the machine rather than a step in building a list from nothing.

---

## Defects found and fixed DURING this walk

The page had never been used by anyone when the walk began. Five defects surfaced within minutes
and all five are landed:

| | defect | fix |
|---|---|---|
| **I1** | The root was markable. The researcher marked `body.rtl` while exploring and drove removal to **98%** | #290 — refused by text length, so an all-containing wrapper is refused too |
| **I2** | Every click fired two sequential POSTs with the tree `disabled`; clicks in that window vanished | #290 — local draft, debounced preview (200ms) and decision (900ms), tree never frozen |
| **I3** | Every click wrote a `RULESET_CORRECTED`; 8 rows for one capture of exploration | #290 — coalesced against the last **recorded** ruleset, so mark-then-unmark writes nothing |
| **I5** | Judgements were silent — no confirmation, no advance, no completion mark. **Reported twice as "the button is unresponsive" when the decision had in fact been written every time** | #291 — names what it recorded, advances to the next unjudged capture, ticks the strip, shows a saving state |

**I1 is worth keeping in view: the instrument caught it.** A ruleset removing 98% of the document is
the worst possible over-match, and the removed pane said so immediately and loudly. That is exactly
what *"over-matching is invisible in what survives"* was built to prevent, working on the first day
a human tried it.

## Defects found and NOT fixed

- **I4 — an expired researcher session presents as an unresponsive control.** It happened **twice**
  in this one walk, and the second time cost the researcher a reconnection in the middle of
  confirming the `2026-03-05` capture. The page does render *"sign in as a researcher"*, but it
  replaces the view further down while the controls the researcher is looking at simply stop
  working. Reading that as a dead button is correct, not careless. **This is a real gap in a page
  whose whole job is a long attentive human task.**
- The three redundant positional `li:nth-of-type(…)` marks are still in the ruleset, one of them
  dead. Nothing is committed, so they cost nothing yet.

---

## What is still NOT measured, and must not be read as measured

- **Any page with real advertising.** The news page (`news.walla.co.il/item/3403847`) carries live ad
  slots and is the harder subject by far. It has never been marked. Every claim here is about a
  government template.
- **Ten of the twelve sampled captures.** Two were marked; six more were shown and never judged.
- **Whether the ruleset is right at scale.** It has never been committed, so no capture has been
  re-derived under it and the deviation check has no inputs.
- **The corpus.** Nothing here re-measures existing state; the walk judged newly created state, which
  is what the plan asked for.

## State left behind

```
run       cmthffvwu0001xlvibn62hc1r   OPEN, version 29, ruleset cc335da7
selectors 9 (5 positional, 3 redundant, 1 dead)
captures  83 stored, untouched — nothing committed, nothing re-derived
```

The natural next act is the researcher's: confirm or amend the invariant restatement, drop the three
redundant marks, and decide whether this ruleset is committed.
