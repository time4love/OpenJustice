# The third marking walk — the news page, and why this level exists, 2026-09-01

**Bears on: Level 4**

A findings record, not a plan. Run against **staging**, `get_environment` → `CONFIRMED` on both axes.

The first walk measured the instrument and found ten defects
(`docs/gf-level4-first-marking-walk-2026-08-31.md`). The second answered the filtering question on a
government page (`docs/gf-level4-second-marking-walk-2026-08-31.md`). **This is the walk against the
subject both of those deferred: `https://news.walla.co.il/item/3403847`, the only page in this corpus
carrying real advertising and a real news template.**

Run `cmthqbikb003jbm4o3zbr8hlm`, **still `OPEN`**. No `ArticleRuleset` was committed, no capture
re-derived, no chain write. All 7 stored captures are untouched.

---

## THE HEADLINE: 12% against 74%

| | MOH vaccine page | Walla news item |
|---|---|---|
| derived text removed | **12–13%** | **74%** |
| rules needed | 9 | **21** |
| substantive claims kept | all | **all** |
| largest single removed block | footer, 394 chars | **`aside` — 3,306 chars** |

**Six times the noise, on the same instrument, with the article intact in both.**

The largest removed block is the *"עוד בחדשות"* sidebar: **3,306 characters — more than a third of the
entire document** — carrying headlines about a party launch and a Foreign Ministry veto, stories with
no relationship to this article at all. It rotates whenever the page is captured.

**That is this level's premise, measured rather than asserted.** The marking page's own instruction
says the point is *"so that ad rotation stops registering as a page change"*. Without filtering, a
scan of this page would produce a diff on **every single capture** — seven stored captures, seven
false changes, none of them about the article. On the government page the same argument was true but
small; here it is the dominant fact about the document.

## What survived

Kept text, 2,461 characters, is the article:

> **משרד הבריאות הודיע לקופות החולים: היעד למתן החיסונים - 20 בדצמבר**
> *משרד הבריאות הציג תאריכים למתן החיסונים, לקראת הגעת משלוח חיסונים ראשון של חברת פייזר מחר. מתן
> החיסונים לאוכלוסייה הכללית יחל ב-26 בדצמבר על ידי קופות החולים…*

Probed: `20 בדצמבר` ✓ `26 בדצמבר` ✓ `פייזר` ✓ `חזי לוי` ✓ `משרד הבריאות` ✓ `קופות החולים` ✓ `משלוח` ✓

## What was removed, all sixteen blocks that removed anything

| chars | block |
|---|---|
| 3,306 | `aside` — *"עוד בחדשות"*, unrelated stories |
| 1,599 | `header` — site navigation |
| 649 | a headline list of other articles |
| 273 | *"עוד בוואלה! NEWS"* related links |
| 170 | `#main-footer` |
| 102 ×2 | share buttons, twice |
| 88 | a promo teaser |

**No article content is in any of them.** An independent count of the removed blocks (6,548 chars
against 2,461 kept ≈ 73%) agrees with the page's reported 74%.

---

## THE OVER-MATCH HAPPENED HERE, AND THE INSTRUMENT CAUGHT IT

On the government page over-matching never occurred across two captures 4.2 years apart. **On this
page it occurred within minutes.** The researcher, scanning the removed pane, found the article's own
reporting inside it — the ministry announcement naming the rollout dates — swallowed by one of their
own marks.

This is the exact failure the pane exists for, and the plan's wording predicted its shape: *"a rule
that swallows a paragraph leaves something clean, short and plausible on screen."* The kept text
looked fine. Only the removed pane showed the damage.

