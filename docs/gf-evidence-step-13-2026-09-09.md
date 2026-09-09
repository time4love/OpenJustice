# Evidence step 13 — the debate on a citation, 2026-09-09

**A dated record, never edited.** What was ruled before a line was written, what was built, what
the instruments and the reviewer's own decoys proved, and the two things the day exposed that
outlive the step. Every number below was produced on the day; none is carried forward.

The step is `docs/gf-refactor-plan.md` §3b, step 13, built to `docs/gf-evidence-flows.md` §4 and
A4 as amended by `docs/gf-thesis-flows.md` T3 (the passage, `STALE_PIN`) and §9 (one author),
and by `docs/gf-document-flows.md` §6 (a document record is not this tree's — no `recordCommitment`
column until document step 28). Landed as PR #404 → `staging` `07c3ad7`; the drift fix it
depended on as PR #403 → `3770567`, the same day. The MCP surface went 17 → 21.

---

## 1. RULED BEFORE THE SKETCH, FROM THE TREE AND THE DESIGNS READ WHOLE

Three things the tree at `359c313` could not serve as the appendix reads, each put to the
researcher before the developer sketched:

| found | where | ruling |
|---|---|---|
| `DiffDebateSession.evidenceId` was `@unique`, created by `20260822120000_diff_debate_session` under the legacy one-debate-per-diff model and carried through 11b unchanged. Evidence A2 calls the column "the row this argument created OR JOINED"; thesis T3 has a second thesis joining the row. The index refused exactly that join with a constraint violation. | migration :38; schema; `auditEvidence.ts` read the singular back-relation | step 13 carries a migration — first ruled one statement, then TWO: the unique index dropped and a plain index created, because the column stays the join key the standing audit reads through; the developer's "never a migration" lifted for this one file |
| evidence A4 names no `NOT_AUTHOR` for the debate; thesis §9 says "versions, ARGUMENTS, decisions … are theirs", A3 `AUTHOR(thesis) = createdById`, A7 "a test calls each write tool as a second researcher". The interaction flows, the document flows and the triage say nothing. | thesis flows :1001, :1361, :1420, :1685 | the three writes refuse `NOT_AUTHOR` against `Thesis.createdById`, a null author refusing too; `get_debate` answers any researcher (§9: working state is gated from the public, not from colleagues) |
| the retired assessor's import path (`services/ForensicPromotionAssessorAgent`) is held absent by the retired-names scan, and the surviving prompt had no importer since 11a and was written for the thesis-less debate ("after an automatic classifier did not mark it…") | `retiredNames.test.ts:227`; `src/prompts/forensicPromotionAssessment.ts` | a successor module; the Hebrew prompt rewritten in place and read by the researcher before it landed (the stop rule on visible Hebrew) |

Three more fell at the sketch's two rounds: the rename to A2's `DebateSession` is **deferred to
thesis step 18** (R32 had parked it "until step 13"; `@@map` was refused as two names for one
table); reopening an OPEN debate with a rationale is a **REVISION** — recorded as
`RATIONALE_SUBMITTED`, the event type's own "the opening one or a revision", re-assessed over the
accumulated argument — never a silent drop of what the researcher wrote; and the seven record
checks are **one exported function**, `recordChecks`, that `open_debate` and `promote_from_debate`
both call, because A4's "every refusal of `open_debate` re-checked at this moment" spelled twice is
the copy that drifts.

## 2. THE DRIFT 11b LEFT, FOUND BY THE NEXT STEP'S PRE-CONDITION

Chunk 2 opened, as ruled, with `npm run db:check-drift` before any edit — and it exited 2. 11b's
migration had written `ON DELETE RESTRICT` on four optional relations (deliberately; its dated doc
§2 records the four SET NULL → RESTRICT differences), while `schema.prisma` declared no `onDelete`
on them, so Prisma's default disagreed with the database. 11b ran the check clean BEFORE its own
schema edit and nothing ran it after. The developer stopped rather than build on drift.

