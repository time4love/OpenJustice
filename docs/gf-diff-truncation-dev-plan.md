# Diff truncation — root cause, measurement, decisions

**Opened 2026-08-26.** Canonical record for the chunking/​classification-input defect found while
attempting the production thesis walk (`docs/gf-thesis-walk-production-handoff.md`).

This is the most sensitive layer in the system: it decides **what page changes exist at all**.
Everything above it — classification, evidence, trajectories, theses, on-chain anchoring — can only
describe changes that survived this step. Read this before touching `src/lib/diffChunking.ts`.

---

## 1. How it surfaced

The production walk opened with a routine environment check and found production holding **7**
evidence records to staging's **8**. The extra record was the `2025-06-01` diff, which staging judged
legally significant and production judged routine, over what appeared to be identical data.

The first four explanations were all wrong, and each was disproved by measurement rather than argument:

| hypothesis | disproved by |
|---|---|
| production runs older code | `master` and `origin/staging` both at `218bd5f`; production deploy metadata shows `commitHash 218bd5f` |
| the classifier is non-deterministic | true but insufficient — production was lower on 10 diffs and higher on **0**; symmetric noise cannot do that |
| the classifier silently dropped items | production emitted 3 items from the 3 chunks it received — it accounted for **100%** of its input |
| the diff computation differed | staging's 9 item quotes are **byte-identical** to production's 9 stored raw chunks |

## 2. Root cause

Two truncations in `src/lib/diffChunking.ts`, both upstream of the classifier, neither justified:

```ts
const MIN_CHUNK_LENGTH = 40;      // chunksForAI() — dropped shorter chunks at SEND time
const MAX_CHUNKS_PER_SIDE = 8;    // groupDiffChunks() — kept only the 8 LONGEST, at STORAGE time
```

**The floor explains the two environments disagreeing.** `chunksForAI` was called in exactly two
places, both inside `WaybackScraper`. `reclassifyDiffs` read `rawDeletedText`/`rawAddedText` and
passed them straight to the agent, applying no floor at all.

```
scan       → WaybackScraper:530   chunksForAI(deletions)          // drops < 40 chars
reclassify → reclassifyDiffs:151  parseRawChunks(rawDeletedText)  // NO filter
```

Staging had been reclassified, so it saw all 9 chunks. Production had only ever been scanned, so it
saw 3. Same commit, same prompt, same prompt hash, same page — **different input**, and both paths
stamped the same `classifierVersion`, so the divergence was invisible in the data.

The decisive chunk, `לדיווח על תופעות לוואי >` (the adverse-event reporting link), is **24
characters**. Its sibling pair sat at 40 and 39 characters — the same sentence deleted and re-added —
so one character decided whether that change was analysed on one side and not the other.

**The cap is the larger defect,** because it applied to storage. `groupDiffChunks` sorted
longest-first and sliced to 8, and `rawDeletedText: JSON.stringify(deletions)` persisted the
truncated array. Reclassification can only ever re-read what scanning chose to keep.

## 3. Measurement (staging, 2026-08-26, read-only)

Recomputed every diff from its own stored snapshots, using the same `diffLines(..., {ignoreWhitespace: true})`
the scan uses, without the cap.

| | |
|---|---|
| chunks that truly existed across 81 diffs | **290** |
| chunks stored | **131** |
| **discarded before ever being written** | **159 (55%)** |
| stored but never sent (the 40-char floor) | 19 |
| snapshots failing `sha256(fullText) == contentHash` | **0** |
| diffs missing snapshot links | **0** |

Zero hash failures means the recomputation is faithful — the same text, verified against hashes that
are themselves anchored on-chain.

**The cap bit on exactly six diffs, and those six are exactly the six judged significant** — i.e.
every promoted evidence record in the vault:

```
2022-07-24 -> 2022-08-05  [SIGNIFICANT]  deleted 8/34   added 8/34
2022-09-05 -> 2022-09-06  [SIGNIFICANT]  deleted 8/34   added 8/34
2022-09-21 -> 2022-11-29  [SIGNIFICANT]  deleted 8/16   added 8/15
2022-05-26 -> 2022-05-29  [SIGNIFICANT]  deleted 8/14   added 8/16
2022-05-29 -> 2022-05-30  [SIGNIFICANT]  deleted 8/16   added 8/14
2022-05-24 -> 2022-05-25  [SIGNIFICANT]  deleted 8/15   added 8/13
```

