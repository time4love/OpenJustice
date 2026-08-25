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

# Part II — Making the evidence verifiable

This part was meant to be the thesis phase. It opened cold, in a new session, with only the
MCP tools and this document — deliberately, because if the playbook cannot carry a session that
has never seen the work, that is the finding it exists to produce.

**It never reached a thesis.** The first substantive call — a framing assessor, asked to check a
researcher's proposed framing against the evidence — contradicted the researcher, citing an
anchored record. The researcher was right and the record was wrong, and everything from Step 13 to
Step 18 followed from pulling that thread:

| What was believed | What was true |
|---|---|
| Trajectories informed the reasoning tools | They were invisible to every one of them |
| Evidence identity was content-addressed | It hashed model prose; 5 of 7 could not be recomputed |
| Snapshots were anchored automatically | **Zero of 83** had ever been anchored |
| Summaries described their own source | The prompt told them to cross-reference other records |

Ten findings, 33-42. **Almost none came from reading code** — they came from a written review
handed to another session, a researcher's objections, a dry run that selected nothing and reported
success, a guard asserting the wrong thing, and five failed transactions.

The thesis phase opens as Part III, on a corpus that can now be checked.

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


### The framing session

```
open_thesis_framing
  question: "Whether Israel's Ministry of Health revised its public safety
             representations on corona.health.gov.il/vaccine-for-covid in step with
             what it knew internally, around the publication of the Berkovitch
             recordings on 2022-08-21."
```

Returns `sessionId`, `status: ACTIVE`, `rounds: 0`, `thesisId: null`. The question is
stored verbatim: it is the artifact, and paraphrasing it would defeat the record.

The researcher's framing was written by the researcher. That constraint is not politeness
— a framing session in which the model proposes the framing and then assesses it is a
model arguing with itself, which is exactly the failure the diff debate was built to
prevent in Step 7. Round 1, in the researcher's own words, proposed a link between the
recorded internal presentation of the adverse-event analysis (including a re-challenge
finding) and quiet edits to the ministry's vaccine page — characterised as **removal of a
safety commitment and its restoration**, while officials already held the internal
information.

### Response — structure

| Field | Shape |
|---|---|
| `rounds` | 1 |
| `evidenceConsidered` | **8** |
| `contradictionCount` | 1 |
| `contradictions[]` | `researcherClaim`, `whatEvidenceShows`, `fileHash` |
| `unverifiedAssumptions[]` | `assumption`, `howToVerify` |
| `candidateFramings[]` | `framing`, `scope` (`NARROW`/`MODERATE`), `backedByFileHashes[]`, `strength`, `weakness` |
| `recommendedTopicString` | string |

The tool did the thing it exists for: it contradicted the researcher, citing a specific
anchored record. One of its unverified assumptions was independently valuable — that the
recorded discussion itself may date from June/July, with only its *publication* falling on
2022-08-21, a distinction the framing rested on without stating.

Its contradiction was that the evidence shows **no restoration** — escalation and deletion
only, with no return of removed wording.

### FINDING 24 — the assessor cannot see the layer that proves the researcher right

The contradiction was checked rather than accepted, against the archive itself. Both
captures were fetched directly from the Internet Archive and confirmed by
`memento-datetime` to be the exact captures requested — not a redirect to a nearest
neighbour, which would have made every comparison meaningless.

| String tested | 2022-08-05 | 2022-09-06 |
|---|---|---|
| The categorical no-illness-from-the-vaccine assurance | absent | **present** |
| The side-effect onset sentence | absent | **present** |
| Two dosing-schedule claims | absent | **present** |
| The fourth-dose numeric efficacy figures | absent | **present** |
| The infant no-unusual-safety-signals assurance | present | **absent** |

**In one edit the page removed all eight infant-campaign claims and restored five claims it
had removed a month earlier.** Removal and restoration is exactly what the researcher said,
it brackets the publication date, and the assessor denied it.

The cause is structural, not a bad model call. `evidenceConsidered: 8` — the assessor reads
**confirmed `Evidence` records and their AI-written summaries**. It cannot see
`UrlSnapshot` presence, so it cannot see a trajectory. The deterministic, outsider-verifiable
layer — the one artifact in this system that requires trusting no model — is invisible to the
tool that told the researcher their evidence disagreed with them.

This is the parked *trajectory citation* question arriving with consequences. It was deferred
as a citation-plumbing problem: `ThesisMention` knows `KEY_FIGURE | EVIDENCE | TRACKED_URL`
and a trajectory is none of them. It is not a plumbing problem. **A trajectory is evidence
that the thesis pipeline cannot reason over**, and the first tool to reason over the corpus
reached the wrong conclusion because of it.

Worth stating in general form, because it will recur: **when a system holds evidence at
several strengths, a tool that reads only the weakest layer will contradict a researcher who
read the strongest one — and will do it with citations.**

### FINDING 25 — a wrong summary on an anchored record propagated into a downstream tool

Reading the archive also settled what the 2022-09-06 edit did to the side-effect text, and
the anchored record has it wrong.

| | |
|---|---|
| The anchored summary says | side effects were presented as *passing within* a day or two |
| The archived page says | the common side effects *appear* a day or two *after* vaccination |
| Occurrences of the root *חולפ* ("passing") in that capture | **zero** |

Onset was read as duration. The summary then built an allegation on the inversion — the
concealment of findings about prolonged harm — and that summary is on an on-chain record.
The framing assessor then repeated it, describing as a *minimisation* a passage the archive
shows was **restored**, having been present since May and removed on 5 August.

Three properties of this are worth separating:

1. **The mechanism is right and the summary is wrong** — the playbook's recurring defect,
   for the sixth time, now inside an anchored record rather than a UI counter.
2. **It propagated.** Every previous instance was a wrong number a human read. This one was
   consumed by a tool, which produced a citation-backed contradiction of a correct
   researcher claim. Summaries are no longer only what people read; they are now inputs.
3. **It is fixable without touching the chain.** The evidence hash is computed over
   `url + date + deleted + added` — the change itself, deliberately not the prose. The
   summary is not in the hash, so correcting it costs nothing and invalidates nothing. That
   this is safe is a consequence of the content-addressing decision recorded in the forensic
   data model, made for unrelated reasons.

What has no mechanism yet is **detection**. Nothing compares a stored summary against the
diff text it describes, and nothing would have caught this except a researcher reading an
archived page and disagreeing with a machine — which is the same thing that produced
FINDING 15 and FINDING 18.


## Step 15 — Fixing the basis before building on it

The session's next step was synthesis. It was stopped instead, on the researcher's
instruction: *"in the previous session we fixed every issue immediately because there is no
point building on top of an incomplete basis."* A thesis built on a corpus the reasoning
tools could only half see would have been a well-argued document resting on the weaker half.

### What was already decided, and was right

Reading the schema before proposing anything mattered, because two of the three decisions had
already been made deliberately and documented:

> *"Deliberately NOT an Evidence row. Evidence is point-in-time by construction: one
> evidenceDate, one urlVersionDiffId (@unique), one fileHash over one document. A trajectory
> is an interval with internal structure."*

> *"Deliberately NOT anchored on-chain either… it is DERIVABLE from snapshots that are already
> anchored individually. An anchor would add nothing but the appearance of authority."*

The first instinct — promote trajectories into `Evidence` so every existing tool picks them
up for free — would have forced an interval into a point-in-time shape and, worse, handed a
deterministic finding to an LLM to summarise. Given FINDING 25, that is a machine for
producing the exact defect being fixed.

### FINDING 26 — the parked question was not the question

The schema note left **citation** open and treated it as the remaining work. But the assessor
in Step 14 never tried to cite a trajectory. It never saw one. Two different surfaces:

| Surface | Question | State |
|---|---|---|
| **Corpus visibility** | can a reasoning tool *see* a trajectory | **broken — FINDING 24** |
| **Citation** | can a thesis *point at* one in a footnote | open, and not what failed |

A thesis could have cited a trajectory in prose and been perfectly checkable. What no tool
could do was reason about one. Naming the open question as "citation" made the larger gap
invisible for as long as nobody walked the thesis phase.

### FINDING 27 — the persisted state existed, was correct, and was never used

`prisma.claimTrajectory` had **zero call sites**. No write, no read. The table was in the
schema, the migration was applied to staging, and `get_claim_trajectories` recomputed
everything from raw snapshot text on every call.

That was deliberate too, and documented — *"storing the result would only create a second copy
that can fall behind the snapshots it describes"* — and the objection was correct. What made
it obsolete was measurement:

| | |
|---|---|
| Rows ever written | 0 |
| Recompute per call | **3.4 – 5.0 s** — ~2 MB of archived text out of Postgres, ~4,800 substring searches |
| Output across two calls | byte-identical, 46,938 bytes |
| Authentication | **none** — the tool answers anonymously |

An unauthenticated caller can trigger a multi-second full-text scan in a loop. The earlier
cost-exposure sweep looked for anonymous **LLM** calls and would not have caught an unbounded
database read.

### The researcher's correction to the design

The proposed cache key was "state computed after a scan, stable until the next scan". Nearly
right, and the exception decides the design. Candidates are not discovered from snapshots —
they come from `UrlVersionDiff` extraction, which `forensics:reclassify` **rewrites without
touching the archive**. A scan-keyed cache serves stale trajectories straight through a
reclassification, silently.

So a trajectory is a function of three inputs, each able to move alone:

| Input | Changes on |
|---|---|
| the ordered snapshot set | a scan |
| the candidate claim set | a scan **or a reclassification** |
| `normaliseClaim` / `MIN_CLAIM_LENGTH` | a deploy |

`sourceStateHash` covers all three — the same organ as `classifierVersion` +
`classifierPromptHash`, added in Step 9 for the same reason.

### The convergence

The stamp answers two questions that looked separate:

- **As a cache key** it makes detection a read instead of a rescan.
- **As a version key** it makes a computed trajectory *immutable*. New state writes a NEW
  computation rather than mutating the old one, so a thesis that cited a trajectory still
  resolves to what it cited.

That second property was the open problem: `computedAt @updatedAt` with
`@@unique([trackedUrlId, claimHash])` meant a row was upserted in place, so a rescan could
change the meaning of a citation after publication. Everything else citable here is immutable
by construction — a snapshot is fixed text, a diff has fixed endpoints, an Evidence hash covers
fixed content. A trajectory would have been the only exception, on a platform whose entire
claim is that assertions trace to checkable proof.

The key became `@@unique([computationId, claimHash])`. **The table held zero rows, so this cost
nothing** — and there would never have been a cheaper moment to get it right.

### What shipped

| | |
|---|---|
| `ClaimTrajectoryComputation` | new parent row: `sourceStateHash`, `normaliserVersion`, and the counts |
| `ClaimTrajectory` | versioned per computation, never updated in place |
| Storage threshold | **every** detected trajectory, including 0- and 1-transition ones — `minTransitions` stays a READ filter, so lowering it later cannot serve a silently incomplete cached answer |
| Concurrency | two racing misses resolve by the loser reading the winner's rows; identical `sourceStateHash` means an identical answer |
| `loadTrajectoryContext` | trajectories for every tracked page the corpus came from |
| Precedence rule | shipped **with the data**, not in a system prompt |
| Overlap marking | computed by **claim hash at the item level** — see FINDING 29 |
| Wired into | `assess_thesis_framing`, `suggest_thesis`, Devil's Advocate |
| `trajectoriesConsidered` | reported beside `evidenceConsidered` |
| UI | a trajectory panel on the forensic page, above the diff timeline |

Two decisions inside that are worth stating on their own.

**The precedence rule travels with the data.** Handed a trajectory and a model-written summary
as two blocks of text, a model weighs them equally — which is the whole error. The rendering
says, in the prompt itself: these were computed by string search over archived text with no
model, the summaries were written by one, and *where they conflict the trajectory governs*.
Putting that in a system prompt would have described a section that is sometimes absent, and a
rule about an absent section quietly stops applying.

**The parameter is required, not defaulted.** `trajectories: TrajectoryContext[] = []` would
let any call site silently reason without the strongest layer in the vault — the exact defect
being closed. Making it required turned the compiler into the thing that finds the call sites,
and it found both immediately. Same reasoning that made `maxRetries` required in Step 5: a
default is how the wrong value gets inherited by forgetting.

### FINDING 29 — the overlap fix repeated the defect it was guarding against

Overlap between a trajectory and an evidence record was first computed by matching **dates**:
an `Evidence` row whose `evidenceDate` fell on one of a trajectory's transition dates was
flagged, whole, as *not independent corroboration*.

The researcher rejected it, and was right:

> *"a trajectory describes only the evidence info that was added/removed, while evidence could
> have other information… we may have a diff in evidence that is important but is not present
> in a trajectory."*

**A diff-based evidence record is not one assertion.** Since categories moved to the item in
Step 8, a single diff holds many items, each with its own classification. A record covering
fourteen changed items might share eight with a trajectory — and the other six can include a
claim that is significant entirely on its own: removed once and never restored, so never a
trajectory; or under `MIN_CLAIM_LENGTH`, so never a candidate at all.

Flagging the record as a unit tells a downstream model to discount all fourteen. That is
**FINDING 17 exactly** — *a claim can be lost in a crowd* — committed while building the guard
against a different instance of it. The original was a classifier judging the diff as a whole;
this was an overlap marker judging the evidence as a whole. Same shape, one layer up.

The defence offered for it was that over-inclusion is the safe direction, because understating
corroboration is conservative for a strength claim. That defence is wrong, and the reason is
worth keeping: on this platform **losing a finding is the more serious error than understating
one**, and a flag that suppresses an uncovered significant item loses it.

Rewritten to match on **claim hash at the item level**, which is exact rather than a proxy:

- a trajectory lists which evidence records contain its claims, and **how many items** each
  shares — not a boolean over the record;
- coverage is reported per record as *"8 of 14 items are a trajectory's claims; 6 classified
  items are covered by no trajectory and are independent evidence"*;
- coverage is computed against **every** trajectory found, not one group at a time, or an item
  covered by group B would be reported independent merely because group A missed it;
- items below the length threshold count as items and can count as significant, since they can
  never be trajectories and their classification is entirely their own.

The date heuristic is gone, and with it a second over-inclusion nobody had noticed:
`changesOnly` always emits the first observation even when it is not a flip, so every group's
baseline date was in the match set.

**The rendered prompt now states both halves.** A model that reads "8 shared items" and is not
told what the other six are will discount them — so the section that names the overlap is the
same section that names what the overlap does not reach.

### FINDING 28 — `trajectoriesConsidered`, and why a count is the fix

FINDING 24 was not visible as a failure. The assessor did not report that it could not see the
archive; it produced a confident, citation-backed contradiction. The only tell in the entire
response was `evidenceConsidered: 8`, and only to someone who already knew what was missing.

So the framing response now reports `trajectoriesConsidered` beside it. **A visible zero next
to a corpus of forensic evidence is the signal that the strongest layer went unread** — the
same fix as returning `significantCount` from the server in FINDING 13, and for the same
reason: the mechanism is usually right and the summary is what nobody verifies.

### Verification

- **983 → 1004 tests.** The new ones assert the state hash ignores candidate ORDER but changes
  on a reclassification, that sub-threshold trajectories are stored, that a cache hit never
  reads snapshot text, that a racing write falls back to a read, that overlapping evidence is
  flagged non-independent, and that the precedence rule is present in **both** rendered
  languages.
- The two tests that broke were asserting the OLD contract (`never writes`, and an agent
  signature). Rewritten to the new one, not weakened.
- `db:check-drift` was run **before** writing the migration — "No difference detected" — and
  again after, where it reported exactly the intended change and nothing else. A drift check
  that cannot be seen to detect anything is not evidence that nothing drifted.
- `ClaimTrajectory` was measured empty (**0**, against `trackedUrl: 1` and `urlSnapshot: 83` in
  the same query) before writing a migration whose `ADD COLUMN … NOT NULL` and `DROP COLUMN`
  are safe only on an empty table. FINDING 21's rule, applied to our own check.


### FINDING 30 — a classification guard that cannot see behaviour change

The change above was reviewed by the session that had designed `ClaimTrajectory`. Its first
finding was the one that would have shipped:

> **`get_claim_trajectories` is a write tool classified as a read.**

It sat in `READ_TOOLS` on reasoning that was correct when written — deterministic string search
over already-stored snapshot text, no LLM, no RPC, no chain, and *"its whole value is that
anyone can re-run the check themselves, which a gate would sit awkwardly against."* Once
detection became stored state, a cache **miss inserts rows**. An unauthenticated caller could
write to the database.

`mcpToolClassification.test.ts` exists precisely to prevent classification drift, and could not
catch this. It asserts every registered tool is classified exactly once and never in both sets.
**It never asks whether a classification still describes what the tool does.** The drift arrived
in a shape the guard does not inspect: not a tool added without a classification, but a tool
whose behaviour changed underneath a classification that did not.

The file's own header had already stated the right test — *"Before adding a tool here, ask what
it spends, not what it writes"* — and the answer had changed without anyone re-asking.

Three fixes, in increasing order of value:

1. `get_claim_trajectories` moved to `WRITE_TOOLS`, with an assertion pinning it and the reason.
2. **The read path was given its own name.** `getStoredClaimTrajectories` never computes and never
   writes; `getClaimTrajectories` does both. The public REST route uses the first, so a miss is
   *reported* rather than filled, and a caller that must not write has a function name that says
   so. A boolean option would have left the security-relevant distinction invisible at the call
   site.
3. The general form is a **review question, not a test**: when a tool's behaviour changes, re-ask
   what it spends *and* what it writes. No guard here can answer that.

Detection now also runs when a scan completes — deliberately after the job is marked `COMPLETED`
and deliberately swallowed on failure, because a scan that fetched and stored every snapshot has
succeeded, and failing it over a derived view would strand the archived text (the expensive,
irreplaceable half) behind a cheap, repeatable failure.

### What else the review corrected

**The state hash enumerated knobs.** It listed `normaliseClaim` and `MIN_CLAIM_LENGTH` and
missed the presence test itself — swap `includes()` for fuzzy or positional matching and every
trajectory changes while the hash does not. Enumerating named parameters is the exact drift
`classifierPromptHash` exists to prevent, so it now takes the same shape: one
`DETECTION_VERSION` covering the whole procedure, bumped by whoever changes any part of it.

