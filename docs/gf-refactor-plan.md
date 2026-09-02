# Refactoring the article-rules layer — 2026-09-02

**From** `docs/gf-architecture-current.md` **to** `docs/gf-architecture-target.md`.
**How it is used, step by step:** `docs/gf-interaction-flows.md`.

This is harder than building the target on clean ground, and the reason is worth stating before any
step: **the code being changed is live, its data is real research, and the layer it feeds decides
whether a capture is stored at all.** `text` → `textHash` → novelty → whether a row exists. A refactor
that gets extraction wrong does not produce wrong text; it produces a corpus with holes.

---

## THE ORDER, AND WHY IT IS THIS ORDER

Each step leaves the system working. **No step depends on a later one to be correct.**

### 1 · `Rule` and `RuleMatch` tables, written but not yet read

Additive migration. Backfill `Rule` rows from the distinct selectors of each URL's decisions, with
`validFrom` derived by the existing fold.

**The backfill is imperfect and must SAY so.** Anchors for decisions written before 2026-09-01 are
RECOVERED, and the recovery has been wrong in both directions. Mark backfilled rules as
`anchorRecovered` so nothing downstream treats a reconstructed date as a recorded one.

*Leaves working:* everything. Nothing reads the tables yet.

### 2 · Write `Rule` rows on every correction, and `RuleMatch` on every derivation

The tables become authoritative for new work while the old path still drives behaviour.

*Leaves working:* everything. Now there is real data to verify step 3 against.

### 3 · Derive using `validFrom`, replacing `governingEras`

`rulesetForCapture` selects rules by `validFrom ≤ snapshotDate` instead of folding partitions.

**Verify by re-deriving, not by reading code.** For every stored capture, the new path must produce the
same `textHash` as the old one wherever the partitioned model and date-scoping agree — and the
measurement instrument already reports both side by side.

*Leaves working:* extraction, on a simpler path.

### 4 · `RuleMatch` supersedes `RulesetObservation` for staleness — **closes I12**

`lastMatchedAt` stops resetting, because a match is keyed to a rule rather than to a hash of the whole
set. The stale-selector list becomes readable for the first time.

*Leaves working:* everything, and one long-standing lie stops being told.

### 5 · The previous-capture comparison becomes the scan's signal

`extractionDrift` has no caller today. Give it one: the sequential pass holds the previous capture's
extraction and compares.

**Gate 1 is any content segment changing sides.** No threshold.

*Leaves working:* everything; the signal is reported before it is allowed to stop anything.

### 6 · `ScanRun` / `ScanDecision`, and the bounded batch

Durable run state is a PRECONDITION for a batch that yields to a human: a batch that stops must know
where it got to. Also retires `start_forensic_scan`'s in-memory guard, which loses a run on restart.

*Leaves working:* everything. Scanning becomes resumable.

### 6b · Split acquisition from calibration

Acquisition gets bytes and keeps them; calibration decides what is article text. **Acquisition READS
rules and never writes them**, and **STOPS on the gates from the second stored capture onward** —
because every stored row produces a diff and every diff is a PAID classifier call, so acquiring under
broken rules is the explosion this level exists to prevent, not a safe over-storing. It detects and
YIELDS; calibration resolves.

**Every fetch leaves a RECORD** — date, wayback timestamp, raw-bytes hash — so a capture the rules dropped
is an unexplained gap Wayback can refill rather than an untrue silence. While a judgement is owed the
record also holds the bytes, which is how a halted capture reaches the marking page without a derivation
being claimed for it. That is §2's
*"storage is lossless"* finally holding, and it is what makes the split possible at all.

*Leaves working:* everything. Acquisition becomes runnable independently of the calibration refactor,
which makes the sensitive part of this work smaller.

### 7 · The tool surface

```
resolve_era_boundary   →  the same binary question, renamed, creating nothing structural
next_article_capture   →  deleted; the walk is sequential
check_ruleset_survival →  deleted; nothing re-derives the past
commit_article_rules   →  DELETED; rules are in force from creation, so there is nothing to activate
activeArticleRulesetId →  deleted; written and never read, and now meaningless
ERA_BOUNDARY           →  removed from the decision enum
```

**Deletion is a step, not a side effect.** A superseded tool left in place is one a future session will
call.

### 8 · Vocabulary

`era` out of identifiers, comments, tool text and docs. Left last **on purpose**: renaming before the
behaviour settles produces a diff nobody can review, and the word is harmless while it is still true of
the code.

---

## WHAT MUST NOT BREAK, AND HOW EACH IS HELD

| invariant | how it is held |
|---|---|
| `fullText` / `contentHash` untouched by rules | `deriveTextUnderRuleset` returns `text`/`textHash`/`textExtractionVersion` only — a test asserts the shape |
| a past extraction changes only by supersession | recording derives; committing versions and re-derives nothing |
| the log stays append-only | no step edits or deletes a decision |
| the marking page decides nothing | it returns a draft; the chat records |
| storage stays lossless | no step lets a rule decide whether bytes are kept |
| `SKIPPED` means the capture does not speak | and must be excluded from **diffing** — Level 5, still unenforced |

## THE HAZARDS, NAMED

- **`textHash` is the novelty key.** Any change to derivation changes which captures are considered new.
  Verify against stored captures before it reaches a scan.
- **Legacy anchors are unreliable.** Step 1's backfill reconstructs them; steps 3 and 4 must not present
  a reconstructed date as a recorded one.
- **The jsdom boundary.** `chromeRulesetApply` is ESM-only; a static import drags it into every unit
  suite that touches the module. It has broken the suite twice. Use the dynamic-import pattern.
- **Two lint ratchets** rule out both spellings of an indexed read; `.at()` is the answer, and neither
  ratchet is ever raised.
- **Do not run `lint:ratchet --update` locally** — the local pass under-reports type-aware rules.
- **Migrations self-apply** on deploy. Run `db:check-drift` before writing one and read the generated
  SQL before committing it.

## THE DATA AS IT STANDS

```
news.walla.co.il/item/3403847
  run cmthqbikb003jbm4o3zbr8hlm   SUPERSEDED by a reset, 43 decisions, entangled, legacy anchors
  run cmtjip3b90003qgwxrwym97n0   OPEN, 42 rules, anchors CORRECT, 4 of 7 captures judged
                                  redesigns recorded at 2021-06-12 and 2022-05-23
corona.health.gov.il/vaccine-for-covid/
  run cmthffvwu0001xlvibn62hc1r   OPEN, 9 rules, 83 captures, 8 of 9 matching for 4.2 years
```

**Nothing has ever been committed on any run**, so no ruleset is in force for any URL and no capture's
text has been derived under one outside a scan started after 2026-09-01.

## WHAT IS ALREADY MEASURED, SO IT IS NOT RE-DERIVED

- Drift is **0 to 1 segments** across a stable stretch and **129 segments / 1,704 characters** at a real
  break. That gap is why Gate 1 needs no threshold.
- Date-scoping's match-rate benefit **decays forward to nothing**, and a partitioned model decays
  identically. Neither fixes forward dilution.
- The union caused **no measured harm**: nothing added after a capture's approval removed text from it.
- A rule marked against one structure does not match another — three hash generations of the same
  header across four years on one page.

→ `docs/gf-era-detector-thresholds-2026-09-01.md`, `docs/gf-level4-mcp-loop-verification-2026-09-01.md`
