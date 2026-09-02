# The factual layer's article-rules architecture — TARGET, 2026-09-02

**The REASONING behind the design.** The mechanism is `docs/gf-interaction-flows.md`, signed off
2026-09-02, and its appendix holds every shape; nothing here restates how a thing works. What exists
today is `docs/gf-architecture-current.md`; the route is `docs/gf-refactor-plan.md`.

> **VOCABULARY.** The word **era** does not appear in this design. The researcher ruled it out: it named
> an implementation detail rather than anything the research is about. The domain words are
> **redesign**, a rule's **valid-from** date, and a **stop for judgement**.

---

## THE SHAPE, IN ONE PARAGRAPH

One ruleset per page, growing over time. Each **rule is a row** carrying the date and capture it was
created against, applying from that date until a human ends it. One walk takes the archive's captures
in date order; each is derived under the rules valid for its date and compared with the previous
stored capture, and the walk **stops for a human** whenever a segment changes sides, a rule goes
silent, a removal no human has seen falls under a rule they have not yet trusted, or the classifier
calls a diff not editorial. No capture is stored under rules a gate has doubted. There is no admission,
no run, no mode and no count: the walk stops constantly while the rules are new and thins as the
researcher's decisions accumulate. A past extraction changes only by an explicit re-walk, which keeps
the text it replaces. The mechanism, tool by tool, is `docs/gf-interaction-flows.md`; this document is
why each part is the way it is.

---

## 1. A RULE IS A ROW

The single largest change, and it closes four separate problems. The row's shape is in the flows
appendix, A2; what matters here is why a rule needs an identity, two dates and an author at all.

- **The anchor becomes authoritative instead of reconstructed.** Today a rule's creating capture is
  derived by folding the log, with a fallback for rows written before corrections named their capture
  — and that fallback was wrong in BOTH directions on the same day, first stamping 2020 rules with a
  2025 date and then a 2022 rule with a 2020 one. A rule that carries the capture it was marked against
  cannot be mis-stamped by a fold.
- **It fixes I12.** Match observations are keyed today to a hash of the whole selector set, so ANY
  correction orphans every observation and `lastMatchedAt` resets to the value that reads as *safe to
  delete*. Keyed to a rule id, a match is a fact about the rule, and `RuleMatch` — one row per rule per
  capture examined — is what Gate 2 reads and what expiry would read.
- **It is the only thing that can end.** A rule that was right in 2020 and wrong after a 2022 redesign
  is not wrong; it is over. `validTo` says from when, and a rule with two dates governs exactly the
  stretch a human judged it for. A selector string in an array can only be present or absent.
- **It is the only thing a human can trust.** Gate 4 shows a researcher what a rule removes until they
  say the element is furniture whatever it contains. That judgement is about ONE rule, and it needs a
  row to attach to.

**A rule's history stops being a property of a ruleset hash and becomes a property of the rule.** Its
creation, its match record, its trust and its end are all its own, attributed, and reversible by a
later decision.

## 2. RULES APPLY FROM THEIR DATE, UNTIL A HUMAN ENDS THEM

A capture dated *D* is derived under the rules with `validFrom ≤ D`, and `D < validTo` where a rule has
been ended. The predicate is the flows appendix's RULES_IN_FORCE; this is why the two dates are the
right scope.

**Backwards harm is structurally impossible rather than merely unobserved.** A rule created against a
2022 page never runs against a 2020 one, so it cannot remove anything from it — per rule, without
partitioning anything. That is the property the partitioned model was built for, and it is had here
for free.

**Where the date actually bites.** A stored capture's text never changes except by the re-walk, and the
walk goes in date order, so `validFrom` does its work in exactly two places: a capture that lands
between stored ones — a gap the archive filled, a page re-surveyed — and the re-walk itself, which
derives every stale capture under the rules in force for ITS date rather than today's. Without the
date, a correction made in 2024 would rewrite 2020 on the next re-walk.

**It filters backwards and not forwards, and that is accepted with open eyes.** A capture late in the
timeline still receives every earlier rule that has not been ended, most of which match nothing.
Measured, the applied set's match rate decays from `0.89` to no filtering at all across four years.
**A partitioned model decays identically**, because a boundary carries rules forward — which is why
partitioning was dropped rather than kept for this.

