# How the DEV and REVIEW seats work — the two-session protocol

> **This governs how the work is DONE. Handover is one section of it, not its subject.** A seat reads it when
> the session OPENS, not only when `HANDOFF` is typed. `CLAUDE.md` carries the imperative form of its operating
> rules; this file carries the reasoning and the instance behind each one.

**The definition, 2026-09-09, written by the R34 REVIEW seat after four handoffs each found an omission when checked against the previous one.** The handoff FILES live outside this repository (`~/.claude/projects/-Users-jonathand-OpenJustice/handoffs/`, beside a `check-handoff.py` that greps a new set against the lists below and prints what is missing); this is their specification, in git because it is the project's process and not one session's memory. The operating model it implements is `docs/gf-refactor-plan.md` §9; `CLAUDE.md`'s `REVDEV` section is its one-session form.

## The shape

One refactor step = one round `R<n>` = three files, written by the outgoing REVIEW seat at ~850k
tokens of its own context, BEFORE its last keyword flow:

| file | read by | carries |
|---|---|---|
| `R<n>-state.md` | both seats | where the refactor stands: what landed (PRs, SHAs, deploy status), what is in the tree, the numbers at close, THE SEAM (what cannot be exercised and why), the next step's contract TRANSCRIBED from the designs onto the schema as the tree holds it, the rulings that bind, the LOWs carried, the traps |
| `R<n>-dev-prompt.md` | DEV | the seat, the reading list in order, the rules that bind the code, the scope by chunk, the suite as the spec with today's counts, the report block |
| `R<n>-review-prompt.md` | REVIEW | the seat and that it HOLDS THE TREE, the reading list, the finding shape with step-specific HIGH/MEDIUM/LOW, the stop rule, the read-only checks, the decoy and sweep discipline, the keyword flow, the reply shape, the persistence rule, the next-handoff threshold |

**Self-contained, every time.** No file says "as R<n-1>'s prompt said"; a chain to an older prompt
is a reading nobody does. The previous round's `R<n-1>-review-state.md` is in the reading list as a
LOG to read once, not as a source of instructions.

## THE RESEARCHER'S REVIEW SURFACE IS A RUNNING PAGE, NOT A REPORT

**Ruled by the researcher 2026-09-21, and it reorganises everything below it.**

> *"During a design session we have a deep discussion and we raise many issues; in that context we get a
> solid design and UI board. But during a dev review session, out of that context, I find it hard to
> understand many of the nuances of the questions. Many times I just trust your recommendation. Eventually
> we have a working page, then it is easier for me to spot the issues … this is where I can truly say if
> the dev was done OK."*

The researcher's judgement is at its highest bandwidth **at the artefact**, and at its lowest in prose about
the artefact. They are using the platform — building a thesis in claude.ai, then reading it in the UI and
asking whether they understand what they are looking at, whether it is fast, whether the dates are clear.
No report answers those, and no decoy measures them.

**So: a chunk is sized to end at something the researcher can OPEN.** Not at a coherent code change, not at
a green suite. The report is for the REVIEW seat's grading; **the page is for the researcher's ruling.**

**BATCH IS NOT LANDING, and conflating them contradicts a standing ruling.** The researcher ruled on
2026-09-18, after seven landings in one day, that landing every small change wastes time. Smaller batches
mean **more runnable local states**, not more merges: a chunk ends when there is a page to open; landings
stay grouped.

**THE LOCAL PAIR IS THE REVIEW SEAT'S JOB, NOT A BLOCKED ITEM.** On 2026-09-21 every report of a long
session carried "a reading on `:3011` — blocked on the researcher", while both servers were simply down.
The one surface where the researcher's judgement is strongest was unavailable for a whole day, and a landed,
runnable page sat unlooked-at for an hour. **The seat brings the pair up (`preview_start` against
`.claude/launch.json`; the backend needs Node 22; `:3011` is behind a staging password only the researcher
enters) and says so in its report.** "Blocked on the researcher" is legitimate only for the password and the
bearer — never for a server nobody started.

