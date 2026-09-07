# Refactor step 5 on staging — the walk, WRITING: the exercise, 2026-09-06

**A dated record, never edited.** Refactor plan `docs/gf-refactor-plan.md` §3 step 5, PR 1 (PR #375 →
`ce775b4` on `staging`, deploy SUCCESS, both migrations applied by the pre-deploy step and read from
the deploy log). Its verification per plan §6.3: a researcher driving the new path against staging
through the MCP tools, one step at a time, each call shown before it ran. This is that transcript,
reduced to what happened and what it found. The orchestrator state that carries every raw return is
`handoffs/R30-orchestrator-state.md` (not in git).

**Environment, identified by configuration and chain, not content:** `get_environment` → staging,
verdict CONFIRMED, chain 84532, registry `0xDA3B858CA9CC3F1C5cE60Bb4D343bC6E58aa4C73`, deployed. Before
the walk: 3 tracked pages, 0 snapshots, 0 diffs, the registry at `totalEvidence() = 0`. The freeze on
chain writes, in force since the rotation (`docs/gf-rebuild-staging-new-registry-2026-09-06.md`),
lifted with this exercise's first anchor.

## The walk, capture by capture — `https://news.walla.co.il/item/3403847`, 8 captures, 8 distinct digests

| step | call | result |
|---|---|---|
| 3 | `scan_captures(max 1)` | Gate 0 stop on `20201209134003`; bytes held; nothing stored |
| 4 | marking page → `approve_article_rules` | 19 rules from 2020-12-09; sequence 2 |
| 5 | `scan_captures(max 1)` | ACQUIRED — **registry index 0**, `DOCUMENT_SHA256` |
| 7 | `scan_captures(max 3)` | stop on `20201218044603`: Gates 1, 2, 4 together |
| 8 | approve | 4 rules from 2020-12-18 (the four silent elements under their new build hashes); 23 in force |
| 9 | `scan_captures(max 1)` | **DUPLICATE** — under the 23 rules the 12-18 text equals the 12-09 text; no store, no anchor, no spend |
| 11 | `scan_captures(max 6)` | stop on `20210612183110` (a redesign): Gates 1, 2, 4; ten rules silent |
| 12 | approve | 8 rules from 2021-06-12; 31 in force |
| 13 | `scan_captures(max 1)` | ACQUIRED — index 1; **the first diff**, one classifier call |
| 15 | `scan_captures(max 5)` | stop on `20220523123302` (a redesign): sixteen rules silent |
| 16 | approve | 14 rules from 2022-05-23; 45 in force |
| 17 | `scan_captures(max 1)` | ACQUIRED — index 2; the second diff |
| 18 | `scan_captures(max 3)` | stop on `20240520195927` (a redesign): twelve rules silent, `#main-footer` among them |
| 19 | approve | 13 rules from 2024-05-20; 58 in force |
| 20 | `scan_captures(max 3)` | connector dropped mid-call; **checked by data**: `20240520195927` ACQUIRED — index 3; the third diff; the 2025 rows untouched |
| 21, 23 | `scan_captures(max 3)`, ten minutes apart | `ARCHIVE_UNAVAILABLE` at `20250208221410`, walked 0, nothing written |

**Verified from state, never from a return value** (`cast` against the registry; a read-only query of
the staging database; `get_environment`): registry entries 0–3 hold the four snapshots' `documentHash`
under `DOCUMENT_SHA256`, submitted by the registrar; every snapshot's `anchoredHash` equals its
`documentHash` and carries its transaction; four `IntegrityCheck` verdicts VERIFIED at indexes 0–3,
each written by the deployment at `ce775b4` seconds after its anchor; three `UrlVersionDiff` pairs
forming one consecutive chain (2020 → 2021 → 2022 → 2024), one `DiffContentVersion` each, its two text
hashes equal to the snapshots', `diffVersion` the composed constant, the classification stored whole
with its provenance, and each version derived AFTER its anchor — the ruled order. Corpus at close:
4 snapshots, 0 unanchored, 3 diffs, 1 duplicate, 3 rows UNFETCHED.

**What held under stress.** A dropped connector mid-call left nothing half-written: acquisition is
atomic per capture, and the next call derived NEXT_ROW from the rows. A refusal from the archive left
the row UNFETCHED and everything before it kept.

## What the walk measured

