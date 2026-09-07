# The ONE re-walk of walla on staging — the exercise, 2026-09-07

**A dated record, never edited.** It records the re-walk the step 5 exercise
(`docs/gf-walk-step-5-exercise-2026-09-06.md`) left owed, and it is the proving ground the refactor
plan `docs/gf-refactor-plan.md` §3 step 7 names — Flow 3 of `docs/gf-interaction-flows.md`, run
against a real corpus by the researcher, one call at a time. Nothing here is recomputed: every number
and every verdict is a return read on the day. The orchestrator state carrying each raw return is
`handoffs/R30-orchestrator-state.md` (not in git).

**The subject** is `https://news.walla.co.il/item/3403847`, page `1ed3b18f-c3e8-4624-982e-65edb4c1e6ea`
— the four captures the first walk acquired and anchored at registry indexes 0–3 under
`DOCUMENT_SHA256` on Base Sepolia `0xDA3B858CA9CC3F1C5cE60Bb4D343bC6E58aa4C73`.

## What had to land first — the ruling of 2026-09-07

**No walk before every known extraction change landed.** A re-walk under a moving extractor supersedes
text twice and pays the classifier twice for the same question, so the corrections were queued behind
the code:

| PR | landed | what |
|---|---|---|
| #377 → `550b7d9` | the derived text drops `<head>` by construction; `TEXT_EXTRACTION_VERSION` → `v3-inflate-decode-nohead-htmltotext-normalised` — the `<title>` finding of the first exercise, answered in the extractor rather than in a rule |
| #378 → `79ca4b1` | PR 2: A4's exclusive sets in `gates.ts`; the hashless→hashed selector tier with A8's family list and the page's `⚠ מזהה בנייה` tag; the differ's chunk rule made A4's segment rule, `DIFF_INPUT_VERSION` → `v4-sentence-claims-lettered`; the `onChainVerdict` sentences |
| #379 → `20213ab` | step 7: a supersession re-derives every spanning diff inside the capture's transaction, the old kept, the paid draws taken before it opens; a capture acquired with an ACQUIRED successor re-diffs the successor against it |
| #380 → `b2b1ba9` | survival compares the EXTRACTOR alone; `SURVIVAL_CHECK_VERSION` → `v3-extractor-compared` |

From `550b7d9` every stored text was STALE on the extractor axis. The re-walk began at `b2b1ba9`.

## The re-walk, step by step

| step | call or check | result |
|---|---|---|
| 1–2 | `get_article_rules`, `list_captures` | as expected: 5 stale rows |
| 3 | `scan_captures(max 1)` | `superseded: 1` on `20201209134003`, **no stop** — Gate 4 quiet, because that capture's nav removals are SEEN through the later accepted captures |
| 4 | state read | snapshot text v3 (the headline first, no page title); the v2 text kept as a `TextVersion`; the anchor unchanged; the 2020→2021 diff gained a content version, no lone bullets, one classifier call. Still UNCHECKABLE — the 2021 side was v2 until its own supersession, which is correct |
| 5 | `scan_captures(max 1)` | `20201218044603` re-fetched → **DUPLICATE** again under v3 and the 23 rules; no store, no anchor, no spend |
| 6 | `scan_captures(max 1)` | `20210612183110` superseded, no stop; its two diffs re-derived |
| 7 | state read | the 2021 kept version's `supersededByDecisionId` NULL — the Q4 fix holding; 2020→2021's newest version with both sides current and **two chunks**, the FDA sentence pair, the first survival verdicts of the new corpus; the classifier now `editorial: true` — with the furniture gone, the rule-cut link reads as an edit. 2021→2022 UNCHECKABLE (2022 still v2); 2022→2024 untouched |
| 8–9 | `scan_captures` | `20220523123302` and `20240520195927` superseded, no stops; next `20250208221410`, the throttled capture |
| 10 | state read | 4 snapshots all v3, anchors unchanged, `totalEvidence()` 4, corpus 4 acquired / 0 unanchored / 3 diffs; one kept v2 version per capture; every diff holding 3 content versions, the newest with both sides current |

**The supersession half of Flow 3 did what the design says**: no snapshot deleted, no anchor touched,
no text overwritten — a new version per capture with the previous kept, and every spanning diff
re-derived inside the same transaction.

## The defect the re-walk found live — Q4

At step 4 the kept version carried `supersededByDecisionId = cmtpynwve0003dzzz1sgoyv3t`, the 2020
correction, on a supersession the rules had no part in: the extractor moved, not the ruleset.
`supersedingDecision` returned the ruleset's last change without first asking whether the ruleset had
changed at all. Flows A2 rules that field NULL for a supersession the rules had no part in.

**Fixed before the walk continued** — PR #381 (`8180f3a` → `dc8f44f`): the walk compares the previous
stamp with the current ruleset id before naming a decision; the case was written red first.

**RECORDED, NOT CORRECTED, on the researcher's ruling:** the one row written before the fix carries a
false attribution — the `TextVersion` of snapshot `cmtpypkjd000qdzzzyg0veqej`, `textHash 18322098…`,
`supersededByDecisionId cmtpynwve0003dzzz1sgoyv3t`, where NULL is the truth. The rows superseded after
the fix (2021, 2022, 2024) carry NULL, verified at step 10. Walla's perfection is not the priority;
progress on the refactor is.

## What the corpus turned out to hold — proven from the bytes

After step 10 the whole content of the corpus was ONE sentence flipping across four captures: 2020
holds `מסמכים שפורסמו היום על ידי ה-FDA`, 2021 does not, 2022 holds it, 2024 does not. The researcher
asked the right question — *isn't this a real editorial change?* — and the answer was read from the
documents as served, not from the derived text:

> The phrase is present in **all four** documents, as an inline `<a>` inside the article's own
> paragraph: `בתוך כך, <a …>מסמכים שפורסמו היום על ידי ה-FDA</a> אישרו כי…`. It is absent only from
> the DERIVED text of 2021 and 2024 — the two captures where a positional
> `… > p > a:nth-of-type(1)` rule matched the link.

So it is not editorial and never was. The inline link is the sentence's own words; the rule mutilates
the sentence, and the classifier — reading the derived texts — called the mutilation an edit. **Two
rules did it**, `cmtpynx3o000m` created against the 2020 capture and `cmtpzr6p50067` against the 2022
one.

**The instrument that reads bytes is the platform's, and only the platform's.** A model in a chat
never sees the served document; the finding above exists because the platform holds it.

## Two findings from the researcher's own screen

**F1 — a display regression from PR 2.** The marking page highlighted a node only when its OFFERED
selector string equalled a selected rule string. PR 2's hashless tier then offered
`header.no-mobile-app.main-header` while the live 2020 rule read
`header.no-mobile-app.css-gf5unx.main-header` — so rules that still MATCH the element were not shown as
marking it, and a click would have added a duplicate rule.

**F2 — survival was checked against the wrong input.** Evidence flows §3 asks for each chunk's verdict
*against the raw documents*; as built the checker compared chunks with the other capture's EXTRACTED
text — the rules' own output. A rule-induced removal therefore read SURVIVES: the FDA phrase is gone
from the 2021 TEXT and present in the 2021 DOCUMENT. Against the document's own un-ruled text it is
CONTRADICTED, the state that refuses promotion. **The design's own answer to imperfect marking had
been built against the wrong input** — which is why step 10's "every chunk survives" is a verdict of
the pre-F2 checker and not a fact about the corpus.

**Both fixed** — PR #382 (`133a193` → `aa61482`):

- F1: `documentOutline(html, { rules })` gives every node `matchedBy: { ruleId, selector }[]` by
  `element.matches` against the real DOM, invalid selectors skipped; the GET route passes the rules in
  force; the page highlights by a selected rule that MATCHES the node and unmarks THAT rule on a click.
- F2: `recordDiff` hands the checker each side's own document text (no rules) for both sides, and
  `checkDiffSurvival` holds every chunk to BOTH halves of its claim — `ContradictedChunk.kind` is
  `PRESENT_IN_OTHER` or `ABSENT_FROM_OWN`. `SURVIVAL_CHECK_VERSION` → `v4-against-documents`.

## The corrective pass — and where it stopped

**Ending the two positional rules is the researcher's act, and it was theirs.** The first attempt was
refused: the 2020 draft was correct (18 of 19 selectors, the positional rule dropped) but the approval
answered `DRAFT_NOT_RETURNED` — the researcher had opened the 2022 page in between, and the
one-draft-per-page moved with it. **The unapproved draft was discarded silently, and it cost an
approval.** That is PR 3's, recorded here as its input.

Redone, in order:

| act | decision |
|---|---|
| 2022 capture approved | `RULE_ENDED cmtpzr6p50067` at `20220523123302`, nothing else; `decisionSequence` 12 |
| 2020 capture approved | `RULE_ENDED cmtpynx3o000m` at `20201209134003` — `validTo` equal to its own `validFrom`, so it governs no capture; `decisionSequence` 14 |

Both positional link rules are ENDED, and every stored row went stale by ruleset. The pass that
followed, `scan_captures(max 4)`, **walked two and stopped**:

- `20201209134003` **RESTAMPED** — its text already held the sentence whole, because the rule never
  matched that capture's markup. No version written; the ruleset id moved.
- `20201218044603` **STOP** — a stale DUPLICATE, re-fetched, not RESOLVED because the ruleset at its
  date had changed. Two gates fired together:
  - **Gate 2**, the same four `css-` rules created on 12-09 and silent ever since the first walk —
    inherent, and a CONTINUE;
  - **Gate 4**, the aside's and the ticker's items again.

Marking URL: `…/article-rules/1ed3b18f-c3e8-4624-982e-65edb4c1e6ea/20201218044603`. **The pass is
awaiting the researcher's CONTINUE there**; 2021, 2022 and 2024 remain stale by ruleset behind it.

**FOUND, and it is a design question for the researcher:** A3's `SEEN` counts the removed side of
ACQUIRED captures only, so a DUPLICATE a human has already judged contributes nothing — and every
re-walk over it re-asks the same removals. 12-18 has now stopped on Gate 4 twice for the same items.
TRUST is the cure the design already names; whether a judged DUPLICATE should enter SEEN is not
settled here.

## What remains of the walk

- The 12-18 stop resolved, then one pass over 2021, 2022 and 2024, then the check the corrections were
  made for: every diff re-derives to ZERO chunks, because the article never changed.
- `20250208221410` still answers HTTP 429 per capture (probed 2026-09-07, the third archive answer of
  the first exercise). Retry, or the researcher's explicit word:
  `resolve_scan_stop … BAD_CAPTURE reason=…`. Two 2025 rows wait behind it.
- PR 3 — the judging moment on the marking page — with three inputs this exercise produced: the stop
  panel as a dump, the silent discard of an unapproved draft on switching captures, and TRUST
  unexplained anywhere on the surface.

**Plan `docs/gf-refactor-plan.md` §3 step 7 points here from its verified line.**
