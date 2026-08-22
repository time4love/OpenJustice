# Glass Fortress — Researcher Playbook

How a real legal thesis is built from nothing, using only the MCP research tools.

This document is a **live transcript**, written as each call is made — not reconstructed
afterwards. It doubles as the procedure a researcher follows in production and as the
source of integration-test fixtures.

## Recording convention

**Requests are recorded verbatim. Responses are recorded as structure only** — field
names, types, enum values, counts, and status transitions. Never the prose.

Three reasons, all binding:

1. This repository is **public**, and tool responses contain AI-generated allegations
   naming real, living officials. See `defamation-risk.md`.
2. LLM prose is non-deterministic, so a fixture asserting on it tests nothing. Assert on
   the **contract** — zod validity, citation-footnote integrity, tier assignment,
   suppression thresholds.
3. A reader learning the workflow needs the shape of the exchange, not one investigation's
   conclusions.

## Session protocol

| Rule | Why |
|---|---|
| One MCP call at a time; state tool, args, what it writes, and reversibility before calling | The irreversible steps are irreversible |
| All mutation goes through MCP — no SQL, no Prisma script, no dashboard click | This is the researcher's real path; anything else proves nothing about it |
| A missing tool is a **finding**, and gets built | A workflow that needs a side channel is not a workflow |
| Verify the environment before the first write | A write that lands in the wrong database is not recoverable by apology |
| No destructive database work, ever, in a session doing anything else | `docs/gf-staging-data-loss-postmortem-2026-08-21.md` |

---

## Step 0 — Prove the write path, and prove the environment

Two questions must be answered before any real work, and neither is answered by a read.

**Reads prove nothing about authentication.** Glass Fortress serves its read tools
anonymously by design, so `search_evidence` succeeding tells you only that the server is
up. The definitive liveness check is a **write, from the client that will do the work**.

The first real step of the workflow doubles as that check, which is why it is first: it is
idempotent, it writes a single `PENDING_REVIEW` row, it touches no blockchain, and it is
reversible via `delete_evidence`.

### Request

```
create_evidence_from_url
  url: "https://rtmag.co.il/health/the-israeli-moh-hid-alarming-findings-from-a-study-on-the-covid-19-vaccine-side-effects-that-the-ministry-itself-ordered"
```

### Response — structure

| Field | Type | Value / shape |
|---|---|---|
| `evidenceId` | uuid | — |
| `fileHash` | `0x` + 64 hex | SHA-256 of the fetched content |
| `status` | enum | `PENDING_REVIEW` |
| `summary` | string (Hebrew) | AI intake analysis — withheld |
| `evidenceTier` | enum | `Tier 2: Material` |
| `evidenceRole` | enum | `Incriminating` |
| `investigativeCategories` | enum[] | 5 entries |
| `targetEntity` | string | a ministry |
| `evidenceDate` | ISO date | parsed from the article, not the fetch time |
| `keyFigures` | string[] | 3 entries — withheld |
| `sourceUrl` | uri | echoes the request |
| `message` | string | states the row is not public and not on-chain |

### What it wrote

One `Evidence` row, `PENDING_REVIEW`. Not in the public vault, not in the vector index,
not on-chain. Promotion is a separate, deliberate, human decision.

### FINDING 1 — the response does not identify its environment

The write succeeded, proving the connector is authenticated. It does **not** reveal which
database received it, and no field in the response would have. A researcher with both a
staging and a production connector cannot tell from the response which one they just
wrote to.

Verified out-of-band instead, read-only, by querying production for the returned
`fileHash`. **The naive form of that query is unsound**, and the sound form is the
procedure — see the correction below.

That this required a database query at all is the finding. The environment should be
legible from the tool response.

#### The correction — a negative is only evidence if you know what a positive looks like

The check as first written was:

```sql
SELECT count(*) FROM "Evidence" WHERE "fileHash" = '0x0654…c262';   -- 0 ⇒ staging
```

`0` was read as "the row is not in production, therefore it landed in staging." That
inference holds only while production holds **different** data. It fails silently against
a production database that is empty, or a wrong schema, or a table name that no longer
exists, or a query that errored and returned nothing — every one of which also answers
`0`. Re-running the check in a later session found exactly that: production's `Evidence`
table held **zero rows of any kind**, so the discriminator was returning the right answer
for no reason.

The sound form reads a **control column in the same query** — something that must be
non-zero if the connection is real and the query is well-formed:

```sql
SELECT (SELECT count(*) FROM "Evidence")                              AS evidence_total,
       (SELECT count(*) FROM "Evidence" WHERE "fileHash" IN (…hashes…)) AS matching,
       (SELECT count(*) FROM "UrlVersionDiff")                        AS diffs_total,
       (SELECT count(*) FROM "Thesis")                                AS thesis_total;
```

Now the two failure modes separate:

| `evidence_total` | `matching` | Reading |
|---|---|---|
| > 0 | 0 | Production is populated and does not hold these hashes — **staging confirmed** |
| 0 | 0 | Production is empty; the check proves the schema resolves but discriminates nothing on its own |
| > 0 | > 0 | **Stop.** The connector may be pointed at production |
| *error* | — | The check did not run; do not read it as a negative |

Pass **more than one hash**, so a single mistyped literal cannot manufacture a false
negative. And record which reading you got, not just the verdict: "0 of 3, against 0 total"
is a materially weaker statement than "0 of 3, against 412 total", and only the second one
identifies the environment by itself.

This correction is FINDING 21, found by re-running Step 0 cold in a later session. It is
written back here because the defective query was the *procedure*, and a procedure is
where a fix belongs.

---

## Step 1 — Two tools the workflow needs and did not have

Both gaps were found by trying to walk the researcher's path, not by reading the
tool list. Neither is a nice-to-have: one guards the only irreversible step in the
workflow, the other is the workflow's public output.

### FINDING 2 — nothing reachable from MCP could check the blockchain

`promote_evidence` is irreversible: it registers the file hash on-chain and sets
`CONFIRMED`, the platform's strongest evidentiary claim. Before this session there
was no tool to ask the contract whether a hash was *already* registered, and none
to confirm afterwards that the anchor actually landed.

That absence has a measured cost. A 2026-08-20 audit found **5 of 7 staging Evidence
rows marked `CONFIRMED` with no matching on-chain registration** — rows asserting a
proof that did not exist, undetected for two months. A record that merely looks
verified is worse than an unpromoted one.

New tool: **`check_on_chain_status`** — reads the database and the contract and
returns a verdict naming the discrepancy.

| Verdict | Meaning |
|---|---|
| `CONSISTENT` | Confirmed, registered, transaction recorded. Citable. |
| `UNANCHORED_CONFIRMED` | Claims `CONFIRMED`; the contract has never seen the hash. |
| `MISSING_TX_HASH` | Registered, but no transaction recorded — the anchor cannot be cited. |
| `PENDING_UNREGISTERED` | The only state in which promotion is safe. |
| `PENDING_BUT_ANCHORED` | Already anchored while still pending — promotion would revert. |
| `NOT_IN_VAULT` | No record; the chain answer is still reported, to identify orphaned anchors. |

