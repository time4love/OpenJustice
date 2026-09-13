# The rulings audit — were the researcher's calls already decided by the designs? 2026-09-10

**A findings record, not a plan.** Written by the R38 REVIEW seat on the researcher's instruction,
after that seat carried two questions to the researcher for five rounds and both turned out to be
answered in documents the seat had already read. The researcher asked the obvious next question:
*how often has that happened before, and has any ruling ever contradicted a design?*

## Method, and what it can and cannot say

**The corpus.** Every implementation-time ruling logged in
`~/.claude/projects/-Users-jonathand-OpenJustice/memory/gf-step-*-rulings-*.md` and
`gf-pr3-sketch-rulings-2026-09-07.md`, cross-read against the six `handoffs/R*-review-state.md`
logs and the dated step records in this folder. Roughly forty rulings across corpus PRs 3–4 and
evidence steps 11–15.

**Scope, and it is the decision that shapes the answer.** The **design-session** rulings of
2026-09-02, 09-03 and 09-04 (`gf-flows-doc-rulings`, `gf-evidence-flows-doc-rulings`,
`gf-thesis-flows-doc-rulings`, `gf-document-flows-doc-rulings`) are **OUT OF SCOPE**: those rulings
*created* the four designs. A ruling that made the design cannot contradict it. What is in scope is
every ruling made **after** the designs were signed off, while implementing them.

**Four dispositions**, one per ruling:

```
ANSWERED     a design or plan clause already decided it — the question should have reached the
             researcher as a FOUND, not as a question
CONTRADICTS  the ruling and a clause disagree, and one of them has to move
EXTENDS      the designs are silent, and the ruling is the authority — the large majority
DECLARED     the ruling knowingly departs from a clause and says so in the step's §6
```

**What this audit does NOT claim.** It classifies the rulings that were WRITTEN DOWN. A ruling given
in chat and never logged is invisible to it, and so is a design clause nobody has ever grepped for.
Every citation below was reproduced from the file at the line named, on 2026-09-10.

## The answer, in one line

**Six of the logged rulings were already decided by a document, and one contradicted a design clause
and was caught within hours.** Everything else EXTENDS or is a DECLARED deviation. The failure is
real, it is recurrent, and it is **not** a pattern of the researcher over-ruling the designs — it is
a pattern of seats escalating questions they could have answered by reading.

## ANSWERED — the six that should have been FOUNDs

| # | ruling | the clause that already decided it |
|---|---|---|
| 1 | **Step 13** — `DiffDebateSession.evidenceId` loses its `@unique` | evidence A2 `:965` *"the row this argument created **or joined**"* and thesis T3 `:542` *"`promote_from_debate` **joins the row** rather than creating it"*. Two designs, both explicit. What genuinely needed the researcher was the *migration permission* (the dev prompt forbids migrations), not the schema question |
| 2 | **Step 13** — `NOT_AUTHOR` on the three debate writes | thesis §9 `:1001` *"A thesis has one author, and **every write on it refuses `NOT_AUTHOR`**"*, plus A3, A4 and A7. Evidence A4 was silent, and the appendix's own rule (*"where the flows and this appendix disagree, the flows win"*) resolves silence too |
| 3 | **Step 14** — the review entry carries `decisionSequence`, commands embed `expectedSequence` | the convention is already built twice: thesis A4's `decide_gap` and document A4's `dismiss_arrival` both take `expectedSequence`. The memory itself says so — *"the convention thesis A4's `decide_gap` and document A4's `dismiss_arrival` already use"* — and asked anyway |
| 4 | **Step 12** — the record's derived name on every timeline entry | resolved by citing *"the flows win over the appendix"*, which is the evidence appendix's **own** precedence rule. Correctly resolved, unnecessarily escalated |
| 5 | **Step 15** — does `audit-theses` exit 0 over zero published versions? | evidence A6 `:1202` (*"A check that examined nothing says so"*), thesis A6 `:1588` (*"an empty scope says so"*), thesis A7 `:1656–1657` (*"a pass that examined nothing says **zero, never nothing**"*). Three clauses; none says *refuse*. Carried five rounds |
| 6 | **Step 15** — who writes the ledger's `thesis-cites-verified` entry? | `gf-thesis-refactor-plan.md:245` — *"the integrity board's `thesis-cites-verified` entry **gains its command at step 24**"* — with thesis step 24's own line as a second witness. Not step 15's work at all. Carried five rounds |

