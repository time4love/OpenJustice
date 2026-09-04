# The factual layer's article-rules architecture — TARGET, 2026-09-02

**The REASONING behind the design.** The mechanism is `docs/gf-interaction-flows.md` for the
factual layer, `docs/gf-evidence-flows.md` for evidence, `docs/gf-thesis-flows.md` for the thesis
and `docs/gf-document-flows.md` for documents, all signed off with the researcher;
their appendices hold every shape, and nothing here restates how a thing works. What exists today
is `docs/gf-architecture-current.md`; the route is `docs/gf-refactor-plan.md`; a researcher's day,
read as a sequence of tool calls, is `docs/gf-researcher-day.md`.

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
verdict of "not editorial" is pollution's symptom, and the walk adds one question to the call it
already pays for — the classifier did not answer "editorial?" before; it does now, versioned. The
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

## 9. EVIDENCE — WHY A RECORD, NOT A CLAIM

A researcher's day on the platform has an hour of calibration that judges nothing, a corpus that
holds every real change a page went through, a thesis that selects from it and says why, and a
public surface where the selection and everything it left out are both in view. The evidence
layer is the part between the corpus and the thesis, and the design's whole argument is that it
is thinner than it looked. That day, step by step with the tool that carries each step, is
`docs/gf-researcher-day.md`; the mechanism is `docs/gf-evidence-flows.md`; this is why each part
of it is the way it is.

### 9.1 The corpus already holds the evidence

The design began with evidence as "a claim made from captures". The researcher asked what a
claim adds to the record beneath it, and item by item the answer was nothing: the identity is a
name for a record the corpus already keys; the bytes, the anchor, the diff and its survival
verdict are the walk's, written before any research act; the classification is an opinion the
diff already carries. What is new is only the selection — who, when, why, and whether they still
stand behind it. **So evidence is a corpus record a researcher has promoted, and the row that
records it is the record, marked.** Three things follow, and each removed a mechanism:

- **Identity is the record's own name**, ruling 1 read literally: `CAPTURE_ID` and the pair
  hash are deterministic from the corpus, so RECOMPUTABLE is a predicate a row either satisfies
  or is malformed by, never a rate. There is no "re-hash" tool, because a row that fails it did
  not drift; it was written wrong.
- **The name is derived and never stored on the record.** Its inputs are immutable, so a stored
  copy could not go stale — but nothing queries by it, the pair of page and timestamp is already
  unique, and a hash-shaped column beside `documentHash` is the shape that once let a SHA-1 sit
  in a SHA-256 column across both environments. The one stored copy is the evidence row's
  public name, and the predicate keeps it honest.
- **`create_evidence_from_url` was wrong for a reason the old model could not state**: it made
  a selection with nothing to select. Under this model that is not a defect in a tool but a
  category error, and the tool has no replacement — the corpus is entered by survey.

### 9.2 Why there is no promotion without a thesis, and why the citation comes first

Why is this diff important? The question has no answer outside a claim someone is trying to
establish. A news article quoting the ministry on safety is a page; a ministry page losing a
paragraph on adverse events is a change; the thesis that the two happened in the same week is
what makes either of them evidence. **Importance is a relation, and the relation is the
thesis's.** So the rationale belongs to the citation, one row per record and many citations,
and there is no promotion that does not name the thesis it serves. `promote_scan_findings`,
which promoted whatever the classifier called significant, was the classifier selecting
evidence, and it is gone.

**The citation precedes the argument.** The first draft argued for a record and cited it later,
and that order produced a state with no meaning: a thesis that argued for a record its text
never used. The order that removes it is to cite first — a version names a corpus record by its
derived name, which exists before any evidence row — and to argue on the citation. The assessor
then reads the argument against the passage that cites the record, which is a stronger
SUBSTANCE gate than one judged against a thesis as a whole, and a draft may hold unargued
citations exactly as long as it is a draft.

**The corpus is the counterweight, and it must be said out loud.** Evidence promoted in light
of a claim is by construction the claim's side. That is honest only if everything not selected
stays reachable, and it does, because storage is lossless and the walk keeps every real change.
The critic's material is the corpus, never the evidence table — which is the first design under
which the Prosecutor has something concrete to search.

