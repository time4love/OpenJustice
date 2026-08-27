# Rebuild the factual layer, one level at a time

**Written 2026-08-26, restructured 2026-08-27** after the production thesis walk stopped at its
drafting step and a day of measurement established that the layer beneath it cannot be patched into
correctness.

**Implementation started 2026-08-27.** Two decisions taken that session, both recorded below:
**Level 10 supersedes rather than deletes, and there is only ever one registry** (§4 Level 10);
**staging is finished before any production data is migrated** (§6).

Companions: `docs/gf-framing-assessor-defects.md` (four defects, with reproduction cases),
`docs/gf-production-thesis-replay-plan.md` (how they were found).

---

## 1. The decision

**Rebuild the factual layer from the archive, upward, with each level's integrity enforced in code
before the next is built. Keep the existing corpus untouched as a comparison. Supersede it last —
**nothing is ever deleted, and there is only ever one registry.**

Not a patch-in-place. Three findings make patching indefensible:

- **The extraction discards a third of every page, and a *different* third on different captures.**
  Measured on staging: 60–69% retained. That is what manufactures changes that never happened.
- **7 of 81 diffs are contradicted by the raw archived documents.** Measured, not sampled
  (`forensics:measure-divergence`, 2026-08-27). Three of the seven report the same sentence as both
  REMOVED and ADDED while it sits in both documents. Two of those three are among the seven diffs
  classified legally significant.
- **A false claim built on this reached a published thesis** and is still published.

And the reason a patch would not hold: **every one of these was already documented in a comment.**
`src/lib/archiveText.ts`, authored 2026-08-23, states that the extraction dropped *"the sentence a real
thesis went on to claim had been ADDED the following day"*. `evidenceCapture.ts` records a dropped
byline date corrupting `evidenceDate`. `createEvidenceFromUrl.ts` records an unstable counter. Three
encounters, three comments, no change to the storage decision.

**A comment is not a control. A tool a human must remember to run is not a control either.**

---

## 2. The clean model

### Archiving is the pipeline. A direct fetch is a step in it, not a kind of capture

`create_evidence_from_url` creates **zero** snapshots. A live-URL submission produces an `Evidence` row
with no capture beneath it, and `EvidenceCapture.evidenceId` is `@unique`, so **that URL's history is
structurally capped at one observation forever**. It can never appear in a diff, a trajectory,
`list_captures`, or a boilerplate corpus.

*(Correcting an earlier version of this document: it claimed such evidence "cannot be recomputed" and
that this was "very likely why 5 of 7 anchored records were unrecomputable". Both are false. The
identity function is self-contained and recomputes fine, and the row counts make the inference
impossible — **staging holds 0 `EvidenceCapture` rows and production holds 1**. The claim was reasoned
from plausibility instead of counted, in a document about exactly that failure. The defect is loss of
**history**, not of recomputability.)*

**A URL submission is a request to track a URL**, and the pipeline is always the same:

1. **Ask CDX what the Archive already holds.** A submitted URL with fifty captures yields a forensic
   timeline immediately — that is the product, not plumbing.
2. **If nothing is held, ask Save Page Now to create one.**
3. **Evidence is created from the archived capture**, once it is available.

So there is no `WAYBACK`-versus-`DIRECT` axis of equals. **A direct fetch is a transient precursor**,
and it persists as a first-class provenance only in the case where archiving is genuinely impossible.

| provenance | meaning | expected frequency |
|---|---|---|
| `WAYBACK` | the Archive holds it; a stranger can re-check it | the normal case, and the destination of every submission |
| `DIRECT` | we fetched it and the Archive has not (yet) indexed it | **transient**, or permanent only for a page the Archive cannot take |
| `ASSERTED` | text supplied to us; nobody we control observed the page | the exception path — see below |

That collapses the trust problem rather than managing it: the weak branch of *can a stranger re-check
this?* stops being a standing feature of the model and becomes a labelled exception.

**Three things this requires:**