An unreachable RPC returns `CHAIN_UNAVAILABLE`, never `registered: false`. A
configuration failure reported as a definitive negative would license exactly the
duplicate promotion the tool exists to prevent.

### FINDING 3 — the Call for Whistleblowers is derived, not stored

The session plan called for a tool to *create* the call. Reading the implementation
first showed there is nothing to create: the public page renders one appeal per
entry in the head version's `evidenceGaps[]`, so the call exists the moment an
analysis completes with at least one gap. `POST /api/thesis/:id/gaps/:i/whistleblower`
is the **inbound** path — where a whistleblower uploads encrypted documents against
a gap — not where the call is published.

A `create_whistleblower_call` write tool would have been a fabricated write against
a derived view.

The real gap is narrower and is a read: a researcher working through MCP had no way
to see that the call existed, what it asked for, or its URL.

New tool: **`get_whistleblower_call`** — returns the shareable URL, whether the call
is live (and if not, why: `NO_HEAD_VERSION`, `ANALYSIS_INCOMPLETE`, `NO_GAPS`), the
current strength, and every gap with its `gapIndex` — the same index
`generate_foia_request` takes, so one appeal and one FOIA request address the same
hole in the argument.

A malformed stored analysis returns `ANALYSIS_SHAPE_INVALID` rather than an empty
call, because "nothing to ask for" and "the analysis is broken" look identical to a
reader and mean opposite things.

### Classification

`get_whistleblower_call` is **open** — it derives from data the public thesis
endpoint already serves anonymously, with no LLM and no RPC call. Gating it would
hide a deliberately public page from the tool that describes it.

`check_on_chain_status` is **gated**, despite being semantically a read: every call
hits the chain RPC and `recoverTxHash: true` issues a bounded log scan, so an
anonymous caller could drain the project's RPC quota. Same exposure that gated
`suggest_thesis` and `get_research_agenda`.

Both are covered by `mcpToolClassification.test.ts`, which fails if a registered
tool is in neither set or in both.

**Tests:** 878 passing, including 18 new — every verdict branch above, and the
derivation conditions for the call.

### Deploy verification

The staging deploy of both tools reported `SUCCESS`, and the public MCP inventory
confirms the classification landed as intended — 6 read tools, 17 write tools, with
`get_whistleblower_call` open and `check_on_chain_status` gated.

Confirmed live end-to-end by calling the open tool anonymously over the MCP endpoint
with a thesis id that does not exist:

```json
{"error": "No thesis found with id: \"probe-nonexistent\""}
```

A correct answer to a wrong question — the tool is deployed, routed, and executing.

### FINDING 4 — a tool deployed mid-session is invisible to the session that built it

MCP negotiates its tool list when the client connects. A tool deployed afterwards does
not appear in an existing session, however healthy the deploy: the server advertises it,
and the connected client never asks again.

The consequence is procedural, and it belongs at the top of any researcher's checklist:

> **Deploy tooling before opening the research session, never during it.**

A researcher who discovers a missing tool mid-investigation cannot build it and keep
working. They must build it, deploy it, and reconnect — and reconnecting means
re-authorizing, since each client holds its own token.

This is also why the workflow's gated tools should be exercised *early*. An expired
authorization surfaces at the first gated call. Discovering that at
`check_on_chain_status`, one step before promotion, is recoverable; discovering it
mid-promotion is not.

---

## Step 2 — The pre-promotion check, and what it caught

### Request

```
check_on_chain_status
  fileHash: "0x0654…c262"
```

### Response

Not a verdict. A raw ethers exception:

```
missing revert data (action="call", ..., code=CALL_EXCEPTION)
```

The gated tool authenticated and executed — so the OAuth path is confirmed working for a
write-classified tool. Everything after that failed, and the failure was worth more than
the verdict would have been.

### FINDING 5 — the tool leaked an unstructured error where it promised a verdict

`check_on_chain_status` guards its *constructor* against a missing RPC configuration and
returns `CHAIN_UNAVAILABLE`. It does not guard the contract **call**. So a chain that is
configured but unreachable escapes as a raw ethers exception instead of the structured
answer the tool exists to give.

This is the same defect the tool's own design note warns about, one layer down. A caller
seeing `CALL_EXCEPTION` has no way to tell "the hash is absent" from "the question was
never asked" — and those license opposite decisions about an irreversible write.

Shipped by the session that built the tool, found by the first real call against real
infrastructure. Reading the code would not have surfaced it; only a flaky endpoint did.

### FINDING 6 — staging anchors evidence through an unauthenticated public RPC

Diagnosing Finding 5 meant asking whether the contract was even there. It is:

