# Interaction flows — researcher · MCP · backend · Wayback

**How the factual layer is actually USED, end to end.** Architecture is in
`docs/gf-architecture-target.md`; this is the sequence of acts, the tool at each step, and the state
each one changes.

It exists because a flow is the hardest thing to reconstruct from source: the code shows what each tool
does and never what happens between them, which is where the judgement lives.

> **STATUS.** The TARGET flows, decided 2026-09-02. ⚠️ marks what does not exist yet. Uncertainties are
> marked **OPEN** rather than smoothed over — an interaction nobody is sure about is the most expensive
> kind to guess at.

---

## THE TWO RESPONSIBILITIES, AND THE DIRECTION BETWEEN THEM

```
ACQUISITION    get bytes from the archive and keep them          maintenance act
CALIBRATION    decide what of a page is article text             research act
```

**ACQUISITION READS RULES. CALIBRATION WRITES THEM.** A one-way dependency, not an entanglement:
acquisition needs the current ruleset to decide which bodies to keep, and never needs a human.

**Acquisition therefore never stops for judgement.** If the rules are wrong, furniture leaks into
`text`, `textHash` changes on every capture, and it over-stores. That is the SAFE direction — and every
capture leaves an existence row regardless, so nothing is lost either way.

---

## FLOW 1 — SCANNING A URL THAT IS NEW TO THE CORPUS

### 1.1 Survey

| step | tool | state |
|---|---|---|
| researcher asks to scan a URL | — | — |
| Claude surveys the archive | ⚠️ `survey_wayback_captures(url)` | **none** |
| backend queries the CDX index | → Wayback CDX, one request | none |
| Claude reports count, span, how many held | — | — |

Its output is the WORK-LIST. A 40-capture page and a 3,400-capture page are different decisions and the
researcher sees the number before anything is spent.

### 1.2 Bootstrap — the one fetch that is not an acquisition

| step | tool | state |
|---|---|---|
| Claude opens calibration | `calibrate_article_rules(url)` | admits the `TrackedUrl`; opens a `CalibrationRun` |
| backend fetches the earliest capture | → Wayback replay | **NOT PERSISTED** |
| researcher marks furniture, hands back | the marking page | `CalibrationRun.draft` |
| researcher approves | ⚠️ `approve_article_rules` | `Rule` rows, `validFrom` = that capture's date; a decision |

**The first capture has no rules AND no predecessor.** This removes the first half: every acquisition
from here has rules. The bytes are discarded and re-fetched during the scan — free and idempotent, and
it avoids a second place a capture can live.

**A draft capture table was considered and rejected**: two shapes for one capture, with promotion logic
between them, is a second storage path for the most sensitive data in the system.

### 1.3 Acquisition

| step | tool | state |
|---|---|---|
| Claude starts the pass | ⚠️ `scan_captures(url, maxCaptures)` | opens a `ScanRun` ⚠️ |
| per CDX entry: fetch | → Wayback replay | — |
| record that it existed | — | **existence row: date, wayback timestamp, raw-bytes hash** ⚠️ |
| derive under rules valid for ITS date | — | — |
| keep the body if `textHash` is novel | — | `UrlSnapshot` bytes, hashes, `text`, `textHash`, `textExtractionVersion` |
| anchor | existing anchoring path | `documentHash` on chain |

**Bounded per call** so no tool call runs unwatched over thousands of captures. **It does not stop for
judgement** — see the note above.

**OPEN — the body-retention rule.** Existence rows are decided; bodies are kept by text-novelty, which
is what leaves acquisition reading rules. Raw-hash retention would remove the dependency and costs
~470 MB per 3,400-capture page. Not decided.

### 1.4 Calibration over stored captures

| step | tool | state |
|---|---|---|
| next stored capture in date order | ⚠️ `calibrate_next(runId)` | records `CAPTURE_SHOWN` |
| derive; compare with the PREVIOUS stored capture | `compareExtractions` | none |
| **any content changes sides** | — | → FLOW 2 |
| otherwise researcher marks or approves | marking page · ⚠️ `approve_article_rules` | `Rule` rows · a decision |

**The first stored capture has no predecessor**, so drift is undefined for it. Inherent, and harmless:
it is the capture the researcher marked during bootstrap.

### 1.5 Settling and automatic mode

After **n consecutive captures needing no correction**, the run becomes ELIGIBLE for automatic mode.

**Eligible, never automatic.** Drift detects a TRANSITION, not a STATE — two equally-broken consecutive
captures are silent, measured at match rate `0.07` — so a run that has not been watched cannot tell a
settled ruleset from a uniformly broken one.

| step | tool | state |
|---|---|---|
| run unattended | ⚠️ `calibrate_batch(runId, maxCaptures)` | `ScanDecision` progress ⚠️ |
| stops on a gate | — | → FLOW 2 |