- **Submission is queued, never blocking.** Save Page Now returns quickly but CDX indexing lags —
  minutes, sometimes far longer. A pending record plus a job that completes when the capture appears;
  never a request that waits.
- **Some pages cannot be archived.** robots.txt exclusions, paywalls, login-gated pages, sites that
  block the Archive. `DIRECT` is that exception path, recorded as such — rare and visibly labelled
  rather than routine.
- **Keep our own fetch and reconcile it.** We fetch at `T`; the Archive captures at `T+δ`, and the page
  can change in between. Discarding our observation loses what the page said when the researcher
  looked. Compare the two when the capture lands: identical is corroboration; **different is a
  finding** — either a real change inside the gap or a fault in our fetch; unavailable is
  `UNAVAILABLE`, never a pass.

Everything structural is shared across provenances, so diffs, trajectories, identity and boilerplate
detection work over the merged history without knowing which is which. Only *evidential standing*
differs, and Level 9 must know: an `ASSERTED` record is never citable at the standing of a captured
document.

**The website-submission and screenshot-recovery paths are `ASSERTED`.** `/confirm` receives
client-scraped text and the server never fetches the page. Storing that in the document column to
satisfy a `NOT NULL` constraint would be the dishonest-empty-string failure in a new costume. They keep
their own store and are named as assertions.

**Settled 2026-08-27:**
- `@@unique([trackedUrlId, capturedAt])`, second resolution. Simplest thing that works.
- **An unchanged re-fetch is dropped.** But see Level 1 — the existing scanner's `seenDigests` set
  appears to drop non-consecutive reverts too, and a page returning to a former state is forensically
  significant. Two answers to "is this capture new?" must not ship in one write path.
- Extend `UrlSnapshot` rather than renaming it to `Capture`: `fullText`'s ~40 call sites move one at a
  time, and a rename turns that into a big-bang for no gain.

### Identity may change. It may not change unrecorded

Nothing in this plan is constrained by wanting to avoid orphaned anchors. **Level 10 forbids deleting
records, not superseding them** — `previousFileHash` and the `ORPHANED_ANCHOR` verdict exist precisely
so an identity can move while every anchor stays explainable, and that path was already exercised on
2026-08-23. An orphan *with* a record is the supported case; an orphan with none is the forbidden one.

An earlier revision of this document conflated the two and told an implementer that changing identity
was forbidden. It is not. **The guiding principles are model clarity, data integrity and future-proof
ids** — the cost of re-anchoring is not an argument against any of them, and state may be rebuilt from
scratch if that produces cleaner code.

**Identity hashes the whole document.** Today direct-URL evidence hashes `url + text[0:40k]`, which
means **any two pages identical for forty thousand characters and divergent after share one identity**.
That is the same failure family as the diff truncation this entire plan descends from — an arbitrary
cap applied at write time, invisible in the output, silently deciding what counts. The repository has
now been burned by it three times: the 8-chunk diff cap, `MIN_CLAIM_LENGTH = 40`, and this. One rule
for snapshots and evidence alike: no cap, no unexamined tail.

### Storage is lossless. Filtering is a versioned view that MARKS and never DELETES

There is no reason to *store* an extraction; there may be a reason to *compute* a view. Every original
justification for extracting at write time has dissolved: the Archive's toolbar is removed by the `id_`
URL, identical chrome produces no diff line and cancels itself, and only *changed* chunks ever reach a
model.

The deeper objection is not cost. **Extraction requires deciding what a page is about before you know
what you are looking for**, and a forensic archive's premise is that you do not know yet. This corpus
proves it: the finding the investigation rests on is that the *adverse-event reporting channel* was
removed — a link, and Readability classifies links as chrome by design. An instrument tuned to find
"the article" is blindest to exactly the parts of a government page that carry obligations rather than
prose: reporting channels, committee protocols, contraindication notes, links to forms. Those are what
a ministry edits when it changes what it is telling people.

