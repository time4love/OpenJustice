# Breadth-first level diagnostics, 2026-08-30

**Bears on: Level 7, Level 8, Level 9, Level 10**

A findings record, not a plan. The plan holds decisions and level status; this holds what was measured
and how to reproduce it. Every command below is read-only and was run against **staging**.

## Level 7 — the evidence

### Clause 1: identity is recomputable from its captures — HOLDS, for what the instrument covers

```bash
railway ssh --environment staging --service glass-fortress-backend \
  "cd apps/glass-fortress/backend && npm run forensics:rehash-evidence -- --env staging"
```

Dry run is the default; the early return at `rehashEvidence.ts:119` sits above every chain call and
both `prisma.update` calls, so nothing is written and `web3` is not even constructed.

```
examined:        7
rehashed:        0 (dry run)
already current: 7
failed:          0            exit 0
```

**The plan's "5 of 7 anchored records were unrecomputable on 2026-08-23" no longer describes staging.**
It is now 0 of 7. That was fixed at some point and the plan never caught up.

**But the instrument's scope is narrower than the invariant's.** `src/services/rehashEvidence.ts:53`:

```ts
where: { NOT: { urlVersionDiffId: null } }
```

Only diff-derived evidence is selected. Staging holds 9 evidence records; 7 were examined. **`DOCUMENT`
evidence has no snapshot-derived identity and no recomputability check at all** — and that is the class
the thesis published on 2026-08-30 cites (`0x06540303…`, the Shir-Raz report). The least-covered record
in the corpus is the published one.

### Clause 2: a summary attributes nothing the page does not contain — NOT TESTED

No instrument exists (`ledger.json` → `evidence-recomputable`: `command: null`, `lastRun: null`), so
the change each summary asserts was sampled by hand against the raw archive at both boundary captures.

| record | summary asserts | before | after | verdict |
|---|---|---|---|---|
| `0xf6e755b5…` | mRNA mechanism text **removed** 2022-05-25 | `שעות עד ימים` present 03-06 | absent 05-25 | **true** |
| `0x088e501e…` | omicron text **added** 2022-11-29 | `צפוי לתת הגנה רחבה יותר` absent 09-21 | present 11-29 | **true** |
| `0x7517…` | safety presentation **added** 2022-09-06 | present in raw throughout | — | **FALSE** |

**1 of 3 sampled summaries asserts a change the raw archive contradicts.**

**And the sample validates the proposed gate (finding 1).** The two true summaries show **no
`EXTRACTION_DIVERGENCE` at either boundary**; the false one is precisely where divergence occurred. The
predictor of a false summary is not its prose — it is divergence on the changed text at a boundary
capture, which is computable with no model. The gate does not need to judge a summary; it needs to
flag a record derived from an input known to be blind at the text it describes. Three records, and the
rule separates them correctly.

## Level 9 — the thesis

### The invariant as written is currently UNSATISFIABLE on staging

```bash
railway ssh --environment staging --service glass-fortress-backend \
  "cd apps/glass-fortress/backend && npm run forensics:audit-anchors -- --env staging --verbose"
```

```
VERIFIED        7   (all URL_SNAPSHOT)
UNCHECKED       0
STALE           0
MISATTESTING   22
UNATTRIBUTED   91          exit 5, 14s
```

**All 8 anchored EVIDENCE records read `UNATTRIBUTED`. None is `VERIFIED`.** So *"a thesis cites nothing
that is not VERIFIED"* cannot be satisfied by any thesis on staging, however carefully assembled.

Why, established by the falsifiable check:

```bash
railway ssh --environment staging --service glass-fortress-backend \
  "cd apps/glass-fortress/backend && npm run forensics:confirm-anchors -- --env staging --recheck"
```

```
examined:                    120
confirmed (receipt):          29
no receipt, hash registered:  91
MISANCHORED / REGISTERED BY ANOTHER TX / ANCHORED NOTHING / NO TRACE:  0 0 0 0
exit 3, 2m35s
```

> The registry DOES hold this hash, so the fact is anchored on this chain. No `EvidenceSubmitted` log
> sits in the surrounding blocks. Recorded as **`TX_UNREADABLE`: terminal, honest, and not a
> confirmation.**