### 9.3 Why content is a version, and why CURRENT is derived

Everything a record says beyond its name is derived — from bytes, under a ruleset, by an
extractor, a differ and a classifier, each of which can change. Drift under a citation is
therefore not preventable; it is made visible and rare, by holding content as append-only
versions and having a thesis cite one. A version is **named by what it contains**, not by what
produced it, so a re-derivation that changes no text creates nothing — the same rule the flows
doc applies to a text version, and the reason a restamp is free. Two registers live on a version
and only one is pinned: the computed chunks, which check 17 judges and a citation names, and the
classifier's opinion, which is provenance and never part of the hash (Level 8, as a data shape).

**CURRENT is derived because a pointer the walk had to move would be the walk writing
evidence.** The two authorities of the factual layer — acquisition reads rules and never writes
one — hold here in the same form: the walk writes versions and never an evidence row; research
acts write evidence and never a version. What the evidence row stores is the one thing only a
human can produce, the version they last stood behind.

**The row carries no prose.** The change's description is the version's computed content, the
classifier's words are opinion on the version, the researcher's words are the citation's
argument. A tier is a strength score nothing verifies, and it was dropped rather than moved; a
role is relative to a thesis and went to the mention.

### 9.4 Why nothing above the corpus is anchored

The first draft registered every promoted record on chain and defended it with four
attestations. Examined, three of them were the corpus's already and the fourth was the thesis's:
the bytes are anchored at acquisition; the archive's name for a capture is bound to those bytes
by the archive itself, a second witness anyone can ask; a pair of captures is derived from the
corpus and can stop being consecutive; and the commitment "we will not swap what a thesis cites"
belongs to the act that is public, publication, whose version hash pins every citation at once.
**The chain attests the corpus, and a chain entry for a derived fact attests only that someone
wrote it.**

Two things fell with the write. The confirmation moment existed because a chain write was
irreversible and deserved its own act; with no write it was ceremony, and a record is simply
promoted, its standing for publication derived. And the hazard class that produced the false-
CONFIRMED audit — a laptop mixing one environment's database with another's registry — lost its
only research-act path: the walk is the sole chain writer and runs in the deployment. That is
the plan's own principle, *prefer removing the capability over forbidding its use*, applied to
the capability it was written about.

### 9.5 Why the public reads the corpus

An outsider verifying a thesis does not consult our evidence table. The cited record resolves
to a capture or a pair, the capture to bytes, the bytes to the registry and to the archive. The
evidence table is the linkage between corpus and thesis and is read by nobody outside; a public
evidence surface ranked by an embedding of prose was a catalogue of selections with the
unselected hidden. **The public surface is the corpus and the published theses**, and the
repaired timeline is one read for everyone, with published citations as its linkage.

**Publication opens the page, not the record.** Surveying a page is a research act, and a public
list of surveyed pages says "under investigation" before any thesis says why — the framing risk
the defamation rules rank first. A page becomes public in full, every capture and every diff,
the moment a published thesis cites any record of it; that is what makes the counterweight of
§9.2 real for an outsider and not only for a researcher. The alternative, the whole corpus
public from the survey, is simpler and would be accepted if the framing risk were judged small.
The record alone becoming public was never acceptable.

### 9.6 Why review is stop-shaped, and narrowing is not a flow

When a re-walk moves a cited record's content, the old version is kept and every citation still
pins it; nothing is wrong yet. What is owed is a judgement no pass can make — does the new
version still support what the thesis says — and so the review has the walk's shape: a list of
what is owed, old beside new, one command per record, and **no automatic re-affirmation, ever**.
Withdrawal keeps everything, because a withdrawn record is what lets a reader of the thesis that
cited it find out what happened. A published thesis is flagged beside the citation and never
unpublished by the platform: silent unpublishing rewrites the public record, and silence
misleads its readers.

Interval narrowing was ruled a flow and fell to one question: does the archive place captures
between ones we hold? It does not; it appends with new dates. A capture lands between two in two
ways, and the first, the re-walk turning a DUPLICATE into an ACQUIRED capture, already puts the
wide record in review because its endpoints' text moved. The second, index lag, changes no text,
leaves a wide claim true and coarser than the corpus, understates precision — the safe
direction — and is measured rather than handled. What survived is a predicate: a new citation
takes what the corpus holds at its finest, and a reviewed record shows its narrower diffs as
material.