### The chain attests to the document

`contentHash` is SHA-256 of the *extraction*, so today the chain attests to less than the platform
claims. Anchoring the document makes *"this page held exactly this text on this date"* true for the
first time, and it happens **once**: a document is fixed forever, so its anchor never moves again.

The cleaned view then becomes derived, versioned state — carrying a `boilerplateVersion` and the
`sourceStateHash` it was computed against. It can be improved forever without touching the chain.
That also resolves what would otherwise sink corpus-derived boilerplate: a growing corpus means a
changing view, which is normal for derived state and fatal for anchored state.

### Boilerplate is a property of the template, not of one page's history

A rule of "a block appearing across most captures of this page is chrome" **degenerates at N=1**: with
one capture every block scores 1/1, so the rule classifies the whole page as chrome. It inverts rather
than weakening — and a live URL is N=1.

Chrome is **what repeats across a corpus**, and the corpus extends along either axis:

| axis | corpus | works when |
|---|---|---|
| **time** | many captures of one URL | the page has history |
| **space** | many pages of one site | the page has siblings, including at N=1 in time |

With one page, one capture and no siblings there is no evidence, and the only honest behaviour is to
filter nothing and record that nothing could be judged. **Confidence therefore belongs in the stored
verdict**: a block called chrome on the evidence of 83 captures and one called chrome on 3 are not the
same claim.

**The safety property that makes a mistake affordable: classification MARKS, it never DELETES.** A
misclassification then costs noise in a report. Today's extraction deletes, so a misclassification
costs a phantom change or an invisible edit — and this corpus contains one of each.

---

## 3. Every check result is stored state

A check that runs and is not recorded has not been performed, as far as anything downstream can tell.
**The verdict is the deliverable, not the check.**

| kind of check | treatment |
|---|---|
| function of data already held | **derive on read** |
| **observation of an external system** | **must be stored** — it cannot be re-derived |
| expensive function of held data | **cached verdict**, invalidated by version |

### `UNAVAILABLE` is a verdict about a CHECK, never about DATA

A check may legitimately be unavailable — the Archive was down, so this claim is unverified. **A
mandatory attribute may not.** Conflating them is how "we could not check" becomes indistinguishable
from "we never stored it". A metric counting rows that lack mandatory data is an admission that the
schema permits invalid rows; the answer is to make them impossible and pay for the migration.

### The record

Mirroring `ClaimTrajectoryComputation`, which already stores `sourceStateHash` / `detectionVersion` /
`computedAt`:

| field | why |
|---|---|
| subject (type + id) | what was checked |
| `checkType` | a subject has several |
| `verdict` | `VERIFIED` · `CONTRADICTED` · `UNAVAILABLE` |
| `detail` | for `CONTRADICTED`, what disagreed — **this is the pipeline-defect record** |
| `checkedAt` | when |
| **`verifierVersion`** | if the verifier changes, every stored `VERIFIED` becomes unproven |
| **`sourceStateHash`** | makes staleness computable rather than assumed |

The last two are not optional: this repository has invented that provenance axis after the fact four
times already (`classifierVersion`, `summaryVersion`, `diffInputVersion`, `DETECTION_VERSION`).

**Open design decision:** one polymorphic `IntegrityCheck` table, or verdict columns per subject.
Recommendation: the table — a subject carries several check types, history matters across re-checks,
and it yields a coverage report for free.

---

## 4. The levels

**A level is not finished until code makes its invariant unbreakable. No level begins until the one
below it can no longer produce bad data.** That ordering is the entire method: it is what separates
this from the three previous encounters with the same defect.

**An enforcement is not proven until it has been observed to FAIL.** Level 0 was validated by breaking
the extractor deliberately — returning `""` fails 18 tests, returning the extraction instead of the
document fails 11. A guard watched only in its green state has not been demonstrated to guard anything,
and this repository already records that lesson twice. Every level's enforcement gets the same
treatment before it counts as done.

