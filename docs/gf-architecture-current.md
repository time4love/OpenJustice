# The factual layer's article-rules architecture AS BUILT — 2026-09-02

**This describes the CODE AS IT STANDS, not the target.** The design is `docs/gf-interaction-flows.md`
and its reasoning is `docs/gf-architecture-target.md`; the route between this and them is
`docs/gf-refactor-plan.md`. §6 corrects this document's own earlier claims, §7 maps every target part
to the module that does the nearest thing today, and §8 tags every test.

It exists because the next change is a refactor of live, sensitive code, and a refactor session that
has to infer the current shape from the source will infer it wrong somewhere.

> **A NOTE ON VOCABULARY.** This document uses the word **era** because the code does. The researcher
> has ruled that term OUT of the domain language — it named an implementation detail, not a thing the
> research is about. The target document does not use it, and the refactor removes it.

---

## 1. WHAT A RULE IS TODAY

**A rule has no identity.** It is a CSS selector *string* inside an array.

```
CalibrationDecision.selectors   String[]   the FULL set in force after this decision
ArticleRuleset.rulesetId        String     chromeRulesetId(selectors) — a hash of the set
```

Consequences that shape everything else:

- **A selector cannot carry facts about itself.** No creation date, no creating capture, no author.
  Anything of that kind must be DERIVED by folding the decision log.
- **Changing one selector produces a different `ArticleRuleset` row**, because the id is a hash of the
  whole set. Anything keyed to that id is orphaned by any edit.
- **The log stores the full set, never a delta** — deliberate: *"a correction IS a new list, and a fold
  that replays deltas is a fold that can be replayed wrongly."*

## 2. THE DECISION LOG IS THE STATE

`CalibrationRun` holds no selectors. `CalibrationDecision` is append-only and `sequence` IS the
version. Every read folds the log.

| type | meaning | carries a capture? |
|---|---|---|
| `RUN_OPENED` | run created, seed selectors | no |
| `CAPTURE_SHOWN` | the system showed this capture; nothing judged | yes |
| `RULESET_CORRECTED` | the human changed the selectors | **yes, since 2026-09-01** |
| `CAPTURE_ACCEPTED` | under these rules, this capture is right | yes |
| `CAPTURE_REJECTED` | the RULES are wrong here | yes |
| `CAPTURE_SKIPPED` | the capture cannot be used; reason REQUIRED | yes |
| `ERA_BOUNDARY` | the researcher called this capture a redesign | yes |
| `RUN_CLOSED` | committed or abandoned | no |

`CalibrationReset` is an event on the **TrackedUrl**, not a decision: it ends the authority of
everything recorded before it. `governingEras` folds only decisions created after the newest reset.

## 3. HOW RULES REACH A CAPTURE

**Only at record time, and only since 2026-09-01.** Before that the ruleset applied to NOTHING (I16):
`recordCapture` derived with no ruleset, `activeArticleRulesetId` was written and never read, and
`commit_article_rules` reported `capturesRederived: <count>` for a re-derivation that did not happen.

```
recordCapture(input)
  → rulesetForCapture(trackedUrlId, snapshotDate, eras?)
      → governingEras(trackedUrlId)          committed runs' decisions + boundaries from any run
      → eraForDate(eras, date)               the latest era started by that date
  → deriveTextUnderRuleset(...)              affects text / textHash / textExtractionVersion ONLY
```

**`fullText` and `contentHash` are NOT touched**, so evidence identity cannot move. `textHash` is the
NOVELTY KEY, so the ruleset decides whether a capture is stored at all.

`textExtractionVersion` is `v3+chrome-<chromeRulesetId>` — it already records WHICH ruleset produced
the text, which is better than a foreign key because it also names the extraction version.

**Committing still re-derives nothing.** It versions the ruleset and sets it active; the tool says so.

## 4. ERAS, AS BUILT

> **RETIRED under the design.** Every mechanism below is deleted with its tests — §7, rows "rules in
> force" and "eras, detectors, sampling". It is described here so a reader who meets `deriveEras` in
> the source knows what it was for.

Derived, never stored — no table, no range columns, no status flag:

| what a table would hold | how it derives |
|---|---|
| validity range | `ERA_BOUNDARY` decisions, each naming a capture with a date |
| the era's ruleset | the last decision's selectors in that log segment |
| confirmed | `CONFIRM_AFTER_CLEAN` (3) consecutive judged captures needing no correction |
| frozen | the same predicate as confirmed |

