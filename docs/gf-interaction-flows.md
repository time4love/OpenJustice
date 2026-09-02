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

## THE FOUR ACTORS, AND WHICH SURFACE EACH USES

```
researcher   the human. Marks in a browser; pastes commands into the chat.
Claude       the orchestrator. Calls MCP TOOLS only — never an HTTP route.
browser      the marking page. Calls the BACKEND'S HTTP ROUTES directly,
             under /api/article-rules — it never goes through Claude or MCP.
backend      the services. Reaches WAYBACK for CDX and replay; writes the database
             and the chain.
```

**The browser's direct line to the backend is the only path that bypasses Claude**, and it is the
reason the marking page can be a pure transformation: it reads a capture, previews selectors, and hands
back a draft. It records no decision and applies no effect.

---

## THE TWO RESPONSIBILITIES, AND THE DIRECTION BETWEEN THEM

```
ACQUISITION    get bytes from the archive and keep them          maintenance act
CALIBRATION    decide what of a page is article text             research act
```

**ACQUISITION READS RULES. CALIBRATION WRITES THEM.** One direction, not an entanglement: acquisition
needs the current ruleset to decide which bodies to keep, and never creates one.

**ACQUISITION STOPS ON THE GATES, FROM THE SECOND STORED CAPTURE ONWARD.** Acquiring under broken rules
is not a harmless over-storing: every stored row produces a diff and every diff is a PAID classifier
call, so a 3,400-capture page yields thousands of spurious rows and thousands of paid calls — the
explosion this level exists to prevent. From the second stored capture the signal is available, because
the previous capture's extraction is held.

**It does not JUDGE — it detects and YIELDS.** So it needs no human to PROCEED and a human to RESOLVE A
STOP, which is what keeps the two responsibilities apart while letting the pass halt.

**The one capture that cannot be checked is the first stored one**, which has no predecessor. That is
what the bootstrap exists for: a human has already looked at that page.

---

## FLOW 1 — SCANNING A URL THAT IS NEW TO THE CORPUS

### Phase 0 — survey

**Before anything is fetched, stored or spent.** It happens the moment a researcher names a URL, and
answers one question: how big is this job? Nothing else in the flow can be sized without it.

```
researcher   "scan https://example.gov.il/page"
Claude       → survey_wayback_captures(url)                            ⚠️ to build
backend      → Wayback CDX index — ONE request, no page fetches
             ← 3,412 captures · 2019-03 → 2026-08 · we hold 0
Claude       reports the size; the researcher decides whether to start

STATE        nothing written
```

Its output is the WORK-LIST. A 40-capture page and a 3,400-capture page are different decisions, and
the researcher sees the number before anything is spent.

### Phase 1 — bootstrap, the one fetch that is not an acquisition

**Once per URL, and only while no rules exist.** Its whole purpose is to put a page in front of a human
so that rules can come into being — nothing can be derived, compared or judged until they do. The page
it fetches is deliberately never stored.

```
── CALIBRATION ONLY · nothing is acquired ────────────────────────────
Claude       → calibrate_article_rules(url)
backend      admits the TrackedUrl · opens a CalibrationRun
             → Wayback replay: fetch the EARLIEST capture
             ← bytes, held in memory and NOT PERSISTED
             ← marking URL
Claude       hands the researcher the marking URL and the command to paste back
researcher   opens the marking URL in a browser
browser      → GET  /api/article-rules/:runId/captures/:snapshotId
             ← the capture, inert, plus its outline
browser      → POST /api/article-rules/:runId/captures/:snapshotId/preview
                    { selectors }                      on every edit, PURE, stores nothing
             ← keptText · removedText · removedSegments · matchCounts
researcher   marks furniture, presses שמור טיוטא חדשה של חוקי חילוץ הטקסט
browser      → PUT  /api/article-rules/:runId/draft
                    { snapshotId, selectors, returned: true }
researcher   pastes into the chat:  approve_article_rules runId=… snapshotId=…   ⚠️ renamed
Claude       → approve_article_rules(runId, snapshotId)                MCP
backend      promotes the draft → Rule rows, validFrom = THIS capture's date   ⚠️ new table
             records the acceptance
             ← the rules now in force · coverage

STATE        TrackedUrl admitted · CalibrationRun · draft · Rule rows · one decision
NOT WRITTEN  no UrlSnapshot — the bootstrap bytes are discarded
```

**The first capture has no rules AND no predecessor.** Bootstrapping removes the first half, so every
acquisition after it has rules — no special case in the path that decides corpus membership.

The capture is re-fetched during the walk: free, idempotent, and it keeps a capture to ONE shape. A
draft capture table would be a second storage path for the most sensitive data in the system, with
promotion logic between the two.

### Phase 2 — the walk, one capture at a time

**The main body of the work, and where the researcher's attention is spent.** One capture at a time, in
date order, each one fetched, kept, derived and compared with the one before it. It continues until the
rules stop needing correction — which is not a fixed number of captures but a property of the page.