**WHEN A RULING IS ABOUT WHAT A PAGE SHOWS, DRAW IT OR RENDER IT.** Do not describe it. The researcher asked
for a visual several times on 2026-09-21 before the seat made it a habit, and each time it collapsed a
multi-exchange question into one.

## SUPPRESS OR ESCALATE — which questions reach the researcher

Follows directly from the rule above, and it is what makes suppression safe rather than negligent.

**SUPPRESSIBLE — decide it from a cold read of the design, record it, and let the researcher overrule at the
page:** anything a researcher opening the page would notice. Region order, wording, which elements a view
draws, a label, a width, a state word. The researcher cannot fairly judge these in prose and can judge them
in five seconds on screen.

**ESCALATE — it must reach the researcher, because no page will catch it:**

- **defamation and COMPLIANCE** — invisible until it is public;
- **a chain write, a paid call, data loss** — irreversible, or it costs money;
- **an architectural shape other chunks will build on** — the page looks fine and the cost arrives three
  chunks later;
- **anything no page shows** — an envelope field nothing renders yet, a public-door leak, a cost that only
  appears at scale.

**FAIL OPEN.** If the gate cannot name the document **and line** that answers a question, the question goes
to the researcher. Doubt resolves toward asking. A gate that cannot see must not report "nothing found" —
the vacuity rule this repository already applies to every scan.

**EVERY SUPPRESSED QUESTION IS RECORDED** — the question, what answered it, the line — in the seat's state
file. Without that audit trail the rule is unfalsifiable, and its worst failure (a design question killed in
silence, then built) would never surface. **One suppressed question the researcher later has to rule anyway
is enough to revoke this rule.**

Measured on the session that produced it: of the questions put to the researcher that day, "which of §17's
regions does the centre draw" and "the context line's order" were both SUPPRESSIBLE — the claim rendering
twice is a five-second catch on screen. "Option (a) versus (c) for the citation wire" was correctly
ESCALATED: architectural, and wrong would have surfaced only after the next chunk built on it.

## A DERIVED RECORD NAMES ITS SOURCE, AND THE SOURCE IS KEPT

**Ruled by the researcher 2026-09-22.** Any document that records an EXTERNAL analysis — a cold reader's
review, a profile, a measurement run, an advisory session's answer — **keeps the raw output and links it**.
The dated doc is the DERIVATION; the raw output is the SOURCE; both are kept, and the derivation says where
the source is.

**The instance.** A findings doc was written recording a cold reader's design proposal. It was written from
the reviewing seat's SUMMARY of that answer rather than from the answer, and lost the concrete detail — the
interface, the wave contents, the function map, the pseudo-code — keeping only the conclusions. The suite was
green; both reachability tests passed; the doc was indexed and pointed at. **Nothing was wrong with it except
that it no longer contained what it was written to carry.** It was caught by the researcher asking *"where
did you save the updated design?"* — and an audit then found the raw answer existed **nowhere on disk**:
hundreds of thousands of tokens of reasoning that had corrected nine of the seat's own claims survived only
as that seat's paraphrase, one session-close away from being gone.

**WHY IT IS ITS OWN RULE.** It is the same mechanism as the citation rule above, one level up. That one says
a `:line` cite is written from the line, not from a search window. This one says a RECORD is written from the
source, not from your account of it. **A summary written down reads afterwards exactly like a
transcription** — nothing in the artifact marks which it is, which is why the source must sit beside it.

It is also why a cold reader keeps finding what an accumulated seat cannot: **a cold reader has no summary to
write down.** It must go to the source because it has nothing else. A long-running seat's advantage is its
context, and context is stored compressions.

## WHAT THE TESTS DO NOT COVER — say it, do not imply otherwise

**Ruled by the researcher 2026-09-22, because implying coverage is worse than having none.**

The repository enforces two properties of a document and **not a third**:

| property | enforced? |
|---|---|
| **EXISTENCE** — the doc is linked from `docs/README.md` | **yes**, `docsIndexIsReachable` (and since 2026-09-21 it reaches `.html`, which found `docs/integrity/index.html` un-indexed since it landed) |
| **SITUATION** — the doc is pointed at from the `STATUS:` line of the level it bears on | **partly.** `findingsDocsAreReachable` covers ONE plan (`gf-factual-layer-rebuild-dev-plan.md`) and only docs that opt in with a `Bears on:` line. Measured 2026-09-22: **17 of 55 dated docs opt in.** A findings doc for any other plan is unenforced, and a doc with no `Bears on:` is skipped silently |
| **FIDELITY** — the doc carries what it was written to carry | **NO, and no test can.** A doc can be indexed, pointed at, and hollow |

**The only control for fidelity that has ever worked here is a person asking where something went.** Keep the
source beside the derivation (the rule above), and do not treat a green suite as evidence that a record is
complete — it is evidence that the record EXISTS.

## A CITATION IS NEVER WRITTEN FROM A SEARCH WINDOW

**Ruled 2026-09-21, after four wrong citations were landed in one day by the seat that wrote them.**

A `:line` citation may be written only when the citing seat has printed the line's **whole enclosing unit**
— the function body, the appendix clause, the table row — in the same turn it writes the cite.

The instance: `publishedThesis.ts` :249's docstring says *"the citations of EVERY version named"*; its rows
are `CitationRef = { kind, name, pin }`, the UNRESOLVED refs. The seat read the docstring in a grep window,
wrote "the resolver" into A4 :1476 and the plan's :709, and both landed. A cold read found it. The same
mechanism produced three more that day: a line cited as *naming* a principle it only illustrates, a phrase
cited at :367 that spans :367–:368, and a union arm written without checking it against the type it had to
match.

**An implementation's docstring states what its author believed. Its rows state what it serves.** This is
the same failure the appendices already name — *an envelope read off an implementation states what is
SERVED, never what is OWED* — one level down, in the citation rather than the envelope.

## BEFORE A TEST-WORLD PROVES A DEFECT, ASK WHETHER THAT WORLD IS REACHABLE

**Ruled 2026-09-21.** When a failing test is offered as evidence of a defect, name the design clause that
CREATES that world, and check whether any clause FORBIDS it. **If no clause forbids it, the defect stands.
If one does, the fixture is what is wrong.**

The instance: a landed test seeded a thesis citing a diff with no content version at all, and the gated read
threw. The seat accepted the framing and asked the researcher to widen a closed union in the appendix. A
cold read found T2 :413–:414 — the version write REFUSES `AWAITING_DERIVATION` — and evidence :1027–:1029 —
that `AWAITING_DERIVATION` is a property of CURRENT, never of the pin, and stored versions are append-only.
The world was unreachable; the throw was a correct loud guard; the fixture was wrong. The proposed amendment
would have been actively harmful: `RecordContent.tsx` renders NOTHING for a content kind it does not know,
so the KEEP column would have "survived" the new arm by opening a chip onto an empty pane.

**FAIL OPEN here too:** a seat that cannot cite the clause forbidding the world does not get to dismiss the
defect.

## Every unverifiable instruction gets an output field

**Added 2026-09-09 by the R38 REVIEW seat, which did not read the designs whole and produced four
reports before anyone could tell.** Four grading rounds against that step's sketch found SEVENTEEN
real defects and NOT ONE contract clause — because a seat that verifies only what the chunk cites
can find inaccuracy and can never find omission. Two hundred lines of evidence A3 and one line of
A6, read afterwards, found four MEDIUM, none of them a line the sketch had cited.

Every other instruction in that prompt held, and the reason is uniform: each carried a number the
report had to print. The baseline has counts. A decoy has a firing count measured against a stated
baseline. A KEEP sweep has a subject count, per-subject existence and a positive control. **The
reading list had nothing that failed when it was skipped.**

So: **a seat prompt may not carry an instruction whose performance cannot be read from the seat's
own output.** For each such instruction the prompt names the FIELD its FIRST report must carry, and
a first report missing a field is INCOMPLETE — the researcher returns it rather than reading its
findings.

