# Production thesis walk — replay plan

**Written 2026-08-26.** Reconstructed from staging's own MCP records, not from any document.
Companion to `docs/gf-thesis-walk-production-handoff.md`; canonical for *what production replays and
what it drops*.

The staging walk is finished and published. This plan replays the **research** it contains and drops
the **retries** it accumulated while the platform was being repaired underneath it.

---

## How the reconstruction was done

Four read-only MCP calls against staging. No document was trusted as a source, because two successive
versions of the handoff's environment check had already turned out to be wrong.

| call | recovered |
|---|---|
| `get_thesis_context` on `cmt5jffqy000lf52mn6t56f3l` | the published body, its 7 evidence citations, 21 trajectory citations at `detailLevel: FULL`, the critique, the publication assessment, and the version list |
| `get_thesis_framing` on `cmt5gm7lr0005f52m6v5fiy3r` | the surviving framing session — 3 rounds, the attached thesis, the publication rationale |
| `get_thesis_framing` on `cmt4ptxnt000174gc1fdaaxvz` | framing run 1 |
| `get_thesis_framing` on `cmt4uv9c7001q116spl54e6hg` | framing run 2 |

`get_thesis_trajectory_citations` was **not** run: `get_thesis_context` already returned
`trajectoriesCited.detailLevel: "FULL"` with all 8 movements and all 21 ids.

## What the records show