**Selector mortality, live.** Four redesigns in four years. At every one, every rule carrying a `css-`
build-hash class died (4 of 4 silent on 12-18; 10 on 2021-06; 16 on 2022-05; 12 on 2024-05), and so
did every positional rule. What survived: the id rules `#main-footer` (until 2024) and `#xlandingzone`,
and every HASHLESS class rule — `section.tags-and-breadcrumbs`, `div.left-side`. The order MARKING
states — id, then hashless class, then position — is the order observed. PR 2's hashed-class tier
(A8's family list) would have carried `main-header`, `breadcrumb`, `tags-list`, `section-links` and
`local-he` across all of it. Gate 2 fired at every redesign, as measurement part 2 predicted.

**Stops become rare only through trust, and none was given.** Every stop carried Gate 4; the
researcher trusted no rule, so the ticker and the related aside were shown at every capture. That
is the design working, not failing; the trust tick is the page's, and its moment is PR 3's.

## Findings

1. **The article never changed; every diff is rule-induced.** The three content versions hold the
   page `<title>` and bullet remnants shifting shape, plus one sentence flipping between "בתוך כך,
   מסמכים שפורסמו היום על ידי ה-FDA אישרו כי…" and "בתוך כך, אישרו כי…": an inline link the
   positional article-content rule cut when it matched (2021, 2024) and kept when it was silent
   (2022). Four captures with identical body text produced three diffs of pollution and three
   classifier calls. The classifier answered `editorial: false` every time, naming the furniture —
   Gate 5 works — and never stopped, because every acquisition was RESOLVED and A4 rules that the
   verdict is recorded and stops nothing. The design's remedies exist and are not yet exercised:
   end the positional rule (Gate 4 flagged it at two stops), mark the title and bullet remnants on
   the 2020 capture, and re-walk; the diff re-derivation on supersession is step 7's. **Ruling
   owed:** whether the extractor should drop the document `<title>` by construction.
2. **Survival is UNCHECKABLE across every rule change.** All 24 chunks over the three versions are
   UNCHECKABLE: the survival checker treats two texts extracted under different versions as
   incomparable, and `textExtractionVersion` carries the ruleset id as a suffix
   (`…+chrome-58404310` vs `…+chrome-567ddbb3`). Under this design a rule change is every redesign.
   Evidence A3 lets UNCHECKABLE publish. **Ruling owed before evidence step 11:** intended semantics,
   or compare the extractor alone.
3. **A third archive answer.** Wayback answered 429 for `20250208221410` for over an hour, from the
   container, a laptop and the researcher's browser, while `20240520195927`, `20250219172606` and
   `20250326115857` served with 200. Neither transient (it did not clear) nor a durable 404
   (UNSERVABLE). NEXT_ROW is the earliest UNFETCHED row, so the page was blocked behind it and no
   tool could skip an UNFETCHED row. **Ruled 2026-09-07:** no threshold, ever; the researcher retries
   as often as they like, and only their explicit word skips a capture. `resolve_scan_stop` with
   BAD_CAPTURE is widened to an UNFETCHED row, reason required, in this change; flows A5 gains the
   dated lines. The capture is not skipped here — the researcher may retry first.
4. **The stop panel on the marking page is a dump.** Seen at the first three-gate stop: ~70 lines,
   every removal listed flat, selectors raw. PR 3's first input: one block per gate with its question
   and its answer beside it, Gate 4 per rule with a count and the trust tick.
5. **A stored verdict carries a false sentence.** `IntegrityCheck.detail.explanation` on every
   capture says the capture is "anchored by its TEXT" and points to two retired tools; the anchor is
   over the bytes. From `src/lib/onChainVerdict.ts`, a LOW from PR 1's review that is now a false
   claim in a stored row — CLAUDE.md's carve-out: fix, not archaeology. PR 2's.
6. **The differ emits a lone bullet as a chunk** where the gates' segment rule (a letter or digit
   required) would drop it. Recorded; the chunk rule is the differ's, not the gates'.

## Rulings taken during the exercise

- Fable over Opus for a first live run: the expected case was a defect surfacing, and it did
  (findings 1–3), though none in PR 1's code.
- No threshold decides a skip; the researcher's word does (finding 3).
- The positional article-content link is furniture — the researcher's judgement, given twice.

## What remains of step 5

The two later 2025 captures wait behind `20250208221410`: retry, or skip on the researcher's word.
PR 2: A4's exclusive sets in `gates.ts`; the hashed-class tier of `selectorFor` with A8's list; the
`onChainVerdict` sentence. PR 3: the judging moment on the page, sketched first. Then the corrections
this exercise showed are owed on walla — the positional rule ended, the title remnants marked — and
the re-walk that supersedes, which is step 7's proving ground.

**Plan `docs/gf-refactor-plan.md` §3 step 5 points here from its verified line.**