**The precedence rule was too strong.** A trajectory is authoritative on *"this exact string was
in the page text at this capture"* — and nothing else. It knows nothing about position,
prominence, or whether a claim was being made to the reader; text in a nav menu reads as
"present" like any other. A conflict means the summary's assertion **about presence** is wrong;
it does not follow that its interpretation is. The motivating failure was a pure presence
question, so the narrower rule covers it completely.

**"One observation" over-reached, one notch smaller.** An evidence record also carries
classification, tier reasoning, correlation to dated external events, and key figures — none of
which a trajectory duplicates. Told two things are "one observation", a model may reasonably
discount the interpretation too. Now scoped: one observation **of page state**, and the record's
classification is explicitly not discounted by it.

**Nesting was already in the corpus.** Exact-hash overlap matching was flagged as a possible hole;
the reviewer produced two claims from the real 10-claim group where one contains the other
verbatim. And the error ran the **unsafe** way: an unmatched nested item is counted independent
while being partly covered, which *overstates* corroboration. Containment matching was added
within the trajectory claim set — exact hash for identity, containment for coverage, since
`a.includes(b)` is exact about a real relation and not fuzziness. Guarded by the length
threshold: a short string is a substring of unrelated claims by accident, and a false match
discounts a classified item, which is the direction that loses a finding.

**Two of the seven questions were answered "you corrected an oversight, not a decision."** The
upsert-in-place key was reflex on a table whose only writer had just been removed; mutation
semantics for a citable artifact were never reasoned about. And the *"reserved for citation"*
framing was thinner than it read — what citation needs is an immutable target, which is what the
new key provides and the old one did not.

One answer was better than the question deserved: a **0-transition, always-present** trajectory
is the *"survived everything"* case — a categorical safety assurance present continuously through
four years and every revision around it. Storing sub-threshold rows was argued for on cache
correctness; it also preserves a finding a threshold would have hidden.

### FINDING 31 — the two things that actually worked here

Worth stating on its own, because it is the pattern this project keeps rediscovering and it is
easy to lose among the mechanics:

**A deterministic layer proved a researcher right against an AI-written summary.** Not a better
model, not a longer prompt, not a more careful reviewer — a string search over archived text,
reproducible by anyone, contradicting an anchored record's prose and winning.

**The fix for the bundling repeat came from the researcher, not the model.** The over-broad
overlap flag was defended here as *"over-inclusive in the safe direction"*. That defence was
wrong, and the researcher said so: a trajectory describes only what moved, while an evidence
record carries more, so a diff item can be important and absent from every trajectory. On this
platform **losing a finding is a more serious error than understating one** — and the machine
argued the other way until a person corrected it.

Both belong beside the twenty-nine findings before them for the same reason those exist: they
came from running the thing and watching what broke, not from reading it.

### FINDING 32 — the review request format is what caught the write tool

The trajectory work was handed back to the session that designed `ClaimTrajectory` as a written
review request rather than a pull request. That format is the reason a defect nothing else could
see was found before merge.

`get_claim_trajectories` sat in `READ_TOOLS` on reasoning that was correct when written — no LLM
call, no RPC, no chain. Detection becoming stored state made a cache miss insert rows, so an
unauthenticated caller could write to the database. **No guard could catch it.**
`mcpToolClassification.test.ts` asserts every tool is classified exactly once; it never asks
whether a classification still describes what a tool *does*. The tests passed. The types passed.
The classification drifted underneath both.

What made the format work, in the order it mattered:

1. **It stated what the original author had decided, and why.** Three decisions — not evidence,
   not anchored, not persisted — each with its reasoning. The reviewer read them and *changed
   their first plan*: promoting trajectories into `Evidence` would have forced an interval into a
   point shape and handed a deterministic finding to an LLM to summarise.
2. **It named what was kept and what was overturned, separately.** Two kept, one overturned with
   argued reasons and measurements. A reviewer can only attack a decision that has been stated as
   one.
3. **It asked the questions the reviewer could not answer alone.** Six of seven turned on context
   that existed only in the original author's head — whether immutability had been *considered and
   rejected* or simply not considered, whether a threshold was chosen or inherited. The honest
   answer to one was "not considered", which is a correction of an oversight rather than the
   overturning of a decision, and only the author could say which.
4. **It recorded a correction already made and asked whether it went far enough.** Not "here is
   the fix" but "here is what I changed after being corrected — check whether it is now right or
   merely less wrong." It was less wrong: *one observation* over-reached one notch smaller.
5. **It listed what was NOT fixed.** Citation, the inverted anchored summary, anonymous access,
   structural independence. Naming them stops a PR body reading as a completion certificate.

**This is the diff debate's structure applied to engineering.** Substance is a hard gate — you
must state what you decided and why before the exchange can happen at all. Merit is where the
disagreement lives, and the disagreement is the product. Generating a description of a change is
the easy half.

It also has a precondition worth naming, because it is the expensive part: **the format is only
possible when the original decisions were written down with their reasoning.** The reviewer had
nothing but what was in the schema comments, the service header and the earlier PR body — and
that was enough. A change described as "adds caching for trajectories" gives a reviewer nothing
to disagree with, and would have shipped the write tool.


### FINDING 33 — the guard against bundling contained two bundling errors

The second review pass — the same session, now reading the code rather than the description —
returned three findings. Two are the **same defect the change exists to prevent**, committed
inside the prevention.

The bug being guarded against is *a set that looks complete and is not, feeding a claim about
independence.* Both leaks are exactly that.

**Coverage leaked across tracked URLs.** The claim set accumulated across the loop over pages,
while every evidence record belongs to exactly one page. An item on page A could be marked
covered by a claim belonging to page B. Two government pages sharing 40+ characters of
boilerplate is entirely plausible, and one page's text oscillating says nothing about the other.

Direction: over-matching → fewer items reported independent → **understates independent
evidence**, which is the side the researcher's own correction had just named as the more serious
error. What makes it an oversight rather than a choice is that the per-group computation forty
lines earlier scopes correctly. *The file gets it right once and then does not carry it down.*

**Coverage was computed against a silently truncated set.** Groups are capped at 8 per URL for
rendering, and only the capped set fed the coverage claim list. The corona page already produces
**15**, so seven were excluded. An item covered by group 9-15 was reported independent.

Direction: under-matching → **overstates corroboration**, the side this change was written to
prevent. And it was silent: no count, no marker. That is the unrecorded-cap lesson again — a
truncated set makes a partial answer look complete.

Both fixed by the same rule, which is worth stating because it is not obvious from either site:
**truncation applies to what is rendered, never to what is reasoned over.** Coverage now draws
from every group, scoped to the page the evidence is actually on, and `omittedGroups` is
reported and rendered — including the fact that the omission is display-only, since a reader
told "7 not shown" would otherwise discount the coverage counts too.

**The third finding was `prisma format` churn**, at three times the size of the instance caught
and reverted in PR #99: 304 of 377 changed schema lines were reformatting of unrelated models.
On a repository where migrations deploy themselves, an unreviewable schema diff is how a bad
migration gets waved through — and this change's migration contains a `DROP COLUMN` and a
`NOT NULL` add. Reverted and the schema edited by hand: 217/158 lines became 78/18, every one of
them inside the two models being changed.

The reviewer's summary of the first two is the part to keep:

> Building a guard against bundling while leaving two narrower bundling errors in the guard
> itself is not carelessness; it is how hard this class is to see.

Which is also the argument for FINDING 32's format. Neither leak is reachable today — there is
one tracked URL, and the display cap only bites past eight groups. Tests passed, types passed,
and the first review pass, reading the *description*, did not catch them: **the description was
accurate.** They were only visible to a second reader, of the code, holding the intent the
description had established.


## Step 16 — The control re-run

The fix was tested against the failure that motivated it, as a real before/after.

**Not as round 2 of the original session.** The assessor receives `priorTurns`, so a second round
would have shown it both the earlier exchange *and* the trajectories — two variables, one
experiment, and an invalid control of exactly the kind FINDING 18 records. A fresh framing
session was opened on the identical question, and the researcher's framing submitted
character-for-character unchanged as its round 1. The only difference from the recorded wrong
answer is the trajectory layer.

### Result

| | Round 1, recorded | Control, trajectory-aware |
|---|---|---|
| `evidenceConsidered` | 8 | 8 |
| `trajectoriesConsidered` | — | 8 |
| On restoration | denied it happened | **affirmed, citing trajectory T6** |
| Advice to the researcher | drop the restoration claim | strongest candidate framing **built on** it |

**FINDING 24 is closed.** The assessor moved from telling a researcher to abandon a correct claim
to anchoring its recommended framing on that claim, naming the deterministic trajectory as the
reason it holds. Its remaining contradiction is about direction and sequencing rather than
existence — a refinement instead of a false denial, which is what the tool is for.

### FINDING 34 — a true layer did not neutralise a wrong summary. It laundered it.

The same response says T6 restored the reassuring claim that side effects *"חולפות תוך
יום-יומיים"* — **pass within** a day or two.

T6's claim text, handed to the assessor verbatim, says they *"מופיעות לרוב יום או יומיים אחרי
קבלת החיסון"* — they **appear** a day or two **after**. Onset, not duration. The root *חולפ*
occurs nowhere in that capture; this was checked directly against the archive.

So the assessor took **presence** from the trajectory and got it right, and took **content** from
the anchored record's summary and got it wrong — the inversion recorded as FINDING 25, passing
straight through, and now cited alongside a correctly identified, deterministically anchored
finding.

This is the precedence rule working exactly as specified, and exactly as limited. It was scoped
to presence on review, correctly: a trajectory is authoritative on what string was on the page,
never on what it meant. Presence was fixed. Meaning was never in scope.

The consequence is the finding, and it is not what anyone expected:

> **Adding a strong, true, deterministic layer beside a wrong summary did not dilute the wrong
> summary. It made it more persuasive** — the false characterisation now arrives attached to a
> verifiable finding, and inherits its authority.

Both the `recommendedTopicString` and the strongest candidate framing rest on it. **The best
framing the tool recommends is built on a claim the archive does not support.**

Two things follow:

1. **Correcting the record fixes one row.** The evidence hash covers `url + date + deleted +
   added`, not the prose, so the summary can be corrected without touching the chain.
2. **The detector is the actual work**, and this is the proof: a summary asserting something
   about a claim's text can be checked against `UrlSnapshot.fullText` deterministically, the same
   way presence is. Nothing else would have caught this one, and nothing will catch the next.

A smaller reporting gap in the same response: `trajectoriesConsidered: 8` while 15 exist. It is
accurate to its documented meaning — how many the assessor was *shown* — and the rendered prompt
carried the "7 further, display only" note, so the model knew. The researcher's summary field
does not say it. The count that reaches a person still describes the display rather than the
detection.


### FINDING 35 — evidence summaries were arguing, not describing

The inversion in FINDING 34 was a symptom. The researcher named the defect:

> *"other evidence leaking into the evidence summary smells like thesis leaking into evidence."*

Each layer here makes a different kind of claim, and each is checkable against something
specific: a snapshot against itself, a diff against two snapshots, an **Evidence record against
its own source**, a thesis against the whole corpus. Rule 4 of the classification prompt broke
that:

> *"If correlated DB evidence exists… **EXPLICITLY cross-reference it** in your legalSignificance
> explanation. The correlation is the most powerful forensic finding — 'they silently deleted the
> mRNA safety claim 3 weeks after this internal report surfaced.'"*

The example the prompt offers as its model output is not a description of a page change. **It is
an argument** — a causal-temporal inference across sources, which is exactly what the thesis
stage exists to make and what the Devil's Advocate exists to rate. And `legalSignificance`
becomes `Evidence.summary` verbatim, so that argument became the record's public text.

**The harm is a closed loop.** A thesis argues X; it cites a record whose summary already asserts
X, because the classifier read a *different* record at intake; the Devil's Advocate sees the
argument supported by evidence and rates it strong. The thesis is corroborated by its own
premise. That is not hypothetical — it happened in Step 16, where the assessor's recommended
framing rested on prose that exists only because the classifier was contrasting this page against
the article's *"ממושכות"*.

It also silently defeats the independence marking built the same day. Overlap between a
trajectory and a record is now computed and labelled; if record X's *summary contains record Y's
content*, X and Y are not independent either, and nothing computes that edge.

**Why Step 9's fix did not reach it.** Step 9 found this once and read it as a *self*-reference
bug — a page citing its own earlier diffs as corroboration — and added `excludeTrackedUrlId`.
Correct, and insufficient: it stops a page inflating itself and leaves every cross-source path
open. The article is a different source, so it sails through. The diagnosis then was
*"correlation must come from a different source than the page being classified"*; the premise was
wrong. The problem is not **which** source, it is that a description imports any source but its own.

### The distinction that resolves it

Two uses of correlation, and only one is a violation:

| Use | Verdict |
|---|---|
| A reason to **look harder** at this page | legitimate — Step 6 measured it working |
| **Content** in the record's description | illegitimate — it puts the conclusion inside the exhibit |

Correlation may decide **whether** an item is flagged. It must never determine **what the record
says happened.**

The prompt already stated this principle one level down, in the very next line: *"CLASSIFY ITEMS
INDEPENDENTLY. Judge each item on its own content, never on the overall character of the diff it
arrived in."* Rule 4 exempted the aggregate from that discipline and additionally invited it to
import other records. The fix extends a rule the file already contained.

### FINDING 36 — do not code a detector for something that should be impossible

A `CROSS_SOURCE_CONTENT` verdict was designed — deterministic, precise, naming the record a term
leaked from. The researcher rejected it, and the reasoning is the more valuable output:

> *"this should never have happened and we are not coding bug fixes into the heart of the
> codebase."*

A detector for cross-source leakage is only necessary while leakage is possible. Shipping one
encodes the defect as a permanent feature of the system, commits someone to maintaining it
forever, and — worst — gives the next person a reason **not** to fix the prompt: *we catch that.*

The same argument then retired the grounding detector that had just been written and tested.
It was built to catch the FINDING 34 inversion, and both failures share one cause: **the pipeline
holds a verbatim layer and a paraphrase layer, and publishes the paraphrase.** `exactQuote` is
verbatim and provably correct — trajectories built from it match the archive exactly.
`legalSignificance` is free prose. `buildForensicEvidence` copies the prose and discards the
quotes at exactly that step. Rule 4 let *other records* into that prose; free generation let *the
page's own meaning* drift inside it.

What survived the cut, and why the line falls there:

| Kept | Why it is not the same anti-pattern |
|---|---|
| `correct_evidence_summary` + `SummaryCorrection` | a human will find prose wrong for reasons no check anticipates; corrections are permanent capability, and one with no record is the "trust us" this platform exists not to be |
| `loadSummaryCaveat` | **provenance surfacing**, not detection. `classifierVersion` already records which prompt wrote a row; this states what that prompt permitted, at the moment the row reaches something that will reason over it. It is expected to become dead code — when no row predates the fix it returns null and nothing renders |

A **one-off audit is not a feature**, and that distinction is what let the measurement happen
anyway: the sweep below ran as a throwaway script and was deleted after reporting.

### What the audit actually found

All seven forensic records are at `v2-item-level` — every one written under rule 4. That is
derivable from `classifierPromptHash`, not assumed, which is the whole reason Step 9's provenance
work matters.

Reading the summaries rather than the counts, **four of seven carry an explicit reference to
another record**, and they split into two kinds:

| Kind | Records | What the summary says |
|---|---|---|
| **Cross-source import** | `0x43de…`, `0x9871…` | both narrate the publication of the leaked recordings — an event on a *different* source, with its date — inside a description of a page diff |
| **Self-correlation** | `0x6f75…`, `0x5c56…` | both cite *this same page's* earlier diffs as internal corroboration (*"בהצלבה עם ממצאי התיעוד הפנימי מ-25 במאי"*) |

The second kind is the defect Step 9 fixed **in code and never cleaned in data** — the same shape
as FINDING 23, where two findings were recorded and neither remediated. A prompt fix does not
reach rows already written.

The audit's raw counts (24-42 ungrounded terms per record, 10-25 "traceable to another record")
**overstate the problem and should not be quoted**: analytic vocabulary like *מהווה* or *הציבור*
appears in every summary, so it is trivially "traceable" to another record. The crude metric
located the records worth reading; reading them produced the finding. That is the honest division
of labour between a measurement and a conclusion.

`0x9871…`'s leaked terms include **ממושכות** — the exact word the article uses for prolonged
effects, and the contrast that required the page to be claiming short duration. FINDING 34's
inversion and FINDING 35's leakage are the same event seen twice.

### What shipped

- **Rule 4 replaced.** Correlated evidence may still decide *whether* an item is flagged; it may
  no longer be described, quoted or referred to in `legalSignificance`, which must be checkable
  against this diff's own text and nothing else.
- **`CLASSIFIER_VERSION` → `v3-self-contained-summary`**, so no new row is born contaminated and
  every old one is identifiable.
- **Provenance caveat at the point of consumption**, threaded into all three reasoning agents as a
  *required* parameter. It names the affected records and says both necessary things: treat
  cross-source claims as unverified, **and** do not count such a claim as independent support —
  because "may be unverified" alone still lets a model count the record as a second source
  agreeing with the first.
- **Tests stopped hardcoding the version string.** Two asserted `'v2-item-level'` as a literal, so
  every legitimate bump would break them — an incentive not to bump, on the one field whose whole
  purpose is to be bumped.

### FINDING 37 — a rule applied outside its scope, and nothing could have caught it

The correction path was first built as an MCP tool, `correct_evidence_summary`: any approved
researcher could rewrite the public prose of a `CONFIRMED`, on-chain-anchored record in one call,
with the new text re-indexed into public search immediately. It had a rationale, tests, and a
write-up. The researcher stopped it with one question — *"what is the rationale for having such
tool exposed to every researcher?"*

Beside this platform's own rules it is plainly backwards:

| Act | Review required |
|---|---|
| Create evidence | `PENDING_REVIEW`, human promotion |
| A scan finds something | `PENDING_REVIEW`, never self-promotes (FINDING 9) |
| Promote a diff by hand | a **debate**, substance a hard gate (Step 7) |
| **Rewrite a CONFIRMED record's public prose** | **nothing** |

It published allegation text naming living officials with *less* review than creating a new
pending row, and the new text would inherit the record's `CONFIRMED` status, its on-chain
provenance and its existing citations — authority earned by different words. Step 7 had already
rejected this exact shape: *"a bare override is the mirror image of the auto-promotion just
removed."*