| Check | Result |
|---|---|
| `eth_getCode` at the registry address | 2,799 bytes — deployed |
| `isRegistered` selector `0x27258b22` in bytecode | present |
| `sepolia.base.org` (staging's configured `RPC_URL`) | `no backend is currently healthy to serve traffic` |
| `base-sepolia-rpc.publicnode.com` | responded correctly |

The contract and the ABI were never the problem. Staging's `RPC_URL` is
`https://sepolia.base.org` — an unauthenticated public endpoint with no availability
guarantee, and every on-chain operation depends on it, including `promote_evidence`.

**This blocks promotion, and the reason is not "it might fail".** A read that fails is
harmless — you retry. `promote_evidence` sends a transaction. If it fails *after*
broadcast, the anchor may exist on-chain while the database records no transaction hash:
the `MISSING_TX_HASH` state, reached by accident, on the exact record this session is
building as a reference example. Anchoring evidence through an endpoint that answers
"no backend is currently healthy" is how integrity gaps get created rather than caught.

### The substantive answer

Asked through a healthy endpoint, the contract's answer is unambiguous:

```
registered: false | registryEvidenceId: 0
```

The hash is not anchored, and does not collide with the two orphaned anchors from the
2026-08-20 audit. The record is genuinely `PENDING_UNREGISTERED` and safe to promote —
once it can be promoted through an endpoint that stays up.

That answer is recorded here as **diagnostic, not as the workflow's output**. It came
from a manual `eth_call`, which is exactly the side channel this session exists to prove
unnecessary. It gets re-asked through the tool once the tool can answer.

### The fix

**Finding 5 — the tool.** The contract call is now wrapped, and so is the optional
tx-hash recovery scan. Both funnel into one `chainUnavailable()` response, so there is a
single place where "the registry could not be questioned" is expressed and no path can
express it as `registered: false`.

The recovery scan is guarded separately and on purpose: if it fails, the verdict above it
is already established and stays valid — only the convenience lookup failed. But a bare
`null` would read as *"no registering transaction exists"*, a different claim entirely, so
a failed scan is annotated with `recoveryError` instead.

Two regression tests, both written from the real failure:

- A configured-but-failing contract call returns `CHAIN_UNAVAILABLE` with no verdict —
  asserted on a row that genuinely *is* pending and unregistered, so a naive
  implementation would call it safe to promote on no evidence at all.
- A failed recovery scan keeps its `MISSING_TX_HASH` verdict and annotates the null.

**Finding 6 — the environment.** Staging's `RPC_URL` now points at
`base-sepolia-rpc.publicnode.com`. Still an unauthenticated public endpoint, so this buys
availability rather than a guarantee; a keyed provider remains the real answer, and is
deferred because the key is another secret to keep out of a public repository.

**Production was not checked.** It anchors to Base **mainnet**, where this failure mode
costs real money rather than testnet gas, and it may well carry the same configuration.
Reading its variables was blocked by a permission gate. Recorded here, not chased.

**Tests: 880 passing, 2 new.**

### Step 2, re-asked through the fixed tool

Deploy `6228d41` reported `SUCCESS`, and the check was re-run so the canonical record comes
from the shipped code rather than the superseded build.

#### Request

```
check_on_chain_status
  fileHash: "0x0654…c262"
```

#### Response — structure

| Field | Value |
|---|---|
| `verdict` | `PENDING_UNREGISTERED` |
| `safeToPromote` | `true` |
| `consistent` | `true` |
| `database.inVault` | `true` |
| `database.status` | `PENDING_REVIEW` |
| `database.onChainTxHash` | `null` |
| `chain.registered` | `false` |
| `chain.registryEvidenceId` | `null` |

Identical to the pre-fix build, and identical to the manual `eth_call` used during
diagnosis — as expected, since the guard changes behaviour only when the chain *fails*.
Three independent routes to the same answer is the point: the tool now earns the trust the
workflow places in it.

The open question from the rebuild plan is resolved. The hash is not anchored and does not
collide with either orphaned anchor from the 2026-08-20 audit, so promotion will not revert
as a duplicate.

**This is the first time the loop closed with no side channel** — question asked by the
workflow's own tool, over MCP, answered by a healthy endpoint.

### The gate before the irreversible step

`promote_evidence` is the only call in this workflow that cannot be undone. It registers the
hash on the Base Sepolia EvidenceRegistry — a real, permanent transaction — then sets
`CONFIRMED`, records `onChainTxHash`, and indexes the record for public search.

The database row stays editable afterwards. **The on-chain anchor does not.** Nobody can
remove it, including the people who wrote it.

So the procedure is: check, show the verdict, and stop for a human decision. Not because the
verdict is doubted, but because `CONFIRMED` is an assertion made to the public, and a machine
should not be the thing that decides to make it.

---

## Step 3 — Promotion, and the round-trip that closes it

### Request

```
promote_evidence
  evidenceId: "1fba0dcb-…"
```

### Response — structure

| Field | Value / shape |
|---|---|
| `promoted` | `true` |
| `evidenceId` | uuid, echoes the request |
| `fileHash` | `0x` + 64 hex |
| `txHash` | `0x` + 64 hex — the anchoring transaction |
| `message` | states CONFIRMED, on-chain, and now searchable |

### Immediately re-checked

A promotion that reports success is not the same as an anchor that exists. That gap is
precisely where the 5 fake-`CONFIRMED` rows came from, so the verification is part of the
step rather than a separate habit:

```
check_on_chain_status
  fileHash: "0x0654…c262"
```

| Field | Value |
|---|---|
| `verdict` | `CONSISTENT` |
| `consistent` | `true` |
| `safeToPromote` | `false` — already anchored |
| `database.status` | `CONFIRMED` |
| `database.onChainTxHash` | recorded |
| `chain.registered` | `true` |
| `chain.registryEvidenceId` | `2` |

### Confirmed a third time, independently

Neither the promotion nor the check is taken on trust. The transaction receipt was pulled
straight from Base Sepolia, bypassing the application entirely:

| Receipt field | Value |
|---|---|
| status | `SUCCESS` |
| block | 45,812,065 |
| to | the EvidenceRegistry address |
| logs | 1 |

**The first evidence record in the rebuilt staging vault is genuinely anchored**, and its
`CONFIRMED` status is backed by a transaction anyone can verify without asking this
platform anything. That is the standard the whole vault is supposed to meet, and until
today nothing in the workflow could demonstrate it.

### Why this is the shape of the procedure

Check → decide → act → **check again**. The final step is the one that is usually skipped,
and skipping it is invisible: a record that was never anchored looks exactly like one that
was, right up until someone tries to rely on it in front of a court.

---

## Step 4 — The Wayback scan, and the design it broke open

### Request

```
start_forensic_scan
  url: "https://corona.health.gov.il/vaccine-for-covid/"
```

Returned `trackedUrlId` and `status: SCANNING`. The scan runs server-side; the tool's
message says to poll a REST status endpoint.

### FINDING 7 — the scan told the researcher to poll an endpoint they cannot reach

`GET /api/forensics/tracked/:id/status` sits behind the staging access gate and answers
`401 Unauthorized` without a staging token. A researcher working through MCP has no way to
use it. `get_forensic_timeline` reports scan status over MCP and is the right answer; the
tool's own guidance points away from the workflow it belongs to.

Asked properly, the answer was `status: FAILED`, `totalDiffs: 0`.

### FINDING 8 — the retry logic was dead code for the failure that happens

The backend log gave the cause in one line:

```
[WaybackScraper] CDX fetch failed: timeout of 30000ms exceeded
```

The contract was never in question — the diagnosis showed the archive holds the page, with
snapshots from 2021-12-23 onward. A direct CDX query for the same URL returned **in 48
seconds**, against a 30s ceiling.

But the timeout was the smaller half. `withRetry` retries four times with exponential
back-off, and inspected `err.response.status` to decide whether a failure was transient:

```ts
const status = axios.isAxiosError(err) ? err.response?.status : undefined;
if (status === 503 && attempt < CDX_MAX_RETRIES) { /* retry */ }
```

**A timeout has no response at all.** So `status` read `undefined`, matched nothing, and the
error was rethrown on the first attempt. The Internet Archive's dominant failure mode is
slowness, not 503 — so the retry machinery had been dead code for precisely the case it was
written to handle, and a real scan died having made exactly one attempt.

Fixed by classifying transience properly: no response (timeout, reset, DNS) is transient,
as are 429 and 5xx; 4xx is not, because a 404 means the archive does not hold the URL and
retrying only costs time to reach the same answer. CDX timeout raised to 60s.

One existing test had used a **504** to mean "a failure that is not retried" — an accident
of the old predicate, since 504 is a gateway timeout and unambiguously transient. Corrected
to 404, which genuinely is not.

---

## The forensic data model

Understanding the next change requires the three layers, because the fix falls out of the
model rather than being imposed on it.

| Layer | What it is | Hash | The claim it makes | Anchored? |
|---|---|---|---|---|
| `TrackedUrl` | A page we watch | — | identity only | — |
| `UrlSnapshot` | One archived capture at one moment | `SHA-256(fullText)` | "this page held exactly this text on this date" | ✅ automatic |
| `UrlVersionDiff` | The change between two consecutive snapshots | none | "between these snapshots, this changed" | ❌ correctly |
| `Evidence` | The legal artifact | `SHA-256(url+date+deleted+added)` | "this change is evidence in this investigation" | ✅ on promotion |

**Snapshots store `fullText` locally**, so the record survives the Internet Archive losing
or removing the capture. Their anchor is chain of custody for raw material: it proves the
archived text was not fabricated or later edited, because its hash was published to a public
chain at a known block time. Factual, independently checkable, requiring no interpretation.

**Diffs need no anchor because they are derivable** — given two anchored snapshots, anyone
can recompute the diff. Anchoring it would attest to nothing new. A diff row is written for
*every* processed pair, not only significant ones, so "we looked here and found nothing
notable" is preserved too.

**Evidence is content-addressed over the change itself**, deliberately not over the diff's
UUID: hashing a random database key would attest to nothing, and this hash goes on-chain.

### FINDING 9 — auto-promotion automated a legal conclusion

A scan used to promote its own findings: register on-chain, write `CONFIRMED`, index for
public search — all on the strength of an LLM classification, with no human ever seeing it.

The model shows exactly why that was wrong. Anchoring a **snapshot** automatically is
correct, because it asserts a fact. Anchoring **Evidence** automatically asserts a legal
characterization — the thing a machine should not conclude alone. Auto-promotion applied the
automation appropriate to the first layer to a claim belonging to the second.

Nothing evidential is lost by waiting: the snapshot anchor already froze the underlying fact
at scan time.

`autoPromoteToEvidence` is now `recordScanFinding` — it writes `PENDING_REVIEW` and stops.
No chain, no index, no status claim. Two MCP tools carry the review:

- `get_scan_findings(url)` — every pending finding for a page, **with the classifier's
  reasoning**, because the value of review is noticing that the classifier flagged three
  cosmetic edits and missed a real one, which is invisible if the tool returns rows to tick.
- `promote_scan_findings(url)` — confirms them, through the same `promoteEvidence()` service
  every other path uses, so a finding confirmed here is indistinguishable from one confirmed
  individually.

Keyed by **URL, not by scan run**. Re-scanning appends to the same pool, so "everything still
awaiting review for this page" is always the right question — where run-scoped batches would
strand the findings of any run nobody reviewed.

The builder no longer carries a default `status` either. It had defaulted to `CONFIRMED` and
been overridden by both callers: dead in practice, and the worst possible value for a future
caller to inherit by forgetting.

### FINDING 10 — a researcher cannot demote a finding

`promote_scan_findings` confirms exactly what the classifier flagged, with no per-item
opt-out. An exclusion list was considered and rejected, because it would have encoded "the
researcher disagrees with finding #3" as a parameter on someone else's call while the
capability actually missing stayed missing.

**There is no way to demote a diff the classifier marked significant.** A researcher who
disagrees has only `delete_evidence`, which destroys the record instead of reclassifying it —
and destroying the evidence that a classifier erred is exactly backwards, since that record is
the training signal.

Recorded as absent rather than papered over.

**Tests: 898 passing.** The two `WaybackScraperAutoPromote` suites were replaced by
`recordScanFinding.test.ts`; no coverage was lost, since every registration semantic they
exercised is covered directly in `evidenceOnChain.test.ts` against the service that performs it.

---

## Step 5 — A scan that could never be retried, and a review of the tools built to fix it

### FINDING 11 — one transient failure bricked the page permanently

The re-run of the scan failed again, in under a second, with **no log output at all**. That
silence was the clue: nothing had been attempted.

`runFullScan` handled an existing job in three branches — no job, `COMPLETED`, and `FAILED`.
The `FAILED` branch marked the tracked URL failed and returned, without a single fetch. And
because there is exactly one `WaybackScrapeJob` row per tracked URL, updated in place, that
state was permanent: every later scan request short-circuited on it.

So a 30-second CDX timeout against an archive that was merely slow made a government page
**permanently unscannable**, and the retry fix shipped an hour earlier could never take
effect on it — the code that would have used it was unreachable.

`createJob` already knew how to reset a failed job (`status: 'PENDING'`, `failureReason: null`).
It was simply never called for one. Reaching that branch means someone explicitly asked to
scan a URL whose last attempt failed, and the only sane reading of that request is "try
again". `fromDate` is preserved, so a failure partway through a long history resumes at the
batch that failed rather than restarting.

### Reviewing the session's own output

Four findings, three of them in code written earlier the same day.

**The consistency boolean contradicted its own verdict.** `check_on_chain_status` derived
`consistent` by excluding a few named verdicts, so `NOT_IN_VAULT` fell through as
`consistent: true` **even when the contract held the hash** — an orphaned anchor, the exact
condition the 2026-08-20 audit found twice and the tool was built to surface. The verdict
string was right; the boolean a caller actually gates on said the opposite.

Fixed by letting the verdict name the condition: `ORPHANED_ANCHOR` is now distinct from
`NOT_IN_VAULT`, and `consistent` derives from a **positive** list of verdicts. That direction
matters — a verdict added later is now inconsistent until someone says otherwise, rather than
consistent by omission, which is how this happened.

**The retry fix had a regression inside it.** `withRetry` is shared by the CDX query and the
per-snapshot fetch, and they had one budget between them. Sharing was tolerable while only a
503 counted as transient. Once timeouts were included — the archive's actual common failure —
every timing-out snapshot inherited CDX's four retries and 120s of back-off. At 50 snapshots
per batch that is over an hour of a job sleeping while reporting `SCANNING`.

The two call sites have genuinely different economics: CDX runs once per batch and its failure
kills the scan, so it keeps the large budget; a single snapshot is already skipped gracefully,
so it gets one retry. `maxRetries` is now a required parameter rather than a default, because a
default is how they came to share a budget in the first place.

### What the review pattern was

Three of the four findings were the same mistake: **the mechanism was right and the summary of
it was wrong.** Correct verdict, wrong boolean. Correct outcomes array, wrong count. Correct
transience classification, wrong budget for one of two callers.

Summaries are what callers read. They were the part the tests under-covered, because asserting
detailed structure felt like the more rigorous thing to do — the six-verdict test suite checked
every verdict string and only checked `consistent` on four of them. The two it skipped were the
two that mattered.

**Tests: 908 passing.**

---

## Step 6 — Comparing against a pre-wipe scan, and what it exposed

A PDF backup of a scan run on **2026-08-08** — before staging was wiped — recorded
**80 version changes, 10 AI-flagged as significant**. The rebuilt scan completed with
**81 version changes, 5 flagged**, covering 2021-12-23 → 2026-03-05.

Coverage was not the problem. All ten historic windows exist in the new scan as diff rows,
with identical date boundaries and full extracted content.

### FINDING 12 — the forensic classifier is not deterministic, and errs both ways

| Historic | Window | Now |
|---|---|---|
| #1 | 2021-12-23 → 2022-01-05 | downgraded |
| #5 | 2022-01-20 → 2022-01-27 | downgraded |
| #6 | 2022-01-27 → 2022-03-06 | downgraded |
| #30 | 2022-05-24 → 2022-05-25 | **retained** |
| #33 | 2022-05-26 → 2022-05-29 | **retained** |
| #34 | 2022-05-29 → 2022-05-30 | **retained** |
| #48 | 2022-07-24 → 2022-08-05 | **retained** |
| #57 | 2022-09-05 → 2022-09-06 | **retained** |
| #59 | 2022-09-21 → 2022-11-29 | downgraded |
| #76 | 2025-04-25 → 2025-06-01 | downgraded |

Same page, same diffs, same boundaries — **opposite verdicts on five of ten**.

The five retained are the ones that carry the case, and they matched exactly: the
mRNA-and-spike-protein safety claim deleted, restored, and deleted again within six days
in May 2022; the infant-vaccination campaign launch that added sweeping safety assurances
while removing the side-effect reporting link; and the wholesale deletion of those infant
claims two weeks after the leaked recordings surfaced. The classifier cross-referenced the
anchored article by date in three of them — the correlated-evidence mechanism worked on
real data.

Not every downgrade is a loss. The 2025 one the earlier run flagged was a **future-to-present
tense change**; dismissing it is the better call. That is the important half of this finding:
the classifier is not merely *less* sensitive now, it is unreliable in both directions, so
neither run is authoritative.

### FINDING 13 — the UI under-reported its own findings

The timeline UI showed **3 significant changes** where the database held 5. Both numbers came
from the same data.

```ts
const flaggedCount = diffs.filter((d) => d.isLegallySignificant).length;
```

`diffs` holds only the pages loaded so far (20 at a time). The count described the reader's
scroll position and was rendered as a statement about the scan. With two pages loaded it
said "3 legally significant changes were identified" for a page that had 5, and the number
grew silently as the reader scrolled. Significant diffs sat at positions 30, 33, 34, 48, 57
— the first three visible at 40 loaded, the rest not.

Fixed by returning `significantCount` from the server alongside the existing `totalCount`,
computed over the whole timeline.

**This is the same defect class as review findings 1–3: mechanism correct, summary wrong.**
Correct verdict, wrong boolean. Correct outcomes array, wrong count. Correct diffs, wrong
flagged count. Summaries are what people read and act on, and they keep being the part
nothing verifies.

### The debate: promoting a change the classifier passed over

Finding 12 makes a manual override necessary. But a bare override is the mirror image of the
auto-promotion just removed — one lets a machine assert `CONFIRMED` with no human, the other
lets a human assert it with no check. On a platform whose claim is that every status traces to
checkable proof, "a researcher clicked it" is not proof.

So promotion by hand is a **debate**, modelled as a session with events, exactly as a
`ResearchSession` models work on a thesis: a goal (decide this diff), a lifecycle, and a
turn-by-turn record that *is* the justification. It survives a restart, which the in-memory
token first considered would not have.

Two standards apply, and the split is the design:

| | Standard | Authority |
|---|---|---|
| **Substance** | Did the researcher make specific, falsifiable claims about the changed content? | **Hard gate** — no argument, no promotion |
| **Merit** | Is the researcher right? | **Advisory** — proceed permitted, dissent recorded forever |

Judging only *whether someone argued* keeps a demonstrably fallible classifier from being the
final authority on significance. Judging *whether they are right* would restore exactly the
problem. An override that is permitted but permanently visible deters better than a refusal,
and unlike a refusal it cannot be defeated by rephrasing until the model yields.

Tools: `open_diff_debate`, `respond_in_diff_debate`, `promote_from_diff_debate`, `get_diff_debate`.

### FINDING 14 — the gate is one click wide

The UI's "קדם לראיה ראשית" button still promotes a diff with no argument at all. The MCP path
requires a debate; the button bypasses it entirely. Closing this means the button must collect
a rationale and run the same flow. Recorded, not silently accepted.

**Tests: 917 passing.**

---

## Step 7 — Arguing a change into evidence

The classifier passed over a change the researcher believed mattered:
`2022-09-21 → 2022-11-29`, in which the numeric efficacy figures for the fourth dose
were deleted for the last time.

`promote_scan_findings` cannot help here — it confirms only what the classifier flagged.
Nor can a bare override: that is the mirror image of the auto-promotion just removed, one
letting a machine assert `CONFIRMED` with no human, the other letting a human assert it
with no check at all. On a platform whose claim is that every status traces to checkable
proof, "a researcher clicked it" is not proof.

So promotion by hand is a **debate**, modelled as a session with events — the same shape as
`ResearchSession` on a thesis, and for the same reason: a goal, a lifecycle, and a
turn-by-turn record that IS the justification.

**Two standards apply, and the split is the design:**

| | Standard | Authority |
|---|---|---|
| **Substance** | Did the researcher make specific, falsifiable claims about the changed content? | **Hard gate** — no argument, no promotion |
| **Merit** | Is the researcher right? | **Advisory** — may proceed; dissent recorded permanently |

Judging only *whether someone argued* keeps a demonstrably fallible classifier from being
the final authority on significance. Judging *whether they are right* would restore exactly
the problem the debate exists to solve.

### Round 1

The researcher pointed to the deleted figures, tied them to the leaked recordings of
2022-08-21, and argued that removing efficacy claims is significant regardless — and more
so once the ministry had been shown internal safety findings.

`hasSubstance: true`. Verdict `DISPUTES`, with a real objection: the removal coincided with
the switch to the Omicron-adapted formulation, so obsolescence is an innocent explanation.

### FINDING 15 — the gate ratcheted backwards on a good-faith reply

The researcher answered the objection by arguing about the platform's architecture: evidence
admission and thesis strength are separate stages, so a contestable item still belongs in the
bank, and the Devil's Advocate is what rates strength.

`hasSubstance` went **true → false**.

Two defects, both shipped hours earlier:

- **The assessor saw only the turn under assessment.** With no history it read every reply as
  a fresh opening argument. Answering an objection about an *inference* does not require
  re-quoting the text — the researcher had already done that — so the correct behaviour was
  penalised.
- **`hasSubstance` was overwritten rather than latched.** A cleared gate could silently
  un-clear, making a debate *harder to win the longer it was argued in good faith.*

A third, subtler one: the substance gate was demanding *"קשירה עובדתית ומשפטית"* — proof —
where it was only ever meant to ask whether a reviewable claim had been made. A
thesis-strength standard applied at an intake stage.

**Why the tests missed all three: every one submitted a SINGLE argument.** None modelled a
conversation, so the whole class of multi-round state bugs was invisible — a gate whose entire
purpose is to be argued with, tested only with one-shot inputs.

### FINDING 16 — the fix could not repair what it was written for

The first repair latched `session.hasSubstance || assessment.hasSubstance`. That latches off
the session's **own previous value**, which had already been corrupted to `false`. It fixed
behaviour going forward and left the live debate permanently stuck.

**The events are the record; the column is a cache of them.** `hasSubstance` is now computed
from the event log — *has any assessment ever found the argument reviewable* — so a session
corrupted before the fix shipped heals on read, with no data migration and without forcing
the researcher to re-argue a point already in the record.

The same shape recurs later in this document, and is worth naming once: **derive from state,
never from a transition.** A fix keyed to a transition only ever helps rows that had not
already hit the bug.

### Round 3, against a working gate

The researcher asked the assessor to reconsider the argument as a whole. It did:

> בבחינת הטיעון המצטבר, החוקר עומד ברף הממשות הפרוצדורלי… החוקר רשאי לקדם את הראיה למאגר
> חרף ההתנגדות.

Substance granted on the cumulative argument, a real objection returned, and the researcher's
right to proceed acknowledged outright.

Its objection also named exactly what would settle the matter: *"ללא אינדיקציה נוספת המצביעה
על הנחיה מכוונת להעלמת מידע"* — internal correspondence instructing removal. **That is the
whistleblower ask, produced by the adversary.** An objection that specifies the missing
evidence is a research lead, which is why disputes are recorded rather than treated as
refusals.

---

## Step 8 — Why the classifier missed it

### FINDING 17 — a claim can be lost in a crowd

The same text — `מוגנים מפני הדבקה פי 2… פי 3 עד 5` — appears in **six diffs of one scan**:

| Date | Direction | Flagged significant |
|---|---|---|
| 2022-05-25 | added | yes |
| 2022-05-29 | deleted | yes |
| 2022-05-30 | added | yes |
| 2022-08-05 | deleted | yes |
| 2022-09-06 | added | yes |
| **2022-11-29** | **deleted — never returns** | **no** |

The one it dropped is the final removal. There the deletion arrived bundled with six routine
administrative removals and six additions announcing a new campaign, and the aggregate read as
a campaign transition.

The classifier judged the **diff as a whole**, so the item vanished into its neighbours. That
is structural, not bad luck, and its practical meaning is unacceptable for a forensic tool:

> **The reliable way to remove a consequential claim unnoticed is to remove it alongside
> enough paperwork.**

The prompt's own instruction made it worse — *"a corpus full of weak claims cannot be
repaired"* — a documented bias toward under-inclusion whose premise assumes admission is
expensive. It is not, when strength is assessed downstream.

### The fix, and what it is not

Categories moved to the **item**; the diff-level set is derived as their union. Same single
LLM call, no extra cost — the model already segmented the diff into items with verbatim
quotes, and that segmentation was being discarded at the moment of classification.

**Relocation** is asked for explicitly, because it is the one case where surrounding context
legitimately changes the reading: text moved elsewhere on the page appears as both a deletion
and an addition, and reporting the deletion alone would claim the removal of something still
present.

What it is **not** is a loosened threshold. Raising the floor everywhere would have bought the
corpus-quality cost the original prompt was written to avoid, without reliably surfacing a
masked item.

---

## Step 9 — Provenance, and bringing a corpus forward

Stored LLM-derived columns drift the moment a prompt changes. Without provenance,
`isLegallySignificant` silently means different things on different rows and nothing
distinguishes a stale row from a fresh one.

- **`classifierVersion`** — human-readable, and what reclassification targets.
- **`classifierPromptHash`** — the proof. A version string is a promise; edit the prompt
  without bumping it and every row claims a version that no longer describes what judged it,
  which is the same defect as `CONFIRMED` without an anchor.

The prompt text is deliberately **not** stored per row: it lives in git, and the hash recovers
it exactly.

`npm run forensics:reclassify` brings older rows forward **without re-scanning** — it reads
the raw diff text persisted at scan time, so the Internet Archive is never touched and a page
that has since changed cannot alter a past classification. It **updates, never deletes**.

### Two correlation defects found while building it

Reclassification first **withheld correlated evidence**, ostensibly for reproducibility. But
the classifier is already non-deterministic at temperature 0 — 10 findings on one run, 5 on
another — so there was no stability to protect, while three of this corpus's five findings
turn on a correlation. Optimising for a property we had already measured ourselves not to have.

And `fetchCorrelatedEvidence` had **no source exclusion**. Because findings are written as a
scan walks forward, later diffs found earlier ones in their ±60-day window: the 2022-05-29
classification cited *"הראיות הפנימיות שנרשמו בימים 25 ו-29 במאי"* — its own page's prior
diffs, described as internal corroborating evidence. **A page could inflate the significance
of every change on the strength of its neighbours.** Correlation must come from a different
source than the page being classified.

### The measurement

81 diffs re-examined. **2 flipped, both routine → significant, 0 the other way**, 79 unchanged.
No noise explosion.

### FINDING 18 — the control case was invalid, and the error was mine

`2025-04-25 → 2025-06-01` had been proposed as the downward control — the "does this
over-approve?" test — on the belief it was a harmless tense change.

Reading the items rather than the classifier's summary shows the page moved from
**צפוי לתת הגנה רחבה יותר** ("is expected to give") to **נותן הגנה רחבה יותר** ("gives"): a
hedged prediction converted into an asserted fact, with no new evidence cited. The adjacent
hedge was left in place, which is hard to read as incidental copy-editing.

The aggregate summary called it *"עדכון תפעולי ולשוני שגרתי"* — true of the tense shift,
silent about the dropped hedge — and that summary was repeated without reading the underlying
items.

**That is the same bias item-level classification was built to remove, committed while
assessing its output.** Trusting a summary is not a machine failing; it is what summaries
invite.

---

## Step 10 — Following a claim across the whole history

A diff compares two snapshots. A **trajectory** follows one assertion across all of them.

Detection is **deterministic** and that is the entire point. Presence is a string search
against `UrlSnapshot.fullText` — the archived page text — with no model involved:

- **Reproducible**, unlike everything else in this pipeline.
- **Complete** — it sees the whole timeline, where a per-diff prompt sees one vantage point
  and would produce six inconsistent partial accounts of one phenomenon.
- **Free.**
- **Verifiable by an outsider.** *"Open these archived snapshots and search for this string"*
  is a check anyone can run **without trusting this platform at all.** Every other artifact
  here asks you to trust a model's judgment. This one does not.

Presence is tested against raw archived text, never against extracted items — that would make
a trajectory depend on extraction quality and drift whenever that prompt changed. Extraction
is used only to *discover* which claims are worth following.

### FINDING 19 — one event can look like ten findings

The first run reported **47 trajectories**. Grouping by presence vector showed **15 events**:
ten claims shared a single pattern, because pages are edited in blocks and a section added and
later removed yields one trajectory per paragraph inside it.

Grouping is not merely noise reduction — it is the **stronger evidentiary claim**:

> **8 claims moved together · 2022-08-05 → 2022-09-05 · REMOVED**
>
> PIMS reduction, hospitalisation efficacy, *"לא התגלו בעיות בטיחות חריגות"*, the
> recommendation for six-month-olds, and a *Pediatrics* citation — appearing together and
> vanishing together. **The leaked recordings were published on 21 August, between those two
> snapshots.**

As eight separate paragraph removals that is unremarkable churn. As one block, it is a
different kind of claim.

Claims that flip on the same dates but differ anywhere in between are kept **apart** — merging
them would assert a co-movement that did not happen.

---

## Step 11 — Recording, and anchoring seven

### FINDING 20 — a significant diff is not yet a finding

After reclassification, `get_scan_findings` reported:

```
significantDiffs: 7
pendingReview:    5
unrecorded:       2
```

`recordScanFinding` runs during a **scan**. Reclassification only rewrote the diff's columns,
so two diffs were flagged significant with no `Evidence` row. `promote_scan_findings` would
have promoted five of seven **and reported success.**

Nothing else would have surfaced this: `significantDiffs` said 7 and the forensic timeline
said 7. It was caught by `unrecorded`, a counter added on the principle that a silently
dropped finding must not look like no finding.

The fix keys on **`significant AND has no evidence`**, not on a flip — see FINDING 16.
Adoption itself needs **no model call**: an orphan already carries its classification, so
recovery records what the row asserts rather than re-deciding it. Through a full
reclassification the same recovery would have cost 81 LLM calls and rewritten the prose of 79
unrelated rows.

### The promotion

All seven registered on-chain, sequentially, through the same `promoteEvidence` path as a
single record. Registry ids **3–9**, following id 2 (the article anchored in Step 3).

Verified three ways: the tool's own report, `check_on_chain_status` returning `CONSISTENT`,
and an independent `eth_call` against the contract that does not go through this platform.

---

---

# Part II — The thesis phase

Steps 0-11 built a vault: eight anchored records, 81 classified diffs, 15 claim
trajectories. None of that is an argument. This part walks the half of the workflow
that turns a corpus into a legal thesis, has it attacked, and publishes what it still
needs — synthesis, Devil's Advocate, FOIA, and the call for whistleblowers.

Started **cold**, in a new session, with only the MCP tools and this document. That was
deliberate: if the playbook cannot carry a session that has never seen the work, that is
the finding it exists to produce.

## Step 12 — Reopening: environment first, then the write path

Step 0 wrote first and identified the environment afterwards, which FINDING 1 records as
the defect. Reopening against a vault that already holds records allows the correct order:
identify the database from a read, before anything mutates.

### Call 1 — `search_evidence`

Open, anonymous, writes nothing.

```
search_evidence
  query: "משרד הבריאות חיסונים"
  limit: 20
```

`total: 8` — the article anchored in Step 3 plus the seven forensic findings of Step 11,
every one `Tier 2: Material` / `Incriminating`. The vault survived the session boundary
intact.

### Call 2 — the environment discriminator (out-of-band, read-only)

Same method as FINDING 1: ask **production** whether it holds the hashes the connector
just returned.

```sql
SELECT (SELECT count(*) FROM "Evidence")        AS evidence_total,
       (SELECT count(*) FROM "Evidence" WHERE "fileHash" IN (…3 hashes…)) AS matching,
       (SELECT count(*) FROM "UrlVersionDiff")  AS diffs_total,
       (SELECT count(*) FROM "Thesis")          AS thesis_total;
```

| Column | Value |
|---|---|
| `evidence_total` | 0 |
| `matching` | 0 |
| `diffs_total` | 0 |
| `thesis_total` | 0 |

Not production. Also, separately worth stating: **the production vault is empty.** Every
record this playbook describes exists only on staging.

### FINDING 21 — the environment check got weaker, not stronger

The Step 0 discriminator is *"query production for the returned hash; `0` means staging"*.
That inference holds only while production holds **different** data. Against an empty
production database, `0 matching` is equally consistent with a wrong schema, a wrong table
name, or a query that failed and returned nothing.

It was salvaged here by also reading `evidence_total` — `0`, so the database is genuinely
empty rather than the hashes being absent — but that control was improvised, not part of
the procedure. FINDING 1 is unresolved and its workaround now degrades as production fills
or empties. **A negative result is only evidence when you also know what a positive one
would have looked like.**

**Fixed in the procedure, not only recorded here.** The control column is now part of
Step 0's discriminator, with the reading table that separates "production is populated and
lacks these hashes" from "production is empty and this check discriminates nothing" — see
*FINDING 1 → The correction*. A defective check belongs fixed where a future researcher
will actually read it, which is the step, not the appendix.

### Call 3 — the gated path

Reads prove nothing about authentication; GF serves them anonymously. The cheapest proof
that the authorized path works is a **gated** tool that costs nothing and writes nothing.

```
check_on_chain_status
  fileHash: "0x0654…c262"
```

| Field | Value |
|---|---|
| `verdict` | `CONSISTENT` |
| `consistent` | `true` |
| `safeToPromote` | `false` — already anchored |
| `database.status` | `CONFIRMED` |
| `database.onChainTxHash` | recorded |
| `chain.registered` | `true` |
| `chain.registryEvidenceId` | `2` |

Three things at once: the connector is authorized, staging's RPC is healthy (FINDING 6's
fix is holding), and the vault's first record still agrees with the contract across a
session boundary.

