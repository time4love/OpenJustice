# Integrity at write time — plan

**Written 2026-08-26**, after the production thesis walk stopped at the drafting step. Not started.
No code, no production writes. Amend before anything is built.

Companions: `docs/gf-framing-assessor-defects.md` (the four defects),
`docs/gf-production-thesis-replay-plan.md` (how they were found).

---

## The finding this plan exists for

Every component the platform computes is computed over a Readability extraction that discards roughly
a third of the archived document — **and discards a different third on different captures.** Measured:
69% retained on the 2022-08-05 capture, 66% on 2022-09-06. That variance is not cosmetic. It is what
manufactures a removal that never happened.

Proven on 2026-08-26: `נמצאו יעילים ובטוחים לשימוש` is present in the raw archive on 2022-07-24,
2022-08-05 and 2022-09-06. The extraction has it on two of the three. The trajectory layer therefore
reported a removal and a restoration that never occurred, and staging's **published** thesis asserts
the phrase was added on 2022-09-06.

### The part that decides the shape of this plan

**This was already known, written down, and had already been connected to this exact false claim.**
`src/lib/archiveText.ts`, authored 2026-08-23, says in its header comment that the extraction dropped
"the sentence a real thesis went on to claim had been ADDED the following day". Three days later the
thesis still says it.

It is at least the third recorded instance of the same class:

| instance | recorded in |
|---|---|
| a byline date dropped, corrupting what `evidenceDate` meant | `src/lib/evidenceCapture.ts` |
| a live counter kept by the crude strip, unstable across fetches | `src/mcp/tools/createEvidenceFromUrl.ts` |
| the FDA safety sentence dropped on one capture only | `src/lib/archiveText.ts` |

Three documented encounters, no change to the storage decision. **A comment is not a control, and a
tool a human must remember to run is not a control either.** Every defect found on 2026-08-26 survived
because nobody invoked the tool that would have caught it — including the one whose consequence had
already been written down.

---

## Part A — store the document, filter at read time

### The one line that decides it

`src/services/WaybackScraper.ts:417` returns `extractArticleText(...)`, and that return value becomes
`UrlSnapshot.fullText`. Everything else — chunks, diffs, items, classifications, trajectories,
`contentHash`, the on-chain anchor, evidence identity — is downstream of that single expression.

`extractRawText` already exists in the same module, is already exported, and is already used by
`verify_claim_text` and by `create_evidence_from_url`'s analysis path. **The scanner is asking the
shared extractor for the wrong reading.**

### Why the original justification no longer holds

Readability was chosen to suppress diff noise, and the dominant noise source was the Internet Archive's
own injected toolbar, whose timestamp differs on every capture. That is already solved by a URL
suffix: `web.archive.org/web/<ts>id_/…` returns the original bytes with no Archive injection, and the
verification path already fetches exactly that.

What remains is site chrome — and Readability is the wrong instrument for it. It is tuned to find *the
article* on a news page. A government information page is sections, lists and links. What it discarded
here was not chrome: it was the FDA safety sentence and the adverse-event reporting links. The
heuristic did not fail at the margins.

### The design error, stated generally

**Discarding at write time.** A destructive filter in the storage layer makes the loss unrecoverable
and invisible, and every downstream layer inherits it with no way to detect it.

The correct shape is **store everything, filter at read time, reversibly.** Boilerplate then becomes
derived state computed from the corpus itself: a text block appearing byte-identically across most of
a page's captures is chrome. That is deterministic, auditable, per-site, and a block wrongly classified
as chrome is still in the store — reclassifying it re-anchors nothing.

The repo has already made this move one layer up: the truncation repair replaced an 8-chunk cap with
storing all 290 chunks and deriving coverage on read. Same lesson.

### Cost, honestly

- `contentHash` = SHA-256(`fullText`) changes for all 83 snapshots → **83 re-anchors**.
- `Evidence.fileHash` is snapshot-derived → evidence identities change → previously anchored records
  become orphaned anchors.
- **Precedent exists.** `Evidence.previousFileHash` is in the schema for exactly this, from the
  2026-08-23 identity migration, and `check_on_chain_status` already reports `ORPHANED_ANCHOR`.
- Classifier cost does not scale with stored text: only *changed* chunks are sent to a model. More
  stored text means more diff noise, which is what the read-time boilerplate mask is for.

### The recompute IS the measurement

Recompute all 81 diffs from full text, then diff the new results against the stored ones. The delta is
the error rate — **measured across the whole corpus, not sampled**. Every row that changes identifies a
diff, a trajectory and possibly an evidence record that was wrong. This replaces the separate
extraction-variance study proposed earlier; it answers the same question with the work that has to
happen anyway.

---

## Part B — the checks become preconditions, not tools

Every check run on 2026-08-26 already exists as code. All of them ran months or days too late.

### The three-state verdict

Today the system cannot distinguish **"checked and true"** from **"never checked"**. That is precisely
how a fabrication reaches an anchor wearing the same face as a verified fact. Every derived row gains:

| verdict | meaning |
|---|---|
| `VERIFIED` | checked against the raw archived document, and it holds |
| `CONTRADICTED` | checked, and the raw document disagrees — the row is a finding about the pipeline |
| `UNAVAILABLE` | could not be checked. **Not a pass.** |

### Where each check runs

| written | precondition |
|---|---|
| `UrlSnapshot` | compare stored text with the raw `id_` document; store `retainedPercent` as a column |
| `UrlVersionDiff` | every chunk claimed *removed* must be absent from the raw after-capture; every chunk claimed *added* must be present in it |
| `ClaimTrajectory` | every flip confirmed against raw at that boundary — the check that kills the FDA trajectory at birth |
| `Evidence` summary | every phrase the summary attributes to the page must be a substring of the capture it describes — kills `קלים וחולפים בלבד` before it can be anchored |
| framing assessment | `researcherClaim` must be a verbatim span of `proposedFraming` (queued: `task_3e0501b3`) |
| thesis | `audit_thesis_claims` exists and **reports**; the publication gate should consume its verdict |

### Verify at write, block at promotion

These checks depend on the Internet Archive, a third party that returned 503 during this very session.
A hard write-time block would let an IA outage stop all scanning.

So: **run the check at write, record the verdict, and gate the consequential act.** Promotion, citation
and publication refuse any row that is not `VERIFIED`. An outage then delays evidence; it never
fabricates it.

This is the same fail-closed shape the codebase already uses — `EvidenceStatus` defaults to
`PENDING_REVIEW` so a forgotten field cannot claim a false anchor — and the same derive-on-read
reasoning as `unanchoredSnapshots`.

---

## Sequencing

1. **Part B first, on the current pipeline.** It is additive, it blocks nothing that works today, and it
   stops the bleeding: no *new* unverified row can be promoted or cited.
2. **Then Part A**, whose recompute is the measurement.
3. **Then decide what to do with the existing corpus** — with a measured delta rather than an estimate.

Rationale: doing Part A first would recompute the corpus with nothing watching, and we would be
trusting the new numbers for the same reason we trusted the old ones.

## Open questions for the researcher

- **Staging's published thesis is still published and still contains the false claim.** Unpublish now,
  or correct and republish once the recompute lands? It is wrong either way, and it is public now.
- The production thesis walk is **held** at `create_thesis_draft`. Resume after Part B, after Part A,
  or accept a thesis written against `verify_claim_text`-checked quotations on the current layer?
- Does `retainedPercent` below some threshold make a snapshot unusable, or merely flagged?