### 9.7 Why the database is disposable and the registry is fresh

The corpus is small, the one thesis is the researcher's own, there are no users. Every row can
be rebuilt from the archive and the code; what cannot be rebuilt is the chain. So the design's
care goes to the chain and nowhere else: no supersession of evidence identities, no legacy
statuses held by source scans, no migration.

The plan's "one registry, forever" refused a replacement deployed to escape a registry's
problems while the database that explained them was kept. This is the opposite act: the
database goes, the old contract stays public and immutable, and every entry on it is explained
in a committed ledger. The fact that decides it was read from the chain, not from a document:
**production's registry holds 20 entries — 12 extraction anchors covering 83 captures and 8
evidence names under the retired formula, all written on two days in August — and not one is a
hash of bytes.** A fresh contract is one meaning from index zero, and a verifier of any future
thesis never needs the ledger. That window closes with the first production capture the new
walk anchors, so the rotation happens before it and is held shut by a refusal derived from the
chain rather than by a rule: a registry accepts writes only while it is empty or its first entry
carries the anchoring scheme. If production already held entries under the new meaning, the
answer would be the same contract with the scheme in the category field.

**Attribution is read from chain state, never from receipts.** The audit's `TX_UNREADABLE`
described a transaction our row named, past the RPC's horizon; the registry's own state says who
registered a hash and when, forever. Level 9's "unsatisfiable" was a finding about the
instrument's question. It is measured on both registries before it replaces receipts.

**Staging is the rehearsal, and the mainnet act is one-shot.** A botched production deploy would
put a third contract on Base and hand a hostile reader the story the design answers, so the
same path runs on Sepolia first, in full, before production begins.

### 9.8 Invariants — true after every step

| invariant | why it is absolute |
|---|---|
| `Evidence.fileHash = ID(the record it is keyed to)` | a row that fails it is malformed, and a tool that repaired it would hide how it got that way |
| the walk never writes an evidence row, a mention or a decision | CURRENT is derived; a pointer the walk moved would be acquisition judging research |
| no research act reaches the chain; the registry's `submit` has one caller | the false-CONFIRMED class has no path left to travel |
| a citation pins only the record's `affirmed` version | a thesis cannot cite a version nobody stood behind |
| no promotion without a citation in the thesis's head version | a thesis cannot argue for a record it does not use |
| the evidence row carries no prose and no opinion | nothing presents a model's judgement as fact, as a schema rather than a sentence |
| nothing is deleted after the rebuild; a withdrawn record keeps its name, argument and citations | the reader of a thesis that cited it can find out what happened |
| a registry accepts writes only while empty or scheme-stamped at index zero | one meaning per contract, enforced by the contract's own state |

### 9.9 What is retired, and why

| retired | why |
|---|---|
| evidence as "a claim"; `create_evidence_from_url` | a selection with nothing to select |
| thesis-less promotion; `promote_scan_findings`; the debate as "is this evidence?" | importance is a relation, and the relation is the thesis's |
| the confirmation act; `promote_evidence`; the evidence chain write; `CONFIRMED` | nothing above the corpus is anchored; the act was ceremony without the write |
| `search_evidence`; the evidence routes; the public evidence surface | a catalogue of selections with the unselected hidden |
| `delete_evidence`; `SUPERSEDED`; `previousFileHash` | nothing is deleted, identity never moves, legacy names are explained in git |
| summary, tier, role and categories on the evidence row; `SummaryCorrection` | prose and opinion belong to the version or the citation, or nowhere |
| interval narrowing as a flow | the case it handled is the re-walk's, and the archive's case is measured |
| the legacy migration; `forensics:rehash-evidence`; `forensics:confirm-anchors` | the database is disposable; attribution is chain state |
| "one registry, forever" | its premise was a kept database; the fresh contract is one meaning from index zero |

## 10. THESIS — WHY A CLAIM IS CHOSEN BEFORE IT IS WRITTEN

The thesis layer sits on the evidence layer and is thinner than it was built, for the same reason
§9 found evidence thinner than it looked: item by item, the researcher asked what each mechanism
added to the record beneath it, whether the state it created should exist at all, and whether the
scenario it served was real. The mechanism is `docs/gf-thesis-flows.md`; this is why each part of
it is the way it is.

