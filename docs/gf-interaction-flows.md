# Interaction flows — researcher · MCP · backend · Wayback

**How the factual layer is actually USED, end to end.** Architecture is in
`docs/gf-architecture-target.md`; this is the sequence of acts, the tool at each step, and the state
each one changes.

It exists because a flow is the hardest thing to reconstruct from source: the code shows what each tool
does and never what happens between them, which is where the judgement lives.

> **STATUS.** The TARGET flows, decided section by section with the researcher on 2026-09-02. ⚠️ marks
> what does not exist yet. Nothing in the design is left OPEN: what is out of scope and what is verified
> by measurement are named as such in the last two sections, and the APPENDIX is the implementation
> contract.

---

## THE FOUR ACTORS, AND WHICH SURFACE EACH USES

```
researcher   the human. Marks in a browser; pastes commands into the chat.
Claude       the orchestrator. Calls MCP TOOLS only — never an HTTP route.
browser      the marking page. Calls the BACKEND'S HTTP ROUTES directly,
             under /api/article-rules — it never goes through Claude or MCP.
             A DIALOG Claude opens: an immutable transformation returning a
             pasted command; the rule is stated once, thesis flows §2.
backend      the services. Reaches WAYBACK for CDX and replay; writes the database
             and the chain.
model        the PAID actor. Reached at exactly ONE point IN THESE FLOWS: the
             classification of every novel capture's diff, before it is stored
             (Gate 5, Level 5's call). Its spend is why acquisition stops at all.
```

**The browser's direct line to the backend is the only path that bypasses Claude**, and it is the
reason the marking page can be a pure transformation: it reads a capture, previews selectors, and hands
back a draft. It records no decision and applies no effect.

**EVERY CAPTURE IN THESE FLOWS COMES FROM THE ARCHIVE.** Live fetching came first and the archive scan
was added to it, until it became clear that a live fetch is a special case of an archive scan: the
archive is asked, and the page is fetched from it. All acquisition into the corpus is from Wayback.

**PARKED, for their own discussion once this document is signed off** — not gaps in these flows:
1. a page the archive does not hold
2. a live page that blocks fetching, so acquisition needs another form — screenshot, text copy, PDF
3. a whistleblower adding evidence — scheduled as R12 by `docs/gf-thesis-flows.md` §1

---

## THE TOOL SURFACE

```
survey_wayback_captures(url)                    Phase 0 · the entry to the corpus, and the work-list
scan_captures(url, maxCaptures)                 Phases 1–4 and Flow 3 · the walk, bootstrap included
approve_article_rules(url, capture)             MARKING · every answer that is a draft
resolve_scan_stop(url, capture, BAD_CAPTURE, reason)   Flow 2 · the one answer that is not
reset_article_calibration(url, reason)          Flow 3 · one RESET; every earlier rule loses authority
reads: get_article_rules(url) · list_captures(url)
```

**Retired:** `calibrate_article_rules`, `correct_article_rules`, `open_article_capture`,
`next_article_capture`, `judge_article_capture`, `resolve_era_boundary`, `check_ruleset_survival`,
`commit_article_rules`, `abandon_article_rules`. Each was a second implementation of an act the walk or
MARKING already performs.

---

## THE TWO RESPONSIBILITIES, AND THE DIRECTION BETWEEN THEM

```
ACQUISITION    get bytes from the archive and keep them          maintenance act
CALIBRATION    decide what of a page is article text             research act
```

**ACQUISITION READS RULES. CALIBRATION WRITES THEM.** One direction, not an entanglement: acquisition
needs the rules in force to derive text and to check the gates, and never creates one.

**BODIES ARE KEPT BY TEXT-NOVELTY. Ruled 2026-09-02.** A capture whose derived text equals its
predecessor's is recorded and its body is not kept; the existence row is written whatever the rules
say. This is the answer `textHash` already gives everywhere else in the system and the one
`CdxEntryStatus.UNCHANGED` already carries in the schema, and it is ruled here rather than inherited.

**The cost, stated:** a rule that over-removes hides edits inside the removed region, so those
captures come back DUPLICATE and their bodies are dropped. The gates catch the transition into that
state, not the state itself. What survives is the existence row, and Wayback can usually refill the
body — usually, not always: `UNSERVABLE` exists because CDX indexes captures replay will not serve,
and this corpus holds one. The alternative, keeping every body whose raw bytes differ, is ~470 MB per
large page to close a gap that is recoverable except for that class. That trade is the researcher's,
made with the gap in view.

**ACQUISITION STOPS ON THE GATES, FROM THE FIRST CAPTURE.** Acquiring under broken rules is not a
harmless over-storing: every stored row produces a diff and every diff is a PAID classifier call, so a
3,400-capture page yields thousands of spurious rows and thousands of paid calls — the explosion this
level exists to prevent. From the second capture the comparison signal is available, because the
predecessor's extraction is held; the first has no predecessor, and that is itself a stop (Gate 0).

**It does not JUDGE — it detects and YIELDS.** So it needs no human to PROCEED and a human to RESOLVE A
STOP, which is what keeps the two responsibilities apart while letting the pass halt.

**The one capture that cannot be compared is the first one**, which has no predecessor. So it is never
checked and always shown: Gate 0 stops on it, and a human marks it before anything is derived.

---

## FLOW 1 — SCANNING A URL THAT IS NEW TO THE CORPUS

### Phase 0 — survey

**Before anything is fetched, stored or spent.** It happens the moment a researcher names a URL, and
answers one question: how big is this job? Nothing else in the flow can be sized without it.

```
researcher   "scan https://example.gov.il/page"
Claude       → survey_wayback_captures(url)                            ⚠️ to build
backend      first call for this URL → creates the TrackedUrl: researcher · createdAt
             → Wayback CDX index — one query, no page fetches
             records what the archive said: one row per capture,
               timestamp · digest · UNFETCHED, and the query itself: asked when, how many
             a later survey APPENDS captures the archive has added; nothing is rewritten
             ← 3,412 captures · 214 byte-distinct · 2019-03 → 2026-08 · we hold 0
Claude       reports both counts; the researcher decides whether to start

STATE        the TrackedUrl, attributed, on the first call
             the WORK-LIST: one row per capture the archive reported, all UNFETCHED
             the query: when we asked, what came back
```

**It is the one entry to the corpus.** The first survey of a URL creates its TrackedUrl, attributed
to the researcher who asked. There is no admission step and no model gate: an invited researcher is
trusted with the corpus. **Every other operation refuses a URL that has not been surveyed**, so
nothing enters as a side effect of something else. A surveyed page with no rules is a page whose
walk has not started: its first capture stops, and that stop is where rules come from.

**Its output is the WORK-LIST, and TWO SIZES.** The raw count is the archive's activity. The
byte-distinct count — captures whose CDX digest differs from the one before — is the upper bound on
fetches, and so on derivations, gate checks and the researcher's attention. A 40-capture page and a
3,400-capture page are different decisions, and so are 3,400 captures of which 200 differ and 3,400 of
which all do.

**THE WORK-LIST ROWS ARE THE EXISTENCE ROWS.** Written here, before any fetch, keyed by page and
timestamp, carrying the digest: exactly what Phase 2 requires of a fetch record, and the walk never
creates one. It only updates the outcome on rows the survey wrote — UNFETCHED to IDENTICAL, DUPLICATE,
ACQUIRED, PENDING_JUDGEMENT, SKIPPED or UNSERVABLE. A re-survey appends, because captures are immutable
and the archive only ever adds; the rows say when we asked, so what the archive told us is kept rather
than re-derived.