**It also exposed that seeing a defect and being able to undo it are different capabilities.** The
pane was one undifferentiated block, so undoing meant guessing which of a dozen marks had taken the
paragraph and finding that row in a 658-node tree. Fixed the same day (PR #294): the pane now renders
one clickable block per rule, and clicking undoes that rule.

## A JUDGEMENT MADE TWICE, DELIBERATELY

Three removed blocks are links to other Covid articles, one of them a headline making a factual
claim: *"דוח ה-FDA לפני הדיון המכריע: החיסון של פייזר לקורונה בטוח ויעיל מאוד."*

The researcher classified them as furniture, on the criterion they established in the second walk: **a
block common to many pages of the site is not this page's article content.** This is the same ruling
as the MOH footer, applied to a different shape, and it is recorded here as a deliberate second
application rather than an incidental one. The page-scoped restatement of Level 4's invariant remains
**PROPOSED, NOT ADOPTED** — see the second walk's record.

---

## THE DURABILITY PROBLEM THIS PAGE EXPOSES, AND IT IS NEW

**Twelve of the twenty-one selectors depend on CSS-in-JS class names:**

```
header.no-mobile-app.css-gf5unx.main-header
section.css-12flape > aside:nth-of-type(1)
section.css-1234ruv.tags-list.no-mobile-app
section.css-kw6ugw.section-links.undefined
footer.css-1oin1li · nav.css-yfuuno.breadcrumb · div.css-2fbkb4 · section.css-1tkogwg …
```

`css-gf5unx`, `css-12flape`, `css-1tkogwg` are **build-generated hashes**. They change when the site
rebuilds, with or without any visual redesign.

The second walk concluded that structural marks generalise across a redesign — measured on a
government page whose selectors were `#header`, `#footer`, `#link-dictionary`. **That conclusion may
not transfer to a CSS-in-JS site**, where the "structure" a mark commits to is a build artifact rather
than an authored name. Nine of the twenty-one are also positional (`> aside:nth-of-type(1)`), the
failure mode the null check already caught once on the MOH page.

**This is not yet measured, and it is the obvious next test.** The seven captures span 2020-12-09 to
2025-03-26. Showing a late capture would answer it immediately: if the hashed classes changed, the
stale-selector check fires. `staleSelectors` is currently empty — but only **3 of 7** captures have
been judged, all from the early era.

**Do not read this walk as saying marks generalise on news sites.** It says they filter one capture of
one news page correctly, and that the durability question this corpus has never had to ask is now
open.

One curiosity worth recording: `section.css-kw6ugw.section-links.undefined` contains a literal
`undefined` class, which is the site's own template emitting a JavaScript value into `className`. A
mark committed to it is committed to somebody else's bug.

---

## Run state

```
run        cmthqbikb003jbm4o3zbr8hlm   OPEN, version 26, ruleset 5f9cddbd
selectors  21 — 16 removed text on the marked capture, 5 removed nothing
           12 depend on hashed CSS-in-JS class names, 9 are positional
captures   7 stored, 3 judged, nothing committed
counters   corrections 22 · capturesNeedingCorrection 3 · correctionRate 1.0 · streak 0
stale      none — but only the early era has been judged
```

**`correctionRate: 1.0` counts CONSTRUCTION, not correction.** All three judged captures needed the
rules changed because the ruleset was being built from empty, twenty-one selectors at a time. This is
the third walk in a row where that number says more about F7 seeding than about the rules — see the
first walk's F7.

**Five selectors remove nothing** (`script`, `noscript`, `iframe` marks) and are now **unreachable
from the tree**, because zero-text nodes were hidden the same day (PR #293) after this researcher
reported the tree was unusable. They are harmless — a rule matching a text-free node removes nothing
in every capture — but nothing in the UI can remove them either. Recorded as I7.

## Instrument defects found and fixed DURING this walk

All landed and live: **#293** zero-text nodes hidden (36 empty `<script>` tags sat above the article,
and the researcher reported having nothing to click) · **#294** removed text attributed per rule and
clickable to undo, plus landmark labels that identify *which* element (twelve `<section>`s all read
"section") · **#295** marked elements outlined on the rendered capture, and the counters stopped
reporting two judgements of one capture as coverage of two.

**Refused, with the reason recorded:** click-to-select inside the capture frame. It requires
`allow-scripts`, which would make `inertDocument` the only defence instead of the second, on captures
of real commercial pages carrying real ad and analytics payloads. The tree → page direction was built
instead, as CSS only.

## What is still NOT measured

- **Whether these marks survive the page's own history.** 3 of 7 captures judged, all early era.
- **Whether CSS-in-JS selectors are durable at all.** The open question this walk created.
- **Anything committed.** The ruleset has never been applied, so no capture has been re-derived under
  it and the deviation check still has no inputs.
