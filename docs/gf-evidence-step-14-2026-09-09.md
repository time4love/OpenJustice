# Evidence step 14 — the review, 2026-09-09

**A dated record, never edited.** What was ruled before a line was written, what was built, what the
reviewer's own substitutions proved, and the four instruments that said "green" about nothing on one
day. Every number below was produced on the day; none is carried forward.

The step is `docs/gf-refactor-plan.md` §3b, step 14, built to `docs/gf-evidence-flows.md` §6 (Flow
E3), §7, §9 and A4, composed with `docs/gf-interaction-flows.md` A2 and A4's segment rule,
`docs/gf-thesis-flows.md` T6 (FLAGGED) and §9 (a review writes no thesis row), and
`docs/gf-document-flows.md` §3 and §8 (a document's review is not this tree's). Landed as PR #407,
commit `521e4da` (16 files, +3,899 / −189) → `staging` `b0e60a4`; deploy SUCCESS; CI lint debt
unchanged at 92; `db:check-drift` `No difference detected.` The MCP surface went **21 → 23**.

---

## 1. RULED BEFORE THE SKETCH, AND ONE RULING THE REVIEWER MADE INSIDE THE LOOP

Six rulings bound the step before the sketch (`memory/gf-step-14-rulings-2026-09-09.md`) — four the
researcher's, and two (no `NOT_AUTHOR`; the writer scan by table and verb) confirmed by the closing
R34 seat from items REPORTED rather than asked, which is where that file's own body places them.
The entry carries `decisionSequence` and both commands embed `expectedSequence=<n>`, so a command
pastes as written;
**no `NOT_AUTHOR`** on `review_evidence`, because re-pinning is "the thesis flows' act, done by the
thesis's author, who may not be the reviewer" (§6 :537–538) and a review writes no thesis row; the
evidence-tables writer scan splits by **table and verb**; the containment rule lives in
`evidencePredicates.ts` and enters the one-symbol scan, with `contains` module-private; four A4 shape
additions accepted as declared deviations; and step 12's live look at the four reads placed at thesis
step 21.

**One correction the reviewer found in the contract itself, before any code.** The sketch's §3c told
the developer to catch the STALE_SEQUENCE race "the `pageLog.ts:122` way, reading `meta.target`".
`src/walk/pageLog.ts` reads no `meta` at all — it converts *any* P2002 on its insert, which is sound
there because the only index that insert can collide on is the one it is writing. The only
`meta.target` reader in the tree is `services/openDebate.ts`'s `isOpenKeyCollision`, landed at step 13
for exactly the reason the sketch states. The requirement never changed; the precedent named was
wrong, and copying it would have built the defect the step forbids — another constraint's violation
swallowed into "the log moved". The sketch carries a dated correction.

**Ruled by the reviewer, on the sketch's own words:** a DIFF's units carry `survival`. §2a's table
types the unit as `{ side, text, survival }`, "the stored chunks, as written"; the "no survival"
clause beside it explains a CAPTURE's units, whose text has no verdict. The first implementation
applied the capture clause to diffs and dropped the field — which is the material a WITHDRAW rests on,
since a chunk that has become CONTRADICTED is exactly what makes a reviewer withdraw.

## 2. WHAT WAS BUILT

- **`list_evidence_reviews({})`** — a GATED read returning `{ owed, reviews, notEvaluable }`, the
  count first because an instrument over an empty subject set is honest only when the count precedes
  the verdict. One entry per NEEDS_REVIEW record, oldest first by `owedSince` — a key the reader can
  see, because an order nobody can check is not an order. Each entry: the affirmed version beside the
  current one; `moved` by containment; `cause` as the **union** of every route that moved it, the
  version label first and then the endpoints in pair order; `citedBy` with **one row per mention**, so
  a thesis whose head and published versions both cite the record yields two rows; the narrowing
  material where the pair is no longer the corpus's finest record; and two commands that paste as
  written.
- **`review_evidence(…)`** — ONE transaction under `WRITE_TRANSACTION`: the last sequence read and
  compared, an append-only `EvidenceDecision` at `last + 1` guarded per type by a `Record` over the
  enum, and one update — REAFFIRM moves `affirmed` and leaves `status`, WITHDRAW moves `status` and
  leaves `affirmed`. Nothing else: no citation re-pinned, no version, no debate, no chain. Seven
  refusals in the ruled order, identity from memory before any query.