**THE DIGEST IS THE ARCHIVE'S OWN FINGERPRINT OF THE BYTES IT STORED**, and it says one thing with
certainty: a capture whose digest equals its predecessor's is byte-identical to it, so under any rules
its text is identical and it cannot be novel. The walk records such a capture IDENTICAL without
fetching. The shortcut runs one way only — a different digest proves nothing about the text, and those
captures are fetched and often come back DUPLICATE anyway — so it never skips a capture whose text could
differ. Equality is to the IMMEDIATELY PRECEDING capture, never to anything earlier: a page returning to
a former state is a revert, and reverts are kept.

**On a dynamic page it catches little.** Likes, read-more blocks and rotating modules make nearly every
capture a few bytes different, so on a news site the two counts converge and text-novelty does the
work. The shortcut is free where it applies and harmless where it does not; the survey shows which kind
of page this is before anything is spent.

**It rests on one assumption, and the walk VERIFIES it on every fetch.** The bytes replay serves must be
the bytes the crawler stored. Every fetched capture gives both halves — the bytes received and the digest
the index published — so the walk hashes the bytes the same way and compares. A match confirms the
shortcut on this capture; a mismatch disables IDENTICAL for the page, is recorded, and stops for a human,
because it is the one finding that would make the shortcut unsafe. This requires fetching the RAW
capture, Wayback's `id_` replay mode, which is the payload the platform stores anyway.

### Phase 1 — the first capture, where rules come into being

**Requires a SURVEYED URL — see Phase 0.** The walk runs only on pages a researcher has put in the
corpus; it does not make that decision and must not discover it late.

**The first capture is a STOP, not a tool.** The walk takes it like any other capture: fetches it and
holds the bytes on its row. It has no predecessor and nothing a human has judged governs its date, so
nothing can be derived, compared or checked — and that is a gate:

```
GATE 0   no approved capture on or before this date — nothing a human has judged
         governs it                                                             → STOP, the bootstrap
```

```
Claude       → scan_captures(url, …)
backend      REFUSES if the URL has not been surveyed — that is Phase 0's
             takes the earliest capture; UNSERVABLE → records it and takes the next
             → Wayback replay ← bytes · row := PENDING_JUDGEMENT, HOLDING the bytes
             ← GATE 0 · the marking URL
             → MARKING: the researcher marks furniture and approves
               → Rule rows, validFrom = THIS capture's date · CAPTURE_ACCEPTED
Claude       → scan_captures(url, …) again
backend      the row is RESOLVED → derives under the rules that now exist → ACQUIRED, anchored

STATE        the row: PENDING_JUDGEMENT holding the bytes, or UNSERVABLE · then MARKING's
             then UrlSnapshot + on-chain anchor, when the retry acquires
NOT WRITTEN  no UrlSnapshot and no chain write before the approval
```

**UNSERVABLE IS A FACT ABOUT THE ARCHIVE, AND IT IS TERMINAL.** CDX indexes captures that replay
refuses, reproducibly, and this corpus holds one. The row records it and nothing retries it. It is not
SKIPPED: a skip is a human's verdict, carries a reason, and is about a capture we hold. The two must
never collapse, or a permanent gap and a judgement become indistinguishable.

**THIS PHASE IS NOT A SPECIAL CASE, ONLY A FIRST ONE — literally.** Same tool, same stop, same answers,
same retry. What is true the first time — no rules, no predecessor — is a condition the walk already
stops on. Gate 0 also fires after every rule has been retired (Flow 3), which is what makes a reset
"start again" without any second mechanism.

**A zero-rule approval is a ruleset.** A page with no furniture is approved with `rules=0`, explicitly
(MARKING), and from that date an empty ruleset is in force; Gate 0 does not fire again.

### Phase 2 — the walk

**One walk, from the first capture to the end of the timeline, and it never changes mode.** Each
capture is recognised from the index or fetched, derived under the rules valid for its date, compared
with its predecessor, and checked against the gates. Early on it stops constantly, because every rule
is new and every removal is one no human has seen. Later it stops on signals only. Nothing switches it
from one to the other and nothing counts toward a threshold: the walk thins as the researcher's
decisions accumulate, and that is the whole mechanism.

**THE PREDECESSOR is the most recent ACQUIRED capture before this one in date order.** Every comparison
below is against its extraction. A DUPLICATE's or IDENTICAL's text is by definition its predecessor's,
so stepping over one changes nothing; UNSERVABLE holds no text; SKIPPED does not speak. Under this
definition a capture filling a gap compares against a stored neighbour that may have been derived under
older rules, the gate fires, and a human looks — which is the design, not a defect.

**NO CAPTURE IS EVER STORED UNDER RULES A GATE HAS DOUBTED. Ruled 2026-09-02.** Every gate runs before
acquisition, so a stop always holds an unstored capture.

**THE GATES. None carries a number, and no detector concludes anything.**

```
GATE 0   no approved capture on or before this date (Phase 1)                   → STOP, the bootstrap
GATE 1   a segment present in both captures changed sides, EITHER direction     → STOP
GATE 2   a rule that matched the previous capture matches nothing here          → STOP
GATE 4   a removed segment no human has seen, under a rule still REVIEWED       → STOP, showing it
GATE 5   the classifier judged this capture's diff against its predecessor
         NOT EDITORIAL                                                          → STOP
```

Gate 3 was the batch bound and is not a gate: it is the chunk a tool call runs before returning, so
nothing runs unwatched over thousands of captures, and with progress derived from the work-list it is
an operational parameter rather than a judgement.

**WHY GATE 4 EXISTS, AND WHY IT IS A GATE AND NOT AN INTERVAL.** Gates 1 and 2 judge text that exists in
both of two consecutive captures. Text appearing for the FIRST time has no side history, so whichever
side it lands on is unjudged. New article text inside an element a rule removes is lost silently, and
no signal can be built from the text alone: a rule-based extractor cannot tell it from new furniture.
Only a human can, and a review on an interval is a sample. A stop on every never-seen removal is
complete coverage. Nothing is destroyed meanwhile — the bytes and the Readability text are kept whole —
so what Gate 4 protects is the derived view.

**A RULE IS REVIEWED UNTIL A HUMAN TRUSTS IT.** A rule is the researcher's judgement that an element is
furniture whatever it contains. Gate 4 keeps showing them that element's contents until they say so
explicitly, at a stop, looking at one: *this element is furniture whatever it contains, stop showing
me its removals.* That is a decision, logged like any other — who, when, which rule, against which
capture — and reversible by a later one. A rule's REVIEWED or TRUSTED state is folded from its
decisions, exactly as the rules themselves are. On a news page the first stretch trusts the ticker,
the related box and the rest, a few decisions each made once; on a stable page there is little to
trust and little to show.

**SEEN is derived, not stored.** A removed segment has been seen if it was on the removed side of any
capture a human has judged: every stop is resolved in the marking page, which shows the whole removed
side, and every resolution is a decision naming the capture.

**Gate 5 sees the other direction.** New furniture the rules have never met enters `text`, so the
capture is NOVEL and its diff against the predecessor is CLASSIFIED — the paid call this level counts,
and it was going to be made on that diff anyway. A NOT EDITORIAL verdict is that pollution's symptom,
at no extra spend. A model verdict only ever calls a human; it decides nothing. **It runs last because
it is the one paid gate, and before acquisition because of the ruling above it.**