**How it happened is the useful part.** The session protocol says *"all mutation goes through MCP
— a missing tool is a finding, and gets built."* That rule exists to prove **the researcher's
path** works. Corpus maintenance is not the researcher's path. The rule was applied where the work
was happening rather than where the rule lives — FINDING 23's shape inverted, and the correct rule
(operator work goes through committed npm tooling) was one established in an earlier session, with
its precedent, `forensics:reclassify`, sitting in the same directory.

**Nothing in the repository could have caught it.** It typechecked, six tests passed, and the
classification guard was satisfied because the tool *was* correctly gated — as a write tool
available to every researcher, which is what it asked. Every test written for it assumed building
it was right, and that assumption was the defect:

> **Tests verify that a thing works. Nothing verifies that it should exist.**

That is the third time in this session that an internally coherent rationale was scoped wrong, and
all three were caught by a person asking *why* — never by a check. It is the same argument as
FINDING 32: the review format works because it forces the reasoning to be stated, and the
reasoning is the part that fails.

The rule, stated so it does not have to be re-derived:

> **Before building any tool, ask whether it is a research act or a maintenance act. Research →
> MCP. Maintenance → a committed npm script. "A missing tool gets built" does not say WHERE.**

### FINDING 38 — the repair had to be narrower than "run it again"

The obvious remedy was to re-run classification over the corpus under v3. It would have destroyed
the vault.

`forensicEvidenceFileHash(url, afterDate, deletedText, addedText)` covers the **extracted items**.
Re-running classification re-extracts them, and the classifier is non-deterministic — measured in
Step 6 at 10 findings on one run and 5 on another from identical input. Different items mean a
different hash, and the seven anchors at registry ids 3-9 would match nothing: seven deliberate
`ORPHANED_ANCHOR` records, the exact state `check_on_chain_status` exists to detect and the 2026-08-20
audit treated as a defect.

What saved it is that **the contamination is confined to one field, and that field is not hashed.**
So `npm run forensics:resummarize` rewrites `aiSignificance` alone, from items already extracted at
scan time:

- it never re-extracts and never re-fetches the archive;
- it **asserts the recomputed fileHash still equals the registered one** before writing, and skips
  the row and exits non-zero if not — an operation that *cannot* orphan an anchor, enforced rather
  than intended;
- it records the previous prose for **every** row it touches, not only ones that change
  meaningfully — which closes the playbook's standing before-state gap by construction rather than
  as a separate job;
- it is **dry-run by default**; `--apply` is required to write.

It also cannot leak by construction rather than by instruction: the rewriter is a separate chain
with a separate prompt that **is never shown correlated evidence at all**. A rule the model is told
to follow can be misread; input it never receives cannot be quoted.

And it stamps a new field. `summaryVersion` is separate from `classifierVersion` because the two
move independently — rewriting the prose leaves the items judged by the older classifier, so a
single version string would have to lie about one of them. The provenance caveat therefore keys on
`summaryVersion`: keyed on `classifierVersion` it would warn about rows already fixed and stay
silent about rows that were not.

**Not done, deliberately: no bulk reclassification.** Rewriting 81 reviewed summaries to fix a
contamination measured at four records is the same shape as auto-promotion — a machine changing
reviewed text with nobody seeing it — and the playbook's own open item stands in the way: the
reclassification run report captures prose only for rows that flip, while rewriting every row it
touches. That gap closes before any bulk pass. The four records get corrected by hand, in the
researcher's words, through `correct_evidence_summary`, which records each one.


### FINDING 39 — a dry run that selected nothing and reported success

The first real invocation of `forensics:resummarize` returned:

```
examined:  0
rewritten: 0 (dry run — none written)
failed:    0
hashDrift: 0
```

Exit code 0. Indistinguishable from *"checked everything, nothing needed repair."*

The target filter was `NOT: { summaryVersion: SUMMARY_VERSION }`, which compiles to
`NOT (summaryVersion = '…')`. Under SQL's three-valued logic that evaluates to NULL on a NULL
column, and NULL is not true, so the row is excluded. **Every row needing this repair has
`summaryVersion` NULL** — the filter excluded precisely the set it existed to find, and did it
silently.

**Nine tests passed.** They could not have caught it: they mock `findMany` and assert the *shape*
of the `where` clause, so the clause is never evaluated against data. The tests confirmed the
filter was the one intended. Being the intended filter was the problem.

> **Mocking the query layer means the query is never tested. A test can tell you the clause is the
> one you wrote; only a database can tell you it selects anything.**

Caught by running a two-row validation pass before committing 81 LLM calls to the full one. That
habit cost one wasted call and bought the difference between a corpus repair and a repair that
reports success while touching nothing — which, given the report's exit code, would have been
recorded as "all seven records already clean."

It belongs beside FINDING 20 and FINDING 13. Same defect class, third instance in this document: a
count that describes something other than what the reader assumes it describes, with nothing
verifying the difference. Here the count was honest about what it examined and silent about the
fact that it examined nothing.


## Step 17 — The dry run, and what its guard actually found

81 diffs examined, **76 rewrites proposed**, 0 failures — and **5 skipped by the hash guard**,
exit code 2.

The guard exists to stop `resummarize` from moving a field that feeds the evidence `fileHash`.
It has never done that; it does not touch those fields. What it found instead is that the hashes
had already stopped matching.

### FINDING 40 — five anchored records cannot be recomputed from the database

Verified independently of the script, with the real hash function against live staging:

| Evidence date | Recomputed vs stored | Evidence row created |
|---|---|---|
| 2022-05-25 | **MISMATCH** | 10:43 |
| 2022-05-29 | **MISMATCH** | 10:43 |
| 2022-05-30 | **MISMATCH** | 10:44 |
| 2022-08-05 | **MISMATCH** | 10:45 |
| 2022-09-06 | **MISMATCH** | 10:46 |
| 2022-11-29 | MATCH | 14:40 |
| 2025-06-01 | MATCH | 14:40 |

The timestamps split the table exactly. The five that fail were written **during the scan**; the
two that pass are the **adopted orphans of FINDING 20**, created after reclassification. And that
is the whole explanation:

> **`forensics:reclassify` rewrites `deletedText` and `addedText`. Those are two of the four inputs
> to `forensicEvidenceFileHash`. Five Evidence rows had already been created — and anchored — from
> the earlier items.**

The two adopted later were hashed from the items that are still in the database, so they verify.

**What this does and does not mean.** The evidence is not fake, the rows are real, and the anchors
are real transactions — this is not the 2026-08-20 situation of `CONFIRMED` with nothing on-chain.
The underlying facts are intact too, because `UrlSnapshot.contentHash` is anchored separately and
reclassification never touches archived text.

What is lost is the property the design exists for. The schema note is explicit that the hash is
content-addressed *"deliberately not the UrlVersionDiff UUID: that is a random database key and
hashing it would attest to nothing."* For these five, nobody can take the stored diff and rederive
the hash — so the hash now attests to a document that no longer exists anywhere, and functionally
it **is** a random database key. Content-addressing without recomputability is just an id.

**Nobody asked the question.** Reclassification was built carefully — UPDATE-only, never deleting,
reading persisted diff text so the archive is never re-fetched, stamping `classifierVersion` and
`classifierPromptHash` for provenance. All correct. It simply mutates the inputs to an identity
that had already been published and anchored, and no step in that work asked what happens to a
hash computed from a field it rewrites.

### The guard asserted the wrong thing, which is how this surfaced

The post-condition was *"recomputed hash must equal the registered evidence hash"*. That is not
the invariant `resummarize` needs. What it must guarantee is that **its own write does not move a
hashed field** — which is `hash(fields as loaded) == hash(fields as written)`, trivially true
since it writes neither.

Comparing against the *registered* hash conflates two different questions: *did I change this?*
and *was it already correct?* So the run refused five rows for a condition that has nothing to do
with the operation being performed.

Asserting something adjacent to what was meant is the same error shape as several earlier findings
in this document. Here it was productive by accident: a correct guard would have rewritten all
seven summaries and said nothing, and the five broken identities would still be undiscovered.

**Neither the tests nor the code could have found this.** Nine tests pass, including one that
exercises the hash guard — against a mock returning a hash that matches by construction. The
condition exists only in real data, produced by two correct operations run in the wrong order,
months apart in wall-clock terms and hours apart in this project's.

### The guard, rescoped

`resummarize` is responsible for exactly one thing: **its own write must not move a hashed
field.** That is now asserted against the **persisted** row rather than against what the code
believes it wrote — recompute after the transaction, compare to the hash computed before it — so a
future change that re-extracts is caught on the row that did it.

The registered-hash condition is reported separately, per row and in the summary, and never blocks:
it is pre-existing, it belongs to reclassification rather than to this operation, and refusing rows
for it prevented a repair that touches nothing hashed.

Both numbers appear in every run. `hashDrift` must be zero and exits non-zero if not.
`registered hash unverifiable` is expected to be five until that is remediated — and a count nobody
prints is how it stayed invisible through a scan, a reclassification, seven promotions and an
integrity audit.

**The rewrites are held.** 76 are ready and none have been applied: if the five records are
re-anchored or re-derived, their summaries should settle once rather than twice.


### FINDING 41 — the chain of custody the whole model rests on was never written

```
snapshots: 83 | with contentHash: 83 | anchored on-chain: 0
```

**Zero of eighty-three.** This document's own data-model table says otherwise:

| Layer | Hash | The claim it makes | Anchored? |
|---|---|---|---|
| `UrlSnapshot` | `SHA-256(fullText)` | "this page held exactly this text on this date" | **✅ automatic** |

That row is the foundation the rest of the model is argued from. FINDING 9 justified removing
auto-promotion partly on it — *"nothing evidential is lost by waiting, because the snapshot anchor
already froze the underlying fact at scan time."* **The snapshot anchor did not exist.** The
argument was sound and its premise was false.

It fails silently by construction, at three layers:

```ts
registerSnapshotOnChain(snap.id, contentHash).catch(() => {});   // call site: swallowed
const web3 = getWeb3Service();
if (!web3) return;                                               // unconfigured: silent no-op
} catch (err) { console.warn(...) }                              // failure: a warning, in a log
```

Fire-and-forget was the right instinct — a chain hiccup must not fail a scan that successfully
fetched and stored archived text, since the text is the irreplaceable part. What was missing is
that **nothing ever asked afterwards whether it worked.**

**The cause was not what this finding first said it was.** It was written attributing the failure
to timing — the scan ran while staging's `RPC_URL` was answering *"no backend is currently healthy"*
(FINDING 6), so the anchor attempts plausibly hit a dead endpoint. That was a guess, it was
recorded as "probable", and running the repair disproved it in two transactions:

```
invalid BytesLike value (argument="value", value="0a68d7663a8d…", code=INVALID_ARGUMENT)
```

No `0x`. `UrlSnapshot.contentHash` is stored **bare** — `createHash('sha256').digest('hex')` —
while `Evidence.fileHash` is produced by `ethers.sha256()` and carries the prefix. The two layers
store hashes in different formats, and the registry's `bytes32` argument rejects the bare one.

**Snapshot anchoring never worked. Not once, in any environment, from the first scan onward.** It
would have failed against a perfectly healthy chain. The RPC outage was real and irrelevant.

That distinction matters more than the fix. A transient failure means "retry when the endpoint
recovers" — repair, and move on. A permanent one means the code path has never executed
successfully, was never tested against a real contract, and every unit test around it mocks
`Web3Service`, so the argument format was never validated by anything. `.catch(() => {})` did not
merely hide 83 failures; it hid a defect that had no failing state anyone would ever see.

This is the 2026-08-20 audit's defect class with the polarity reversed. There, database rows
claimed `CONFIRMED` with nothing on-chain — a false claim in the data. Here the data claims
nothing at all; **the documentation makes the claim.** A record that overstates itself can be
caught by auditing records. A document that overstates the system cannot, and this one was written
in this session, by the same author, without checking.

The first repair reproduced the defect it was repairing. `anchorSnapshots` counted failures and
discarded the reason — `catch { report.failed++ }` — so the first real run reported `failed: 5` and
could say nothing about why. **A count tells you something is wrong; only the message tells you
what.** Adding the reason turned an unexplained failure into a one-line diagnosis on the next
attempt.

The instrument that would have caught the original is the one this session keeps rediscovering:
**a count, surfaced where someone reads it.** `significantCount`, `unrecorded`, `trajectoriesConsidered`,
`omittedGroups` — every one exists because a silent zero looked like a healthy zero. There was no
`unanchoredSnapshots`.

It also has a direct design consequence. The proposed replacement for the evidence `fileHash` —
computed from the two snapshots' `contentHash` values rather than from model-written items — was
going to be justified as *anchored by composition*, inheriting chain of custody from inputs already
on-chain. That property is real and it is currently unearned. Anchoring the snapshots comes first;
the identity built on top of them comes second.


## Step 18 — The vault becomes verifiable

Three operations, in an order that mattered.

**83 snapshots anchored.** The factual layer — *"this page held exactly this text on this date"* —
had zero anchors and the data model claimed it was automatic. 82 landed on the first pass; one
failed on the RPC and landed on a re-run, which is what "idempotent and resumable" was for.

**Evidence identity moved onto those anchors.** Seven records rehashed, each verified three ways:

| Check | Result |
|---|---|
| Recompute the hash from the database | **7 of 7 reproducible** |
| Superseded identity recorded on the row | 7 of 7 — `previousFileHash` + `previousOnChainTxHash` |
| `check_on_chain_status` | `CONSISTENT`, registered, transaction recorded |

The middle row is the whole point. Before today, five of seven could not be recomputed at all, and
the two that could were verifying a formula built from model output. Now every one of them can be
rederived by anyone holding the archived captures — and the captures' own hashes are on-chain, so
that derivation is checkable without trusting this platform at any step.

Registry ids 22 onward, not a reuse of 3-9. The old anchors remain on-chain matching nothing
derivable, deliberately, with the cause recorded on each row.

### What the ordering bought

Each step was worthless without the one before it:

- Anchoring evidence to snapshot hashes that were not themselves anchored would have been
  *anchored by assertion* — the property claimed for it, unearned.
- Rehashing before the new formula deployed would have left the server computing the old one on
  any new promotion: two identity schemes in one vault, worse than either.
- And re-running classification "from scratch", the obvious repair, would have re-extracted the
  items, moved every hash, and orphaned seven anchors — destroying exactly what was being fixed.

### FINDING 42 — the vector store has no delete, and nothing noticed

Re-indexing writes the new key; nothing removes the old. After seven rehashes the store may hold
seven orphaned vectors.

They cannot surface: `searchSimilarEvidence` returns file hashes which are then looked up in
`Evidence`, and the old hashes are no longer there, so the join drops them — confirmed by a live
search returning exactly 8 results, all on current identities. So this is hygiene rather than
correctness.

It is recorded because the reason it is harmless is *incidental*. Nothing was designed to protect
against orphaned vectors; a join happens to filter them. A future path that trusted the vector
store's own output instead of re-reading `Evidence` would surface records that no longer exist —
and would look, to a researcher, exactly like evidence.

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

---

# Part III — The thesis phase

Opened cold on 2026-08-23, against the vault Part II left: 83 snapshots all anchored, 81 diffs
at `v3-self-contained-summary`, 8 anchored evidence records (7/7 forensic reproducible from
snapshots), 15 claim trajectories, 3 known key figures, **0 theses**. Only the MCP tools and
this document. Build nothing; a missing tool is a finding.

Two predictions to test, stated before any call so they cannot be fitted afterwards:

- **(a)** Trajectory citation is the first hard stop, at `create_thesis_draft`. `ThesisMention`
  knows `KEY_FIGURE | EVIDENCE | TRACKED_URL`; a trajectory is none of those, and T-2's
  eight-claim co-movement is the strongest thing in the vault.
- **(b)** A strongly-rated thesis may produce no evidence gaps; the whistleblower call is
  derived from gaps, and a live call is a HARD publication check. A thesis could be too
  "complete" to publish. That would be a design finding, not a bug to route around.

## Step 19 — Reopening, third time

Same order as Step 12: read, then gated no-write, then the production discriminator.

### Call 1 — `search_evidence`

```
search_evidence
  query: "משרד הבריאות חיסונים"
  limit: 20
```

`total: 8`. Server up; proves nothing else.

### Call 2 — `check_on_chain_status` — and the authorization was dead

```
check_on_chain_status
  fileHash: "0x0654…c262"
```

First attempt: `This connector requires authentication. The user needs to connect it before
this tool can be used.` The read in call 1 had succeeded seconds earlier.

### FINDING 43 — an anonymous-read design hides a dead connector

The authorization had expired across the session boundary, exactly the case FINDING 4's rule
exists for — and call 1 gave no hint. Because every read tool is served anonymously, a
connector can be half-dead for an entire planning conversation and nothing will say so until
the first gated call. Recorded, not built: the rule "gated no-write call before anything
substantive" is the mitigation, and it worked here at a cost of one call. No workaround was
attempted; the researcher's path is MCP-only, so a dead connector is a stop, not a detour.

Re-authorized by the researcher out-of-band; second attempt:

| Field | Value |
|---|---|
| `verdict` | `CONSISTENT` |
| `safeToPromote` | `false` — already anchored |
| `database.status` | `CONFIRMED` |
| `database.onChainTxHash` | recorded |
| `chain.registered` | `true` |
| `chain.registryEvidenceId` | `2` |

### Call 3 — the discriminator, read-only, against production

The Supabase connector is bound to a single project with no ref parameter, so the project
was identified first (`get_project_url` → the production ref), then the FINDING 1 corrected
form was run with three hashes and four control columns.

| Column | Value |
|---|---|
| `evidence_total` | 0 |
| `matching` | 0 of 3 |
| `diffs_total` | 0 |
| `thesis_total` | 0 |
| `sessions_total` | 0 |

That is the weak row of the FINDING 1 table — production is empty, so a bare `0 matching`
discriminates nothing. The positive contrast does: the connector returned 8 evidence records
and the researcher reports 2 `ACTIVE` research sessions, while production holds 0 of each.
A connector that sees rows production lacks is not production. **Staging confirmed.**
Production remains empty — nothing from Part I or II is on `master`.

## Step 20 — Closing the ownerless sessions, and the consent branch nobody had tested

