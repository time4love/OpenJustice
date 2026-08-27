# Integrity at write time — plan

**Written 2026-08-26. Rewritten the same day around the validation matrix**, after a review asked the
only question that matters of a plan like this: *does every component we manage have a validation?*
The first draft did not survive it — it guarded the derived middle and left both ends unguarded.

Not started. No code, no schema, no production writes.

Companions: `docs/gf-framing-assessor-defects.md` (the four defects),
`docs/gf-production-thesis-replay-plan.md` (how they were found).

---

## 1. The finding

Everything the platform computes is computed over a Readability extraction that discards roughly a
third of the archived document — **and discards a different third on different captures.** Measured:
69% retained on the 2022-08-05 capture, 66% on 2022-09-06.

Proven 2026-08-26: `נמצאו יעילים ובטוחים לשימוש` is in the raw archive on 2022-07-24, 2022-08-05 and
2022-09-06. The extraction has it on two of the three. The trajectory layer reported a removal and a
restoration that never happened, and staging's **published** thesis asserts the phrase was added on
2022-09-06.

### Why the plan is shaped by history rather than by the defect

**It was already known, already written down, and already connected to this exact false claim.**
`src/lib/archiveText.ts`, authored 2026-08-23, states in its header that the extraction dropped
*"the sentence a real thesis went on to claim had been ADDED the following day"*. Three days later the
thesis still says it. At least the third recorded instance of the class:

| instance | recorded in |
|---|---|
| a dropped byline date, corrupting what `evidenceDate` meant | `src/lib/evidenceCapture.ts` |
| a live counter kept by the crude strip, unstable across fetches | `src/mcp/tools/createEvidenceFromUrl.ts` |
| the FDA safety sentence dropped on one capture only | `src/lib/archiveText.ts` |

**A comment is not a control. A tool a human must remember to run is not a control either.** Every
defect found on 2026-08-26 survived because nobody invoked the tool that would have caught it —
including the one whose consequence had already been written down.

---

## 2. The validation matrix

Every component this platform manages, what validates it today, and what will.

| # | component | produced by | validation today | after |
|---|---|---|---|---|
| 1 | **Wayback capture** | Internet Archive | **none** — the CDX `digest` is fetched and discarded | **Phase 2** |
| 2 | **`UrlSnapshot.fullText`** | Readability over #1 | none | **Phase 1** |
| 3 | **`UrlSnapshot.contentHash`** | SHA-256 of #2 | `rediffFromSnapshots.ts:182` only, inside one path | **Phase 3** |
| 4 | **`UrlSnapshot.onChainTxHash`** | anchors #3 | `check_on_chain_status`, human-invoked | **Phase 7** |
| 5 | **raw chunks** | diff of #2 vs #2 | none | **Phase 4** |
| 6 | **claim items** | classifier over #5 | containment coverage as a *measure* | **Phase 4** |
| 7 | **`isLegallySignificant`** | model judgement | provenance only | **Phase 6 — cannot be verified** |
| 8 | **`aiSignificance`** | model prose | none | **Phase 5** |
| 9 | **`ClaimTrajectory`** | string search over #2 | none | **Phase 4** |
| 10 | **`Evidence.fileHash`** | derived from #3 | a unit test | **Phase 3** |
| 11 | **tier / categories / key figures** | model | none | **Phase 6 — cannot be verified** |
| 12 | **thesis, critique, framing** | researcher + models | `audit_thesis_claims`, reports only | **Phase 8** |
| 13 | **`verify_claim_text`** | reads #1 directly | unit tests, not pinned to a real capture | **Phase 0** |

### Three admissions this matrix forces

**a. Rows 7 and 11 cannot be verified, and the plan must say so.** "This change is legally
significant" and "this is Tier 2" are opinions. No archive lookup settles them. Their control is not
verification but **disclosure**: complete provenance, honest variance, and never rendering them in the
same register as a computed fact. `tier` matters most because publication check 6 gates on it.

**b. The first draft's summary check would not have caught the defect it was written for.** It said
*"every phrase the summary attributes to the page must be a substring of the capture"*. The actual
fabrication — `לתסמינים קלים וחולפים בלבד` — carries **no quotation marks**. A quoted-span check misses
it entirely. See Phase 5.

