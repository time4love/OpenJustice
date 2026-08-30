# 105 false anchor verdicts on staging — 2026-08-30

**Contained to staging. No chain writes. No evidence, capture, snapshot or anchor was altered. Fully
repaired the same session, by recomputation from the chain, and verified by an independent read.**

Recorded because the failure is a *general* shape this repository keeps meeting, not a one-off, and
because the version of it that occurred here was created by a correct fix.

## What happened

Level 3 clause 1 moved the anchoring rule: `anchoredCaptureHash` began returning `documentHash`
instead of `contentHash`. The first `forensics:confirm-anchors --apply` after the flip wrote, into
staging:

| rows | verdict written | the truth |
|---|---|---|
| 83 captures | `NO_TRACE_ON_CHAIN` — the most serious verdict the check has | anchored correctly under the superseded rule; the registry holds every one of their hashes |
| 22 captures | `MISANCHORED` | same |
| 8 evidence | `TX_UNREADABLE` | correct — evidence identity had not moved |

## Root cause

"Which hash does this row's anchor relate to" lived in **two** places:

- `attestationOf` (the audit) — **three-way**: attests the current rule, a superseded rule, or none
- `confirmAnchors`'s comparison — **two-way**: matches the current rule's hash, or does not

The three-way answer had been built deliberately, days earlier, precisely so that an anchor made under
a superseded rule would not read as a custody incident. **It was not carried to the second site.**

Both were defensible in isolation, and nothing was wrong until the rule moved. **The divergence was
created by improving one of them** — and the improvement felt like the fix, which is what made the gap
invisible.

## The repair, and why it is a separation rather than a copy

Duplicating `attestationOf` into the confirming pass would have produced a third implementation. The
two sites were instead given **different questions**:

| | asks | answers with |
|---|---|---|
| `confirmAnchors` | *what did this transaction register?* | an observation of the chain |
| `attestationOf` (audit) | *is that the hash the rule names?* | current / superseded / unrecognised |

So "confirmed" means *the transaction registered a hash this subject genuinely has*, and a
superseded-rule anchor is **confirmed** by the pass **and** `MISATTESTING` in the audit. Both true,
neither contradicting the other, and the second is what stops it passing.

**It needed no new enum value, and that is the evidence the split is real** rather than cosmetic. A
verdict that has to name the rule it was judged against is a verdict doing the audit's job.

## Three secondary defects the incident exposed

1. **The filter made the damage unreachable.** Subjects were selected on `anchoredHash IS NULL`, which
   re-examined terminal `TX_UNREADABLE` rows forever *and* skipped the 22 rows that had recorded a
   hash. A terminal verdict — not a recorded hash — is what marks a subject done; `--recheck`
   overrides it, and without that flag the wrong verdicts could not have been corrected at all.
2. **The audit's summary omitted a state.** `MISATTESTING` was added to the model and the exit code and
   forgotten in the printed block, so a run showed `8 VERIFIED + 83 STALE` against `113 subjects` and
   22 rows were absent from the only place a human reads. The block is now derived from a
   `Record<AnchorCheckState, string>` — the compiler requires an entry — and it asserts that the states
   account for every subject.
3. **The audit guessed a hash for unobserved anchors**, falling back to the current rule. Sound until
   the rule moved; afterwards 91 subjects were judged against a hash nothing had registered. They
   surfaced as `STALE`, whose documented remedy is to re-check — and the re-check would have minted a
   confident `SNAPSHOT_UNANCHORED` about correctly anchored captures. See *findings that heal
   themselves*, below.

## Lessons

- **Fixing one implementation of a duplicated rule is itself the divergence event.** After fixing a
  rule, grep for the *rule*, not for the bug.
- **A finding whose remedy is "re-run the check" can be laundered into a permanent pass.** Classify by
  properties of the SUBJECT before properties of the CHECK; a subject's attestation does not depend on
  whether a verdict exists.
- **There is no safe abort for an operational write.** Killing a local `railway ssh` client does not
  stop the remote — it kept writing while the local log froze, and that was established only by
  re-reading the database and watching counts still move. The dry run is the control; there is nothing
  after it.
- **A summary an operator reads to decide must not be corruptible.** Detail on stderr and summary on
  stdout interleaved mid-line under `> log 2>&1` and destroyed a count. One string, one write, one
  stream — and a self-check that the parts sum to the whole.

## Verification of the repair

`--apply --recheck` on staging, predicted line by line by a dry run beforehand, then read back
independently from the database:

```
UrlSnapshot   22 CONFIRMED_BY_RECEIPT (carrying their contentHash) · 83 TX_UNREADABLE
Evidence       8 TX_UNREADABLE
attestation   22 attests SUPERSEDED · 0 misanchored · 0 no-trace
```

Production was never affected: `confirm-anchors` had not run there, and the fix landed before the
ship. Its own first run came back **91 of 91 confirmed, exit 0**.