**Forward dilution has two answers, and neither is structural.** A rule that has become HARMFUL is
caught by the gates — it moves a segment across the line, or it goes silent — and the researcher ends
it at that stop with `validTo`. A rule that has become merely DEAD, matching nothing for years, harms
nothing and is expiry's question, out of scope here; `RuleMatch` records the silence so that question
can be answered later with a measurement rather than a guess.

## 3. THE SIGNAL IS THE PREVIOUS CAPTURE

Not a ratio, not a baseline, not a threshold on a population: did a segment present in both captures
change sides?

**Why this and not a match rate:** an editorial edit removes text from the DOCUMENT, so it lands on
neither side and does not fire. Only a rule failure leaves content present and on the other side of
the line. That discrimination is what makes it safe to run unattended on a page whose whole purpose is
that it changes — and it is why an article being edited never calls a human, while the rules failing
on that article always does.

**Both directions stop** — the researcher's ruling: *"we are dealing with the very foundation of the
system, we DO want to get human judgement when in doubt."* They are different findings:

| direction | what it means | why it stops |
|---|---|---|
| kept → removed | a rule is taking article text | **data loss** |
| removed → kept | furniture is entering `text`, and `text` feeds `textHash` | **corpus pollution** — every later capture looks novel |

**The blind spot, stated exactly.** The comparison judges text that exists in BOTH captures. Text
appearing for the first time has no side history, so whichever side it lands on is unjudged: a new
paragraph inside an element a rule removes is lost silently, and a new widget the rules have never met
enters `text` silently. Perfect rules on capture *k* say nothing about new text on capture *k+1*. An
earlier draft called this "transition, not state" and answered it with an interactive phase and a
periodic look; both were samples. The real answer is two more gates, in §4: every never-seen removal
is shown to a human until they trust the rule that made it, and every novel capture's diff is judged
by the classifier that was going to read it anyway.

**Why the predecessor is the last ACQUIRED capture and not the last row.** A duplicate's text is its
predecessor's, an identical's bytes are, an unservable has none and a skipped one does not speak; only
an acquired capture carries text a human stood behind. A capture filling a gap therefore compares
against a neighbour that may have been derived under older rules, and the gate fires — which is the
design: a comparison across a rule boundary is exactly where a human should look.

## 4. THE STOPPING RULES ARE GATES, NOT THRESHOLDS

*"No place for magic numbers here, we need clear gates and when in doubt, call a human."*

Five gates — 0, 1, 2, 4 and 5 — are listed in the flows doc and defined as predicates in its appendix
A4. This is why each is a gate, and why none is a number.

**Gate 1 has no number in it, and the measurement says it needs none.** A segment counts only if it
contains a letter or digit — measured, after 69 single bullet characters swamped the first real run —
and any such segment changing sides stops the walk. **0 to 1 drifting segments across a stable
stretch; 129 segments and 1,704 characters at a real break.** A threshold would be a number invented
to sit inside a gap nothing occupies.

**Gate 0 is the bootstrap, and it is a gate rather than a tool.** The first capture has no predecessor
and no rules, so nothing can be derived or compared. That is not a special case to be handled before
the walk; it is the walk stopping on the first thing it cannot check. Making it a gate removed a tool,
a phase and the "no rules" branch from the path that decides corpus membership. The same gate fires
after a reset has retired every rule, which is what makes "start again" free.

**Gate 4 is the answer to the blind spot, and it is a gate and not an interval.** A review on an
interval samples the removed side; a stop on every removal no human has seen covers it. What keeps
that from stopping on every headline of a news ticker is the one judgement a rule already is: *this
element is furniture whatever it contains.* Until a researcher says that about a rule, its removals
are shown; once they say it, they are not. So the walk stops constantly while the rules are new and
thins as trust accumulates — the settling is a sequence of decisions rather than a count, which is
why the interactive phase and its `n` were redundant and were removed.

**Gate 5 costs nothing and decides nothing.** A capture polluted by new furniture is NOVEL, so its
diff against the predecessor is classified anyway — the paid call this whole level exists to bound. A
verdict of NOT EDITORIAL is pollution's symptom, and the walk uses a verdict it already paid for. The
model calls a human; it never rules. It runs last because it is the one paid gate.

**Gate 2's false alarm is accepted.** Furniture legitimately leaving a page silences its rule without
moving any text. That is a CONTINUE at a stop, and the rule does not fire again. Its rate is a
measurement, not an argument, and it is on the dev plan's verification list.