- **The containment rule** in `evidencePredicates.ts`: `movedBetween` and `whereChunksWent` exported,
  `contains` module-private and normalised through the platform's existing `normaliseForPresence`.
  Containment rather than equality because the re-walk of 2026-09-07 found two positional rules
  mutilating one sentence: under equality the same text reads as one unit leaving and one arriving,
  and the researcher is asked to judge a change that did not happen.
- **Two moves, proven by the OLD cases.** `chunksOf` moved from `openDebate.ts` to `corpusReads.ts`
  beside `opinionOf`; the Prisma double was **extracted** from `test/debate.test.ts` to
  `test/helpers/evidenceDouble.ts`, never copied, because two doubles are free to disagree about what
  the database does. `debate.test.ts`'s **49 cases are untouched** and their staying green is the
  proof of both.
- **The scans**, split by table and verb, repairing a gap accepted at 11b and again at 13: the
  per-file allow-list let the review path write `ThesisMention` — a silent re-pin — and would have
  passed it. The map is now total over every write verb of every evidence table, and a case holds that
  it is, because a verb no row names is a verb nothing scans.

## 3. FOUR INSTRUMENTS THAT SAID "GREEN" ABOUT NOTHING, IN ONE LOOP

Each was found by a substitution the reviewer planted and restored, never by reading:

| the instrument | what it actually held |
|---|---|
| "its chunks are SEGMENTS" | replacing `claimSurvival.segments` with `text.split('\n').map(trim)` passed **43/43** — the fixture had no line without a letter or digit and no internal whitespace run, so the case could not tell the one spelling from a naive splitter |
| "decisionSequence is the LATEST" | deleting `orderBy: { sequence: 'desc' }` passed — the *double* computed the maximum and ignored the argument, so the case proved the double sorted |
| §2h's "one load per page per pass" | neutering the memoisation passed — the clause had no case at all |
| §3b's **ONE TRANSACTION** | moving `tx.evidence.update` to `prisma.evidence.update` passed **34/34** — the double handed the callback the *same* client, so nothing could tell a write inside the transaction from one beside it |

The last is the step's central clause. The repair generalises: **a double must hand a DISTINCT
transaction client, and every "one transaction" case must assert EQUALITY between what went through
it and what was written** — a form that also polices the wrapper's own delegate list, proved by
removing a delegate from it and watching both cases redden.

**A fifth, in the reviewer's own hands, twice.** A decoy the compiler refuses proves nothing and does
not say so: one attempt at the `meta.target` decoy reported **0 tests of 0**, and one at removing a map
row left an unbalanced object literal — the suite dropped from 121 cases to **88** and reported two
failures, both of them the expected reds, which reads as *fewer* failures rather than as a refusal.
Both were re-planted in a compiling form and both then fired. The rule that catches it is to print the TOTALS before the failures and to measure
firing against the **baseline** — this project's evidence suite is 2 red by name on a clean tree, so
`failed > 0` would call the non-firing control a hit.

## 4. WHAT THE DECOYS PROVED

**Thirty-four substitutions across four rounds**, each restored byte-identical, two of them malformed
and re-planted (§3). These fired, each by case name: the re-pin — `thesisMention.update` inside the
reviewer, the act the finding shape ranks HIGH — and `evidence.upsert` fire the map; removing a map
row fires the coverage case; an allowed entry that writes nothing fires the subject case;
`Web3Service` imported by the review *tool* fires the chain case, so §4c's new names are load-bearing;
`data: { needsReview: true }` fires the source half and a `needsReview` column fires the schema half;
a second `movedBetween` in another module fires the one-symbol scan. On the writer: reducing
`isSequenceCollision` to the code alone reddens exactly the two cases written for it; a WITHDRAW that
also moved `affirmed`, an uncalled guard, and `REASON_REQUIRED` placed behind the query each redden
their own case. **No HIGH finding was raised in any round; the severity is the class the decoy plants.**

**Two substitutions stayed green, and both correctly.** A planted **read** of an evidence table is the
non-firing control and must not fire. And replacing the inserted `at + 1` with `expectedSequence + 1`
changes nothing, because step 1 refuses unless the two are equal: the no-gap property belongs to the
compare-and-set, and `at + 1` is a second belt. Recorded so nobody re-opens it.

