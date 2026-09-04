# Production thesis walk — handoff

> **SUPERSEDED 2026-09-04 by `docs/gf-thesis-refactor-plan.md` step 26.** The thesis is rewritten on
> staging under the new tools, then production at SHIP; the walk this hands off is not run. Open items
> triaged in `docs/gf-pre-design-plans-triage-2026-09-04.md` §10.

**Rewritten 2026-08-26**, after the diff-truncation repair. The previous version of this file
described an environment that no longer exists, and its environment check has since become actively
wrong — see §"Identifying the environment".

The staging walk is done and published. Production has never had a thesis. This carries forward what
the staging walk established, plus what the repair changed underneath it.

Canonical detail: `docs/gf-researcher-playbook.md` (Steps 33-40, FINDINGS 81-100) and
`docs/gf-diff-truncation-dev-plan.md` (the repair, §1-12).

---

## Identifying the environment — READ THIS FIRST

**Call `get_environment`. Do not identify the environment any other way.**

It takes no arguments and writes nothing. It answers from the deployment's own configuration —
`APP_ENV`, already validated at startup against the Supabase project its connection strings actually
name — cross-checked against the chain its evidence registry sits on (production: Base mainnet 8453;
staging: Base Sepolia 84532). Two independent axes, and no single wrong variable can move both.

Read the `verdict`:

| verdict | meaning |
|---|---|
| `CONFIRMED` | both axes agree — act on it |
| `UNVERIFIED` | only one axis could be read (unpinned database, or the RPC was unreachable) |
| `CONFLICT` | the axes contradict each other — **write nothing** until resolved |

**Never trust the connector's name.** It is a label applied on the client side, and the production and
staging connectors are indistinguishable from inside a conversation.

**And never identify an environment by its CONTENT.** Two versions of this document tried:
first "`search_evidence` totalling 7 is production, 8 is staging", which broke the moment production
gained an eighth record — i.e. the moment the bug it was really measuring got fixed. Then the
2022-08-21 Berkovitch article's `fileHash`, maintained by hand here. Content is what this platform
exists to change, so any check keyed on it is a check with an expiry date, and the expiry arrives
silently. `get_environment` still returns a `corpus` block — it is there to recognise an environment
you have already identified, never to identify one, and it says so.

The table below is retained on those terms: a snapshot of what each environment held on 2026-08-26,
useful for noticing drift since, and **not** an identity check.

## The environment, as measured 2026-08-26 (post-repair)

| | production | staging |
|---|---|---|
| evidence records | **8**, all CONFIRMED | 8 CONFIRMED + 1 PENDING_REVIEW |
| theses | **0** | 1, published |
| tracked URLs | 1 · `corona.health.gov.il/vaccine-for-covid/` | same |
| snapshots | 83 captures, **0 unanchored** | same |
| diffs | 81 · **7 significant** | 81 · 7 significant |
| stored chunks | **290 / 290** | 290 / 290 |
| coverage (derived) | **100%** | 100% |
| `classifierVersion` | **`v4-budgeted-best-of-n`** on all 81 | same |
| `classifierModel` | `gemini:gemini-flash-latest` | same |

**Production and staging now hold the same eight evidence records**, with matching content-addressed
hashes for the six page diffs and for `0x8b814765…` (2025-06-01). Only the article differs, because
it was captured separately in each.

## The framing question, verbatim

> Whether Israel's Ministry of Health revised its public safety representations on
> corona.health.gov.il/vaccine-for-covid in step with what it knew internally, around the publication
> of the Berkovitch recordings on 2022-08-21.

Reused deliberately: it was the researcher's own, it survived a control re-run against a
trajectory-aware assessor, and reusing it makes the two environments comparable. **The conclusions are
not reused** — the production thesis is argued from production's own evidence.

Staging's title, for reference and **not to be copied**:

> שינויי מצגי הבטיחות בדף חיסוני הקורונה של משרד הבריאות, 2022

## What changed under the walk since staging ran it

Everything here is now live on **both** environments (production was shipped `323ba0b` and `3a80620`).

| change | effect on the walk |
|---|---|
| Publication gate | a thesis is a DRAFT until deliberately published; `run_ai_analysis` no longer publishes |
| Snapshot-derived evidence identity | evidence identity recomputes from stored captures |
| One session per researcher, one per thesis | a session REQUIRES a researcher; opening cannot close someone else's work |
| `SNAPSHOT_ANCHOR` verdict | `check_on_chain_status` on a *snapshot* hash no longer reports a broken chain of custody |
| Framing link scoped to the researcher | a framing session cannot attach to another researcher's thesis |
| **`get_diff_input`** (new, READ) | the classifier's INPUT — raw chunks, items, derived coverage, provenance |
| **`preview_diff_classification`** (new, WRITE-classified) | re-run the classifier on a diff without touching state; `runs` samples repeatedly |

## Known traps

- **Recompute, never restate.** Four factual errors were caught in one paragraph before publication on
  staging, every one by re-deriving a number from primary data.
- **`UrlSnapshot.fullText` is a Readability extraction** discarding ~31% of the page, and it keeps
  anchor text while discarding hrefs. `verify_claim_text` reads the RAW archived document.
- **A thesis cannot cite what has no `ThesisMention` type.** Trajectory citation exists
  (`cite_trajectories`); check what is citable before writing a claim that depends on it.
- **The classifier is a sampler, not a function.** Draws on one diff ranged 43%-100% coverage. Rows
  now carry `classifierDraws`; `null` means a single draw stored as though it were a measurement.
- **The classifier MERGES chunks into items.** Far fewer items than chunks is normal. Never measure
  coverage by comparing counts — `get_diff_input` reports containment-based coverage.
- **`audit_thesis_claims`** checks dates, quotations and intervals mechanically, no model involved. Run
  it before publication readiness, and read what it says it could NOT check.
- **On-chain writes go through MCP.** Never a local script. See `CLAUDE.md`.

## Open items that touch the walk

- **4 evidence records on STAGING are out of sync with their diffs** — under-categorised, because they
  were promoted from truncated classifications. Production is clean. Staging only.
- `MIN_CLAIM_LENGTH = 40` still filters trajectory candidates — the same length-as-significance
  assumption, in a second subsystem. 116 trajectories exist; 21 are cited by staging's published
  thesis. Changing it bumps `DETECTION_VERSION` and recomputes all of them.

## Next step

Call `get_environment` and confirm `verdict: CONFIRMED`, `environment: production`. Then open a
framing session with the question above, and follow §"Guided Execution" in `CLAUDE.md` — show each
prompt, wait for approval, execute, report.

**Production has 0 sessions and 0 theses**, so nothing has to be closed first.