```
── ACQUISITION · runs until a gate fires or the chunk is done ────────
Claude       → scan_captures(url, maxCaptures)                          ⚠️ to build
backend      per capture, in DATE order, over rows that are UNFETCHED, PENDING_JUDGEMENT
             or STALE (Flow 3):

             ┌─ its digest equals the preceding row's, and that row's text ─┐
             │  is KNOWN (ACQUIRED · DUPLICATE · IDENTICAL)                 │
             │ nothing fetched, nothing derived — identical bytes are       │
             │   identical under any rules                                  │
             │ row := IDENTICAL, comparedTo := that row · next capture      │
             └──────────────────────────────────────────────────────────────┘
             otherwise:
             if the row already holds bytes — the bootstrap's, or a
               PENDING_JUDGEMENT being retried — it uses those and fetches nothing
             otherwise → Wayback replay
                         ← bytes           row := fetchedAt · rawBytesHash
                         ← 404, durable    row := UNSERVABLE · next capture
             derives text under the rules whose validFrom ≤ THIS capture's date
             compares this extraction with the PREDECESSOR's
             checks Gates 1, 2 and 4 — unless the row is RESOLVED (below)

             ┌─ textHash equals the PREDECESSOR's · gates quiet ──────┐
             │ no UrlSnapshot, no chain write — the page did not move │
             │ row := DUPLICATE, comparedTo · ruleset · textHash      │
             │ next capture                                           │
             └────────────────────────────────────────────────────────┘
             ┌─ NOVEL · Gates 1, 2, 4 quiet · not RESOLVED ───────────┐
             │ diff against the predecessor → CLASSIFIED              │
             │   NOT EDITORIAL → Gate 5 fires                         │
             └────────────────────────────────────────────────────────┘
             ┌─ NOVEL · all gates quiet, or RESOLVED ─────────────────┐
             │ body → UrlSnapshot · anchors documentHash on chain     │
             │ the diff stored with its verdict                       │
             │ row := ACQUIRED, held body cleared · next capture      │
             └────────────────────────────────────────────────────────┘
             ┌─ a gate fires ─────────────────────────────────────────┐
             │ row := PENDING_JUDGEMENT, KEEPING the bytes so the      │
             │   marking page can read them                           │
             │ no UrlSnapshot · no derived text claimed · no chain    │
             │ STOP                                                   │
             └────────────────────────────────────────────────────────┘

             ← where it got to · WHICH gate · and its material:
               the segments that changed sides (1) · the silent rule (2) ·
               the never-seen removals, each with its rule (4) ·
               the diff and the verdict (5)

Claude       shows the material and hands over the marking URL — Flow 2
             the stop is resolved there, with ONE of:
                 CONTINUE     the rules are right here             → CAPTURE_ACCEPTED
                 CORRECT      the rules are wrong here             → RULESET_CORRECTED,
                              Rule rows, validFrom = THIS capture's date, then CAPTURE_ACCEPTED
                 TRUST        Gate 4 only: this rule's removals need no more review
                                                                    → RULE_TRUSTED, then CAPTURE_ACCEPTED
                 BAD CAPTURE  this capture does not speak; reason REQUIRED
                                                                    → CAPTURE_SKIPPED · row := SKIPPED,
                              body cleared, no UrlSnapshot ever, the walk moves on
             then → scan_captures(url, …) again, from the held row

STATE        the row's outcome ALWAYS · UrlSnapshot + on-chain anchor only on ACQUIRED
             the row holds the BYTES only while PENDING_JUDGEMENT
             a decision on every stop · Rule rows only on CORRECT
```

**RESOLVED means: this capture carries a decision under the ruleset now in force.** The retry after a
stop acquires it without re-checking the gates — the gates would fire again on the same drift, and a
human has just ruled on it. A correction changes the ruleset, so a decision made under older rules
does not resolve a capture under newer ones. All four gates are skipped, Gate 5 included: the human
looked at this capture's kept and removed text in the marking page, which is the diff and more.

**THE WALK CREATES NO EXISTENCE ROW. IT UPDATES THE ONE THE SURVEY WROTE.** Every capture the archive
reported already has a row, keyed by page and timestamp, carrying the digest, written before any fetch
— that is what makes the corpus free of silent holes, and it is Phase 0's doing. What the walk adds is
the outcome, and what it observed getting there.

```
work-list row                                                   ⚠️ to build on what exists
  KEY        page · waybackTimestamp                  from CDX, before any fetch
  from CDX   digest · snapshotDate
  at fetch   fetchedAt · rawBytesHash                 observed, never assumed from the digest
  outcome    UNFETCHED          the archive reported it; we have not looked
             UNSERVABLE         replay refuses it, durably; terminal
             IDENTICAL          bytes equal to the predecessor's, by digest; nothing fetched;
                                rule-free; terminal
             DUPLICATE          text equal to the predecessor's under a named ruleset;
                                fetched and derived; revisitable
             ACQUIRED           it joined the corpus as a UrlSnapshot
             PENDING_JUDGEMENT  a gate fired; a human owes a decision; bytes held here
             SKIPPED            a human's verdict; reason REQUIRED
  IDENTICAL  comparedTo
  DUPLICATE  comparedTo · the ruleset it was derived under · textHash
  body       present ONLY while PENDING_JUDGEMENT
```

**IDENTICAL AND DUPLICATE ARE THE SAME FOR THE WALK AND DIFFERENT FOR THE RECORD.** Both mean the corpus
holds nothing for this capture because its text is its predecessor's. But one is inferred from the
archive's fingerprint, rule-free, and can never go stale; the other was observed by derivation under
rules, and a rule change can make it untrue — which is why it names the ruleset and the predecessor it
was judged against. One outcome for both would leave the ruleset null on half the rows and make an
inference look like an observation.

**The digest branch takes only a predecessor with KNOWN text.** Identical bytes to an UNSERVABLE
capture say nothing about text we never read, so the capture is fetched. Identical bytes to a SKIPPED
capture are bytes a human judged unusable — the verdict is not inferred; the capture is fetched and
the gate puts it to the human again.

**IDENTICAL AND DUPLICATE ARE THE COMMON CASE.** Most captures of most pages are the page unchanged,
and on a 3,400-capture timeline the great majority of rows will say one or the other. That is the
whole point of novelty: the archive holds thousands of captures and the corpus should hold the moments
it moved.

**NOTHING IRREVERSIBLE HAPPENS BEFORE THE GATES ARE QUIET OR A HUMAN HAS RULED.** The existence row is
rule-free and already there. The BODY and the ON-CHAIN ANCHOR wait, because the decision to store is
made under the rules, and a gate firing says those rules are suspect HERE. A capture is never stored
under rules that were in doubt at the time.

**Acquisition is atomic per capture: it completes, or it halts having changed only the row.** The same
capture is retried once the stop is resolved, and succeeds the second time.

**WHERE THE BYTES FOR MARKING COME FROM — the row carries them while a judgement is owed.** A row in
`UrlSnapshot` must carry `text` and `textHash`, so storing a halted capture there would mean writing a
derivation under rules the gate has just called into question. The work-list row asserts only what is
true regardless of rules — that these bytes were served at this timestamp — and holds them until the
decision is made. On CONTINUE, CORRECT or TRUST the retry promotes them to a `UrlSnapshot` and clears
them; on BAD CAPTURE the outcome is recorded and they are cleared. Nothing is ever in both places.

**RECOVERY IS THE RETRY, NOT A TOOL.** When the walk halts, the bytes are on the row and the marking
URL is in the stop's response. The researcher marks, approves, and the next `scan_captures` call finds
the row RESOLVED and acquires it. Bootstrap is the first such stop; nothing distinguishes it.

**The two alternate here, capture by capture** — which is what makes the separation easy to miss. It is
a separation of AUTHORITY, not of distance in time: acquisition may write bytes and never rules;
calibration may write rules and never bytes. The same boundary holds while acquisition runs for
hundreds of captures between one stop and the next.

**The first STORED capture has no predecessor**, so drift is undefined for it — inherent, and harmless:
it is the page the researcher just marked in Phase 1.

**A run starts stopping and ends flowing, and nothing else.** There is no interactive mode to leave, no
settle count to reach and no interval to pick. Two of the doc's former open items — `n` and the
periodic-check interval — no longer exist.