**A boundary carries the previous rules forward UNCHANGED.** `resolve_era_boundary` supplies no
selectors; `appendCalibrationDecision` copies `current.selectors` for every non-correction decision.

**Segments are assigned BY LOG POSITION, not by capture date.** Correct only while the researcher walks
strictly forward. Recording a boundary out of order silently mis-files later corrections — a known
sharp edge, unguarded.

## 5. THE SIGNALS THAT EXIST

| module | signal | state |
|---|---|---|
| `eraDetectors` | match rate (under-match) · kept-length vs a baseline (over-match) | built, **thresholds forbidden in `src/` by a source scan** |
| `extractionDrift` | kept→removed · removed→kept, against the PREVIOUS capture | built, **no caller** |
| `claimSurvival` / `rulesetSurvival` | did an accepted capture lose text when the ruleset changed | built, no steady-state caller |
| `nextCapture` | maximin/bisect sampling policy | **superseded by the sequential walk; not retired** |

`segments()` in `claimSurvival` is shared and drops any line with no letter or digit — measured, after
69 single bullets swamped the first real drift run.

## 6. WHAT THE CODE ACTUALLY DOES, WHERE THE EARLIER DRAFT WAS WRONG

- **`calibrate_article_rules` fetches nothing.** It admits the URL and opens a run; that is all. The
  marking page loads captures only from `UrlSnapshot`, by id. "Marks against freshly fetched pages" is
  a docstring, not a path. No bootstrap of any kind exists.
- **The wayback-timestamp identity is modelled and never written.** `CalibrationDecision` and
  `RulesetObservation` allow it and `requireObservationSubject` enforces exactly one; every caller
  passes a snapshot id. The draft is snapshot-id only.
- **`CdxIndexEntry` is already the existence row.** Keyed by page, timestamp and digest; statuses
  STORED · UNCHANGED · UNSERVABLE · UNFETCHED; links to the snapshot it became; records what an
  UNCHANGED verdict was compared against; written by `recordCdxObservation` on every CDX query. The
  earlier draft proposed a second table beside it.
- **Admission sets `TrackedUrl.status = SCANNING` whoever calls it**, including calibration, which
  scans nothing. The MCP callers pass no `submitterId`, so an admission from the chat is unattributed.
  `UNCLEAR` is a verdict in the enum that no path can produce.
- **`reconcileAgainstCdx` re-derives text IN PLACE, with the rule-free extractor**, via a raw SQL
  update of `text` and `textExtractionVersion`, when the stored extraction version is behind. Under the
  target that is a versioned supersession under the rules in force; today it is an overwrite that
  ignores rules. Its "superset check" — text moved while bytes did not — is the re-walk's comparison
  against a capture's own previous text.
- **`start_forensic_scan` is fire-and-forget with an in-memory guard.** No durable run state, a
  restart loses a run.

The MCP surface as registered today, all gated in `WRITE_TOOLS`:

```
calibrate_article_rules      new URL, marks against freshly fetched pages
correct_article_rules        URL in the corpus; ALWAYS opens a new run
get_article_rules            run state, coverage, stale selectors
next_article_capture         maximin recommendation          ← superseded
open_article_capture         deep link + records CAPTURE_SHOWN
judge_article_capture        promotes the draft, then records the verdict
resolve_era_boundary         REDESIGN | BAD_CAPTURE
reset_article_calibration    ends the authority of a URL's calibration
check_ruleset_survival       re-derive accepted captures under the current rules
commit_article_rules         version the ruleset, set it active
abandon_article_rules        close without applying
```

Admission (`admitUrl`) is invoked from five places, always as a side effect: `calibrate_article_rules`,
`start_forensic_scan`, `enrich_evidence_with_history`, `forensicsRoutes`, `WaybackScraper`. There is no
tool that simply admits a URL, and `correct_article_rules` does not admit at all.

## 7. THE MODULE MAP — WHERE EACH TARGET PART LIVES TODAY

Every row below was read from source in the session that wrote it. Verbs: REUSE (import as-is) ·
TRANSFORM (same module, changed contract) · BUILD (nothing to reuse) · RETIRE (deleted with its
tests, in the step that retires the concept). A REUSE is a claim the acceptance suite proves, not
this table.