The fix was four `onDelete: Restrict` in the schema, no migration, measured on a scratch copy before
it was written: `No difference detected.` It landed as its own PR (#403) before step 13 resumed —
for a measured reason beyond keeping the step's diff to the debate: the offline datamodel diff
from the unfixed schema emitted eight foreign-key statements that would have polluted step 13's
cross-check. With the fix landed first, that cross-check read the two index statements and nothing
else, identical to the hand-written file.

**The control this added, in git:** `test/evidence/invariants.test.ts` gained the schema half of
its migration-half case — for every `_fkey` the 11b migration wrote RESTRICT, the schema's optional
relation on that column declares `onDelete: Restrict` — derived from the migration's own
constraints, observed RED on the unpatched schema (the four named), green after. And `CLAUDE.md`'s
`LAND` keyword gained `db:check-drift` as its post-condition: the check was specified everywhere as
a pre-condition and nowhere as a post-condition, so a step that introduces drift passed its own
gate. The first `LAND` under the new rule was this step's, and the check read clean on the
migrated staging database.

## 3. WHAT WAS BUILT

- **The four tools**, all in `WRITE_TOOLS` — three write and two spend one assessor call per
  round; `get_debate` writes nothing and is gated as working state carrying a model's opinions.
  The retired `*_diff_debate` names stay absent.
- **The citation comes first.** `fileHash = recordId(record)` at open, the record named as A1
  names it (`{ url, capture }` or `{ url, before, after }`, a union of strict objects, never a row
  id); `NOT_CITED` unless the head version's mention names it — proven to refuse, and re-proven by
  the reviewer's stub that defaulted the mention.
- **Refusals in a ruled order:** `NO_RESEARCHER` from memory before any query · `NO_THESIS` ·
  `NOT_AUTHOR` · `REASON_REQUIRED` · then the seven record checks through the step-12 predicates —
  `currentVersionOf` for AWAITING_DERIVATION and NOTHING_TO_PROMOTE, `intervening` for NARROWED
  (naming the captures), CURRENT's per-chunk survival for CONTRADICTED (carrying the chunks), the
  work-list row for NOT_ACQUIRED (naming the outcome). Author before content, because telling a
  researcher who may not write on a thesis that their rationale is blank is grading the work of
  someone about to be refused. One work-list state, one wording: `lookupCapture` and `notACapture`
  are shared with step 12's `get_diff_input`, which keeps its own code for all three negatives.
- **The assessor**, `services/promotionAssessor.ts`, handed the rationale, the record's CURRENT
  computed content (a capture's text or a diff's chunks — side and text, never survival) and THE
  PASSAGE — every top-level paragraph of the head version that carries the token, rendered per node
  through the one TipTap walker imported dynamically, all of them when the record is cited twice,
  a throw when the mention says cited and no node carries the token. Never the classifier's
  opinion; a shape case holds the input's keys disjoint from `Opinion`'s. SUBSTANCE is a hard gate,
  MERIT advisory; the paid draw is taken BETWEEN two transactions; a verdict is stored only beside
  `hasSubstance: true`. The module imports no database client.
- **Promotion is one transaction** under `WRITE_TRANSACTION`: the Evidence row created iff none
  for the name (`status: 'PROMOTED'` stated — the column has no default, and A2 says why;
  `affirmed = CURRENT`), the debate closed by `closeDebate` exported from the module that composed
  `openKey` (one update, the key released), the head mention's `debateSessionId` written — its one
  writer — and the PROMOTED event. A WITHDRAWN row is joined and the return says WITHDRAWN. No chain
  write: the module imports neither `Web3Service` nor the anchoring path.
- **`argued(m)`**, sync and pure over the loaded rows, three clauses; its red acceptance case green.
- **The race:** two concurrent opens meet P2002 on `openKey`; the loser reads `meta.target`, re-reads
  by key, and continues as a revision. Any other P2002 propagates.

## 4. WHAT THE INSTRUMENTS AND THE DECOYS PROVED

**Four scans added to `test/evidence/scans.test.ts`, each with a decoy:** the debate's two tables
have exactly three writers; every `$transaction` in the debate services and the walk's tools
carries the window (scoped BY NAME — `dbSimulation.ts` rolls back by design, `claimTrajectory.ts` is
Level 6's, `recordDiff.ts` already carries it); the five debate-only refusal codes are produced as
`refusal('<CODE>'` in one module; no debate module imports the chain. The one-symbol scan gained
`argued`.

**The window scan caught a real omission on its first run**: `respondInDebate.ts` had used the
batch form `$transaction([...])`, which takes no window. Converted; the case is not a decoy.

**The reviewer's own decoys, from a script file, each restored byte-identical:** `openKey: null`
planted in `promoteFromDebate.ts`; `refusal('NARROWED'` planted outside `openDebate.ts`; a bare
`$transaction`; a `Web3Service` import in `debateState.ts`; a fourth writer of `diffDebateEvent`; a
second `function argued(` in `corpusReads.ts`; a `thesisMention.update` in `openDebate.ts` — all
seven scans fired by case name.

**Red-first, by stub:** the close forgetting `openKey` (1 red); the mention not linked (2 red);
`NOT_CITED` disabled in a compiling form (1 red); `chunksOf` reverted to a silent filter (2 red);
`respond_in_debate` reading the session before checking identity (1 red); and — the finding of
round 1 — `argued` with its thesis clause removed passed **1,216 unit cases and the acceptance
suite's `typeof` case** with nothing red. Six behaviour cases were added; the same stub then turns
three of them red.

**The suite after:** `tsc` 0 · `npm test` 96 suites / 1,359 · `test:walk` 20 / 424, `src/walk`
untouched · `test:evidence` 111: 109 green, 2 red BY NAME (PUBLISHABLE, step 15; PUBLIC_PAGE's EVER
arm, thesis step 24) · eslint clean on every touched file, `mcpRoutes.ts` and `mcpServer.ts` at
staging's own 5 / 5 · CI: lint debt unchanged at 92, nothing baselined.

## 5. TWO VERIFICATION LOOPS THAT REPORTED CLEAN OVER NOTHING

Both sweeps of KEEP files in this loop were, at first, vacuous — and each was found by
contradiction, not by design.

- **The developer's:** zsh does not word-split an unquoted variable, so `for f in $KEEP` bound the
  whole list to one `$f` and the loop ran over zero subjects while printing "all byte-identical".
  Found because the diff stat contradicted it.
- **The reviewer's:** `git diff staging -- <absent path>` is 0 lines, so two names that left the
  tree at 11a (`extraction/recordCapture.test.ts`, `diffPromotionGate.test.ts`) were counted as
  clean. Found on the re-run that asserted a subject count.

Both now run from a file with `while read`, assert the subject count and each subject's existence,
and carry a positive control — a path known to differ. The rule outlives the step: a loop that
skips every subject prints the same words as one that checked them all, and the words are not the
evidence. Recorded in memory beside the earlier shell traps.

**A third of the same family, and it is a recurrence.** The developer's own suite reproduced the
cross-describe mock leak `docs/gf-legacy-switch-2026-09-08.md` §5 records this repository paying
for once already: `jest.clearAllMocks()` clears CALLS, not IMPLEMENTATIONS, so a
`mockImplementation` set inside the P2002-race case stood for every case after it and let five
promotion cases pass that should have failed. Fixed by naming the defaults and re-establishing them
in the shared setup, with the reason in a comment. Three verification instruments in one day that
said "green" about nothing is the day's lesson, not two.

## 6. DECLARED DEVIATIONS, ACCEPTED

- `respond_in_debate` re-runs the seven record checks and refuses with the record's own code before
  recording a response. A4 names two refusals for it; the assessor is handed CURRENT content, so a
  record that is AWAITING_DERIVATION or CONTRADICTED has nothing to hand it. Accepted 2026-09-09; a
  one-line A4 amendment when the appendix is next touched.
- The refusal order above, amended into the sketch from the code with its reason, rather than the
  code following the sketch's first draft.

## 7. WHAT THIS STEP DOES NOT CLAIM

That a researcher can argue for a record on staging. **No act in this tree creates a thesis, a
version or a mention** — the thesis writers are retired until thesis steps 19–20 — and staging's
rebuilt database holds none, so every `open_debate` against it refuses `NO_THESIS`. The 49 fixture
cases in `test/debate.test.ts` and the six `argued` cases are the step's proof; the plan's
instrument 3, a researcher driving the path through the connector, arrives at thesis step 21,
which is the seam §9.4 already names. The debate assessor has no mechanical audit — T3 gives it
none, and the ONE verdict rule's symbol is thesis step 19's — so its words are recorded verbatim and
checked by nothing but the prompt's own instruction against asserting what is not in the content;
whether it is audited once the symbol exists is the researcher's. Carried, not chased: check 17
selects the NEWEST content version rather than CURRENT(diff) (`evidenceInputSoundness.ts:206`),
step 15's; `check_on_chain_status` resolves a capture its own way rather than through the shared
lookup, step 12's file; and one half-state the design accepts and this record names because it is
the consequential one — a `RESPONSE_SUBMITTED` is written before the paid call, so an assessor call
that fails after it leaves a response that satisfies `OBJECTION_UNANSWERED` with no re-assessment,
and a promotion can go through over an objection the assessor never re-read. The sketch chose the
half-state over a model call inside a transaction; a later step may choose to require an
`ASSESSMENT_RETURNED` after the last response instead.