Two framing sessions were `ACTIVE` with `researcherId: null` — legacy rows from before
single-active and ownership were enforced. Which consent branch an ownerless session hits
was untested. Ordered so that the probe could not leave junk: close the known one, probe
with the real question while the other is still active, then close it.

### Call 1 — `close_research_session`

```
close_research_session
  sessionId: "cmt4uv9c7001q116spl54e6hg"      # the control re-run
```

`status: CLOSED`, `durationMinutes: 608`, summary all zeros, 3 events
(`SESSION_STARTED`, `FRAMING_PROPOSED`, `FRAMING_ASSESSED`).

### FINDING 44 — the close response replays every turn in full

The close summary echoes the `FRAMING_ASSESSED` event verbatim — the full assessment JSON,
naming officials. A researcher closing a session to tidy up receives the whole record back
whether or not they wanted it, and anything that logs tool responses now holds it. Recorded,
not built.

### Call 2 — `open_thesis_framing`, no consent, while the other is active

```
open_thesis_framing
  question: "Whether Israel's Ministry of Health revised its public safety representations on corona.health.gov.il/vaccine-for-covid in step with what it knew internally, around the publication of the Berkovitch recordings on 2022-08-21."
```

| Field | Value |
|---|---|
| `error` | `SESSION_ACTIVE_SAME_RESEARCHER` |
| `activeSession.id` | `cmt4ptxnt000174gc1fdaaxvz` — **named** |
| `activeSession.ownerHandle` | `null` |
| `activeSession.ownedByCaller` | `true` |
| `activeSession.ageMinutes` / `events` | 749 / 3 |
| `howToProceed` | close it, or pass `closeActiveSession: true` |

### FINDING 45 — an ownerless session is everyone's own

`null` owner resolves to the **same-researcher** branch: the cheaper consent suffices, and
the other-researcher path — the one that records a `closeReason` on the closed session — is
never reached. Any authenticated researcher can close any legacy session without leaving a
trace of why. New sessions always carry an owner, so this is confined to legacy rows; still,
the permissive reading was chosen by default, not by decision. Recorded.

The refusal does name the id, with enough context (name, question, age) to decide whether it
is yours. A researcher who arrived without the id would not be stuck — which matters, because
there is no MCP tool that lists sessions.

### Call 3 — `close_research_session`

```
close_research_session
  sessionId: "cmt4ptxnt000174gc1fdaaxvz"      # the original framing session
```

`status: CLOSED`, `durationMinutes: 750`, same shape as call 1, same full replay.

## Step 21 — Framing, third run, clean corpus

The control: identical question, identical framing text, third assessor run. Run 1 was on
the contaminated corpus (arguing summaries), run 2 on the trajectory-aware assessor with the
same corpus, run 3 here on `v3-self-contained-summary`. Editing the input would destroy the
comparison, so the framing was submitted byte-for-byte.

### Call 1 — `open_thesis_framing`

Same question. `sessionId: cmt5gm7lr0005f52m6v5fiy3r`, `status: ACTIVE`, `rounds: 0`,
`thesisId: null`.

### Call 2 — `assess_thesis_framing`

```
assess_thesis_framing
  sessionId: "cmt5gm7lr0005f52m6v5fiy3r"
  proposedFraming: <the researcher's framing, verbatim — recorded on the session>
```

| Field | Value |
|---|---|
| `rounds` | 1 |
| `evidenceConsidered` | 8 |
| `trajectoriesConsidered` | 8 (of 15 — which eight is not reported) |
| `contradictionCount` | 1 — `fileHash` `0x7517…2ac9` (the 2022-09-06 record) |
| `unverifiedAssumptions` | 2 — the internal meeting's actual date; a directive link between the room and the site editors |
| `candidateFramings` | 2 — `NARROW` (2 hashes), `MODERATE` (4 hashes) |
| `recommendedTopicString` | present; no longer contains the phantom "חולפות" representation |

### Call 3 — `get_claim_trajectories`, to check the contradiction before believing it

Read-only, deterministic, `snapshotsExamined: 83`, `findingCount: 15`, `claimsTracked: 47`,
`fromCache: true`, `sourceStateHash: e2d6…a376`.

The assessor's two factual statements about 2022-09-06 both hold against the archive:
"נמצאו יעילים ובטוחים לשימוש" is **newly added** that day (pattern `0e1991…`: absent before,
present 09-06, gone 11-29), and the mild-side-effects paragraph is **restored** (pattern
`ae8508…`: present 05-25, absent 05-29, present 05-30, absent 08-05, present 09-06).

The researcher's clause "הסרה של התחייבות לבטיחות, והחזרתה" also holds: five patterns are
absent on 2022-08-05 and present again on 2022-09-06 (`ae8508`, `9d2c75`, `7cbfc7`, `98020c`,
`3313cb`), including "אין סיכוי לחלות בקורונה בגלל החיסון".

### FINDING 46 — the contradiction is a straw man

The assessor's `researcherClaim` is not the researcher's sentence. It dropped "והחזרתה" and
inserted "בעקבות החשיפה", then contradicted the edited claim with evidence — the 09-06
restoration — that *supports* the unedited one. Facts right, paraphrase wrong, verdict wrong.

Across the three runs the phantom representation decays but does not vanish:

| Run | Corpus | Claim about 2022-09-06 | Archive |
|---|---|---|---|
| 1 | contaminated | no return documented | false |
| 2 | contaminated, trajectory-aware | returned "חולפות תוך יום-יומיים" | text never on the page |
| 3 | clean | added "יעילים ובטוחים"; restored mild list | true |

Residue in run 3: the `NARROW` candidate still says "קלות **וחולפות** בלבד" and the assessment
quotes "שכיחות וקלות **בלבד**" as page text; neither word is in any archived version. The page
says the common side effects *appear* a day or two after the dose.

