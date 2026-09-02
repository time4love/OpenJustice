# The factual layer's article-rules architecture — TARGET, 2026-09-02

**The design to refactor toward.** What exists today is `docs/gf-architecture-current.md`; the route is
`docs/gf-refactor-plan.md`.

> **VOCABULARY.** The word **era** does not appear in this design. The researcher ruled it out: it named
> an implementation detail rather than anything the research is about. The domain words are
> **redesign**, a rule's **valid-from** date, and a **stop for judgement**.

---

## THE SHAPE, IN ONE PARAGRAPH

One ruleset per page, growing over time. Each **rule is a row** carrying the date and capture it was
created against, and it applies only to captures from that date forward. Scanning walks the timeline in
order; each capture's extraction is compared with the previous capture's, and **any content that
changes sides stops the scan for human judgement**. Nothing partitions the timeline, and no past
extraction ever changes except by explicit supersession.

---

## 1. A RULE IS A ROW

The single largest change, and it closes three separate problems.

```
Rule
  id             stable identity, independent of any ruleset
  trackedUrlId   the page it belongs to
  selector       the CSS selector
  createdAt      when it was created
  validFrom      the DATE of the capture it was created against   ← the scoping key
  createdFrom    that capture's snapshotId
  researcherId   who created it
```

**Why it is not over-engineering:**

- **The anchor becomes authoritative instead of reconstructed.** Today a rule's creating capture is
  derived by folding the log, with a fallback for rows written before corrections named their capture —
  and that fallback was wrong in BOTH directions on the same day, first stamping 2020 rules with a 2025
  date and then a 2022 rule with a 2020 one.
- **It fixes I12.** Match observations are keyed today to `articleRulesetId`, a hash of the whole set,
  so ANY correction orphans every observation and `lastMatchedAt` resets to the value that reads as
  *safe to delete*. Keyed to a rule id, it stops resetting.
- **It is the only thing that could answer "when did this rule stop matching"** — the question neither
  the union nor the partitioned model can answer, and the only route to retiring dead rules.

```
RuleMatch
  ruleId · snapshotId · snapshotDate · matchedNodes
```

One row per rule per capture examined. **A rule's history stops being a property of a ruleset hash and
becomes a property of the rule.**

## 2. RULES APPLY FROM THEIR DATE FORWARD

A capture dated *D* is derived under the rules whose `validFrom ≤ D`.

**This makes backwards harm structurally impossible rather than merely unobserved.** A rule created
against a 2022 page never runs against a 2020 one, so it cannot remove anything from it — per rule,
without partitioning anything.

**It filters backwards and not forwards**, and that is accepted with open eyes: a capture late in the
timeline still receives every earlier rule, most of which match nothing. Measured, the applied set's
match rate decays from `0.89` to no filtering at all across four years. **A partitioned model decays
identically**, because a boundary carries rules forward — which is why partitioning was dropped rather
than kept for this.

**Forward dilution is answered by `RuleMatch`, not by structure**: a rule that has matched nothing for
a long stretch can be retired, which is expiry, and expiry needs observation.

## 3. THE SIGNAL IS THE PREVIOUS CAPTURE

Not a ratio, not a baseline, not a threshold on a population.

```
content KEPT by the previous capture, REMOVED by this one   → losing article text
content REMOVED by the previous capture, KEPT by this one    → furniture entering the text
```

**Why this and not a match rate:** an editorial edit removes text from the DOCUMENT, so it lands on
neither side and does not fire. Only a rule failure leaves content present and on the other side of
the line. That discrimination is what makes it safe to run unattended on a page whose whole purpose is
that it changes.

**Both directions stop the scan** — the researcher's ruling: *"we are dealing with the very foundation
of the system, we DO want to get human judgement when in doubt."* They are different findings:

| direction | what it means | why it stops |
|---|---|---|
| kept → removed | a rule is taking article text | **data loss** |
| removed → kept | furniture is entering `text`, and `text` feeds `textHash` | **corpus pollution** — every later capture looks novel |

**Known blind spot, stated:** drift detects a TRANSITION, not a STATE. Two equally-broken consecutive
captures have nothing changing sides, so a scan that resumes mid-breakage sees nothing. Measured: the
2025 captures are silent while their match rate reads `0.07`. **A run must therefore not begin in
automatic mode** — see §5.

## 4. THE STOPPING RULES ARE GATES, NOT THRESHOLDS

*"No place for magic numbers here, we need clear gates and when in doubt, call a human."*

```
GATE 1   any content segment changes sides            → STOP
GATE 2   a rule matches nothing on this capture that
         matched on the previous one                  → STOP
GATE 3   the batch reaches its bounded size           → STOP
GATE 4   the periodic check interval elapses          → STOP
```

**Gate 1 has no number in it.** A segment counts only if it contains a letter or digit — measured,
after 69 single bullet characters swamped the first real run — and any such segment changing sides
stops the scan. The measurement supports it: **0 to 1 drifting segments across a stable stretch, 129
segments and 1,704 characters at a real break.** The separation is large enough that a threshold would
be a number invented to sit inside a gap nothing occupies.

**Gates 3 and 4 are derived, not chosen.** The batch is bounded so no tool call runs unwatched over
thousands of captures; the periodic check is *the system validating itself* against its own blind spot
in §3. The interval follows from the timeline size and the batch bound rather than being picked.

