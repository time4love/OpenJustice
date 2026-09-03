# Refactoring the article-rules layer — 2026-09-02

**From** `docs/gf-architecture-current.md` **to** the design in `docs/gf-interaction-flows.md`, whose
reasoning is `docs/gf-architecture-target.md`. The flows doc's appendix is the contract every step
builds to; the as-built doc's §7 maps every part to its legacy module and §8 tags every test.

This is harder than building the target on clean ground, and the reason is worth stating before any
step: **the code being changed is live, its data is real research, and the layer it feeds decides
whether a capture is stored at all.** A refactor that gets extraction wrong does not produce wrong
text; it produces a corpus with holes.

---

## 1. THE STRATEGY — BESIDE, NOT THROUGH

The code is far from the design, the data is live research, and the suite holds ~4,000 lines of
assertions about behaviour the design retires. Refactoring through that in place would mean every
step touching tests that encode the old model, and a test modified to pass is the one thing this
plan forbids.

So the new walk is built BESIDE the old scan. New tables are additive. New tools have new names. The
pieces the design reuses — the fetch, the derivation, the drift comparison, the storage-and-anchor
path, the CDX table and its writer, the marking page's preview — are reached by import from the new
code, and nothing new imports from `calibrationRun`, `rulesetForCapture`, `calibrationFold`,
`admitUrl` or the scan job. The old tools and the old scan keep working, and their tests keep passing
untouched, until the acceptance suite is green. Then ONE step switches the MCP surface, retires the
old path, and deletes its tests in the same commit.

Three properties follow:

- **"Each step leaves it working" is true without effort.** The old path is never half-changed.
- **The legacy suite is a guard, not an obstacle.** It protects the old path until the old path is
  removed, and nothing is ever weakened to pass.
- **The switch is one reviewable diff**, and it is the only step that can break a researcher's
  workflow — so it is the step that waits for the researcher's word.

The cost is a stretch where two implementations coexist. The discipline that stretch needs is a
source scan, from the first step: no file under the new walk imports a retired module.

## 2. THE TRANSLATION TABLE — OLD TO NEW, ONE ROW EACH

| old | new | verb |
|---|---|---|
| era, `ERA_BOUNDARY`, `deriveEras`, `eraForDate`, `governingEras` | nothing; RULES_IN_FORCE over `Rule` rows by date | retire |
| `CalibrationRun`, `runId` | the page: log and draft on `TrackedUrl` | retire |
| `CalibrationDecision` (run-scoped, no researcher) | `Decision` (page-scoped, `researcherId`, seven types) | transform |
| `RUN_OPENED` · `RUN_CLOSED` · `CAPTURE_SHOWN` · `CAPTURE_REJECTED` · `ERA_BOUNDARY` | nothing | retire |
| `RULESET_CORRECTED` (full selector list) | `RULESET_CORRECTED` naming the capture, with `Rule` rows following | transform |
| `CAPTURE_ACCEPTED` · `CAPTURE_SKIPPED` | the same, page-scoped, attributed | transform |
| — | `RULE_TRUSTED` · `RULE_ENDED` · `RULE_RETIRED` · `RESET` | build |
| `CalibrationReset` | the `RESET` decision | transform |
| `ArticleRuleset` (hash of the set), `activeArticleRulesetId`, `commit_article_rules` | `Rule` rows; RULESET_ID derived per date; nothing to activate | retire |
| `RulesetObservation` (keyed to the hash) | `RuleMatch` (keyed to the rule) | transform |
| `CdxIndexEntry` STORED · UNCHANGED · UNSERVABLE · UNFETCHED, unique with digest | the work-list row: ACQUIRED · DUPLICATE · UNSERVABLE · UNFETCHED + IDENTICAL · PENDING_JUDGEMENT · SKIPPED, unique on page and timestamp | transform |
| `admitUrl`, `ScanRelevanceAssessment`, the five callers | the survey creates the `TrackedUrl`, attributed; every other operation refuses an unsurveyed page | retire |
| `WaybackScrapeJob`, `processJob`, `runFullScan`, `start_forensic_scan` | `scan_captures` | retire |
| `recordCapture` (derive + novelty + store + anchor) | the walk derives and decides; `recordCapture` stores and anchors | transform |
| `recoverMissingCaptures` | the walk over UNFETCHED rows | retire |
| `reconcileAgainstCdx` | the re-walk over STALE rows, versioning text | retire |
| `calibrate_article_rules` · `correct_article_rules` · `open_article_capture` · `judge_article_capture` · `next_article_capture` · `resolve_era_boundary` · `check_ruleset_survival` · `abandon_article_rules` | `survey_wayback_captures` · `scan_captures` · `approve_article_rules` · `resolve_scan_stop`; MARKING on any capture; abandon is deleting the draft | retire |
| `get_article_rules(runId)` | `get_article_rules(url)` per A5 | transform |
| `/api/article-rules/:runId/…` (nine routes) | `/api/article-rules/pages/:trackedUrlId/…` (five routes) | transform |
| `TrackedUrl.status` SCANNING on admit | no status written by entry; the walk's state is the work-list | transform |
| `text` overwritten in place | `TextVersion` keeps the previous | build |
| a run's `CONFIRM_AFTER_CLEAN`, interactive/automatic mode | nothing | retire |

