# Document step 27 — the chain-rotation read, STAGING (2026-09-23)

**Bears on:** `docs/gf-document-refactor-plan.md` step 27 :122–:128 — the read that *"is the precondition
every later step inherits: no step below runs on an environment whose read is not on record, and a read
that names the old registry ends the step."* Taken 2026-09-23, three steps after the plan asked for it;
steps 28, 29a and 29b had run without it.

> **THE READ PASSES ON ALL THREE LEGS.** Staging's deployed service is configured with the rotated-TO
> registry, a contract exists at it, and index 0 carries the anchor scheme. **`WRITES_ALLOWED` is true.**
> Nothing below step 27 is blocked by this read. **Production's read is NOT taken here** — it is taken at
> `SHIP`, the same way (plan :128, §6 :466).

---

## 1. What the plan requires, and what was measured

`get_environment` names the new registry's address · `eth_getCode` at it is not `0x` · `totalEvidence()`
is 0 **or** index 0's category is `ANCHOR_SCHEME` (plan :122–:124).

| leg | required | measured | |
|---|---|---|---|
| the configuration | the service names the new registry | `registry 0xDA3B858CA9CC3F1C5cE60Bb4D343bC6E58aa4C73` | ✓ |
| the code | `eth_getCode` ≠ `0x` | **2,799 bytes** | ✓ |
| index 0 | `totalEvidence()` = 0 **or** index 0's category = `ANCHOR_SCHEME` | `totalEvidence()` = **27**; index 0 category = **`DOCUMENT_SHA256`** | ✓ on the second arm |
| `WRITES_ALLOWED` (evidence A3 :1050) | — | **true** | ✓ |

**`ANCHOR_SCHEME`'s VALUE is `'DOCUMENT_SHA256'`** — `src/lib/anchoredCaptureHash.ts` :59. The plan's
:124 names the CONSTANT; the chain carries its value. A read that compares against the constant's NAME
reports a false failure, and this one did before it was corrected (§4).

Index 0: `fileHash 0x33c7a74d…04077a`, submitter `0x9de2e74b…989a28`, block time
**2026-09-06T15:24:16Z** — the walk's first anchor after the rotation, consistent with
`docs/gf-walk-step-5-exercise-2026-09-06.md`.

## 2. Two independent instruments, and they agree

The read was taken TWICE, by different paths, deliberately — a single instrument agreeing with itself is
not a second witness.

- **From a laptop, against the PUBLIC Base Sepolia RPC** (`https://sepolia.base.org`), with no credential
  and with no address or endpoint taken from this repository's configuration. It answers only *what is at
  an address*. RPC-reported chain id **84532**.
- **In the STAGING DEPLOYMENT**, environment stated twice:
  `railway ssh --environment staging --service glass-fortress-backend "cd apps/glass-fortress/backend && npm run forensics:read-registry -- --env staging"`,
  exit **0**, at commit `d2ad10f`. It answers *which address the service will write to* — the leg the
  chain read cannot reach, and the one that matters.

Both returned the same address, the same `totalEvidence()` of 27, the same index 0 category and the same
index 0 `fileHash`. The container's run additionally reported `environment staging — agreed by Railway,
APP_ENV, the database and the chain`: all four axes of `assertOperationalContext` concur.

**The container's own classification of every entry:** `DOCUMENT_HASH` **27**, `UNEXPLAINED` **0**;
attribution `ATTRIBUTED` **27**, `FOREIGN_SUBMITTER` **0**, `UNREGISTERED` **0**. `totalEvidence()` was
re-read after every index and did not move during the pass.

**Staging serves `d2ad10f`, not `staging`'s head.** `06cddf9` (PR #574, docs only) deployed SKIPPED on
both services because no watched path changed. That is expected and is not a finding; it is recorded so a
later reader does not take the deployed commit for the branch head.

## 3. The rotated-FROM registry, read for contrast

`0x65b9a7acb45aa05e7ed207844f93a2b308373853` — code present, `totalEvidence()` **44**, index 0 category
`"ACCOUNTABILITY_EROSION,INFORMED_CONSENT,SAFETY_CLAIM_ALTERATION,STATISTICAL_MANIPULATION,WITHHOLDING_INFORMATION"`
— the RETIRED formula `gf-document-flows.md` §4 :484 describes, the classifier's category list as the
label. **`WRITES_ALLOWED` on it is FALSE.** Its ledger is committed at
`apps/glass-fortress/backend/registry-ledger/84532-0x65b9….json`.

**What that does and does not mean.** The guard WOULD refuse a write to this particular old contract — so
the reviewing seat's earlier claim that *"`WRITES_ALLOWED` would pass on the old contract just as happily
as on the new one"* was **wrong, and is corrected here**. It was reasoned from *"a registry of the same
design"* rather than read.

**The read is still necessary, for the narrower and correct reason.** `WRITES_ALLOWED` can only evaluate
the registry the CONFIGURATION POINTS AT; it cannot say whether the configuration points at the right
contract. A third contract, or a redeployment carrying the scheme at index 0, passes the guard. That is
why plan §1 :40 calls it *"the net"* and not the protection, and why :124 requires a READ ON RECORD rather
than a guard that might fire.

## 4. The seat's own instrument was wrong first, and it is recorded

The laptop read's first run compared index 0's category against the LITERAL STRING `'ANCHOR_SCHEME'` and
printed `WRITES_ALLOWED false` on the staging registry — **a false alarm on the one question the read
exists to answer.** It was caught by reading the constant's enclosing unit before the failure was
reported, and the read was re-run importing `ANCHOR_SCHEME` itself.

Recorded because the lesson is not about this script: **a read that comes back FAILING is exactly the
moment a seat must check its own instrument**, and a seat that reports the failure first has spent the
researcher's attention on its own defect. It is the same shape as
`gf-a-control-proves-it-ran-not-that-it-sees`, one level over — there a grep that could not see, here a
comparison against a name instead of a value.

## 5. What this read does NOT establish

- **Production.** Untouched. Its read is taken at `SHIP`, first, and recorded the same way (plan :128,
  §6 :466). `master` is `4a4071a` and nothing of the document layer has shipped.
- **That any document has been anchored.** No `DOCUMENT_COMMITMENT` entry exists on staging and none can
  until step 31 builds the second caller; every entry today is the walk's `DOCUMENT_SHA256`.
- **That the registry will still be correct later.** The read is an observation with its moment, like
  every other in this design. A rotation after this date needs its own read.
