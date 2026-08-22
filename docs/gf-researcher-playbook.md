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