## 3. THE STEPS — EACH LEAVES THE OLD PATH WORKING; THE EIGHTH SWITCHES

### 0 · The acceptance suite, failing

Written from the flows appendix before any code: A3's derivations as pure functions over fixtures;
A4's five gates, one file each, including the RESOLVED skip and the re-walk's own-previous-text case;
A5's seven tools with every refusal; A6's five routes; A7's transaction and STALE_SEQUENCE; the ten
invariants of the target doc's §6; and the source scan — no file under the new walk imports a retired
module, proven against a decoy. Every file red. **This is the spec; the steps below turn it green.**

*Leaves working:* everything; nothing is touched.

### 1 · Schema, additive only

New tables `Rule`, `PageDecision`, `RuleMatch`, `TextVersion`. New columns on `TrackedUrl`
(`createdById`, the draft fields). New outcome values and columns on `CdxIndexEntry` (IDENTICAL,
PENDING_JUDGEMENT, SKIPPED; held body, ruleset id, text hash, stop gate, reason, digestVerified) and a
new unique index on page and timestamp beside the old one. No old table, column or constraint changes.

*Leaves working:* everything. *Verified by:* `db:check-drift` clean before writing the migration; the
migration read before commit; deploys itself.

### 2 · The survey

`survey_wayback_captures` as a new MCP tool: reuses the CDX query and `recordCdxObservation`, adds
attributed `TrackedUrl` creation, the byte-distinct count, and the legacy join (a row whose page and
timestamp match an existing `UrlSnapshot` is ACQUIRED with that id). `admitUrl` is not called.

*Leaves working:* the old scan, untouched. *Verified by:* A5's survey contract green; the legacy join
proven on the staging corpus — every existing snapshot has a row.

### 3 · The page log and the rules

The page-scoped decision writer with the unique-index compare-and-set inside one transaction;
`researcherId` on every row. RULES_IN_FORCE, RULESET_ID, AUTHORITY, TRUSTED, SEEN, RESOLVED, STALE
and NEXT_ROW as queries. `approve_article_rules` and `resolve_scan_stop` as new tools. The new
`reset_article_calibration` and `get_article_rules` are built under their final names but
REGISTERED ONLY AT STEP 8, because the old tools own those names until the switch.

*Leaves working:* the old calibration, on its own tables. *Verified by:* A3 and A5 green for these
four; the source scan green.

### 4 · The walk, reporting only

`scan_captures` with every step of Phase 2 EXCEPT the writes: fetch, derive, compare, all five gates,
and the stop's material — reported, storing nothing. Reuses `archiveHttp`, `deriveTextUnderRuleset`,
`compareExtractions`, the classifier via `analyzeChange`.

**This is where the three measurements are taken.** Run against walla and corona: Gate 2's stop rate,
Gate 4's stop volume before any rule is trusted and after the obvious ones are, Gate 5's verdicts on
diffs a human has already classified. Recorded in a dated doc, pointed at from the plan's STATUS. The
design's premise — stops become rare once rules are trusted — is confirmed or refuted HERE, before a
walk is allowed to store anything.

*Leaves working:* everything. *Verified by:* A4 green; the dated measurement doc.

### 5 · The walk, writing