**OPEN — `n`, and the periodic-check interval.** *"Derived from timeline size and max batch count"*,
formula undecided. No magic numbers.

---

## FLOW 2 — A STOP FOR JUDGEMENT

The gates, and none of them carries a threshold:

```
GATE 1   any content segment changes sides (either direction)
GATE 2   a rule that matched the previous capture matches nothing here
GATE 3   the batch reaches its bounded size
GATE 4   the periodic self-check interval elapses
```

| step | tool | state |
|---|---|---|
| batch stops, reports the DRIFTED TEXT | — | where it stopped |
| researcher looks at the capture | `open_article_capture` | records `CAPTURE_SHOWN` |
| **redesign** → mark and approve | marking page · ⚠️ `approve_article_rules` | `Rule` rows, `validFrom` = this date |
| **bad capture** → skip | ⚠️ `resolve_scan_stop(…, BAD_CAPTURE, reason)` | `CAPTURE_SKIPPED`, reason REQUIRED |
| resume | ⚠️ `calibrate_batch` | — |

**Both directions stop.** `kept → removed` is data loss; `removed → kept` is corpus pollution, because
`text` feeds `textHash` and every later capture then looks novel.

**A stop is a question, never a conclusion.** No detector may conclude a redesign.

**A skipped capture does not speak** — excluded from calibration AND from diffing, or a truncated page
manufactures a false "text removed" diff. **OPEN: unenforced, Level 5's.**

---

## FLOW 3 — CORRECTING A CORPUS ALREADY SCANNED

Same as 1.4 onward, with no acquisition: the captures are already stored.

| step | tool | state |
|---|---|---|
| open a run against stored captures | `correct_article_rules(url)` | opens a `CalibrationRun` |
| walk, compare, mark | as 1.4 | `Rule` rows with `validFrom` = the marked capture's date |

**New rules apply from their own date FORWARD.** Correcting against a 2024 capture does not change what
a 2020 capture extracted — that is what makes this safe to run at any time.

**It does NOT re-derive anything already stored.** See Flow 5.

---

## FLOW 4 — RESETTING A CALIBRATION

For a ruleset entangled past repair — not merely wrong.

| step | tool | state |
|---|---|---|
| draw the line | `reset_article_calibration(url, reason)` | `CalibrationReset` on the `TrackedUrl` |
| calibrate again | Flow 3 | new decisions govern; older ones stay and stop counting |

**Supersedes, never deletes.** Every decision stays readable; only its authority ends. Nothing survives
a reset. **OPEN: refuse a reset that supersedes nothing** — currently accepted silently.

---

## FLOW 5 — CHANGING A PAST EXTRACTION

**The only way, and it is deliberate.** A stored capture's text is what it was derived as; rules created
later never touch it.

Two reasons qualify — both are *"the stored text is UNTRUE"*, never *"the rules could be better"*:

1. the extraction PIPELINE was defective
2. an approval was WRONG

| step | tool | state |
|---|---|---|
| supersede | ⚠️ not built | a new derivation, **keeping the previous text** |

**OPEN — the whole flow.** Nothing implements it. `commit_article_rules` is RETIRED under this
architecture: with rules in force from creation, there is nothing to activate, and
`textExtractionVersion` already records which ruleset produced each capture's text.

---

## STATE, AND WHO MAY WRITE IT

| state | written by | never written by |
|---|---|---|
| `UrlSnapshot` bytes, hashes, existence rows | acquisition | the marking page |
| `text` / `textHash` / `textExtractionVersion` | acquisition, at record time | any later rule |
| `fullText` / `contentHash` | capture recording | **any ruleset — evidence identity cannot move** |
| `Rule` rows | approval, in the chat | acquisition |
| `CalibrationDecision` | the chat tools | the browser |
| `CalibrationRun.draft` | the marking page | — |
| `CalibrationReset` | the researcher, explicitly | any automatic path |
| on-chain anchor | the anchoring path, on raw bytes | never derived text |

**The marking page is a pure transformation: ruleset in, draft out. It decides nothing and applies
nothing.**

---

## WHERE WE ARE NOT SURE

Listed so a future session does not mistake silence for settlement.

- **Body retention** — existence rows are decided; whether bodies are kept by text-novelty (acquisition
  reads rules) or by raw hash (rule-free, ~470 MB per large page) is not.
- **`n`, and the periodic-check interval** — derived, not chosen, but the derivation is unwritten.
- **`ScanRun` versus `CalibrationRun`** — acquisition and calibration are separate passes over one
  timeline. Whether they share a run or hold two is not decided.
- **Rule expiry** — `RuleMatch` makes *"when did this stop matching"* answerable; how much silence
  justifies retiring a rule is unmeasured, and a number chosen now would be the magic number the gates
  exist to avoid.
- **Supersession (Flow 5)** — no tool, no shape, no test.
- **`SKIPPED` excluded from diffing** — required by this design, unenforced in Level 5.