### 10.1 The glasses come first

A thesis was written and then framed, and its framing was assessed against evidence summaries a
model had written. Under this design the order inverts and the material changes. The platform
exists to test one question — whether the state and the ministry violated the Nuremberg Code, and
where the Code does not reach, Israel's own law — and a provision of that law says what a
violation is made of: a duty holder, what was known and when, what the public was told and when,
and the gap between the two timelines. So a provision is the GLASSES a researcher puts on before
reading the corpus, and framing is where they put them on: the claim's wording, tested against
the corpus's COMPUTED content — never a summary — and, for each element of the provision, the
record that supplies it or the word MISSING. **A missing element at framing is the first gap, and
a gap is the honest output of a design that refuses to write around one.** The Prosecutor, when
it exists, proposes clusters of that shape; it feeds framing and never frames.

Two defects the framing round carried are removed by shape. The assessor quoted the researcher
and the quote was wrong the same way four times; now a quote that is not a substring of the
proposal is labelled as a paraphrase, shown, and never dropped. The assessor asserted page wording
the page never had; now every assertion a model makes about a record is checked against that
record by the one verdict rule that already audits the researcher. **Both parties to the round
are audited by the same rule**, and the one whose word had gone unverified was the one the
researcher was told to defer to.

### 10.2 Models write; the researcher decides

The first draft of this design said no model writes thesis text, and the researcher refused it:
reading a corpus record against a claim and turning it into coherent, grounded prose is the
model's strongest capability, and writing it by hand is long work. The line that matters is not
who types but who stands behind it. **Nothing a model writes becomes a version, a citation, a
promotion, a request or a publication except by the researcher's act, after the researcher has
read it**, and a version is the researcher's statement whoever produced the words. What carries
the label "AI analysis" is the opinions — assessments, critiques, verdicts — and they stay gated;
what goes public is approved text. The agent that rewrote the thesis under an instruction to
soften, unread, is retired: the ratchet the prosecutor plan diagnosed was that agent, and
answering an objection has three outputs — the corpus answers it, a document would, or the
researcher concedes — with "quietly hedge" not among them.

### 10.3 What is not there

- **There is no session.** A row with an id and a status, opened by one act and closed by another,
  holding one researcher to one thesis and logging an event beside everything that happened.
  Every event was a copy of a row that already existed; the lock protected nothing the head's
  compare-and-set does not; closing wrote a flag. *What exactly does a day close?* Nothing. The
  history is derived from the acts, framing is a record of rounds, a note attaches to what it is
  about, and authorship refuses a stranger's write.
- **There is no key figure.** The duty holder is the office; a violation is two timelines and a
  gap; a person adds nothing to a charge and has no content version to pin. The dossier that
  aggregated everything about one named individual was the reputational-attack surface the
  compliance rules feared, and its only source was a model's output on the evidence row, already
  gone. A published thesis names offices and roles, never a person; the corpus records beneath it
  carry names as the pages said them; the one real use — which records mention a name — is the
  gated corpus search.
- **A FOIA request is not state.** The platform cannot know a letter was sent, and a SENT it
  could not verify would be a public claim on one person's word. Freedom of information is a
  public action: the thesis publishes the request ready to send, in the statutory form a model
  drafted and the researcher approved, resting on named records, and any citizen sends it under
  their own name. An answer, like a whistleblower's submission, arrives through the public's
  intake and is R12's — the DOCUMENT class, scheduled and not designed here, with no placeholder
  built for it, because a platform that waits for every design to close never works.
- **Publication anchors nothing.** The registry carries one meaning from index zero — the hash of
  a page as served — and a thesis hash on it would be a second; on a second contract it would add
  a timestamp on the platform's commitment that the public page and the archive already give. No
  research act reaches the chain.
- **The version tree does not branch**, the body is text and not an editor's JSON, a page is
  cited through its records and not by itself, and the analysis is a row beside the version and
  not a column on it.

### 10.4 What is there, and why it is enough