Each level below names its **invariant** (what must always be true) and its **enforcement** (the code
that makes violating it impossible or impossible-to-miss).

### Level 0 — the instrument · **DONE**

*Invariant:* the extractor's behaviour is pinned to real captures, so a regression cannot silently make
every verification agree with whatever it checks.

*Enforcement:* `test/extraction/extractorPinnedToRealCaptures.test.ts` — three frozen `id_` captures,
16 tests, mutation-verified (returning `""` fails 18; returning the extraction instead of the document
fails 11).

### Level 1 — the capture

*Invariant:* every capture holds the document as fetched. No capture exists without one.

*Enforcement:* `document` is `NOT NULL`; the write path takes it as a required parameter, so no code
path can construct an incomplete capture; `documentHash = sha256(document)` over the **whole** document,
computed at write. **One write path** — `recordCapture({ trackedUrlId, provenance, capturedAt,
waybackTimestamp?, document, extraction })` — with `WaybackScraper` and the URL-tracking path both as
callers.

*Schema:* extend `UrlSnapshot` rather than renaming it. `provenance` enum `NOT NULL` (existing rows
backfill to `WAYBACK`); `capturedAt` `NOT NULL`, derived from `waybackTimestamp` for archived captures
and from the fetch moment otherwise; `waybackTimestamp` becomes nullable, since only archived captures
have one. Keep `@@unique([trackedUrlId, waybackTimestamp])` — Postgres does not collide on NULLs — and
add `@@unique([trackedUrlId, capturedAt])`.

*Notes:* `rawText`/`rawContentHash` and the backfill already exist and become this level's foundation.
`fullText` does not survive into the new model — consumers move across one at a time, since ~40 call
sites read it and swapping a column's meaning underneath them creates a different silent inconsistency.

*Verify before building:* `WaybackScraper` keeps a `seenDigests` set and appears to skip **any**
previously-seen digest, not merely consecutive ones — which would silently discard an exact whole-page
revert. A page returning to a former state is forensically significant; it is the whole-page form of
what claim trajectories detect. Confirm the reading against the code, and make sure "is this capture
new?" has **one** answer across archived and direct paths rather than two.

### Level 2 — the source

*Invariant:* the bytes stored are the bytes the source served, and a later change on the source's side
is detectable.

*Enforcement:* persist the CDX `digest` — already fetched by `WaybackScraper`, used only to
de-duplicate, and thrown away — and compare it against what was fetched. Also fix `archiveHttp`'s error
message, which reports `HTTP 200` when axios throws for a non-status reason: a success code presented
as a failure.

#### Archiving, and reconciling our own fetch against it

Save Page Now is not a twin bolted onto a direct capture — it is **step 2 of the submission pipeline**
(§2). Ask CDX what the Archive already holds; if nothing, ask SPN to create a capture; create evidence
from the archived capture when it is available. Submission is **queued, never blocking**: SPN answers
quickly but CDX indexing lags, sometimes far beyond a request's lifetime.

Our own fetch is kept as the pending precursor and **reconciled** when the archived capture lands. We
fetched at `T`; the Archive captured at `T+δ`, and the page can change in between — so this is not
proof of our bytes, it is a second observation whose value is precisely that it can disagree:

| outcome | meaning |
|---|---|
| byte-identical | corroboration — an independent party observed the same document |
| **different** | a real change inside the gap, **or** a fault in our fetch. Either is a finding. |
| unavailable | SPN is rate-limited, and some pages cannot be archived at all. **Not a pass** — `UNAVAILABLE` per §3. |

Treating the archived capture as proof of the direct one would repeat the error this plan exists to
undo: agreement between two readings of one artifact is not corroboration, and here they are not even
readings of the same moment.

*Also at this level:* **`list_captures` must partition by provenance.** Only archived captures may be
cross-checked against the CDX index — listing a direct capture there would report it as a gap in the
Archive, which is a fabricated finding produced by the tool built to detect fabricated findings.

