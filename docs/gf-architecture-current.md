# The factual layer's article-rules architecture AS BUILT — 2026-09-02

**This describes the CODE AS IT STANDS, not the target.** The target is
`docs/gf-architecture-target.md`; the route between them is `docs/gf-refactor-plan.md`.

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

## 6. THE MCP SURFACE

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

All gated in `WRITE_TOOLS`. The marking page is a pure transformation: ruleset in, draft out, no
decision and no effect.

## 7. KNOWN DEFECTS IN THE CURRENT SHAPE

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
