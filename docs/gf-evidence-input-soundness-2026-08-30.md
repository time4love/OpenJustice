# The summary gate — `EVIDENCE_DIFF_INPUT_SOUND`, built and measured, 2026-08-30

**Bears on: Level 6, Level 9**

R3 Tier 2, item 1 of three. A findings record, not a plan. Every command below is read-only and was
run against **staging**, `CONFIRMED` on all four axes.

## What was built, and what it is NOT

Check 17 of the publication gate. Hard. For every cited evidence record derived from a diff, the
change that record reports must be one the archived documents support.

**It is a new CALLER of an existing rule, not a second copy of it.** That distinction decided the
design and is worth stating plainly, because the obvious reading of the task was the other one.

`UrlSnapshot.text` is the whole document derived from the anchored `document` bytes — not the
Readability extraction, which is `fullText`. `checkDiffSurvival` already tests every chunk marked
ADDED against the raw **before** document and every chunk marked REMOVED against the raw **after**
one. That is verbatim the rule the task described: *a chunk marked ADDED at B that is already present
in raw at A is not an addition.*

So re-fetching the Internet Archive to ask the same question would have produced two implementations
of *the definition of an unsound input* — this repository's dominant defect shape, in the one place
where drift between the copies would mean the platform disagreed with itself about what its corpus
contains. It would also have made a hard publication check fail whenever a free external service was
down.

**The two formulations are the same question.** An ADDED chunk exists precisely because the
EXTRACTION lacked it at the before capture; finding it in the raw document there IS the extraction
divergence at that boundary. The signal the 3-record sample separated the false summary by is
computable from stored state, with no model and no network.

**What was actually missing was a caller at the evidence layer.** Level 5 has refused to PROMOTE a
`CONTRADICTED` diff since its gate landed. `assessPublication` read `status`, `onChainTxHash` and
`evidenceTier`, and nothing asked whether the change a cited record reports happened. A record
promoted before that gate existed stayed citable, and a diff can go `CONTRADICTED` after promotion.

## The rule, and where it departs from the promotion gate

| diff state | check 17 | why |
|---|---|---|
| `SURVIVES` | passes, binding | the documents support the change |
| `CONTRADICTED` | **fails** | the documents refute it — the same sentence `promotionBlockFor` refuses with, borrowed rather than rewritten |
| `UNCHECKABLE` | **fails**, named apart | carries the row's own cause; the refusal must not send someone hunting for a contradiction that does not exist |
| `UNCHECKED` | **fails** | never checked is not supported |
| `STALE` | **fails** | the verdict is about inputs the row no longer holds |
| not diff-derived | passes, **NON-BINDING** | and the summary names `DOCUMENT` evidence as the class it cannot cover |

**Four of the five states fail, and only one of them is a refutation.** Promotion may proceed on an
unchecked diff, because unchecked is not refuted and refusing it would halt work over a question
nobody has asked yet. Publication may not, because publishing asserts the change in public. That is
the whole of the difference between the two gates and it is deliberate.

**The non-binding arm is a pass that must admit what it is.** Refusing a thesis for citing `DOCUMENT`
evidence would be wrong, so it passes — with `binding: false`, the same admission check 6 already
makes about the tier threshold, and the shape the integrity board demotes as `VACUOUS` when a check
hides it.

## Measurement 1 — the corpus can satisfy it

```bash
railway ssh --environment staging --service glass-fortress-backend \
  "cd apps/glass-fortress/backend && npm run forensics:audit-survival -- --env staging --verbose"
```

```
Diffs 109 · UNCHECKED 0 · STALE 0 · current 109
  SURVIVES 14 · CONTRADICTED 7 · UNCHECKABLE 88          exit 0
```

`UNCHECKED` and `STALE` are empty, so every diff carries a verdict computed against what it now
holds. **A check with no reachable passing state is worse than none**, and 14 diffs hold that state
today — plus every future diff-derived record, since promotion already refuses a refuted diff.

`UNCHECKABLE` at 81% looks alarming and is not the relevant denominator: it is dominated by
zero-chunk diffs, which report no change and therefore have nothing to be evidence *of*. The
denominator that decides how much this check bites is the evidence layer, below.

## Measurement 2 — the evidence layer, joined by hand

`search_evidence` (8 public records) against the audit above. Six of the seven diff-derived records
match exactly one diff by `afterDate`; `2022-09-06` was verified directly with `get_diff_input`.

| record | date | diff | survival | check 17 |
|---|---|---|---|---|
| `0x065403…` rtmag article | 2022-08-21 | — `DOCUMENT` | n/a | out of scope, non-binding |
| `0xf6e755…` mRNA mechanism removed | 2022-05-25 | 05-24 → 05-25 | `SURVIVES` | passes |
| `0x5cfa25…` | 2022-05-29 | 05-26 → 05-29 | `SURVIVES` | passes |
| `0x9b06b5…` | 2022-05-30 | 05-29 → 05-30 | `SURVIVES` | passes |
| `0x66acc9…` toddler chapter swap | 2022-08-05 | 07-24 → 08-05 *or* 08-05 → 08-05 | `CONTRADICTED` *or* `UNCHECKABLE` | **fails either way** |
| `0x751794…` **the false summary** | 2022-09-06 | 09-05 → 09-06 | **`CONTRADICTED`**, 3 of 118 chunks | **fails** |
| `0x088e50…` omicron text added | 2022-11-29 | 09-21 → 11-29 | `SURVIVES` | passes |
| `0x8b8147…` reporting link removed | 2025-06-01 | 04-25 → 06-01 | `SURVIVES` | passes |

**5 of 7 pass, 2 fail.** The check binds without being a wall.

### The design validation, reproduced by the mechanism