Production is affected identically: its stored total is also 131, its significant diffs also sit at
8/8, and the raw chunks are byte-identical where compared.

### Why the bias is the worst possible one for this archive

`groupDiffChunks` sorted **longest-first** before truncating, so what was discarded was systematically
the **shortest** changes. The floor then refused the short ones that survived. Both limits sorted
against the same class: short structural deletions — a link, a caveat, a reporting channel, a
contraindication. For an archive whose subject is *what a ministry quietly removed*, that is exactly
inverted.

## 4. Decisions taken

1. **No cap, no floor. Store everything.** `groupDiffChunks` returns every non-empty chunk in
   **document order**. The sort went with the cap: ordering longest-first existed only to choose what
   to keep, and with nothing discarded it destroys document order, which is itself evidence.
2. **One shared selection step.** `classifierInputChunks()` is exported and called by *both* the scan
   and the reclassify path. If a bound is ever justified again it goes there and applies to both, or
   it does not exist. A constant only one of two call sites can see is not a rule.
3. **`diffInputVersion` is its own provenance field — NOT `CLASSIFIER_VERSION`.** The prompt is
   unchanged and `classifierPromptHash` does not move, so the hash cannot see this. But folding the
   input rule into `classifierVersion` would make that string mean "the classifier, and sometimes also
   the input rule" — the exact lie `SUMMARY_VERSION`'s own comment warns against when it explains why
   summary provenance is separate. Three things move independently; they need three fields.
4. **Repair is a RE-DIFF, not a reclassification.** There is no point re-judging 131 chunks when 290
   exist. Reclassify only after the diffs are recomputed.

### Rejected designs, and why (keep — these were nearly built)

- **A coverage guard comparing `rawDeletedText` to the items.** Would have flagged *every scan-path
  row* as "the classifier dropped input" when the classifier was never sent it. Confident, wrong
  findings across the whole corpus. It was measuring the floor, not a classifier failure.
- **Retry the classification and keep the better draw.** Re-runs the same crowded prompt, so it
  re-runs the same odds. Rejected by the user before it shipped.
- **A targeted recovery pass feeding back only the missed chunks.** Better at the mechanism, but
  removing "the crowd" also removes *context*: a fragment judged alone is likelier to be called
  significant, which biases the corpus toward inflated findings. On a platform where a finding names a
  real ministry, inflation is not a neutral error (`defamation-risk.md`).
- **Bumping `CLASSIFIER_VERSION` for an input change.** See decision 3.

## 5. Repair — properties established before running anything

- **`fileHash` does not change.** `forensicEvidenceFileHash(url, beforeSnapshot, afterSnapshot)`
  hashes url + each snapshot's `waybackTimestamp` + `contentHash`, and no classifier output. The
  identity was deliberately moved off `deletedText`/`addedText` for precisely this reason. Corroborated
  by data: the 6 shared diffs carry identical `fileHash` in both environments despite different item
  counts. **No re-anchoring is required.**
- **No Internet Archive fetch is needed.** `UrlSnapshot.fullText` is intact for all 83 captures and
  verified against `contentHash`, so re-diffing is a local computation.
- **Orphan risk is real, bounded, and already instrumented:**
  - routine → significant with no evidence: `recordScanFinding` writes PENDING_REVIEW (`findingsRecorded`)
  - significant → routine **with** evidence: evidence left untouched, now disagreeing with its diff —
    `findOutOfSyncEvidence()` reports it, `flipsWithEvidence` counts it, **only a human reconciles**
  - staging has a **published** thesis citing 8 records; a flip to routine on a cited diff leaves a
    published thesis resting on a record its source diff no longer supports
- **`reclassifyDiffs` has a `dryRun` option** that reports every flip and writes nothing. Use it first.

## 6. A near-miss worth recording

While verifying the migration, `prisma migrate diff --from-migrations` was run with
`--shadow-database-url` pointed at the **live staging database**. Prisma *resets* a shadow database.
The command timed out before doing anything, and staging was verified intact immediately afterwards
(83 snapshots, 81 diffs, 9 evidence, 1 thesis, 3 sessions) — but it would have been a schema wipe of
the same class as 2026-08-21.