### Level 3 — the anchor

*Invariant:* the on-chain record attests to the document, and the database's claim about it is checked
rather than asserted.

*Enforcement:* anchor `documentHash`; run `check_on_chain_status` automatically on the write path and
record the verdict. Never a rule a human must remember.

### Level 4 — the view

*Invariant:* no block unique to a capture is ever classified chrome; the view is versioned and marks
rather than deletes.

*Enforcement:* corpus-derived classification along the time and/or space axis, storing
`boilerplateVersion`, `sourceStateHash` and **the observation count behind each judgement**.

*Known hard case, not solved:* **changing chrome** — `createEvidenceFromUrl.ts` records a live visitor
counter on this same domain that differs every fetch, so frequency reads it as content. Marking rather
than deleting is what keeps this affordable.

### Level 5 — the diff

*Invariant:* a change the platform reports survives the documents. A chunk said to be REMOVED is absent
from the after document; a chunk said to be ADDED was absent from the before one.

*Enforcement:* the check runs at write and stores a verdict. **A `CONTRADICTED` diff is written, not
refused** — refusing it would delete the evidence that the pipeline is wrong, which is how this was
found. It is simply never promotable.

*Note:* `measureExtractionDivergence` already implements this check as a measurement; Level 5 is the
same logic moved to write time. **Granularity is not a detail** — whole-chunk matching found 2 of 81
and missed the case this work exists for; sentence granularity found 7.

### Level 6 — the trajectory

*Invariant:* every reported flip is confirmed against the documents at that boundary.

*Enforcement:* verified at computation, verdict stored with `DETECTION_VERSION` and `sourceStateHash`.

*Carried forward:* `MIN_CLAIM_LENGTH = 40` still filters trajectory candidates — the same
length-as-significance assumption that had to be removed from the diff classifier, surviving in a
second subsystem. A short claim can be the load-bearing one; "אין סיכוי לחלות בקורונה בגלל החיסון" is
not long. Changing it bumps `DETECTION_VERSION` and recomputes every trajectory, so it belongs in this
level rather than after it.

### Level 7 — the evidence

*Invariant:* identity is recomputable from its captures, and a summary attributes nothing to a page
that the page does not contain.

*Enforcement:* recomputability asserted at write and audited standing — **5 of 7 anchored records were
unrecomputable on 2026-08-23**. Summary phrases checked against the capture they describe.

*Hard case, needs design before code:* the fabrication `לתסמינים קלים וחולפים בלבד` carries **no
quotation marks**, so quoted-span checking misses it entirely. Content n-gram checking needs an
explicit false-positive policy — a summary legitimately characterises as well as describes, and only
the second is checkable. A gate that cries wolf gets disabled.

### Level 8 — the opinions

*Invariant:* nothing presents a model's judgement as a computed fact.

*Enforcement:* `isLegallySignificant`, `evidenceTier`, categories and key figures **cannot be
verified** — no archive lookup settles an opinion. Their controls are complete provenance, honest
variance (`classifierDraws` is null on older rows, meaning a single draw was stored as though it were a
measurement, and null must render as that sentence), and rendering separation. The tutorial's own
`COMMON_RULES` already forbids mixing the two registers in one table; `get_forensic_timeline` already
breaks it. `evidenceTier` matters most — publication check 6 gates on it, and the check reports itself
as NON-BINDING because every confirmed record currently sits at or above Tier 2.

*Also at this level:* `get_forensic_timeline` returns **no evidence linkage at all**. Its query is a
flat `select` of nine `UrlVersionDiff` columns and never traverses `Evidence.urlVersionDiffId`, which
is a `@unique` FK — so the tool reports that a legally significant change occurred while staying silent
on whether it is backed by anchored evidence. A researcher cannot distinguish *"we detected this"* from
*"we can prove this"* without a second tool and a manual join on dates. One `include` and two fields
per row.

### Level 9 — the thesis

*Invariant:* a thesis cites nothing that is not `VERIFIED`.