**Gate 3 was the batch bound and is not a gate.** It is the chunk a tool call runs before returning,
so nothing runs unwatched over thousands of captures. With progress derived from the work-list it is
an operational parameter and changes nothing about the corpus. It was removed from the list so that
the list holds only judgements.

**Every gate runs before acquisition. Ruled: no capture is ever stored under rules a gate has
doubted.** An earlier draft ran Gate 5 after storing, because the diff was Level 5's work on stored
captures. The diff needs only the two texts, which exist before anything is stored, so it moved. The
consequence is that a stop always holds an unstored capture, a skip never has to un-store anything,
and no supersession is ever triggered from a stop.

## 4b. ACQUISITION AND CALIBRATION ARE SEPARATE AUTHORITIES

Acquisition gets bytes and keeps them; calibration decides what is article text. Acquisition reads
rules and never writes one; calibration writes rules and never bytes. They alternate capture by
capture, so the separation is of AUTHORITY, not of time, which is what makes it easy to lose.

**Why existence had to be written before any rule is consulted.** The plan required lossless storage,
and one path violated it: the rules decided whether a row existed, so a capture dropped under wrong
rules left no trace. Filtering that deletes by never creating. Writing existence from the archive's
index, before any fetch, is the only way a rule can never decide what the corpus knows about.

**Why bodies are kept by text-novelty anyway.** The alternative, keeping every byte-distinct body, is
~470 MB per large page. What it would protect against is an over-removing rule hiding edits until the
gates catch the transition — a gap the existence row records and the archive can usually refill. The
researcher took the gap, knowing the unservable class is the exception.

**Why the first capture is not a special case.** It has no predecessor and no rules, which is a
condition the walk already stops on. Handling it before the walk, in its own tool, created a second
mechanism and a second place a capture could live. A stop is one mechanism.

**Why there is no admission.** It existed to protect the corpus from a researcher submitting junk,
using a paid model to judge relevance. An invited researcher with write permission is already trusted
with far more than a URL; a verdict nobody acts on becomes a row someone later reads as a judgement;
and a live fetch is a special case of an archive scan. The invariant survives — one deliberate,
attributed act brings a page in, and nothing enters as a side effect — and the survey is that act
because it is the first thing a researcher does with a page.

**Why there is no run.** Everything a run held belonged to the page, and everything it answered was
derivable from the work-list and the log. A parameter that names something derivable is a parameter
that can only be wrong, and this one had already cost two false "I marked it" exchanges. The log
itself stays: immutable attribution of human judgement on a public-evidence platform is its purpose,
and the walk reads it.

**Why there is no commit.** With rules in force from creation there is nothing to activate. Commit
belonged to a model where a ruleset was a versioned artefact that had to be switched on.

## 5. ONE WALK, AND THE PAST IS THE SAME WALK

**Why there is no interactive phase and no automatic one.** The interactive phase existed so a human
would see extractions before the gates were trusted alone, and `n` counted how many they had seen.
Once Gate 4 stops on every never-seen removal until a rule is trusted, the walk is already interactive
exactly where the rules are still being learned, and stops being so exactly where they are known. The
phase boundary and the count were doing that job by counting, and counting was the weaker way. A
design with modes also had to decide when to switch, and that decision would have been a number.

**Why a correction is a re-walk and not a flow of its own.** Three recovery flows were drafted —
correct a scanned corpus, reset a calibration, supersede a past extraction — each from a different
bug in the legacy code. They were one mechanism seen from three places: mark a capture, then walk
again from its date over rows that already have an outcome. Staleness is derived, so the walk finds
the work itself and needs no starting parameter; superseded text is versioned, so nothing is lost;
and a reset is only "retire every rule", after which the first capture stops on Gate 0 like any page's
first capture. One mechanism to build, one to test, one to trust.

**Why the legacy corpus needs no migration.** Every stored capture today was derived under no rules,
which is a valid ruleset with zero rules. The first rule created for a page makes everything from its
date stale, and the re-walk supersedes it keeping the old text. Anchors attest bytes, which no rule
changes, so nothing on chain is orphaned. The corpus is migrated by the product's own mechanism,
after the refactor, rather than by a script before it.