**c. Both ends were unguarded.** The plan validated the derived middle and skipped the source (row 1)
and the instrument (row 13) — the two nobody thinks to check, because one is "just the archive" and
the other is "the thing that checks".

---

## 3. Every check result is stored state

A check that runs and is not recorded has not been performed, as far as anything downstream can tell.
**The verdict is the deliverable, not the check.**

### What to store, and what to derive

The `unanchoredSnapshots` rule — *derive from state, never track a transition* — is right, and it
applies to **functions of data already held**. A validation result is frequently not that:

| kind of check | treatment | example |
|---|---|---|
| function of data already held | **derive on read** | `retainedPercent`, once both texts are stored |
| **observation of an external system** | **must be stored** — it cannot be re-derived | the CDX digest matched at fetch time; the chain held this hash |
| expensive function of held data | **stored as a cached verdict**, invalidated by version | the Phase 5 summary check |

Note what Phase 1 does to this table: once `rawText` is stored, most phrase checks stop being
observations and become pure functions of local data. What stays genuinely observational is small —
the fetch itself, archive availability, and chain state.

### `UNAVAILABLE` is a verdict about a CHECK, never about DATA

A check may legitimately be unavailable: the Archive was down, so this claim is unverified. That is a
true and useful state.

**A mandatory attribute may not.** `rawText` is not a check result — it is part of what a snapshot *is*.
Conflating the two is how "we could not check" becomes indistinguishable from "we never stored it",
and a metric counting rows that lack mandatory data is an admission that the schema permits invalid
rows. The answer is never to report the partial state; it is to make it impossible, and to accept a
migration as the price.

### The record

One shape for every check, mirroring `ClaimTrajectoryComputation`, which already stores
`sourceStateHash` / `detectionVersion` / `computedAt` and reports `fromCache`:

| field | why |
|---|---|
| subject (type + id) | what was checked |
| `checkType` | a subject has several — a diff has chunk-presence *and* item-containment |
| `verdict` | `VERIFIED` · `CONTRADICTED` · `UNAVAILABLE` |
| `detail` | for `CONTRADICTED`, what disagreed — the finding itself |
| `checkedAt` | when |
| **`verifierVersion`** | **which checker said so** |
| **`sourceStateHash`** | what it was checked against |

### Why the last two are not optional

**If `extractRawText` changes, every stored `VERIFIED` becomes unproven.** A verdict without
provenance is a claim about the past that stops being true silently — and this repository has invented
that axis after the fact four times already (`classifierVersion`, `summaryVersion`,
`diffInputVersion`, `DETECTION_VERSION`). Building the fifth one correctly the first time is the
cheapest it will ever be.

`sourceStateHash` makes staleness computable rather than assumed: a verdict whose source hash no longer
matches the current state is not `VERIFIED`, it is **stale**, and a gate must treat those differently.

### What it buys

- **"never checked" becomes queryable for every row in the system**, not just for diffs — the
  distinction whose absence let a fabrication reach an anchor.
- gating becomes a query rather than a re-run, so the publication gate does not depend on a
  third party being up at publication time.
- coverage becomes a number: *what fraction of this corpus is verified, by which verifier, against
  which state* — an integrity report the platform can publish about itself.
- a `CONTRADICTED` verdict with its `detail` **is** the pipeline-defect record. Today those live in
  markdown files written by whoever noticed.

### Design decision, not yet made

One polymorphic `IntegrityCheck` table, or verdict columns on each subject? Recommendation: **the
table**, because a subject carries several check types, history matters across re-checks, and it gives
the coverage report for free. Verdict columns on hot paths only if a gating query proves too slow —
and never as the source of truth, since that is the denormalisation `unanchoredSnapshots` warns about.

---

## 4. Phases

**Every phase below writes its verdict per §3.** A phase that checks something and records nothing has
not been implemented — the check would be exactly the kind of thing a human must remember to re-run,
which is the failure this whole plan exists to end.

### Phase 0 — pin the instrument (row 13)

Tests only. No schema, no runtime change. **First, because every other phase trusts it.**

A fixture suite built from real captures of `corona.health.gov.il/vaccine-for-covid`, asserting
known-present and known-absent phrases through the **real** `extractRawText` / `extractArticleText`:

- `נמצאו יעילים ובטוחים לשימוש` — present in raw on 2022-08-05, **absent from the extraction**. The
  divergence itself becomes a regression test.
- `חולפים`, `חולפות`, `בלבד` — absent from both readings on 2022-09-06.
- `תופעות הלוואי השכיחות … מופיעות לרוב יום או יומיים` — present in both on 2022-09-06.

If `extractRawText` regresses, every verification in the system silently starts agreeing with whatever
it is checking. Nothing detects that today.

### Phase 1 — store the document (rows 2, 3)

`UrlSnapshot` gains **`rawText`** and **`rawContentHash`**, and they end up **`NOT NULL`**. A snapshot
without the document it was extracted from is not a valid snapshot.

`WaybackScraper.scrapeSnapshot` already holds the raw HTML in memory at line 416 and discards it on
line 417. It returns both readings instead of one. **No extra fetch, no third-party dependency** — the
only check in this plan with no Internet Archive availability risk.

`NOT NULL` cannot be added to a populated table directly, so three steps across two deploys:

| step | what | where |
|---|---|---|
| **1** | migration A — add both columns **nullable**; code always writes them | deploy |
| **2** | backfill existing snapshots from the Archive | operational script, per environment |
| **3** | migration B — `SET NOT NULL` on both | deploy |

After step 3 the partial state is structurally impossible: no counter, no report, nothing to surface.
If step 3 ever runs before a backfill completes, `migrate deploy` fails and the previous version keeps
serving — it fails safe by construction. Between steps 1 and 3 the application already enforces it:
`upsertSnapshot` takes `rawText` as a required parameter, so no code path can create an incomplete row.
Only pre-existing rows can be incomplete, and only until step 2.

**Fill only when null; never overwrite.** `upsertSnapshot` is deliberately idempotent (`update: {}`),
so the fill is a separate conditional write. A refetch that *disagrees* with stored raw text means the
Archive's own copy changed — a finding, and Phase 2's job, not something to silently overwrite.

**`contentHash` is untouched.** Still `sha256(fullText)`, so **zero re-anchoring**; that decision belongs
to Part A, in its own session.

**Why `rawContentHash` is stored rather than derived**, against §3's own rule: a checksum's entire
purpose is to disagree with a recomputation. Stored hash beside stored text is how Phase 3 detects that
the text has been damaged. Derive it and there is nothing to compare against — the recomputation would
simply reproduce the corruption and call it consistent. This is the same reason `contentHash` is stored.

**Consequences beyond row 2:** divergence becomes computable forever without refetching;
`verify_claim_text` stops needing the Archive for stored captures (the 503 class of failure
disappears); Part A's recompute becomes a **local** operation; storage cost is nothing (83 × ~6KB).

### Phase 2 — pin the source (row 1)

The CDX API already returns a payload `digest` per capture, and `WaybackScraper` already reads it —
then uses it only to de-duplicate and throws it away.

Persist it on `UrlSnapshot`, and compare it against what was actually fetched at write time. That gives
two things nothing provides today: proof the bytes we stored are the bytes the Archive indexed, and —
on any later refetch — **detection that the Archive's own copy changed or vanished**.

The data is already in hand. This is the cheapest guarantee in the plan.

### Phase 3 — self-consistency audit (rows 3, 10)

A standing check, runnable as a script and surfaced as a read-time flag:

- `sha256(fullText) == contentHash`, and `sha256(rawText) == rawContentHash`
- **`Evidence.fileHash` is recomputable from its snapshots.** Not hypothetical: on 2026-08-23, **5 of
  7 anchored records could no longer be recomputed at all.** A record whose identity cannot be
  re-derived has an anchor attesting to something the database no longer holds.

### Phase 4 — derived claims verified at write (rows 5, 6, 9)

Each derived row gains a three-state verdict:

| verdict | meaning |
|---|---|
| `VERIFIED` | checked against the raw document, and it holds |
| `CONTRADICTED` | checked, and the raw document disagrees — a finding about the pipeline |
| `UNAVAILABLE` | could not be checked. **Not a pass.** |

The third state is the point: the system currently cannot distinguish *"checked and true"* from
*"never checked"*, which is how a fabrication reaches an anchor wearing the face of a verified fact.