*Enforcement:* the publication gate consumes the verdicts instead of `audit_thesis_claims` merely
reporting. Known blind spot carried forward: Hebrew number-words, which the auditor already declares it
cannot check.

*Three defects in the surrounding pipeline belong to this level, all recorded in
`docs/gf-framing-assessor-defects.md`:*

- **`researcherClaim` is a free-text paraphrase slot** with no verbatim constraint and no validation.
  Across four framing runs — two environments, two corpora, five days apart — the assessor produced the
  same three errors every time: dropped a trailing conjunct, inserted a causal phrase the researcher
  never wrote, and asserted page wording that `verify_claim_text` shows is absent. Reproducibility is
  the signature of a systematic prior, not of sampling noise. Fix: require it to be a whitespace-
  collapsed substring of `proposedFraming`. The open decision is what happens when the model will not
  comply — dropping the contradiction suppresses possibly-real ones, retrying burns calls, flagging
  `claimQuoteVerified: false` suppresses nothing. Queued as task `task_3e0501b3`.
- **`whatEvidenceShows` is equally unconstrained and nothing checks it against the archive.** The
  researcher's thesis prose is audited mechanically; the critic's assertions never are. The one
  participant whose claims go unverified is the one the researcher is told to defer to.
- **`FIGURES_HEDGED` passes silently on a name the system has never recorded.** The check states this
  itself. On production, `פרופ' מתי ברקוביץ'` is not a registered key figure, so a sentence naming him
  would pass **unchecked rather than verified** — a silent pass wearing the face of a real one, which
  is the same failure shape as `UNAVAILABLE` counting as `VERIFIED`.

*And one gap in the session record itself:* **`add_session_note` requires a `thesisId`**, so a framing
session with no thesis attached has no way to record a correction — during exactly the phase where
corrections are discovered. A seven-versus-five error found mid-framing on 2026-08-27 could not be
written to the session it belonged to.

### Level 10 — supersede the old corpus

*Invariant:* every anchored hash stays explainable forever.

*Enforcement:* the old rows are marked `SUPERSEDED` and excluded from every read, query and thesis
path. **Nothing is deleted — not evidence, not theses, not snapshots, not diffs, at any point in the
rebuild.**

The existing data is kept throughout as the **comparison**: rebuilding from the archive and diffing the
result against what is stored is what turns "7 of 81" into a complete account of what the old pipeline
got wrong. That role is now **permanent rather than temporary**, which is the better outcome — the
measurement stays reproducible forever instead of disappearing with the data.

#### Why deleting is wrong

Removing an evidence row does not invalidate its on-chain anchor. It removes our ability to *explain*
that anchor, and **an unexplained anchor is indistinguishable from a tampered one.**

The schema already says this. `Evidence.previousFileHash` exists to record a deliberately created
orphan, so that a future audit finds it explained rather than — in the comment's own words — reasonably
concluding "the vault had been tampered with". Level 10 as originally written would have manufactured
exactly that condition **at scale, deliberately, for ~90 permanent public transactions.**

**This level forbids DELETION, not supersession.** Identity is free to move — see §2, "Identity may
change. It may not change unrecorded." An orphan *with* a record is the supported case and has been
exercised once already; an orphan with none is what is forbidden. No design decision elsewhere in this
plan should be constrained by a wish to avoid orphaning an anchor.

**No new tombstone table.** `previousFileHash` and the `ORPHANED_ANCHOR` verdict
(`checkOnChainStatus.ts`) already provide the mechanism, and the superseded rows are what explain their
own anchors. A tombstone would be a second record of something the retained row already states.

#### One registry, forever, append-only

**No replacement `EvidenceRegistry` is deployed.** Considered and rejected, for six reasons:

1. It rotates `EVIDENCE_REGISTRY_ADDRESS`, the most dangerous variable in the system. A transaction to
   a codeless address **succeeds** and produces false `CONFIRMED` evidence; `Web3Service`'s
   `assertRegistryDeployed` exists solely because a wrong value was once found one command from use.