**Why the anchor is written as the capture is stored.** A deferral was ruled earlier for spend, under a
model whose automatic range could waste anchors on a bad run. Under this walk every stored capture was
confirmed or trusted by a human before storing, pollution is bounded to one capture per episode, and
even that capture's anchor is a true hash of real bytes. The receipt is read seconds after the write,
which is the property the receipt-horizon lesson wanted.

## 6. INVARIANTS — TRUE AFTER EVERY STEP, NOT ONLY AT THE END

Each of these is an assertion the acceptance suite holds on every refactor step. A step that breaks
one, however temporarily, is not a step.

| invariant | why it is absolute |
|---|---|
| `fullText` and `contentHash` are never written by any rule or any walk | evidence identity is composed from them; if they move, published evidence moves |
| no `UrlSnapshot` is ever deleted, and no anchor is ever rewritten | the chain attests bytes at a timestamp; a deleted row is an orphaned attestation, which a court reads as tampering |
| a stored capture's `text` changes only by a versioned supersession that keeps what it replaces | a thesis may cite the old text; a silent overwrite makes the citation false |
| the decision log is append-only, and every decision names the researcher who made it | the log's only purpose is immutable attribution of human judgement |
| existence is recorded from the archive's index before any rule is consulted | the one way a rule can never decide what the corpus knows about |
| no capture is stored under rules a gate has doubted | a stop always holds an unstored capture; nothing needs undoing after a human's answer |
| `textHash` means "the derived text under the ruleset in force for this date", and novelty is keyed on it | novelty is what keeps a 3,400-capture archive from becoming 3,400 rows and 3,400 paid diffs |
| no threshold decides anything; every stop is a gate, and every gate calls a human | the researcher's rule, and the reason the design can be trusted on a page whose purpose is to change |
| the marking page decides nothing and applies nothing | it is a pure transformation, ruleset in, draft out; the chat records |
| nothing about a page closes | there is no run, no commit and no end state; a page is walked, stopped, corrected and walked again |

## 7. WHAT IS RETIRED, AND WHY

| retired | why |
|---|---|
| the era: `ERA_BOUNDARY`, the era fold, the partition logic | it named a mechanism, not anything the research is about; date-scoped rules give the property it existed for without partitioning anything |
| the calibration run: `CalibrationRun`, `runId` on every tool and route | everything it held was the page's; everything it answered was derivable; a parameter naming something derivable can only be wrong |
| admission: the model relevance gate and its assessment table | invited researchers are trusted; a verdict nobody acts on becomes a judgement later; the survey is the one attributed entry |
| the ruleset as a hashed artefact: `ArticleRuleset`, `activeArticleRulesetId`, `commit_article_rules` | a rule is a row in force from creation; the ruleset in force for a date is derived, not stored, and there is nothing to activate |
| observations keyed to the ruleset hash: `RulesetObservation` | orphaned by every correction (I12); `RuleMatch` is keyed to the rule |
| the interactive and automatic modes, `CONFIRM_AFTER_CLEAN`, the settle count, the periodic interval | Gate 4 with per-rule trust makes the walk interactive exactly where rules are unlearned; a count was the weaker way and would have needed a number |
| the sampling policy: `next_article_capture`, the maximin and bisect chooser | the walk is sequential; a work-list in date order needs no chooser |
| the survival check: `check_ruleset_survival` | nothing re-derives the past except the re-walk, which runs the gates itself |
| the match-rate and length detectors as signals | superseded by the previous-capture comparison; their thresholds were the numbers the gates forbid |
| `CAPTURE_SHOWN` | nothing read it; the decision that resolves a stop is the record of having looked |
| the bootstrap and correction tools: `calibrate_article_rules`, `correct_article_rules`, `open_article_capture`, `judge_article_capture`, `resolve_era_boundary`, `abandon_article_rules` | each opened a marking session for one kind of capture; with no run to open and the capture as a parameter, they were one act implemented several times |
| the separate recovery flows: correct, reset, supersede | one re-walk from a date, over rows that already have an outcome |
| the fetch-record table drafted beside the CDX index | the index table already was the existence row; a second one was the repository's named dominant defect |

## 8. WHAT IS NOT DECIDED HERE, AND WHERE IT IS

Nothing in the design is open. Rule expiry is out of scope, with its mechanism named; the gate rates
are verified by measurement, on the dev plan's list; and every shape is in the flows doc's appendix.
Both are stated in `docs/gf-interaction-flows.md`, last two sections.