A claim chosen after an assessed round, restated verbatim on every version so the gate can tell a
reworded claim from a framed one. A version write that is one transaction — text, hash, mentions,
each pin computed and never supplied — with a compare-and-set in place of a lock. A gap list that
is the researcher's, one decision per gap, so that what a thesis lacks is on record from its first
day and a published thesis ends in two appeals derived from those decisions: a call to the people
who saw the document and a request any citizen can send for it. A gate of seventeen checks, each a
predicate with one implementation or an opinion that says so, none non-binding. A public page that
resolves every citation to the corpus, shows beside it what the platform has since learned, and
links to everything the researcher looked at — the selection and the counterweight both in view.
And after publication, nothing silent: a flag beside a citation, a notice where a withdrawn thesis
was, pages that stay open, and one list that tells an author what they owe.

### 10.5 The invariants this layer adds

| invariant | why it is absolute |
|---|---|
| a version's claim is one the author chose after an assessed round under the thesis's provision | a claim never tested against the corpus is the state that published a false one |
| a citation's pin is computed by the write and equals `affirmed` where a human affirmed one | a thesis cannot cite a version nobody stood behind, and cannot be asked to type a hash |
| every write on a thesis is its author's; two writers meet a compare-and-set, never a lock | attribution is per act, and a lock is a row someone forgets to release |
| no model output becomes state except through a tool the researcher called, after the audit | models write; the researcher decides |
| no row describes another row; the history is derived | a log is the copy that drifts, and a closed session was a decision nobody made |
| a published version is never edited and never unpublished by the platform; flags are derived | the public record says what happened, and only its author may withdraw it |
| a published version names no person; the appeals name units and roles | truth is the only defence and the burden is the platform's |
| nothing above the corpus is anchored; the registry's `submit` keeps one caller | one meaning per contract, and no research act on the chain |
| opened pages stay open | a public record retracted is the state this design keeps nowhere |

### 10.6 What is retired, and why

| retired | why |
|---|---|
| the research session, its lock, its event log; `create_research_session`, `close_research_session`, `get_session_summary`, `add_session_note` | every event was a copy; the lock guarded nothing; closing wrote a flag |
| the key figure, `KEY_FIGURE`, the dossier, its routes, per-sentence hedging | a person adds nothing to a charge; the surface was the risk |
| the FOIA request as state; `generate_foia_request` as a writer | the platform cannot verify a sending; the request is the public's |
| `RevisionAgent`, `GapRevisionAgent`, `get_research_agenda`'s rewrite and embedding search | text that became a version unread, under an instruction to soften |
| `cite_trajectories`, `TRACKED_URL`, TipTap as the record, `ThesisVersionStatus`, `title` | a second writer, a citation of nothing pinned, an editor's format with no editor, a status for an opinion, a heading that was not the claim |
| `ThesisGapResolution`, gaps by index, `CALL_LIVE`, `GAP_ACTIONABILITY`, `FIGURES_HEDGED`, `OFFICIAL_CAPACITY`, `FRAMING_ATTACHED`, `ANALYSIS_COMPLETE`, `ANALYSIS_WELL_FORMED` | each replaced by a predicate with one implementation, or left with no subject |
| the browser as an editor and every research act it performed through a route | the chat is the workflow; a dialog returns a command |
| anchoring the published version | a second meaning on a registry rotated to have one |

## 11. DOCUMENTS — WHY BYTES WITH NO ARCHIVE ARE ONE CLASS, SEALED AT THE PUBLIC DOOR

The document class is what comes back through the two appeals a published thesis ends in, and
what a researcher holds of a page the archive lacks. It is the one class of record with nothing
beneath it — no page, no archive timestamp, no second witness — and the design's whole argument is
that this changes what can be verified, not what a record is. The mechanism is
`docs/gf-document-flows.md`; this is why each part of it is the way it is.

### 11.1 One class, because provenance is asserted

Five things arrive: a whistleblower's submission, a FOIA answer to a request the platform
published, a FOIA answer nobody requested through it, a capture of a blocked page, a capture of a
page never archived. The first draft asked whether they were subclasses, and the answer was that
every difference between them is something the party at the door asserts — that a source saw
this, that a ministry sent it, that a URL served it on a date — and the platform can verify none
of it. A `FOIA_ANSWER` row would be an unchecked claim written into the schema. What the platform
can verify is the door: the public's, anonymous, under the terms, addressed to a published thesis;
or a researcher's, attributed, through MCP. **One class, two doors, and every downstream
difference is either a property of the door or a decision a researcher makes on reading.**

