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

---

# I14 — THE CAPTURED PAGE REFRESHED ITSELF INTO THE PRESENT

**Addendum, 2026-09-01. Found by the researcher, mid-marking, on `2020-12-18`.**

## What happened

Marking was going well — the ruleset had been corrected to 72% removal on `2020-12-18` — when the
researcher reported that the **העמוד כפי שנלכד** tab was *"showing the wrong page"*, and then, more
precisely, *"the original page but it looks like only furniture."*

It was. The frame held Walla as it stands **today**: a topic bar reading `בחירות 2026`, a breaking-news
ticker about floods in Nepal, `איזנקוט`, `מבקר המדינה`. None of those strings exist in the stored
document.

## Why

The captured page carries the site's own auto-refresh, faithfully preserved from 2020:

```html
<meta http-equiv="refresh" content="300">
```

**`sandbox` does not stop it.** The attribute was `sandbox=""` — maximally restrictive, no
`allow-scripts` — and the document contained zero `<script>` tags, because `inertDocument` had already
removed them. A meta refresh needs none. There is no sandbox flag for it.

Five minutes into a marking session the frame reloaded, and from then on the researcher was looking at
the live site while marking rules against a 2020 capture.

## Why it is worse than it looks

**THE NUMBERS STAYED RIGHT.** The removal fraction, the kept text and the removed-blocks pane are all
computed on the server against the **stored** document; the iframe feeds none of them. So the
instrument disagreed with itself and gave no sign of it — and the half that stayed correct was the half
that carries authority. A researcher checking their work against the percentages would find everything
in order.

**It takes five minutes to appear.** Three marking walks and a full loop verification never saw it,
because no single capture had been held on screen that long. The defect is invisible to exactly the
kind of session that tests for defects.

## What it did NOT corrupt, and why that is checkable rather than hopeful

- **Selection never came from the frame.** The tree is built by `documentOutline` from the stored
  document, and click-to-select inside the page was deliberately never wired — it would have required
  `allow-scripts`, which the design refused. Every selector in the ruleset came from the real capture.
- **Every derived text is server-side.** Kept text, removed segments and the fraction are applied to
  stored HTML.
- **The researcher verified against the removed text**, not the picture — *"it is correct by looking at
  the text that was removed"* — which is the one surface the defect could not reach.

**The `2020-12-18` ruleset at 72% therefore stands.** Only the picture was lying.

## The class of defect

`inertDocument` is documented as the layer that makes a document unable to act. Its implementation was
a list: `script, iframe, object, embed`, and `on*` attributes. Its test fixture was the same list, under
a heading reading *"the second layer, tested because an untested layer is not one"*.

**A rule stated as a property and implemented as an enumeration is tested against the cases already
thought of.** The fixture could not have caught this, because the fixture was written from the same
understanding as the code.

## Fixed

Render-side only — the stored capture keeps its meta refresh, which is a true fact about the page:

- `<meta http-equiv="refresh">` removed, matched on the attribute's **value** rather than by selector,
  since `[http-equiv="refresh"]` is case-sensitive and the corpus holds mixed casing.
- `<base>` removed, which would otherwise resolve every relative URL against the live site.
- `frame` added to the removed elements alongside `iframe`.

The fixture now carries both, plus a guard that ordinary `<meta>` tags survive. Confirmed falsifiable:
**2 failures without the fix, 37 passing with it.**

## Open, and the researcher's to rule

**Remote `<link rel="stylesheet">` and `<img>` still load from the live site.** A 2020 capture is
therefore dressed in 2026 stylesheets and images, and opening a capture reaches out to `walla.co.il`
from the researcher's browser.

Stripping them makes the frame authentic and visually degraded; keeping them makes it presentable and
partly false. Since the question the frame exists to answer is *"is this block furniture ON THIS PAGE
AT THIS DATE"*, the trade-off is not obviously resolved either way — and it is a decision about the
instrument, not a defect in it.

---

# I15 — THE SURVIVAL CHECK, AND THREE DEFECTS IT FOUND IN ITSELF

**Addendum, 2026-09-01.** Written after the check that answered the union-versus-era question was
built, run, and corrected twice against its own output.

## What it was for

The researcher's question: *"if a ruleset that is the union of every era can be used successfully to
extract the article text on every snapshot maybe we should not split rulesets per era… the only
question is of a rule that is good for snapshot x is bad for snapshot y."*

`check_ruleset_survival` re-derives stored captures under the ruleset in force and reports what any of
them stopped keeping. Three rulings from the researcher shaped it, and each corrected a weaker design:

- **Any loss is an alert.** It first reported the difference and left the judgement open, on the
  grounds that a change is as likely to be furniture the earlier pass missed as article text
  destroyed. **Acceptance is a commitment**: the record says that capture's text was checked and
  agreed, so if the text changes the agreement no longer describes anything.
- **Every stored capture, not only the accepted ones.** `commit_article_rules` re-derives every stored
  capture, so damage to an unjudged one enters the corpus just as silently — it simply breaks no
  approval on the way in.
- **The selector's date scopes the recheck.** *"we need to recheck all previous snapshots in the
  timeline."*

## THE THREE DEFECTS, IN THE ORDER THEY WERE FOUND

**1. A correction recorded no capture.** `RULESET_CORRECTED` was FORBIDDEN a subject, with the reason
written down: *"a decision that names a capture it is not about makes the log answer a question it was
never asked."* The premise is false. A correction's selectors were checked against exactly one capture,
and that capture's date is what scopes every later question about them. **The only event that adds
selectors was the only event recording nothing about what it was looking at** — and the era design
selects on precisely that date, so it was blocked on data that was never written. Fixed in #312; the
guard `CAPTURE_BEARING` collapsed with it, because every appendable type is now capture-bearing.

