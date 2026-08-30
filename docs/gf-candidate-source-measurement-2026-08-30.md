# The candidate-source axis — what it measured, and what it cost to measure

**2026-08-30.** Staging only. Production untouched: `master` is `6535948` throughout.

This record exists because `docs/gf-factual-layer-rebuild-dev-plan.md` holds DECISIONS and a dated
record holds FINDINGS. The plan grew 310 → 2,839 lines by absorbing its own findings; this is the
correction.

## Why the instrument was built

6.2c — moving the differ off `fullText` — was framed as *spend first, measure after*: bump
`diffInputVersion`, re-classify every diff (hundreds of model calls), then re-run
`forensics:compare-detection-layers` to find out whether it bought anything.

That order was avoidable. `rawDeletedText`/`rawAddedText` already hold the raw `fullText` chunks, the
payloads are already stored, and detection is deterministic and free. **What the move would make
reachable was computable for nothing.**

`compareDetectionLayers` could not answer it because it varies the wrong axis — presence layer, with
candidates held fixed. Candidates come from diffs over `fullText`, so its gain arm could only ever
return "same or worse". `forensics:compare-candidate-sources` varies the candidate source instead.

## The arms

| arm | candidates from | layer | question |
|---|---|---|---|
| `CLASSIFIED` | classifier quotes | EXTRACTION | the datum — production |
| `CLASSIFIED_SENTENCES` | those quotes, sentence-split | EXTRACTION | 6.2h |
| `CLASSIFIED_SENTENCES_AT_DOCUMENT` | identical candidates | DOCUMENT | the outsider check |
| `RAW_CHUNKS` | chunks the classifier was fed | EXTRACTION | isolating control |
| `DOCUMENT_CHUNKS` | chunks re-derived from `text` | DOCUMENT | 6.2c |

Layers are pinned per arm, not passed: candidates from `text` tested against `fullText` measure the
cross-renderer mismatch the arm exists to remove. All arms share ONE eligible pair set (current
`diffInputVersion` AND both captures at current `textExtractionVersion`), because gating each arm
separately would make their difference carry a population change as well as the effect.

## THE RESULT THAT SETTLES THE ORDERING

```
CLASSIFIED_SENTENCES_AT_DOCUMENT  vs  CLASSIFIED_SENTENCES
  LOST to control:    0 genuinely new · 0 re-spelling · 0 unclassifiable
  GAINED vs control:  0 genuinely new · 0 re-spelling · 0 unclassifiable
```

**Zero difference in both directions.** Sentence candidates produce an identical trajectory set
whether presence is tested against Readability's article or the rendered document — 184 candidates,
184 trajectories, **0 unmatched**, on an arm that is NOT structural (candidates from the classifier,
presence from the document), so the zero is measured rather than guaranteed.

**The free option survives the layer a stranger actually searches.** The differ move is not
load-bearing for outsider-verifiability.

Its only two broken probes are the 352- and 567-character artefacts — the correction, not a loss.
That is now the THIRD independent instrument to identify the same two.

## The three options, with the shape that never moved

| option | mechanism | cost | findings gained |
|---|---|---|---|
| raw-chunk candidates | `DETECTION_VERSION` bump, recompute | compute only, **no classifier** | ~115 |
| sentence candidates (6.2h) | `DETECTION_VERSION` bump, recompute | compute only | ~121 |
| move the differ (6.2c) | `diffInputVersion` + full re-classification | **API spend** | a smaller increment |

The middle option was named by nobody until this instrument existed: the raw chunks are already
stored, so candidate discovery can move off classifier output without a single model call.

**Across five correction rounds the ordering never changed.** Most of the gain needs no classifier.

## The numbers that are NOT settled, and should not be quoted

- **`25 findings attributable to the layer` is STALE METHODOLOGY.** It was measured before the
  containment floor and the three-way verdict landed, and before the reverse direction was reported
  at all. It has no successor: see below.
- **The net exchange was never measured.** `DOCUMENT_CHUNKS`' section fell inside the truncated
  region of both `--list-all` runs. Its forward difference alone cannot be netted, because per-arm
  thresholding means the shared set does not even have one size — a claim can clear `MIN_TRANSITIONS`
  in one arm and not the other.

Chasing it further was stopped deliberately. The arm bounds what the DIFFER would produce, not what
the CLASSIFIER would select, and that gap is structural — wider than the corrections being made.

## Five corrections, each of which changed a number and none of which changed the decision