**ANCHORED AS IT IS STORED. Ruled 2026-09-02, reversing the 2026-08-31 deferral on new evidence.** That
deferral belonged to a model with an unaudited automatic range whose anchors a bad run could waste.
Under this walk every acquired capture was stored under rules a human confirmed on it or trusted, Gate 5
bounds pollution to one capture per episode, and even that capture's anchor is a true hash of real
bytes. No deferred state, no anchoring pass; the receipt is read seconds after the write.

### Phase 4 — completion

**When the work-list is exhausted, or the researcher stops.** There is nothing to finalise: every rule
has been in force since the moment it was created, every acquired capture was derived under the rules
valid for its own date and anchored as it was stored, and every stop was resolved by a decision.

```
timeline exhausted, or the researcher stops
backend      nothing to commit — rules were in force from the moment they were created
             each capture already records the ruleset it was derived under
             each ACQUIRED capture is already anchored

STATE        nothing further written
```

**There is no commit step.** `commit_article_rules` is retired: with rules in force from creation there
is nothing to activate.

**Completion is of the WORK-LIST, not of the page.** A later survey appends what the archive has added
since, and the walk continues from there under the rules in force. Nothing about the page is closed.

**Nothing closes.** There is no run and no commit, so there is no end state — see the log section.

---

## THE CALIBRATION LOG — WHAT THE PAGE HOLDS, AND WHO WRITES IT

**There is no run.** A run was one per page, opened once, reused forever, holding a page-scoped log
and a page-scoped draft, with its progress derivable from other state. That is the page. So the log
and the draft belong to the `TrackedUrl`, and `runId` appears on no tool and no route: a capture is
named by its page and wayback timestamp, and the page is implied. Ruled
2026-09-02.

The page holds two things:

```
the LOG      append-only, every entry attributed — who, when, against which capture
             RULESET_CORRECTED   the researcher changed the rules; Rule rows follow
             CAPTURE_ACCEPTED    under the rules in force, this capture is right
             CAPTURE_SKIPPED     this capture does not speak; reason REQUIRED
             RULE_TRUSTED        this rule's removals need no more review
             RULE_ENDED          this rule stops applying from this capture's timestamp (unmarking)
             RULE_EXTENDED       this rule now governs from an EARLIER capture (a gap-fill approval)
             RULE_RETIRED        this rule's authority ends for ALL dates
             RESET               ends the authority of everything before it; reason REQUIRED
the DRAFT    the marking page's working state, one per page
```

**WHAT THE LOG IS FOR.** Immutable attribution of human judgement, on a platform whose evidence is
public — and two things the walk folds from it: SEEN, a removed segment is seen if it was on the
removed side of any capture a human has judged; and RESOLVED, a capture carries a decision under the
ruleset now in force. A rule's REVIEWED or TRUSTED state is folded from it the same way. The log has
readers, which is the test a record has to pass.

**`CAPTURE_SHOWN` is gone.** It recorded that a capture was on screen, and nothing read it: every stop
is resolved in the marking page by a decision that names the capture, and that decision is the record
of having looked. A row nothing reads is a row that will one day be read as a judgement.

**WHERE THE WALK GOT TO IS DERIVED, NEVER STORED.** The next capture is the first work-list row in date
order that is UNFETCHED, PENDING_JUDGEMENT or STALE. An unresolved stop is a PENDING_JUDGEMENT row with
no decision naming it. A cursor stored beside that state would be a second answer to one question.

**THE DRAFT IS ONE PER PAGE, AND DOES NOT LIVE ON THE WORK-LIST ROW.** The row was the obvious home,
since it holds the bytes being marked. It cannot be, for two reasons and either alone is enough:

- **Not every markable capture has one holding bytes.** Flow 3 marks captures already stored, fetching
  nothing.
- **A per-capture draft is a lost update.** A draft is the FULL selector list, not a delta. Two drafts
  held against the same baseline and promoted in turn would silently discard the first one's marks. One
  draft per page is precisely what makes switching captures settle the previous draft instead.

**A draft is not a judgement, and it is the one thing here that is not one.** The log is append-only
and immutable; the draft is transient, overwritten, and discarded on promotion. It sits on the page
because a page is the only scope that works, not because it belongs with the decisions.

**It is NOT a sitting.** How long a researcher works is not a fact about the page, and nothing in this
design depends on when they stop for the night.

**It does not hold the rules.** Rules are rows with their own dates; the log records what a human did,
not what the rules are.

**Nothing closes.** There is no commit and no run, so there is no end state to reach. A reset draws a
line; abandoning is deleting the draft. A page whose work-list is exhausted is simply a page whose next
survey may append to it.

**CONSEQUENCES FOR THE REFACTOR, recorded here so the doc is not read as free:** `researcherId` on
every decision; the compare-and-set re-homed from the run to the page; each tool write as one
transaction; the three existing runs' sequences renumbered or their logs superseded. Nothing was ever
committed and no legacy rule governs any capture, so those logs are archaeology and the choice is the
dev plan's.

---

## MARKING — THE SHARED SUB-FLOW

**Defined once because it is identical wherever it is reached from.** Three places reach it — the
bootstrap (Flow 1, Phase 1, which is the first gate stop), every other gate stop (Flow 2), and a
correction on a corpus already scanned (Flow 3) — and all of them end the same way, by handing back to `scan_captures`. They differ only in
how the capture came to be readable: held on its work-list row, or already stored.

**A CAPTURE IS NAMED BY ITS PAGE AND ITS WAYBACK TIMESTAMP, ALWAYS.** Every capture here comes from
the archive, so every capture has one, stored or not, and it is unique within a page. Tools name the
page by `url`, which is what the researcher has; routes name it by its id. The snapshot id is the
database's key and appears on no tool and no route.

```
walk / bootstrap / Flow 3
             ← the marking URL, and the exact command to paste back once the draft is
               handed back:
                 approve_article_rules url=<url> capture=<capture>
             the page shows that same line with a copy button once the draft is
             handed back, so a mismatch means the wrong page is open
researcher   opens the marking URL in a browser
browser      → GET  /api/article-rules/pages/:trackedUrlId/captures/:capture
             ← the capture, inert, plus its outline, the rules in force for its date,
               and each rule's REVIEWED or TRUSTED state
browser      → POST /api/article-rules/pages/:trackedUrlId/captures/:capture/preview
                    { selectors }                      on EVERY edit, PURE, stores nothing
             ← keptText · removedText · removedSegments by rule · matchCounts
researcher   answers ONE of, in the page:
               CONTINUE   approves as is                                          ⚠️ affordance
               CORRECT    marks furniture, or unmarks it
               TRUST      ticks any rules whose removals need no more review      ⚠️ affordance
             and presses שמור טיוטא חדשה של חוקי חילוץ הטקסט
browser      → PUT  /api/article-rules/pages/:trackedUrlId/draft
                    { capture, selectors, trusted: [selector…], returned: true }
             ← the draft, handed back
researcher   pastes into the chat:  approve_article_rules url=… capture=…
Claude       → approve_article_rules(url, capture)                     MCP
backend      promotes the draft, in order and as ONE transaction:
               new selectors  → Rule rows, validFrom = THIS capture's date · RULESET_CORRECTED
               trusted rules  → RULE_TRUSTED, one per rule
               then           → CAPTURE_ACCEPTED
             every decision attributed to the researcher in context
             ← the rules now in force, and what changed
Claude       → scan_captures(url, …)         the held row is now RESOLVED
backend      derives · promotes the row to a UrlSnapshot · anchors documentHash ·
             clears the held body · ACQUIRED

STATE        draft (written by the BROWSER) · Rule rows · the decisions
             then UrlSnapshot + on-chain anchor, when the retry acquires
```