```
── ACQUISITION ───────────────────────────────────────────────────────
Claude       → scan_next_capture(runId)                                ⚠️ to build
backend      → Wayback replay: fetch the next capture in DATE order
             ← bytes
             writes an EXISTENCE ROW: date, wayback timestamp, raw-bytes hash   ⚠️ new
             derives text under the rules whose validFrom ≤ THIS capture's date
             keeps the body when textHash is novel → UrlSnapshot + anchor
             compares this extraction with the PREVIOUS stored capture's
             ← what was removed · drift, if any · the marking URL
Claude       reports; if nothing needs correcting, straight to the next capture

── CALIBRATION · only when the researcher corrects ───────────────────
Claude       hands over the marking URL and the command to paste back
researcher   opens the marking URL in a browser
browser      → GET  /api/article-rules/:runId/captures/:snapshotId
             ← the capture, inert, plus its outline
browser      → POST /api/article-rules/:runId/captures/:snapshotId/preview
                    { selectors }                      on every edit, PURE, stores nothing
             ← keptText · removedText · removedSegments · matchCounts
researcher   marks furniture, presses שמור טיוטא חדשה של חוקי חילוץ הטקסט
browser      → PUT  /api/article-rules/:runId/draft
                    { snapshotId, selectors, returned: true }
             ← the draft, handed back
researcher   pastes into the chat:  approve_article_rules runId=… snapshotId=…
Claude       → approve_article_rules(runId, snapshotId)                MCP
backend      promotes the draft → Rule rows, validFrom = THIS capture's date · a decision
             ← the rules now in force · coverage

STATE        existence row ALWAYS · UrlSnapshot + on-chain anchor when kept
             Rule rows + a decision ONLY when the researcher corrected
```

**The two alternate here, capture by capture** — which is what makes the separation easy to miss. It is
a separation of AUTHORITY, not of distance in time: acquisition may write bytes and never rules;
calibration may write rules and never bytes. In Phase 3 the same boundary holds while acquisition runs
for hundreds of captures between one calibration and the next.

**The first STORED capture has no predecessor**, so drift is undefined for it — inherent, and harmless:
it is the page the researcher just marked in Phase 1.

### Phase 3 — the ruleset settles, and the batch grows

**Reached when n consecutive captures have needed no correction.** The same loop, in larger steps and
without a human watching each one — the point at which a 3,400-capture timeline stops requiring 3,400
judgements. It ends the moment any gate fires, and returns to Phase 2 for that capture.

```
── ACQUISITION ONLY, until a gate fires ──────────────────────────────
after n consecutive captures needing NO correction:
Claude       → scan_batch(runId, maxCaptures)                          ⚠️ to build
backend      loop, per capture:  fetch → existence row → derive → store if novel
                                 → compareExtractions(previous, current)
                                 → check the gates
             stops on: content changing sides · a rule that matched
                       the previous capture matching nothing here ·
                       batch bound · the periodic self-check
             ← where it got to, WHY it stopped, and the DRIFTED TEXT

STATE        as Phase 2, per capture · ScanRun progress, durably       ⚠️ to build
```

**Eligible, never automatic.** A run does not start batched: drift detects a TRANSITION, not a STATE, so
two equally-broken consecutive captures are silent and an unwatched run cannot tell a settled ruleset
from a uniformly broken one.

**The batch is bounded even when nothing fires**, and the periodic self-check is the system asking to be
looked at — deliberately, because the blind spot above is real.

### Phase 4 — completion

**When the timeline is exhausted, or the researcher stops.** There is nothing to finalise: every rule
has been in force since the moment it was created, and every capture was derived under the rules valid
for its own date as it was stored.

```
timeline exhausted, or the researcher stops
backend      nothing to commit — rules were in force from the moment they were created
             textExtractionVersion on each capture already records which ruleset
             produced its text

STATE        nothing further written
```

**There is no commit step.** `commit_article_rules` is retired: with rules in force from creation there
is nothing to activate.

---

## FLOW 2 — A STOP FOR JUDGEMENT

**The only place a human is required, and the only place a judgement is made.** It happens whenever a
gate fires — from the one-at-a-time walk or from a batch, and the gates are the same either way. The
pass has noticed that something changed; it cannot know WHAT, and does not try.

None of the gates carries a threshold:

```
GATE 1   any content segment changes sides, EITHER direction
GATE 2   a rule that matched the previous capture matches nothing here
GATE 3   the batch reaches its bounded size
GATE 4   the periodic self-check interval elapses
```