## 5. DECLARED DEVIATIONS, ACCEPTED

- **The four A4 shape additions** the researcher ruled: the `{ owed, reviews, notEvaluable }` return;
  `owedSince` on the entry; `versionId` on `citedBy` with one row per mention; `cause` as a list.
- **`decisionSequence` on the entry and `expectedSequence=<n>` inside both commands** — A4 requires
  the parameter and no read supplied it, so a first review could not be issued as written.
- **Two rows beyond the sketch's seven in the writer map** — `evidence.createMany → NOWHERE` and
  `thesisMention.upsert → NOWHERE` — proposed by the developer and accepted on the coverage property:
  without a row naming a verb, that verb is scanned by nothing, which the coverage case makes visible.
- **`requireFields` exported for its own case.** Its REAFFIRM arm is reachable through the public
  path; its WITHDRAW arm is not, because `REASON_REQUIRED` refuses first — and an arm no case can
  reach is an arm nobody notices losing.
- **The four refusal codes landed with the service rather than with the tools**, because the service
  cannot compile without them.
- A one-line A4 amendment is owed for the first two, when the appendix is next touched.

## 6. RECORDED, NOT APPLIED

- **Five stale KEEP tags in the tag tables**, four of one kind and one of another. As-built §8 and
  document plan §5 name `mcpIntegration`, `mcpTools` and `diffPromotionGate`, which left at 11a, and
  `previewDiffClassification`, which left with `preview_diff_classification` at 11a-thesis. The fifth
  is worse: as-built §8's `extraction/recordCapture` row names a file that was **renamed**, not
  deleted — `test/extraction/recordCapture.test.ts` → `test/extraction/storeCapture.test.ts` in one
  commit (`6096c46`) at corpus step 5 — so a sweep reading the table literally reports MISSING and
  silently skips a subject that exists under another name.
- **`src/routes/forensicsRoutes.ts` carries 2 eslint errors, not 4.** A report of the day claimed 4;
  the file is byte-identical to `staging` and returns 2 both on the tree and through
  `git show staging:… | eslint --stdin`. The claim did not reproduce and the number here is the
  measured one.
- In STALE_SEQUENCE's race half the refusal reports the sequence as unknown until a re-read, because
  the value read before the race is not the record's; the compare-and-set half still names the number
  it read.
- `affirmedContentVersionHash` and CURRENT are computed outside the transaction. A concurrent *review*
  is caught by the compare-and-set, since every review writes a decision; a concurrent
  *re-derivation* is not, and the record simply re-enters the list — visible and self-correcting, and
  stated in the code rather than left implicit.
- The `data:` source half reads object **literals**, so a `data: entry` naming a variable — which this
  step's own writer uses — carries its fields where that scan does not look. Prisma's generated types
  are the second net and the schema half is the third; the comment names all three so the half is not
  read as complete on its own.
- Carried from earlier steps and untouched here: check 17 reads the newest content version rather than
  CURRENT(diff) (step 15's); `predicates.test.ts`'s case comments still label two predicates with the
  steps they were once expected at; `check_on_chain_status` resolves a capture its own way.

## 7. WHAT THIS STEP DOES NOT CLAIM

That a researcher has reviewed a record on staging. **No act in this tree creates a `Thesis`, a
`ThesisVersion` or a `ThesisMention`** — the thesis writers are retired until thesis steps 19–20 — so
nothing can be PROMOTED, no `Evidence` row exists on staging, and `list_evidence_reviews` there
answers `owed: 0`, which is a TRUE answer and not a broken one. The plan's *"a re-walk on staging
putting one promoted record into review and both decisions exercised"* is OWED to thesis step 20,
recorded and never faked; step 12's live look at the four PUBLIC reads remains owed at thesis step 21.
The step's proof is its fixtures: 53 cases for the list, 39 for the writer, and the 49 of
`test/debate.test.ts` that did not change.

**The suite at landing:** `tsc` 0 · `npm test` 98 suites / 1,451 · `test:walk` 20 / 424 with
`git diff f7989d8 -- src/walk` empty at the pre-merge base · `test:evidence` 121: 119 green and 2 red BY NAME (PUBLISHABLE,
step 15; PUBLIC_PAGE's EVER arm, thesis step 24) — 111 → 121, ten cases added, none removed. CI's own
run reported the same three numbers and the same two names.
