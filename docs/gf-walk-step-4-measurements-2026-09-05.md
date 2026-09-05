# Step 4, the measurements — PART 1: Gate 5's confusion table and the walk's first stops — 2026-09-05

A findings record, never edited. Bears on `docs/gf-refactor-plan.md` §3 step 4 and §6 item 4;
pointed at from step 4's dated note. **This is PART 1.** Part 2 — Gates 1, 2 and 4 under rules
created by MARKING on stored captures — is written after step 6, from a second staging run, as a
second dated doc; the digest match count per page is read from `digestVerified` after step 5's
walk and recorded then. Both per the plan's dated note at step 4.

**What was run.** After PR #354 (`2f45a0d`) deployed to staging (SUCCESS, deployment `226a9893…`),
the reviewer session drove every call below one approval at a time: the environment through the
staging MCP connector, the instrument in the deploy container through `railway ssh` with the
environment stated twice, the walk through the connector. Every call wrote nothing. The raw
outputs are quoted verbatim; nothing here is recomputed and no number is carried from an earlier
document.

## 7a — the environment

`get_environment()` → staging, CONFIRMED; database `elws…ae` pinned; chain 84532, registry
`0x65b9a7acb45Aa05e7Ed207844F93a2b308373853` deployed and matching; corpus, for recognition only:
3 pages · 112 snapshots · 109 diffs · 9 evidence. Identified by the deployment's own
configuration, never by the connector's name.

## 7b — the sample (no spend)

```
railway ssh --environment staging --service glass-fortress-backend \
  "cd apps/glass-fortress/backend && npm run forensics:measure-gate5 -- --env staging --sample --seed 20260905"
```

exit 0. The instrument printed, before anything else:

```
environment  staging — agreed by Railway, APP_ENV, the database and the chain
deployment   226a9893-1035-4210-b82c-3ab8299f8059 @ 2f45a0d

corpus       109 diffs, 7 promoted to evidence · sample 20 · seed 20260905
```

**7 promoted, not 9.** Two of the nine evidence rows are not linked to a diff, so the sample is
the 7 promoted diffs plus 13 drawn by the seeded shuffle, in that order. The printout carried, per
diff, only its id, page, dates, `removed:` and `added:` — the chunks Gate 5 hands the classifier,
recomputed from the two snapshots' current `text` — and no stored verdict, category or promotion
flag beside them.

**Five of the twenty carried NO input** — `removed:` and `added:` both empty: #9 `a0895f9c`,
#11 `40095c03`, #14 `348d3ae4`, #18 `0bca7574`, #20 `aa5a5134`. All five are corona diffs written
by the old path between snapshots whose current text differs by nothing the chunker keeps.
#19 `f7709f29` is a whitespace-only change inside one phone line:

```
    removed:
      - 5400* או 08-6241010
    added:
      + 5400*  או  08-6241010
```

## 7c — the labels

The researcher labelled from the printout, one question per diff, the same wording the model was
given: *is every change authored content (y), or is any part of it page furniture entering or
leaving (n)?* #13 (`67cd36e6`, whose whole input is the removed line `לכל המידע על חיסון רביעי >`)
was confirmed y after a numbering check; the five empty diffs n; #15 (`69f4ba8f`, the removed
PCR-test notice) n; #19 n. Result: 8 y, 12 n.