```
── ACQUISITION YIELDS ────────────────────────────────────────────────
backend      stops at a capture and reports WHY, with the DRIFTED TEXT
             ← the segments themselves, not a count
Claude       shows them and puts ONE binary question
researcher   → open_article_capture(runId, snapshotId)     [if they want to look]
backend      records CAPTURE_SHOWN
             ← the capture, the rules, what they remove

── CALIBRATION ANSWERS · one of two ──────────────────────────────────

REDESIGN     researcher   opens the marking URL, marks, presses שמור טיוטא…
             browser      → GET  /api/article-rules/:runId/captures/:snapshotId
                          → POST …/captures/:snapshotId/preview  { selectors }   per edit
                          → PUT  /api/article-rules/:runId/draft
                                 { snapshotId, selectors, returned: true }
             researcher   pastes:  approve_article_rules runId=… snapshotId=…   ⚠️ renamed
             Claude       → approve_article_rules(runId, snapshotId)             MCP
             backend      Rule rows, validFrom = THIS capture's date · a decision
                          ← the rules now in force · coverage
                          → back to the one-at-a-time walk until the rules settle again

BAD CAPTURE  researcher   pastes:  resolve_scan_stop runId=… snapshotId=…
                            BAD_CAPTURE reason=…                                ⚠️ renamed
             Claude       → resolve_scan_stop(runId, snapshotId, BAD_CAPTURE, reason)
             backend      CAPTURE_SKIPPED, reason REQUIRED
                          → the batch resumes from the next capture

STATE        CAPTURE_SHOWN if looked at · then EITHER Rule rows + a decision
             OR a CAPTURE_SKIPPED carrying its reason
```

**Both directions stop.** `kept → removed` is DATA LOSS; `removed → kept` is CORPUS POLLUTION, because
`text` feeds `textHash` and every later capture then looks novel.

**A stop is a question, never a conclusion.** No detector may conclude a redesign — that is the whole
reason the pass stops instead of deciding.

**A skipped capture does not speak** — excluded from calibration AND from diffing, or a truncated page
manufactures a false "text removed" diff. **OPEN: unenforced, and Level 5's.**

---

## FLOW 3 — CORRECTING A CORPUS ALREADY SCANNED

**When a page already in the corpus turns out to have been extracted wrongly** — noticed in a diff, a
thesis, or by a researcher reading the text. It needs no scan and no network: the captures are already
stored, so this walks them.

```
researcher   "the rules are wrong on <url>"
Claude       → correct_article_rules(url)
backend      refuses if the URL holds NO captures — there is nothing to mark against
             opens a CalibrationRun
             ← marking URL
             ── then the Phase-2 walk, over STORED captures only ──
             derive → compare with the previous stored capture → mark → approve
backend      Rule rows, validFrom = the MARKED capture's date

STATE        CalibrationRun · Rule rows · decisions
NOT WRITTEN  no fetch, no new UrlSnapshot, and NOTHING already stored is re-derived
```

**New rules apply from their own date FORWARD.** Correcting against a 2024 capture cannot change what a
2020 capture extracted — which is what makes this safe to run at any time, against any page, without
first working out what it might disturb.

**To change what is already stored, see Flow 5.** This flow never does.

---

## FLOW 4 — RESETTING A CALIBRATION

For a ruleset entangled past repair — **not merely wrong**. The case it exists for: rules belonging to
two different page structures ended up interleaved, and the log is APPEND-ONLY, so a correction
recorded now cannot separate them.

```
researcher   "the calibration on <url> is beyond fixing"
Claude       → reset_article_calibration(url, reason)          reason REQUIRED
backend      writes a CalibrationReset on the TrackedUrl
             ← how many decisions just lost their authority
             ── every later fold ignores everything recorded before the reset ──
             → then Flow 3, from nothing

STATE        one CalibrationReset row
NOT WRITTEN  nothing is deleted; every decision stays readable
```

**Supersedes, never deletes.** Only authority ends. **Nothing survives a reset** — a reset is often
reached for BECAUSE the structure recorded is wrong, so sparing anything would preserve what it was
called for.

**OPEN: a reset that supersedes nothing is currently accepted silently** and should be refused — an act
with no object is not an act.

---

## FLOW 5 — CHANGING A PAST EXTRACTION

**The only way a stored extraction ever changes, and it is deliberate.** It happens rarely and always by
explicit decision — never as a side effect of calibrating, committing or scanning. A stored capture's
text is what it was derived as, and rules created later cannot touch it, because they carry a
`validFrom` later than its date.

Two reasons qualify, and both are *"the stored text is UNTRUE"* — never *"the rules could be better"*:

```
1   the extraction PIPELINE was defective        e.g. inertDocument, htmlToText
2   an approval was WRONG                        the researcher approved damage
```

```
                                                              ⚠️ NOTHING IMPLEMENTS THIS
researcher   names the captures and why
backend      re-derives them under a NAMED ruleset version
             KEEPS the previous derived text alongside the new one
             records what changed and who decided it

STATE        a new derivation · the PREVIOUS text retained · an explicit record
```

**The previous text is kept because a thesis may cite it**, and the record has to show what changed
rather than quietly presenting the new value as what was always there.

**There is no commit step anywhere in this architecture.** `commit_article_rules` is RETIRED: rules are
in force from creation, so there is nothing to activate, and `textExtractionVersion` already records
which ruleset produced each capture's text.

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