| target part | legacy modules | verb | notes |
|---|---|---|---|
| survey: CDX query, the work-list | `WaybackScraper.getSnapshotsList` / `queryCdxIndex` (paging, retries), `recordCdxObservation` (UNFETCHED rows via `createMany`, the `CdxQuery` row), `backfillCdxIndex` (links existing snapshots by timestamp and digest) | TRANSFORM | the writer is the survey; add attributed `TrackedUrl` creation and the byte-distinct count; `backfillCdxIndex`'s linking is the legacy join |
| the work-list row | `CdxIndexEntry`, `markCdxEntryStored` / `markCdxEntryUnservable` / `markCdxEntryUnchanged` | TRANSFORM | add IDENTICAL, PENDING_JUDGEMENT, SKIPPED, held body, ruleset, text hash, stop gate, reason, digestVerified; the digest leaves the unique key |
| fetch | `archiveHttp`: `fetchCaptureBytes`, `rawCaptureUrl` (`id_`), `withRetry`, `isTransientWaybackError`, `WaybackFetchError`; `WaybackScraper.scrapeSnapshotReadings` (bytes, content type, encoding from one fetch) | REUSE | raw fetch, the transient/durable distinction and the payload headers all exist |
| derive | `chromeRulesetApply.deriveTextUnderRuleset`, `chromeRuleset` (the ruleset id), `captureDocument.deriveText` (the empty case), `textSegments` | REUSE | only the caller changes |
| rules in force | `rulesetForCapture` (`governingEras`, `rulesetForCapture`), `calibrationFold` (`deriveEras`, `eraForDate`, `selectorsForDate`, `selectorAnchors`, `CONFIRM_AFTER_CLEAN`) | RETIRE | replaced by RULES_IN_FORCE over `Rule` rows |
| Gate 1 | `extractionDrift.compareExtractions`, `claimSurvival.segments` | REUSE | exactly Gate 1; no production caller today; `measureEraDetectors` is its only importer |
| Gate 2, `RuleMatch` | `RulesetObservation.matchCounts`, `calibrationRun.findStaleSelectors`, `recordRulesetObservation` | TRANSFORM | keyed to the rule, not the ruleset hash (I12) |
| Gate 4, SEEN, TRUST | — | BUILD | folded from the log |
| Gate 5 | `diffChunking.diffChunkPair` + `classifierInputChunks`, `ForensicAgent.analyzeChange`, `recordDiff` (upsert keyed on the capture pair; Level 5's `computeDiffSurvival` at write) | REUSE all four; TRANSFORM the order | classify before storing; `recordDiff` requires both snapshot ids, so the diff row is written the moment the capture is acquired, carrying the verdict already in hand |
| store and anchor | `recordCapture` (the create path, `registerSnapshotOnChain`), `anchorSnapshots`, `anchoredCaptureHash` | REUSE the storage and anchoring; RETIRE the novelty decision inside it | the hardest seam: `recordCapture` derives, decides novelty against the predecessor, stores and anchors in one call; the walk needs only store-and-anchor |
| the log | `CalibrationRun` / `CalibrationDecision` / `CalibrationReset`, `calibrationRun.ts` (`sequencedWrite`, `appendCalibrationDecision`, `readCalibrationRun`) | TRANSFORM | re-homed to the page; keep the unique-index compare-and-set; `researcherId` per row; new types |
| `Rule` rows | — (selectors live inside decisions; `ArticleRuleset` is a hash of the set) | BUILD | |
| the draft | `CalibrationRun.draft*`, `saveCalibrationDraft` / `readCalibrationDraft` / `discardCalibrationDraft` | TRANSFORM | onto `TrackedUrl`; gains `trusted[]` |
| marking page | `ArticleRulesClient.tsx` (1,601 lines, one route base), `captureMarking.ts` (`loadCaptureForMarking`, `previewUnderSelectors`), `articleRulesRoutes.ts` (nine routes) | TRANSFORM | page-scoped routes; bytes from the held body or the snapshot; approve-as-is and trust affordances; the `rules=0` line |
| `approve_article_rules` | `commitCalibrationRuleset`, `ensureArticleRuleset`, the judge handler | BUILD | one transaction: Rule rows, RULE_ENDED, RULE_TRUSTED, CAPTURE_ACCEPTED |
| `resolve_scan_stop` | `resolve_era_boundary`'s BAD_CAPTURE branch | TRANSFORM | |
| reset | `reset_article_calibration`, `CalibrationReset` | TRANSFORM | a RESET decision plus RULE_RETIRED per rule; refuses when nothing to retire |
| re-walk, STALE, `TextVersion` | `reconcileAgainstCdx` | RETIRE | in-place, rule-free overwrite; its superset check becomes the re-walk's own-previous-text comparison. `rehashDocuments` is a finished one-off repair and is outside this layer |
| admission | `admitUrl`, `ScanRelevanceAgent`, `recordUrlAssessment`, `fetchContentForRelevanceCheck`, `ScanRelevanceAssessment`, the five callers | RETIRE | the source scan in `urlAdmission.test.ts` becomes: only the survey creates a `TrackedUrl` |
| the scan job | `WaybackScraper.processJob` / `runFullScan` / `createJob` / `analyzePageHistory`, `WaybackScrapeJob`, `start_forensic_scan` | RETIRE | replaced by `scan_captures`; the in-memory guard goes with it; the eight `recordDiff` call sites collapse to one |
| gap fill | `recoverMissingCaptures` | RETIRE | the walk fills gaps by construction |
| eras, detectors, sampling | `eraDetectors`, `nextCapture`, `timelineSample`, `rulesetSurvival`, `claimSurvival.compareKeptText` / `attributeRemoval`, `runCoverage` | RETIRE | `measureEraDetectors` stays as a script until the three measurements are taken, then goes |
| the diff preview | `previewDiffClassification` | untouched | a read-only re-run of the classifier; not on the walk's path |
| MCP surface | `mcpServer.ts` registrations, `mcpRoutes.WRITE_TOOLS`, `mcpToolClassification.test.ts` | TRANSFORM | five writes and two reads; the classification test's expected set changes with them |

## 8. THE TEST INVENTORY — WHAT EACH FILE ASSERTS, AND WHAT BECOMES OF IT

Three tags, and the rule behind them. **KEEP**: asserts an invariant or a reused contract; stays
untouched and must stay green on every step. **REWRITE**: the concept survives with a changed shape;
the file is rewritten to the flows appendix in the step that changes the shape. **RETIRE**: asserts a
retired concept; deleted in the same commit as the code it tests, never weakened to pass. A file can
split: its groups are tagged separately below.

| test file | lines | tag | what it holds |
|---|---|---|---|
| `anchorSnapshots` | 370 | KEEP | the anchoring path, twin recovery, the write path owns anchoring |
| `anchoredCaptureHash` | 202 | KEEP | one rule names the anchored hash; a superseded hash is its own answer |
| `documentHashSingleRule` | 129 | KEEP | every `documentHash` write routes through `sha256Bytes` |
| `evidenceIdentityDrift` | 98 | KEEP one group, RETIRE-AT-11 one group | one Readability construction stays; "one evidence hash function" is `create_evidence_from_text`'s url+text formula and goes with it at refactor step 11 — amended 2026-09-05 (document refactor plan §5) |
| `directProvenanceUnused` | 91 | KEEP until document step 36, then RETIRE | `DIRECT` has no writer — now a design statement, not only a fact; at step 36 `DIRECT` leaves the enum and the retired-names scan holds its absence, subsuming this file — amended 2026-09-05 (document refactor plan §5) |
| `liveArchiveObservers` | 122 | KEEP | live observers never read our record; no CDX-shaped column on `UrlSnapshot` |
| `extraction/documentOutline` | 451 | KEEP | the outline, selector choice, `inertDocument` |
| `extraction/emptyRulesetDerivation` | 36 | KEEP | an empty ruleset derives what no ruleset does |
| `extractionDrift` | 149 | KEEP | Gate 1's contract, exactly; add cases for A4's set semantics if any are missing |
| `previewDiffClassification` | 396 | KEEP | writes nothing; off the walk's path |
| `thesisClaimAudit` | 464 | KEEP | reads captures; unaffected |
| `mcpToolClassification` | 157 | KEEP | the assertions stay; the expected set changes in the switch step |
| `extraction/chromeRuleset` | 323 | KEEP, one group RETIRE | derivation, removal attribution, ruleset identity, malformed selectors all stay; "the removal fraction — four readers" goes with `RulesetObservation` |
| `extraction/recordCapture` | 499 | KEEP three groups, REWRITE two | payload, provenance, anchoring and the race stay; "decides novelty in one place" and "derives under the era" are rewritten: novelty and RULES_IN_FORCE belong to the walk |
| `WaybackScraper` | 907 | KEEP four groups, RETIRE two | `getSnapshotsList`, `scrapeSnapshot`, `isWaybackOffline`, `isTransientWaybackError` stay; `processJob` and `analyzePageHistory` go with the scan job |
| `recordCdxObservation` | 190 | REWRITE | append-only observation and the UNCHANGED-records-its-predecessor rule survive; the digest-in-key and the four-status vocabulary become the seven outcomes |
| `unchangedNoDiff` | 76 | REWRITE | a source scan over eight diff sites becomes a scan over one, in the walk |
| `articleRulesRoutes` | 255 | REWRITE | page-scoped routes; "the UI writes decisions" group is retired, the browser writes only the draft |
| `calibrationRun` | 804 | REWRITE four groups, RETIRE two | the fold, the compare-and-set, one-identity, skip-needs-reason survive on the page log; the stopping indicator and its streaks, and the null check on the ruleset hash, go |
| `resetArticleCalibration` | 95 | REWRITE | a RESET decision plus RULE_RETIRED; refuses when nothing to retire; "era boundaries did not survive" goes |
| `urlAdmission` | 95 | REWRITE | the source scan becomes: only the survey creates a `TrackedUrl` |
| `mcpIntegration` | 526 | KEEP two groups, RETIRE two; the KEEP groups MOVE at document step 36 | write-tool auth and evidence creation stay; "ADMITS the URL" and the `start_forensic_scan` group go; the file mocks `IntakeAgent` by path, which step 36 deletes, so the two KEEP groups move to a file without the mock — amended 2026-09-05 (document refactor plan §5) |
| `mcpTools` | 1,941 | KEEP, small RETIRE | unrelated handlers stay; any scan or calibration assertions go |
| `recoverMissingCaptures` | 249 | RETIRE, one assertion migrates | "keeps every row, reverts included" moves to the survey's tests |
| `reconcileAgainstCdx` | 258 | RETIRE, one assertion migrates | the superset check moves to the re-walk's own-previous-text comparison |
| `articleRuleTools` | 976 | RETIRE, one group REWRITE | five retired tools; `get_article_rules` is rewritten to A5 |
| `calibrationEras` | 118 | RETIRE | the era fold |
| `eraDetectors` · `eraDetectorsUnmeasured` | 152 | RETIRE | the detectors and their threshold scan |
| `nextCapture` · `timelineSample` | 194 | RETIRE | the sampling policy |
| `rulesetForCapture` | 253 | RETIRE | `governingEras`; the "reset ends authority" assertions are re-expressed against AUTHORITY on the page log |
| `rulesetSurvival` · `claimSurvival` | 238 | RETIRE, one group migrates | `segments` cases move under `extractionDrift` |
| `resolveEraBoundary` | 131 | RETIRE | `ERA_BOUNDARY`; the BAD_CAPTURE assertions are re-expressed against `resolve_scan_stop` |
| `admitUrl` · `urlAssessment` · `forensicsScanRelevance` | 595 | RETIRE | admission and its table |

**NEW — the acceptance suite, written FIRST from the flows appendix and failing until the walk
reaches it:** A3's derivations as pure functions over fixtures; A4's five gates, one file each, with
the RESOLVED skip and the re-walk's own-previous-text case; A5's seven tools, every refusal named;
A6's five routes; A7's transaction and STALE_SEQUENCE; the target doc's ten invariants; and the
source scan for retired names (`era`, `calibrationRunId`, `admitUrl`, every retired tool) with a decoy
proving it is not vacuous.

**The arithmetic, so the size of the job is stated:** 37 files, 11,383 lines touch this layer.
Roughly 3,000 lines KEEP untouched, 2,400 REWRITE, 4,000 RETIRE outright, and the rest split.

## 9. KNOWN DEFECTS IN THE CURRENT SHAPE

- **I12** — `lastMatchedAt` resets on every correction, because `RulesetObservation` is keyed to
  `articleRulesetId` and any edit produces a new one. **Do not act on the stale-selector list.**
- **I16** — the ruleset was inert until 2026-09-01; `commit_article_rules` claimed a re-derivation it
  never performed. The claim is withdrawn; the behaviour is unbuilt.
- **Anchors for pre-2026-09-01 decisions are RECOVERED, not recorded**, and the recovery has been wrong
  in both directions. Anything relying on a legacy anchor is measuring the recovery.
- **A short calibration can never confirm** — the streak asks for 3 and an era may hold 2 captures.
- **Opening a marking URL directly records no `CAPTURE_SHOWN`**, so `capturesShown` undercounts and any
  inference keyed on "what was on screen" has a hole in it.
- **`judge_article_capture` accepts a verdict on an EMPTY ruleset silently** — recorded twice in one
  session, and a third would have confirmed a calibration with no rules in it.
- **`reset_article_calibration` accepts a reset that supersedes nothing.**
- The `next` hint after a correction always says to run the survival check, including when there is
  nothing behind the capture to damage.
