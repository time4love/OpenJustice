# Thesis step 18 — the schema, on the target schema: one migration, and what measured it

**Landed 2026-09-11, PR #418 → `staging` `bb77a9f`** (code `e2d5a09`, the lint lock `043d1b8`). Plan step 18
(`docs/gf-thesis-refactor-plan.md`), contract thesis flows A2 `:1257–:1356` with A1's `NORMALISE` and `PROVISION`.
Written the evening it landed; never edited after.

## 1. THE RULINGS, AND WHAT DECIDED EACH

**The researcher's, 2026-09-11** — seven questions carried out of the sketch's three rounds, each with its ground:

1. **The head note governs plan `:107`.** The plan's step-18 text still said the old tables and columns "stay until
   step 25"; the DECIDED note above step 17 (`:52–:84`), step 25's own closing lines and the step-17 suite's eighteen
   `(thesis step 18)` cases all say the removal happens here. The plan line is amended in this step's docs.
2. **`DebateSession` stores its opener** (`researcherId`, REQUIRED), written by `open_debate` at create. Evidence T3
   `:371` says the debate is "attributed"; evidence A2 `:958` took it "as built", with no such column. REVIEW first
   recommended DERIVING the opener from `Thesis.createdById` — every debate write refuses `NOT_AUTHOR` (thesis A4
   `:1419–:1420`), so the author is the opener by construction — and **corrected itself before the ruling**: every
   append-only act row A2 defines stores its own `researcherId` (`:1330`, `:1337`, `:1340`, `:1343`) even under that
   same rule, so the design's pattern is to STORE. A stored name is also fixed history; a derived one would
   re-attribute past debates if authorship ever moved.
3. **The debate's companions lose "Diff"**: `DiffDebateEvent`, `DiffDebateStatus`, `DiffDebateEventType` become
   `DebateEvent`, `DebateStatus`, `DebateEventType`. No design named a successor (grepped: 0 hits); one concept now
   carries one name, and "diff" had stopped describing a debate on a capture.
4. **NOTHING IS DELETED — RESTRICT, never CASCADE, and (extended the same day) never SET NULL.** The researcher's
   words: *"I don't think we should really delete anything from DB, we may unpublish the thesis to make it invisible
   for the public."* Thesis A2 `:1355` and evidence `:1016` say it; `unpublish_thesis` writes a `Withdrawal` and
   deletes nothing. Five nulling arms were re-pointed too — a nulling arm is a deletion path standing open, as the
   11b record `:40` put it.
5. **`thesisClaimAudit` is REWRITE at thesis 18** (plan §5): its input becomes `ThesisVersion.text` and EVIDENCE
   mentions; what it REPORTS is unchanged (T5 `:767`, A4 `:1529–:1531`).
6. **A PURE MODULE NEVER GAINS A DEPENDENCY.** The researcher's words: *"we should not add deps to the pure file, we
   should try to find the correct dependency (module with a client depends on pure)."* So `normaliseClaim` moved OUT of
   `services/claimTrajectory.ts` (which constructs a Prisma client at import) into a new `lib/normalise.ts` that
   imports nothing, and the service imports it. Thesis A1 `:1247–:1250` is amended to say so — the only design line
   that placed the symbol.
7. **A2's "REQUIRED on X" arms are CHECK constraints**, now: `ThesisGapDecision_fields_by_decision` (CITED → a record,
   REQUESTED → its request, CALLED → its call item, CONCEDED/DISMISSED → a reason), `ThesisMention_fields_by_kind`
   (EVIDENCE → its pin), beside `Note_one_target`. A2 names "a CHECK constraint" only for `Note`; the house had already
   read the same wording as a CHECK at 11b (`EvidenceDecision_fields_by_type`). Each REQUIRES and forbids nothing —
   11b's line, *"A2 states what is required and excludes nothing"*. The Json arms demand an OBJECT, because
   `Prisma.JsonNull` is a JSON value that `IS NOT NULL` accepts.