| instruction | the field its FIRST report must carry |
|---|---|
| the reading list, the designs WHOLE | per document: the line range read, AND **one ruling it names that the chunk under review does not cite** |
| "grep EVERY design and the triage by name before saying KEEP or RETIRE" | which documents say **nothing** — the silent ones, named |
| "read every changed file IN FULL" | each changed file, with its line count |

**The fields go in the report block's `observed:` line**, which is where a seat already states what it
ran. The block ends the report and nothing follows it, so a field with no named home would have none —
DEV's cold read of this section, 2026-09-09.

**The reading field is the load-bearing one, because it is the only one skimming cannot satisfy.**
A ruling the chunk does not cite is exactly what a whole read produces and a section read cannot:
evidence A3's *"no evidence predicate below evaluates until it does"*, evidence A6 `:1214`'s fourth
ARGUED clause, thesis A7 naming `PUBLISHABLE(v)` in its one-symbol scan. Any one of them fails the
field in round 1 instead of surfacing in round 4.

**What this does NOT do, stated so nobody trusts it further than it goes.** A seat that ignores the
field still ignores it; nothing here makes a session read. **And a whole read is NECESSARY, not
SUFFICIENT** — the R38 seat read evidence A3 whole and still surfaced its `CURRENT(diff)` clause only
a round later, so the field catches the reading that never happened, never the reading that missed. What changes is that the omission is
visible in the FIRST report instead of four rounds later — it moves the researcher's catch earlier,
it does not replace the researcher as the catch.

## When the reading completes, every open question is re-asked against it

**Added 2026-09-09, the same day and by the same failure.** The R38 seat carried two questions to the
researcher for five rounds — does `audit-theses` exit 0 over zero subjects, and who writes the ledger
entry — and both were already answered: evidence A6 `:1202`, thesis A6 `:1588` and thesis A7
`:1656-1657` (*"a pass that examined nothing says zero, never nothing"*) answer the first in terms,
and `gf-thesis-refactor-plan.md:274` (*"gains its command at step 24"*) answers the second. The seat
read all four clauses during the whole read and never went back to the standing questions.

**So the reading has a second act, and it is not optional:** when the reading list is finished, every
question the seat is holding — its own and the other seat's — is re-asked against what was just read,
BEFORE it is relayed. A question the designs answer is a FOUND, reported, never asked; relaying it
spends the researcher's ruling on something already ruled.

This is what "a whole read is necessary, not sufficient" means in practice. The output field catches
the reading that never happened. Only the re-ask catches the reading that happened and went unused.

## The APPROVED BOARDS go in the reading list, with their path

**Ruled by the researcher 2026-09-21, on R70.** A step whose pages have approved boards carries
them in EVERY prompt's reading list — the file path and the board letters. A prompt that names no
board, and does not say that none exists for the step, is INCOMPLETE, and `check-handoff.py` fails it.

**The boards live IN GIT, under `docs/boards/`, as a DATED file** (`gf-ui-boards-YYYY-MM-DD.html`),
indexed from `docs/README.md` like every other document — ruled the same day, after the first version
of this rule sent seats to a copy in `handoffs/`, which is outside the repository and therefore has no
history at all. **An update is a NEW dated file**; the previous one takes its superseded banner and its
index line moves, exactly as `CLAUDE.md`'s CHECKPOINT rule already requires of every stale document.

**The file holds the approved CURRENT image and nothing else.** No cancelled option, no before-state.
That became possible only once the boards were in git: while they sat outside it, removing a board was
permanent, so obsolete ones were kept beside approved ones and the file became a place where a seat
could grade against the wrong image. It is why `docs/boards/boards.py` — the generator, which travels
with the file because a 100 KB generated page is unreadable in a diff and its generator is not — emits
the current boards only, and says so in its own docstring.