**ONE COMMAND, WHICHEVER ANSWER IT WAS.** CONTINUE hands back an unchanged draft, CORRECT a changed one,
TRUST a draft carrying rule ids; the same approval promotes all of it. A rule created in this draft can
be trusted in this draft. BAD CAPTURE is the one answer that is not a draft: the researcher looks here,
then pastes `resolve_scan_stop url=… capture=… BAD_CAPTURE reason=…` instead.

**AN EMPTY DRAFT IS APPROVED EXPLICITLY OR NOT AT ALL.** A page with no furniture exists, so zero rules
cannot be refused outright — but an approval of nothing has twice gone through unnoticed. On a
zero-rule draft the page hands back `approve_article_rules url=… capture=… rules=0`, and the tool
refuses a zero-rule approval that does not carry it. A statement, not a threshold.

**THE MARKING URL IS DETERMINISTIC**, page and capture, so the walk's stop response carries it and no
tool exists to produce it. Nothing records that a capture was shown; the decision that resolves the
stop is the record of having looked.

**It always ends by handing back to `scan_captures`.** Bootstrap, a stop and a correction differ at the
start and converge here: the rules now in force are known, the capture is RESOLVED, and the walk
acquires it. Nothing else in any flow acquires a capture.

**DEFINED ONCE SO THE COPIES CANNOT DISAGREE.** Every step here is one a researcher performs or
watches, and a flow described twice is a flow that will eventually be described two ways.

---

## FLOW 2 — A STOP FOR JUDGEMENT

**The only place a human is required, and the only place a judgement is made.** It happens whenever a
gate fires. The walk has stopped and says why; it cannot know what the answer is, and does not try.
Every gate runs before acquisition, so the capture at a stop is held on its row, unstored — or, when
Flow 3's re-walk stops on a capture already stored, held in its UrlSnapshot — and named by its wayback
timestamp either way.

```
GATE 1   a segment present in both captures changed sides, EITHER direction
GATE 2   a rule that matched the previous capture matches nothing here
GATE 4   a removed segment no human has seen, under a rule still REVIEWED
GATE 5   the classifier judged this capture's diff against its predecessor NOT EDITORIAL
```

```
── ACQUISITION YIELDS ────────────────────────────────────────────────
backend      ← WHICH gate · its material — the segments that changed sides (1),
               the silent rule (2), the never-seen removals with their rules (4),
               the diff and the verdict (5) · the MARKING URL
Claude       shows the material and the URL; puts no question of its own
researcher   opens MARKING and answers ONE of four

── CALIBRATION ANSWERS ───────────────────────────────────────────────

CONTINUE     the rules are right here — a widget legitimately left the page, the
             verdict was wrong, the removal is furniture after all
             → MARKING, unchanged draft → CAPTURE_ACCEPTED → the walk acquires it

CORRECT      the rules are wrong here
             → MARKING, changed draft → Rule rows, validFrom = THIS capture's date,
               RULESET_CORRECTED, CAPTURE_ACCEPTED → the walk re-derives and acquires it

TRUST        Gate 4 only: these rules' removals need no more review
             → MARKING, draft carrying selectors → RULE_TRUSTED per rule,
               CAPTURE_ACCEPTED → the walk acquires it

BAD CAPTURE  this capture does not speak; reason REQUIRED
             researcher pastes:  resolve_scan_stop url=… capture=… BAD_CAPTURE reason=…
             → CAPTURE_SKIPPED, attributed · row := SKIPPED, body cleared,
               no UrlSnapshot ever → the walk moves on

STATE        one decision, always · Rule rows only on CORRECT
```

**Both directions stop.** `kept → removed` is DATA LOSS; `removed → kept` is CORPUS POLLUTION, because
`text` feeds `textHash` and every later capture then looks novel.

**A stop is a question, never a conclusion.** No detector may conclude a redesign and no verdict may
decide one — that is the whole reason the walk stops instead of deciding.

**A SKIPPED CAPTURE DOES NOT SPEAK.** It is excluded from calibration and from diffing, or a truncated
page manufactures a false "text removed" diff. From a stop it is always unstored, so nothing holds it
but its row. Enforcing the exclusion in diffing is Level 5's, and the dev plan's.

**Gate 2's false alarm is expected and cheap.** Furniture legitimately leaving a page silences its rule
without moving any text. That is a CONTINUE, and the rule does not fire again: the next capture's
predecessor did not match either. The rule is now silent, which is what `RuleMatch` records and what
expiry, still open, would act on.

---

## FLOW 3 — CORRECTING THE PAST: THE WALK, RE-RUN

**Three flows used to live here — correct, reset, supersede — and they were one mechanism seen from
three bugs.** A researcher corrects one capture, and the effect is as if the walk had started from it.
Nothing here is a second machine: it is the walk of Phase 2, over rows that already have an outcome.

**STALE IS DERIVED, NEVER STORED.** A stored capture is stale when the ruleset it records is not the
ruleset in force for its date, or its extraction version is not the current one. Nothing writes that
state; the walk sees it. Correcting the rules makes captures stale; walking makes them current.

**THE WALK'S NEXT ROW IS THE EARLIEST ONE THAT IS UNFETCHED, PENDING_JUDGEMENT OR STALE.** So a re-walk
needs no starting parameter: the first stale row is where it starts, and there is one tool.

```
researcher   "the extraction is wrong on <url> at <capture>"     noticed in a thesis, a diff, a read
Claude       ← the marking URL for that STORED capture, named by its timestamp
             → MARKING → approve_article_rules → Rule rows, validFrom = THAT capture's date ·
               CAPTURE_ACCEPTED
             every stored capture on or after that date is now STALE
Claude       → scan_captures(url, …)
backend      the walk, from the first stale row, with these outcomes over rows already judged:
               IDENTICAL                  untouched — bytes are bytes under any rules
               DUPLICATE, stale ruleset   re-fetched, re-derived: NOVEL now → ACQUIRED, a new
                                          UrlSnapshot; still DUPLICATE → re-recorded under this ruleset
               ACQUIRED, stale            re-derived from the bytes we hold → a NEW TEXT VERSION,
                                          the previous kept, who and why recorded
                                          now equal to its predecessor → the snapshot and its anchor
                                          STAY; the version is marked equal, and no diff spans it
               SKIPPED · UNSERVABLE       untouched
             the gates run as always — and on a stale ACQUIRED capture ONE MORE comparison:
               its new text against its OWN previous, approved text; kept → removed there means
               the correction ate text a human approved                        → STOP
             stops are resolved exactly as in Flow 2

STATE        new text versions, the previous retained · new UrlSnapshots for former DUPLICATEs ·
             decisions at stops
NOT WRITTEN  no snapshot deleted, no anchor touched, no text overwritten — versions only
```

**THE THREE CASES, AND THEY ARE ONE:**

| case | trigger | what becomes stale |
|---|---|---|
| a trusted rule later ate article text | mark that capture | from its date |
| a calibration is garbage | `reset_article_calibration(url, reason)`: one RESET decision, reason REQUIRED; every rule created before it loses authority; refused when there is nothing to retire | everything; the first capture stops on Gate 0 |
| the extraction pipeline was defective | a new extraction version | everything, every page |

**A GAP-FILL APPROVAL EXTENDS, NEVER DUPLICATES.** Marking a back-filled capture under a selector the
page already has as a live rule with a later `validFrom` moves that rule's `validFrom` back to this
capture, by RULE_EXTENDED, so trust stays one judgement per element and no selector ever has two
live rules.

