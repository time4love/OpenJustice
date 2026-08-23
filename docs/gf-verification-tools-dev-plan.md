# Glass Fortress — Verification Tools

**Status:** BUILT 2026-08-23. All three tools live as gated MCP tools; §8 records what the build
found. This document remains canonical — §1-§7 are the design as specified, §8 is what implementing
it changed.
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
extraction that discards 31% of the page (measured on capture `20220905111109`: 4,330 characters
kept of 6,266 — see §8.4). A verification tool built on it inherits exactly the blindness it exists
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

---

## 8. What the build found — 2026-08-23

Implemented as specified. Five things the design did not anticipate, each recorded because the
reasoning matters more than the code.

### 8.1 The extractor had to be shared, not re-implemented

`verify_claim_text` compares the raw archived page against *the platform's extraction*. If that
comparison ran against a second copy of the extractor, it would eventually stop measuring the
extractor that actually runs — and a divergence check that has quietly stopped measuring anything is
worse than no check.

So `htmlToText`, `normaliseText` and the Readability path moved out of `WaybackScraper` into
`src/lib/archiveText.ts`, and the scanner now calls the same `extractArticleText()` the verification
tools call. Likewise the Internet Archive HTTP layer (retry policy, transient classification, the
`id_` capture URL) moved to `src/lib/archiveHttp.ts`: two modules hitting the same flaky third-party
service must not diverge on what "transient" means, or the first symptom is a verification tool
reporting "phrase absent" for a page the archive merely failed to return.

`archiveText.htmlToText` also gained one behaviour change: `<script>`, `<style>`, `<noscript>` and
`<template>` bodies are stripped. Harmless in Readability's output, which never contains them — but
the raw read is the whole document, and an inline script would otherwise contribute its source to
the text and make a phrase look present on a page that never displayed it.

### 8.2 A researcher-facing call cannot use a scanner's retry budget

The scanner retries CDX four times with 8s exponential back-off — up to two minutes — because nobody
is waiting on it. These tools are called synchronously by a researcher mid-sentence, and they are
*built* to report an unreachable archive honestly. `INTERACTIVE_RETRY` (one retry, 1s base) is
therefore a separate policy: failing fast and saying "the archive did not answer" is a better answer
than the same words after two minutes of silence.

### 8.3 The "could not check" defect reappeared inside the new tool

`audit_thesis_claims` flags a dated act when no capture exists on that date. With **every** page's
capture index unfetchable, "no capture on that date" and "we never looked" are the same absence —
and the first implementation flagged both, turning an archive outage into a finding against the
researcher. The exact defect the whole toolset exists to prevent, reproduced inside it within an
hour of writing the rule down.

Fixed: a flag now requires at least one page to have been consulted. Two regression tests cover it
(`does NOT flag a dated act when the archive could not be reached at all`, and the interval
equivalent, which was otherwise reporting "this is the tightest interval the archive supports"
having consulted nothing).

### 8.4 The 42% figure was measured against a different denominator

The design cites "4,322 characters kept of 7,442". Running `verify_claim_text` against the live
archive on 2026-08-23 measures **4,330 of 6,266 — 31% discarded**, because the raw read now strips
script and style bodies (§8.1), which the original hand-measurement counted as page text. The
finding is unchanged and the sentence is still dropped; only the ratio moves. The code and this
document now carry the measured number rather than the remembered one.

### 8.5 Testing the extractor required its own jest project

Every test in this suite mocks `jsdom` and `@mozilla/readability` away, because jsdom's dependency
chain is ESM-only and ts-jest cannot parse it. That mock is fine for the scanner's control flow and
useless here: `EXTRACTION_DIVERGENCE` is a claim about what the **real** Readability drops from a
**real** page, and a test against a stub would assert the stub.

`jest.config.ts` now declares two projects. `unit` is unchanged. `extraction` transforms
`node_modules` so `test/extraction/` can run the genuine extractor against
`test/fixtures/wayback-vaccine-20220905111109-raw.html` — the verbatim raw capture, frozen to disk.
Both run under `npm test`.

### 8.6 Live results

Against the real archive and the real staging thesis
(`cmt5jffqy000lf52mn6t56f3l`, 133 captures):

- `verify_claim_text` on capture `20220905111109` for `נמצאו יעילים ובטוחים לשימוש` —
  `presentInRawArchive: true`, `presentInPlatformExtraction: false`, `presentInStoredSnapshot: false`,
  `extractionDivergence: true`. The stored column every diff, trajectory and on-chain `contentHash`
  for this page derives from is blind to a sentence the page carried.
- `audit_thesis_claims` found 9 dates and flagged one: the body asserts an edit (`נערך`) on
  2022-08-21, a day with no capture — the archive supports only *somewhere between 2022-08-16 and
  2022-09-05*.

### 8.7 Where the code lives

| Piece | File |
|---|---|
| Archive HTTP: retry policy, `id_` URLs, capture fetch | `src/lib/archiveHttp.ts` |
| The two readings of a captured page | `src/lib/archiveText.ts` |
| Deterministic assertion extraction + `UNCHECKABLE_CLASSES` | `src/lib/thesisAssertions.ts` |
| `listCaptures` · `verifyClaimText` · `checkPhraseAtCaptures` | `src/services/archiveVerification.ts` |
| `auditThesisClaims` | `src/services/thesisClaimAudit.ts` |
| MCP tools | `src/mcp/tools/{listCaptures,verifyClaimText,auditThesisClaims}.ts` |
| Gating (all three in `WRITE_TOOLS`) | `src/mcp/mcpRoutes.ts` |
| Tests | `test/{archiveVerification,thesisAssertions,thesisClaimAudit}.test.ts`, `test/extraction/` |

### 8.8 Deliberately still not done

- **Not wired into the publication gate**, per §4. The gate blocks; these inform.
- **No REST route and no UI.** These are research acts performed while writing, and the researcher
  drives them over MCP. A public read-only view of a capture list is a separate question.
- **`audit_thesis_claims` audits the HEAD version only.** Auditing a *published* pin is a real use
  and is not built; the result names the `versionId` it read so there is no ambiguity about which.