## CONTRADICTS — one, caught the same evening

**Step 11, first ruling: `preview_diff_classification` is REBASED in 11b** — on the grounds that
"no design retires it". Thesis A4 `:1551` lists it in the RETIRED block: *"an instrument, not a
research act (researcher's day)"*.

The ruling had been formed from `docs/gf-researcher-day.md:160`, a narrative document, rather than
from the appendix. **DEV's cold read of the plan note caught it within hours** and it was reversed
the same evening (`gf-step-11-rulings-2026-09-08.md`, F1: *"thesis A4 :1551 wins over the
researcher's day :160"*), with the tool deleted in 11a-thesis instead. Nothing was built on the
wrong side of it.

**That is the only contradiction in the logged corpus, and the loop caught it.** It is worth
recording precisely because of how it arose: not from ignoring a design, but from reading a
*different* document that describes the same subject in prose.

## What the logs already do right, and it is the fix

The discipline exists and is applied inconsistently — which means the failure is a habit, not a gap
in anyone's understanding:

- **Step 11** closes with *"Answered from the contract, not re-asked"* over five items — the 12
  unlisted prose columns, the CHECK on REAFFIRM, `snapshotUrl`, `evidence-no-prose`'s allow-list,
  `audit-survival`'s retirement. Five questions that never reached the researcher, correctly.
- **Step 14** records *"Confirmed by the closing R34 seat, **from FOUND items reported not asked**"*
  over the `NOT_AUTHOR`-on-`review_evidence` question — the same shape as ANSWERED #2 above, handled
  the right way one step later.

So the same seat family gets it right and wrong within a day of itself. What separates the two is
whether anyone grepped the designs by name before escalating.

## What it cost, and what it did not

**It did not corrupt the code.** Every ANSWERED ruling above landed on the same answer the design
would have given, because the researcher answered from the same understanding the designs encode.
The cost is the researcher's attention — six rulings' worth — and, at step 15, five review rounds
spent holding a chunk open on two questions that were never anyone's to answer.

**The one real risk it exposes is the CONTRADICTS class.** A ruling formed from a narrative document
rather than an appendix will *look* well-founded, will be recorded with a citation, and will only be
caught if a second seat reads the appendix cold. That happened once and worked. It is not
guaranteed to work twice.

## What is in place now

`docs/gf-two-session-protocol.md` gained two rules on 2026-09-09 (PR #409, `aa07917`) that bear
directly on this:

- **Every unverifiable instruction gets an output field** — the reading list's field is *per
  document, the line range read and one ruling it names that the chunk does not cite*.
- **When the reading completes, every open question is re-asked against it** — the second act,
  added after the step-15 failure.

**Neither of those reaches** a ruling formed from a *narrative* document — which is what this audit
argued for and what the researcher then ruled. Neither rule reaches a ruling
formed from a *narrative* document. The appendices are the contract (each says so in terms: *"where
the flows above and this appendix disagree, the flows win and this is wrong"*), and
`gf-researcher-day.md`, the prosecutor plan and the pre-design plans are not. A one-line addition to
the protocol would close the CONTRADICTS class:

> **A ruling is grounded in an APPENDIX or a PLAN STEP, never in a narrative document.**
> `gf-researcher-day.md` and the pre-design plans describe; A1–A7 and the numbered steps decide. A
> citation to a narrative doc is not authority, and the triage
> (`gf-pre-design-plans-triage-2026-09-04.md`) is where a pre-design plan's items were already
> dispositioned.

**RULED BY THE RESEARCHER 2026-09-10 AND APPLIED** — `docs/gf-two-session-protocol.md`, its
own section, mirrored into both seat prompt templates, with `check-handoff.py` requiring each
prompt to carry it.

## Carried, for whoever runs this again

- The audit covers rulings from corpus PR 3 (2026-09-07) forward. **Rulings from before 2026-09-07
  were not examined** — R28 and earlier are in `MEMORY-ARCHIVE.md` and were out of this session's
  budget.
- `feedback-reviewer-protocol-rulings.md` holds process rulings (who reviews what, seat crossing).
  Out of scope here: the designs say nothing about the protocol, so every one of them EXTENDS by
  construction.
- The design-session rulings were not re-read against the designs they produced. If that is ever
  wanted, it is a different question — *did the designs record what was ruled?* — and it is answered
  by each design's STATUS block, which lists what fell to the researcher's questions in that session.
