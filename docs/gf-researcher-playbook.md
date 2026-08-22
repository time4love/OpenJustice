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
`fileHash`:

```sql
SELECT count(*) FROM "Evidence" WHERE "fileHash" = '0x0654…c262';
```

`0` — so the row landed in staging, as intended.

That this required a database query at all is the finding. The environment should be
legible from the tool response.

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