**Do this before the first substantive call, not after.** FINDING 4's rule — exercise the
gated tools early — costs one free call here and saves discovering an expired
authorization mid-promotion.


---

## Step 13 — What there is to argue from

Before asking a model to synthesize anything, look at the strongest artifact in the vault
directly. The trajectories are the only thing here that requires trusting no model at all,
so they should anchor the argument rather than decorate it.

### Request

```
get_claim_trajectories
  url: "https://corona.health.gov.il/vaccine-for-covid/"
  minTransitions: 2
```

### Response — structure

| Field | Value |
|---|---|
| `snapshotsExamined` | 83 |
| `candidatesConsidered` | 58 |
| `candidatesNotFoundInArchive` | 0 |
| `findingCount` | 15 |
| `claimsTracked` | 47 |
| `findings[].patternHash` | sha-256, one per co-movement group |
| `findings[].changes[]` | `snapshotDate`, `waybackTimestamp`, `snapshotUrl`, `present` |

`candidatesNotFoundInArchive: 0` is the field to read first. It is the tool reporting that
every claim it set out to follow was actually findable in the archived text — without it, a
low `findingCount` would be indistinguishable from a broken search.

Three of the fifteen carry weight:

| | Claims | Window | Final | What moved as a unit |
|---|---|---|---|---|
| **T-1** | 10 | 2022-05-25 → 2022-09-21, 6 flips | REMOVED | The fourth-dose block, including the numeric efficacy figures |
| **T-2** | 8 | 2022-08-05 → 2022-09-05, 2 flips | REMOVED | The infant campaign: a PIMS reduction figure, a hospitalisation-efficacy figure, an explicit no-unusual-safety-signals assurance, the six-month-old recommendation, a *Pediatrics* citation |
| **T-3** | 6 | 2021-12-23 → 2022-05-29, 3 flips | REMOVED | The biology claims, plus the stated alternative product for cardiac patients |

