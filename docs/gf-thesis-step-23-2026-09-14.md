# Thesis step 23 on staging — the gate, the refused publication and the public reads, exercised through the connector (2026-09-14)

**What this records.** Thesis step 23 landed on 2026-09-14 as PR #446 (`staging` `4b0dacf`): the gate — A6's first
seventeen checks mapped from ONE evaluation of PUBLISHABLE(v) — the publication assessor with its approved prompt,
`check_publication_readiness`, `publish_thesis` and `unpublish_thesis`, the three public routes of A5, PUBLIC_PAGE's EVER
arm, `NAMES_PERSON` moved from `decide_gap` into check 16, and one migration (`ThesisAnalysis.researcherId`, backfilled from
the thesis's author). The MCP surface went 38 → 41, and nine clauses of `docs/gf-thesis-flows.md` were amended in place
with zero line delta. The same evening the researcher ran the step on staging through the claude.ai connector, UNSTEERED —
they typed, the REVIEW seat predicted each step on record before it ran and scored it after, and read the database through
its own staging connector to confirm what was and was not written. The review log, with every decoy of the five chunks, is
`handoffs/R49-review-state.md`, outside this repository.

The thesis is step 20's: `cmu0yyflb00028861pp46alwq` under `PATIENT_RIGHTS_13`, head `cmu10rkop00088861e6zgcf4b`, two
EVIDENCE citations of the corona page's diffs, both unargued, one gap OPEN and one REQUESTED, the analysis stale.

**The run chosen was the SHORT one (the researcher's word): the refusals and the attempt record, not a publication.** Both
citations are unargued, and step 22's record (§4, Live-1 and Live-7) leaves claim/text mismatches the researcher means to
resolve in a third version before anything publishes. A first real publication — debates, promotions, the published page,
the notice, the refused re-publication — is its own session after that version.

## 1. Verified, and not

**Landed, verified from the deployment (not from the suite):** deploy `03ed3ad1` of `4b0dacf` SUCCESS; the deployed
handshake's `tools/list` 41 with the three new tools present; `db:check-drift` "No difference detected."; in the staging
container `ThesisAnalysis.researcherId` text NOT NULL, `ThesisAnalysis_researcherId_fkey` ON DELETE RESTRICT, the one
existing analysis backfilled to its thesis's author, the migration finished in the ledger. CI run 34877187231: "Lint debt
unchanged: 84"; unit 1,727 · walk 468 · evidence 197 / 0 · thesis 370 / 19 (the 19 are step 24's).

**Verified by the run — each a prediction written before the step and matched to the return, writes checked by data:**

| claim | how it was seen |
|---|---|
| readiness without a rationale is free and writes nothing | the answer carried every check; the thesis's history since the run began stayed empty |
| the gate names what it examined, and an empty scope says so | an unpromoted citation left checks 5, 6, 9 and 10 EXAMINED_NONE, and the session read them as "not clear", never as passes |
| every hard failure is reported, not the first | readiness and publication both named PUBLIC_INTEREST_STATEMENT, EVIDENCE_ARGUED, EVIDENCE_NOT_WITHDRAWN, ANALYSIS_CURRENT and GAPS_DECIDED with their subjects |
| readiness with a rationale spends once, returns the assessor's opinion labelled, and writes nothing | the assessment arrived under "the publication assessor's opinion"; history unchanged by data |
| the assessor judges the rationale against the TEXT and the names across text and appeals | RATIONALE_SUBSTANCE PASS, verdict SUPPORTS, NAMES_NO_PERSON PASS with an empty list, and the advisory ALLEGATIONS_FRAMED failing with the text's closing sentence quoted word for word |
| an advisory check never refuses | ALLEGATIONS_FRAMED failed at readiness and was absent from the publication's refusal |
| a refused publication is recorded, attributed, and moves nothing | one history row `PUBLICATION_ATTEMPT` `cmu1kiyma0002p2ggg7rqflvv`, attributed to the author; the pin and the public-interest statement still null |
| a draft does not exist to the public | anonymous `GET /api/thesis` → `[]`; `GET /api/thesis/<the thesis>` → 404 with the same bytes as an id naming nothing; the version route → 404; without the staging access header → 401, the environment's gate, not identity |
| withdrawing what was never published is refused and writes nothing | NOT_PUBLISHED; no Withdrawal row, by data |

**Not verified by the run (the suite holds them; the run did not reach them):** a publication that passes — the pin, the
PUBLISHED attempt, `opened`, `overObjection`; the public page's body and its markers; a withdrawal and its notice; a
withdrawn version refused on re-publication; a lost race; a stored public-interest statement; any promoted citation, so
checks 5, 6, 9 and 10 evaluating a real record.

## 2. The run, step by step

| step | act | predicted | returned | score |
|---|---|---|---|---|
| 0 | `get_environment` | staging, CONFIRMED, 84532, `0xDA3B…4C73`, `elws…ae` | as predicted | held |
| 1 | `check_publication_readiness`, no rationale | not publishable; 1–3 pass; 4, 7, 8, 13, 14 fail; 6 and 9 pass; 11–12 and 15–17 examined none | as predicted, except 6 and 9 (and 5, 10) examined none | held, two misses |
| 2a | the rationale drafted with the researcher | — | read the head first; the three parts; no person; waited for approval of the words | held |
| 2b | readiness WITH the rationale (paid) | the same five failures; 15 pass; SUPPORTS likely; 16 pass, empty; 17 at risk; nothing written | exactly that; 17 failed on the conclusion sentence | held |
| 3 | `publish_thesis`, no statement (paid) | NOT_PUBLISHABLE with the five; one refused attempt; pin and statement null | exactly that, by data | held |
| — | anonymous reads (REVIEW, HTTP) | `[]`; 404; the same 404 for a made-up id; 404; 401 without the access header | identical | held |
| 4 | `unpublish_thesis` | NOT_PUBLISHED; nothing written | exactly that, by data | held |

Two model calls were spent, both on the default provider.

## 3. Findings, by owner

**What claude.ai did with the surface alone.** It ran the free check before offering a paid one, read EXAMINED_NONE for what
it is, drafted a rationale from the head rather than from the claim, waited for the researcher to approve the words, named
the cost and the permanent attempt before publishing, and told the researcher after the refusal that the free check is the
same gate for nothing. It closed with the design's own caution: a withdrawal is one-way for that version.

- **Live-9 — a free readiness check cannot see a stale pin before promotion.** An unpromoted citation leaves
  EVIDENCE_VERIFIED, EVIDENCE_PINNED_CURRENT, EVIDENCE_DERIVED and EVIDENCE_DIFF_INPUT_SOUND examining nothing, so "what is
  still wrong" is only complete after the debates. The gate is honest; the instructions could say it. Owner: the record.
- **Live-10 — the claim/text mismatch has reached a third artifact.** The claim restores the items "between 5.9 and 6.9" and
  narrows the removal to 31.7–5.8; the text says 5.8 → 6.9 and 28.6 → 5.8. After the request (step 22) it now shaped the
  rationale, which the session wrote around both dates. Owner: the researcher, in a third version.
- **Live-11 — the session called the remaining path "mechanical".** Two debates and promotions are the researcher's argued
  judgement per record (T3). Owner: the instructions (one word).
- **Live-12 — check 17 quoted the text, not the claim.** The claim itself states "בכך הופרה חובת הגילוי" as fact; the assessor
  quoted the text's conclusion. The claim is fixed verbatim from its framing, so its wording is decided at framing. Owner: the
  record.
- **Live-13 — the call page and the public-interest statement.** COMPLIANCE.md rule 5 puts the statement on every thesis
  AND call page; `get_whistleblower_call` does not return it. **Ruled 2026-09-14: the call page reads it from
  `GET /api/thesis/:id`** — one source, nothing built; thesis A5 owes the sentence. Owner: A5, in place.
- **Live-14 — the refusal order, misread once.** The session said the withdrawal reason was "accepted as non-empty"; NOT_PUBLISHED
  precedes REASON_REQUIRED, so the reason was never evaluated. Owner: the record.

**What the run cost:** two model calls, and one refused PublicationAttempt that stays on the thesis — the design's own
permanence, on staging.

## 4. What step 23 leaves

- **Nine amendments applied with PR #446** (`docs/gf-thesis-flows.md`, in place): T5 :746 and :757, §12 :1135, A3 :1402, A4 :1494
  and :1511–:1512, A5 :1570, A6 :1600, A7 :1646.
- **Owed:** A5's sentence for Live-13; the first real publication on staging (run B) after a third version.
- **Step 24** — `list_thesis_reviews`, `audit-theses`, the ARRIVED arm's shape — the 19 acceptance cases still red name it.
