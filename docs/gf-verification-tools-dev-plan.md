# Glass Fortress — Verification Tools

**Status:** designed, not built. Canonical spec — implement from this document.
**Designed:** 2026-08-23 with the researcher, from what a live thesis walk actually required.
Written for a session with **no prior context**.

---

## 1. The gap, stated precisely

This platform has institutionalised **argument** and left **verification** as improvisation.

Three argument tools exist and are good: the framing session (what should this thesis claim), the
diff debate (is this page change evidence), the publication rationale (why publish this version).
Each records a researcher's case and an adversary's reply.

Not one tool checks a claim against the archive.

Over one thesis paragraph, four separate factual errors were caught before publication. Every one
was caught by **re-deriving a number from primary data**, and every one had survived fluent,
plausible, internally coherent prose:

| Error | Caught by |
|---|---|
| "removed **on** 05.08.2022" — the archive supports *absent as of* that capture | reading the capture list |
| the restoration window might span the publication date | listing captures between the boundaries |
| `נמצאו יעילים ובטוחים לשימוש` claimed as added 06.09 — it was on the page 05.09 | fetching the raw capture |
| "six weeks" for a 31-day span | recomputing the span |

All four were done through an ad-hoc shell: `curl` to the Wayback Machine, a Prisma query for
capture dates, and a script that ran the platform's own extractor. **A researcher without an agent
driving a shell has none of it.**

That is the gap. Not "researchers need an AI co-pilot" — the platform needs the checks that
co-pilot was performing, as tools, available to anyone.

## 2. Design constraints

**Deterministic first.** Every tool here answers a question that has a mechanical answer: is this
string in that capture; what captures exist between these dates; does this asserted date match the
evidence. No tool in this set judges whether an inference is sound. That is the researcher's, and
saying so is part of the design rather than an apology for it.

**Go to the RAW archived HTML, never to `UrlSnapshot.fullText`.** `fullText` is a Readability
extraction that discards roughly 42% of the page (measured on capture `20220905111109`: 4,322
characters kept of 7,442). A verification tool built on it inherits exactly the blindness it exists
to detect — and would have confirmed the false claim it was checking.

**"Could not check" is never "checked and found nothing."** The recurring defect in this codebase.
Every tool returns an explicit unavailable state and never a passing answer it did not earn.

**Report, never block.** These are instruments, not gates. A researcher may publish over any of
them; the publication gate is where blocking lives, and it deliberately does not verify prose.

**These are research acts, so they are MCP tools** — not `npm` scripts. A researcher runs them
about their own thesis while writing it. Gated: each hits the Internet Archive, which is unbounded
per-call work.

## 3. The tools

### 3.1 `verify_claim_text`

> Was this exact string on this page at this capture?

**In:** tracked URL · capture identifier (Wayback timestamp, or a date resolved to the captures on
it) · the phrase.

**Out:** presence in **raw** archived text · presence in the **platform's extraction** · and an
explicit `EXTRACTION_DIVERGENCE` flag when they differ.

That third field is the point. Divergence means the pipeline is blind to something the page said —
the condition that produced a false claim in a real thesis. It must be surfaced, not smoothed.

Unavailable states, each distinct: the capture is not in the archive · the fetch failed · the URL
is not tracked.

### 3.2 `list_captures`

> What captures exist for this page between these dates?

**In:** tracked URL · optional date range.
**Out:** every capture with its Wayback timestamp and date, marking which are stored locally.

Trivial, and nothing exposes it today. `get_forensic_timeline` returns *diffs*; the trajectory tool
returns `snapshotsExamined` as a **count**. Neither lets a researcher answer *"is there a capture
between the publication and the change?"* — the question on which this thesis's central temporal
claim turned.

Stored-vs-archive matters: the platform holds 83 captures for the corona page while the archive
holds more, so an interval computed from stored captures alone is **wider than the truth**. Report
both, and say which is which.

### 3.3 `audit_thesis_claims`

> Which factual assertions in this body can I mechanically check, and do they hold?

**In:** thesis id.
**Out:** for each assertion found — what it claims, what the archive supports, and a verdict.

Deterministically extractable and therefore in scope:

- **Dates** (`05.08.2022`, `5 באוגוסט 2022`). For each: does a capture exist on that date, and does
  the body **assert an act on it** where the archive supports only an interval between captures?
  This is the single most productive check — it caught two of the four errors.
- **Quoted phrases** (inside quotation marks). Each verified via 3.1 against the captures the
  surrounding sentence refers to.
- **Intervals** (`בין … ל…`). Verified as adjacent captures with nothing between them.

Out of scope, and the tool **must say so in its own output**: spans and counts in Hebrew number
words (`שישה שבועות`, `שבעה תצלומים`) are not reliably extractable. That class produced one of the
four errors and this tool would not have caught it. A tool that lists what it cannot see is worth
more than one that implies completeness.

## 4. What this deliberately is not

- **Not a fact-checker.** It verifies that text was present and that dates match captures. Whether
  a change means what the thesis says it means is argument, and argument already has three tools.
- **Not an LLM reviewer.** A model judging model prose is how the phantom quote survived three
  assessment rounds.
- **Not a publication check.** Deliberately separate. The gate blocks; these inform. Wiring them
  into the gate would make them adversarial to the researcher rather than useful to them, and would
  turn "could not fetch the archive" into "cannot publish."

## 5. Build order

1. `list_captures` — no dependencies, immediately useful, and required by the other two.
2. `verify_claim_text` — the raw-fetch path plus the extraction comparison.
3. `audit_thesis_claims` — composes both.

Each gated, each dry by nature (they write nothing), each with the unavailable states above as
first-class results rather than thrown errors.

## 6. Tests

- A phrase present in raw HTML but dropped by Readability returns `EXTRACTION_DIVERGENCE` — build
  the fixture from capture `20220905111109` and `נמצאו יעילים ובטוחים לשימוש`, which is a real
  instance.
- A capture that is not in the archive is reported as unavailable, never as "phrase absent".
- A fetch failure is reported as unavailable, never as "phrase absent".
- `list_captures` distinguishes stored captures from archive-only ones.
- A body asserting an act **on** a date where the archive supports only an interval is flagged.
- A body stating an interval between two **adjacent** captures passes.
- `audit_thesis_claims` states, in its result, that Hebrew-word spans and counts are outside what
  it checked.

## 7. Why this and not a framing co-pilot

The obvious lesson from the thesis walk is *"an agent was good at framing, so build that."* It is
the wrong lesson.

Every catch in that walk came from re-deriving a claim from primary data. Every error introduced —
including by the agent, including while reviewing another agent's work — was fluent prose. Those
are the same property from two sides: an agent can afford to recompute everything at a cost no
human would pay, and will produce confident wrong claims at a rate no human would tolerate.

Building the argument half again would put the model where it is weakest. Building the verification
half puts a tool where it does not depend on trusting the model at all — which, on a platform whose
whole claim is that every assertion traces to checkable proof, is the only half that can be a
product.
