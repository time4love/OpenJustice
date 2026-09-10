# Thesis step 17 — the acceptance suite, failing, 2026-09-10

**A dated record, never edited.** What was ruled before and during the suite, what the documents
decided that was carried as if ruled, the one ruling whose GROUND was wrong, what the review rounds
found — including the defects they did NOT find, which a post-merge cold read and a later cold
conformance review did — what the reviewer's own stubs proved, the declared deviations and the appendix
amendments now owed, what a builder of steps 18–24 needs from the suite, and what is still the
researcher's. Written by the REVIEW seat with the seat crossed, on the researcher's word, and read cold by
the DEV seat before it landed. **Every number below was measured on 2026-09-10, by command, on the tree
at `3903de1`**, except where a line says which round's tree a reproduction ran against — those are the
round's own observations, recorded as observed.

The step is `docs/gf-thesis-refactor-plan.md` §3, step 17 — *"A jest project `thesis`, like `walk` …
Every file red. Informational in CI until step 25."* — built to `docs/gf-thesis-flows.md` (T1–T6, §9,
§12 and the appendix A1–A7), composed with `docs/gf-evidence-flows.md` A1–A7,
`docs/gf-interaction-flows.md` A1–A8 and `docs/gf-document-flows.md` A6. `docs/gf-refactor-plan.md`
§9.6 names it the pilot. Its contract was the sketch `handoffs/R40-chunk-1-sketch.md` (outside this
repository; 832 lines, three rounds, closed with no HIGH or MEDIUM; its round-3 note governs its
sections), graded in `handoffs/R40-review-state.md`, `handoffs/R41-review-state.md` and, for the
follow-up, `handoffs/R42-review-state.md`. Plan lines below are those of the tree this record lands
with, which gains a three-line pointer at step 17.

**Landed twice.** PR #413 — four commits (`9d305b8` 7.1–7.3 · `8f42814` 7.4 · `3c5e4f8` 7.5a · `f2345b0`
7.5b; 24 files, +6,151 / −22) → `staging` `fecaa31`, merged 14:52:47 UTC. CI run `34491034321`: conclusion
`success`, both jobs `success`, **"Lint debt unchanged: 92 problems across 15 rules."** Deploy SUCCESS — a
real build, `package.json` having gained `test:thesis`. `db:check-drift`: **"No difference detected."**
(the first run hit Prisma P1001, the network, and was re-run). Then the FOLLOW-UP, PR #416 — `a291f15`,
11 files, +339 / −38 → `staging` `3903de1`, merged 18:31:31 UTC. CI run `34514426759`: `success`, both jobs;
lint debt 92; the suite **1,471** — 1,462 and the nine cases of `test/noEnvFileLoaded.test.ts`, which PR #415
(the unit suite reading no `.env`) landed between the two. Deploy SUCCESS; drift **"No difference
detected."** Neither PR touches `src/` or `prisma/`: no migration, and the MCP surface is **23** before and
after. Production is untouched at `9661206`.

---

## 1. THE RULINGS, WHAT THE DOCUMENTS DECIDED, AND THE ONE WHOSE GROUND WAS WRONG

**Q1 — THE RESEARCHER'S: `STALE_PIN` is the RACE refusal.** Thesis T2 `:429–:436` says a version write
RE-PINS a citation to `affirmed`; thesis A2 `:1290–:1291`, thesis A7 `:1649–:1650` and plan step 20 (`:123`,
`:128–:129`, *"`affirmed` moved between two writes, the second refused"*) say the second of two writes
REFUSES `STALE_PIN`. The flows-win rule could not settle it, because a plan STEP sided with the appendix.
Ruled: the write reads `affirmed`, computes the pin and writes in ONE transaction; a REAFFIRM committing
between that read and the commit refuses `STALE_PIN`; the NEXT write re-pins and reports that the argument
did not carry. It is the one reading under which every one of those sentences holds. `pin-equals-affirmed`
is written to it.

**The REVIEW seat's rulings, each overturnable by the researcher:**

