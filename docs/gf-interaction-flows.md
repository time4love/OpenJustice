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

## FLOW 0 — ADMITTING A URL TO THE CORPUS

**Before anything else, and once per page.** It answers one question — *is this page part of the
investigation?* — and every later flow assumes the answer was yes. **Calibration must never be the place
that finds out otherwise.**

```
researcher   "add <url>"  /  "is <url> in scope?"
Claude       → admit_url(url)                                            ⚠️ to build
backend      TrackedUrl exists? → already admitted, nothing further, no cost
             otherwise:
             → fetches the LIVE page          the page AS IT IS TODAY, not an archive capture
             ← content, or nothing
             nothing        → UrlAssessment { UNREADABLE } · REFUSED
             → model: checkRelevance(content, url)               a PAID call
             writes UrlAssessment { ON_MISSION | OFF_MISSION · reason ·
                                    model · agentVersion · promptHash · contentChars }
             OFF_MISSION    → REFUSED
             ON_MISSION     → creates the TrackedUrl

STATE        a UrlAssessment ALWAYS · a TrackedUrl only on ON_MISSION
```

**Recorded in BOTH directions, deliberately.** Recording only refusals makes the refusal RATE
incomputable — a filter turning away 1% would be indistinguishable from one turning away 90%.

**`UNREADABLE` is a verdict about the CHECK, not about the URL**, and is stored rather than omitted:
without a row, *"did we try to admit this?"* is unanswerable.

**Judged on the LIVE page.** A URL is admitted on what it says today, and its history is scanned
afterwards — so admission and the archive can disagree, and nothing currently reconciles them. **OPEN.**

**ONE TOOL ADMITS, AND EVERY OTHER OPERATION REFUSES AN UNADMITTED URL** rather than admitting it as a
side effect. Admission is a research judgement with a paid model call behind it, and a judgement made
implicitly, while a researcher was asking for something else, is a judgement nobody made.

---

## FLOW 1 — SCANNING A URL THAT IS NEW TO THE CORPUS

### Phase 0 — survey

**Before anything is fetched, stored or spent.** It happens the moment a researcher names a URL, and
answers one question: how big is this job? Nothing else in the flow can be sized without it.

```
researcher   "scan https://example.gov.il/page"
Claude       → survey_wayback_captures(url)                            ⚠️ to build
backend      REFUSES if the URL is not admitted — admission is Flow 0's
             → Wayback CDX index — ONE request, no page fetches
             ← 3,412 captures · 2019-03 → 2026-08 · we hold 0
Claude       reports the size; the researcher decides whether to start

STATE        nothing written
```

Its output is the WORK-LIST. A 40-capture page and a 3,400-capture page are different decisions, and
the researcher sees the number before anything is spent.

**It refuses an unadmitted URL like every other operation.** Sizing a page is not a reason to skip
deciding whether it belongs: scope comes first, and a survey of something out of scope is a question
nobody needed answered.

### Phase 1 — the first capture, where rules come into being

**Requires an ADMITTED URL — see Flow 0.** Calibration runs only on pages already judged part of the
investigation; it does not make that judgement and must not discover it late.

**Once per URL, and only while no rules exist.** Its whole purpose is to put a page in front of a human
so that rules can come into being — nothing can be derived, compared or judged until they do. The page
it fetches is deliberately never stored.

```
── ENTRY · the same steps wherever calibration is reached from ───────
Claude       → calibrate_article_rules(url)
backend      REFUSES if the URL is not admitted — admission is Flow 0's
             uses the URL's CalibrationRun, opening one only if none is open
             takes the capture: the EARLIEST here, the halted one in Flow 2
             if a FETCH RECORD already holds its bytes → uses them, fetches nothing
             otherwise → Wayback replay
                         ← bytes
                         writes a FETCH RECORD, PENDING_JUDGEMENT, HOLDING the bytes
             ← marking URL

             → MARKING  (defined once, below)

STATE        a CalibrationRun, if one had to be opened
             a FETCH RECORD holding the bytes, if one had to be written
             then MARKING's
NOT WRITTEN  no UrlSnapshot and no chain write here — nothing is ACQUIRED yet
```

