# Production thesis walk — handoff

**Written 2026-08-25.** The staging walk is done and published; production has never had a thesis.
This carries forward what the staging walk established so the production one does not rediscover it.

Canonical detail lives in `docs/gf-researcher-playbook.md` (Steps 33-40, FINDINGS 81-100). This file
is only what the next session needs in hand.

---

## The environment, as measured

| | production | staging |
|---|---|---|
| evidence records | **7** (1 article + 6 scan findings) | 8 |
| theses | **0** | 1, **published** |
| research sessions | **0** | 3 (1 ACTIVE, bound to the thesis) |
| tracked URLs | 1 · `corona.health.gov.il/vaccine-for-covid/` | same |
| snapshots | 83 captures, 12 distinct texts, **0 unanchored** | 83, 0 unanchored |
| researchers | 2 (both the same person) | 2 |

**Establish the environment by DATA before the first write, never by the connector's name.**
`search_evidence` totalling 7 is production; 8 is staging. Both connectors answer; neither says which
it is.

## The framing question, verbatim from the staging walk

> Whether Israel's Ministry of Health revised its public safety representations on
> corona.health.gov.il/vaccine-for-covid in step with what it knew internally, around the publication
> of the Berkovitch recordings on 2022-08-21.

Staging's resulting thesis title, for reference — **not to be copied**, since the production thesis
must be argued from production's own evidence:

> שינויי מצגי הבטיחות בדף חיסוני הקורונה של משרד הבריאות, 2022

The question is reused because it was the researcher's own, it survived a control re-run against a
trajectory-aware assessor, and reusing it makes the two environments comparable. The *conclusions*
are not reused.

## What changed under the walk since staging ran it

Everything below landed after the staging walk and is live on **staging**; production has the first
two only. A production walk meets a different system than staging's walk did.

| change | effect on the walk |
|---|---|
| **Publication gate** | a thesis is a DRAFT until deliberately published; `run_ai_analysis` no longer publishes |
| **Snapshot-derived evidence identity** | evidence identity recomputes from stored captures |
| **One session per researcher, one per thesis** *(staging only)* | opening no longer offers to close somebody else's work; a session now REQUIRES a researcher |
| **`SNAPSHOT_ANCHOR` verdict** | asking `check_on_chain_status` about a *snapshot* hash no longer reports a broken chain of custody |
| **Framing link scoped to the researcher** *(staging only)* | a framing session can no longer be attached to another researcher's thesis |

## Known traps, from the staging walk

- **Recompute, never restate.** Four factual errors were caught in one paragraph before publication,
  every one by re-deriving a number from primary data rather than re-reading prose.
- **`UrlSnapshot.fullText` is a Readability extraction** that discards ~31% of the page. Trajectories,
  diffs, evidence and the on-chain contentHash all inherit it. `verify_claim_text` reads the RAW
  archived document and flags divergence — use it for any quoted claim.
- **A thesis cannot cite what has no `ThesisMention` type.** Trajectory citation was built afterwards
  (`cite_trajectories`); check what is citable before writing a claim that depends on it.
- **The classifier is not deterministic.** Staging and production disagreed on one diff from identical
  input (FINDING 98). Do not expect production's 6 findings to match staging's 7.
- **`audit_thesis_claims`** checks dates, quotations and intervals mechanically, with no model
  involved. Run it before publication readiness, and read what it reports it could NOT check.

## Next step

Open a framing session on production with the question above, then follow
§"Guided Execution" in `CLAUDE.md` — show each prompt, wait for approval, execute, report.

**Production has 0 sessions**, so nothing has to be closed first.