The outcomes on the work-list row; held bytes while PENDING_JUDGEMENT; digest verification; the
store-and-anchor step, which needs `recordCapture` split so the walk can call storage and anchoring
without the derivation and novelty it also performs — the one change to a reused module, and its
existing tests must stay green; the diff written at acquisition with its verdict via `recordDiff`;
Gate 0 as the bootstrap.

The walk writes the diff in its target shape from the first capture it acquires: `UrlVersionDiff`
as the pair, and the chunks, survival and classification as a `DiffContentVersion` (evidence
doc A2); the old columns keep being written by the old path only, until step 8. And the
anchoring path evaluates `WRITES_ALLOWED` before its first write and refuses `REGISTRY_FROZEN`
(evidence doc §8) — the refusal that holds the registry window shut, landed here so that it is
on production before any capture could be anchored there.

*Leaves working:* the old scan, still on its own path. *Verified by:* A5's `scan_captures` contract
green; a full walk of a small staging page end to end, stops resolved through the chat.

### 6 · The marking page and its routes

The five page-scoped routes beside the nine run-scoped ones; bytes served from the held body or the
snapshot; approve-as-is and trust affordances; the `rules=0` line; the draft with `trusted[]`. The old
routes and page stay for the old tools.

*Leaves working:* the old marking flow. *Verified by:* A6 green; a stop resolved through the new page
against staging.

### 7 · The re-walk

STALE rows walked; `TextVersion` written on supersession in the same transaction; the
own-previous-text comparison; RULE_ENDED from unmarking; the reset as RESET plus RULE_RETIRED.

`DiffContentVersion` lands with `TextVersion`: a superseded text version re-derives every diff
spanning it as a new content version, keeping the old, in the same transaction (evidence doc §3);
a capture acquired between two ACQUIRED captures re-diffs its successor against it (flows A5, the
clause owed by the evidence doc §7).

*Leaves working:* everything. *Verified by:* A4's re-walk case green; a correction on a staging page
that supersedes stored text with the previous version retained and the anchors untouched; one
promoted record entering NEEDS_REVIEW on staging with old and new versions both readable.

### 8 · THE SWITCH — the researcher's word

Register the new tools and unregister the old; `WRITE_TOOLS` and the classification test's expected
set updated; the old scan job, calibration service, era fold, detectors, sampling, admission and
their five callers deleted; every RETIRE-tagged test deleted in the same commit; `urlAdmission`'s
scan rewritten to "only the survey creates a `TrackedUrl`"; the retired-names source scan goes green.
`start_forensic_scan` and `enrich_evidence_with_history` refuse an unsurveyed page instead of
admitting.

*Leaves working:* the new path only. *Verified by:* the whole suite green with the RETIRE files gone;
the integrity board.

### 9 · THE REBUILD — the database is disposable, the chain is not; its own sessions

Ruled 2026-09-03 (evidence doc §8): nothing in either database is migrated. The legacy log is not
copied — it goes with the database. The order, each step gated by the one before, staging in
full before production begins:

1. MEASURE, read-only, in the container: extractor equality per capture, chain-state attribution
   on both old registries, the archive still serving each capture's bytes.
2. EMIT AND VERIFY THE REGISTRY LEDGER for the old contract — every index explained, complete
   against `totalEvidence()` — and commit it.
3. DEPLOY THE NEW CONTRACT, unchanged source, the researcher's deployer key, never MCP.
4. ROTATE the configuration; acceptance: `get_environment` names the new address, code at it,
   `REGISTRAR_ROLE` held, `totalEvidence() = 0`.
5. DROP THE DATABASE under the destructive-database protocol, whole, after a dump kept offline.
6. SURVEY AND WALK: the corpus rebuilds itself from the archive and anchors as it goes, index
   zero stamped with the anchoring scheme.

Steps 5 and 6 are the cleanup session; steps 1–4 precede it and write nothing to a database.
Production runs 3–6 at SHIP, after staging's six have been verified end to end — the mainnet
deploy is one-shot, and staging is its rehearsal. Not before step 8 has served on staging.

### 10 · Vocabulary

`era` out of identifiers, comments, tool text and docs. Last on purpose: renaming before the
behaviour is gone produces a diff nobody can review, and the word is harmless while it is still true
of code that is about to be deleted.

## 3b. THE EVIDENCE STEPS — after the rebuild, on the target schema