**The first capture has no rules AND no predecessor.** Marking it removes the first half, so every
acquisition after it has rules — no special case in the path that decides corpus membership.

**The walk does not re-fetch it.** The fetch record already holds the bytes, so the first step of Phase 2
finds it waiting, derives under the rules that now exist, and promotes it.

**THIS PHASE IS NOT A SPECIAL CASE, ONLY A FIRST ONE.** Its entry is the same as the one Flow 2 reaches:
use the open run or open one, use the held bytes or fetch them. It differs only in what happens to be
true the first time — no run, no record, no rules, no predecessor — and every one of those is a
condition the same steps already handle.

### Phase 2 — the walk, one capture at a time

**The main body of the work, and where the researcher's attention is spent.** One capture at a time, in
date order, each one fetched, kept, derived and compared with the one before it. It continues until the
rules stop needing correction — which is not a fixed number of captures but a property of the page.

```
── ACQUISITION · one capture, and it either completes or halts ───────
Claude       → scan_next_capture(runId)                                ⚠️ to build
backend      takes the next capture in DATE order
             if a FETCH RECORD already holds its bytes — the bootstrap's, or a
               PENDING_JUDGEMENT being retried — it uses those and fetches nothing
             otherwise → Wayback replay
             ← bytes
             writes a FETCH RECORD: date, wayback timestamp, raw-bytes hash   ⚠️ new
                    ── rule-free, true whatever the rules say, so it is written first ──
             derives text under the rules whose validFrom ≤ THIS capture's date
             compares this extraction with the PREVIOUS stored capture's
             checks the gates

             ┌─ gates quiet · textHash NOVEL ─────────────────────────┐
             │ body → UrlSnapshot · anchors documentHash on chain     │
             │ fetch record outcome := ACQUIRED, held body cleared    │
             │ ← ACQUIRED                                             │
             └────────────────────────────────────────────────────────┘
             ┌─ gates quiet · textHash UNCHANGED ─────────────────────┐
             │ no UrlSnapshot, no chain write — the page did not move │
             │ fetch record outcome := DUPLICATE, no body kept        │
             │ ← DUPLICATE                                            │
             └────────────────────────────────────────────────────────┘
             ┌─ a gate fires ─────────────────────────────────────────┐
             │ the fetch record becomes PENDING_JUDGEMENT and KEEPS    │
             │   the bytes, so the marking page can read them         │
             │ no UrlSnapshot · no derived text claimed · no chain    │
             │ ← JUDGEMENT REQUIRED · why · the drifted text          │
             └────────────────────────────────────────────────────────┘
Claude       ACQUIRED or DUPLICATE → straight to the next capture
             JUDGEMENT REQUIRED → Flow 2, which has TWO answers:
                 REDESIGN     → calibrate below, then retry this capture
                 BAD CAPTURE  → resolve_scan_stop(… BAD_CAPTURE, reason)
                                SKIPPED · the fetch record keeps its outcome and
                                its reason, the body is cleared, no UrlSnapshot
                                is ever created, and the walk moves on

── CALIBRATION · reached from JUDGEMENT REQUIRED ─────────────────────
             → Flow 2, which resolves the stop and, on REDESIGN, runs the same
               ENTRY and MARKING as Phase 1 — opening nothing and fetching nothing,
               because the run is open and the fetch record holds the bytes.

STATE        fetch record ALWAYS · UrlSnapshot + on-chain anchor only on ACQUIRED
             the fetch record holds the BYTES only while PENDING_JUDGEMENT
             Rule rows + a decision ONLY when the researcher corrected
```

**THE FETCH RECORD IS ALWAYS WRITTEN, AND ALWAYS FIRST.** Every fetch leaves one, whatever the rules
say and whatever the outcome — that is what makes it the existence record and why the corpus has no
silent holes. What varies is only its `outcome`, and whether it holds the bytes.