**2. A comparison that did not happen was counted as a pass.** With no untested selector the baseline
IS the current ruleset, so the check compared each capture with itself, found it identical, and
reported `intact: 7` having tested three. It would do that for any input, forever. `tested` and
`notTested` are now reported and `intact` counts only captures that had something to try. Fixed in #312.

**3. The anchor recovery was wrong in both directions.** Legacy corrections have no anchor, so one was
inferred — twice, wrongly.

  - **Forward** (*"the next decision that names a capture"*) was justified by `judge_article_capture`
    promoting and then recording a verdict. True of that writer, false of the browser, which autosaved
    many corrections between one verdict and the next. It stamped December 2020 selectors with a
    March 2025 date and produced **three alerts naming the wrong rules**. The run's own output
    contained the refutation: a selector dated 2025-03-26 was already in the 22-selector ruleset a
    2020-12-18 capture had been accepted under.
  - **Backward** (*"the last capture SHOWN"*) is correct in principle and still fails on this run,
    because **opening a marking URL directly records no `CAPTURE_SHOWN`** — `open_article_capture` is
    what records the showing, and `2022-05-23` was opened from a link instead. Every anchor then falls
    back to an unrelated earlier showing, and the 2022-era selectors are misdated as predating
    `2021-06-12`, so they are never tried against it.

**Recovery is abandoned.** `CLAUDE.md`: *the test is whether the problem recurs for state created from
now on.* It does not — corrections carry their own anchor as of #312. Three landed corrections spent on
attributing rows already written is the archaeology that rule exists to stop.

## WHAT WAS MEASURED, AND IT IS ANCHOR-INDEPENDENT

One half of the suspect rule needs no anchor: the selectors added since a capture was approved, read
from the ruleset recorded at its acceptance.

| capture | selectors added since approval | kept before | kept now |
|---|---|---|---|
| `2020-12-09` | 16 | 2461 | 2461 |
| `2020-12-18` | 13 | 2461 | 2461 |

**Nothing was lost on either.** All six positional selectors are among those added. On this page the
union caused no harm to any approved capture — which is why the era decision was taken on the design
argument rather than on damage.

For the unjudged captures nothing can be said, and that limit is permanent.

## A GAP FOUND ON THE WAY

**Opening a marking URL directly records no showing.** The flow assumes `open_article_capture`, which
appends `CAPTURE_SHOWN`; a link pasted into a browser bypasses it. `capturesShown` therefore
undercounts, and any inference keyed on "what was on screen" has a hole in it. Not fixed here.

---

# I16 — THE RULESET HAS NEVER BEEN APPLIED TO ANYTHING

**Addendum, 2026-09-01.** Found while starting build-order step 2, by reading the code the step was
going to stamp.

## The finding

A chrome ruleset can be marked, corrected, approved, committed, versioned and attributed. **It is
inert.** No stored capture is re-derived under it, and no new capture is derived under it.

```
deriveTextUnderRuleset / applyChromeRuleset — three callers, all of them the
  instrument or a check:
    chromeRulesetApply.ts   the implementation
    captureMarking.ts       the marking page's preview
    rulesetSurvival.ts      the survival check, itself slated for retirement

recordCapture.ts:321   deriveText(document, contentType, encoding)   ← no ruleset
TrackedUrl.activeArticleRulesetId   written by the commit, read by nothing
scripts/               no caller
```

## What it was telling the researcher

`commit_article_rules` returned **`capturesRederived: <storedCaptures>`** — 83 on the corona URL — and
described itself as re-deriving every stored capture. The pre-approval sentence, rendered from
`calibrationEffect`, read *"Approving will save the ruleset as a new version, and re-derive the text of
7 stored captures."*

**That is a false statement at the exact moment a researcher approves a research act**, and it is
specific and numeric, which is what makes it credible.

## THE DEFECT IS IN THE DECLARATION, NOT THE RENDERER — and the renderer's design is right

`approvalEffect.ts` exists because *"a caller that provided both 'what to say' and 'what to do' could
let them drift"*. It works: the sentence is rendered from structured data and no caller authors words.

**But a renderer that cannot lie about the DECLARATION is not a renderer that cannot lie about
REALITY.** The declaration listed a `REDERIVED_CAPTURES` write with a counted row number, and nothing
performed it. The mechanism guaranteed the sentence matched the declaration; nothing guaranteed the
declaration matched the code.

That is the same shape as `check_on_chain_status` returning a correct verdict beside a sentence
asserting a second thing the verdict never asked — which is the failure this module's own header cites
as its reason for existing.

## Why nobody caught it

**No run has ever been committed.** Three marking walks and a full loop verification, each ending
before the act that would have exposed it. A success arm that has never fired is unproven — and this
one was the level's terminal act.

## Fixed here, narrowly

The claim is withdrawn rather than the behaviour added, because adding it is build-order step 2:

- `REDERIVED_CAPTURES` is **removed from the closed set of write kinds**. A member nothing performs is
  a claim the system can make and never honour. It returns in step 2, in the same change as the write —
  which is the discipline the set was created for.
- `capturesRederived` is `0`, and `storedCaptures` reports what it always was: a fact about the URL,
  not a claim about the call.
- The tool's description, the route allowlist comment and the reversibility sentence say what happens.
- A test asserts the sentence **does not** contain "re-derive the text", so the claim cannot return
  without the code.

## What this means for Level 4

The level's chain — mark, correct, approve, commit — currently terminates in a write that changes
nothing observable. **`filtering is a versioned view` is specified, stored, and unimplemented.** Build
order step 2 is where it becomes real, and its scope is larger than the era-version stamp it was
written as: deriving a capture's text under the era covering its date, at record time and at commit
time, with the stamp written in the same act.