The evidence-facing half of the assessor is now sound. The researcher-facing half — quoting
the claim it is about to contradict — is not, and nothing verifies it. Same shape as
[Part II's recurring finding](#what-the-whole-exercise-actually-demonstrated).

Both unverified assumptions coincide exactly with the two FOIA requests the adversary had
already drafted: the real date of the recorded meeting (2022-08-21 is the publication date),
and any correspondence or CMS record linking the editors to the people in the room.

### Round 2 — the transport dropped mid-call

```
assess_thesis_framing
  sessionId: "cmt5gm7lr0005f52m6v5fiy3r"
  proposedFraming: <round 2, verbatim — recorded on the session>
```

Response: `Anthropic proxy: MCP server connection lost`. Not retried blind; the session was
read first.

`get_thesis_framing` showed a second `FRAMING_PROPOSED` event carrying the full round-2 text,
**no** `FRAMING_ASSESSED` after it, `rounds: 1`.

### FINDING 47 — a framing turn is not atomic, and cannot be resumed

The proposal is persisted before the model is invoked, so a dropped connection leaves an
orphaned proposal on a record that will attach to the thesis. No tool assesses a pending
proposal; the only path forward is to call `assess_thesis_framing` again, which writes a
duplicate `FRAMING_PROPOSED`. Either the turn should be written once, after assessment, or
a retry should be idempotent on the proposal text. Recorded, not built.

### FINDING 48 — the read path reports counts the write path computed

The assess response said `evidenceConsidered: 8`, `trajectoriesConsidered: 8`. Reading the
same session back: `0` and `0`. The summary fields are filled in by the call that did the work
and not derived from stored state — so a researcher resuming a session sees a framing that
considered nothing. Derive from state, not from a transition, again.

### FINDING 49 — `trajectoriesConsidered` under-describes, now hit independently

8 of 15 trajectories were "considered" and the response does not say which. Flagged as
under-describing in a previous session on a different run; this is a second, independent hit
on the count itself. A reader cannot tell whether the strongest trajectory (T-2, eight-claim
co-movement) was among the eight.

### Round 2 — retried on the same session, verbatim

The researcher chose to retry rather than open a fourth session: the duplicate
`FRAMING_PROPOSED` stays visible on the record as evidence of FINDING 47, and the round-1
history the three-run comparison depends on is preserved.

| Field | Value |
|---|---|
| `rounds` | **3** — the orphaned proposal is counted as a round; the session now reports one more round than assessments it holds |
| `evidenceConsidered` / `trajectoriesConsidered` | 8 / 8 |
| `contradictionCount` | **0** |
| `unverifiedAssumptions` | 2 — a directive link between the room and the editors of both the 05.08 and 06.09 changes; when the findings first reached the ministry relative to 05.08 |
| `candidateFramings` | `NARROW` (3 hashes: 08-05, the article, 09-06) · `MODERATE` (2 hashes) |
| `recommendedTopicString` | removal 05.08.2022 → restoration 06.09.2022 plus the newly added "נמצאו יעילים ובטוחים לשימוש", in proximity to the 21.08.2022 publication |
| `explanation` | no contradiction; pass `recommendedTopicString` to `suggest_thesis` |

Checked against the trajectories: every date and quoted phrase in the topic string is
archived; "חולפות" and "בלבד" are gone; the meeting date is asserted nowhere. **The first of
the three control runs to produce a topic string the archive supports** — and it took the
researcher correcting the assessor's quotation of the researcher, on the record, to get it.
Which eight trajectories it saw is still not reported (FINDING 49).

**Disclosure, material to what this control measures.** Round 2 was not written by the
researcher unaided. It was drafted with assistance — the archive check in call 3 and the
straw-man analysis above were produced by the assistant, and the researcher's round-2 text
was composed from them after independently re-running the same trajectory patterns. Runs 1
and 2 of the control had no round 2 at all. So the comparison across the three runs is valid
only for round 1 (identical input, three assessors); the round-2 outcome measures the
assessor's response to a corrected, archive-checked rebuttal, not to a researcher working
alone. Checked after the fact: neither "חולפות" nor "בלבד" appears anywhere in the round-2
output. The `MODERATE` candidate still states as fact that the findings "were brought to the
attention of senior ministry officials", while the same response lists *when* as unverified.

### The topic string the researcher chose — one edit, and why

The recommended string said "הסרת טענות בטיחות ב-05.08.2022". Snapshots are discrete: the
archive locates a change to an **interval between captures**, never to a date. Pattern
`2bc8f6a8` has `lastSeen: 2022-07-24`, so a capture exists on 24 July that still held the
claim, and the restored patterns record no flip between then and 05.08. The change is
located to 24.07 → 05.08. Stating the interval is *stronger* than stating a date: it is
exactly what the evidence carries, and it puts the 21.08 publication inside the restoration
window rather than beside an unprovable removal date. Topic string passed forward:

> שינויי המצגים בדף חיסוני הקורונה (corona.health.gov.il/vaccine-for-covid) באוגוסט-ספטמבר
> 2022: טענות בטיחות שנעדרו מן התצלום מ-05.08.2022 לאחר שהופיעו בתצלום מ-24.07.2022,
> והושבו בתצלום מ-06.09.2022 בתוספת הקביעה "יעילים ובטוחים לשימוש", בסמיכות לחשיפת ממצאי
> צוות ברקוביץ ב-21.08.2022.

**Expectation stated before the call:** with 8 confirmed records and a `maxEvidence` of 10,
all 8 will be pulled whatever the string says. The topic string is directive, not retrieval.

## Step 22 — `suggest_thesis`

```
suggest_thesis
  topic: <the researcher's topic string above, verbatim>
```

Writes nothing. One semantic search, one synthesis call.

| Field | Value |
|---|---|
| `evidenceCorpusSize` | **8** — every confirmed record, as predicted |
| `supportingHashes` | 7 — the 2025-06-01 record was pulled but not cited |
| `confidenceLevel` | `MODERATE` |
| `keyFigures` | 3, all from the article |
| `citations` | 8 footnotes over 7 hashes; `[^7]` cites two |
| `missingEvidence` | 4 — internal correspondence / CMS directives for Aug–Sep 2022; the full report and original recordings; committee protocols; monitoring-system report data |
| `narrativeBody` | three sections: factual background · the 21.08 publication and its proximity to the edits · legal causes |
| `readyForDraft` | title, body, `evidenceHashes`, `keyFigures`, `citations` — ready to pass to `create_thesis_draft` |

What held: 21.08 is stated as the publication date; the meeting date is asserted nowhere;
officials are introduced as "reported"; the 09-06 restoration of the 4th-dose guidance
matches T1.

### FINDING 50 — the framing debate is not an input to synthesis

`suggest_thesis` has no `framingSessionId`. The researcher's round-2 correction — that
"חולפות"/"בלבד" are not on the archived page — lives on the session; the synthesis was
generated blind to it and re-derived the same phantom: the body describes the 09-06 page as
listing side effects that are "קלות וקצרות-טווח בלבד", and the legal section repeats
"קלות בלבד". The framing session attaches only afterwards, at `create_thesis_draft`, as
provenance — not as a constraint. **The mechanism built to stop a wrong framing becoming a
well-argued thesis about the wrong thing cannot reach the step that writes the thesis.**

### FINDING 51 — the interval collapsed back to a date

The topic string located the removal to the 24.07 → 05.08 interval. The body says
"ב-5 באוגוסט 2022 עודכן העמוד", while phrasing 06.09 correctly as "בתצלום מ-6 בספטמבר".
The 24.07 capture appears nowhere: no evidence record corresponds to it, the interval is
carried only by a trajectory, and the thesis can cite only evidence records. Prediction (a)
is visible one call early — the most exact statement in the topic string has nothing
citable to hang on.

### FINDING 52 — an enum leaks into the public body

"ניתוח השינויים הממוחשבים (FORENSIC_DIFF)" — an internal `EvidenceType` value in prose
intended for publication.

`readyForDraft` was **not** passed forward unchanged. The tool's own instructions permit
editing the body before `create_thesis_draft`; the edits are the researcher's.

### FINDING 53 — the phantom is re-derived, not leaked

Checked by the researcher before editing: the corpus is clean (no "חולפ" in any of the
seven cited summaries), and the synthesis prompt already forbids asserting beyond the cited
evidence and requires every claim be traceable to a cited hash. The phantom returned anyway.
The article truthfully says the ministry concealed findings about *prolonged* effects; the
model infers what the page must therefore have claimed — *short-term* — and attributes it.
A true premise about source A becomes a false claim about source B. This is the same
contrast-seeking inference that produced the original inversion in Part II, surviving a
corpus cleanup and an explicit stay-within-the-evidence instruction. A `framingSessionId` on
`suggest_thesis` (FINDING 50) would not stop it: the correction would be one more instruction
competing with an inference the model finds compelling. Distinct finding from the tool gap.

### Why edit rather than "let the Devil's Advocate find it"

Two reasons. The phantom misstates what the ministry told the public — that is the
defamation surface itself, not a strength question, and is not shipped as an experiment.
And the publication gate would not catch it: its citation check requires that the thesis
cite at least one record, not that every factual claim be cited. An uncited assertion passes
all thirteen checks.

### The edit — strike the attribution, keep the omission

| Claim | Status |
|---|---|
| the page listed the common effects and did not mention prolonged ones | **true, checkable** — an omission claim |
| the page said effects were short-term / transient | **invented** — an attribution the text does not carry |

"בלבד" is fine as an omission; the duration attribution is not. "קלות" is also a step
beyond — the page lists the effects without characterising them. Four substitutions,
applied mechanically with a uniqueness assertion on each, diffed, footnotes `[^1]`–`[^8]`
unchanged: the two duration attributions → "the common effects and when they appear, with
no mention of prolonged ones"; "on 5 August the page was updated" → "between the 24 July and
5 August captures"; the enum deleted. Two word-order seams the mechanical pass produced
(a doubled verb; a parenthetical stranded after the new clause) were returned to the
researcher rather than repaired silently.

### Prediction (a), stated before `create_thesis_draft`

The 24.07 → 05.08 interval is the most exact statement in the topic string and has no
citable evidence record; it exists only as a trajectory, and a thesis cites by `fileHash`.
The choice at the next call is: assert it uncited, soften it, or build trajectory citation.
The gate permits the first — which is itself the finding: **the strongest, most verifiable
claim in the thesis is the one the citation system cannot express, while weaker claims cite
cleanly.** Recorded before deciding, because it is an argument for `MentionType.CLAIM_TRAJECTORY`
rather than a reason to weaken the sentence.

### Call — `get_forensic_timeline`, to resolve a disagreement before asserting it

The researcher fetched Wayback's 2022-09-05 capture directly and found "נמצאו יעילים
ובטוחים לשימוש" **already present**, while the trajectory flips imply it first appears on
09-06. Checked against the platform's own stored record rather than either party's memory.

```
get_forensic_timeline
  url: "https://corona.health.gov.il/vaccine-for-covid/"
```

`status: COMPLETED`, `totalDiffs: 81`, `significantDiffs: 7`, `snapshotsStored: 83`,
`unanchoredSnapshots: 0`. Response 88,951 characters — over the tool-result limit; read from
the spilled file. Captures in the window: 07-24, 08-05 (×2), 08-07, 08-10, 08-13, 08-15,
08-16 (×2), 09-05, 09-06. Every diff between 08-05 and 09-05 is +0/−0: the removal held
across seven captures over six weeks. The stored 09-05 capture is `20220905111109`.

The 09-05 → 09-06 diff (+8/−8, significant) carries "יעילים ובטוחים" in an ADDED item's
`exactQuote`, alongside "אין סיכוי לחלות" and "פי 2". **Trajectory and diff layer agree
with each other; the researcher's direct fetch disagrees with both.** Reconcilable only if
the researcher's capture is a later 09-05 timestamp than 11:11 — in which case the platform's
one-capture-per-day selection hid an intra-day edit, and the body's sentence coupling the
FDA line to the restoration must be split. Unresolved at the time of writing; the body is
not finalised until it is.

### FINDING 54 — a stored snapshot's text is not readable through MCP

No tool returns a snapshot's `fullText`, and the timeline reports dates rather than
timestamps — the stored capture's timestamp is recoverable only from the `snapshotUrl` of
the diff *into* it. A researcher who needs to check the platform's copy of a page against
the archive cannot do so from the researcher's path. The disagreement above could not be
settled from here.

### FINDING 55 — all three significant diffs in the window are exactly +8/−8

07-24 → 08-05, 09-05 → 09-06 and 09-21 → 11-29 each report precisely eight added and eight
deleted items. Three distinct edits producing an identical count is an item cap, not a
coincidence. Whatever the ninth item was on each of those days is not in the record.

### FINDING 56 — the corpus is not clean at the item level, and FINDING 53 is contested

The researcher's cleanliness check covered the seven cited *evidence* summaries. The *diff
item* summaries beneath them, at `v3-self-contained-summary`, still carry the phantom
verbatim — the 09-05 → 09-06 ADDED item describing the restored side-effects paragraph
says it presents side effects as "קלות וקצרות מועד בלבד תוך שלילת סיכונים אחרים" — and a
second item in the same diff argues rather than describes ("מצג שגוי"). Whether synthesis
reads item summaries is not known from the researcher's path. FINDING 53's "re-derived, not
leaked" therefore has a second candidate cause that must be ruled out before it stands as
stated: the phantom has a surviving textual source one layer down.

### FINDING 57 — `fullText` is a Readability extraction, and the model says it is the page

Resolved by the researcher running the platform's own extractor (JSDOM + Readability) over
the exact stored capture, `20220905111109`:

| Phrase | raw HTML | readability |
|---|---|---|
| נמצאו יעילים ובטוחים לשימוש | present | absent |
| אין סיכוי לחלות בקורונה בגלל החיסון | absent | absent |
| לא התגלו בעיות בטיחות חריגות | present | present |

Readable text 4,330 chars against 6,266 of raw page text — **31% discarded**. (This first read
42%, against a 7,442-character denominator that still counted `<script>` and `<style>` bodies as
page text; re-measured on the same capture with those stripped. Treat the ratio as context, not as
the finding — it mixes boilerplate Readability is *supposed* to drop with the FDA line it must not.
**The dropped sentence is the finding.**) The stored
text is not wrong; it is not the page. `UrlSnapshot.fullText` is a Readability extraction,
and the data model documents it as page text. Trajectories, diffs, evidence identity and the
on-chain `contentHash` all inherit it. Two consequences:

- A change inside a dropped region is **invisible** — the FDA line was on the page on 09-05
  and the platform cannot see it.
- Readability's boundaries depend on page structure, so the same text can fall inside the
  article in one capture and outside it in the next. A trajectory can therefore show a
  **phantom flip** that is a layout change, not a content change.

This supersedes the "platform text is wrong" branch and is larger than the discrepancy that
surfaced it. It does **not** invalidate the anchors: they faithfully anchor what was stored.
What was stored is an extraction, and the model claims it is the page. Recorded, not built.

For the body: the restoration (05.09 → 06.09) and the six-week persistence hold in raw HTML
independently of Readability, so they are asserted. The FDA line is decoupled — present in the
09-06 capture, no "added" verb, because when it appeared cannot be answered from platform data.

### Paragraph 4 — rewritten, and a number caught on the way in

Paragraph 4 now carries the argument's temporal precision: the claims present in the 24.07
capture and absent from 05.08 stay absent across seven further captures to 05.09 — about
six weeks from the last capture that held them; the restoration is located to the one-day
05.09 → 06.09 interval, fifteen to sixteen days after publication; the FDA line is stated
as *present* in the 06.09 capture, with no "added" verb.

### FINDING 58 — a restated number travelled into a draft before anyone recomputed it

The researcher supplied "six weeks" in review for the persistence span. Anchored at 05.08,
as the first draft sentence was, the span is 31 days — about four and a half weeks. Six
weeks is 24.07 → 05.09, measured from the last capture that held the claims. The number was
right for one anchor and was restated against another; it reached a draft paragraph of a
public legal document before being re-derived. Same shape as Part II's summaries — a
number restated rather than recomputed — caught cheaply here because the paragraph was
printed verbatim before approval. Fixed by anchoring the sentence at 24.07, which is also
the stronger claim and the interval the topic string already establishes. "Fifteen days"
was likewise a round number for a 05.09 → 06.09 interval; it is now "fifteen to sixteen".

### The title — changed before the call

Proposed title stated concealment as fact ("הסתרת מידע בטיחותי") and carried a date range
(Aug–Sep) the body had already outgrown. Replaced with a descriptive title, no accusation,
no range: *שינויי מצגי הבטיחות בדף חיסוני הקורונה של משרד הבריאות, 2022*. The argument
belongs in the body, where it is hedged and cited.

### FINDING 59 — the most-quoted line in a thesis is checked by no route

Recorded against the publication gate (`docs/gf-thesis-publication-gate-dev-plan.md`), not
against this thesis. The gate's hedging check (check 7) runs over `head.userContent` only, so
`Thesis.title` is never examined. And check 7 fires only on sentences naming a key figure, so
an unhedged assertion about an *institution* would pass even if the title were included. The
title is what gets quoted, listed, and rendered on the whistleblower call page, and it is
covered by neither route. The researcher specced the gate and records the gap.

## Step 23 — `create_thesis_draft`

```
create_thesis_draft
  title: "שינויי מצגי הבטיחות בדף חיסוני הקורונה של משרד הבריאות, 2022"
  body: <the edited body — recorded on the thesis head version>
  citations: <8 entries from readyForDraft, unchanged>
  evidenceHashes: <7 hashes>
  keyFigures: <3 names>
  framingSessionId: "cmt5gm7lr0005f52m6v5fiy3r"
```

| Field | Value |
|---|---|
| `thesisId` | `cmt5jffqy000lf52mn6t56f3l` — **the first thesis on this environment** |
| `headVersionId` | `cmt5jffz6000nf52mpw4uyqvk` |
| `status` | `PENDING_AI` |
| `mentionsCreated` | 10 — 7 `EVIDENCE`, 3 `KEY_FIGURE` |

Not reversible through MCP: there is no `delete_thesis`.

### Prediction (a) — confirmed in substance, wrong in form

Predicted: a hard stop at `create_thesis_draft` because a trajectory cannot be cited.
Observed: **no stop.** The call accepted every argument and succeeded. The two most exact
claims in the body — the 24.07 → 05.08 removal interval and the seven-capture, six-week
persistence — are in the thesis uncited, because no field in the contract can carry a
trajectory, and nothing objected to their absence. A stop would have forced the decision;
silence let it pass. The citation system expresses the weaker claims cleanly and cannot
express the strongest one (see *Prediction (a), stated before create_thesis_draft*). This
is the argument for `MentionType.CLAIM_TRAJECTORY`, recorded and not built.

## Step 24 — The gate as a progress meter, then the Devil's Advocate

### Call 1 — `check_publication_readiness`, baseline

```
check_publication_readiness
  thesisId: "cmt5jffqy000lf52mn6t56f3l"
```

Writes nothing. 13 checks: **6 hard failures** — `ANALYSIS_COMPLETE`, `ANALYSIS_WELL_FORMED`,
`FIGURES_HEDGED`, `PUBLIC_INTEREST_STATEMENT`, `CALL_LIVE` (reason `ANALYSIS_INCOMPLETE`),
`RATIONALE_SUBSTANCE`; 2 advisory not assessed (`OFFICIAL_CAPACITY`, `GAP_ACTIONABILITY`);
check 6 `EVIDENCE_TIER` passes and declares itself `binding: false` because every record in
the vault is at or above Tier 2; check 13 `FRAMING_ATTACHED` passes with the session id and
question. `publishable: false`.

### FINDING 60 — the hedge vocabulary does not know attribution

Check 7 flags one sentence as naming three figures with no hedge marker. The sentence
attributes the names to the published report — "בהם **לפי הדיווח** …" — which is a hedge in
substance: it asserts that a report named them, not that they were there. The gate's
vocabulary evidently holds modal hedges ("לכאורה", "ייתכן") and not attribution phrases.
Recorded against the gate, beside FINDING 59. The sentence will carry "לכאורה" as well in
the next version, because the gate is what runs at publish time; but the fix is to the
vocabulary, not the sentence.

### Call 2 — `run_ai_analysis`

```
run_ai_analysis
  thesisId: "cmt5jffqy000lf52mn6t56f3l"
```

`status: COMPLETE`, `cached: false`, on `versionId: cmt5jffz6…`.

| Field | Value |
|---|---|
| `overallStrengthAssessment` | `MODERATE` |
| `evidenceGaps` | 2 — the full report behind the recordings; internal directives linking the room to the editors |
| `counterArguments` | 3 — post-hoc (`STRONG`); relocation to subpages is not concealment, citing T3/T6 (`MODERATE`); an FDA-approval statement is not a misrepresentation because an internal discussion existed (`STRONG`) |
| `alternativeInterpretations` | 2 — campaign-driven page focus; routine content churn |

### Prediction (b) — not triggered, and not yet tested

Two gaps, both actionable, both identical to the FOIA requests the adversary had already
drafted. The call has material to derive from. A `MODERATE` thesis says nothing about
whether a strong one would produce zero gaps; the prediction stays open.

### FINDING 61 — the Devil's Advocate answered a looser thesis than the one written

It saw the trajectories (it cites them by name) — Part II's work holds downstream. But its
`STRONG` post-hoc rebuttal argues that the texts "were removed and restored repeatedly
throughout 2022", which is true of T6 in May, while the body's actual claim is six weeks of
persistence followed by a one-day restoration fifteen to sixteen days after publication. That
claim is never engaged. Whether because those two sentences are the uncited ones — the
residue of prediction (a) — or because the critic argues by pattern, cannot be told from
the researcher's path. Its third counter-argument also restates a hedged body claim
("ככל שיתבסס…") as a flat assertion before rebutting it: the straw-man shape of FINDING 46,
on the other side of the argument.

## Step 25 — `get_research_agenda`

```
get_research_agenda
  thesisId: "cmt5jffqy000lf52mn6t56f3l"      # includeSuggestions left false: no model call, no suggested body
```

Writes nothing. Both gaps `resolved: false`, **`newHits: 0`** on each — every vault hit is
`alreadyCited`. Gap 0 ("the report behind the article") is offered the article. Gap 1
("internal directives to the editors") is offered the three May mechanism diffs — nearest
semantic neighbours in an eight-record vault, not evidence about directives.

### FINDING 62 — the agenda cannot say "the vault cannot close this"

Its instructions offer two moves: cite an uncited hit, or submit new evidence. Neither
applies: both gaps need documents that exist only inside the ministry. The tool has no
third state for a gap that is *external by nature* — which is precisely the gap a FOIA
request exists for, and the agenda does not point there.

### FINDING 63 — the article's intake summary still argues

The v3 self-contained pass ran over diffs. The article record's summary is an *intake*
summary and was never reclassified: it asserts concealment and manipulation as fact and is
the one summary in the corpus that speaks of *prolonged* effects. It is the most likely
textual seed of the contrast the synthesis keeps drawing (FINDING 53) — a third candidate
cause beside re-derivation and the item-level summaries (FINDING 56).

## Step 26 — The Devil's Advocate over a thesis that cites the deterministic layer

The thesis now carries 21 trajectory citations across 8 co-movement groups, prose
byte-identical (`docs/gf-trajectory-citation-dev-plan.md` §10). Head
`cmt728lod0002g8uulash6lw9`, `PENDING_AI`; the previously-critiqued parent is
`cmt5jffz6000nf52mpw4uyqvk`, `COMPLETE`.

FINDING 61 said the last Devil's Advocate answered a looser thesis than the one written, and
left the cause open: *"whether because those two sentences are the uncited ones … or because
the critic argues by pattern, cannot be told from the researcher's path."* Re-running it now
is the direct test.

### The prediction was measurable without the call, so it was measured

Stating a prediction is the method; guessing at one when the input is readable is not. What
`run_ai_analysis` hands the agent is `triggerAIAnalysis` in `src/services/thesisAnalysis.ts`,
and it is four values: the thesis text, the referenced evidence, the resolved gaps, and a
trajectory bundle. All four were computed for **both versions**, read-only, against staging.

| | HEAD (cites 21 trajectories) | PARENT (previously critiqued) |
|---|---|---|
| mentions | EVIDENCE 7 · CLAIM_TRAJECTORY 21 · other 3 | EVIDENCE 7 · CLAIM_TRAJECTORY 0 · other 3 |
| `extractText` | 3,905 chars · sha `4fcc9330…` | 3,905 chars · sha `4fcc9330…` |
| referenced evidence rows | 7 | 7 |
| trajectory block | 14,173 chars · sha `51b205e8…` | 14,173 chars · sha `51b205e8…` |
| groups shown / omitted | 8 / 7 | 8 / 7 |
| resolved gaps on parent | 0 | 0 |

### FINDING 64 — the citation does not reach the critic, so re-running it cannot test anything

**Every input is byte-identical.** Two independent mechanisms, both in the same function:

1. `extractText` resolves `keyFigureMention`, `evidenceMention` and `trackedUrlMention` to
   tokens and has **no case for `trajectoryMention`** (`src/utils/parseMentions.ts:33`). An
   unknown node with no array `content` returns `''`, so 21 citation nodes contribute nothing
   and the whitespace collapse absorbs the seams. The sha is the proof, not the reading.
2. `triggerAIAnalysis` fetches `mentions: { where: { type: 'EVIDENCE' } }` and then derives
   trajectories from **that evidence** via `loadTrajectoryContext(referenced)`. The
   CLAIM_TRAJECTORY mentions are never read.

`src/services/thesisAnalysis.ts:66` is the only mention consumer in the thesis path that
does not know the type exists — `getThesisContext`, `citeTrajectories`,
`getThesisTrajectoryCitations`, `thesisRoutes` and `thesisPublication` all filter on it.
This is the third instance of one blind spot: the revision path dropped trajectory citations
while preserving evidence ones, the renderer reported one co-movement as 21 findings, and now
the critique reads a thesis in which the citations are not there. Every path written before
`CLAIM_TRAJECTORY` existed still behaves as if it does not.

### FINDING 65 — the critic's trajectories are chosen by a cap, not by what the thesis cites

The bundle is evidence-derived and capped at `MAX_GROUPS_PER_URL = 8`; the page yields 15.
Against the 8 groups the thesis actually cites:

| | |
|---|---|
| cited groups **also** in the critic's context | **3 of 8** |
| cited but invisible | `bcb02872` `7cbfc789` `98020c19` `5d96c652` `2bc8f6a8` |
| shown but never cited | `444b89f0` `158ff2c8` `064b6938` `96613c20` `0e199121` |

So `T1`, `T5`, `T6` are cited; `T2`, `T3`, `T4`, `T7`, `T8` are not. The previous critique's
`MODERATE` relocation counter-argument cites **T3** — a trajectory the thesis does not invoke
at all. The critic argues from the vault's neighbourhood of the cited evidence, and the
document's own citations select nothing.

### FINDING 66 — the cap drops exactly the correction that made the citation honest

§10.1 of the citation plan recorded that the first citation set was **too narrow** — one
10-claim group — and that recomputing widened it to 21 claims across 8 groups, five of them
singletons. `MAX_GROUPS_PER_URL` keeps the largest 8 groups on the page (10, 8, 6, 5, 4, 2, 2,
2 claims), so **every singleton falls off**. The narrow set that would have under-supported a
true universal is fully visible to the critic; the eleven claims that make it true are not.
Truncation by group size is truncation by exactly the wrong key when the sentence being
defended is a universal — one small group is one potential counter-example.

### FINDING 61, diagnosed — the rebuttal was grounded in what the critic was shown

Recomputed timelines of the two cited groups with `finalState: PRESENT`:

```
[T5] 9d2c750b  4 claims  3 flips   2021-12-23 removed → 2022-01-05 present → 2022-08-05 removed → 2022-09-06 present
[T6] ae850859  2 claims  5 flips   2021-12-23 removed → 2022-05-25 present → 2022-05-29 removed → 2022-05-30 present → 2022-08-05 removed → 2022-09-06 present
[T1] 3313cbaa 10 claims            2021-12-23 removed → 2022-05-25 present → 2022-05-29 removed → 2022-05-30 present → 2022-08-05 removed → 2022-09-06 present → 2022-11-29 removed
```

"Removed and restored repeatedly throughout 2022" is a fair reading of T6 as presented, and
every visible cited group restores on **2022-09-06** — one day after the window the sentence
closes on. What the critic never received is the count: 21 claims share the 2022-08-05
removal and **0** return across the seven captures up to 2022-09-05. The context carries
per-group timelines and no aggregate over any window, and no marker of which groups a given
sentence rests on. Neither branch of FINDING 61's open question was right: not "the sentences
are uncited" (the critic cannot see citations either way) and not "the critic argues by
pattern" (it argues from the timelines it was handed) — the answer is that the question the
sentence asks was never put to it.

### Prediction (d), stated before the call

Input identical, `temperature: 0`, a fresh version so nothing is served from cache:

- the critique returns `MODERATE`, 3 counter-arguments, 2 evidence gaps, 2 alternative
  interpretations — the same shape as Step 24;
- the `STRONG` post-hoc rebuttal reappears, still resting on restoration rather than on the
  six-week persistence claim, so **FINDING 61 reproduces**;
- the straw-man shape of FINDING 46 reappears, nothing having changed in the prompt;
- any difference at all measures the **temperature-0 variance floor** of this agent and says
  nothing whatever about the citations.

That last point is why the call is still worth making: it is no longer a test of whether
citations change the argument — that is answered, and the answer is that they cannot — but a
controlled measurement of how much a critique moves when its input does not.

### Not run — the connector is unauthorized

`run_ai_analysis` was not called. The `gf-staging` MCP server needs reauthorizing in claude.ai
connector settings, and this session cannot run the OAuth flow. The prediction above is on the
record before the call, which is the only ordering that makes it worth anything.

Everything above was measured read-only against staging, outside MCP, because it is a
measurement of the platform rather than a step in the researcher's path. Nothing was written.
The pinned computation `cmt5b3gji0005jdk4p4wi2lu8` (2026-08-23, 83 snapshots) is still the
latest, so the trajectory block reproduced today is the one the earlier critique received.

### Open, and the user's to decide — the cited set includes boilerplate

Of the 21 cited claims, at least two are page furniture that happens to share the 2022-08-05
removal: a vaccination-site map line and a "more info" link. They are legitimately part of the
universal — the sentence is about what disappeared and stayed gone, and they did — but standing
beside the efficacy and safety claims they dilute the finding for a reader who scans the panel.

Narrowing the set is **not a silent edit**: `cite_trajectories` refuses duplicate citations, so
a narrower set means a new version, a new `contentHash`, and re-running the gate. The three
options are to keep it whole (defensible: the universal is what was proven), to split the
sentence so the strong claims and the boilerplate are cited separately, or to narrow and accept
that the sentence's support no longer matches its scope. That is an editorial call, not a fix.

## Step 26 — Re-running the Devil's Advocate, and why it was not run yet

The plan was one call: `run_ai_analysis` over the thesis now that it cites 21 trajectories, as
the direct test of FINDING 61 — whether a critique changes when the document it critiques gains
citations to the deterministic layer.

**Prediction, stated before anything was read:** the critique would engage the six-week persistence
claim it previously ignored, because that sentence now carries eight footnote markers and is the most
heavily cited sentence in the document; the post-hoc counter-argument would survive but lose its
"removed and restored repeatedly throughout 2022" basis; the strength assessment would stay
`MODERATE`; the two gaps would stand, since no citation says anything about internal ministry
documents.

**Every part of that prediction was untestable, for a reason the prediction did not consider.** The
critique's input does not contain the citations at all.

### FINDING 64 — the critic could not see a single citation, by two independent mechanisms

Read before calling, because the prediction was about what the model would do with an input that had
to be checked first:

- `extractText` in `services/thesisAnalysis.ts` resolves `keyFigureMention`, `evidenceMention` and
  `trackedUrlMention` to tokens and has **no case for `trajectoryMention`**. An unknown node with no
  array `content` returns `''`, so 21 spliced mention nodes contributed nothing. The thesis text
  handed to the critic is the same string before and after the citation — which is also exactly what
  `cite_trajectories` promises about the PROSE, and the promise was quietly extended to the citations
  themselves.
- `triggerAIAnalysis` loads `mentions: { where: { type: 'EVIDENCE' } }` and derives trajectories from
  **that evidence**, via `loadTrajectoryContext(referenced)`. The `CLAIM_TRAJECTORY` mentions are
  never read. Which trajectories the critic sees is a function of which pages the cited evidence came
  from — unrelated to what the thesis cites.

Every other consumer of `MentionType` knows about `CLAIM_TRAJECTORY`: `get_thesis_context`,
`get_thesis_trajectory_citations`, `cite_trajectories`, the publication gate, both thesis routes.
`thesisAnalysis.ts` is the single one that does not, and it is the one feeding the adversary.

### FINDING 65 — measured: 3 of the 8 cited movements reached the critic, not 8

Not reasoned about — recomputed read-only against computation `cmt5b3gji0005jdk4p4wi2lu8`, the pass
the citations are pinned to, by replaying `loadTrajectoryContext`'s own selection rules over its 58
rows.

| | |
|---|---|
| groups on the page | 21 |
| passing the flip threshold (`minTransitions: 2`) | 15 |
| shown to the critic (`MAX_GROUPS_PER_URL`) | 8 |
| **cited movements reaching the critic** | **3 of 8** |
| **cited claims reaching the critic** | **16 of 21** |
| dropped by the flip threshold | 1 movement |
| dropped by the cap | 4 movements |
| of the 8 groups shown, how many the thesis does not cite | **5** (23 claims of context) |

The cap keeps the LARGEST groups. The citation set had been widened, correctly, from one ten-claim
group to 21 claims across eight movements — five of them singletons — because the sentence it supports
is a UNIVERSAL and one counter-example falsifies it (§10.1 of the trajectory-citation plan). Size-
ranked truncation dropped exactly the singletons the correction added. **The narrow set that would
have under-supported a true sentence survived; the correction that made it honest did not.**

### FINDING 66 — the one cited claim with a single flip is the one the critique argued about

`loadTrajectoryContext` calls `getClaimTrajectories(url)` with no options, so `MIN_TRANSITIONS = 2`
applies: a claim that was removed once and never restored is filtered out before the cap is even
reached. The threshold is right in general — one flip is an ordinary removal, already fully visible in
the forensic timeline.

Of the 21 cited claims exactly one has `transitions: 1`. It is the FDA-approval sentence, present
2021-12-23, absent from 2022-08-05, never restored. **It is the subject of the previous critique's
third counter-argument, rated `STRONG`** (Step 24). The critic argued about a removal while the
deterministic record of that removal was excluded from its input by a threshold that had no idea the
thesis was citing it.

This is the mechanism behind part of FINDING 61, and it is not a model failure. The critic argued by
pattern because the pattern was all it was given.

### The fix

Applied on `feat/gf-critic-sees-cited-trajectories`. Backend 1352/1352, `tsc` clean, `eslint src/`
back to its exact pre-change count (362 problems — the new code adds none).

- `loadTrajectoryContext(evidence, citedTrajectoryIds)` — second argument **required**, not defaulted,
  on the same reasoning as the agent's `trajectories` parameter: a default of `[]` is precisely how a
  caller silently reasons without them. Framing and synthesis pass `[]` explicitly, and both are
  honest — they run before a document exists.
- Citations match live groups **by claim hash**, never by row id or `patternHash`. Both belong to the
  pass they were computed in; the claim hash is the only identity that survives a new one.
- A cited group is **never dropped**, by the cap or by the flip threshold. Uncited groups keep the
  threshold. Where citations alone fill the cap, no uncited group is shown: uncited groups on the same
  page are context, cited ones are what the document argues from.
- Citations that resolve to no current group are reported as `citedNotResolved` rather than dropped —
  the same rule `omittedGroups` already followed.
- The excerpt quotes a group's **cited** members first. Four arbitrary members of a ten-claim group
  can quote none of the three a thesis rests on.
- `extractText(doc, trajectoryLabels?)` renders `#traj_T<n>` **only when labels are passed**, and the
  critique is the only caller that passes them. The gate's hedge and figure checks, `audit_thesis_claims`
  and every stored preview depend on `cite_trajectories` leaving the prose byte-identical; injecting a
  token for them would make citing a claim silently change the text being verified.
- A run of markers citing the same movement collapses to one. Emitting ten identical markers for a
  ten-claim co-movement is the renderer's old defect — one finding reported as ten (§10.3) — moved
  into the prompt, where nothing downstream would ever collapse it.
- The trajectory block now states what is cited and what is not, and says so in both languages, with
  the totals: *"THIS DOCUMENT CITES 21 claims across 8 trajectories."*

Nine tests, all written from the measurement above rather than from the shape of the code: a cited
singleton survives a full cap; a cited single-flip group survives the threshold while an uncited one
does not; a citation pinned to an earlier pass still resolves; an unresolvable citation is reported;
`extractText` without labels is byte-identical to the same document with no citations at all.

### FINDING 67 — the first version of the fix was shaped by the one thesis it was tested on

Asked directly whether the change captures the domain problem or merely fits this example, an audit of
it found two places where it only worked because of what this thesis happens to look like. Both were
fixed; both are worth recording, because the question found them and reading the code had not.

- **The pages searched came from the EVIDENCE, never from the citations.** `loadTrajectoryContext`
  derived its URL list from the diffs the cited evidence was promoted from. All 21 citations here are
  on the same corona page that the evidence came from, so it worked — by coincidence. Nothing requires
  that: the publication gate requires evidence, not evidence from the same page. A citation on any
  other page resolved to nothing and was then reported as `citedNotResolved`, whose stated meaning is
  *"the claim is no longer followed"* — a page that was never looked at, described as a claim that
  stopped being true. The URL set is now the union of both sources, and a thesis citing trajectories
  with no diff-based evidence at all resolves them correctly.
- **Exempting citations from the cap removed the only bound on the block.** With 8 cited movements
  against a cap of 8 that is invisible; with 25 it would be an unbounded prompt. A detail budget was
  written for it — every cited movement still listed, quotes and snapshot links dropped past the
  eighth — and then **reverted**. See FINDING 68.

What survived the audit unchanged, and why it is not example-shaped: matching by claim hash is forced
by the data model (rows are never updated in place, `patternHash` changes on every new capture);
"cited is never silently dropped" is an invariant, not a threshold; reporting rather than dropping
already had a precedent in `omittedGroups`; and the opt-in prose markers protect the byte-identical
prose guarantee that exists independently of any thesis.

### FINDING 68 — the second version of the fix started legislating for a scale the domain does not produce

Two bounds were written on top of the fix and both were removed before they landed: a detail budget for
a trajectory block with more than eight cited movements, and `MAX_EVIDENCE_PER_THESIS = 12` enforced on
every version-creating path plus a hard gate check.

**Neither came from an example.** The twelve was extrapolated from two RETRIEVAL caps that already
exist — framing assembles at most 12 records, `suggest_thesis` defaults to 10 — and dressed up as a
domain rule. The real thesis cites 7. Nothing in the corpus has approached either bound.

The domain reason they were unnecessary is the more interesting half, and it is a design position this
document had not stated: **a thesis is meant to rest on a contained set of evidence.** Breadth is not
supposed to be absorbed by one thesis growing; it is meant to be handled by COMPOSITION — a thesis
built on other theses that already survived their own gate, each carrying its own contained basis
(whistleblower-document-backed ones being the obvious first class). That layer does not exist and has
not been designed. Writing a numeric ceiling now would have hard-coded an answer to a question that
belongs to that design, and would have done it inside the write path, where it is hardest to revisit.

The distinction that decided what stayed: a fix for a **wrong answer** any thesis can produce today
stays; **policy for a scale the domain does not generate** goes. By that rule the citation-page fix
above stayed — the mislabelling is reachable now, at any size — and both bounds went.

**Open design question, recorded not answered:** how a thesis builds on other theses. Until it exists,
a researcher whose argument genuinely needs a wide basis has no path except a wide thesis, and there is
no limit stopping them. That is the honest state, and it is better than a number nobody measured.

### Not done, and deliberately

**`run_ai_analysis` has not been re-run.** The fix is local; staging is serving the unfixed build, so
calling it now would produce a critique from the old path, overwrite the head version's analysis, and
prove only what has already been measured more precisely by recomputation. The call is worth making
once — against a staging backend that has the fix.

### Still the researcher's decision, not the tooling's

The measurement confirms the editorial question rather than settling it. Two of the eight cited
movements are boilerplate that genuinely shares the 2022-08-05 removal: the vaccination-site map
sentence (its own movement, 6 flips) and a "more information" link, which travels in a two-claim
movement together with the side-effects sentence. They are correctly cited and they dilute the strong
claims. Narrowing the set requires a NEW version — `cite_trajectories` refuses duplicate citations —
and that is a judgement about the argument, not a defect to be fixed underneath it.

### Environment note

`backend/.env` labelled its database block with the **production** project ref, above a
`DATABASE_URL`, `DIRECT_URL` and `SUPABASE_URL` that all point at **staging**. The values were right
and the label was wrong, which is the more dangerous direction: a destructive statement is reviewed
against the label a human reads, and here the label said production while the connection was staging.
Corrected to name staging, with a line pointing at `.env.production.local` for the deliberate case.
(Refs deliberately not reproduced here — this repository is public. `.env` is gitignored, so the fix
is local and does not travel with this branch.)

## Step 27 — The critique, re-run against a backend that can see the citations

PR #136 landed on `staging` (`4eada89`), staging redeployed SUCCESS, and `run_ai_analysis` ran once
on head `cmt728lod0002g8uulash6lw9`. `status: COMPLETE`, `cached: false`.

| Field | Before (Step 24) | After |
|---|---|---|
| `overallStrengthAssessment` | `MODERATE` | `MODERATE` |
| `counterArguments` | 3 | 3 |
| `evidenceGaps` | 2 | 2 — **both rewritten** |
| `alternativeInterpretations` | 2 | 2 |

Predictions scored honestly: **P3 and P5 confirmed** (count and strength unmoved). **P4 wrong on
content** — the gap count held but both gaps changed. **P2 wrong.** **P1 half wrong.** **P6
confirmed, against the change.**

### FINDING 69 — the critique now argues by trajectory label, and is therefore checkable itself

The STRONG counter-argument reads *"ניתוח המסלולים (Trajectories T1, T3, T4)"* and names the months
those movements flip in. The labels travelled: block `[Tn]`, prose marker `#traj_Tn`, and the critic's
own citation are the same trajectory by construction.

This is a capability the critique did not have. A rebuttal that names T1 can be audited against the
archive by anyone — the labels were recomputed from the pinned computation, independently of the
model's output, to check exactly that below. **The adversary is now subject to the same standard as
the thesis.**

### FINDING 70 — the boilerplate in the cited set became the adversary's strongest weapon

The open editorial question was whether citing a vaccination-site map line and a "more information"
link — both of which genuinely share the 2022-08-05 removal — dilutes the strong claims. It is now
answered by measurement rather than taste.

Recomputing the label assignment from the pinned computation, in the order the bundle renders:

| Label | Claims | Flips | What it is |
|---|---|---|---|
| T1 | 10 | 6 | the fourth-dose / risk-group block |
| T3 | 2 | 5 | side-effects sentence **+ a "more information" link** |
| T4 | 1 | 6 | **the vaccination-site map line** |

**T1, T3 and T4 are precisely the three the critic used**, and two of them are the boilerplate. The
argument it builds is that these texts came and went repeatedly through May, August, September and
November — which is *true of all three*, and most obviously true of a daily-updated clinic map, whose
oscillation says nothing whatever about safety messaging.

So the cost of citing boilerplate is not dilution in the abstract. It is a specific `STRONG`
counter-argument, correctly reasoned from correctly cited data, that the researcher handed to the
other side. Narrowing the citation is now a decision with a measured consequence attached — still the
researcher's to make, and it requires a new version, since `cite_trajectories` refuses duplicates.

### FINDING 71 — a claim can be made visible and still not be reasoned about

The whole of FINDING 66 was about one claim: the FDA-approval sentence, single-flip, excluded by the
`minTransitions: 2` read filter, and the subject of the previous critique's third `STRONG`
counter-argument. It is now in the prompt as **T8**, marked cited, with its timeline.

The critique does not mention it. Instead it invokes FDA approval in the *opposite* direction — as a
reason the ministry's public representation was reasonable — without noting that the sentence asserting
that approval is itself one of the claims removed on 2022-08-05 and never restored.

Getting a claim into the context is necessary and is not sufficient. That distinction was invisible
while the claim was being filtered out, and it is the next thing worth attacking.

### FINDING 72 — the change cost the critique an argument, and this is the honest ledger

Spending the whole per-page cap on citations removed 5 uncited groups (23 claims) from the prompt. The
previous critique's second counter-argument — relocation to subpages is not concealment — leaned on two
of them, and it is gone.

What replaced it is not nothing: the new second and third counter-arguments reason from the evidence
records instead, one citing an evidence hash directly to argue that quantitative figures were dropped
in November 2022 because a reformulated vaccine had arrived. Whether trading uncited page context for
complete citation coverage is net-positive is genuinely arguable. It is recorded rather than settled,
and `omittedGroups` reports the 13 groups now withheld so the loss is visible in the prompt itself.

### The gaps changed, and toward the thing FINDING 62 said was missing

Both `evidenceGaps` were rewritten. The first still asks for the full Berkovitch report and the
official discussion protocols. The second is new and is no longer a documents request at all: it names
the **absence of evidence of reliance and specific damage** — vaccinees who relied on the page at the
point of informed consent.

FINDING 62 recorded that the agenda has no third state for a gap the vault cannot close. This gap is
worse than that and more useful: it cannot be closed by any document, only by claimants. It is the
first output of this workflow that points outside the archive entirely.

## Step 28 — Support and context stop competing

### What this staging exercise is actually for

Stated by the user while deciding this change, and worth recording because it settles a class of
trade-off that keeps recurring: **the purpose of running a real thesis on staging is to uncover and
model how a thesis evolves through debate between a human and an AI critique.** Prompt economy is not
the thing being optimised. Adversarial coverage is. A regression that costs the critique an argument
is therefore expensive even when it costs no tokens — which is why FINDING 72 was worth acting on with
n=1 rather than waiting for a second example.

### FINDING 73 — one budget was serving two different kinds, and only citations made it visible

`MAX_GROUPS_PER_URL = 8` was a single per-page allowance. Exempting citations from it (PR #136) made
them draw from it, so eight cited movements left `room = 0` and every context group was squeezed out.

The defect was not the exemption. It was that **support and context had always shared one budget**:

- a **cited** movement is SUPPORT — completeness is the point, since a partial citation set is a
  dishonest one, and that is exactly why this citation was widened from one group to eight;
- an **uncited** movement on the same page is CONTEXT — a sample was always sufficient, and nothing
  ever needed all 21 groups the page produces.

While they shared an allowance, a thesis paid for its own honesty by starving its critic of context.
That conflation predates citations entirely; it was simply invisible while nothing was cited.

**The fix introduces no new constant.** Citations draw from no budget at all. The existing 8 —
already the justified answer to "how much page context is enough" — becomes exactly that and nothing
else, renamed `MAX_CONTEXT_GROUPS_PER_URL`.

Context is rendered SHORT once a document is citing: shape, timeline and evidence overlap, but no
quotes and no snapshot links. The distinction is of **kind, not of count** — support must be checkable
word by word because a critique rests on the exact string, while context only has to be recognisable
as a pattern. (An earlier attempt shortened *cited* blocks past an arbitrary count and was reverted;
see FINDING 68. This one is a rule about what a thing is FOR.) Overlap survives the shortening,
because "this uncited movement contains claims that appear in your evidence" is the strongest signal
that a context group is relevant at all, and it costs one line. Nothing is shortened until something
is citing, so framing and synthesis read exactly as before.

The note that accompanies it tells the critic what it is looking at and what to do about it: *if one
of these is load-bearing for your answer, say so explicitly rather than relying on wording you were
not shown.*

### Measured on the real thesis, recomputed against the pinned computation

| | Blocks | Cited movements | Cited claims | Context groups | Eligible groups withheld |
|---|---|---|---|---|---|
| before #136 — shared budget, size-ranked | 8 | 3 of 8 | 16 of 21 | 5 | 8 |
| after #136 — shared budget, cited exempt | 8 | 8 of 8 | 21 of 21 | **0** | 8 |
| **with the split** | 16 | 8 of 8 | 21 of 21 | **8** | **0** |

FINDING 72 is closed, and the result is not a restoration: context coverage goes from five groups to
eight, and **nothing eligible is withheld from the critique at all** for the first time in this
exercise.

### Left open on purpose

Uncited groups are still sampled **by size**, which is a rougher key than it looks. The context an
adversary actually wants is what else moved ON THE SAME CAPTURES as the cited claims — a co-movement
sharing 2022-08-05 is what makes "routine churn" arguable or not, and a large group that moved on
unrelated dates is nearly useless for that. No example has yet shown size-ranking picking the wrong
context, so no heuristic was invented for it. Recorded, not built.

Backend 1356/1356, `tsc` clean, `eslint src/` unchanged at its pre-change count.

## Step 29 — The critique cannot be re-run, and nothing knows it is stale

Staging redeployed SUCCESS at `f4b7fb8` (deployment `e30d425d`), and `run_ai_analysis` was called on
the same head version to test whether restoring context brought back the argument FINDING 72 lost.

It returned **`cached: true`**, byte-identical to the Step 27 output. No model call was made.

### FINDING 74 — staleness is inferred from a transition, so a critique outlives the facts it was computed from

`run_ai_analysis` serves the stored analysis whenever `status === 'COMPLETE' && aiAnalysis !== null`.
The cache key is *"does this version have an analysis"* — never *"is this analysis still an answer to
the input that would be produced now"*.

And `PENDING_AI` is set in exactly five places, all of them **version creation**
(`create_thesis_draft`, `add_thesis_version`, `cite_trajectories`, and the two REST paths). Nothing
else invalidates a critique. So a stored analysis survives every change that is not a new version:

- the evidence summaries being corrected — a feature this platform HAS (`summary_correction`);
- a new detection pass changing what the trajectories say;
- a change to what the critic is given, which happened **twice today**, and is the entire subject of
  Steps 26–28.

This is the transition-versus-state failure again, in a third place: the system flips a flag when it
observes an event, instead of deriving the answer from what is true now. A version created before the
fix keeps its pre-fix critique, forever, and check 2 `ANALYSIS_COMPLETE` passes on it. **A thesis can
therefore publish carrying a critique computed against facts that have since changed**, with every
hard gate green.

The measurement this blocked is the smaller loss. The integrity gap is the finding.

### The fix, built

Store a fingerprint of the critic's ACTUAL INPUT beside the analysis: thesis text as serialised for
the critique, the rendered trajectory block, the evidence summaries, the summary caveat. Serve the
cache only when the fingerprint matches; otherwise re-run. Staleness then comes from comparing state,
and would have invalidated automatically today — twice — with nobody having to notice.

`contentHash` already exists but is the wrong instrument: it hashes `{ userContent, aiAnalysis }` —
output, for publication pinning — and cannot see the inputs at all.

A `force: true` parameter would unblock the experiment in ten minutes and fix nothing: it makes
correctness depend on a human remembering, which is the property that produced this finding.

**Built as `ThesisVersion.analysisInputHash`**, migration `20260824230000_thesis_analysis_input_hash`
— one nullable `ADD COLUMN`, additive, applied by the pre-deploy step. `db:check-drift` reported
"No difference detected" BEFORE the migration was written, and the SQL was generated offline from the
schema rather than diffed against a database.

Three decisions worth keeping:

- **The hash covers the exact message array**, produced by a newly exported pure
  `buildCritiqueMessages()`. Hashing anything adjacent to the model's input — the document, the
  bundle, a list of ids — leaves a gap between what changed and what was checked. The SYSTEM PROMPT
  is inside it deliberately: rewriting how the critic is instructed changes the critique, and a
  reworded prompt with a stale answer beside it is this same finding again.
- **The cache decision moved into `triggerAIAnalysis`.** `run_ai_analysis` used to make it itself, and
  a rule with a copy in each caller is the defect class this entire sequence has been about — it is
  how the critique came to be blind to citations in the first place.
- **NULL is "unknown", never "current".** Every version analysed before the column re-runs on next
  call, which is what makes the staging thesis testable again rather than permanently frozen.

Tests are written from the three real causes of staleness rather than from the code's shape: a
corrected evidence summary, a new detection pass, and a version predating fingerprints. The existing
test asserting `COMPLETE ⇒ cached` encoded the defect, so it was rewritten to the new contract — and
gained the case the old one could not express: COMPLETE, holding an analysis, and still stale.

Backend 1362/1362, `tsc` clean, `eslint src/` unchanged. The only pending schema difference is this
migration itself.

## Step 30 — The third run, and a retraction

Staging redeployed SUCCESS at `ecfe08e` (deployment `4c8c58b4`), the migration applied through the
pre-deploy step, and the column was verified read-only: `analysisInputHash`, nullable text, with **2
COMPLETE versions holding no fingerprint** — exactly the state that makes them re-runnable.

`run_ai_analysis` returned **`cached: false`**. FINDING 74's fix works end to end: a critique that
could not be re-run at all four hours ago recomputed because its stored fingerprint was NULL.

### Predictions, scored

| | |
|---|---|
| **Q3 — `MODERATE` holds, post-hoc rebuttal survives as `STRONG`** | **confirmed**, third consecutive run |
| **Q2 — the FDA claim stays unengaged** | **confirmed**, and more starkly: run 3 does not mention FDA at all |
| **Q4 — the critic ignores the invitation to flag uncited wording** | **not tested** — it cited no context group, so the invitation never applied |
| **Q1 — the relocation argument returns** | **partially, and not for the predicted reason** — see below |

Counter-argument 2 is the relocation family in a new form: the page is a summary that points elsewhere
for detail. But it is sourced from **cited** trajectories (T5, T6), not from the restored context. So
the argument came back without using the thing whose restoration was supposed to bring it back.
**PR #137 cannot be credited with it**, and one run cannot separate that from ordinary
non-determinism.

### FINDING 75 — the labels are positional, so a stored critique becomes unreadable. FINDING 69 is partly wrong.

FINDING 69 claimed the critique had become auditable because it argues by trajectory label. That is
true of a LIVE critique and false of a stored one, and the difference was invisible until a second run
existed to compare against.

`T{n}` is assigned by position in the bundle. PR #137 added eight context groups interleaved by size,
so every label after the first moved:

| Label | Run 2 (post-#136) | Run 3 (post-#137) |
|---|---|---|
| T1 | 10-claim cited | 10-claim cited |
| T3 | side-effects + "more info" link, cited | 6-claim **context** group |
| T4 | **the vaccination-site map**, cited | 5-claim **context** group |
| T6 | — | side-effects + "more info" link, cited |

Run 2's critique says its `STRONG` rebuttal rests on "T1, T3, T4". Read against run 3's bundle that
sentence names two context groups the thesis never cited. **The stored critique from Step 27 is now
unreadable**, and nothing in the record says so.

The fingerprint from FINDING 74 protects the live case completely — a changed bundle changes the
rendered block, so the critique re-runs rather than being served with labels that no longer resolve.
What it cannot protect is the ARCHIVE: every superseded version keeps its analysis, and those labels
refer to a bundle nobody stored.

**Fixed.** A movement is now named by its **lowest member claim hash**, prefixed `T` and shortened to
eight hex characters — `T3f2a1b7c` rather than `T3`.

A claim hash is the hash of the normalised claim text, so it is stable across every detection pass by
construction. The label therefore points at a **real row anyone can look up by `claimHash`**, and it
either matches or it does not — it cannot quietly come to mean something else, which is the only
property that makes a critique auditable after the fact. That is also why this beats storing the label
map beside each analysis: a self-resolving label needs no side table to survive.

Uniqueness is a property of the SET, so it is checked rather than assumed: on a collision every label
in the render widens together, keeping them comparable with each other.

The four tests are written from the finding rather than the code — the label is derived from the
lowest member hash; **the same group keeps the same label when other groups appear beside it** (the
finding itself, expressed directly); the label resolves against a real claim hash; and colliding
prefixes widen together.

Backend 1366/1366, `tsc` clean, and `eslint src/` came down by one — the positional index it needed is
gone.

### FINDING 70 survives the re-run, and narrows

The vaccination-site map dropped out of the `STRONG` rebuttal — in run 3 it is cited (T10) and unused.
The **"more information" link did not**: it appears in both of run 3's first two counter-arguments,
and counter-argument 2 quotes its text directly as evidence that the page deliberately refers readers
elsewhere for detail. So of the two pieces of boilerplate, one was a run-specific accident and the
other is doing adversarial work consistently, in a defence the thesis has no answer to yet.

### An observation nobody asked the archive for

T8 in run 3 is a context group reading *"four vaccine types are approved in Israel"*; T16 is the cited
single-flip claim reading *"three vaccine types are approved in Israel"*. The page changed its own
count. Both were in front of the critic, which engaged neither — the same silence as FINDING 71, now
with the two halves of a contradiction sitting eight labels apart.

## Step 31 — The gate was still passing a stale critique

Found on the way to publishing, which is where it would have mattered.

### FINDING 76 — the fingerprint closed the serving path and not the gate

FINDING 74 said, in its own words, that *"a thesis could publish carrying a critique argued against
facts that had since changed, with every hard gate green."* The fix made `run_ai_analysis` re-run
instead of serving a stale answer. **Check 2 was never touched.** It still asks
`status === 'COMPLETE' && aiAnalysis !== null` — whether an analysis EXISTS — and nothing asked
whether it still answers anything.

So the sentence that motivated the fix remained true after it. Nobody had to do anything wrong: the
label change one commit earlier altered the rendered trajectory block, which is part of the critic's
input, so the stored critique was stale by the fingerprint's own definition while the gate would still
have published it.

**Check 16 `ANALYSIS_CURRENT`, hard.** Check 2 asks whether an analysis exists; check 16 asks whether
it still answers the facts. Two questions, two checks, two different remedies — *run it* versus
*re-run it* — and conflating them is exactly how the first one came to be read as the second.

The assembly of the critic's input is now extracted (`buildCritiqueInput`), so the gate and the runner
cannot disagree about what that input is. They already had disagreed in spirit, which is the whole
finding.

Backend 1367/1367, `tsc` clean, `eslint src/` still one below where the session started.

## Step 32 — Closing FINDING 60, by fixing the vocabulary rather than the sentence

The gate refused the thesis over one sentence naming three officials:

> …בהם **לפי הדיווח** דר' שרון אלרואי-פרייס ודר' אמיליה אניס

Two ways to clear it, and they are not equivalent. Adding **לכאורה** clears the gate today, at the
cost of hedging a sentence that was already accurate and weakening a true attribution — the report
did name them. Fixing the vocabulary is the correct fix, because the vocabulary is what runs at
publish time on every future thesis. **The researcher chose the vocabulary**, having been told
plainly that it means changing the gate to admit their own document — which is the shape of thing
that should be decided out loud.

### FINDING 60 closed — there are two kinds of hedge and only one was written down

A **modal** hedge softens the assertion: לכאורה, ייתכן כי. An **attributive** hedge says who is
asserting it. "According to the documents, X" does not claim X; it claims the documents say X — a
different and **checkable** proposition. That is COMPLIANCE.md Rule 1 satisfied more precisely than a
modal, not less.

The list already held attribution — to **documents** (על פי המסמכים, המסמכים מצביעים, על פי ראיה).
It simply had no phrase for attributing to a published **report**. So the check refused a sentence
whose entire purpose it exists to serve, and the defect was a missing member of a category the record
had already established, not a missing category.

Six phrases added as one category (לפי הדיווח, על פי הדיווח, לפי הפרסום, על פי הפרסום, לפי התחקיר,
על פי התחקיר), and the rule for extending it written down beside them: **a phrase qualifies only if
it attributes the assertion to an identified external source, or marks it as unproven — softening
TONE does not qualify.** The defamation-risk record was amended in the same change, because the code
defers to it and a vocabulary extended in code alone is a rule nobody agreed to.

**The floor did not move**, and there is a test asserting that beside the ones asserting the new
markers pass: a flat, unattributed naming still fails. Widening a gate is only safe if you can
demonstrate what it still refuses.

Backend 1376/1376, `tsc` clean, `eslint src/` unchanged.

## Step 33 — Published

`publish_thesis` returned `published: true`, version `cmt728lod0002g8uulash6lw9` pinned at
2026-08-24T23:53:26Z, verdict **SUPPORTS**, `overObjection: false`, no hard failures. The first
thesis this platform has published.

What it took, in order, and what each step actually fixed:

| Blocking check | Cleared by |
|---|---|
| 7 `FIGURES_HEDGED` | the hedge VOCABULARY, not the sentence (Step 32) |
| 16 `ANALYSIS_CURRENT` | `run_ai_analysis`, re-running because the label change altered the block |
| 2, 3, 9 | the same call |
| 8 `PUBLIC_INTEREST_STATEMENT` | written |
| 10 `RATIONALE_SUBSTANCE` | written — and rewritten once, see below |

### The rationale that passed was the second one, and the first was wrong on the facts

The first draft conceded the Devil's Advocate's `STRONG` post-hoc rebuttal as "recorded and
unanswered". The researcher rejected the posture: *we are not ignoring the critic — we have a call for
witnesses and a FOIA path, and if the thesis is right, inside information settles it.*

Checking the archive before rewriting showed the posture was not merely apologetic but **too
generous**. Measured over the cited movements' own observations:

| | May 2022 | August 2022 |
|---|---|---|
| captures absent | **1** | **9** |
| days absent | **4** | **44** |

and two of the eight cited movements — including the FDA/three-vaccines claim — **never returned at
all** (34 captures, to the end of the archive).

The critique's rebuttal works by treating a four-day, single-capture blip and a forty-four-day,
nine-capture absence as the same phenomenon. **That objection is answerable from the archive the
thesis already cites**, with no new evidence. The rewritten rationale says so, states the two things
that remain genuinely external, and names the call and the FOIA requests as what is pointed at them.

The assessor flipped `DISPUTES` → `SUPPORTS`: the rationale *"sets a clear boundary defining the
causal link as a question for investigation rather than a settled fact."*

### FINDING 77 — the block renders flip DATES and expects the model to do the arithmetic

Four consecutive critiques treated May and August as one phenomenon. None computed the durations,
because the trajectory block gives `date=present → date=removed` across up to 83 captures and leaves
subtraction to the reader. The distinction that refutes the strongest counter-argument in the corpus
was one line of arithmetic away, in data already in the prompt, and no agent ever did it — nor did the
thesis, until a researcher's objection to a draft forced the check.

Render each absence as **"absent for N captures / D days"** and the distinction is in front of every
agent that reads it. Not built at the time: it would change the critique, and publishing came first.

#### Built 2026-08-25, deliberately BEFORE the production replay

Ordering was the decision, not the code — a change that alters what the critic argues must land on
one side of the run or the other, never inside it.

`changeSpans()` (`src/services/claimTrajectory.ts`) replaces `changesOnly()`: same flips, each now
carrying `captures`, `days` and `openEnded`. `TrajectoryGroup.changes` is `ChangeSpan[]`, so the
numbers reach the block, the MCP payloads and the routes without new plumbing. The rendered timeline
goes from

```
Timeline: 2022-05-13=removed → 2022-05-17=present → 2022-08-05=removed
```

to

```
Timeline: 2022-05-13 removed (1 capture, 4 days until the next flip)
        → 2022-05-17 present (2 captures, 80 days until the next flip)
        → 2022-08-05 removed (9 captures, 44 days to the last capture, no further flip)
```

**Two deviations from the finding as written, both deliberate:**

1. It says *"absent for N captures / D days"*. It is rendered as a **bound**, not a duration, because
   that is what the archive supports: the change happened somewhere between the capture that shows
   the old state and the capture that shows the new one. The block's rule text now says so in both
   locales. Calling a bound a duration would have been FINDING 34 again — a true layer laundering a
   claim it does not establish.
2. `days` is `number | null`, not `number`. An unparseable capture date yields `null` and the block
   prints the capture count alone. A `NaN` would be a number an agent then reasons with; a missing
   figure is merely missing.

**The open-ended case is marked as such.** Two cited movements never returned at all, and a closed
interval reading is exactly the misreading the finding is about.

**Coverage:** the timeline string had **no test at all** before this — the `date=present` construction
could have been changed to anything and nothing would have failed. Now 8 rendering tests (both
locales) and 7 `changeSpans` unit tests, including the corpus's own May/August shape asserting
`{captures: 1, days: 4}` against `{captures: 3, days: 44}`. Verified by reverting the renderer: 6 of
the 8 new rendering tests fail against the old format, and the two that do not are the NaN guards,
which are not regressions.

1391/1391 backend tests, `tsc` clean, lint unchanged at the 361-problem baseline.

**FINDING 78 was NOT built alongside it.** It is n=1, its repair is a proposal, and bundling an
unproven label change into a run whose purpose is to compare against staging would confound both.

### FINDING 78 — making the label stable made it unquotable

Runs 2 and 3 argued by name: *"ניתוח המסלולים (Trajectories T1, T3, T4)"*. That was the basis for
FINDING 69's claim that the critique had become auditable — and for FINDING 75, which replaced
positional labels with claim-hash identities precisely so those references would keep resolving.

**Run 4, the first with identity labels, quoted no label at all.** It reasoned about the trajectories
and referred to them only as a group. One run is not a finding about model behaviour, but the
mechanism is plausible: `T1` is trivially quotable and `T6a505dc8` is not, and auditability that
depends on a model choosing to type nine hex characters is thinner than it looked.

The likely repair keeps both properties — `[T1·6a505dc8]`, an ordinal to quote and an identity to
resolve. A later reader ignores the ordinal and resolves the hash, which is exactly what the
positional scheme could not offer.

### Recorded with the publication

`GAP_ACTIONABILITY` failed advisory: run 4's second gap names a document but no holder, and the
assessor asked for a concrete custodian — HMO adverse-event registries, or complaints filed with the
ministry — rather than generic reliance by vaccinees. It PASSED on run 3's gaps. Two runs of the same
critique differ on whether their own gaps are actionable, which is worth knowing before treating any
single critique's agenda as the research plan.

---

# Part IV — The production replay

## Step 34 — The first production write, and what it proved about the oldest one

Production held 0 evidence. The first write was the article staging began with, chosen so the two
environments could be compared on the same input.

### Request

`create_evidence_from_url` — production — the RT Mag investigation URL.

### Predictions, stated BEFORE the call

1. The `fileHash` will match staging's, because evidence identity is content-derived and the article
   is unchanged.
2. The summary will differ, because intake runs an LLM. Tier and role should hold.

**Both were wrong, and the first one was wrong in an important way.**

### Response — structure

`evidenceId`, `fileHash` (differs from staging), `status: PENDING_REVIEW`, `evidenceTier`,
`evidenceRole`, `investigativeCategories[4]`, `targetEntity`, `evidenceDate`, `keyFigures[3]`.

### Verified

| Check | Result |
|---|---|
| `check_on_chain_status` (production) | `PENDING_UNREGISTERED`, `safeToPromote: true`, not anchored — correct pre-promotion state |
| `check_on_chain_status` (staging, same article) | `CONSISTENT`, CONFIRMED, **registry id 2** — the first record ever anchored there |
| Hash recomputed independently, from the live page | **A third value**, matching neither |
| Three consecutive fetches, seconds apart | **Three different hashes** |

### FINDING 79 — evidence identity from a live fetch is not an identity

`createEvidenceFromUrl.ts` computes `fileHash = sha256(url + "\n\n" + strippedText[:40000])` over a
**live fetch**. The page carries a view counter:

```
fetch 0:  … 49552 צפיות …   hash 0x5f7f9598…
fetch 1:  … 49553 צפיות …   hash 0xf06015a4…
fetch 2:  …                  hash 0xbae2d575…
```

and, checked independently by the user from another machine minutes later, **49557**.

Same stripped length every time — the digit count did not change — and a different hash every time.
Any page with a view counter, a timestamp, an ad slot, a CSRF nonce or an A/B variant produces a new
evidence identity on every call. This URL is not unusual; it is a news article.

**Three consequences, in ascending order of seriousness:**

1. **The documented dedup is dead.** The tool says *"Safe to call multiple times — duplicate URLs
   return the existing record."* It dedups on `findUnique({ where: { fileHash } })`
   (`createEvidenceFromUrl.ts:80`). A hash that changes per fetch can never match, so a second call
   creates a second row. Established from the code path, deliberately **not** by writing a duplicate
   into production.

2. **Nothing is stored to recompute against.** The fetched text is never persisted — the record keeps
   `fileHash` and `sourceUrl` and nothing else (`createEvidenceFromUrl.ts:104-113`). So the record
   cannot be re-derived from the live page (it moved) *or* from a stored copy (there is none). This is
   FINDING 40's defect — "anchored records cannot be recomputed" — in a different code path, still
   open, and reached by a completely different route.

3. **Staging's registry id 2 is anchored to a hash nobody can ever reproduce.** It is on-chain, it is
   cited, and it cannot be verified against its source. Not because anything was done wrong at the
   time, but because the identity was never capable of being checked.

**Why the snapshot work did not cover this.** Evidence identity was moved to archived snapshots on
2026-08-23 ([[gf-evidence-identity-snapshot-derived]]) — for URL-VERSION evidence, the diff-based
records the forensic scan produces. Article evidence created from a live URL was a separate path and
was never migrated. The rule was applied where it was discovered, not where it was true, which is
FINDING 37's shape exactly.

**Not promoted.** Promotion anchors the hash on a public chain, irreversibly. Anchoring an identity
already known to be unreproducible would be deliberately manufacturing the state the project spent
2026-08-23 repairing. The row stays `PENDING_REVIEW` until the identity question is settled.

### Secondary observation — tier moved, not just prose

| | staging | production |
|---|---|---|
| Tier | Tier 2: Material | **Tier 1: Smoking Gun** |
| Categories | 5, incl. `ACCOUNTABILITY_EROSION` | 4, without it |
| Role | Incriminating | Incriminating |
| Key figures | 3, identical | 3, identical |
| Evidence date | 2022-08-21, identical | 2022-08-21, identical |

Prediction 2 said prose would vary and tier would hold. Tier moved a whole band on the same article.
Tier is not decoration — a thesis may cite only Tier 2 and above, so this is the field that decides
whether a record is usable at all. One observation is not a rate; it is a reason to measure one.

### Measured: the project already owns the extractor that fixes this

Two live fetches four seconds apart, run through all three extraction paths in the codebase:

| Extractor | Length | Stable across the two fetches | View counter |
|---|---|---|---|
| crude tag-strip — `createEvidenceFromUrl.ts:66-71` | 20,442 | **no** | present |
| `extractArticleText` — produces `UrlSnapshot.fullText` | 12,984 | **yes** | **absent** |
| `extractRawText` — whole document | 20,770 | **no** | present |

Readability discards the counter because it is page chrome, not article body. **Article evidence is
the only one of the three paths that produces an unstable identity**, and it is the only one not
using the shared extractor built during the verification-tools work.

**Two things follow, and only one of them is the extractor.**

1. **Stability is available for free** by using `extractArticleText`, the function the scan path
   already calls. No new normalisation, no heuristic for stripping volatile numerics.
2. **Stability is not verifiability, and only the second one matters.** Readability's stability here
   is incidental — the counter happens to sit outside the article body *on this page*. A timestamp
   inside the body would defeat it. Storing the extracted text is what makes a record checkable, and
   no extractor substitutes for it: "does the hash still match" is only answerable against a stored
   artifact.

**The cost, stated rather than buried.** `extractArticleText` returns 36% less text than the crude
strip on this page, and [[gf-snapshot-fulltext-is-an-extraction]] already records that `fullText` is
an extraction discarding ~31% of the page with the on-chain `contentHash` inheriting it. Moving the
article path onto the same extractor does not create that problem; it spreads it to a second class of
evidence. What is dropped here is nav, footer and related-article chrome — but a caption or pull
quote outside the article body would go silently with it.

### The design this opens, and the parts that already exist

Proposed by the user, and it is the scan path arriving from the other direction: store the text the
hash was computed over; on a later fetch of the same URL, diff stored against fresh, and decide
whether the change is noise or substance. If substance, the page has two versions with a significant
change — which is precisely what the forensic scanner produces — and splits again:

- **the page is in Wayback** → recommend a full scan, because the archive holds a history this
  platform has not looked at;
- **the page is NOT in Wayback** → this platform just caught a diff nothing else holds. That is a
  capability, not a repair, and also an obligation: nothing external can corroborate it.

Checked, not assumed — three of the four pieces already exist and must be reused rather than rebuilt:

| Need | Existing part | Why reuse is mandatory |
|---|---|---|
| Stable extraction | `archiveText.extractArticleText` | measured above |
| Diff into chunks | `lib/diffChunking.ts` | dependency-free, already what the scanner feeds the classifier |
| "Is this change significant?" | `ForensicAgent.analyzeChange(deletions, additions, url, date, [])` | standalone, no DB coupling; carries `CLASSIFIER_VERSION` + prompt hash. **A second significance heuristic would be the three-diverged-copies defect again** |
| "Does Wayback hold this page?" | `archiveVerification.fetchCaptureIndex(url)` | pure CDX, no DB, no tracking; distinguishes "archive holds nothing" from "archive did not answer" — the exact distinction the two branches turn on. NOT `list_captures`, which short-circuits to `NOT_TRACKED` without calling CDX |

Only the storage itself is new.

### FINDING 79 fixed — and the fix found the bigger half

Built after the user chose the minimum that unblocks promotion. Then a check of the sibling paths
turned up the part that mattered more, and the user's instruction — *stop and discuss when you detect
a smell* — is why it was surfaced rather than quietly patched.

**What FINDING 79 actually was.** Not "a view counter". *"The article text"* and *"the evidence hash"*
each had more than one implementation, so two of them could disagree while both looked correct.

| Was | Now |
|---|---|
| 2 extractions of "the article" — `archiveText.extractArticle*` and a second JSDOM+Readability pass in `utils/webScraper.ts` returning `article.textContent`, **a different string** | 1. `webScraper` calls the shared extractor; `new Readability(` appears in exactly one file |
| 3 copies of the url+text hash, one of which (`evidenceRoutes.ts`) **omitted the 40,000-char bound** | 1 shared `evidenceHashFromCapture`, plus one allow-listed copy (below) |
| Nothing stored to recompute an identity from | `EvidenceCapture` — the exact text, its extractor, and when it was taken |

**The divergence that was live in production.** The website's own submission route hashed
`url + "\n\n" + scrapedText` with no length bound; the MCP path bounded at 40,000 characters. The same
URL and text submitted through the website and through MCP produced **different `fileHash` values** on
any long document — so the `@unique` constraint meant to deduplicate them could not fire. That route
also anchors on-chain immediately, which is precisely where an unverifiable identity is most
expensive.

**`create_evidence_from_text` was deliberately left alone.** Its inline hash copy is the one entry in
the drift guard's allowlist. The user's reasoning, recorded because it is a product decision and not
an oversight: the mode depends on a researcher pasting text by hand, which is not a reliable basis for
evidence; a saved PDF is the likelier replacement; and there is no real example of it in the work
currently in hand. Refactoring something that may be deleted is wasted work.

**What guards it now.** `test/evidenceIdentityDrift.test.ts` scans the source, because every existing
test exercised one path and no test could see all of them at once — which is why both divergences
survived. It asserts one Readability call site, one hash function, and — third test — that its own
regex still matches the known allow-listed copy, so the guard cannot quietly become decoration.

`capturedAt` on the REST route is the submission moment, not the scrape moment: the client fetches at
`/intake` and posts the text back at `/confirm`. Recorded as an upper bound rather than as a precision
the route does not have, and that route's captures carry `client-supplied-readability-v1` rather than
the plain server-side label — an auditor comparing two captures has to be able to see that one of them
left the building.

1407/1407, `tsc` clean, lint unchanged at its 361 baseline.

## Step 35 — The row recreated, and FINDING 79 proved closed on production

Deleted and recreated on the user's instruction, once the fix was live in production.

**Deletion, and why it was not a cleanup session.** `CLAUDE.md` reserves a dedicated session for
destructive database work and blocks the raw-SQL and Prisma bulk-removal paths outright. Neither was
used: this went through `delete_evidence`, the product's own tool, which is also what this playbook's
session protocol requires — *all mutation goes through MCP*. That tool refuses CONFIRMED, cited and
IPFS-pinned records by construction, so the class of row that must never be removed cannot be.

Risk stated before running, and it was genuinely small: one `PENDING_REVIEW` row, not on-chain, not
public, not cited, an hour old, and reproducible by re-running the same call.

| | before | after |
|---|---|---|
| evidenceId | `78fd727a…` | `f2ad34d0…` |
| fileHash | `0x761a893e…` | `0x3a1093b2…` |
| extractor | crude tag-strip | `readability-article-v1` |
| stored capture | none | 12,984 chars |
| reproducible | **no** | **yes** |

### Verified — the part that matters

Two fresh fetches from this machine, minutes after the record was written:

```
raw HTML identical            : false      (counter 49562 -> 49563)
extracted length              : 12984 / 12984
fetch A hash                  : 0x3a1093b2…
fetch B hash                  : 0x3a1093b2…
production reported           : 0x3a1093b2…
A === B                       : true
matches production            : true
```

**The page is still changing and the identity no longer moves.** That is the whole of FINDING 79,
inverted. Before, three fetches gave three identities; now the counter still ticks between fetches
and the hash is the same value, recomputed on an independent machine.

And separately — the property no extractor can provide — `verifyEvidenceCapture` against the STORED
text returns `matches: true, notChecked: false`: *"This record can be verified without refetching
anything."* Stability made the hash reproducible today; the capture makes it checkable in a year,
when the page may be gone.

### FINDING 80 — the destructive-command guard cannot tell prose from a command

Writing the paragraph above was blocked. The guard scans the command text, and the sentence naming
the operations this step deliberately avoided contained those names literally — inside a heredoc of
Markdown. No database was reachable from that command at all; it wrote a file and made a commit.

Recorded rather than worked around, and the workaround chosen was to rephrase the documentation, not
to evade the gate. Two things follow:

- **The guard fails safe, which is the correct direction.** A gate that occasionally stops a
  document is enormously cheaper than one that occasionally permits a wipe, and
  `docs/gf-staging-data-loss-postmortem-2026-08-21.md` is what the other direction costs.
- **But it makes the rules harder to write down**, and this project's whole method is writing things
  down. A postmortem naming the command that caused the incident is exactly the document most likely
  to be blocked. Worth a narrow exemption for paths under `docs/` at some point — not built here,
  because a change to a destructive-work gate is its own piece of work and does not belong in the
  middle of a production replay.

### The intake varies more than expected, and it is worth watching

Same URL, same article, three intake runs now:

| | staging | production, run 1 | production, run 2 |
|---|---|---|---|
| Tier | Tier 2: Material | **Tier 1: Smoking Gun** | **Tier 1: Smoking Gun** |
| Categories | 5 | 4 | **5** |
| `evidenceDate` | 2022-08-21 | 2022-08-21 | **2022-08-02** |
| Key figures | 3, identical | 3, identical | 3, identical |

Tier held across the two production runs, which weakens the earlier worry that tier is simply
unstable and strengthens a different one: the two production runs differ from staging *together*.
That looks less like model noise and more like the extractor change altering what the model was
shown — Readability drops 36% of the page, and `evidenceDate` moved by nineteen days.

`evidenceDate` is not decoration: it orders the forensic timeline and anchors correlation to dated
external events. **A date derived from a model reading a truncated page is a soft field standing in a
hard position.** Not acted on here — recorded as the next thing to measure, because n=3 across two
different extractions is not a rate.

## Step 36 — The first review, and the three defects it found

The guide written this morning says: read the summary against the document, check the tier and role,
confirm the capture reproduces the identity. Applied to the first production record, it failed it.

### What passed

`capture verify: matches=true`. All six `statisticalClaims` verbatim in the source. All key figures
present. Every substantive assertion in the summary traced to a passage: the two-month concealment,
the infant approval without informing the expert committee, the denominator manipulation, the
manufacturer's leaflet. **The substance was never the problem.**

### FINDING 81 — the identity text was starving the classifier

`evidenceDate` came out **2022-08-02**; the article was published **2022-08-21**.

The captured text contains exactly one full date — an FDA meeting in 2021. The publication date lives
in `<time datetime="2022-08-21T20:02:14+03:00">`, in a panel *outside* the article body, and
Readability discards it as chrome. So the model was asked for a date the text it was given could not
answer, and took one from the article prose instead — *"בתחילת אוגוסט"*, when the Ministry published
its report. The field silently changed meaning from "when this was published" to "when the events
happened".

**Caused by the previous day's fix**, and predicted in its own PR: *"a caption or pull quote outside
the article body would go silently with it."* It bit on the first record, in the field that orders the
forensic timeline.

The user named the cause before the diagnosis was complete: *hashing and analysis want different
texts.* Measured:

| Extraction | chars | publication date |
|---|---|---|
| `extractArticleText` (hashed) | 12,984 | **absent** |
| `extractRawText` (whole document) | 20,770 | **present** |

Identity now derives from the narrowest STABLE text; classification from the widest available one.
Instability does not matter for the second, because it is never hashed. The capture also stores the
fetched document, so any extraction can be re-derived — the `UrlSnapshot.fullText` lesson applied on
time instead of after the fact.

### FINDING 82 — more information moved the tier further from the truth

The rubric's branch 3 read *"media article or general pattern without direct proof"*. The qualifier
attaches to "general pattern", so **"media article" stood alone as a FORM test**.

| analysis text | tier |
|---|---|
| truncated, byline stripped | Tier 1: Smoking Gun |
| full page, byline visible | **Tier 3: Supporting** |

Giving the model *more* of the document made the container obvious — a byline, an author, magazine
furniture — and the rubric was asking about the container. Its own `tierReasoning` said the direct
quotes and audio links *"מעניקים לו משקל ראייתי גבוה"* and then filed it under Supporting.

**This is the sharpest instance yet of a rule that fires on the wrong feature.** A depth fix that is
correct in every other respect made one field worse, and it would have looked like model noise if the
before had not been kept.

Graded by CONTENTS now: an investigation quoting a leaked internal recording is Tier 1, because the
weight is in the primary material, not in who printed it. And a tier contradicting its own reasoning
must resolve in favour of the reasoning. `thesisSynthesis` reconciled — it called Tier 1 *"official
documents"*, which is intake's Tier 2, so theses were weighting evidence by a definition the
classifier never used.

### FINDING 83 — the key-figures rule stated a principle and named no exclusions

It already said *"do not include figures merely referenced for context"*, and the model still added a
pharmaceutical CEO who appears only as background — and, in every run including staging's anchored
record, **the whistleblower whose warning the document reports**.

A person who exposed the conduct was being listed among those whose conduct is under examination, on a
list that feeds a per-person dossier. That is the platform's highest legal exposure pointed at exactly
the wrong person.

The default is now EXCLUSION with the excluded classes named outright: authors and journalists, anyone
who disclosed or warned against the conduct, victims, organisation heads with no personal act
attributed, background mentions. When in doubt, exclude.

### The measurement, across five runs

| | A | B | C | D |
|---|---|---|---|---|
| | no fixes | +depth | +rubric | +provenance |
| `evidenceDate` | 2022-08-02 | 2022-08-21 | 2022-08-21 | 2022-08-21 |
| `evidenceTier` | Tier 1 | **Tier 3** | Tier 1 | Tier 1 |
| `keyFigures` | 3 | 4 | 2 | 2 |
| categories | 5 | 5 | 5 | **4** |
| `fileHash` | `0x3a1093b2…` | `0x3a1093b2…` | `0x3a1093b2…` | `0x3a1093b2…` |

**The identity never moved.** Four deletes, four recreates, four fetches, three prompt versions, two
extraction regimes — and the stored HTML grew from 116,837 to 116,984 bytes between the first and last,
so the source document itself was changing throughout. That is the separation working: classification
is judgement and moves; identity is a fact about a document and does not.

### Still varying, and now visible: categories

4, 5, 5, 5, 4 across the five runs — `ACCOUNTABILITY_EROSION` appears and disappears. Not introduced
by anything changed here, and not investigated. It is recorded because the provenance stamp finally
makes it *measurable*: two rows can now be compared knowing whether the same rubric judged them.

### FINDING 84 — writing the provenance guard corrected the model behind it

The first assertion was that every evidence write goes through `buildEvidenceAnalysisData`. It failed
on `WaybackScraper` and `promoteForensicDiff` — and **both were right**. Intake never judges
scan-derived evidence; its provenance reaches the diff's own `classifierVersion` through
`urlVersionDiffId`.

So the invariant is stronger than the one it set out to test: every evidence row goes through one of
**two** shapers, each carrying its own provenance, and there is no third route. Negative-tested with a
decoy carrying neither.

Worth recording as a method note: the guard was written to protect a belief and instead corrected it.
That only happens when the guard asserts a property of the whole system rather than of the change
being made.