**Implementation order is corpus → evidence → thesis, and each plan points to the next.** §3 above
is the corpus; this section is evidence; the thesis steps are `docs/gf-thesis-refactor-plan.md`,
which begins where step 16 ends and builds to `docs/gf-thesis-flows.md`'s appendix.

Each is one PR, each leaves the suite green, and each lands with the instrument that proves it
and the breakage that proves the instrument (evidence doc A7).

### 11 · Schema
`Evidence` as the marked record, `EvidenceDecision`, the debate's thesis and record columns, the
mention's pin and argument — no role, withdrawn by the thesis flows A2; the identity module as
one importable symbol;
`evidence-recomputable` and `evidence-no-prose` green on an empty database.

### 12 · The reads
`list_findings` replacing the timeline and the scan findings, `resolve_record`, `get_diff_input`
by pair, `check_on_chain_status` re-scoped to captures, PUBLIC_PAGE gating; `opinions-not-facts`
as the shape test.

### 13 · The debate on a citation
`open_debate`, `respond_in_debate`, `promote_from_debate`, `get_debate`, the assessor reading the
citing passage; `NOT_CITED` proven to refuse.

### 14 · Review
`list_evidence_reviews`, `review_evidence`; a re-walk on staging putting one promoted record into
review and both decisions exercised.

### 15 · The gate
The six checks of A6 calling A3's predicates, check 6 gone; `audit-theses`.

### 16 · The evidence switch
The retired names of A4 unregistered, the retired-names scan extended, the evidence routes handed
to the frontend's change. **Next: `docs/gf-thesis-refactor-plan.md`, step 17 onward.**

## 4. THE TEST RULES

The suite is the thing most likely to make this refactor fail, in either direction: weakened to pass,
or left asserting the old model so the new one cannot land. Four rules, none with an exception.

1. **A test asserting a retired concept is deleted in the commit that retires the concept.** Never
   modified to pass, never skipped, never left red. The as-built doc's §8 names every file and group
   with the RETIRE tag; step 8 is where they go, and a RETIRE file still present after step 8 is a
   defect in step 8.

2. **A test asserting an invariant or a reused contract is never edited.** §8's KEEP files. They are
   green before step 0 and green after step 10, and every step in between. A KEEP file that has to
   change to keep passing means a reused module's contract moved, and the step that moved it is wrong.

3. **A REWRITE file is rewritten to the appendix, in the step that changes its shape**, as a new
   file beside the old one; the old one is deleted at step 8 with its code. Two files coexist for the
   stretch, one for each path, and neither is edited to accommodate the other.

4. **The acceptance suite is written first, from the contract, and fails until the walk reaches it.**
   It never imports a retired module, which the source scan holds from step 0. When it is green, the
   switch is allowed; until it is green, no step may claim to be done.

**What a source scan holds, and why it is a test and not a review note:** that no new file imports
`calibrationRun`, `rulesetForCapture`, `calibrationFold`, `admitUrl` or the scan job, from step 0;
that after step 8 no file under `src` names `era`, `calibrationRunId`, `admitUrl` or any retired tool;
that `TrackedUrl` is created in exactly one module; that `urlVersionDiff` is written from exactly one
site. Each scan carries a decoy proving it can see what it scans for — a scan that matches nothing
is the vacuity this repository has paid for before.

**Migrating assertions, not files.** Four assertions survive their file's retirement and move:
"keeps every row, reverts included" to the survey; the superset check to the re-walk; `segments`'
cases under `extractionDrift`; the BAD_CAPTURE assertions to `resolve_scan_stop`. They are moved as
assertions about the new contract, not copied with their old fixtures.

## 5. THE DATA STORY

**Read on staging, 2026-09-02, read-only.** Production is read the same way before step 1 runs there;
its numbers differ, the shape does not.

| fact | staging |
|---|---|
| tracked pages · snapshots | 3 · 112, all WAYBACK, all anchored |
| snapshots with no CDX row | 83 of 112 |
| CDX rows sharing a page and timestamp | 0 |
| text extraction version | one, `v2…`, on all 112; no ruleset id anywhere |
| calibration runs | 3, all OPEN, 30 + 43 + 15 decisions, no draft on any |
| resets · rulesets · observations · assessments | 1 · 44 · 23 · 2 |
| diffs | 109 |

**Every migration before step 9 is additive.** New tables, new columns, new enum values, a new unique
index beside the old one. No column is dropped, renamed or narrowed, and no row is deleted. The old
path keeps its tables until it is gone.