**RULE_RETIRED ends a rule's authority for ALL dates.** It is how a single wrong rule is removed
without a reset; a reset itself writes no RULE_RETIRED — every rule created before the RESET loses
authority by the predicate. **RULE_ENDED is the other way a rule
stops: from a date, not for all dates.** Unmarking a rule in MARKING is RULE_ENDED with `validTo` =
that capture's date, so a rule that was right in 2020 and wrong after a 2022 redesign keeps governing
2020. Expiry — a rule that stopped matching years ago, still open — would be RULE_ENDED with a date
chosen later.

**THE PREVIOUS TEXT IS KEPT because a thesis may cite it**, and the record shows what changed rather
than presenting the new value as what was always there. Diffs that spanned a superseded version are
Level 5's to recompute, and the dev plan's.

**THIS IS ALSO HOW THE LEGACY CORPUS IS HANDLED, AND WHY IT NEEDS NO MIGRATION.** Every stored capture
today was derived under no rules — the empty ruleset, a valid version. The first rule a researcher
creates for a page makes everything from its date stale, and this walk supersedes it, keeping the old
text. Anchors attest bytes, which no rule changes, so nothing on chain is orphaned and nothing is
re-anchored. The legacy corpus is the re-walk's first job, after the refactor, not a script before it.

**There is no commit step anywhere in this architecture.** `commit_article_rules` is RETIRED: rules are
in force from creation, so there is nothing to activate.

---

## STATE, AND WHO MAY WRITE IT

| state | written by | never written by |
|---|---|---|
| `TrackedUrl` | the first survey, attributed | anything else — no side-effect entry |
| work-list rows: existence, digest | the survey | the walk, which only updates them |
| work-list rows: outcome, held bytes | the walk | the marking page; any rule |
| `UrlSnapshot` bytes and hashes | the walk, on ACQUIRED | the marking page |
| `text` / `textHash` / `textExtractionVersion` | the walk at acquisition; a NEW VERSION by the re-walk, the previous kept | any rule directly; nothing overwrites a version |
| `fullText` / `contentHash` | capture recording | **any ruleset — evidence identity cannot move** |
| `Rule` rows | `approve_article_rules` | acquisition |
| the decision log | `approve_article_rules` · `resolve_scan_stop` · `reset_article_calibration` | the browser; any automatic path |
| the draft | the marking page | — |
| the diff and its verdict | the walk, at acquisition | — |
| on-chain anchor | the walk, on ACQUIRED, on raw bytes | never derived text |

**The marking page is a pure transformation: ruleset in, draft out. It decides nothing and applies
nothing.**

---

## OUT OF SCOPE OF THIS DESIGN

- **Rule expiry** — retiring a rule that has matched nothing for a long stretch. `RuleMatch` answers
  when it stopped; RULE_ENDED is the decision it would be made of. How much silence justifies it is a
  question for a later design, and no number is chosen here.

## VERIFIED BY MEASUREMENT, NOT BY THIS DOCUMENT

The design assumes stops become rare once rules are trusted. That is checked, not argued, and the
checks are the dev plan's:

- Gate 2's stop rate and Gate 4's stop volume, on the walla timeline, with the drift instrument.
- Gate 5's false-positive rate, on stored diffs already classified.
- Replay-equals-crawl, on every fetch, by the walk itself (A5).

---

## APPENDIX — THE IMPLEMENTATION CONTRACT

**What a builder reads twice.** The flows above are the design; this is every shape, predicate and
refusal they imply, stated once. Where the two disagree the flows win and this is wrong.

### A1. Identity

```
page        tools: url (string, exact)         routes: trackedUrlId
capture     waybackTimestamp — 14 digits, YYYYMMDDHHMMSS, unique per page; the only capture name
researcher  from the MCP context; every write tool REFUSES without one
rule        ruleId (cuid)
```

### A2. Data model

```
TrackedUrl              + createdById (researcher) · createdAt
                        + draftCapture (timestamp | null) · draftSelectors String[] ·
                          draftTrusted SELECTOR[] · draftReturnedAt (DateTime | null)
                          — trust is named by selector: one live rule per selector makes a
                          selector a unique name, and it is what the page has

WorkListRow             one per capture the archive reported          ⚠️ on the existing index table
  KEY                   @@unique([trackedUrlId, waybackTimestamp])
  from CDX              digest · snapshotDate · observedAt
  at fetch              fetchedAt · rawBytesHash · contentType · contentEncoding ·
                        digestVerified Bool — sha1(bytes) = digest
  textExtractionVersion (DUPLICATE, ACQUIRED) — the extractor that produced the text
  outcome               UNFETCHED | UNSERVABLE | IDENTICAL | DUPLICATE | ACQUIRED |
                        PENDING_JUDGEMENT | SKIPPED
  comparedTo            waybackTimestamp of the predecessor row (IDENTICAL, DUPLICATE)
  rulesetId             hash of the selectors in force for this date (DUPLICATE, ACQUIRED)
  textHash              (DUPLICATE)
  snapshotId            (ACQUIRED) — the UrlSnapshot it became
  heldBody              Bytes | null — non-null ONLY while PENDING_JUDGEMENT
  stop                  Json | null — { gates: [{ gate, material }, …] }, gate ∈ 0|1|2|4|5|'DIGEST';
                        written with PENDING_JUDGEMENT, cleared with it; a pending stop is returned
                        VERBATIM from it, so nothing recomputes material. A PENDING row with stop =
                        null is awaiting evaluation (a reset clears stops), not a pending stop
  reason                String | null — REQUIRED on SKIPPED

Rule
  id · trackedUrlId · selector
  validFrom             waybackTimestamp of the capture it was created against — a rule marked
                        against the 14:00 capture must not govern 09:00 of the same day.
                        May move EARLIER, never later, by RULE_EXTENDED
  validTo               waybackTimestamp | null — set by RULE_ENDED
  createdById · createdAt · createdByDecisionId — a rule's AUTHORITY is its creating decision's
  INVARIANT             at most ONE live rule per selector under AUTHORITY — live: created under
                        AUTHORITY, not ended at t, not retired. approve_article_rules keeps it

Decision                the page's log, append-only — the PageDecision table, delegate pageDecision
  id · trackedUrlId
  sequence              Int — @@unique([trackedUrlId, sequence]); the compare-and-set
  type                  RULESET_CORRECTED | CAPTURE_ACCEPTED | CAPTURE_SKIPPED |
                        RULE_TRUSTED | RULE_ENDED | RULE_RETIRED | RULE_EXTENDED | RESET
  researcherId          REQUIRED on every row
  waybackTimestamp      the capture judged — REQUIRED on every type except RESET;
                        on RULE_EXTENDED, the rule's NEW validFrom
  ruleId                REQUIRED on RULE_TRUSTED | RULE_ENDED | RULE_RETIRED | RULE_EXTENDED
  reason                REQUIRED on CAPTURE_SKIPPED | RESET
  rulesetId             RULESET_ID at the judged capture's timestamp — REQUIRED on
                        CAPTURE_ACCEPTED | CAPTURE_SKIPPED; what RESOLVED reads
  createdAt

RuleMatch               one row per rule per capture examined
  ruleId · waybackTimestamp · matchedNodes Int · observedAt
  @@unique([ruleId, waybackTimestamp])

UrlSnapshot             unchanged in identity: document · documentHash · fullText · contentHash
  text · textHash · textExtractionVersion     the CURRENT version

TextVersion             one row per SUPERSEDED derivation of a capture
  id · snapshotId
  text · textHash · textExtractionVersion · rulesetId
  derivedAt             when this version was the current one
  supersededAt · supersededByDecisionId
  @@unique([snapshotId, textHash])
  A thesis cites (snapshotId, textHash), which pins the version it read. On supersession the walk
  copies the current row here and writes the new text onto the snapshot, in ONE transaction. A
  re-derivation whose textHash already exists here is not a new version: the current pointer moves.

UrlVersionDiff          the PAIR, written by the walk AT ACQUISITION; its content, carrying the
                        Gate 5 verdict, is a DiffContentVersion — evidence doc A2
```