**What went wrong.** R70's review prompt named boards ד2 · ג2 · ג3 exactly once, inside the
definition of a MEDIUM finding — *"a region, order, width or token differing from the DESIGN or the
APPROVED BOARD"* — and in no reading list. `R68-boards/` appeared in that prompt only as the
directory holding `copy_check.py` and `keep_sweep.py`, so the path read as a toolbox and the image
inside it was never opened. The chunk-7a DEV prompt did not mention the boards at all. The REVIEW
seat therefore treated "which regions the working view's centre has" as an unruled SILENCE, consumed
an advisory session on it, and put the question to the researcher — who had settled it on board ד2
five days earlier. The DEV seat, equally unpointed, reported the centre "blocked" without citing it.

**Why it is its own rule and not covered by the others.** The reading field catches a reading that
never happened; the re-ask catches a reading that happened and left a question standing; the
appendix rule catches a ruling grounded in prose. None of them reaches this: the board was neither
unread nor misread — it was NAMED, as a standard to grade against, by a prompt that never said to
open it. **A grading standard no seat is told to OPEN is not a standard.** It is also the most
expensive class of the four, because its failure mode is asking the researcher to decide something
they already decided, which spends the one resource the protocol exists to protect.

**A BOARD'S OWN ANNOTATIONS ARE NOT THE DESIGN, AND ARE NEVER GRADED.** The `טיוטה` mark on the UI
boards flagged a word not yet in the approved catalogue — a note to the reader, never an element. A seat
read it as copy to build and asked the researcher to approve it; the researcher's answer was that it is a
mark of the board, unrelated to the final design. Every word it flagged has since been approved and
landed, so the marks were removed from the generator and the boards regenerated. **Grade the DRAWING, not
the marginalia** — and where a board must annotate, the annotation says what it is, inside the file.

**A board is prior to a design's prose about the same page.** A shape ON an approved board is
DECIDED and is never re-asked. A shape not on one is a question. Where a board and a design's
enumeration disagree, the board is what was approved and the disagreement is a finding — which is
why it must be read BEFORE a question is formed, not after one is answered.

## A ruling is grounded in an APPENDIX or a PLAN STEP, never in a narrative document

**Ruled by the researcher 2026-09-10, on the rulings audit** (`docs/gf-rulings-audit-2026-09-10.md`).
Of roughly forty implementation-time rulings, ONE contradicted a design — evidence step 11's first
ruling rebased `preview_diff_classification` on the grounds that "no design retires it", while
thesis A4 `:1551` lists it in the RETIRED block. The ruling had been formed from
`docs/gf-researcher-day.md:160`, a NARRATIVE document, rather than from the appendix. DEV's cold
read caught it the same evening and nothing was built on the wrong side of it.

**That class is why this rule exists, and it is not the same class the other rules cover.** A
ruling formed from a narrative doc does not look like a mistake: it is well-founded, it arrives
with a real citation to a real sentence, and only a second seat reading the appendix cold will
catch it. The reading field catches a reading that never happened; the re-ask catches a reading
that went unused; neither sees a reading of the wrong document.

```
DECIDE      the four designs' appendices A1–A7 · the numbered plan steps · CLAUDE.md
DESCRIBE    gf-researcher-day.md · gf-prosecutor-dev-plan.md · every pre-design plan ·
            every dated findings doc
```

Each appendix says this of itself in terms — *"where the flows above and this appendix disagree,
the flows win and this is wrong"* — so a flows section beats its own appendix, and BOTH beat a
narrative. **A citation to a narrative document is not authority.** Where a pre-design plan's item
looks live, `docs/gf-pre-design-plans-triage-2026-09-04.md` is where it was already dispositioned,
and the disposition is the ruling.

**A dated findings doc CORROBORATES; it never DECIDES. Where one is the ONLY ground, the question
is OPEN and goes to the researcher.** Added 2026-09-10, from the R39 REVIEW seat's first report,
and it is the line that stops the rule above from throwing measurements away. Evidence step 15's
strict fold on check 17 — CONTRADICTED, UNCHECKABLE and AWAITING_DERIVATION all fail — was grounded
for five rounds in `docs/gf-evidence-input-soundness-2026-08-30.md:44–:45`, a dated findings doc,
which the block above files under DESCRIBE. The obvious rescue did not hold either: evidence A6
`:1210` fixes check 17's NAME and its SELECT and says nothing about which states fail. What decides
it is two PLAN steps — `docs/gf-refactor-plan.md` §4 rule 3 (a REWRITE file is rewritten to the
appendix, which asks for the rebase and not a new fold) and `docs/gf-thesis-refactor-plan.md` §5
(*"rebased … exactly as A6 words it"*). The measurement stays, as the reason the fold is what it is;
it is not what makes the fold binding.