**`DUPLICATE` IS THE COMMON CASE.** Most captures of most pages are the page unchanged, and on a
3,400-capture timeline the great majority of fetch records will say so. That is the whole point of
novelty: the archive holds thousands of captures and the corpus should hold the moments it moved.

**NOTHING IRREVERSIBLE HAPPENS BEFORE THE CHECK.** The existence row is rule-free — that capture is in
the archive whatever the rules say — so it is written immediately. The BODY and the ON-CHAIN ANCHOR wait
until the gates are quiet, because the decision to store is made under the rules, and a gate firing says
those rules are suspect HERE. A capture is never stored under rules that were in doubt at the time.

**Acquisition is atomic per capture: it completes, or it halts having written only the existence row.**
The same capture is retried once the rules are fixed, and succeeds the second time.

**WHERE THE BYTES FOR MARKING COME FROM — the fetch record carries them while a judgement is owed.**

Every fetch writes a row whether or not the capture joins the corpus. That row is the existence record,
and while a decision is pending it also holds the bytes:

```
CaptureFetch                                                    ⚠️ to build
  KEY       @@unique([trackedUrlId, waybackTimestamp])
  fields    snapshotDate · rawBytesHash · fetchedAt
  outcome   DUPLICATE           the archive had it, nothing changed
            ACQUIRED            it joined the corpus as a UrlSnapshot
            PENDING_JUDGEMENT   a gate fired; a human owes a decision here
  body      present ONLY while PENDING_JUDGEMENT
```

**THE KEY MUST BE KNOWABLE BEFORE THE FETCH, or the record cannot prevent one.** `waybackTimestamp` and
the URL are exactly what the CDX index yields, so the lookup happens from the work-list alone — no body,
no derivation, no run. `rawBytesHash` is a PAYLOAD field and could never be the key: it is only known
after the thing the key exists to avoid.

**It survives across runs, which is the other half.** `trackedUrlId` identifies the PAGE and does not
change between calibrations; a run id or a decision id would make the same capture look unfetched every
time a run was opened. `UrlSnapshot` is already keyed `@@unique([trackedUrlId, waybackTimestamp])`, so
the two join directly and a fetch record can be matched to the capture it became.

**A DIRECT capture has no archive identity.** `waybackTimestamp` is nullable on `UrlSnapshot` precisely
because a live fetch has none, so a fetch record cannot describe one. Acquisition reads the archive, so
this does not arise in these flows — but nothing here covers direct captures, and it should not be
assumed to. **OPEN.**

**OPEN — the CDX digest may remove most fetches entirely.** The index carries a content digest per
capture, so a capture whose digest matches the one before it is byte-identical and could be recorded
`DUPLICATE` WITHOUT FETCHING THE BODY AT ALL. On a 3,400-capture page where most captures are unchanged
that is the difference between thousands of fetches and dozens. Not designed, not measured, and it
interacts with novelty: a digest that changed says the BYTES moved, which is the sensitive signal
`textHash` exists to replace.

**It claims no extraction.** That is the point, and it is what neither alternative could manage: a row
in `UrlSnapshot` must carry `text` and `textHash`, so storing a halted capture there would mean writing
a derivation under rules the gate has just called into question. A fetch record asserts only what is
true regardless of rules — that these bytes were served at this timestamp.

**The duplication is real, temporary and small.** A capture awaiting judgement exists in two places for
as long as the judgement is owed: one in the walk, at most one per halted batch. On REDESIGN the retry
promotes it to a `UrlSnapshot` and the body is cleared; on BAD CAPTURE the outcome is recorded and the
body is cleared. Neither leaves it in both.

**This is NOT the draft capture table rejected in Phase 1.** That was two shapes of the same thing —
a capture, provisional and real — with promotion logic between them. This is a different thing: a record
of a FETCH, which has an outcome and a lifetime, and which exists whether or not a capture ever follows.
`PENDING_JUDGEMENT` is a work queue that says a human owes a decision, and a row that describes itself
that way is not a half-written capture.