**Nothing is wrong.** Every hash is genuinely registered on Base Sepolia. Only the *attribution* — which
transaction registered it — is lost, and it is lost permanently: the receipts are past the endpoint's
horizon. Acting sooner would not have helped. This is the same conclusion `CLAUDE.md` already records
for production's 91, reached independently for staging.

**Consequence for planning:** do not plan Level 9 as *"make theses cite VERIFIED evidence"*. Until
Level 10 supersedes the corpus with records anchored under the current rule and confirmed promptly,
no thesis can comply.

## Findings

**16 — publication check 5 gates on `CONFIRMED and anchored`; the invariant says `VERIFIED`.** Different
things. A record can be `CONFIRMED`, registered, carry a tx hash, and still be `UNATTRIBUTED` or
`MISATTESTING`. Check 5 never reads the audit verdict.

**17 — MCP research acts record nothing to the ledger.** Records reach it only through
`runOperationalScript`. `publish_thesis`, `add_thesis_version`, `run_ai_analysis`, `verify_claim_text`
route nowhere near it, so **publishing a thesis — the act Level 9 is about — is invisible to the
integrity board**. An argument for the live-API design decided in the plan §3.

**18 — `check_on_chain_status` cannot ask the question that fails.** `onChainVerdict.ts:178`:

```ts
if (claim.status === 'CONFIRMED') {
  if (!registered) return UNANCHORED_CONFIRMED;
  return claim.txHash ? CONSISTENT : MISSING_TX_HASH;
}
```

`CONSISTENT` means *the hash is registered somewhere and the row has some tx hash*. It never asks
whether **that** transaction registered **that** hash. On 2026-08-30 it returned `CONSISTENT` for
`0x06540303…` with the explanation *"This record can be cited as on-chain evidence"* — a record the
audit calls `UNATTRIBUTED`. **This is the tool the MCP surface instructs researchers to call before and
after every promotion.** `confirmAnchors.ts`'s own header states the distinction it is missing.

**19 — a thesis published 2026-08-30 cites an `UNATTRIBUTED` record**, at 16/16 hard checks, zero
advisory failures, assessor `SUPPORTS`. Not carelessness — see 21.

**20 — `confirm-anchors` silently drops 91 subjects, and the audit sends you there for exactly those
91.** `confirmAnchors.ts:245,250` skip on `anchorCheck: null`; lines 601–602 report *"already carried a
verdict"* by counting `anchoredHash`. **Different columns.** Rows with a check but no attested hash fall
into neither bucket: not examined, not counted, not mentioned. The run reported `examined: 0` and exited
4 without disclosing 91 skipped. Its remedy text is wrong twice over — without `--recheck` the command
examines nothing, and with it the outcome is a terminal verdict rather than a fix.

**21 — Level 9's invariant is unsatisfiable on staging** (above). The ceiling, not the floor.

**22 — recomputability covers only `FORENSIC_DIFF`** (above). `DOCUMENT` evidence has no check.

**23 — the plan's "5 of 7 unrecomputable" is stale**; staging reads 0 of 7 (above).

## Also observed

- **`forensics:rehash-evidence` has no declared check in the ledger**, so its run has nowhere to land —
  the same gap already recorded for `compareCandidateSources`.
- The four runs on this date were emitted as `INTEGRITY-LEDGER-RECORD` blocks on stdout and transcribed
  by hand into `ledger.json`. That transport is what plan §3 decided to remove.
- The deployment ran commit `20eccf9` while `staging` was three docs-only commits ahead. Correct: docs
  commits do not redeploy.


## Level 8 — the opinions

`get_forensic_timeline` on the MOH URL, 81 diffs over 83 stored snapshots. Per-diff fields:

```
addedItems · afterDate · aiSignificance · beforeDate · classificationInput
deletedItems · id · isLegallySignificant · snapshotUrl · survival
```

**No evidence linkage — confirmed.** Ten fields and none reaches `Evidence`. The tool reports that a
legally significant change occurred while staying silent on whether anything anchored backs it.

