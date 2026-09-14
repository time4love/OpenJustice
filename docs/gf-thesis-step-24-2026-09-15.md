# Thesis step 24 on staging — what an author owes, the completed audit, and a list read through the connector (2026-09-15)

**What this records.** Thesis step 24 landed on 2026-09-15 as PR #448 (`staging` `25e28e9`): REVIEWS(researcher) in
`services/thesisPredicates`, the GATED read `list_thesis_reviews`, and `audit-theses` completed as thesis A7 :1621–:1628 specifies,
with its integrity-ledger command. The MCP surface went 41 → 42. No migration. The same day the step's instrument ran in the
staging container and the researcher read the new list through the claude.ai connector, UNSTEERED — they typed one line, the REVIEW
seat had written its prediction before the run and scored it after, and read the database through its own staging connector to
confirm nothing was written. The review log, with every decoy of the four chunks, is `handoffs/R50-review-state.md`, outside this
repository.

**What this step could not exercise, and does not claim.** Plan step 24's *Verified by* — "on staging, a re-walk moving one cited
record's content; the author's list shows it; `audit-theses` exits 2 before the new version and 0 after" — needs a PUBLISHED thesis,
and staging has none: step 23's run stopped before a publication by the researcher's choice. **That exercise is OWED to the first real
publication (run B), and is not faked here** (the researcher's ruling, 2026-09-14, R-ii). FLAGGED and STALE_TRAJECTORY were proved by
fixtures only.

## 1. What landed, and the rulings that shaped it

| what | where | contract |
|---|---|---|
| REVIEWS(researcher) | `services/thesisPredicates.ts` `reviews` | A3 :1408–:1410 — FLAGGED on PUBLISHED(t) through evidence's `flagged`; STALE_TRAJECTORY on PUBLISHED(t) and HEAD(t) through the one trajectory resolver and `trajectoryCurrent`, one entry per trajectory; UNARGUED on HEAD(t) through `unargued`. Computed on read, none stored (A3 :1413) |
| the two shared readings | `flaggedCitations`, `staleTrajectories` | readiness' information on a published head (A6 :1610–:1612) and REVIEWS call the same two functions |
| `list_thesis_reviews({})` | `services/thesisReviews.ts`, `mcp/tools/listThesisReviews.ts` | A4 :1523–:1525, T6 :863–:882 — refuses NO_RESEARCHER alone; `{ owed, reviews }`, oldest first, each with its material and one command |
| FLAGGED's material | `evidenceReviews.ts` `recordRowOf` · `movedFrom` · `latestDecisionOf` | one loader extracted from evidence's review list, asked from the citation's PIN instead of from `affirmed` |
| `audit-theses` | `services/auditTheses.ts`, `scripts/auditTheses.ts` | A7 :1621–:1628 — one `evaluatePublication` per published version; TRAJECTORY_CURRENT and CLAIM_FRAMED joined to the evidence half |
| the ledger | `docs/integrity/ledger.json` `thesis-cites-verified` | thesis refactor plan §6 — its command, `dependsOn` re-pointed from the retired `thesisPublication.ts`, `runner`, `exitMeans` |

**The researcher's rulings (2026-09-14/15)**, each asked after the look-up across the four designs, the triage and the plans:

- **The envelope stays `{ owed, reviews }`**, the count first; thesis A4 :1523–:1525 amended in place, zero line delta. Its only
  ground had been built code (step 17's record §9 item 4, closed).
- **Step 24 lands on its fixtures; plan §6's staging exercise is owed to run B.**
- **FLAGGED's "old beside new" is the citation's PIN beside CURRENT**, not the affirmed version beside CURRENT. FLAGGED's content arm
  is NOT CITATION_CURRENT (evidence A3 :1034, :1054–:1056); after a REAFFIRM the evidence list has no entry while every citation still
  pins the old version and is flagged (evidence §6 :535–:538). So evidence's list could not be called for this material, and one loader
  was extracted instead. The material also carries the supersession cause and the record's latest review decision, or `null`.
- **The audit covers the current pin only** (A7 :1622, A3 :1364), never every version ever published.
- **The wording on the surface** — the tool's description, PUBLICATION's closing sentence, NOT_YET's opening — approved by the
  researcher before the commit.
- **The zero-subject audit run is not recorded on the integrity board** (§2).

**Found and ruled in the review loop (the REVIEW seat's, overturnable), and why each mattered:**

- **The audit reads ONE evaluation per version** (A7 :1646, A6 :1586): the builder's proposal loaded CLAIM_FRAMED's framings and rounds a
  second time beside the gate's evaluation.
- **NOT ANSWERABLE left the audit as unreachable.** A DOCUMENT citation cannot be written in this tree (the version write refuses a
  `#doc_` token), and the one evaluation throws on a name the corpus cannot resolve, which `runOperationalScript` turns into exit 1 — a
  case now holds that line. The arm returns with document refactor plan :396 (step 34).
- **A trajectory no stored pass holds is never dropped in silence**: REVIEWS throws naming it; readiness names it through check 11; the
  audit exits 1 on it.
- **Three properties no case held, each found by a decoy that stayed green and fixed before landing**: that REVIEWS writes nothing (a
  planted row write passed all 247 cases), the audit's trajectory count above zero, and FLAGGED reading PUBLISHED(t) only. Each case now
  reddens on its decoy.

**The suite at landing** (CI run 34899041926, both jobs SUCCESS): unit 1,745 · walk 468 · evidence 207 · thesis **389 / 0** (the 19
step-24 cases red since step 17, green) · "Lint debt unchanged: 84 problems across 15 rules." Deploy `6d428bcd` SUCCESS; the deployed
handshake's `tools/list` 42 with `list_thesis_reviews` present; `db:check-drift` "No difference detected."

## 2. The instrument in the staging container

`railway ssh --environment staging --service glass-fortress-backend "cd apps/glass-fortress/backend && npm run forensics:audit-theses --
--env staging"`, run from the repository, the output captured before any filter. The operational context agreed on all four axes
(Railway, APP_ENV, the database, the chain), deployment `6d428bcd` at `25e28e9`:

```
Published versions: 0
EVIDENCE citations: 0
TRAJECTORY citations: 0

No thesis has been published in this environment, so no published citation was examined.
Nothing is unpublishable because nothing is published — this is a true answer about the
versions, not a check that was skipped.
```

followed by the NOT EXAMINED line (CURRENT_ANALYSIS, GAPS_DECIDED, the statement, the assessment, SHED), the emitted ledger record, and
**exit 0** — A7's "a pass that examined nothing says zero, never nothing".

**Ruled 2026-09-15: that run is not recorded on the board.** Mapped to CLEAN, an exit 0 over zero subjects would score "run, current,
held" — the ledger's own rule (B8: a run over an empty set is VACUOUS and never proof) forbids it. The entry gains `runner` and
`exitMeans` (0 CLEAN · 1 FINDING · 2 FINDING), `lastRun` stays `null`, and the board reads "never run" until run B gives the audit a
published version; that run's log is ingested with `node tools/integrity-board/record.mjs`. The board was regenerated with this record.

## 3. The live read, scored

The researcher's whole prompt, in a new claude.ai conversation: *`list_thesis_reviews on staging`*. The prediction, written before:
owed 2 · both UNARGUED on thesis `cmu0yyflb00028861pp46alwq`, head `cmu10rkop00088861e6zgcf4b` · the corona page's two diffs with their
pins · one `open_debate` each · owed since the head's writing · no FLAGGED or STALE_TRAJECTORY (nothing published) · nothing written.

| predicted | returned | score |
|---|---|---|
| 2 owed | "You owe 2 reviews on staging, both the same kind and both on the same thesis" | held |
| UNARGUED on the thesis's head | version `cmu10rkop…`, "two head citations of type UNARGUED (cited but never taken through a debate)" | held |
| the two corona diffs | `2022-06-28 07:31:45 → 2022-08-05 05:33:01` and `2022-08-05 05:33:01 → 2022-09-06 23:24:35` on `corona.health.gov.il/vaccine-for-covid/` | held |
| one command each | "a paste-ready open_debate command; you just need to supply the rationale" | held |
| owed since the head's writing | "14 Sep 2026 09:07 UTC"; the head was written at 09:07:12Z | held |
| no FLAGGED, no STALE_TRAJECTORY | none | held |
| nothing written | by data: the thesis's history since the step-23 run is empty; both citations still unargued; theses 1, published 0 | held |

The session did not call `get_environment` first; its "on staging" rests on the environment every tool answer carries, which is enough
for a read — the instructions ask for the check before a write, and none was made. It closed by asking whether to open a debate on the
first record and with what rationale — asking for the researcher's words rather than supplying its own — and nothing was opened: a debate
is run B's.

## 4. Findings, by owner

- **Live-15 — record hashes in a table.** The records were listed by truncated hash beside the capture pair that already names each
  record (evidence A1); the instructions say never to show a hash in a list. Owner: the instructions' SPEAKING paragraph.
- **Live-16 — an inference unmarked.** "They likely belong to one argument about how that page changed" is the session's reading,
  not labelled as such; T3 argues each record in its own debate. Owner: the instructions.
- **Live-17 — a paid act offered without its price.** `open_debate` is one assessor call; the offer did not say so. Owner: the
  instructions, or the command's line in the tool's material.

## 5. What step 24 leaves

- **Owed to run B:** plan §6's exercise — a re-walk moving a cited record's content, FLAGGED on the author's list, `audit-theses` exiting
  2 before the new version and 0 after — and the first run recorded on the integrity board. Run B itself waits on a third version that
  resolves the claim/text mismatches (step 23's Live-10).
- **The ARRIVED arm** is document refactor plan step 32's, by addition; the instructions' limit now points there.
- **Recorded, not applied:** "owed since" for a moved diff takes the newest cause, while a citation stopped being current at the earlier
  endpoint move — evidence's own list uses the same rule, and changing it changes both.