**`.claude/hooks/guard-destructive-db.sh` did not fire.** `--shadow-database-url` is not on its
blocked list, which names the obviously-destructive verbs and flags. A destructive operation wearing
a read-only-sounding verb (`diff`) passed straight through.

The correct check needs no database at all and is already prescribed in `CLAUDE.md`:

```bash
npx prisma migrate diff --from-schema-datamodel <old-schema> --to-schema-datamodel <new-schema> --script
```

That was then used, and the hand-written migration matched Prisma's computed output byte for byte.

**Follow-up, not done here:** add `--shadow-database-url` to the guard's blocked list. Also worth
noting for whoever does: the guard matches its keywords anywhere in a command's text, so it fires on
PR bodies, `grep` patterns and documentation that merely *mention* them. That is the right direction
to fail, but it means prose about these commands has to be written through file edits rather than
shell heredocs.

## 7. The dry run, and what drives the repair

The staging dry run (`npm run forensics:rediff -- --dry-run`) confirmed the measurement exactly: 6
diffs, 159 chunks, all six carrying CONFIRMED evidence, 0 hash failures, 0 unlinked.

**Scope, stated so it is not re-litigated: the tracked artifact is a single page.** A diff is a
change to that page, and text removed from it is a removal — full stop. Whether the same text exists
elsewhere on the wider site is a different question that this platform does not track and must not be
used to discount a finding. The evidence is what the page said on a date, and the thesis argues about
that page's representations.

**Some recovered text is navigation boilerplate** — "where do you get vaccinated?", "you can book an
appointment at your HMO". This is not a reason to keep a floor: per-item classification handles it
correctly by giving it empty categories, and `deriveDiffCategories` ignores them, so boilerplate
cannot inflate significance. The cost of keeping everything is prompt size, not corpus quality.

### What the repair is FOR

Not staging's marginal gain. **Production's corpus is measurably worse than staging's, on two
independent axes:**

1. **Both environments were truncated at 8 chunks per side** — 131 stored of 290 that existed.
2. **Only staging was ever reclassified**, so only staging escaped the 40-character floor. Production
   classified 112 of its 131 stored chunks; staging classified all 131. That is the entire reason the
   two disagreed on `2025-06-01`, and why production holds 7 evidence records to staging's 8.

Production is the environment the public reads and the one a production thesis must be argued from.
It is also the environment that has never been repaired, and — per FINDING 100 — the one where the
repair scripts cannot currently run at all. **That gap, not staging's yield, is what makes this
urgent.**

## 8. Executed on staging, and what it exposed

Applied 2026-08-26 from a clean checkout of landed `staging` (`f021b97`), after the process error
recorded in §6b.

| | before | after |
|---|---|---|
| stored chunks | 131 | **290** |
| `diffInputVersion` | none | 6 diffs `v2-uncapped` |
| `classifierVersion` | `v2-item-level` = 81 | **`v3-self-contained-summary` = 81** |
| significant diffs | 7 | **7** |
| evidence / theses / trajectories | 9 / 1 / 116 | **9 / 1 / 116** |

Reclassification: 13 reclassified, 68 skipped-empty, **0 flips, 0 findings recorded** — matching two
independent dry runs. Nothing published broke.

**Five CONFIRMED evidence records are now out of sync with their diffs** (`findOutOfSyncEvidence`).
Four gained categories; `0x088e501e…` LOST `SAFETY_CLAIM_ALTERATION` and is cited by the published
thesis. All remain significant. Only a human reconciles these.

### The classifier MERGES; it does not enumerate

The `2022-09-05 -> 2022-09-06` diff went to 68 chunks and produced 7 items, which looked like a 90%
drop. It is not. Item quotes run 244–1301 characters against raw chunks averaging ~120: the model
groups consecutive chunks into coherent passages — one 795-character item *is* the citation block that
exists in raw form as a header plus nine URL chunks.

**Comparing item COUNT to chunk COUNT is the wrong measurement**, and two claims made during this
session were wrong because of it: "the classifier accounted for 100% of what it received" (true at 3
chunks, false at 68) and "33% of chunks are undescribed". The correct measure is whether each raw
chunk's text is contained in some item quote:

| | |
|---|---|
| raw chunks | 290 |
| covered by an item | **244 (84%)** |
| **character coverage** | **91%** |