1. **`gained` counted things that are not findings.** `MIN_TRANSITIONS` is a READ filter applied in
   `shape()`, which no comparison calls, so every set included claims present in EVERY capture.
   175 → 128. The FDA line arriving in `GAINED` at 0 transitions was the demonstration.
2. **A count difference is not a set difference.** `gained(A).length - gained(B).length` assumes
   nesting that nothing established. The set difference gave 25 where subtraction gave 13 —
   understating the renderer's contribution by nearly half, in the direction that argued AGAINST the
   change.
3. **Three of five arms have cells that cannot fail.** A chunk arm draws candidates from the very
   text presence is tested against, so `unmatched = 0` and `trajectories == candidates` by
   construction — the defect the instrument was built to study, reproduced inside it. Now declared
   and marked, never reported as a result.
4. **The coverage matcher had no floor.** `respellingOf` is containment matching, which
   `trajectoryContext` already gates with `CONTAINMENT_MATCH_MIN_LENGTH` because a short string is a
   substring of unrelated text by accident. A false match here classifies a genuinely-new claim as a
   re-spelling and subtracts it from the purchase.
5. **The floor alone would have moved the bias, not removed it.** Below the floor a claim could never
   be called a re-spelling, so it would be counted new BY CONSTRUCTION — on exactly the short
   headings that constitute the purchase. Resolved three-way: `UNIQUE` (overlaps nothing — measured
   at any length), `RESPELLING` (covered on ≥40 chars — measured), `OVERLAP_BELOW_FLOOR` (not
   measured, counted toward neither side).

**A test written for correction 4 had encoded the defect as a requirement** — it asserted that a
5-character containment counted as coverage. The floor broke it, correctly.

## The regression this session shipped and then fixed

`emitLedgerRecord` lives in `runOperationalScript`, the single entry point for **all 23 operational
scripts**. Its `console.log` was replaced with `writeSync` because `process.exit()` discards queued
pipe writes and a 164KB run had emitted no ledger record.

`writeSync` to a full NON-BLOCKING pipe throws `EAGAIN`, and an uncaught throw in a
`process.on('exit')` handler makes Node exit **1**:

| run | output | exit | record |
|---|---|---|---|
| `09d884b`, no `--list-all` | 26KB | **3** (correct) | present |
| `1a03209`, `--list-all` | 169KB | **1** | absent |
| `20eccf9`, `--list-all`, after the fix | 162KB | **3** | present, `"exit":3` |

The 169KB run's verdict was 3 — *do not pay*. It reported 1 — *bad arguments*. **A lost record is
missing DATA; a wrong exit code is a wrong ANSWER**, and these scripts put their verdict there
deliberately (`audit-anchors` exits 5 meaningfully, `confirm-anchors` exits 4 on vacuity).

Fixed by a bounded `EAGAIN` retry plus an exit handler that swallows everything unconditionally: the
record is best-effort, the exit code is the verdict.

**The isolating test is what caught it.** A small run passed on the identical code and would have
been reported as proof.

## Still open, none blocking

- **stdout beyond the pipe buffer is still discarded.** Only the ledger line bypasses the queue;
  every `console.log` tail is lost at ~162KB, which is why `DOCUMENT_CHUNKS`' section never printed.
  Affects any operational script with large output. Fix direction: `process.exitCode = code` plus an
  explicit Prisma disconnect, letting the process end naturally so stdout flushes — not another
  synchronous write.
- **The committed integrity board is stale on `staging`** — generated from `6535948` while HEAD moved.
  There are no `.github/workflows`, so `integrity:check` is a local gate and blocks nothing.
- **No ledger check declares the runner `compareCandidateSources`**, so the emitted records have
  nowhere to land yet.
- **A dead pair guard in `rediffFromSnapshots.ts`** — the snapshot relations are required, so the
  branch cannot execute. Pre-existing; the same guard was removed from the new code by the
  `no-unnecessary-condition` ratchet.
- **One unexplained test failure** — 1 suite, 2 tests, immediately after new tests were appended,
  then 13 consecutive green runs including under identical piped conditions. Not reproduced, output
  not captured.

## Landed on `staging`

| PR | what |
|---|---|
| #263 | the `CandidateSource` axis and four arms |
| #264 | findings not candidates; set difference not count difference; `writeSync` |
| #265 | containment floor; three-way verdict; the outsider-check arm |
| #266 | a ledger line is never worth an exit code |

`2340 tests / 149 suites · tsc clean · lint 381 unchanged · both ratchets green · drift clean`