**Model judgement mixed with computed fact — confirmed, as a data shape.** `aiSignificance` (prose) and
`isLegallySignificant` (a model's verdict) sit in the same flat row, at the same visual weight, as
`addedItems` / `deletedItems`, which are computed. The invariant fails in the schema, not in a sentence.

**The boundary defect reproduces here, not only on the news page.**

```
id 0bf82551-…   beforeDate 2024-08-29   afterDate 2025-01-11
                snapshotUrl → …/20250111140058/…   (the AFTER capture)
```

`list_captures` over 2024-03-01 → 2024-09-05 reports **5 captures in the archive, 1 stored**, and
`storedNotInArchiveIndex: 0`. The corpus holds no 2024-08-29 capture; the last stored capture before
2025-01-11 is **2024-03-05**. The displayed boundary implies ~135 days where the archive supports ~312
— **overstating precision by about 177 days**, in the direction that reads as more certainty.

Three of the five captures in that hole carry a digest identical to 2024-03-05, so the page genuinely
did not change; the 2024-08-29 capture is a **404**.

**The mechanism cannot be closed with current tools.** Whether `beforeDate` disagrees with
`beforeSnapshotId`, or a capture was stored that `list_captures` cannot see, needs `beforeSnapshotId`'s
date — which no tool exposes. The plan records the same limitation. **Exposing it is part of the fix.**

Not tested: `classifierDraws` null on older rows — this tool does not expose it.

## Level 10 — supersede the old corpus

No measurement needed; it is a decision document. Today changed its position, not its content.

- **The 91 are measured rather than assumed**, and recording them as `TX_UNREADABLE` is what makes them
  *explained-as-unattributable* rather than silently unknown. L10's own argument is that an unexplained
  anchor is indistinguishable from a tampered one, so `confirm-anchors --apply` is a **precondition for
  supersession**, not tidy-up.
- **L10 is promoted from tidy-up to load-bearing.** With Level 9 unsatisfiable, supersession is the only
  route by which any thesis can ever cite `VERIFIED` evidence.
- **Neither standing decision is contradicted.** The terminal verdicts strengthen reason 6: an
  append-only log containing its own corrections is more credible than a clean one.

## The ranked list

### Tier 1 — misleads a researcher now, or blocks the published surface

1. **`confirm-anchors --apply`** — record the 91 as `TX_UNREADABLE`. Cheap, honest, precondition for L10.
2. **Finding 18 — `check_on_chain_status` cannot ask the failing question.** The promotion-time trust
   callsite; it called an `UNATTRIBUTED` record citable an hour after one was published.
3. **Finding 16 — check 5 gates `CONFIRMED+anchored`, not `VERIFIED`.** The correct fix makes today's
   published thesis unpublishable, which is right — so it follows L10, or lands as advisory now.

### Tier 2 — prevents the class that produced the false claim

4. **Finding 1 — `EVIDENCE_DIFF_INPUT_SOUND`**, validated by the 3-record sample above. One rule, two
   callers: it is also Level 6's unenforced flip invariant.
5. **Finding 12 — the Prosecutor agent.** Addresses the bias that decides what a thesis says.
6. **Finding 11 — rationale containment.** Three exhibits in one afternoon.

### Tier 3 — instruments that mislead quietly

7. Finding 20 · 8. Finding 9 · 9. the L8 boundary defect, plus exposing `beforeSnapshotId`'s date ·
10. Finding 22.

### Tier 4 — decided, sequenced

11. the live integrity dashboard (plan §3; "after R2" is now) · 12. **L10 supersession — the
researcher's** · 13. 6.2h/6.2c.

**On 13, the sequencing constraint has CHANGED.** It was deferred because Level 7 recorded 5 of 7
records unrecomputable; that is now 0 of 7 and **that reason is gone**. A different one replaces it: a
`DETECTION_VERSION` bump recomputes every trajectory, and the thesis published 2026-08-30 cites **15**
of them, so recomputation would move `TRAJECTORIES_CURRENT` on a live public artefact. Not a blocker —
a fact that did not exist this morning.