The shortfall is one diff. Eleven of thirteen are fully covered:

```
2022-05-26 -> 2022-05-29 [SIG]  chunks=30  uncovered= 3   chars 98% covered
2022-09-05 -> 2022-09-06 [SIG]  chunks=68  uncovered=43   chars 63% covered
```

Note for anyone building a coverage guard: it must test text CONTAINMENT, not counts. The guard
drafted earlier in this session compared counts and would have measured the same wrong thing.

## 9. Model provenance and the provider question

`FORENSIC_PROVIDER` is unset, so the classifier runs on **`gemini-flash-latest`** (LLMFactory's
default). `LLMFactory` sets `temperature` and **no `maxTokens`**, so the provider default output limit
applies — a long prompt yielding a short merged answer is the signature of an output ceiling, but that
is a hypothesis, not a measurement.

**Nothing records which model judged a row.** `classifierPromptHash` hashes the prompt text only;
`classifierVersion` names the procedure. A corpus judged partly by Gemini and partly by Claude would
carry byte-identical provenance — the same defect class as the input rule, one layer up. That is a
defect independent of which provider is chosen.

Agreed order:

1. **Record the model in provenance.** Do this regardless of the outcome below, so the corpus cannot
   silently become mixed.
2. **A/B before switching.** `preview_diff_classification` re-runs one diff and writes nothing. On the
   `2022-09-06` diff: 3 runs per provider, measuring text coverage.
   - coverage varies wildly per run → output pressure → set `maxTokens` (provider-agnostic)
   - stable ~63% on Gemini, materially higher on Claude → genuine capability difference
   - stable and similar on both → deliberate compression → the fix belongs in the prompt
   The cheapest single call is an explicit `maxTokens` on the CURRENT provider: if coverage jumps, the
   answer was never the model.
3. **Then decide**, with cost in view. Switching also means reclassifying the whole corpus, since a
   mixed-provider vault is worse than either provider alone.

## 10. Executed on production, 2026-08-26 — and the loop closing

Production was the environment this whole thing was FOR. Repaired after staging, from a clean checkout
of landed `master` (`323ba0b`), using `.env.production.local` for the database and MCP for the chain.

**Correction to a claim repeated several times before it was measured:** production was NEVER at
`v2-item-level`. It read `classifierVersion: null=70, v3=11` — it was scanned on 2026-08-25 when `v3`
was already current, so its classified rows were `v3` and 70 were never classified at all. Staging was
the `v2` one. The deficit was never a stale prompt; it was the INPUT — 8-chunk cap, 40-char floor,
single draw, no budget.

| | before | after |
|---|---|---|
| stored chunks | 131 | **290** |
| coverage | 42% (stale items over new chunks) | **290/290 — 100%**, first attempt |
| `classifierVersion` | `null`=70, `v3`=11 | **`v4-budgeted-best-of-n` = 81** |
| `classifierModel` / `classifierDraws` | — | populated on all 81 (`0`=68, `1`=12, `2`=1) |
| significant diffs | 6 | **7** |
| evidence | 7 | **8, all CONFIRMED** |
| theses | 0 | 0 |

### The flip that closed the investigation

```
2025-04-25 → 2025-06-01   ROUTINE → SIGNIFICANT
  after: WITHHOLDING_INFORMATION, ACCOUNTABILITY_EROSION, SAFETY_CLAIM_ALTERATION
```

That is the diff the session opened on. Production's classifier had been handed **3 of 9 chunks**; the
40-character floor withheld the rest, including `לדיווח על תופעות לוואי >` at 24 characters. Shown all
nine, it reaches staging's verdict and names the withheld reporting channel explicitly.

The resulting evidence record is `0x8b814765297a097988280da80c4ae655547c13ae135178fa614838b6d1002a34`
— **byte-identical to staging's**, reached independently by two repaired environments. Promoted via
MCP, anchored on Base at registry id **19**, `check_on_chain_status` → `CONSISTENT`.

### What the classifier actually does, corrected twice

1. *"The classifier accounted for 100% of what it received"* — true at 3 chunks, **false at 68**.
2. *"33% of chunks are undescribed"* — an artifact of comparing item COUNT to chunk COUNT. **The
   classifier MERGES**: item quotes run 244-1301 characters against ~120-character chunks, and one item
   can legitimately cover ten. Real coverage was 84% of chunks / 91% of characters.