- **chunks**: every chunk claimed removed must be absent from the raw after-capture; every chunk
  claimed added must be present in it.
- **trajectories**: every flip confirmed against raw at that boundary — the check that kills the FDA
  trajectory at birth.
- **claim items**: containment coverage becomes a **gate**, not a measure. Items are model paraphrases,
  so exact-substring checking does not apply; containment does.

**A `CONTRADICTED` row is written, not refused.** Refusing it would delete the evidence that the
pipeline is wrong — which is how this was found at all.

### Phase 5 — summary verification (row 8), the hard one

The defect carries no quotation marks, so quoted-span checking is useless. What is needed is content
n-gram extraction from the summary, checked against the capture it describes, with an explicit
false-positive policy: a summary legitimately *characterises* (`הוסרו ההנחיות`) as well as
*describes*, and only the second is checkable.

**This phase needs design before it needs code.** It is the one place in the plan where the check is
not obvious, and shipping a noisy check would be worse than none — a gate that cries wolf gets
disabled.

### Phase 6 — the rows that cannot be verified (7, 11)

No verification is possible. The controls are:

- **complete provenance** — `classifierVersion`, `classifierPromptHash`, `classifierModel`,
  `diffInputVersion` (all exist).
- **honest variance** — `classifierDraws` exists but is **null on older rows, meaning a single draw was
  stored as though it were a measurement**. Null must render as that sentence, not as a blank.
- **rendering separation** — a model opinion and a computed fact must never appear in the same table.
  The tutorial's own `COMMON_RULES` already states this; `get_forensic_timeline` already breaks it.

### Phase 7 — chain verification, automated (row 4)

`check_on_chain_status` exists and is correct. `CLAUDE.md` says to call it after any promotion — which
makes it a rule, not a control. Run it automatically on the promotion path and record the verdict.

### Phase 8 — the publication gate consumes the verdicts (row 12)

`audit_thesis_claims` reports; the gate should refuse. A thesis may not cite a row that is not
`VERIFIED`. Known blind spot to carry forward: Hebrew number-words, which the auditor already declares
it cannot check.

---

## 5. Part A — the recompute, in its own session

Once Phase 1 has stored the documents, recomputing diffs and trajectories from `rawText` is a local
operation. **The recompute is the measurement**: diffing the recomputed results against the stored ones
gives the error rate across all 81 diffs rather than a sample.

**This gets a dedicated session.** It rewrites `contentHash` for 83 snapshots and changes the identity
of every evidence record on production. It is not a `DELETE`, so the destructive-database hook will not
stop it — but it is the same shape of risk: irreversible, wide, and easy to start while attention is
elsewhere. Capture a before-state, run from landed code, verify with `check_on_chain_status` after.

Precedent exists: `Evidence.previousFileHash` and the `ORPHANED_ANCHOR` verdict were built for exactly
this during the 2026-08-23 identity migration.

Boilerplate suppression, once raw text is stored, becomes **derived state computed from the corpus** —
a block appearing byte-identically across most of a page's captures is chrome — rather than a heuristic
tuned for news articles guessing at a government information page. Deterministic, auditable, and
reversible: a block wrongly classed as chrome is still in the store.

---

## 6. Sequencing, and why

**0 → 1 → 2 → 3** first: pin the instrument, store the document, pin the source, prove
self-consistency. All four are additive, none gates anything that works today, and together they make
every later check possible **without the Internet Archive in the critical path**.

**Then 4 → 5 → 6 → 7 → 8**, which turn measurement into refusal.

**Then Part A**, in its own session, with the error rate measured rather than estimated.

Doing Part A first would recompute the corpus with nothing watching — trusting the new numbers for the
same reason we trusted the old ones.

## 7. Open questions

- Does a low `retainedPercent` make a snapshot unusable, or merely flagged?
- Phase 5's false-positive policy: what fraction of a summary's content n-grams must be present before
  the summary counts as describing rather than fabricating?
- `IntegrityCheck` as one table or per-subject columns (§3).
- **Staging's thesis is published and contains the false claim.** Unpublish now, or correct after the
  recompute? It is wrong either way, and it is public now.
- The production thesis walk is **held** at `create_thesis_draft`. Resume after Phase 1, after Part A,
  or accept a thesis whose quotations were `verify_claim_text`-checked on the current layer?