**Three framing sessions, one research act.** All three carry a byte-identical `question` and a
byte-identical round-1 framing (session 3's differs only in line wrapping). Their `thesisId`s are
`null`, `null`, and the thesis. Runs 1 and 2 each drew a claimed contradiction from the assessor;
run 3, on the repaired corpus, returned `contradictions: []`. Nothing about the research changed
between them — the corpus and the assessor did.

**Rounds 2 and 3 of the surviving session are byte-identical**, 80 seconds apart (07:27:03 and
07:28:23). One rebuttal, submitted twice.

**`versionCount: 2` is fully explained by tooling, not by editing.** v1 is the
`create_thesis_draft` call of 2026-08-23 08:21; v2 is `cite_trajectories` on 2026-08-24 09:55,
recorded as *"Trajectory citations added (prose unchanged)"*. `cite_trajectories` landed on staging on
08-24 — a day **after** the draft. The second version exists because a feature shipped mid-flow.

**`run_ai_analysis` fired four times**: once on v1, then three times on v2 with the version unchanged
between them.

**No `add_thesis_version` call appears anywhere in the record.** The narrative is an input:
`create_thesis_draft` takes a `body`, plus `citations` mapping `[^n]` markers to evidence hashes and
trajectory ids.

## The replay

| # | staging | production | reason |
|---|---|---|---|
| 1 | 3 framing sessions | **1** | runs 1-2 were re-runs against a corpus and assessor since repaired; production is already `v4-budgeted-best-of-n` at 100% coverage |
| 2 | round 1 — the researcher's Hebrew framing | same act, the researcher's text | genuinely the researcher's |
| 3 | rounds 2 and 3, identical | **contingent — not pre-planned** | the rebuttal answered what the assessor actually said. Production's assessor may not raise that contradiction. Pre-committing to staging's rebuttal is arguing with a machine that has not spoken. |
| 4 | `create_thesis_draft` → v1 | one draft, trajectory citations included | — |
| 5 | `cite_trajectories` → v2 | **folded into 4** | v2 was a feature landing, not a decision. `create_thesis_draft` now accepts `trajectoryIds` and per-footnote `trajectoryIds`. |
| 6 | `run_ai_analysis` ×4 | **1** | three runs on one unchanged version are retries |
| 7 | `audit_thesis_claims` | same | deterministic verification |
| 8 | `check_publication_readiness` | same | the gate |
| 9 | `publish_thesis` + rationale | same | the researcher's |

Nine framing/analysis calls collapse to four. Nothing a researcher decided is removed.

## What does NOT carry over

- **The question does.** Verbatim, English, confirmed byte-identical across all three staging
  sessions and quoted back independently by publication check 13 (`FRAMING_ATTACHED`).
- **The body does not.** Production's Berkovitch article is a different capture — Tier 1 with 2 key
  figures, where staging's is Tier 2 with 3 — and staging's framings cite hashes
  (`0x43dea3f8…`, `0x987191ab…`) that are staging's. Copying the prose would import claims production
  cannot support.
- **The conclusions do not.** Production's thesis is argued from production's 8 CONFIRMED records
  over 7 significant diffs.

## Open at time of writing

- Where `publicInterestStatement` is set — it is a `Thesis` field but is not in
  `create_thesis_draft`'s schema. To be checked at the step that needs it, not guessed.
- Whether production's corpus supports the same 8 trajectory movements staging cited.

## The rule this leaves behind

A walk executed while its platform is being repaired records two things at once: what the researcher
decided, and what the build made them redo. Only the first is worth replaying, and the two are
distinguishable **only from primary records** — identical inputs with differing outputs are a retry;
differing inputs are research. A summary of the walk cannot tell them apart, because a summary keeps
the outputs and discards the inputs that would prove they were the same.

---

# What actually happened, 2026-08-26

The plan held. The framing took **two rounds**, exactly as predicted — round 1 plus one rebuttal, no
third — and cleared to `contradictions: []`. Nine staging framing/analysis calls became two.

| step | result |
|---|---|
| environment | `get_environment` → `production`, `CONFIRMED`, chain 8453, `fqmc…lo` pinned. The fileHash table was never consulted. |
| framing opened | `cmta7d2zs0001fd7pxtbezflk`, question verbatim, `rounds: 0` |
| round 1 | `contradictionCount: 1` — **the same misquote as all three staging runs** |
| round 2 | staging rebuttal sent verbatim → `contradictionCount: 0` |
| corpus | 8 records, 7 significant diffs, **every diff has CONFIRMED anchored evidence**, `evidencePendingReview: 0`, nothing to promote |

## What the verification pass found, and why it was worth the detour

Nothing in the draft was written until each load-bearing quotation was checked against the **raw**
archived document. Fourteen `verify_claim_text` calls. Three findings, in ascending order of cost:

1. **The rebuttal's "חמישה דפוסי טענות" is wrong here — production has seven** (23 claims). The number
   was staging's, carried across environments unverified. It understates.
2. **An anchored evidence summary describes its source falsely** — `0x7517947a…` says
   `קלים וחולפים בלבד`; the capture contains `חולפים`, `חולפות` and `בלבד` nowhere. See
   `docs/gf-framing-assessor-defects.md` §Defect 3.
3. **A claim in staging's PUBLISHED thesis is false.** `נמצאו יעילים ובטוחים לשימוש` was never added on
   2022-09-06 — it was present in the raw archive on 07-24, 08-05 and 09-06 alike. The 08-05 capture
   returned `EXTRACTION_DIVERGENCE`: the phrase is in the page and not in Readability's article. The
   trajectory layer therefore reported a removal that never happened, and three models plus the
   researcher all agreed about it, because all of them were reading the extraction.

**The finding that survived is stronger than staging's.** Seven co-movement groups — 23 claims — left
the page on 2022-08-05 and returned on 2022-09-06, re-verified probe-by-probe against the raw archive
at **both** ends (six distinct probes covering all seven groups, `extractionDivergence: false`
throughout). Staging's thesis rested that claim on the extraction; production's rests it on the raw
documents.

And the false claim inverted into a truer one: the ministry removed the reporting channel, the
side-effects detail and the dosing guidance **while the blanket "found safe and effective" line stayed
on the page unchanged**.

## What this adds to the replay rule

The original rule was about dropping retries. This adds a second: **a factual assertion verified in one
environment is not verified in another.** Both errors found here — the count, and the FDA claim —
travelled from staging as text that had been true, or believed true, somewhere else. Recompute every
number against the environment you are writing to.

## Open at checkpoint

- `create_thesis_draft` not yet called. Production holds **0 theses**.
- The draft's first version was rejected by the researcher as too cautious; rewritten to lead with the
  contention and end with a missing-evidence→holder table and a call for whistleblowers.
- `add_session_note` **cannot attach to a thesis-less framing session** — it requires `thesisId`. The
  seven-not-five correction is owed to the session the moment the draft attaches.