- **`NO_THESIS`** for a `thesisId` naming none (borrowed from evidence A4 `:1126`), ordered `NO_RESEARCHER`
  · `NO_THESIS` · `NOT_AUTHOR`, extending step 13's ruling 5 to this layer — two refusals that differ tell an
  anonymous caller which rows exist.
- **`NO_FRAMING` is COINED** for a `framingId` naming none — on the three framing tools, on `add_note`, and
  (in the follow-up) on `create_thesis`. No design, the triage or any plan names it; `NOT_YOURS` would call
  a framing that does not exist someone else's.
- **`get_thesis_context`'s `since` is COINED** (ISO-8601): A4 `:1479` returns HISTORY "optionally since a
  date" and its input line names no parameter for it.
- **The assessment's `allegationsFramed` is COINED** for check 17 (T5 `:758`, A6 `:1601`).
- **`list_thesis_reviews` answers `{ owed, reviews }`** — a DECLARED DEVIATION from A4 `:1524`, whose only
  ground is step 14's ruling 5. Evidence A4 `:1146–:1151` itself returns a LIST (*"an empty list is an
  answer"*): the envelope's precedent is built code, `services/evidenceReviews.ts`, the same class as the
  ruling below. Whether to keep it is the researcher's (§9).
- **NORMALISE's scan exempts two diff-layer comparisons by name.** A7 `:1644–:1647` counts the copies of
  `replace(/\s+/g, ' ')` *"in a verbatim or identity path"* — *"today there are three"*. `chunkRewriteLoss`
  and `diffCoverage` — the re-diff guard and the classifier's coverage, both `/gu` — are neither, and
  exempting them by name, making the allow-list five, is COINED.
- **The gate's list of evidence names is `evidencePredicates`' exports**, never a copy.
- **The shared double's rollback**: `written` stays the attempt log; `rolledBack` names what a rejected
  transaction took back and the store is restored; "nothing was written" is read as `committed()`.

**FOUND — decided by a clause, carried in the rounds as if ruled.** Three things the suite holds were
graded as REVIEW's rulings and are not: each is a clause's, reported rather than asked.

- **`check_publication_readiness` answers the gate's own rows** — T5 `:731`, *"Readiness is a list of checks,
  each a predicate with one implementation or a labelled opinion, each naming what it examined"*, and A6
  `:1586`, *"each calling the predicate and never re-deriving it"*. Held by deep equality with
  `thesisChecks(head, null)`.
- **`get_whistleblower_call` refuses nothing** — A4 `:1503`: *"`{ live: false }` when nothing is published"*,
  and a PUBLIC read answers identically for everyone (A4 `:1420–:1421`), so an id naming no thesis answers as
  a draft does.
- **`decide_gap`'s `NAMES_PERSON` is OWED to step 23** — A4 `:1494`, *"checked by the same rule as T5"*, whose
  rule plan step 23 builds (`:151`, `NAMES_NO_PERSON`). **Its premise is now a question** (§9, question 1).

**THE ONE WHOSE GROUND WAS WRONG — "names the diff".** A4 `:1422–:1423` says an `AWAITING_DERIVATION`
refusal "names the diff". In the follow-up's first round the REVIEW seat ruled that EITHER spelling names it:
the record's computed name, or the pair's two capture timestamps. It grounded the second in the two
evidence tools already built, which name a diff by `pairName` — `"<before> → <after>"`,
`src/services/corpusReads.ts:371–:373`. **That is built code, and the house rule forbids it as a ground:
a ruling rests on an appendix clause or a plan step.** Evidence A1 `:890–:891` names a DIFF
`{ url, before, after }`, and evidence A4 `:1069` says a record is named *"by page and timestamps"*. The
timestamps spelling must carry the page. A cold conformance review found it after the loop had ended; the
fourth round applied it (`test/thesis/tools.ts` `NAMES_THE_DIFF`, whose comment records the overturn).