**Nothing is deleted, ever.** Rows are appended, outcomes are updated, text is versioned.

### A3. Derivations, as predicates

```
AUTHORITY(page)         decisions with sequence > the newest RESET's sequence (all, if none).
                        SEQUENCE, never createdAt: rows written in one transaction share now().
                        A rule's creating decision is under AUTHORITY only if it EXISTS in the log
                        with such a sequence — a rule whose decision is not in the log is not in force
RULES_IN_FORCE(page, t) rules whose creating decision is under AUTHORITY,
                        with validFrom ≤ t AND (validTo IS NULL OR t < validTo),
                        AND no RULE_RETIRED for them under AUTHORITY.
                        t is a waybackTimestamp. After a RESET this is EMPTY at every t, with no
                        RULE_RETIRED row written — the property that makes a reset a reset
RULESET_ID(page, t)     sha256 over the sorted, de-duplicated selectors of RULES_IN_FORCE, first 8 hex
                        — the empty set has an id too
TRUSTED(rule)           a RULE_TRUSTED for it exists under AUTHORITY; REVIEWED otherwise
APPROVED_BEFORE(page,t) a CAPTURE_ACCEPTED under AUTHORITY on a capture with waybackTimestamp ≤ t
RESOLVED(row)           a CAPTURE_ACCEPTED or CAPTURE_SKIPPED for its capture, under AUTHORITY,
                        whose rulesetId = RULESET_ID(page, row.waybackTimestamp). Trust does not
                        change the text, so RULE_TRUSTED never un-resolves a capture
SEEN(page)              the removed-side segments of every ACQUIRED capture that has a decision
                        under AUTHORITY, plus the PENDING_JUDGEMENT capture being judged — computed
                        from bytes held, so a SKIPPED capture contributes nothing and its removals
                        may be shown again; cached per page, invalidated by any decision
STALE(row)              outcome ∈ {DUPLICATE, ACQUIRED} AND
                        (row.rulesetId ≠ RULESET_ID(page, row.waybackTimestamp)
                         OR row.textExtractionVersion's extractor ≠ CURRENT_EXTRACTOR)
PREDECESSOR(row)        the latest row before it in timestamp order with outcome ACQUIRED
KNOWN_TEXT(row)         outcome ∈ {ACQUIRED, DUPLICATE, IDENTICAL}
NEXT_ROW(page)          the earliest row in timestamp order with outcome ∈ {UNFETCHED, PENDING_JUDGEMENT}
                        OR STALE(row)
```

### A4. The gates, as predicates

A **segment** is a line of the derived text, whitespace-normalised, containing at least one letter or
digit. Sides are compared as SETS. `kept(c)` and `removed(c)` are the segment sets of capture `c`
under RULES_IN_FORCE for its timestamp `t`; `p` = PREDECESSOR(c). Every gate takes a timestamp.

```
GATE 0   NOT APPROVED_BEFORE(page, c.t)
GATE 1   (removed(c) ∩ kept(p)) ∪ (kept(c) ∩ removed(p)) ≠ ∅
         material { against: 'PREDECESSOR', nowRemoved: [{ text, ruleId|null }], nowKept: [text] }
GATE 1'  on a STALE ACQUIRED row only: removed(c_new) ∩ kept(c_previous_version) ≠ ∅ — one
         direction — material { against: 'OWN_PREVIOUS_TEXT', nowRemoved, nowKept: [] }.
         A DUPLICATE has no approved text of its own
GATE 2   ∃ rule r in force at both timestamps: RuleMatch(r, p) > 0 AND RuleMatch(r, c) = 0.
         A rule in force at p or c with NO RuleMatch row for that timestamp is a WALK DEFECT: the
         gate THROWS naming the rule and the timestamp — never read as 0, never as quiet
GATE 4   ∃ segment s ∈ removed(c) removed by a REVIEWED rule AND s ∉ SEEN(page).
         Derivation runs under RULES_IN_FORCE, so every selector in removedSegments names a live
         rule; one that does not is a WALK DEFECT and the gate THROWS. A segment claimed by more
         than one REVIEWED rule is listed ONCE PER RULE — trust is per rule
GATE 5   classify(diff(text(p), text(c))).editorial = false      — evaluated LAST, only if 0–4 quiet
         and the capture is NOVEL. The classifier's output gains `editorial: boolean`, asked in the
         same call as significance and categories; CLASSIFIER_VERSION and the prompt hash move.
         One paid call per novel capture, one more question. Gate 5 never reads a stored diff
```

**Order of evaluation, and the stop.** 0 alone; then 1, 1', 2 and 4 are ALL evaluated; then 5. The
stop carries EVERY gate that fired on this capture, each with its own material, in that order —
`{ capture, gates: [{ gate, material }, …], markingUrl }`. Gate 0, Gate 5 and DIGEST arrive alone by
construction. A walk defect in any gate throws whether or not another gate fired first. A RESOLVED
row skips all five gates — and NOT the classifier: its diff row is still written with a
classification, whose editorial answer stops nothing. The DIGEST check runs at fetch, before any
gate, only on a fresh fetch.

### A5. Tool contracts

Every write tool: REFUSES with no researcher in context (`NO_RESEARCHER`); REFUSES a URL that has no
TrackedUrl (`NOT_SURVEYED`, except `survey_wayback_captures`, which creates it). Every refusal is a
JSON `{ error, code }`, never a throw. `REASON_REQUIRED` for a missing or blank reason wherever one
is required. The two reads are GATED in WRITE_TOOLS by the standing precedent — a researcher's
working state is not published evidence — while their handlers answer without an identity.

