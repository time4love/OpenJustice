# Breadth-first level diagnostics, 2026-08-30

**Bears on: Level 7, Level 9**

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

No instrument exists (`ledger.json` → `evidence-recomputable`: `command: null`, `lastRun: null`). One
confirmed failure is on record from the same day: `0x7517…` asserts a safety presentation was *added*
on 2022-09-06 when the raw archive shows it present throughout — see
`gf-published-thesis-fda-claim-2026-08-30.md`. A sampled measurement over more records was begun and
is unfinished: `שעות עד ימים` is present in raw **and** extraction at both 2022-03-06 captures.

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