**Why the rules of that same day did not stop it.** Two rules were written on 2026-09-10: the rulings
audit's — a ruling is grounded in an appendix or a plan step, never a narrative document
(`docs/gf-two-session-protocol.md` `:80`) — and step 15's record's line that a dated findings doc
CORROBORATES and never DECIDES (protocol `:106–:107`). The protocol's DECIDE list is closed — appendices,
plan steps, `CLAUDE.md` (`:94`) — so built code is already excluded, but nothing NAMES it, and it reads like
evidence: two tools agreeing looks like a convention. The `{ owed, reviews }` envelope above rests on the same
kind of ground. The lesson is to state a ruling's ground by document and line before ruling; whether the
protocol should name built code under DESCRIBE is the researcher's (§9). Whether `pairName` itself should
carry the URL is the evidence layer's, and not this step's.

## 2. WHAT WAS BUILT

**A jest project `thesis`**, informational in CI — its own job, `acceptance-suite`, with
`continue-on-error: true` (`.github/workflows/tests.yml:66`) — and excluded from `unit`: `tests.yml` +36,
`jest.config.ts` +17, `npm run test:thesis`. **19 files under `test/thesis/`, 5,944 lines at `3903de1`:**

- **`absent.ts`** (97) — the ONE way a case reaches a module step 17 does not build. A computed specifier,
  because a literal `import()` of a missing module is a file-level TS2307 that sinks the whole file and
  counts nothing. A `MODULE_NOT_FOUND` for exactly that specifier becomes *"X is not built — thesis step N
  builds it"*; every other error propagates; a module missing an export fails on the export's NAME and its
  KIND (a function exported as a table, or the reverse, is refused).
- **`contract.ts`** (774) — A2's rows as the target shapes them; the module → export → owner-step map;
  every tool's CLOSED refusal set in the ruled order, with the codes OWED to a later step; A6's seventeen
  check ids and kinds; A7's eight suite names and the ninth excluded.
- **`tools.ts`** (442) — the refusal harness. Every refusal case asserts four things: the handler RESOLVES,
  its JSON is exactly `{ error, code }`, nothing was COMMITTED, and the model factory's TRIPWIRE stayed
  silent. The order is held as a property (an anonymous call calls no delegate at all); each tool's
  produced codes plus its owed ones equal `contract.ts`'s set; where the contract says what a refusal names,
  the error is held by value.
- **`fixtures.ts`** (330), **`rows.ts`** (38), **`gateWorld.ts`** (403), **`scanning.ts`** (55) — one
  spelling of each world, with every hash a vector derived OUTSIDE the implementation at a shell.
- **Twelve test files**: `loader`, `derivations`, `framing`, `versionWrite`, `analysis`, `publication`,
  `reads`, `authorship`, `gate`, `scans`, `invariants`, `publicReads`.
- **`test/helpers/evidenceDouble.ts`** gained the thesis tables and honest `where`s ADDITIVELY (+380 / −22);
  its six consumers are unedited and green, **212 / 212**. **`test/walk/retiredNames.test.ts`** (KEEP,
  declared, +74) holds the thesis layer's retired routes and delegates, green.

**Evidence's predicates are CALLED, never re-spelled:** `publishableEvidence`, `evidenceChecks`, `flagged`,
`argued`, `currentVersionOf`, `publicPage`, and the trajectory resolver `resolveTrajectoryCitations`.

**The count, by jest, at `3903de1`: thesis 399 = 35 green / 364 red; all twelve files red.** 342 reds read
*"is not built — thesis step N builds it"*: step 18 ×3 · 19 ×59 · 20 ×105 · 22 ×77 · 23 ×81 · 24 ×17. 22 are
red ON THE PRESENT TREE, each with its owner in its title. Twenty-one are step 18's: eighteen over the schema
(the seventeen retired-names schema cases and `thesis-no-log`), two over source (one-symbol's NORMALISE
spellings at `lib/htmlText.ts` and `services/thesisClaimAudit.ts`, and the retired words under `src/`), and
invariants row 1. One is step 23's: PUBLIC_PAGE's superseded arm. The 35 green hold the loader's arms, the
scans' decoy cases and the contract against itself. Per file: analysis 27 · authorship 31 (1 green) ·
derivations 62 · framing 28 · gate 30 · invariants 36 (5 green) · loader 40 (17 green) · publicReads 6 ·
publication 20 · reads 27 · scans 50 (12 green) · versionWrite 42.