| # | diff | page | dates | label |
|---|---|---|---|---|
| 1 | `1c8fa934` | corona | 2022-05-24 → 2022-05-25 | y |
| 2 | `3e1f1472` | corona | 2022-07-24 → 2022-08-05 | y |
| 3 | `4e19ac8b` | corona | 2022-05-29 → 2022-05-30 | y |
| 4 | `ab2d0bd6` | corona | 2022-05-26 → 2022-05-29 | y |
| 5 | `b8c16037` | corona | 2022-09-21 → 2022-11-29 | y |
| 6 | `e5104bbd` | corona | 2025-04-25 → 2025-06-01 | y |
| 7 | `fb79cbc1` | corona | 2022-09-05 → 2022-09-06 | y |
| 8 | `7daec2b4` | rtmag | 2023-07-13 → 2023-10-29 | n |
| 9 | `a0895f9c` | corona | 2022-05-26 → 2022-05-26 | n (empty input) |
| 10 | `faddbc1b` | rtmag | 2024-05-30 → 2024-09-20 | n |
| 11 | `40095c03` | corona | 2022-05-16 → 2022-05-21 | n (empty input) |
| 12 | `7e4dfe76` | rtmag | 2024-12-13 → 2025-05-23 | n |
| 13 | `67cd36e6` | corona | 2022-05-25 → 2022-05-26 | y |
| 14 | `348d3ae4` | corona | 2022-04-03 → 2022-04-07 | n (empty input) |
| 15 | `69f4ba8f` | corona | 2022-05-22 → 2022-05-24 | n |
| 16 | `5e831dbc` | rtmag | 2024-01-18 → 2024-01-24 | n |
| 17 | `107765bf` | rtmag | 2022-12-14 → 2023-01-02 | n |
| 18 | `0bca7574` | corona | 2022-08-16 → 2022-09-05 | n (empty input) |
| 19 | `f7709f29` | corona | 2022-01-05 → 2022-01-09 | n (whitespace only) |
| 20 | `aa5a5134` | corona | 2022-03-28 → 2022-03-31 | n (empty input) |

#1–#7 are the seven promoted diffs; the printout did not say so, and the labels were made without it.

## 7d — the measurement (20 classifier calls)

```
railway ssh --environment staging --service glass-fortress-backend \
  "cd apps/glass-fortress/backend && npm run forensics:measure-gate5 -- --env staging --measure --seed 20260905 --labels <the twenty ids>=y|n"
```

exit 0. Printed before the first paid call:

```
environment  staging — agreed by Railway, APP_ENV, the database and the chain
deployment   226a9893-1035-4210-b82c-3ab8299f8059 @ 2f45a0d

corpus       109 diffs, 7 promoted to evidence · sample 20 · seed 20260905

spend        20 classifier calls, each 1–3 model draws · model gemini:gemini-flash-latest
```

The table, exactly as the instrument printed it:

```
                          classifier: editorial   classifier: NOT editorial   total
human: editorial          6                       2    (false stop)          8
human: NOT editorial      7    (missed)          5                           12
total                     13                      7                           20
```

The stamp: `v5-editorial-verdict · prompt b7e3d84026de… · model gemini:gemini-flash-latest`.
The run's ledger line: `startedAt 2026-09-05T17:53:34.487Z`, `finishedAt 2026-09-05T18:00:17.653Z`,
commit `2f45a0d693bbf98a5e16aee4fe469f81a0e62536`, exit 0.

Per diff — the human's label, the classifier's answer through the gate, the model's one sentence
abridged; **bold** marks a disagreement:

| # | diff | human | classifier | reason (abridged) |
|---|---|---|---|---|
| 1 | `1c8fa934` | y | editorial | authored informational content and health guidance, not layout furniture |
| 2 | `3e1f1472` | y | editorial | authored informative content on eligibility, dosing and safety, free of site furniture |
| 3 | `4e19ac8b` | y | editorial | deliberate content edits and restructuring, no peripheral site furniture |
| 4 | `ab2d0bd6` | y | editorial | substantive authored health guidance and eligibility criteria, no extraneous furniture |
| 5 | `b8c16037` | y | editorial | authored substantive content, not page furniture or navigation widgets |
| 6 | `e5104bbd` | y | **NOT** | includes page navigation menu links and utility buttons (green pass, certificates) alongside authored content |
| 7 | `fb79cbc1` | y | editorial | authored body text, medical guidance, bulleted instructions, informational links |
| 8 | `7daec2b4` | n | NOT | view counters, relative date stamps, rotating links in a recent-articles widget |
| 9 | `a0895f9c` | n | **editorial** | "No textual additions or deletions were detected between the snapshots." — EMPTY INPUT |
| 10 | `faddbc1b` | n | NOT | view counter increments, relative timestamps, dynamic sidebar links |
| 11 | `40095c03` | n | **editorial** | "No authored content or page furniture was modified in this snapshot comparison." — EMPTY INPUT |
| 12 | `7e4dfe76` | n | NOT | an automated view counter and dynamic sidebar feed widgets |
| 13 | `67cd36e6` | y | **NOT** | the deleted text is a navigational link or button, not authored body content |
| 14 | `348d3ae4` | n | **editorial** | "No textual changes or page furniture modifications were detected in this diff." — EMPTY INPUT |
| 15 | `69f4ba8f` | n | **editorial** | authored informational text about entry testing rules, removed after its date passed |
| 16 | `5e831dbc` | n | NOT | dynamic view counters, relative date stamps, rotating related-articles feeds |
| 17 | `107765bf` | n | NOT | an updated view counter, timestamp increments, rotating related-article links |
| 18 | `0bca7574` | n | **editorial** | "No changes or page furniture were present in this snapshot comparison." — EMPTY INPUT |
| 19 | `f7709f29` | n | **editorial** | an authored spacing adjustment within contact text |
| 20 | `aa5a5134` | n | **editorial** | "No text changes or page furniture modifications were detected in this diff." — EMPTY INPUT |

The run also printed the classifier's own warnings. SIX draws failed to parse on Hebrew responses
(`Failed to parse. Text: "{ "deletedItems": [ { "summary": "…`), across five diffs: #2 draw 2,
#3 draw 2, #4 draw 3, #5 draw 3, #7 draws 1 and 2. SIX `Coverage incomplete` lines after three
draws, on #2 (`87 of 117 chunks described by no item (38% of characters covered)`), #3 (`1 of 60`,
100%), #4 (`26 of 60`, 66%), #5 (`8 of 49`, 76%), #7 (`106 of 125`, 29%) and #12 (`20 of 54`,
93%). The budgeted best-of-n absorbed both; every call returned an answer. The same behaviour
exists under v4 and is recorded, not acted on.

## The reading

**Over the fifteen diffs with input, the table is 6 / 2 / 2 / 5** — eleven agreements, four
disagreements. The other five are the empty-input diffs, and they are not a classifier result.