T-2 is where the deterministic method earns its keep: eight claims present in one snapshot,
all eight absent in the next, no partial state between. Its two boundary dates are the exact
dates of two anchored `Evidence` records, and the leaked recordings were published inside
the window.

---

## Step 14 — Deciding what the thesis should argue

Choosing the framing had been an ad-hoc question put to the researcher in prose. That is the
wrong shape for the same reason a bare promotion was the wrong shape in Step 7: the decision
that determines everything downstream left no record, and nothing checked it against the
evidence actually held.

Three tools now carry it — `open_thesis_framing`, `assess_thesis_framing`,
`get_thesis_framing` — and `create_thesis_draft` gained an optional `framingSessionId`, so a
thesis points back at the reasoning that chose its question.

**The output that earns the tool is contradictions**, not candidates. Generating plausible
framings is the easy half and a model will do it whether or not the evidence supports one.
Naming where the researcher's own corpus points the other way is the half that cannot be
faked and the half a researcher cannot do for themselves.

### FINDING 22 — FINDING 4 is not a scheduling rule, it is a hard boundary

FINDING 4 said: *deploy tooling before opening the research session, never during it.* This
step tried to obey it. The tools were merged and deployed **before the work began** — and
were still unreachable, because the client had negotiated its tool list at **connect**, which
happened earlier still.