**The digest can leave the work-list's key.** Zero rows on staging share a page and timestamp, which
is what immutability predicts. The new unique index on `(trackedUrlId, waybackTimestamp)` is added
beside the old three-column one in step 1 and the old one is dropped in step 9; a duplicate found on
production before step 1 is a finding to record, not a reason to keep the digest in the key.

**The legacy join is load-bearing, not a corner case.** 83 of 112 staging snapshots predate the CDX
table and have no row. The first survey of each page writes their rows and links them ACQUIRED by
page and timestamp — `backfillCdxIndex` already does the linking, by timestamp and digest; the survey
does it by timestamp alone. After step 2 every snapshot has a row, and that is asserted on staging
before step 5 is allowed to walk.

**Nothing is migrated. Ruled 2026-09-03, superseding the three paragraphs this one replaces.** The
112 captures, the 88 decisions, the 44 rulesets, the evidence rows and the one thesis go with the
database at step 9 and come back, where they come back at all, by the archive and the researcher's
own hand. The old registries stay on chain, frozen and explained in git; the rebuilt corpus is
anchored on a fresh contract with one meaning from index zero (evidence doc §8). Every migration
before step 9 is still additive — the old path serves until step 8 — and after step 9 the schema is
created in its target shape on an empty database, so the evidence steps of §3b carry no additive
constraint.

**Step 9 is a destructive-database session and nothing else.** Its opening message states its
purpose, names the environment by project ref, writes the scope to `.claude/DB_CLEANUP_SESSION`,
simulates every statement with `db:simulate` inside the deployment, announces the measured loss, and
stops. It runs on staging first, and on production only after staging has served on the new path.

## 6. VERIFICATION — WHAT "VERIFIED" MEANS AT EACH STEP

**A step is verified by a check that ran, never by a reading.** Four instruments, and every step's
"verified by" line in §3 names one of them.

1. **The acceptance suite (step 0).** Green per file, per step: step 2 turns the survey's file green
   and no other; step 8 turns the last one green. A step that turns a file green it does not own has
   done work outside its scope, and that is reviewed as a defect, not a bonus.

2. **The source scans.** From step 0: no new file imports a retired module. From step 8: no file under
   `src` names a retired concept or tool. Always: one `TrackedUrl` creator, one `urlVersionDiff` writer,
   one `documentHash` writer, one anchored-hash rule. Each with a decoy that proves it can see.

3. **A staging exercise, in the chat, with the literal commands.** Steps 2, 5, 6 and 7 each end with
   a researcher driving the new path against staging through the MCP tools — a survey, a walk that
   stops and is resolved in the marking page, a correction that supersedes text. The commands pasted
   and the responses received go into the step's dated doc. Prose handoffs have twice produced a false
   "I marked it"; a transcript cannot.

4. **The measurements, at step 4, in one dated doc.** The reporting-only walk over walla and corona
   records, per page: Gate 1 stops; Gate 2 stops and how many were a widget legitimately leaving;
   Gate 4 stops with every rule REVIEWED, then with the ticker, related box and comments trusted;
   Gate 5's verdict on every diff a human has already classified, as a confusion table; and the
   digest verification's match count. **The design's premise is that stops become rare once rules are
   trusted.** If the walla numbers say otherwise, the design changes before step 5, and the change is
   ruled in the flows doc, not patched in code. `measureEraDetectors` is the instrument's ancestor and
   is retired once this doc exists.

**Two rules from this repository's own history, restated because they will be tempted:**

- **Recompute, never restate.** A number in a step's dated doc is produced by the instrument on that
  day, not carried forward from an earlier doc. The union's "no measured harm" and the "0 to 1 versus
  129" figures are cited, never re-quoted as if re-measured.
- **A clean audit is not done.** The anchor audit, the integrity board and the suite going green say
  the new path is consistent with itself. Only the staging exercise says a researcher can use it.

**The integrity board** reflects each step's state as a ledger entry, colour from the plan's STATUS
line, bar from the computed proof; it is read before anyone asks how far the refactor has got.

## 7. DEFINITION OF DONE

The refactor is done when every line below is a check that has run, not a sentence that was read:

- the acceptance suite is green, every file;
- every RETIRE-tagged test in the as-built doc's §8 is gone, and every KEEP file is unchanged since
  step 0 — `git diff` against the step-0 commit shows no edit to a KEEP file;
