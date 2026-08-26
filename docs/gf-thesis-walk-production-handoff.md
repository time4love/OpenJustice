# Production thesis walk — handoff

**Rewritten 2026-08-26**, after the diff-truncation repair. The previous version of this file
described an environment that no longer exists, and its environment check has since become actively
wrong — see §"Identifying the environment".

The staging walk is done and published. Production has never had a thesis. This carries forward what
the staging walk established, plus what the repair changed underneath it.

Canonical detail: `docs/gf-researcher-playbook.md` (Steps 33-40, FINDINGS 81-100) and
`docs/gf-diff-truncation-dev-plan.md` (the repair, §1-12).

---

## Identifying the environment — READ THIS FIRST

**The old rule "`search_evidence` totalling 7 is production, 8 is staging" IS NOW WRONG.** Production
gained its eighth record during the repair. Both environments return **8**.

That rule broke *because the thing it measured got fixed*, which is worth noticing: an environment
check keyed on a count is a check keyed on a bug.

Use the **2022-08-21 Berkovitch article's `fileHash`** instead. Same source URL, two independent
captures, and the hashes are stable:

| | production | staging |
|---|---|---|
| article `fileHash` | **`0x3a1093b2dd6c…`** | **`0x06540303f46d…`** |
| article tier | **Tier 1: Smoking Gun** | Tier 2: Material |
| article key figures | 2 — אניס, אלרואי-פרייס | 3 — **includes ברקוביץ'** |
| theses | **0** | 1, published |
| `trackedUrl` id (DB only) | `0e755b7d-…` | `45ce88aa-…` |

MCP connector for production in the last session was `13fb2169…`, staging `79ec7e43…` — **but never
trust the connector name.** Confirm by data every time.

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

Open a framing session on production with the question above, then follow §"Guided Execution" in
`CLAUDE.md` — show each prompt, wait for approval, execute, report.

**Production has 0 sessions and 0 theses**, so nothing has to be closed first.