## 3. WHAT THE ROUNDS FOUND

| round | subject | found | disposition |
|---|---|---|---|
| sketch, 3 rounds | the contract, no code | the round-3 note's rulings and L1–L9 | closed, no HIGH or MEDIUM |
| 7.1 ×2 | the loader, the contract, the first derivations | export KINDS; the double's `findMany` honouring its `where`; STALE_PIN last | applied |
| 7.2 ×3 | A3's derivations | **REVIEWS' UNARGUED arm had no control; HISTORY read five of its eight row kinds** — both found by LAX stubs going green | applied; loop ended at the cap |
| 7.3 ×2 | A4's seventeen tools | **the double's work-list lookup answered any `where`**, making a `NOT_A_RECORD` case unreachable through the one lookup; HISTORY-since-a-date held by no case (`since` coined) | applied |
| 7.4 | A6, the gate | one LOW | loop ended |
| 7.5a | A7's scans | one LOW (green cases under a describe titled "EXPECTED RED") | loop ended |
| 7.5b | invariants, public reads, the superseded arm | nothing | **step complete; PR #413 landed** |
| post-merge | a cold read by the DEV seat over the full designs | **2 HIGH, 6 MEDIUM** (below) | the follow-up |
| follow-up 1 | H1, H2, M1–M6, two rulings | **4 MEDIUM** — both readiness cases UNSATISFIABLE on their world; readiness asserting ids only; the words read as values only; M6 binding no value to its field | applied |
| follow-up 2 | the four | **2 MEDIUM** — no negative control for FLAGGED / STALE; open gaps indistinguishable from all gaps | applied |
| follow-up 3 | the two | nothing | loop ended at three |
| cold review | a fresh seat (Fable 5.1), read-only, against the appendices | **3 MEDIUM** — "names the diff" without the page (§1); the version row's `thesisId` and `createdById`; GET /:id's resolved mention and rationale | a fourth round, on the researcher's word |
| follow-up 4 | the three and two LOWs | nothing | **LOOP ENDS; PR #416 landed** |
| this record | the DEV seat's cold read of it | **5 MEDIUM, 16 LOW** — false statements, a ground of the `{ owed, reviews }` class, plan lines this record's own pointer shifts | applied before landing |

**The post-merge findings.** H1 — `add_thesis_version`'s return was asserted as EXACTLY A4 `:1471`'s five
keys, while T2 `:422` returns `thesisId` too and the appendix itself (`:1225`) says the flows win: the
return is the UNION, six keys. H2 — `gapInForce` and `gapList` were owed to step 22, while plan step 20
(`:123–:124`) builds `get_thesis_context` "with HISTORY, UNARGUED and the gap list". M1 — the version row's
own columns unasserted. M2 — nothing held what the write does NOT refuse (T2 `:405–:406`, `:438–:441`).
M3 — readiness' answer. M4 — `GET /api/thesis/:id`'s content. M5 — "names the diff". M6 — `list_theses`'
researcher entry.

## 4. SATISFIABLE IS NOT CONFORMANT

**This is the step's lesson, and it cost two follow-up loops to learn in full.** The six graded sub-chunks
— 7.1, 7.2, 7.3, 7.4, 7.5a, 7.5b — proved every case SATISFIABLE: the reviewer planted a plausible
implementation under `src/` and watched each case go green, then broke it and watched each go red. Every one
of those stubs was written TO THE CASE. The version-write stub returned A4's five keys, so the case
demanding exactly five went green — and it asked for the wrong five. **A positive control proves an
implementation can pass the case; it says nothing about whether the case asks what the design says.**