The researcher's correction that shaped the class: the archive confers no credibility. Wayback
captures untrustworthy sites too; what makes a ministry page a good record is `.gov.il`, and what
makes a FOIA answer a good record is its letterhead and signature. So **custody and credibility
are kept apart everywhere**: custody is attested by an instrument — the archive and the registry
for a capture, the platform's receipt and commitment for a document — and credibility is a human's
reading of the bytes, argued in the citation, never a kind.

### 11.2 Why the name is the plaintext hash, and why custody follows the door

Identity is a property of bytes held (evidence §2), and a document's bytes are the whole record,
so its identity is their SHA-256 — plain, unprefixed, over the file exactly as handed over, so
that a ministry, a journalist or the source can check it with `sha256sum` and no knowledge of the
platform. The ciphertext hash the code used gave one letter as many names as encryptions and let
no holder of the original recompute it.

The vault promise on the public safety page — encrypted in the browser, sealed on IPFS, plaintext
read in memory once and never stored, no key kept — is kept for everything through the public
door. The design went through a sender's declaration of what their material is, public record or
internal, and withdrew it twice: the platform cannot check the declaration, and a wrong one is the
platform possessing what it must not. **Custody follows the door: the public's is sealed, always;
the researcher's is held, always**, because a researcher has read what they hand over. The cost is
named: a citizen-sent FOIA answer is sealed and the researcher never sees its letterhead; the way
to a held copy is the researcher obtaining the original, which the published request lets them do
as a citizen.

Content is a version, as for every record. What is new is the line between an extractor's text —
reproducible from the bytes at a pinned version, pinned by citations — and a model's transcription
or description — an opinion, labelled, never cited. A vision model reads a scanned Hebrew memo
better than any engine, and its reading is still an opinion, because two draws differ and nobody
can recompute it. Derivation runs on the server, in memory, at receipt, for both doors: one
extractor, one version, and a sealed document's text derived in the one moment its plaintext
exists.

### 11.3 Why every document is committed, never named, on the chain

A document is not above the corpus; it is a corpus record with no page. So it is anchored at
receipt as a capture is at acquisition, by the same module, in the deployment, as an act of
acquisition and not of research. The one-meaning rule is answered by the category field the
evidence design put on the registry for exactly this: a second meaning, self-describing on the
same contract.

The first draft anchored a held document by its name and a sealed one by a salted commitment. The
researcher's question — what if a sender declares an internal document public? — showed the name
anchor irreversible before anyone had read the file, and the door-based custody that followed
removed the declaration; but the commitment stayed and became the rule for every document, then
became the document's **public name**. A registry of plaintext hashes is a leak detector: an
authority hashes its own copies and learns the platform holds that exact document, and where
copies are individually varied, learns who had it. With the commitment as the citation token and
the registry entry, **no hash of a copy a source held is ever published**, and the researcher's
judgement about whether an authority varies its copies — a burden the first draft put on them —
does not exist. The plaintext hash is served only when the file itself is, where anyone could
compute it. Receipt is never refused for a chain outage: a whistleblower turned away may not
return, so the anchor is owed and a standing pass pays it.

### 11.4 Why the sender holds the only key, and there is no contact

Two risks meet at the sealed document, and a sender can waive only one. The platform's risk —
possessing a classified document — is the operator's, and a stranger's permission does not lift
it, so there is no "you may decrypt" a sender can grant. The sender's risk is theirs, and what
they can waive they already hold: the key the browser showed them once, the salt and the CID. The
server holds the key for one call and discards it; the platform can produce nothing on any
demand, and its promise "even from us" is literally true. The researcher reads a sealed document
as its receipt text and the labelled opinion, never as bytes.

A contact — encrypted to a key the server held — was the one piece of state an operator without
press standing cannot protect, and the safety page's "no identity stored" was false while it
existed. It is gone: the return channel is the published thesis, and a source who wants to say
more sends more. The model at the door is gone too: the preview that showed a sender "the AI did
not detect relevance" was a model deciding at the door, in front of the one person it must never
coach. What remains for counsel, said plainly rather than hidden: the platform holds a sealed
document's derived text at rest, on the reading that text is its own record of what a source said.

