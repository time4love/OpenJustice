# The MCP loop, walked end to end — and a signal that resets, 2026-09-01

**Bears on: Level 4**

A findings record, not a plan. Run against **staging**, run `cmthqbikb003jbm4o3zbr8hlm`
(`news.walla.co.il/item/3403847`). **Nothing was committed**: the run is still `OPEN` and no capture
has been re-derived.

Two things happened. The redesigned flow ran end to end for the first time, and doing so exposed a
defect that made correct guidance wrong within a single action.

---

## THE LOOP, VERIFIED

The plan's Level 4 records the researcher's ruling of the same day: *the UI is a visual instrument for
checking and correcting a ruleset against one capture; it writes no decision and applies no effect.*
Every piece of that shipped on 2026-09-01 (PRs #298–#304). This is the first complete pass through it.

| step | tool | what happened |
|---|---|---|
| pick | `next_article_capture` | recommended `2025-03-26` — the far end, 1,568 days from anything judged |
| open | `open_article_capture` | deep link to one capture; recorded the showing |
| judge | `judge_article_capture` | `REJECTED` — and correctly refused to advance |
| pick again | `next_article_capture` | **bisected to `2022-05-23`**, between the working era and the broken one |
| mark | the page | two selectors unmarked; draft autosaved, then handed back |
| review | `open_article_capture` | draft reported: `21 → 19`, `removed: [the two never-matched selectors]`, `handedBack: true` |
| judge | `judge_article_capture` | `ACCEPTED`; promoted the draft to a `RULESET_CORRECTED`, **then** recorded the verdict |

**Every claim the unit tests make about the policy held on real data.** The maximin pick found the
boundary on its first try — the same capture a human had found by hand four clicks earlier — and the
bisection landed between the two judged ends without being told what either meant.

**The browser wrote nothing but its draft.** `CAPTURE_SHOWN` is recorded by `open_article_capture`,
the verdict by `judge_article_capture`, the correction by the promotion. The page's only write is the
draft, which decides nothing.

### What the walk measured on the way

| capture | selectors matching | removal | verdict |
|---|---|---|---|
| `2020-12-09` | 19 of 21 | 74% | ACCEPTED |
| `2020-12-18` | 16 of 21 | 68% | **ACCEPTED** (this walk) |
| `2022-05-23` | 5 of 21 | 10% | — |
| `2025-03-26` | 3 of 21 | 1% | REJECTED |

`2022-05-23` at **5 of 21** places the CSS-in-JS collapse **between December 2020 and May 2022** — under
seventeen months, not the 4.3 years the third walk's addendum could bound it to. The ruleset's useful
life on this page is measured in months.

`2020-12-18`'s removed text was checked and was furniture throughout: site header, nav, the פיקוד העורף
widget, the footer, a telemetry string (`walla_ssr_page_has_been_loaded_successfully`), the
"עוד בחדשות" strip and an empty comments box. No article prose.

**The page-scoped furniture rule was applied a third time, consistently.** The related-stories strip
carried *"שבוע אחרי פייזר: פאנל היועצים של ה-FDA אישר את החיסון של מודרנה"* — an FDA claim in a
headline. Classified as furniture on the researcher's own criterion: a block common to many pages of
the site is not this page's article content. Same ruling as the MOH footer and the earlier Walla
strip.

---

# I12 — `lastMatchedAt: null` RESETS ON EVERY CORRECTION

**This is the finding, and it is the dangerous kind: it made correct advice wrong within one action.**

## What happened

Before the correction, `staleSelectors` reported sixteen entries. Exactly two carried
`lastMatchedAt: null`; the rest carried timestamps. The reading given to the researcher was:

> `null` means the selector has never matched **any** capture in this run, so removing it is safe in
> every era. A timestamp means it matched somewhere and stopped, so removing it would break the
> capture where it works.

On that basis the researcher unmarked the two `null` selectors — residue from before zero-text nodes
were hidden — and **declined** to unmark two others that read *"לא התאים דבר"* on screen but carried
timestamps. That judgement was correct and it avoided a wrong edit.

**Then the correction landed, and the list changed to three entries, all `null`** — including the two
they had just been told to keep:

```
footer.css-1oin1li                     lastMatchedAt: null
section.css-kw6ugw.section-links…      lastMatchedAt: null
section.css-1t6uvhp.noprint            lastMatchedAt: null
```

Applying the same rule ten minutes later would have deleted three selectors that remove real furniture
on `2020-12-09`.

## Why

`RulesetObservation` is keyed to `articleRulesetId`, and `ensureCurrentRuleset` derives that from
`chromeRulesetId(selectors)` — a hash of the selector set. **Changing the ruleset produces a different
`ArticleRuleset` row, which orphans every observation taken under the previous one.**
`describeCalibrationRun` reads only observations for the current ruleset, so after a correction there
is exactly one observation and anything that did not match *that* capture reports `null`.

So `lastMatchedAt: null` does not mean *"never matched anything"*. It means **"never matched under the
current selector set"**, and the current selector set changes every time the researcher corrects
anything.

## Why it matters more than it looks

- **The signal is unstable in the direction that causes damage.** It resets to the value that reads as
  "safe to delete", on exactly the selectors most likely to be era-specific.
- **It is invisible.** Nothing in the payload or the page says the history was orphaned. The list
  simply looks different, and looks authoritative.
- **It compounds I11.** The marking page cannot distinguish *"never matched anywhere"* from *"does not
  match this capture"* — and now the underlying datum cannot reliably distinguish them either.
- **The keying is defensible on its own terms.** An observation IS about a specific ruleset; a match
  count from a different selector set would be a different measurement. The defect is not the key, it
  is that a field whose name and null-value invite a cross-capture reading is scoped to one
  generation of the ruleset and says so nowhere.

## What it is NOT

Not the same as **I9** (`findStaleSelectors` reads `counts[selector] ?? 0`, so a selector the parser
*rejected* reports as never-matched, conflating a typo with a redesign). I9 is about one lookup; I12
is about the lifetime of the whole observation set.

## Not fixed here, and the options are not equal

Recorded rather than repaired, because the right answer is a design decision rather than a patch:

- **Report the scope with the number.** Cheapest and honest: say how many observations the verdict
  rests on and under which ruleset, so `null` from one observation cannot read like `null` from
  twenty. Does not make the signal cross-capture, but stops it lying.
- **Observe across ruleset generations.** Ask "has this selector ever matched this capture, under any
  ruleset?" — genuinely cross-capture, and the reading the researcher wanted. Costs a wider query and
  needs care about what a match under a different selector set means.
- **Re-observe on correction.** Recompute the sample's observations when a ruleset changes. Truthful
  and expensive: a parse per capture per correction, on a page whose researcher corrects twenty times.

**Do not close I11 without deciding this.** A page that renders `lastMatchedAt` faithfully would
render a value that resets — which is a clearer lie than the one it replaces.

---

## State left behind

```
run        cmthqbikb003jbm4o3zbr8hlm   OPEN, ruleset 19 selectors
judged     3 of 7 distinct — 2020-12-09 ✓, 2020-12-18 ✓, 2025-03-26 ✕
streak     1 clean; the stopping rule asks for three
committed  nothing. No capture has been re-derived under any ruleset.
```

## What is still NOT measured

- **Whether the loop holds for a researcher without developer tools.** During this walk the removed
  text was read out of the page's DOM by the assistant. **That capability does not exist on
  claude.ai with only the MCP connector**, and the researcher was right to reject it as a pattern:
  `open_article_capture` returns match counts and a removal fraction but **not the removed text**, so
  in the real environment only the human can answer *"was it furniture?"*. That is correct by design —
  but it means the flow has not yet been walked under the constraints it will actually run under.
- **The boundary's exact location.** It lies between 2020-12-18 and 2022-05-23; three captures in that
  range are unjudged.
- **Anything at scale.** One page, one researcher, seven captures, nothing committed.