The evidence was unambiguous, and worth recording as a method:

| Check | Result |
|---|---|
| Tool rediscovery by exact name | 3 of 4 absent |
| `create_thesis_draft` schema as seen by the session | **no `framingSessionId`** — a stale inventory, not a missing feature |
| `git merge-base --is-ancestor <branch> origin/staging` | ancestor — merged |
| `POST /api/mcp` `tools/list`, unauthenticated | **33 tools**, all three present |
| Tools visible to the session | **30** |

Two independent sources agreeing that the server has 33 and the client sees 30 is what turns
"the tool did not work" into "the tool is not reachable from here" — different problems with
different fixes. The stale `create_thesis_draft` schema is the sharper signal of the two: a
tool that is *present but shaped wrong* cannot be explained by a failed deploy.

**A reconnect was then attempted mid-session, and measured rather than assumed.** After it:

| | Before | After reconnect |
|---|---|---|
| Tools advertised by the server | 33 | 33 |
| Tools visible to the session | 30 | **30** |
| Framing tools reachable | no | **no** |

So the rule is not "reconnect and retry" either. It is:

> **A connector's tool list is fixed when the client connects. Deploying, merging, a green
> deploy, and reconnecting a live session all leave it unchanged. There is no in-session
> remedy — not a retry, not a rediscovery, not a wait. The session must be reopened.**

