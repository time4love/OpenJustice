# Evidence step 15 — the gate, 2026-09-10

**A dated record, never edited.** What was ruled before and during the code, the one ruling whose
GROUNDING was wrong and what that changed in the protocol, what six review rounds found, what the
reviewer's own substitutions proved, and what is still the researcher's. Written by the REVIEW seat
with the seat crossed, on the researcher's word, and read cold by the DEV seat before it landed.
**Every number below was measured on 2026-09-10, by command, on the tree at `0aaed3c`**, except
where a line says which review round's tree a reproduction ran against — those are the round's own
observations, recorded as observed.

The step is `docs/gf-refactor-plan.md` §3b, step 15 — *"The six checks of A6 calling A3's
predicates, check 6 gone; `audit-theses`."* — built to `docs/gf-evidence-flows.md` A3, A6 and A7,
composed with `docs/gf-thesis-flows.md` T5, A3, A6 and A7 (the gate's table, its ids and its order),
`docs/gf-document-flows.md` §4 and A6 (the non-binding arm FELL; check 17 asked about a document
reports that it examined none) and `docs/gf-interaction-flows.md` A2 and A4. Its contract was the
sketch `handoffs/R38-chunk-1-sketch.md` (outside this repository; 1,349 lines, six rounds, closed
with no HIGH or MEDIUM), graded in `handoffs/R39-review-state.md`.

Landed as PR #411, commit `5334d0b` (14 files, +2,829 / −178) → `staging` `0aaed3c`. CI run
`34451248391`: conclusion `success`, jobs `acceptance-suite` and `glass-fortress-backend` both
`success`, and the ratchet line **"Lint debt unchanged: 92 problems across 15 rules."** The staging
deployment for `0aaed3c` went `in_progress` → `success` (GitHub deployment `6367001697`, 07:45 →
07:47 UTC). `npm run db:check-drift`: exit 0, **"No difference detected."** No migration: zero files
under `prisma/` in the PR. The MCP surface is **23** before and after (18 `registerTool` + 5 `tool`);
step 15 registers nothing.

---

## 1. FOUR RULINGS, AND THE ONE WHOSE GROUNDING WAS WRONG

**Q1 — the strict fold: `publishable` is STRICTER than A3's last clause.** A3 `:1047` names one
failing verdict, a CONTRADICTED chunk. The tree's check 17 fails on three of the four states its fold
can return — CONTRADICTED, UNCHECKABLE and AWAITING_DERIVATION — and only SURVIVES passes. Ruled by the
REVIEW seat in the sketch's first round: the strict fold stays, and check 17's fold is not this step's
to touch. A later sketch round made AWAITING_DERIVATION stop failing; the round after it reverted
that. The fold did not move, and the code proves it (§4).

**THE SUBSTANCE STOOD; THE CITATION DID NOT — corrected in the R39 seat's first report, before any
code was graded.** For five sketch rounds the fold was grounded in
`docs/gf-evidence-input-soundness-2026-08-30.md:44–:45` — the UNCHECKABLE row (*"fails, named
apart"*) and the UNCHECKED row (*"never checked is not supported"*). That is a DATED FINDINGS DOC, and
`docs/gf-two-session-protocol.md`'s rule of the same morning files every dated findings doc under
DESCRIBE, not DECIDE. The obvious rescue fails too: evidence A6 `:1210` says check 17 is *"unchanged in
name; judges CURRENT(e.record)'s chunks"* — which fixes the NAME and the SELECT and says **nothing**
about which states fail. The appendices are genuinely silent on the fold.

**What decides it is two PLAN steps:**

- `docs/gf-refactor-plan.md` §4 **rule 3** — *"A REWRITE file is rewritten to the appendix, in the step
  that changes its shape."* The appendix asks for the rebase onto CURRENT(diff). Changing which states
  fail is not rewriting to the appendix; it is changing behaviour the appendix never asks about.
- `docs/gf-thesis-refactor-plan.md` **§5**, the same rule from the other side: check 17 is *"rebased
  onto CURRENT(diff)'s per-chunk survival … exactly as A6 words it"*.

**The 2026-08-30 measurement CORROBORATES why the fold is what it is; it is not what makes it
binding.** The sketch's §0c, §1d and §3c are correct in substance and mis-grounded in citation, and
this record is where the citation is repaired — the source module's own header already says it
(`src/services/evidenceInputSoundness.ts:29–:35`).

**It produced a protocol line**, landed with this record in `docs/gf-two-session-protocol.md` and
required in both seat prompts by `check-handoff.py`: *a dated findings doc CORROBORATES; it never
DECIDES; where one is the only ground, the question is open and goes to the researcher.* Without it the
appendix-or-plan-step rule has one failure mode left — a real measurement with no appendix behind it
would have to be either obeyed without grounds or thrown away.

**Why no existing control could have caught it.** The protocol's second act re-asks *"every question
the seat is holding"* when a reading completes. Q1 was RULED, not held, and a ruling is not re-asked.
That is how a mis-grounded ruling survived six rounds, and why the new line checks authority at the
moment a dated doc is CITED rather than when a question is re-asked.

**Q2 — the exit is keyed on the failure's REASON, never on the conjunct's id.** Thesis A7 `:1626–:1627` is
the rule: *"exit 1: a published version that is not PUBLISHABLE by any conjunct the flag does not cover"*.
Evidence A7's two-arm sentence (*"not VERIFIED or not ARGUED"*) is its shorthand. Document A6 `:1531`
gives one conjunct two causes — `EVIDENCE_DERIVED` fails on AWAITING_DERIVATION *or* SHED — and document
A3 `:1382` gives FLAGGED the SHED arm only at document step 28. A rule keyed on the id cannot express
that. One keyed on the reason routes `DERIVED` and `CITATION_CURRENT` to exit 2 through the flag today,
and nothing in the fold changes on the day SHED arrives. That claim is now held by a TYPE:
`ConjunctReason` begins with `FlagReason` (`src/services/evidencePredicates.ts:826–:837`).

**Q3 and Q4 were ANSWERED BY THE DOCUMENTS and carried as open questions for five sketch rounds.**
*Does `audit-theses` exit 0 over zero published versions?* Yes, with the two counts first. Three
clauses say so: evidence A6 `:1202` (*"A check that examined nothing says so"*), thesis A6 `:1588` (*"an
empty scope says so"*) and thesis A7 `:1656–:1657` (*"a pass that examined nothing says zero, never
nothing"*). *Who writes the ledger's `thesis-cites-verified` entry?* Thesis step 24:
`docs/gf-thesis-refactor-plan.md:245`, *"gains its command at step 24"*. `docs/integrity/ledger.json`
is untouched by this step. Both are in `docs/gf-rulings-audit-2026-09-10.md` as ANSWERED.

## 2. WHAT WAS BUILT

- **`publishable(mentionId)` and `publishableEvidence(versionId)`** in
  `src/services/evidencePredicates.ts` (1,229 lines). A REPORT, not a boolean: one `Conjunct` per A3
  clause plus `DERIVED` — A6's promoted precondition — each `{ id, verdict: PASS | FAIL | EXAMINED_NONE,
  reason, detail }`. Every conjunct is a CALL: `argued`, `verified`, `currentVersionOf`,
  `citationCurrent`, `assessEvidenceInputSoundness`. Five round trips per mention, declared, three of
  them the price of calling rather than re-spelling. A mention that does not exist THROWS — every field
  of the report names the mention it examined, so there is no report to build. `evaluable: false` only
  when no conjunct FAILed and one examined nothing because its CLASS has no predicate yet. A missing
  evidence row is `evaluable: true`, with `RECORD_PROMOTED` the one FAIL. **`publishableEvidence` is the
  EVIDENCE HALF of thesis A3's `PUBLISHABLE(v)`**, which thesis step 23 calls as its first conjunct and
  never re-folds.
- **`evidenceChecks(versionId)`** — `src/services/evidenceChecks.ts` (211 lines). A6's six checks, ids
  5–10 in thesis A6's order, all hard. It calls `publishableEvidence` ONCE, maps the result, and reads no
  database. Check 6 (`EVIDENCE_TIER`) is recorded as retired in the header rather than left as an
  absence. The header also names the seam the six rows cannot carry: evaluability is
  `publishableEvidence`'s, and thesis step 23's consumer must ask for both.
- **Check 17, rebased a second time** — `src/services/evidenceInputSoundness.ts` (326 lines). The
  SELECT loads every stored version and `currentVersionOf` chooses. 11b's `orderBy: derivedAt desc,
  take: 1` read the NEWEST version, which after a partial re-derivation is not CURRENT and which
  reported SURVIVES where A3 says AWAITING_DERIVATION — the direction that publishes a false claim.
  `binding` and `passed` left for a three-valued `verdict`, and `examined` and `outOfScope` became named
  lists. The fold is unchanged.
- **`audit-theses`** — `src/services/auditTheses.ts` (227), `scripts/auditTheses.ts` (30), and
  `npm run forensics:audit-theses` through `runOperationalScript`. It walks PUBLISHED versions: the pin
  decides, never a status. It exits 0 · 2 · 1 on the failure's reason, and exit 1 outranks exit 2. The
  two counts come first, and `NOT EXAMINED` and `NOT ANSWERABLE` are printed even at zero. It throws
  when a `DERIVED` or `CITATION_CURRENT` failure is one FLAGGED does not name — two functions reading
  the same rows cannot disagree unless one of them is wrong. Operational scripts: **16**.
- **`test/operationalScriptExit.test.ts`** (94 lines) — the returned exit code observed as a PROCESS
  exit (§3, round 5).
- **The scans** (`test/evidence/scans.test.ts`, 738 lines): `built` gains `publishable`; the gate MAPS
  and does not LOAD — five cases, one of which holds BOTH declaration spellings, and among the decoys a
  non-firing control and a type-position control; `RESEARCH_ACT_MODULES` gains the gate and the instrument; `NAMES` moves to file
  scope, unchanged.

**The cases, by jest's own count.** Evidence project: **197 — 196 green, 1 red BY NAME**:
`publishable.test.ts` 39 · `evidenceChecks.test.ts` 16 · `auditTheses.test.ts` 16 · `scans.test.ts` 38 ·
`predicates.test.ts` 38 (the one red) · `identity.test.ts` 19 · `invariants.test.ts` 19 ·
`auditEvidence.test.ts` 12. In `unit`: `evidenceInputSoundness.test.ts` 13 and
`operationalScriptExit.test.ts` 3. The evidence project stood at 121 at the base `de4e196`, as the R39
seat measured it there. Nothing was removed.

## 3. WHAT SIX ROUNDS FOUND

| round | subject | found | disposition |
|---|---|---|---|
| 1 | DEV's reading report, no code | 2 MEDIUM, 2 LOW — a line range that did not reproduce; the test header's stale five-state count | applied |
| 2 | 7.1, the predicate | 0 · 0 · 4 LOW | loop ended on 7.1 |
| 3 | 7.2, the gate | **the gate DISCARDED `report.evaluable`**: a version citing only a DOCUMENT record rendered two PASS, four EXAMINED_NONE and no FAIL — a clean bill over a version the predicate had just said it could not grade | closed in round 4 by naming the seam in the header and a case, with no change to §2b's shape; the wrapper is the researcher's (§7) |
| 4 | 7.3, check 17 | the module's `:128` still said "FOUR OF THE FIVE STATES FAIL" against a four-valued union; and a PROBE — a CURRENT version with ZERO chunks makes check 17 PASS | comment fixed, proven comment-only; the probe became a question (§7) |
| 5 | 7.4, the instrument | **the line that turns a returned number into `process.exit` was held by no case**; and **`reasonFor` re-derived every failure's reason in a second module** — one borrowed from `flagged`, one hard-coded — with an EXIT CODE resting on it | both applied: a process-level test, and `Conjunct.reason` set where the FAIL is rendered |
| 6 | the two MEDIUMs, and 7.5 | nothing | **LOOP ENDS — no HIGH or MEDIUM** |

**Round 5's second finding is where a LOW became a MEDIUM.** *"Conjunct carries a reason key"* was a LOW
at 7.1, when only prose depended on it. At 7.4 an exit code did. **A carried LOW is re-graded whenever
something new starts depending on it.**

## 4. WHAT THE DECOYS PROVED

**Two questions, two different decoys, and only the second answers the step's central clause.**
*"Every conjunct is the CALL it is, never re-spelled"* (sketch §1d). Forcing one conjunct's verdict to
PASS shows that a case is SENSITIVE to the conjunct. An inline re-derivation would behave identically
and pass every scan in the tree, because the gate-reads-nothing rule is scoped to `evidenceChecks.ts`.
So each PREDICATE was broken at its own definition, and the CALLER's cases were watched.

Against 7.1's tree, in round 2: forcing each conjunct alone reddened `RECORD_PROMOTED` 3 · `ARGUED` 5 ·
`VERIFIED` 6 · `CITATION_CURRENT` 5 · `DERIVED` 4 · `INPUT_SOUND` 7. Breaking each predicate at its
source reddened `argued` 5 · `citationCurrent` 8 · `currentVersionOf` 6 · `verified` 3 ·
`assessEvidenceInputSoundness` 3.

**Re-run for this record on the LANDED tree**, each plant compiling (tsc clean), measured against
`publishable.test.ts`'s own baseline of 39 green, and each file restored and `cmp`'d identical:

| predicate, broken at its own definition | `publishable.test.ts` cases reddened |
|---|---|
| `argued()` always true | **6** |
| `citationCurrent()` always current | **2** |
| `currentVersionOf()` never AWAITING while any version exists | **2** |
| `verified()` with attribution not required | **3** |
| `assessEvidenceInputSoundness()` never unsound | **6** |

**All five are live calls, proven by substitution rather than by reading.** The counts differ from
round 2's because the file grew from 28 to 39 cases and two plants took a different shape — round 2
inverted `citationCurrent`, and this run makes it always true.

**The fold is load-bearing, not merely unchanged in text** (round 4, against 7.3's tree). Version
choice back to newest-first reddened 3 cases; AWAITING_DERIVATION made to stop failing reddened 3;
UNCHECKABLE made to stop failing reddened 1. And no assertion moved from FAIL to not-FAIL: one expected
STRING changed, necessarily, because AWAITING_DERIVATION's reason now has two causes.

**The returned exit code.** In round 5, replacing `runOperationalScript`'s
`if (typeof code === 'number') process.exit(code);` with `void code;` left **unit 1,322 / 0 and evidence
182 / 1 — identical to baseline**. `audit-theses` could have exited 0 on every run with every suite
green. On the landed tree the same plant reddens **2 of 3** cases in `operationalScriptExit.test.ts`
(exit 2 and exit 1 reach the shell), and the third case, the non-firing control, stays green. **Ask of
every instrument whether its exit is observed as a PROCESS.**

**The reason key is held.** Round 5's six substitutions against 7.4 each fired on exactly its own case,
one of 16. In round 6 an INPUT_SOUND reason forced to `INPUT_UNSOUND` at its render site reddened 2, and
WITHDRAWN rendered as `NO_EVIDENCE_ROW` reddened 3.

**Decoys that proved nothing, and said so.** In round 2 one plant was REFUSED BY THE COMPILER and one
did not reach its path; both were re-planted in a compiling form before counting. In round 4 the
reviewer's ENTIRE first pass proved nothing, for three causes: `noUnusedLocals` refused the red-first
plant; the fold plants left half an old `return` behind; and a probe planted in a TEST file passed
`tsc` and then failed to compile under jest, printing nothing. Two harness facts follow, both measured that day:

- **`tsc --noEmit` does not compile test files**: `tsconfig` covers `src/` and `scripts/`. A plant in
  `src/` is checked by `tsc`; a plant in a test is checked only by jest's suite status and TOTALS.
- **eslint cannot parse the test tree**: `npx eslint <test file>` exits 1 with a project-service
  parsing error. "eslint clean on every touched file", said over a test, reports a parse refusal as a
  pass.

## 5. DECLARED DEVIATIONS, ACCEPTED

- **The cases live in a new `test/evidence/publishable.test.ts`**, not in `predicates.test.ts` as the
  sketch's §7.1 said. One `jest.mock` per module per file, and `predicates.test.ts` mocks `lib/prisma`
  with the fixture PUBLIC_PAGE's red EVER arm rests on. `predicates.test.ts` is byte-identical.
- **A mention that does not exist throws** (§2).
- **`NOT_DIFF_DERIVED` is COINED.** Document A6 `:1533` gives check 17's no-subject arm a sentence and
  no word. The other EXAMINED_NONE words are borrowed: `NOT_PROMOTED` and `DOCUMENT_CLASS_NOT_BUILT`
  from `verified`, `AWAITING_DERIVATION` from `Current`, `MALFORMED_RECORD_KEY` from `verified`'s third
  arm. Zero hits under `docs/` before this record.
- **The "no version matches" fixture uses an EMPTY version set**, not a superseded one — with a stale
  version present, the pre-rebase check 17 read it and its failure did not carry AWAITING_DERIVATION.
  The stale-but-present case was written after 7.3's rebase, where the sketch's order already put it.
- **`examined` carries EVERY subject**, including those that reported EXAMINED_NONE. The ground is the
  sketch's §3c: `outOfScope` is a named list *"because §2b's `examined` needs the names"*.
- **No `sentence` field on a check row.** A6's per-check sentences are FAILURE sentences, carried in
  `failures[].detail`. A PASS sentence has no consumer before thesis step 23's surface.
- **A report, not a boolean; a sixth check with no A3 clause behind it; a three-valued verdict** —
  forced by A6 `:1201–:1202`, `:1214`, `:1222` and document A6 `:1533` respectively. A one-line A4/A6
  amendment is owed when the appendix is next touched.
- **`EVIDENCE_PINNED_CURRENT` examines mentions only.** A6 `:1211`'s *"and every gap resolution"* is
  answered through the mention the gap names (evidence A2), and `ThesisGapResolution` carries no pin.
- **Exit 1 is widened** from *"the gate did not hold"* to *"did not hold, or could not be run"* — a
  non-evaluable version exits 1 under its own heading, `NOT ANSWERABLE`, never among the failures.
  Unreachable in this tree; document step 28 is when it can be ruled on a real subject.
- **`publishableEvidence` folds EVIDENCE mentions today** and EVIDENCE-or-DOCUMENT from document step
  28, when document A6 amends `CITES_EVIDENCE`. Named in its docblock so that step finds the line.

## 6. FOUND, REPORTED NOT ASKED

- **Check 6 and the review list are one question asked from two sides.** A pin may only equal
  `affirmed` (evidence §9, thesis A2's invariant, target §9.8), so for a PROMOTED record
  `EVIDENCE_PINNED_CURRENT fails ⟺ NEEDS_REVIEW(e) holds`. The author is told the citation is stale; the
  reviewer is told the record is owed a decision. Whoever builds thesis T6's `list_thesis_reviews`
  should call the two predicates rather than derive it a third way.
- **Evidence §5 `:447–:455` spells VERIFIED and PUBLISHABLE a second time, and neither matches A3** —
  receipts where §8 reads chain state; SUBSTANCE cleared where A3 asks ARGUED. §8 and A3 supersede it,
  and the code follows A3. A one-line §5 amendment is owed.
- **A6 `:1212`'s fourth ARGUED clause** — *"the version cited equals what the argument was made
  against"* — **has no enforcer until thesis step 20.** A debate stores no content-version hash, so the
  gate cannot check it without re-deriving it. The write maintains it: T2 copies `debateSessionId`
  forward only while the pin is unchanged, and `promote_from_debate` refuses STALE_PIN.
- **Thesis plan §5 tagged check 17's test "REWRITE at evidence 11b", and step 15 rewrote it a second
  time.** The dated line lands with this record.
- **`docs/integrity/ledger.json` has 6 dead `dependsOn` paths of 28, across 14 entries**, measured
  today: `src/services/admitUrl.ts` (url-admission), `confirmAnchors.ts` (confirm-anchors),
  `auditDiffSurvival.ts` and `computeDiffSurvival.ts` (audit-survival), `forensicEvidence.ts`
  (evidence-recomputable) and `thesisPublication.ts` (thesis-cites-verified, whose `command` and
  `lastRun` are both null). The board computes staleness by diffing `dependsOn` against the last run's
  commit, and a path that cannot change keeps its entry CURRENT forever. **Nothing validates
  `dependsOn`.** The natural owner is thesis step 24, which edits that entry anyway.

## 7. RECORDED, NOT APPLIED — AND STILL THE RESEARCHER'S

**Carried, not applied:** `publishableEvidence` hard-codes the version fold's reason rather than
reading the mentions' own. The `CONJUNCT_ORDER` guard catches a MISSING verdict, not a double-set one.
The instrument prints conjunct ids (`RECORD_PROMOTED`) where the gate shows check ids
(`EVIDENCE_NOT_WITHDRAWN`) — two vocabularies for one fact. The predicates module and check 17 import
each other, a cycle benign only because both uses are call-time. `chunksOf`'s throw is not extended to
check 17's chunk reader. The global one-symbol scan cannot see `const <name> =` (the gate's own rule
holds both spellings). `test/operationalScriptsGuarded.test.ts:107–:108` says every later instrument
*"lands under this rule"* — the rule that an empty subject set REFUSES — and neither `audit-evidence`
nor `audit-theses` does, correctly, by evidence A6 `:1202` and thesis A7 `:1656–:1657`; the file is
KEEP. The five stale KEEP tags of step 14's record are still in the tag tables. `predicates.test.ts`'s
case titles label VERIFIED *"built at evidence step 15"*, though it was built at 12.

**Three questions are the researcher's, and none is answered by a document:**

1. **A CURRENT version with ZERO chunks makes check 17 PASS.** Round 4's probe returned
   `{ verdict: PASS, state: SURVIVES, chunksChecked: 0 }`: an empty `parsed` falls through to SURVIVES.
   The state is reachable for new state. Interaction A4's Gate 5 amendment of 2026-09-08 writes a
   content version for a diff a supersession re-derives to nothing; the record enters review; and
   `review_evidence` does not refuse REAFFIRM on an empty version. Evidence §4 `:394–:395` calls an empty
   diff "evidence of nothing" and document A6 `:1533` says "a check with no subject, never a pass" — but the
   appendices do not rule check 17's fold (§1). So the choice between PASS, EXAMINED_NONE and FAIL is
   open, and every remedy moves the fold.
2. **The §2b wrapper.** The six check rows cannot carry `evaluable: false`. Whether the gate's return
   gains a wrapper, or thesis step 23's consumer asks `publishableEvidence` beside it, changes a shape
   the sketch fixed.
3. **Who reads the ~850k handoff threshold.** The harness shows a seat a token BUDGET, not a context
   figure, so no seat can read the number its own handoff rule is keyed on.

## 8. WHAT THIS STEP DOES NOT CLAIM

That a gate has graded a thesis. **No act in this tree creates a `Thesis`, a `ThesisVersion` or a
`ThesisMention`**, and nothing can move `Thesis.publishedVersionId`, so the gate has no subject on
staging. `audit-theses` there would print two zero counts and exit 0, and it has not been run: that
answer says nothing about the gate. The step's proof is its fixtures. Its staging exercise is OWED to
thesis steps 20–24 and never faked, beside step 14's (a promoted record put into review, both decisions
exercised) and step 12's (a live look at the four PUBLIC reads, placed at thesis step 21). Thesis step
24's own exercise is *"`audit-theses` exits 2 before the new version and 0 after"*.

**The suite at landing, re-run on `0aaed3c`:** `tsc` 0 · `npm test` **99 suites / 1,462** ·
`test:walk` **20 / 424**, with `git diff b0e60a4 -- src/walk` 0 lines · `test:evidence` **197: 196
green, 1 red BY NAME** — `PUBLIC_PAGE — the EVER PUBLISHED arm, owed to thesis step 24 › a page cited
by a WITHDRAWN published version stays PUBLIC — opened pages stay open`. The
`PUBLISHABLE … is one importable symbol` case went green with this step, and the sketch's §0f is why
that alone proves nothing: a stub satisfies a `typeof`. eslint's pre-existing errors are unchanged —
`src/mcp/mcpServer.ts` 5, `src/mcp/mcpRoutes.ts` 5, `src/routes/forensicsRoutes.ts` 2. CI's own run
reported the same suite numbers and the same red, by name.