Conformance was then graded as a question of its own: for every asserted shape, key set, refusal code,
owner step and route, grep the flows, the appendix and the plan for the thing it asserts, and read what each
says. The misses fell into four shapes: a shape read against ONE clause that states it (H1); an owner step
never read against the PLAN's text (H2); an answer asserted only as "writes nothing" (M3, M4, M6); and
clauses never read at all (M1's columns, M2's non-refusals, M5's naming).

**The follow-up's own grading added three more, each a way a satisfiable suite still lies:**

- **Run the positive control through the REAL one-symbols.** A plausible readiness calling the real gate
  THREW on its cases' world — `publishableEvidence` reads `before.trackedUrl.url`
  (`src/services/evidencePredicates.ts:617`) and the world's evidence row carried no page. Both readiness
  cases were unsatisfiable by ANY implementation that composes the gate as A6 says, invisibly, behind the
  loader's red. The fix is `gate.test.ts`'s own precedent: stub the half at `publishableEvidence`.
- **Probe every reporting case with an answer that ignores the data, and every counting case with a world
  whose filtered and unfiltered counts differ.** A readiness reporting every citation FLAGGED went green
  with no negative control; a `list_theses` counting every gap went green because every gap was open.
- **A cold conformance read by a fresh seat, after the loop, is worth its cost.** Three graded rounds had
  closed the follow-up; the fresh seat found three MEDIUMs, one of them a ruling the grading seat had made
  from built code. This record's own cold read found five more, in a document.

## 5. WHAT THE DECOYS PROVED

**Satisfiable, by the reviewer's own stubs, every sub-chunk.** At 7.2 a plausible REVIEWS over the double
turned all eleven REVIEWS cases green (round 3's control); at 7.4 a plausible step-23 pair —
`thesisPredicates.evaluate` composed by `publishableVersion` and mapped by `thesisGate.thesisChecks`, with
rows 5–10 being `evidenceChecks`' own — turned the gate's 30 cases and PUBLISHABLE(v)'s 9 green; at 7.5b
seventeen tool stubs, a plausible public router and a superseded arm turned the public reads and the
invariants green; the follow-up's control turned all fifteen of its target cases green. **Each case then
reddened only on its own break**: an identity checked after a lookup, a missing thesis called NOT_AUTHOR, a
refusal thrown, an extra key, a model called, a write before a refusal, `affirmed` read once instead of
re-read inside the transaction, the version written outside it, rows 5–10 re-shaped, check 17 made hard, an
empty scope read as PASS, the gate writing, a pin key in a schema, a third pin writer, a withdrawn thesis
answered 404, and — in the follow-up — five keys, a seventh key, a wrong author, a dropped `thesisId`, the page
left out of a refusal, the head served where the published version belongs. **The follow-up's last run: 15
targets, eight runs, 120 / 120 as expected.**

**Decoys that proved nothing, and said so.** At 7.2 a variant (Hb) was a no-op — identical to its control —
and passed green, reading as proof until every variant was asserted to DIFFER from its control; two siblings
(H, Hd) built on nested template markers were refused by the compiler; at 7.4 a stub carried a NUL byte. Each
was re-planted before counting. In the follow-up's first decoy run, the four NAMING variants dropped
`pairName` and failed `tsc` under `noUnusedLocals` (TS6133), and were re-planted; and after a case was
RETITLED, the probe that found it by title matched zero cases — it graded nothing until re-pointed. **Assert
every variant differs from its control, and that every probe matched exactly one case.**

**Vectors re-derived with a second tool.** Every hash the suite holds was derived at a shell outside the
implementation. The reviewer re-derived them with a different tool — Perl's `Digest::SHA` over the
committed literal's raw bytes — at 7.2 (the two version texts), 7.3 (the gap ids), 7.4 (the version citing
both kinds) and in the follow-up (its third gap id, `0x3d9b…1307`), each beside a one-character control
that differs.

## 6. DECLARED DEVIATIONS, AND THE AMENDMENTS NOW OWED

**Owed to thesis A4, in one pass when the appendix is next touched:** `NO_FRAMING` on the three framing tools,
`add_note` and `create_thesis`; `create_thesis`'s narrowed refusal set (no `NOT_AUTHOR` or `STALE_HEAD`,
which a call creating the thesis cannot reach; no `NO_THESIS`, since it takes no `thesisId`);
`get_thesis_context`'s `since`; `add_thesis_version`'s return gaining `thesisId` (T2 `:422` — the appendix is
the side that is wrong, by its own `:1225`); and `publish_thesis`'s, likewise (T5 `:787` returns `thesisId`,
A4 `:1512` does not; no case asserts that return until step 23). `list_thesis_reviews`' `{ owed, reviews }` is
owed an amendment only if the researcher keeps it (§9).