And the consequence that matters for anyone planning this work: **a session cannot build the
tool it discovers it needs and then use it.** It can build it, deploy it, and hand it to the
next session. Every tool in Steps 1-11 was reached that way, which is why the pattern went
unnoticed as a constraint rather than an inconvenience.


### FINDING 23 — two tools were still describing a workflow that had been removed

Blocked from the framing step, the tool inventory got read properly rather than skimmed.
Two tools were describing writes they no longer perform, and pointing at an endpoint the
researcher cannot reach.

| Claim in the tool's own description | Reality | Recorded in |
|---|---|---|
| *"Legally significant page edits found during the scan are auto-promoted to the evidence vault"* | `recordScanFinding` writes `PENDING_REVIEW` and stops — no chain, no index, no status claim | FINDING 9 |
| *"Poll `GET /api/forensics/tracked/:id/status` for progress"* | That endpoint is behind the staging access gate and answers `401` to an MCP caller | FINDING 7 |

Both findings were recorded when they were discovered. **Neither was ever remediated**, and
FINDING 7's guidance was wrong in *three* places while the finding describes one — the
sibling tool `enrich_evidence_with_history` was never looked at, because the bug was noticed
on `start_forensic_scan`.

This is the same shape as *derive from state, not from a transition*: the fix went where the
defect was **noticed** rather than everywhere it **lives**. Recording a finding is not fixing
it, and a document full of accurate findings can sit beside code that still has every one of
them.