### 11.5 Why what publication opens is a decision, and why it only widens

For a corpus record publication opens the page. A document has no page, and whether its bytes
name a source, carry a classification or are a public record is a fact only a reader knows. So
what opens is decided per document by the researcher who read it, before publication, as one of
three openings — the passage alone, the content, the bytes — and the gate refuses a version with a
document undecided. The platform enforces that the choice is made; it cannot make it, because
content can identify a source when few people saw it, and that is the act of publishing itself.
Opening only widens, on the reasoning that opened pages stay open: what the public has read, it
has read. Redaction is a document a researcher makes, with its own identity, not a mode: a part
the platform cut would be content the platform authored under the original's name. A model's
reading — the very metadata COMPLIANCE.md's state-secrets note fears — is published never.

### 11.6 Why withdrawal is the sender's act, and what "nothing is deleted" still means

An anonymous sender has one credential, the key, and only its holder can open the sealed copy;
presenting it is proof of sending, and the platform needs no other and asks no researcher. A
consent the platform could decline to un-give is not consent. The act it triggers, SHED, is the one
destruction in the design beyond the rebuild's drop, defined once: it removes what the platform
holds of the document — bytes, its pin, every derived text, every opinion — and keeps everything
about it — identity, commitment, hashes, arrival, citations, decisions and the shed record. The
reader of a thesis that cited it can still learn what happened; nobody can read what the sender
took back. The text goes with the bytes, because a withdrawal that kept the text would be one in
name, and every citing thesis is flagged and owes a new version — the evidence review's shape,
with one new cause. The same act carries an operator cause, with a reason, so that a legal demand
never has to be met by inventing a delete; when it is used is counsel's.

### 11.7 The invariants this layer adds

| invariant | why it is absolute |
|---|---|
| everything through the public door is sealed; everything through the researcher's is held | the platform cannot check a declaration, and a wrong one is possession |
| a document's identity is the plaintext hash; its public name is the commitment; the identity is served only with the bytes | no hash of a copy a source held is ever published, and no researcher has to judge whether copies vary |
| the sender holds the only key; the platform keeps no key, no plaintext of a sealed document, no contact, no sender identity | the platform cannot produce what it does not possess, on any demand |
| a model's reading of a document is an opinion — labelled, never pinned, never cited, never published | credibility is read by a human and argued; the §114 metadata never goes public |
| the walk touches no document; nothing is diffed against a document | a diff is the corpus's interval; a document's date is one researcher's word |
| every cited document has an opening decided before publication, and an opening only widens | the choice is made by the person who read the bytes, and a public record is not retracted |
| withdrawal is honoured on the key with no decision; SHED removes content and no row | consent is the sender's to withdraw; the record of what was here is not |
| receipt is never refused for a chain outage; the anchor is owed and paid by a pass | a source turned away may not return |

### 11.8 What is retired, and why

| retired | why |
|---|---|
| subclasses of document by provenance; a sender's declaration of what their material is | provenance is asserted; the door is verified |
| the ciphertext as a name; the concatenation of screenshots into one name | one letter, many names; a name only its author can reproduce |
| extraction in the sender's browser | a second extractor at a version the platform cannot pin |
| anchoring a held document by its plaintext hash | irreversible before anyone read the file; a leak detector |
| the "you may decrypt" override; the contact; `Whistleblower` | a stranger cannot waive the operator's risk; a stored route to a source cannot be protected |
| the model's verdict and preview at the door | a model deciding in front of the sender |
| redaction as an opening mode | content the platform authored under the original's name |
| a researcher deciding whether to honour a withdrawal | a consent the platform could refuse to un-give |
| `DIRECT` and `ASSERTED` as capture provenance; a capture without an archive timestamp | a second spelling of identity with the platform's date where the archive's stands |
| `create_evidence_from_text`, `recover_evidence_from_screenshot`, the `/submit` intake, `/confirm`, `/contact`, the screenshot-recovery route | one tool for a researcher's document; one sealed door for the public |
| evidence A6's non-binding arm | the class it excused now satisfies the predicates |