- the retired-names source scan is green, with its decoy;
- the MCP surface is exactly the factual layer's five write tools and two reads plus the
  evidence surface of the evidence doc's A4, and `mcpToolClassification` agrees;
- the walla page has been re-walked from its first rule on staging: the survey, the bootstrap stop,
  the stops that followed, and the first re-walk after a correction, with the transcript in a dated
  doc; every capture has a row, every acquired capture is anchored, and the previous text of every
  superseded capture is a `TextVersion`;
- the step-4 measurement doc exists and the design either held or was changed in the flows doc first;
- step 9 has run on staging: the ledger is committed, the new registry's index 0 carries the
  scheme, the database was rebuilt by survey and walk, and `audit-registry` exits 0 there;
- the evidence steps of §3b have run on staging and `audit-evidence`, `audit-theses` and
  `audit-registry` have each been observed to FAIL before going green;
- the integrity board shows the refactor's entries at their computed proof, and `get_environment` on
  staging reports no unanchored snapshot.

Production is not part of done. `SHIP` is the researcher's, every time, and step 9 on production is
its own session after that.

## 8. HAZARDS, NAMED — the ones that have already cost something

- **`textHash` is the novelty key.** Any change to derivation changes which captures are considered
  new. Step 4 reports before step 5 writes for exactly this reason.
- **`recordCapture` is the one reused module that must change (step 5).** Its KEEP tests must stay
  green through the split; if one has to move, the split is wrong.
- **The jsdom boundary.** `chromeRulesetApply` is ESM-only; a static import drags it into every unit
  suite that touches the module. It has broken the suite twice. Use the dynamic-import pattern, and
  keep the walk's gate predicates in a module that never imports it.
- **Two lint ratchets** rule out both spellings of an indexed read; `.at()` is the answer, and neither
  ratchet is ever raised. **Do not run `lint:ratchet --update` locally** — the local pass
  under-reports type-aware rules.
- **Migrations self-apply on deploy.** Run `db:check-drift` before writing one and read the generated
  SQL before committing it. Step 1's migration touches an enum and a unique index on a live table;
  both are read twice.
- **The destructive-DB guard matches PROSE.** Any doc, test or commit message that names a destructive
  statement is written with the Write tool and committed with `git commit -F`.
- **Tool-name collisions during coexistence.** `reset_article_calibration` and `get_article_rules`
  keep their old handlers until step 8; the new ones are built unregistered. Registering both would
  make the MCP surface answer the same name two ways.
- **A `railway ssh` pipe swallows the exit code.** Capture first, filter after, whenever the exit code
  is the gate.
- **Route shadowing during coexistence (step 6).** The legacy router owns `/:runId/captures/:snapshotId`,
  which also matches `/pages/<id>/captures/<capture>` with `runId = 'pages'`. The new router is mounted
  BEFORE the legacy one at the same base, and a server-level test holds the order until step 8.

**What is already measured, so it is cited and not re-derived** (recompute before relying, never
restate): drift is 0 to 1 segments across a stable stretch and 129 segments at a real break, which is
why Gate 1 needs no threshold; date-scoping's match-rate benefit decays forward to nothing and a
partitioned model decays identically; the union caused no measured harm; a rule marked against one
structure does not match another across three hash generations of one header in four years.
→ `docs/gf-era-detector-thresholds-2026-09-01.md`, `docs/gf-level4-mcp-loop-verification-2026-09-01.md`

## 9. THE OPERATING MODEL — DEVELOPER, REVIEWER, CONDUCTOR

Recorded 2026-09-03, after the thesis design closed, so that the next refactor session builds from
the plan and not from a conversation. **This section is about the coding effort only.** The slow
gates — the ledger, the contract, the drop, the switch, `SHIP` — stay exactly as §3 and §3b place
them and are not made faster by anything here.

### 9.1 What was learned from steps 0 and 1

Two sessions with different roles, and the researcher relaying between them: a DEVELOPER session
implements a step and writes a summary; the researcher pastes it into a REVIEWER session that never
touches the repo; the reviewer answers with a prompt; the developer applies it and acknowledges. The
reviewer found something every time and the developer agreed every time. That is not politeness: a
fresh context reading a diff cold sees what the author's context cannot, and the findings split by
who did not build the thing (Level 1 recorded the same). **The protocol is kept. What goes is the
relaying, and reading every round.**