**Why a wrong description is not a documentation nit here.** The session protocol requires
announcing *what a call writes* before making it — so the tool description is load-bearing,
and these two got it wrong in the direction that matters most: they promised the **stronger,
irreversible** outcome (promoted, on-chain, public) where the truth is the weaker reversible
one. A careful researcher refuses a call that was actually safe; a careless one waits for an
anchor that never lands. And the researcher has no way to check, because the description is
the only account of the write they are given.

Fixed at all four call sites — two tool descriptions and two runtime messages — with
`get_forensic_timeline` named as the reachable route, and the `PENDING_REVIEW` →
`get_scan_findings` → `promote_scan_findings` path stated explicitly.

The two tests that broke were asserting the `trackedUrlId` appeared **inside the poll-status
message**, which is only true while there is a URL to embed it in; the id is a top-level
response field and always was. They were rewritten to assert what actually matters, which
makes them stronger than before rather than weaker:

- the response carries the `trackedUrlId`,
- the message names `get_forensic_timeline`, and **does not** contain `/api/forensics/`,
- the message says `PENDING_REVIEW`, names `promote_scan_findings`, and **does not** say
  `auto-promot`.

Those negative assertions are the point. Nothing previously failed when a tool started
describing a workflow that no longer existed, which is exactly how it survived two findings
and several sessions.

**Tests: 983 passing, 1 new.**

## Where this leaves the vault

| | |
|---|---|
| Anchored evidence | **8** — one article, seven forensic findings |
| Diffs | 81, all at `classifierVersion: v2-item-level` with a prompt hash |
| Trajectories | 15 events across 47 claims, computed on demand |
| Debates | 1, open, on `2022-09-21 → 2022-11-29` |
| Failed promotions | 0 · unrecorded findings: 0 |

## Deliberately open

- **Trajectory citation.** A thesis cites by `fileHash` and `ThesisMention` knows
  `KEY_FIGURE | EVIDENCE | TRACKED_URL`; a trajectory is none of those. Deferred until there
  were real trajectories to design against — there are now 15.
- **The assessor prompt** — written, untested, preserved on `fix/gf-assessor-platform-context`
  with its control design. See `gf-assessor-prompt-open-question.md`.
- **The run report's before-state gap.** Reclassification captures prose only for rows that
  flip, while rewriting every row it touches.
- **The UI promote button** still promotes a diff with no argument, bypassing the debate
  entirely. The gate is one click wide (FINDING 14).
- **The thesis phase** — synthesis, Devil's Advocate, FOIA, and the public call — is not yet
  walked. It belongs in its own session, starting cold with only these tools and this
  document, because that is the only honest test of whether either is sufficient.

## What the whole exercise actually demonstrated

Twenty findings. **Almost none came from reading code.**

They came from a scan that failed twice for different reasons, a fix that could not reach its
own code path, a gate that punished a good-faith argument, a PDF backup of a deleted database,
a counter that noticed two missing rows, and a researcher who disagreed with a machine and
said so in writing.

The recurring shape is worth stating plainly for whoever works here next: **the mechanism is
usually right and the summary of it is usually wrong.** Correct verdict, wrong boolean.
Correct outcomes array, wrong count. Correct diffs, wrong flagged count. Correct classification,
misleading prose. Summaries are what people read and act on, and they are the part nothing
verifies.