## 4b. ACQUISITION AND CALIBRATION ARE SEPARATE RESPONSIBILITIES

```
ACQUISITION    get bytes from the archive and keep them        maintenance act
CALIBRATION    decide what of a page is article text           research act
```

**ACQUISITION READS RULES; CALIBRATION WRITES THEM.** One direction, not entanglement.

The plan already required this in two places — *"storage is lossless, filtering is a versioned view that
MARKS and never DELETES"*, and the research-act/maintenance-act split — and one thing contradicted it:

```
rules → text → textHash → novelty → WHETHER A ROW EXISTS AT ALL
```

**The rules decided what was in the corpus**, so a capture dropped under wrong rules left no trace. That
is filtering that deletes, by never creating.

**EVERY CAPTURE NOW LEAVES AN EXISTENCE ROW** — date, wayback timestamp, raw-bytes hash — whether or not
its body is kept. Under a megabyte per 3,400-capture page, against ~470 MB to keep every body. A missing
body is then an unexplained gap that Wayback can refill, never an untrue silence.

**Acquisition never stops for judgement.** Wrong rules make furniture leak, `textHash` change, and the
pass OVER-store — the safe direction, and the existence rows mean nothing is lost either way.

**THE FIRST FETCH IS NOT AN ACQUISITION.** `calibrate_article_rules` fetches the earliest capture WITHOUT
persisting it, purely so a human can mark it and rules can exist. Every acquisition after that has rules,
which removes the "no rules" special case from the path that decides corpus membership. The capture is
re-fetched during the scan — free, idempotent, and it avoids a second place a capture can live. A draft
capture table was considered and rejected for exactly that reason.

What survives is one asymmetry that cannot be removed: **the first STORED capture has no predecessor**,
so drift is undefined for it. Harmless — it is the capture the researcher just marked.

**`commit_article_rules` IS RETIRED.** With rules in force from the moment they are created, there is
nothing to activate; `textExtractionVersion` already records which ruleset produced each capture's text.
The tool belonged to a model where a ruleset was a versioned artefact that had to be switched on.

## 5. THE FLOW

```
survey the archive              how many captures, over what span, how many held
   ↓
INTERACTIVE   next capture in date order → mark → approve
   ↓          repeated until n consecutive captures need no correction
AUTOMATIC     run under the settled ruleset, stopping at any gate
   ↓
JUDGE         the stop is a question, not a conclusion:
              REDESIGN     → correct the rules, continue
              BAD CAPTURE  → skip it, reason REQUIRED, continue
   ↓
back to INTERACTIVE until the ruleset settles again
```

**The redesign/bad-capture question survives the removal of partitioning.** It no longer creates
anything structural — it decides *correct the rules* versus *this capture does not speak*. A skipped
capture is excluded from **diffing** as well as calibration, or a truncated page manufactures a false
"text removed" diff.

**Automatic mode is entered, never assumed.** A run starts interactive because §3's blind spot means a
scan cannot tell a settled ruleset from a uniformly broken one without a human having seen at least
one capture.

## 6. WHAT DOES NOT CHANGE

- **A past extraction changes only by explicit supersession.** Recording derives; committing versions
  the ruleset and re-derives nothing.
- **`fullText` and `contentHash` are untouched by rules**, so evidence identity cannot move.
- **The marking page stays a pure transformation** — ruleset in, draft out, no decision, no effect.
- **The log stays append-only**, and `reset_article_calibration` still draws a line under a calibration
  that has become entangled past repair.
- **Storage stays lossless**; filtering is a versioned view.

## 7. WHAT IS DELETED

| going | why |
|---|---|
| `ERA_BOUNDARY`, the era fold, `governingEras`' partition logic | the vocabulary and the mechanism are both out |
| `eraDetectors`' match-rate and length signals as PRIMARY | superseded by the previous-capture comparison; may survive as diagnostics |
| `next_article_capture`, `nextCapture.ts`, the stratified sample | the sequential walk replaces sampling |
| `check_ruleset_survival` | with rules scoped by date and no re-derivation, it has no caller |
| `CONFIRM_AFTER_CLEAN` as a per-partition rule | becomes per-run, which also dissolves the short-partition problem |
| `commit_article_rules` | rules are in force from creation; there is nothing to activate |
| `activeArticleRulesetId` | written and never read, and now meaningless |

## 8. OPEN, AND DELIBERATELY NOT DECIDED HERE

- **The retirement rule for a dead rule.** `RuleMatch` makes it answerable; how many captures of no
  match justify retiring one is unmeasured, and a number picked now would be the magic number §4
  forbids.
- **Whether `RuleMatch` is written for every capture or only where a rule's state changes.** One row
  per rule per capture is exact and grows with the corpus.
- **The periodic-check interval's formula**, beyond "derived from timeline size and batch bound".
- **Body retention.** Existence rows are decided. Whether bodies are kept by TEXT-novelty (which leaves
  acquisition reading the rules) or by RAW hash (rule-free, and ~470 MB per large page) is not.
- **Whether acquisition and calibration share one run** or hold a `ScanRun` and a `CalibrationRun`.

→ The step-by-step interactions, with the tool and the state changed at each step:
`docs/gf-interaction-flows.md`.