**`calibrate_article_rules` IS THE RECOVERY MECHANISM, NOT A FIRST-RUN SPECIAL CASE.** It is the tool
that gets rules out of a page: fetch it, do not persist it, let a human mark it. Bootstrap is simply its
FIRST use. When acquisition halts, the bytes were never stored — so getting them in front of a
researcher means fetching that same capture again, which is exactly what this tool already does. It
gains only a parameter naming WHICH capture.

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

## THE CALIBRATION RUN — WHAT IT IS, AND WHO OPENS IT

**One per page, opened the first time calibration is needed, and reused ever after** — including by
Flow 2's recovery, which must not open a second one.

It holds two things and nothing else:

```
the DECISIONS      CAPTURE_SHOWN · RULESET_CORRECTED · CAPTURE_ACCEPTED · CAPTURE_SKIPPED
                   the record of what was shown, judged and skipped, and the source of
                   the "n consecutive captures needing no correction" count
the DRAFT          the marking page's working state, one at a time
```

**It is NOT a sitting.** A run per sitting would make the settle count a scheduling artefact: stopping
for the night and resuming would reset it, and how long a researcher works is not a fact about the page.

**It does not hold the rules.** Rules are rows with their own dates; the run records what a human did,
not what the rules are.

**OPEN — when, if ever, a run closes.** There is no commit in this architecture, so nothing ends one
naturally. `reset_article_calibration` supersedes its decisions, and abandoning closes it without
applying anything — but a run that is simply finished has no end state, and it is not decided whether it
needs one.

---

## MARKING — THE SHARED SUB-FLOW

**Defined once because it is identical wherever it is reached from.** Two flows use it: bootstrap
(Flow 1, Phase 1) and a stop resolved as REDESIGN (Flow 2). They differ ONLY in how the bytes came to be
held — and both end the same way, by handing back to `scan_next_capture`.

```
Claude       hands over the marking URL and the exact command to paste back:

                 approve_article_rules runId=<runId> snapshotId=<snapshotId>

             the page shows that same line with a copy button once the draft is
             handed back, so a mismatch means the wrong page is open
researcher   opens the marking URL in a browser
browser      → GET  /api/article-rules/:runId/captures/:snapshotId
             ← the capture, inert, plus its outline
browser      → POST /api/article-rules/:runId/captures/:snapshotId/preview
                    { selectors }                      on EVERY edit, PURE, stores nothing
             ← keptText · removedText · removedSegments · matchCounts
researcher   marks furniture, presses שמור טיוטא חדשה של חוקי חילוץ הטקסט
browser      → PUT  /api/article-rules/:runId/draft
                    { snapshotId, selectors, returned: true }
             ← the draft, handed back
researcher   pastes into the chat:  approve_article_rules runId=… snapshotId=…
Claude       → approve_article_rules(runId, snapshotId)                MCP
backend      promotes the draft → Rule rows, validFrom = THIS capture's date · a decision
             ← the rules now in force
Claude       → scan_next_capture(runId)      the held record, now with rules
backend      derives · gates quiet · promotes the fetch record to a UrlSnapshot
             anchors documentHash · clears the held body
             ← ACQUIRED

STATE        draft (written by the BROWSER) · Rule rows · one decision
             then UrlSnapshot + on-chain anchor, when the retry acquires
```

**It always ends by handing back to `scan_next_capture`.** Bootstrap and recovery differ at the start
and converge here: rules now exist, a fetch record holds bytes, and the walk promotes it. Nothing else
in either flow acquires a capture.

**DEFINED ONCE SO THE COPIES CANNOT DISAGREE.** Every step here is one a researcher performs or watches,
and a flow described twice is a flow that will eventually be described two ways.

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

REDESIGN     Claude       → open_article_capture(runId, snapshotId)
             backend      records CAPTURE_SHOWN
                          then the SAME ENTRY as Phase 1: the run is already open and
                          the fetch record already holds the bytes, so neither is
                          created and nothing is fetched
                          ← marking URL
                          → MARKING  (below), which ends by retrying this capture

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