### 9.2 The same protocol, with the copying removed

```
conductor    one session — holds the plan, cuts a step into a brief, reviews the finished diff,
             merges in dependency order, holds every ruling; the researcher's seat
developer    a worker per step, in its OWN git worktree on its own branch: implements to the
             step's contract files until they are green; may import only what §4's scans allow
reviewer     a fresh context, given ONLY the diff, the step's contract section and §4's rules;
             may read, may run read-only checks, never writes; returns findings as a prompt
verify       mechanical: the finding's test exists and fails on the old code; the KEEP paths show
             no diff against the base; the scan's decoy is caught; npm test green FROM THE
             BACKEND DIRECTORY
loop         developer → reviewer → developer, until the STOP RULE; then the researcher reads
             ONCE: the final diff, the developer's summary, and the reviewer's rounds with what
             was accepted and what was pushed back — and approves the merge, or not
```

The workflow tool runs exactly this shape — implement, review, verify, in phases, transcript kept —
and the researcher opts into it by asking for it in their own words; subagents in worktrees run the
developer and reviewer roles without it. The hazard the two-session protocol met once — two sessions
sharing one working tree — cannot recur: a worker holds its own worktree and the reviewer holds none.

### 9.3 What must be written in, or the automated loop is worse than the manual one

1. **A stop rule.** A reviewer always finds something. Findings must cite the contract or a test; a
   severity threshold ends the loop; rounds are capped. Left implicit, the loop runs until the budget
   does.
2. **The developer's acknowledgement is not evidence.** "The comments were correct" is what a
   developer says; the verify phase checks that the finding's test exists and fails on the old code.
3. **Design-level catches are the researcher's.** Every mechanism that fell in the design sessions
   fell to the researcher's three questions — what does this add to the record beneath it, should
   this state exist at all, is this scenario real — and no reviewer agent asks them. The researcher
   stays at the step boundary, reading once per step.
4. **A second, different reviewer at the PR:** `/code-review ultra` on the finished branch, a fresh
   context with different instructions, triggered by the researcher.

### 9.4 Width, and what limits it

The plans already partition the work: the corpus track (§3) is mostly sequential; evidence (§3b) and
thesis (`docs/gf-thesis-refactor-plan.md`) run beside it once the schema step lands, ordered only at
the seams the plans name (evidence step 13 before thesis step 21; the frontend's page change before
the switch). Inside the thesis track, framing, the version write, gaps and the gate are separate
modules with separate contract files. Five or six workers at once is plausible. **What limits
throughput is reading**: the conductor's and the researcher's capacity to review finished diffs per
day. Parallelism is sized to that, never to the number of agents available.

### 9.5 Guardrails, each a trap already paid for

- Every worktree needs its own `npm install`, which needs the Wix VPN; a worker without it cannot
  run the suite and must say so rather than guess.
- jest walks into `.claude/worktrees/` when run from the repo root and runs every file two to four
  times, including half-written copies; workers run it from `apps/glass-fortress/backend` by
  absolute path. A stale worktree from an earlier run was already found there on 2026-09-03.
- KEEP tests are the tripwire: the conductor checks `git diff` on KEEP paths before any merge, by
  command, not by reading the summary.
- The destructive-DB hook, the lint ratchet and `CLAUDE.md` bind every session, subagents included.
- `gh` drifts to the wrong account mid-session; every push is preceded by the switch.

### 9.6 The pilot, and one undecided proposal

**The pilot is step 17**, the thesis acceptance suite: transcription from a signed-off contract, no
design risk, parallel by appendix section, and it exercises every guardrail above on real work. It
is judged by the one test the researcher already applies — were the reviewer's findings the ones
they would have relayed by hand — and by the measured throughput, before anything harder is
parallelised. After it, this section gains what the pilot changed.

**Proposed on 2026-09-03 and NOT decided:** cutting staging over early — running the rebuild's
steps 1–5 on staging before the evidence and thesis tracks, so they build against an empty database
on the target schema written as one baseline migration, instead of additive steps followed by a
drop. It removes the coexistence stretch on staging at the cost of the three marking walks' rules,
which §3's step 9 already sends with the database. It is the researcher's call and changes §3's
order if taken; it changes nothing in this section.