2. Multi-registry lookup adds a failure mode that does not exist today: an old hash queried against the
   new registry returns "not registered", which reads as **"never anchored"** — strictly worse than an
   orphan, because it is a confident wrong answer rather than a flagged one.
3. It taxes independent verification. One address, one query, runnable by a stranger, **is** the
   product.
4. The old snapshot anchors are **not wrong**. They attest that a text really was in our store on that
   date — only narrower than the platform claimed. Narrower is not false.
5. `contracts/src/EvidenceRegistry.sol` is **shared source** with Bronze Fortress. The variables are
   namespaced (`EVIDENCE_REGISTRY_ADDRESS` vs `BF_EVIDENCE_REGISTRY_ADDRESS`), which mitigates the
   blast radius but does not remove it: shared source makes a redeployment feel routine across both
   apps, and it is expensive to get wrong in either.
6. **An append-only log containing its own corrections is more credible than a clean one.** A registry
   wiped at the moment its operator discovered problems is precisely what a tampering auditor looks
   for. Chain of custody is not a feature here — it is the product.

**The same choice applies on staging**, even though Sepolia history is disposable. Divergent
architecture would stop staging being a faithful rehearsal of production, which is the only reason
staging earns its cost.

#### No cleanup session is required

The dedicated-session requirement is dropped from this level — **not because the rule weakens, but
because no destructive operation remains to trigger it.** `CLAUDE.md` §"Deleting data requires its own
session" stays in force, and any future proposal to actually delete any of this must satisfy it in
full.

---

## 5. What is already done

| | |
|---|---|
| Level 0 | complete — 16 tests, mutation-verified |
| `get_environment` | shipped to production `930be6c`; identity by configuration and chain, never by content |
| documents stored | `rawText`/`rawContentHash` columns, one fetch, both readings; **staging backfilled 83/83** |
| the measurement | `forensics:measure-divergence` — **7 of 81 contradicted**, 0 uncheckable, lowest retention 60% |

## 6. Open questions

- **Production.** This plan rebuilds staging. Production holds the same 8 records and 83 captures and
  is the environment the public reads.
  **Sequencing settled 2026-08-27: staging is finished first, and no production data is migrated until
  it is.** Whether production then receives the same rebuild is still open.
  *Measured that day, and worse than the handoff assumed:* production does not merely lack the
  backfill, it **lacks the columns** — `rawText`/`rawContentHash` are absent, because migration
  `20260827050000_snapshot_raw_text` sits in the 13 commits `master` is behind. Production's latest
  applied migration is `20260826140000_classifier_draws`. So the order is forced and cannot be
  compressed: ship migration A → backfill production's 83 captures → only then can `SET NOT NULL`
  apply there. Attempting it in one ship aborts the production deploy, which is the pre-deploy
  guarantee working as designed, not a hazard.
- **Staging's published thesis** is still published and still contains the false claim.
- **Correcting evidence summary `0x7517947a…`**, which describes its source falsely
  (`קלים וחולפים בלבד`, none of which is on the page). **Superseding does not resolve this and never
  did** — a superseded row is retained and explainable, not corrected, and **production holds the same
  record** regardless. This item stays open on its own merits. The
  mechanism exists (`forensics:resummarize` → `SummaryCorrection`, safe because evidence identity is
  snapshot-derived so a rewritten summary does not orphan the anchor), but re-running the same model
  over the same extracted items guarantees nothing: the prior that produced the phrase is still there.
  Needs a before/after design asserting the rewritten summary contains no phrase absent from the
  capture it describes.
- **The production thesis walk** is held at `create_thesis_draft`, framing session
  `cmta7d2zs0001fd7pxtbezflk` ACTIVE with `rounds: 2`, `contradictions: []`.
- `IntegrityCheck` as one table or per-subject columns (§3).
- Level 7's false-positive policy.