`gf-level-diagnostics-2026-08-30.md` sampled three summaries by hand against the raw archive and
found one false. Check 17 separates all three correctly, deterministically, from stored state:

| record | hand verdict | check 17 |
|---|---|---|
| `0xf6e755…` | **true** | `SURVIVES` |
| `0x088e50…` | **true** | `SURVIVES` |
| `0x751794…` | **FALSE** | `CONTRADICTED` |

The predictor of a false summary was never its prose. It is divergence on the changed text at a
boundary capture, and that is computable with no model.

## Three findings the measurement produced

**27 — a recorded figure is out of date, and the correction is not a repair.**
`gf-contradicted-diffs-back-anchored-evidence` records *"6 of 7 legacy CONTRADICTED diffs back
CONFIRMED, anchored evidence."* On staging today it is **2 of 7 evidence records**. The likely cause
is `rediffFromSnapshots`, which rewrites chunks and recomputes survival, so verdicts moved after the
note was written. **Not overwritten**: production is a different corpus (81 diffs, 8 evidence) and the
figure may still hold there. A figure measured on one environment and remembered without one is the
same shape as the environment-identity defects `environmentIdentity.ts` exists to end.

**28 — no read tool exposes an evidence record's `urlVersionDiffId`.** `0x66acc9…` sits on one of two
diffs sharing an `afterDate`, and nothing available could say which. It does not change the verdict —
both candidates fail check 17, one as refuted and one as unverifiable — so it is recorded rather than
chased. **This is the third instance in two days of a verdict-bearing column readable by no
instrument**, after `anchorCheck` (fixed) and `beforeSnapshotId`'s date (still open, and still why
Level 8's mechanism cannot be closed).

**29 — `get_diff_input` refuses an ambiguous address instead of guessing.** Asked for `afterDate`
`2022-08-05`, where two diffs end, it returned `status: AMBIGUOUS` with both candidates. Recorded as a
credit, not a defect: *a diff is the capture pair it spans, not the date pair*, and this is that rule
holding at a tool boundary where a convenient guess would have silently produced a wrong measurement.

## What this does NOT cover, said out loud

**`DOCUMENT` evidence gets no soundness check at all**, because it has no snapshot-derived input.
It is the least-covered class in the corpus and it is the one the thesis published on 2026-08-30
cites, so check 17 will report NON-BINDING against the live thesis and change nothing about it.
Level 7's clause 1 records the same asymmetry from the other side: `forensics:rehash-evidence`
selects `NOT: { urlVersionDiffId: null }` and examines 7 of 9 records.

The known-hard case from Level 7 is untouched and remains unsolved: the fabrication
`לתסמינים קלים וחולפים בלבד` carries no quotation marks, so quoted-span checking misses it. A content
n-gram check needs an explicit false-positive policy first — *a gate that cries wolf gets disabled.*

## Verification

```
tsc            clean
jest           152 suites / 2372 tests green   (was 151 / 2357)
lint ratchet   fails LOCALLY ONLY, on the drift the script itself predicts:
               no-unnecessary-type-assertion 4 -> 3. Zero new errors from this
               change; CI is the source of truth and the baseline is untouched.
```

**Proven to FAIL before landing, in both directions.** `evidenceInputSoundness.test.ts` asserts each
of the five states separately, including that `UNCHECKABLE`'s refusal does not contain the word
`CONTRADICTED`. `thesisPublication.test.ts` asserts the blocking at the hardest caller — and asserts
it against `publishThesis`, not only against the report, because a hard failure the write path did
not honour would be a check that only looked like a gate.

## Verified on the live surface

Landed as PR #277, `staging` `837f590`, deploy green. Then `check_publication_readiness` against the
published thesis `cmt5jffqy000lf52mn6t56f3l` — read-only, writes nothing.

**Every prediction stated before the run held.** Seventeen checks rather than sixteen, which is itself
the proof the deploy carries the change:

```
17  EVIDENCE_DIFF_INPUT_SOUND  hard · passed: true · binding: false
    "No cited record is derived from a diff — NON-BINDING: this check judges the
     archived documents behind diff-derived evidence, and there is none to judge.
     1 cited record(s) are not derived from a diff and are not covered here:
     DOCUMENT evidence has no snapshot-derived input and no soundness check at all."
```

The published thesis cites exactly one evidence record and it is the `DOCUMENT` one — which the
measurement above inferred, and the gate has now confirmed from its own query rather than from that
inference.

The run's only hard failure was `RATIONALE_SUBSTANCE`, an artefact of calling the tool with no
rationale, not a fact about the thesis. The published version was unchanged throughout; publication is
a pinned version and this tool writes nothing.

**Production does NOT have check 17**, and that is the intended state after a `LAND`. `master` is at
`9661206`; check 17 is one of nine commits `staging` is ahead by. Production holds 0 theses, so the
check would bind on nothing there today.

## Finding 30 — the MCP surface cannot enumerate theses

Every thesis tool requires a `thesisId` — `get_thesis_context`, `check_publication_readiness`,
`get_research_agenda`, `get_whistleblower_call`, `audit_thesis_claims`. None lists them, and staging's
HTTP API refuses without `x-staging-token`. **The id used above was recoverable only because R1
happened to record it in `gf-published-thesis-fda-claim-2026-08-30.md`.** A researcher returning to a
thesis they know exists cannot address it through the tools at all.

Third instance in two days of a thing the platform holds that no instrument can reach, after
`anchorCheck` (fixed) and `beforeSnapshotId`'s date (open). The shape is worth naming because the
other two were found by needing them; this one was found by needing it too. **An investigation tool
that cannot name its own subject is not yet a tool** — [[gf-investigation-tools-must-be-mcp]] one step
earlier in the sequence.