Any coverage check must test TEXT CONTAINMENT. `computeDiffCoverage` does; the guard drafted earlier in
this session did not, and would have generated confident wrong findings corpus-wide.

### Variance is the dominant effect

On the largest diff (68 chunks), six draws under two configurations:

```
default budget : 57%  76%  75%
explicit 8192  : 99%  100%  43%
```

**100% is achievable** — the model can enumerate every change, so this was never a capability ceiling
and is not an argument for changing provider. But a corpus storing ONE draw per diff stores a sample
and presents it as a measurement. Hence best-of-N scored on coverage.

### A fragility introduced and fixed in the same session

The explicit budget made the model attempt full enumeration, and on Hebrew — token-dense — the
structured output was cut mid-string: `Unterminated string in JSON at position 16671`. The parse threw
out of the draw loop and killed the run. Caught by a dry run, so nothing was written, but a WRITE run
would have left a partially reclassified corpus.

Fixed at two scopes: a failed draw is not a failed classification (retry within the same bound), and a
failed diff is not a failed run (`failed`/`failedDiffIds`, row left unchanged). Proven live afterwards
on production, which absorbed a truncated draw and completed with `Failed: 0`.

### Known gaps, deliberately not closed

- **A RECOVERED draw failure is invisible in the summary.** It appears only as a `console.warn`, so
  "how often did a draw truncate and get absorbed?" cannot be answered from a run's counters.
- **`--dry-run` is not entirely write-free.** It creates a `ReclassificationRun` audit row while
  printing "nothing will be written". Harmless, but the sentence that authorises running against real
  data should be true.
- **Four evidence records on STAGING are out of sync with their diffs** — all under-categorised,
  because they were promoted from truncated, thinly-covered classifications. Only a human reconciles.
- **The provider A/B never ran.** The Anthropic arm returned
  `400 invalid_request_error: credit balance is too low` on all three attempts.
- **`MIN_CLAIM_LENGTH = 40` in `claimTrajectory.ts`** is untouched. Different rationale from the diff
  floor (substring-presence validity, not significance), but its own comment calls it "a trade worth
  revisiting once there are real trajectories to look at" — and there are now 116, with 21 cited by a
  published thesis. Changing it bumps `DETECTION_VERSION` and recomputes every trajectory.

## 11. Status

- [x] Root cause identified and measured
- [x] Cap and floor removed; `classifierInputChunks()` shared by both paths
- [x] `diffInputVersion` provenance field + migration
- [x] `classifierModel` + `classifierDraws` provenance + migrations
- [x] `get_diff_input` MCP tool (READ_TOOLS)
- [x] `preview_diff_classification` MCP tool (WRITE_TOOLS — it spends)
- [x] Operational scripts compile and run in a deploy container (FINDING 100 closed)
- [x] Explicit output budget; best-of-N scored on text coverage; `CLASSIFIER_VERSION` → `v4`
- [x] Draw/diff failure isolation
- [x] Registry-deployment guard — refuses a codeless registry on reads AND writes
- [x] **STAGING repaired**: 290 chunks, 100% coverage, `v4` on all 81, 0 flips
- [x] **PRODUCTION repaired**: 290 chunks, 100% coverage, `v4` on all 81, 1 flip, 8th record anchored
- [x] Shipped to production (`3a80620`)
- [ ] Reconcile 4 out-of-sync evidence records on staging
- [ ] Provider A/B (blocked: Anthropic credit)
- [ ] `MIN_CLAIM_LENGTH` in trajectories (separate decision, bumps `DETECTION_VERSION`)
- [ ] Surface recovered draw failures in run counters
- [ ] Make `--dry-run` genuinely write-free, or correct its wording
- [ ] **The production thesis walk — unblocked, never started**

## 12. PRs

`#176` truncation fix · `#177` re-diff planner · `#178` docs · `#179` ship operational scripts ·
`#180` guarded apply · `#181` empty-diff skip · `#182` model provenance · `#183` token budget +
best-of-N · `#184` `v4` bump · `#185` draw resilience · `#186` registry guard.

Two production ships: `323ba0b` (the repair capability) and `3a80620` (the registry guard).
