# Walla's corrective pass, and what the surface could not tell the researcher — 2026-09-08

**A dated record, never edited.** Four findings from one short session at the connector, none of
which a test could have produced: the suite was green, every instrument agreed with itself, and a
researcher still could not find out whether their own correction had worked. Every number below is a
return read on the day; nothing is recomputed. The corrective pass this closes was opened in
`docs/gf-walk-step-5-rewalk-2026-09-07.md`.

**The subject** is `https://news.walla.co.il/item/3403847`, page `1ed3b18f-c3e8-4624-982e-65edb4c1e6ea`
on staging, walking the code merged that morning as `e20bd7f` (PR #391).

---

## 1. The walk asked nothing where the same pass had asked about thirty times

The researcher resumed the walk in their own words — *"continue the walk"*, no tool named. Two rows
walked and the call halted at the archive:

```json
{ "error": "The archive did not serve capture 20250208221410; the row stays UNFETCHED and the walk
   stops here. Everything before it is kept.",
  "code": "ARCHIVE_UNAVAILABLE", "capture": "20250208221410", "walked": 2,
  "outcomes": { "identical": 0, "duplicate": 0, "acquired": 0, "unservable": 0,
                "superseded": 1, "restamped": 1 },
  "next": "20250208221410" }
```

**No gate fired.** One capture's previous text was kept as a superseded version, one had only its
ruleset stamp moved; nothing was acquired and no classifier call was spent.

That is the first live evidence for the amendment landed hours earlier (flows A3 SEEN and A4 Gate 2,
amended 2026-09-08; PR #391). The 2026-09-07 record has this same pass stopping on captures whose
silences and removals a human had already judged — *"about thirty turns per redesign, all repeats"*.
It now asks nothing on them. **The stop the session set out to drive no longer exists**, which is the
change working rather than the walk skipping.

**What that does NOT establish, and it matters:** "quiet because you already judged these" and "quiet
because it lost track" are indistinguishable from the return alone. The check that separates them is
whether every diff now re-derives to zero chunks — the thing the corrective pass was for. §2 is why
the researcher could not run it through any tool, and §4 is the answer, run as a query.

**Still unexercised by this pass:** PR 4's per-rule script, `get_rule_history`, and TRUST/END given in
the chat. No gate fired, so none of them ran against real data. The BAD_CAPTURE half of the script
did: the session told the researcher that no number of retries skips a capture and that the word is
theirs, which is the contract.

## 2. A tool answered a question it could not answer, in the shape of a real negative

Asked what changed between 2020-12-09 and 2021-06-12, the session read the work-list correctly —

| capture | outcome | comparedTo | ruleset |
|---|---|---|---|
| `20201209134003` | ACQUIRED | — | `67d898a1` |
| `20201218044603` | DUPLICATE | `20201209134003` | `a8dd702f` |
| `20210612183110` | ACQUIRED | `20201209134003` | `86b7766a` |

— including that the DUPLICATE is stepped over, so the pair diffed is 12-09 → 06-12, as PREDECESSOR
defines. It then read that diff (`1eaa8028-fc85-4bdc-a4bc-0317f46ecc9d`) through `get_diff_input`:

```json
"raw": { "deletedChunks": [], "addedChunks": [] },
"counts": { "rawChunkCount": 0, "itemCount": 0 },
"provenance": { "classifierVersion": null, "diffInputVersion": null,
                "rawChunksMayBeTruncated": true,
                "classificationInput": { "state": "UNCLASSIFIED" } },
"stored": { "survival": { "state": "UNCHECKED" } }
```

and reported, reasonably, that the corpus held nothing: three of three diffs UNCLASSIFIED with no
items, claim trajectories returning nothing with `candidatesConsidered: 0`, *"nothing has been ruled
out here; nothing has been looked at"*.

**Every one of those readings is accurate. The conclusion is false.** Read from the code the same
hour:

- `src/services/diffInput.ts:107–150` reads `rawDeletedText`, `deletedText`, `addedText` and
  `diffInputVersion` — **`UrlVersionDiff`'s legacy columns**.
- Since step 5's PR 1 (#375) `recordDiff` writes the pair alone —
  `beforeSnapshotId`, `afterSnapshotId`, the dates, the URL (`recordDiff.ts:254–265`) — and puts every
  chunk, each chunk's survival verdict and the whole classification on a **`DiffContentVersion`**
  (`:269–283`).
- **`DiffContentVersion` has one writer and no reader.** `grep` across `src/` returns the write site
  and nothing else: no tool, no route, no service reads it.

So those four fields are what that tool returns for **every** diff the new walk writes, whatever the
corpus holds. The three warnings it surfaced — `rawChunksMayBeTruncated`, "3 of 3 carry no Level 5
verdict", `candidatesConsidered: 0` — are one fact restated three times, and none of them is about
Walla.

**Why this is worse than a stale tool.** A5 rules that every refusal is a stated code. This surface
did not refuse; it answered, with a shape **indistinguishable from a real negative**, and the reader
had no way to tell. A capable session read the only surface available, found it empty, and reported
the corpus empty. Anyone would.

**The corollary is the larger finding: the corpus's real content is invisible to the whole platform.**
The walk has been writing content versions since #375 and nothing can show them, so a researcher must
take their own corpus on faith — including whether the correction they just made worked.

**Ruled the same day:** evidence steps 11 and 12 run before corpus step 10 (plan §3b, dated note).
Step 11 drops the legacy columns so the misleading read fails at compile time; step 12 builds
`list_findings` and re-scopes `get_diff_input` to the pair. Neither is new work; the order changed.

## 3. A session's tool surface can be older than the deployed code

Before any of the above, the session driving from a terminal could not run the walk at all. Its MCP
tool list, captured when it connected, exposed `resolve_scan_stop` with `resolution` pinned to
`const: 'BAD_CAPTURE'` and `reason` required, and **no `get_rule_history` at all** — the pre-PR-4
surface, though #386 and the three description fixes #387–#389 had landed and deployed.

It could therefore have fetched a stop and read it out, and then had **no way to record the answer**:
CONTINUE, TRUST and END all go through `resolve_scan_stop`, and its schema would reject anything but
BAD_CAPTURE. The researcher reconnected the connector and drove the flow there instead.

**The rule this sharpens** is the standing one — *guide only from what the real session sees* — biting
in the unfamiliar direction. The usual hazard is a session guiding from design documents ahead of the
code. Here the session's own surface was **behind** the code, so quoting the tool contract would have
promised a script and a tool that session could not reach. A tool list is a cache, and after a deploy
it is a stale one.

## 4. The corrective pass is proven — and the walk paid a classifier call for each empty diff

The zero-chunk check §2 could not run through any tool was run as a read-only query against
`DiffContentVersion`, newest version per diff:

| before | after | diffVersion | survivalVersion | chunks | classified | derivedAt |
|---|---|---|---|---|---|---|
| 2020-12-09 | 2021-06-12 | `v4-sentence-claims-lettered+v5-editorial-verdict` | `v4-against-documents` | **0** | true | 07:00:49 |
| 2021-06-12 | 2022-05-23 | same | same | **0** | true | 07:00:51 |
| 2022-05-23 | 2024-05-20 | same | same | **0** | true | 08:41:23 |

**The corrective pass worked.** Both positional link rules are ended, all four texts are derived
without them, and every diff now holds zero chunks: the article never changed, and for the first time
the corpus says so. The last row is today's walk (§1), which derived the 2022→2024 pair at 08:41.

`classified: true` also settles §2 from the DATA rather than from a reading of the code: the
classifier ran on every one of these. The session's *"the classifier never ran on it at all"* was the
legacy columns talking, exactly as §2 concluded, and this is the independent confirmation.

**And it is the finding.** Read from `src/walk/tools/scanCaptures.ts:883–905`: `draw` builds the
`ClassifierDiff` and calls `analyzeChange` with no check that either side holds anything. Three paid
calls were spent this morning asking a model whether an empty change was editorial, and the verdict
bought is meaningless.

**It recurs for future state, which is what makes it work rather than archaeology.** Every corrective
pass that SUCCEEDS ends in zero-chunk diffs, and every one of them pays — the better the marking, the
more the walk spends on nothing. The design already knows an empty diff is empty from the other side:
evidence A4 refuses `NOTHING_TO_PROMOTE` for *"a diff whose CURRENT has no chunk"*, so evidence calls
it evidence of nothing while acquisition pays to have it judged. A2 already defines the state the fix
would write — `classification Json?`, *"NULL when nothing classified this derivation"* — and nothing
produces it.

**Whose it is:** acquisition's, not evidence's. The draw is the walk's, so the fix belongs in the
corpus track and not in steps 11 or 12, which are about reading what the walk wrote.

## What remains

- **`20250208221410`** still answers 429, as it has since 2026-09-06. Retry, or the researcher's
  explicit skip with a reason; no count of attempts ever decides it.
- **PR 4's judging surface has never run.** The next real stop is its first.
- **The empty-diff draw is unfixed**, recorded here and owned by the corpus track.

**Plan `docs/gf-refactor-plan.md` §3b points here from its 2026-09-08 note.**