```
survey_wayback_captures({ url })
  does      creates TrackedUrl if absent (createdById = researcher) · CDX query, all pages ·
            upserts WorkListRows (append only; existing rows untouched) · records the query ·
            LEGACY JOIN: a new row whose (page, timestamp) matches an existing UrlSnapshot
            is written ACQUIRED with that snapshotId, rulesetId = RULESET_ID(page, timestamp)
            — the empty set's id until a rule exists — and the snapshot's textExtractionVersion,
            so a null never reaches STALE
  returns   { trackedUrlId, created: bool, captures: n, byteDistinct: n,
              span: { from: date, to: date }, held: n, appended: n, unservable: n }
  empty     CDX answers with ZERO rows → the TrackedUrl is created, one query row with rowCount 0
            is recorded, the return says captures: 0, nothing else is written. An empty answer is
            an observation, not an outage: "did we ever ask?" stays answerable
  refuses   CDX unreachable → { code: 'ARCHIVE_UNAVAILABLE' }, nothing written — the TrackedUrl
            included; creation follows the archive's answer

scan_captures({ url, maxCaptures })
  does      from NEXT_ROW, up to maxCaptures rows, the walk of Phase 2 / Flow 3
            fetches RAW replay (`id_`), hashes the bytes, compares with the row's digest →
            digestVerified; a MISMATCH is recorded and the walk stops with material
            { expected: digest, got: sha1 } — a stop like any other. The IDENTICAL shortcut is OFF
            for the page while ANY row on it carries digestVerified = false: once a page has served
            bytes its own index does not describe, "same digest, same bytes" is false for that page,
            and a human looking does not make it true. A broken page is fetched capture by capture
            a RESOLVED novel capture skips the GATES, not the classifier: its diff row is written
            with a classification; the editorial answer is recorded and stops nothing
            a TRANSIENT fetch failure (isTransientWaybackError) leaves the row UNFETCHED and the call
            returns { code: 'ARCHIVE_UNAVAILABLE' } at that row, everything before it kept; a durable
            404 is UNSERVABLE and the walk continues
            on acquiring a capture that has an ACQUIRED successor — a re-walk turning a DUPLICATE
            novel, or a capture the index gained with an old date — the successor's diff is
            written against it as well, classified like any other, so the timeline stays a
            consecutive chain; the old pair's row stays (evidence doc §7)
            every diff is written as the PAIR, its chunks, survival and classification as a
            DiffContentVersion (evidence doc A2); the old columns are the old path's
  returns   { walked: n,
              outcomes: { identical, duplicate, acquired, unservable, superseded, restamped },
                superseded: a STALE ACQUIRED row whose text changed — a TextVersion written
                restamped:  a STALE ACQUIRED row re-derived to the same textHash — rulesetId moved,
                            no version written
              stop: null | { capture, gates: [{ gate, material }, …], markingUrl },
              next: timestamp | null }
  material  gate 0: {}
            gate 1: { against: 'PREDECESSOR' | 'OWN_PREVIOUS_TEXT', nowRemoved: [{ text, ruleId|null }],
                      nowKept: [text] }
            gate 2: { rules: [{ ruleId, selector, matchedOnPredecessor: n }] }
            gate 4: { removals: [{ text, ruleId, selector }] }   — one entry per claiming rule
            gate 5: { diff: inline, the chunks the classifier saw, editorial: false, reason }
                    — inline always: a stop holds an unstored capture
            DIGEST: { expected, got }
  refuses   NOT_SURVEYED · INVALID_MAX_CAPTURES (maxCaptures < 1) · a stop already pending — a
            PENDING row WITH a stop — → returns it verbatim from the row, walks nothing. A PENDING
            row with stop = null is evaluated, not returned
            REGISTRY_FROZEN — NOT WRITES_ALLOWED(registry), evaluated once per call before the
            first anchor: the registry is neither empty nor scheme-stamped at index 0, nothing is
            acquired, and the message names index 0's category (evidence doc §8)

approve_article_rules({ url, capture, rules?: 0 })
  does      ONE transaction, in order, t = the capture's timestamp:
              draft must exist, be returned, and name THIS capture → else REFUSES
              selectors added vs RULES_IN_FORCE(page, t):
                not a live rule anywhere       → a new Rule row, validFrom = t
                a live rule with validFrom > t → that rule's validFrom := t, one RULE_EXTENDED;
                                                 NO second row — one live rule per selector.
                                                 Captures between the old and new validFrom become
                                                 STALE by predicate; the re-walk takes them
                                               one RULESET_CORRECTED names the capture
              selectors removed                → RULE_ENDED each, validTo = t
              draftTrusted (selectors)         → RULE_TRUSTED each, mapped to the live rule — created
                                                 by this approval or existing; a rule created in a
                                                 draft can be trusted in that draft
              then CAPTURE_ACCEPTED, rulesetId = RULESET_ID(page, t) after the changes
              draft cleared
  returns   { rules: RULES_IN_FORCE(page, t) after the approval, each { ruleId, selector, validFrom,
              validTo, trusted },
              changes: { added, ended, trusted, extended } each [{ ruleId, selector }],
              decisionSequence }
            — "the rules now in force, and what changed" are literally the two fields
  refuses   NO_DRAFT · DRAFT_NOT_RETURNED · DRAFT_FOR_OTHER_CAPTURE · CAPTURE_NOT_MARKABLE
            (row not PENDING_JUDGEMENT and not ACQUIRED) · EMPTY_RULESET_UNCONFIRMED
            (zero rules in force after this approval and rules≠0) · STALE_SEQUENCE

resolve_scan_stop({ url, capture, resolution: 'BAD_CAPTURE', reason })
  does      ONE transaction: CAPTURE_SKIPPED with rulesetId = RULESET_ID(page, t) · row := SKIPPED,
            heldBody and stop cleared, reason stored · the draft cleared IF it names this capture —
            a draft naming a skipped capture is void — and left if it names another
  returns   { capture, outcome: 'SKIPPED', decisionSequence }
  refuses   NOT_PENDING · REASON_REQUIRED · INVALID_RESOLUTION (anything but BAD_CAPTURE) ·
            STALE_SEQUENCE

reset_article_calibration({ url, reason })
  does      ONE transaction: one RESET decision — every rule created before it loses authority by
            A3, no per-rule row is written · draft cleared · `stop` cleared on every PENDING_JUDGEMENT
            row of the page, held bytes kept, so the next scan_captures evaluates them (Gate 0, by
            construction) instead of returning a stop written under the authority just ended
  returns   { rulesLostAuthority: n, decisionsSuperseded: n }
  refuses   NOTHING_TO_RETIRE (no rule in force and no decision under AUTHORITY) · REASON_REQUIRED ·
            STALE_SEQUENCE

get_article_rules({ url })                                                 read, GATED
  returns   { rules: every rule under AUTHORITY — in force or ended, with validTo; retired and
              pre-RESET rules absent — each { ruleId, selector, validFrom, validTo, trusted,
              lastMatched: timestamp|null },
              pendingStop: the PENDING row's stop verbatim with markingUrl | null,
              counts: all seven outcomes, zero-filled, stale: n,
              decisions: every decision on the page, lastDecisionAt }
  refuses   NOT_SURVEYED

list_captures({ url, outcome? })                                           read, GATED
  returns   one entry per row in timestamp order: [{ capture, snapshotDate, outcome, digest,
              comparedTo, rulesetId, snapshotId, stale: bool, stopGates: gate[] | null }]
            — never the held bytes
  refuses   NOT_SURVEYED · INVALID_OUTCOME
```

### A6. Routes — the marking page's only surface

All under `/api/article-rules`, all behind `requireResearcher`, all page-scoped.

```
GET    /pages/:trackedUrlId/captures/:capture
       ← { capture, snapshotDate, outcome, document: inert HTML, rulesInForce: [{ ruleId, selector,
            trusted }], draft: { selectors, trusted, returnedAt } | null,
            stop: { gates: [{ gate, material }, …] } | null }
       404 when no row; 409 for every outcome that holds no bytes: UNFETCHED, UNSERVABLE, IDENTICAL,
       DUPLICATE, SKIPPED
       bytes come from heldBody (PENDING_JUDGEMENT) or the UrlSnapshot's document (ACQUIRED)

POST   /pages/:trackedUrlId/captures/:capture/preview
       → { selectors: string[] }
       ← { keptText, removedText, removedSegments: [{ selector, text }], matchCounts: { selector: n } }
       pure; writes nothing

GET    /pages/:trackedUrlId/draft
       ← { capture, selectors, trusted, returnedAt } | null

PUT    /pages/:trackedUrlId/draft
       → { capture, selectors: string[], trusted: selector[], returned: bool }
       ← the draft; last write wins, no version

DELETE /pages/:trackedUrlId/draft                     the researcher's cancel; the log is untouched
```

The marking URL, carried in every stop and composed in exactly ONE module under src/walk, through
the reused `publicUrl` with the default locale:
`<frontend>/<locale>/article-rules/<trackedUrlId>/<capture>`. The page shows
`approve_article_rules url=<url> capture=<capture>` (with ` rules=0` when the draft leaves no rule in
force) once the draft is returned.

### A7. Concurrency and attribution

Every write tool is one transaction. The page's decision sequence is the compare-and-set: a write that
finds the sequence moved REFUSES with STALE_SEQUENCE and the researcher re-reads. Two researchers on one
page serialise on it; nothing else is locked. Every decision carries the researcher who made it.

### A8. Operational parameters — not judgements

`maxCaptures` is the caller's; a tool call must return, and the walk resumes from NEXT_ROW. There is no
default in the design; the MCP layer may choose one and it changes nothing about the corpus.