**Coined and declared:** `allegationsFramed` on the publication assessment; every module path the suite loads
(no design names one, and each avoids the retired thesis module paths); the tool modules' `<name>Handler` /
`<name>Schema` exports, the `mcp/tools/reviewEvidence.ts` shape.

**Declared in the suite:** the KEEP edit to `test/walk/retiredNames.test.ts`; the shared double's additive
growth; codes OWED past a model — `publish_thesis`'s `NOT_PUBLISHABLE` and `decide_gap`'s `NAMES_PERSON`,
both to step 23 — in each tool's set, never claimed tested; a readiness case over `seedPublishable` stubs the
evidence half at `publishableEvidence`, as the gate's cases do.

## 7. FOR THE BUILDER OF STEPS 18–24

What the suite asks of the steps that turn it green, beyond its cases' titles:

- **Step 18 rebases the suite's rows.** The mention rows are DUAL-KEYED — today's columns (`thesisVersionId`,
  `type`, `refId`) beside A2's target (`versionId`, `kind`, `name`) — because the shared double's
  evidence-layer delegates filter by today's names until the rename (`test/thesis/rows.ts`' header;
  `derivations.test.ts`' "THE DATABASE-BACKED THREE"; the double's `thesisMention.findMany`, which honours
  both). `contract.ts`' row types are the suite's transcription of A2 and step 18 replaces them with Prisma's
  generated ones (its header, "WHY A TRANSCRIPTION EXISTS AT ALL").