Also ruled: **`thesisAssertions` is KEEP** (plan §5 `:241`).

**REVIEW's, overturnable:** the four coined enum names (`FramingRoundType`, `GapDecisionValue`, `PublicationVerdict`,
`PublicationOutcome` — the first two already the suite's words); `originUrlFromWayback` RETIRED with its three cases
(no caller since 11b); the rename-only proof in place of "the double's consumers unedited"; the guard file's name.

## 2. WHAT WAS BUILT

**One hand-written migration**, `prisma/migrations/20260911120000_thesis_step_18_schema/migration.sql`, 94 statements,
no BEGIN/COMMIT: the debate renamed (every constraint and index name with it) and given its opener; the mention renamed
IN PLACE to `versionId` / `kind` / `name` with its kinds reduced to `EVIDENCE | TRAJECTORY` by a type swap; the version's
`text` and `claim` added and the TipTap body, analysis, input hash and status dropped; `Thesis.provision` added and
`title` dropped; `ResearchSession`, its events, `KeyFigure`, `ThesisGapResolution` and their enums dropped; A2's seven
tables, their enums, indexes, foreign keys and three CHECKs created.

**The code:** `lib/normalise.ts` (NEW, imports nothing) and `lib/provisions.ts` (NEW, `PROVISIONS` as A1's one table);
18 `src/` readers rebased; `services/debatePassage.ts` reads paragraphs of `text` (T3 `:501–:503`, pulled forward from
step 21 because the drop leaves nothing to walk); `audit_thesis_claims` reads `text` and EVIDENCE mentions; the TipTap
walker and `collapseTrajectoryRuns` deleted with the column they parsed.

**The suite:** the 24 step-18 cases of the step-17 acceptance suite turn green; `retired-names`' seventeen schema cases,
its source case and its decoy move to `test/walk/retiredNames.test.ts`, as step 17's ruling said they would; the row
types become Prisma's generated models; the shared double speaks A2's names only. **Two NEW guard files in the unit
project:** `test/thesisGuards.test.ts` (each CHECK added by exactly one migration, every arm inside that statement,
never dropped later, named in the model's `///` comment; `lib/normalise.ts` imports nothing) and
`test/migrationsOneTransaction.test.ts` (no migration carries a transaction statement but three pinned historical files).

## 3. HOW THE SQL REACHED THE RESEARCHER'S WORD

The sketch ran three rounds (the cap) before a line of code: round 1 found the generator's script unrunnable and
destructive, round 2 moved the guards into the gating project, round 3 carried the five re-pointed keys. The file was
then frozen — sha256 `596bf44d307ff3e9c6f9640429c3fc0fd7fcebf124fa4b6be9e6b9a01dd64184` — and approved as that sha. The
landed migration's statements are the frozen file's **byte for byte, comment-stripped and in order**; only its header
comment differs (APPROVED in place of DRAFT, and an out-of-repo handoff reference replaced — this repo is public).

**The generator was read, not trusted.** `prisma migrate diff` rendered both renames as drop-and-recreate (every debate
destroyed, its events orphaned), altered the mention's `kind` inside its own BEGIN/COMMIT before the column existed, and
can write no CHECK. The hand-written file differs on exactly those points and nowhere else, proven by a clause-level
cross-check in both directions — the reviewer built its own target from A2 and the rulings, found it DB-equivalent to
the developer's ("This is an empty migration.") and its generated diff clause-identical (106 = 106).

## 4. THE PRECONDITION WAS MEASURED, AND THE INSTRUMENT IS BLIND IN TWO WAYS

`db:simulate` measures by TABLE (`src/services/dbSimulation.ts`): it keeps a table only if it lost rows or ceased to
exist. So **a column drop reads LOW RISK whatever the column held**, and a renamed table reads as one that ceased to
exist. Two consequences for a migration like this one: the per-column counts the sketch first planned had no instrument
at all, and the verdicts had to be read per table.

What replaced them: **ONE simulated TRUNCATE over the nine tables the migration touches** — a closed set, since every
foreign key into them comes from inside it — which reports each table's row count as rows lost and rolls back. Run in
the staging container, the environment stated twice, 2026-09-10T21:02Z, deployment `73ab5fa1` @ `3903de1`: **✅ LOW RISK,
0 rows lost — every one of the nine holds 0 rows.** The four table drops were then simulated one statement at a time:
each ⚠️ HIGH RISK by the simulator's rule (a table ceases to exist) with **0 rows lost**. `DROP TABLE "ResearchSession"`
alone is STATEMENT FAILED whatever the rows — the event table's foreign key is a dependency — so parent and child were
simulated as one statement, which is also the order the migration drops them in.

## 5. THE TAKING, READ FROM THE DATABASE

A migration RUNNING and a constraint TAKING are different facts. After LAND, read in the staging container
(`railway ssh … node -e`, read-only SELECTs, the JS passed base64 so no shell escaping and no guard word in the command;
the container echoed `RAILWAY_ENVIRONMENT_NAME` staging, `APP_ENV` staging, commit `bb77a9f`):

- **CHECKs present with their definitions:** `ThesisMention_fields_by_kind`, `ThesisGapDecision_fields_by_decision`,
  `Note_one_target`, and the renamed `DebateSession_one_record_key`.
- **32 foreign keys on the touched tables, every one RESTRICT** — no CASCADE, no SET NULL.
- **Nullability:** `Thesis.createdById`, `ThesisVersion.text` / `.claim` / `.createdById`, `DebateSession.researcherId`,
  `ThesisMention.versionId` / `.kind` / `.name` NOT NULL; `Thesis.provision` nullable.
- **Tables:** A2's seven and the two renamed present; `ResearchSession`, `ResearchSessionEvent`, `KeyFigure`,
  `ThesisGapResolution`, `DiffDebateSession`, `DiffDebateEvent` absent. The old columns absent.
- **Enums:** `MentionType` = EVIDENCE, TRAJECTORY; `DebateStatus`, `DebateEventType` present; `DiffDebate*`,
  `ThesisVersionStatus`, `ResearchSession*` absent.

`db:check-drift` said "No difference detected." before the SQL was written and again after the deploy.

## 6. ONE TRANSACTION — AND IT IS VERSION-PINNED

The house's rule that "a broken migration becomes a failed deploy, not a live site talking to a half-migrated database"
rests on the engine's transport, which nobody had read. It was read here: **Prisma 5.22.0 — the backend's pinned copy,
what the pre-deploy step resolves — sends a migration file as ONE `client.simple_query(script)`**
(`schema-engine/connectors/sql-schema-connector/src/flavour/postgres/connection.rs:161–:165` at tag 5.22.0), and
Postgres runs a multi-statement simple query as one implicit transaction. 6.19.3, hoisted at the monorepo root, does the
same. **prisma-engines `main` SPLITS a script into statements** (`split_script_into_statements`), so on a future major
upgrade a failure mid-file would leave a half-migrated database while the old version serves. The property is
version-pinned, and an explicit COMMIT inside a file ends the implicit transaction midway even today — which is why
`test/migrationsOneTransaction.test.ts` now holds that no migration carries one, with three applied files pinned by name
(`20260820050000`, `20260820060000`, `20260830020000`) because an applied migration is never edited.

## 7. A GUARD IN A JOB THAT GATES NOTHING HOLDS NOTHING

The sketch first placed the three CHECK cases in the thesis acceptance project. Only `npm run test:gf` is a required
check (`.github/workflows/tests.yml`); the acceptance job runs `continue-on-error` until thesis step 25. A CHECK is
invisible to Prisma and to `db:check-drift`, so the case holding it is the ONLY thing that holds it — and a case in a
job that cannot block a merge holds nothing. The cases moved to the unit project. **The evidence layer's CHECK guards
(`test/evidence/invariants.test.ts`) have the same gap, one layer down: recorded here, not fixed here.**

## 8. NORMALISE MOVED, AND THE PIN PROVED IT DID NOT CHANGE

`test/detectionVersionPinned.test.ts` hashes the bodies of nine detection functions, `normaliseClaim` first, and refuses
a change without a `DETECTION_VERSION` bump. Moving the function could have reddened it or invited a bump nothing
behavioural asked for. It did neither: the guard now reads BOTH files and composes bodies in its own list's order, so a
function moved with its body unchanged leaves the hash unchanged — and the reviewer reproduced that independently, in
Python, before the code was written: today's source hashes to the pinned value, and so does the moved layout, in either
file order, while `claimTrajectory.ts` alone throws. **`PINNED` stayed as it was; the pin staying green unedited is the
proof that detection did not move.**

## 9. WHAT THE ROUNDS FOUND

Chunk 1, three rounds: the staging counts had no instrument (§4); the one-transaction claim was unverified (§6); the
guards did not gate (§7); the rename-only proof claimed a property it lacked (its `refId` rule would have passed a wrong
rename of the debate event's live column — no subject carried one, and the rule is now scoped); its self-test could not
build a decoy where the renamed line sat inside a multi-line assertion (now generalised). Chunk 2, two rounds: nothing
HIGH or MEDIUM on the code, and one gap — **no case asserted that `open_debate` writes the caller as the opener.** The
compiler holds the column's presence and the foreign key would refuse a stranger, but the VALUE was held by nothing. One
case now holds it, red first on a decoy that compiles.

**Every claim was reproduced by the reviewer:** its own target and offline diff, its own reader sweep, the suites, the
KEEP sweep, eight decoys against the new guards and the moved scans (each restored byte-identical), the rename proof
re-run, and a decoy of its own for the new case.

## 10. RECORDED, NOT FIXED

- `services/debatePassage.ts` splits paragraphs on `\n[ \t]*\n`, so a text with Windows line endings yields ONE
  paragraph — the whole text as the passage, the defect that module's own comment warns of. The passage is step 21's.
- The lint ratchet **fails a debt DECREASE** by design. A step that deletes code therefore fails its first CI run; the
  gain is recorded in the same change, from CI's numbers, never a laptop's (92 → 85 here: the deleted walker's
  `String(…)` calls).
- Two dated records cite `gf-thesis-refactor-plan.md:245` for a sentence this step's pointer moved to `:253`. A dated
  record is never edited; the living protocol doc's citation was corrected.
- The A1 amendment's four lines are wider than the block around them. Reflowing them needs shorter wording than the
  researcher approved, so it waits for them.

## 11. WHAT THIS STEP DOES NOT CLAIM

Nothing writes a thesis yet: `create_thesis` and `add_thesis_version` are step 20's, framing step 19's, decisions step
22's, the gate and the public reads step 23's. So **no CHECK here has ever refused a real row**, no `researcherId` has
been written by a real `open_debate` call, and the passage has never been taken from a real version's text — they are
held by fixtures and by the database's own refusal, and step 21's staging walk is where the passage meets real text.
**Production is untouched** at `9661206`: it still holds the one published thesis in the old shape, and this migration
reaches it only at SHIP, after its database is dropped — so it meets an empty database there too. Of the questions still
the researcher's, the first is step 17's: is a CALLED `decide_gap` a paid call.

## 12. THE NUMBERS AT `bb77a9f`

CI suite **1,481** (102 suites) · walk **446** · evidence **197 = 196 / 1**, the one red by name, owed to a later step ·
thesis **382 = 42 / 340**, every red owned by steps 19–24 by name · tsc 0 · lint debt **85** · MCP surface 23 · no tool
registered · deploy SUCCESS · drift clean.