**Every furniture diff was caught.** The five rtmag diffs (#8, #10, #12, #16, #17) — view counters,
relative timestamps, rotating related-article feeds — were each called NOT, each reason naming the
furniture. That is the case Gate 5 exists for: five of five.

**The four disagreements, each named for what it is:**

- **#6 `e5104bbd`, a false stop by the ruled definition.** The model applied the definition it was
  given — a diff that mixes authored content with navigation menu links and utility buttons is NOT
  editorial — and the label did not. Under the ruling (2026-09-05: furniture beside a real edit is
  the one case nothing else catches), the model's answer is the definition's.
- **#13 `67cd36e6`, a false stop the definition does not settle.** The whole input is one removed
  line, `לכל המידע על חיסון רביעי >` — a link to the fourth-dose page. Authored, or furniture? The
  definition's list names neither an in-content link nor a call-to-action line.
- **#15 `69f4ba8f`, labelled n, called editorial.** The removed PCR-test notice is authored text
  whose date passed; the label read its removal as housekeeping, the model as an edit. The labels
  stand as given.
- **#19 `f7709f29`, whitespace only.** One phone line with two spaces doubled. Neither y nor n
  describes it: nothing authored changed and no furniture moved.

**Five of the seven "missed" are the empty-input diffs**, on which the model answered "editorial"
with a reason saying nothing changed. This is not a classifier miss. It is Gate 5 being asked about
nothing — and the landed walk would ask exactly that on a capture whose `textHash` differs from its
predecessor's while the chunker keeps no line: a paid call on an empty diff, answered with a verdict
about nothing. **THE EMPTY-INPUT FINDING, FOR STEP 5'S BRIEF:** Gate 5 must not be asked on an empty
classifier input, and the contract owes a ruling on what such a capture IS — NOVEL by hash, empty by
diff.

**The premise's verdict on this sample.** The measurement tests the premise that a not-editorial
verdict is the symptom of furniture entering `text`. On this sample it holds: no furniture diff was
called editorial, and no clean authored change was called NOT except through the mixed rule (#6) or
a line the definition does not settle (#13). The false-stop cost is two of eight authored diffs,
both explainable by the definition rather than by the model.

## 7e — the reporting walk's first stops (no spend)

`scan_captures(url="https://news.walla.co.il/item/3403847", maxCaptures=10)`, called twice; both
answers identical:

```json
{"walked":1,"outcomes":{"identical":0,"duplicate":0,"acquired":0,"unservable":0,"superseded":0,"restamped":0},
 "stop":{"capture":"20201209134003","gates":[{"gate":0,"material":{}}],
 "markingUrl":"https://glass-fortress-frontend-staging.up.railway.app/he/article-rules/38da8d89-7acf-4874-b8c8-43dbff78d229/20201209134003"},
 "next":"20201209134003"}
```

The walk began at walla's FIRST STORED capture, `20201209134003`, not at its one UNFETCHED row. A
diagnostic read in the container explained it: all 112 snapshots carry the current extractor
constant (`v2-inflate-decode-htmltotext-normalised`), but walla's seven stored rows are the OLD
path's rows — status `STORED`, `rulesetId` null, `textExtractionVersion` null. Step 2's legacy join
stamps only the rows the survey creates; these rows already existed. The row boundary reads
`STORED` as ACQUIRED and a null stamp as STALE (step 3's ruling), so NEXT_ROW is the first stored
capture and Gate 0 fires there. This is Flow 3 as designed, on the legacy corpus: the 29 old-path
rows on staging (walla 7, rtmag 22) are re-derivable and either restamp at step 5 or go at the
rebuild, which now comes first. Step 6's marking on walla opens this capture.

`scan_captures(url="https://corona.health.gov.il/vaccine-for-covid/", maxCaptures=20)`, called
twice; both answers identical:

```json
{"walked":5,"outcomes":{"identical":4,"duplicate":0,"acquired":0,"unservable":0,"superseded":0,"restamped":0},
 "stop":{"capture":"20220307110948","gates":[{"gate":0,"material":{}}],
 "markingUrl":"https://glass-fortress-frontend-staging.up.railway.app/he/article-rules/45ce88aa-02a1-4361-be40-977a8e2fb050/20220307110948"},
 "next":"20220307110948"}
```

Corona's stored rows were created by the survey and are stamped, so the walk started at its first
UNFETCHED row: four rows took the IDENTICAL shortcut — the same digest as a preceding row whose
text is known, no fetch — the fifth was fetched, its bytes matched the index's digest (no DIGEST
stop), and Gate 0 fired on it.

## What this verifies

The registered reporting walk answers on staging as A5 shapes it: it stops on Gate 0 with the
marking URL as Phase 1's bootstrap, takes the IDENTICAL shortcut without fetching, verifies the
digest on a fresh fetch, answers the same on a second call, spends nothing before Gate 5, and writes
nothing. The Gate 5 instrument ran in the container with the environment agreed on four axes and
the spend and the model printed before the first call. The premise holds on the sample; the
empty-input case is the finding.

## Not measured here, and why

- **Gates 1, 2 and 4** — no `Rule` row exists under the new model until step 6 creates one through
  MARKING; measured after step 6 as part 2 of this doc, a second dated record.
- **The digest match count per page** — read from `digestVerified` after step 5's walk, which
  verifies every fetch as it acquires; recorded then.
- **Gate 5 on a live novel capture** — needs a stop past Gate 0, which needs an acceptance; step 6.