So a dated findings doc is cited BESIDE an appendix clause or a plan step, never alone. A ruling with
no ground but a dated doc is neither obeyed on that ground nor discarded: it is a question, and it is
the researcher's. **The re-ask above cannot catch this class** — it re-asks the questions a seat is
HOLDING, and a ruled question is not held, which is how a mis-grounded ruling survived six rounds.
The authority has to be checked at the moment a dated doc is CITED. The whole account is
`docs/gf-evidence-step-15-2026-09-10.md` §1.

## One ordering, not two

A prompt states ONE order of first acts, in these words:

```
FIRST   verify the baseline from the tree, and the READ FIRST block
SECOND  the reading list, WHOLE, with the fields above
THEN    the first report
```

**The block above is REQUIRED in every seat prompt, in those words** — a prompt stating NO order
passes a check that only looks for two competing ones, which is what the first version of this rule
did (DEV's cold read, 2026-09-09).

`R38-review-prompt.md` carried both *"READ, IN THIS ORDER — BEFORE THE FIRST REPORT"* and, further
down, *"FIRST ACT: verify the baseline from the tree ... before reading anything else"*. The seat
followed the second, went into command-running mode, and never re-entered the list as a blocking
step. **A prompt asserting an order in two different phrasings is a defect and `check-handoff.py`
refuses it.** The checker holds a FAMILY of ordering phrasings and refuses a prompt matching two of
them; that list is an ENUMERATION under a property, declared as one, because a regex cannot decide
"states one order". Its first version held exactly two literals and missed `R38-dev-prompt.md`'s
*"BEFORE WRITING ANYTHING"*, a third — found by DEV's cold read, and the same shape
`gf-property-implemented-as-enumeration` records. A new phrasing joins the family; the property does
not change.

## The report waits for the reading

**A prompt that arrives in the same message as a DEV report does not start the grading.** The
reading comes first, and the reply says so before its first finding. A pasted artifact is not a
reason to begin: it is what will be graded once the seat holds the standard to grade it against.

Written for the SEAT rather than for the researcher, deliberately — the protocol has to hold
however the message arrives, not only when it is delivered in two parts.

## What goes where — the required elements

The lists below are what `check-handoff.py` greps for. A phrase missing is reported; the writer
decides whether the step genuinely has no such element (say so in the file, in the words the
checker looks for, e.g. "no migration") or forgot it.

### `R<n>-state.md`
1. Header: who wrote it, at what context size, after what landed.
2. **READ FIRST** if the tree is not clean: what is uncommitted, whose, why, who lands it.
3. The landed step: PR numbers, SHAs, deploy status (SKIPPED is final for docs-only), CI ratchet
   line, `db:check-drift` result, MCP surface count.
4. What is in the tree now, module by module, one line each.
5. Numbers at close: tsc · `npm test` · walk · evidence with the red BY NAME.
6. **THE SEAM**: what this tree cannot exercise (today: no thesis writer until thesis 20), so what
   the next step proves by fixtures and what it OWES.
7. The next step's contract transcribed: every tool's return shape and refusal set from the
   appendix, mapped onto the schema; which predicates exist; which scan allow-lists already name
   the step's modules.
8. Rulings that bind, with pointers to the memory files.
9. LOWs carried, not applied.
10. Traps, newest first, each one sentence.

### `R<n>-dev-prompt.md`
1. The seat: DEVELOPER; NEVER runs git (no add, commit, push, checkout, branch, stash);
   `git show/diff/status` only; never a design doc, a migration (unless ruled), staging, a frontend
   file; batch questions, never resolve in code; context size in every report, bold past ~850k.
2. READ IN THIS ORDER, the designs WHOLE never by section: CLAUDE.md · docs/README.md ·
   `R<n>-state.md` · `R<n-1>-review-state.md` · `R<n-1>-chunk-1-sketch.md` (the sketch's shape) ·
   architecture target §9–§11 · THE FOUR DESIGNS EACH WHOLE in dependency order (interaction,
   evidence, thesis, document), naming which sections are this step's contract · the refactor plan
   WHOLE · as-built §7–§8 · thesis plan §5 · document plan §5 (the KEEP tables) · the triage doc ·
   the legacy-switch record · the step's own dated docs · the memory rulings · the tree at named
   paths. "A ruling you find that the state file does not carry is REPORTED as FOUND, never asked."
   **And the FIELD the first report must carry for it** — per document, the line range read and
   one ruling it names that this step's chunk does not cite.
   **A ruling is grounded in an APPENDIX or a PLAN STEP, never in a narrative document** — the
   section above; a citation to `gf-researcher-day.md` or a pre-design plan is not authority.
   **A dated findings doc CORROBORATES; it never DECIDES** — where one is the only ground, the
   question is open and goes to the researcher.
3. RULES THAT BIND THE CODE: no chain write (`registerEvidenceHash` one caller); KEEP files
   byte-identical or DECLARED with authority; `src/walk` byte-identical; `mcpToolClassification`
   KEEP; predicates CALLED never re-spelled; the step's own invariants (no re-pin, WITHDRAWN never
   back, nothing deleted…); `.at()`; `Prisma.DbNull` only for a cleared Json; zod for every model
   output; the destructive-DB guard matches WORDS — decoys in a file; sweeps from a file with a
   count, existence and a positive control.
4. SCOPE BY CHUNK: chunk 1 THE SKETCH on disk at `R<n>-chunk-1-sketch.md`, sections (a)–(f), STOP;
   chunk 2 on the word, red first BY NAME, one test per refusal code and per shape clause, the
   model mocked at its boundary, fixtures named.
5. THE SUITE IS THE SPEC: the four commands from the backend by absolute path with today's counts;
   ratchets REPORTED never set; eslint with the pre-existing errors named by file.
6. The REPORT block (files / observed / questions / next) and "paste this block into the REVIEWER
   session now".
7. **EVIDENCE THE FIRST REPORT MUST CARRY**, one line per unverifiable instruction, naming every
   document of the READ list — the section above. A first report missing a field is incomplete.

### `R<n>-review-prompt.md`

**0. THE TWO TESTS ARE INLINED IN THE PROMPT ITSELF, not left to a doc the seat read hours ago.** A rule a
seat must REMEMBER to consult is a rule that decays — measured 2026-09-21, when a seat that had read this
protocol at the start of the day still sent the researcher two suppressible questions nine hours later. So
the prompt's own reply-shape section carries, verbatim:

> **Before this question reaches the researcher:** would they notice the wrong answer by OPENING THE PAGE? If
> yes it is mine to decide from the design and record. It escalates only if it is invisible there —
> defamation/COMPLIANCE · a chain write, a paid call, data loss · an architectural shape later chunks build
> on · anything no page shows. **Cannot name the document AND line that answers it → it escalates.**

> **Before a failing test proves a defect:** which clause CREATES this world, and does one FORBID it? No
> forbidding clause → the defect stands. One → the fixture is wrong. **Cannot cite it → the defect stands.**

1. The seat: REVIEWER, HOLDS THE TREE, every git command here on the keywords; never edits DEV's
   code, never `jest -u`, never `prisma migrate`, `railway` only to read at LAND or run a named
   maintenance script on instruction; "a claim in a report is not evidence"; the crossed-seat rule.
2. READ IN THIS ORDER: CLAUDE.md · README · **`docs/gf-two-session-protocol.md` BY PATH** ·
   **the step's APPROVED BOARDS by path** · `R<n>-state.md` · `R<n-1>-review-state.md` whole ·
   `R<n>-dev-prompt.md` (its scope binds; its reading list is yours) · the sketch precedent and the
   sketch path that MUST be on disk · the memory files. "Grep EVERY design and the triage by name
   before saying KEEP or RETIRE."
   **And the FIELDS the first report must carry** — per document, the line range read and one
   ruling it names that the chunk does not cite; and which documents say NOTHING.
   **A ruling is grounded in an APPENDIX or a PLAN STEP, never in a narrative document** — the
   section above; a citation to `gf-researcher-day.md` or a pre-design plan is not authority.
   **A dated findings doc CORROBORATES; it never DECIDES** — where one is the only ground, the
   question is open and goes to the researcher.
3. WHAT A FINDING IS: the shape (`[LEVEL] file:line — defect / cites / held by`); HIGH, MEDIUM,
   LOW lists rewritten for THIS step's contract; "a design question is not a finding".
4. STOP RULE: no HIGH or MEDIUM; three rounds; the fourth is the researcher's; write "LOOP ENDS".
5. READ-ONLY CHECKS: the commands by absolute path; jest `--json` parsed with `raw_decode` and the
   TOTALS printed; eslint now vs staging via `--stdin`; the KEEP sweep from a file with count,
   existence, positive control; decoys from a SCRIPT FILE, restored and `cmp`'d against the backup,
   a compiler-refused decoy re-planted in a compiling form; red-first by stubbing the src file.
6. THE KEYWORD FLOW: COMMIT (branch check, secret grep, `git add` by path, `git commit -F`, push) ·
   PR (`--body-file`, `gh run watch --exit-status`, the ratchet lines) · LAND (mergeable, merge with
   delete, checkout staging, pull ff-only, the deploy poll with `timeout 40` and `jq`, SUCCESS OR
   SKIPPED as final, then `db:check-drift` must say "No difference detected") · `gh auth status`.
7. THE REPLY SHAPE: questions · findings ranked · "what I checked and found sound" · NEXT PROMPT
   FOR THE DEVELOPER as a pasteable numbered list · remaining steps · one recommended step.
8. PERSIST: `R<n>-review-state.md` and memory at every chunk boundary; context size as the harness
   shows it; write `R<n+1>-*` at ~850k before the last keyword flow.
9. **EVIDENCE THE FIRST REPORT MUST CARRY**, one line per unverifiable instruction, naming every
   document of the READ list — the section above. A first report missing a field is incomplete.

## The keyword

**`HANDOFF <R>`** — a git-keyword-class command in `CLAUDE.md`'s table: the REVIEW seat writes the
three `R<n>` files per this protocol, runs `check-handoff.py R<n>` and pastes its output, diffs once
by eye against the previous set for the step's own content, then CHECKPOINTs. Refuse, and say why,
when the tree is not clean and undeclared, or when a keyword flow is mid-way (COMMIT done, PR not
landed) — the handoff is written BEFORE the last keyword flow, never inside one.

**THE THRESHOLD IS ~850k, RAISED FROM ~450k ON THE RESEARCHER'S RULING, 2026-09-09.** The old number
was set before a seat was required to read the four designs whole, and that reading alone costs about
250k measured by the DEV seat over the whole list, leaving a seat that has read at roughly 330k — so
~450k triggered a handoff before the seat had done any work with what it had just read. The
handoff exists so that a session does not die mid-loop with its findings unwritten; it does not exist
to preserve design context, which is on disk and re-readable by the next seat at the same price. A
seat that hands off early pays the reading twice and reviews nothing in between.

## The procedure

1. At ~850k, the REVIEW seat writes the three files.
2. It runs `python3 check-handoff.py R<n+1>` and fixes every MISSING line or writes the words that
   say why the element does not apply.
3. It then diffs against the previous set by eye once — the checker holds the protocol; the eye
   holds the step.
4. The researcher opens the next sessions from the files. The new REVIEW seat acts in ONE order:
   FIRST the baseline from the tree and the READ FIRST block; SECOND the reading list, WHOLE,
   with its output fields; THEN the first report, which carries them. A DEV report arriving in
   the same message waits for the reading.