- **The loader fails a case on its EARLIEST owed export** (`absent.ts`' `built`). So a case asking for two
  exports names the earlier step until that step lands: GAPS_DECIDED and THE_CALL / THE_REQUESTS, titled step
  22, red-line step 20 until the gap list lands; PUBLISHABLE(v), step 23's, red-lines step 22
  (`derivations.test.ts`' header, "RED BY DESIGN").
- **Step 20 owes three decisions the suite leaves open by design:** a HISTORY tie between rows written in one
  transaction (`fixtures.ts`' header, "EVERY `createdAt` IS DISTINCT"; the sketch's L5); whether `since` is a
  strict or an inclusive boundary (the HISTORY cases place the date BETWEEN two rows); and whether Q1's race
  is met by re-reading `affirmed` inside the transaction, as the suite stages it, or by a row lock, which
  would make the staged interleaving unreachable — the builder states which (`tools.ts`'
  `reaffirmDuringTheWrite`).
- **The harness's rules:** extend the shared double ADDITIVELY, its six consumers unedited as the proof
  (`tools.ts`' header, "THE DOUBLE IS READ AS IT IS"); the predicate signatures are the suite's, reshapeable in
  one place (`contract.ts`, A3's signatures).
- **OWED BY STEP 17 AND NOT GIVEN:** plan §5 `:241` tags `thesisAssertions` (132 lines) *"READ AT STEP 17 —
  tagged when the acceptance suite is written, by what it asserts"*. Step 17 did not give the tag; it is
  carried to step 18's handoff as that step's first act.

## 8. RECORDED, NOT APPLIED

`DOCUMENT_CLASS_NOT_BUILT` is spelled as a literal in three places. `decide_gap` is `paid: false` beside an
OWED code, which `contract.ts` defines as one "whose only arm crosses a model" (see §9). Invariants row 2 is
titled step 24, the step that greens it, while its subject is step 20's. §10.5 row 7's appeals half — "units
and roles" — is held by no case at step 17. SECOND_GAP's gap-id vector is spelled in both `scans.test.ts` and
`reads.test.ts`. `list_theses`' world cannot tell the unargued count from the count of evidence citations —
UNARGUED's own distinction, held in `derivations`, and the tool's CALL is the builder's to prove. The mention
entry's key set `{ kind, name, pin, argued }` is held value by value, not by equality. The STALE_TRAJECTORY arm
of readiness' information could be satisfied by the gate's own check-12 failure row — step 23 should not read
that green as proof of an information channel. `contract.ts`' comment on the gap list cites plan step 20 by
lines this record's pointer has since moved by three. The evidence suite's one red names step 24, where plan
step 23 `:154` builds the arm it waits for.

## 9. STILL THE RESEARCHER'S

1. **Is a CALLED `decide_gap` a paid call?** A4 `:1494` checks `NAMES_PERSON` "by the same rule as T5" —
   the publication assessor's name list, a model (T5 `:757`). But A4 `:1488` marks `decide_gap` WRITE with no
   "paid" (A4 `:1423`: every paid call is named as one), and neither `count-paid-calls` (A7 `:1672`) nor the
   measurement table (`:1207`, under "VERIFIED BY MEASUREMENT", `:1196`) counts a decision. Either the
   CALLED decision spends a model call and both are amended, or the rule is mechanical and no document says
   what it is. `NAMES_PERSON` stays owed to 23 until ruled.
2. **Whose gaps the whistleblower call carries.** T4 `:628` and `:687` and A4 `:1502` say the PUBLISHED
   version's; A2 `:1320` and A3 `:1404` key a decision to the thesis. Sketch §3b's "never the head's" and T4
   `:694`'s "readiness reports the call's item count" both wait on it. Recommended: the flows.
3. **Who a debate is attributed to in HISTORY.** Evidence T3 `:371` and `:399` say attributed; evidence A2
   `:958` gives the debate no researcher column. Recommended: the opener, at step 18's rename.
4. **`list_thesis_reviews`' envelope.** `{ owed, reviews }` has no appendix ground (§1); keep it as a declared
   deviation and amend A4 `:1524`, or return A4's list.
5. `NOT_ACQUIRED` from a `#ev_` name — evidence defines a record as ACQUIRED, so no design says how a name
   reaches that state.
6. MISSING framing elements as OPEN gaps from the first day — T4 `:622–:623` (*"already on the list at
   OPEN"*) and T1 `:284–:285` (*"opened with its gaps on record from its first day"*) — against A4 `:1462`'s
   `create_thesis` writing no gap decision.
7. A refusal word for framing rounds after publication (§12 `:1132` freezes them; no tool refuses).
8. One state, two words: `NOT_A_RECORD` (thesis A4) and `NOT_A_CAPTURE` (evidence A4).
9. Carried from step 15: the §2b wrapper, and a CURRENT version with zero chunks passing check 17.
10. The protocol doc and `check-handoff.py` still require the designs read WHOLE, which the researcher's
    scoped-reading ruling of 2026-09-10 replaced — a dated amendment is owed.
11. Whether the protocol's DESCRIBE list should NAME built code beside narrative and dated documents
    (protocol `:94–:97`), so that §1's lesson is a line of the protocol rather than of this record.
12. Overturning any coined name above.

## 10. WHAT THIS STEP DOES NOT CLAIM

That anything is built. **No module under `src/` creates a thesis, a version, a mention, a framing, a gap
decision or a publication.** Every file of the suite is red, and every case that reaches a module is red by
name until its step builds it; the 35 green cases hold the loader, the scans' decoys and the contract against
itself, never a thesis behaviour. The suite STATES the contract; that each case CAN be satisfied, and asks what
the design asks, rests on the reviewer's stubs and on the conformance reading above — never on code. It stays
informational in CI until step 25. The staging exercises are OWED and never faked: step 12's live look at the
public reads (thesis 21), step 14's review exercise (thesis 20), step 15's gate and `audit-theses` over a real
thesis (thesis 20–24).

**The suite at landing, re-run on `3903de1`:** `tsc` 0 · `tsc -p tsconfig.test.json` 0 · `npm test`
**100 suites / 1,471** · `test:walk` **427 / 427**, `git diff b0e60a4 -- src/walk` 0 lines · `test:evidence`
**197: 196 green, 1 red BY NAME** — `PUBLIC_PAGE — the EVER PUBLISHED arm, owed to thesis step 24 › a page
cited by a WITHDRAWN published version stays PUBLIC — opened pages stay open` · `test:thesis` **399 = 35 /
364** as in §2. CI's own run reported the same numbers and the same red, by name.
