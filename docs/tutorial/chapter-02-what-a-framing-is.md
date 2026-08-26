# Chapter 2 material — what a framing is, and why it is not the thesis

**Material, not a shipped chapter.** Nothing here is in `chapters.ts` yet. Per
`docs/gf-chat-tutorial-dev-plan.md`, a chapter is written from work actually done and then run cold in
a clean claude.ai session before the next one is written. This is the first half of that: the material,
captured while the work was happening, on 2026-08-26 during the production thesis walk.

It exists because a researcher who has used this platform for weeks asked, mid-walk, *"I thought the
Hebrew text we are about to send IS the thesis framing — remind me of the difference."* If the person
who invented the framing question has to ask, the distinction is not being taught anywhere.

---

## The lesson

Three inputs, three different jobs, easy to collapse into one:

| | what it is | mood | who writes it | tool |
|---|---|---|---|---|
| **question** | what you want to find out | interrogative — survives a "no" | the researcher | `open_thesis_framing` |
| **framing** | what you think the thesis should **argue** | assertive — a claim that can be wrong | the researcher | `assess_thesis_framing` |
| **body** | the argued document, with per-claim citations | the finished text | the researcher | `create_thesis_draft` |

The question is deliberately neutral. The framing is deliberately not — it asserts something, which is
what makes it testable.

`assess_thesis_framing` returns four things, and only one of them is the point:

- **`contradictions`** — where *your own evidence points the other way*. Not a critique of your
  reasoning: a report that the vault disagrees with you.
- `candidateFramings` — narrower and broader alternatives, each tied to specific `fileHashes`
- `unverifiedAssumptions` — what the framing leans on that nothing in the vault establishes, and how
  to verify it
- `recommendedTopicString` — the bridge onward, since the topic decides which evidence gets pulled and
  what the Devil's Advocate attacks

**Why it is a separate step:** a wrong framing produces a well-argued thesis about the wrong thing.
You find that out from the Devil's Advocate after the writing, or from the opposing side after
publication. Here it costs one call.

**Why the researcher writes it:** the researcher proposes, the model assesses. A model that proposed
the framing and then assessed it would be arguing with itself — the failure the diff debate exists to
prevent. This is also why the stored text is never silently corrected: it is the record of what the
researcher argued, typos included.

## The case that makes it worth teaching — and it is the opposite of the obvious one

The naive lesson is "submit your framing and the machine will find the holes in it". The real record
says something better.

Staging framing sessions `cmt4ptxnt000174gc1fdaaxvz`, `cmt4uv9c7001q116spl54e6hg` and
`cmt5gm7lr0005f52m6v5fiy3r` all carry a byte-identical question and a byte-identical round-1 framing.
The first two drew a claimed **contradiction**. The researcher did not fold. The round-2 rebuttal
(recorded verbatim on the session) established that the assessor had:

1. **misquoted the claim** — the researcher wrote *"הסרה של התחייבות לבטיחות, והחזרתה"*, two parts;
   the assessor quoted only the first and added *"בעקבות החשיפה"*, which the researcher never wrote;
2. **attributed to the archive words that are not in it** — the assessor's framing said the page
   described side effects as *"חולפות"* and *"בלבד"*. Neither word appears. The page says
   *"תופעות הלוואי השכיחות … מופיעות לרוב יום או יומיים אחרי קבלת החיסון"* — time of onset, not
   duration;
3. **treated an unproven date as a premise** the researcher had never relied on.

The contradiction was withdrawn. Run 3 returned `contradictions: []`.

**So the lesson is: the framing test is valuable because the machine can be wrong inside it, and you
can prove that from the archive.** A learner taught to defer to the assessment has learned the wrong
thing and would have lost this framing.

## Why this can be a READ-ONLY chapter

`get_thesis_framing` is in `READ_TOOLS` (`src/mcp/mcpRoutes.ts`) — no auth, no model, no RPC, no write.
A learner can open a real, completed framing session and read the whole exchange: the claim, the
contradiction, the rebuttal, the withdrawal.

That matters for the build order. `docs/gf-chat-tutorial-dev-plan.md` §"What changes for chapters that
WRITE" lists three problems — auth, real rows on a production the public reads, and one-active-session
exclusivity. **None of them applies to teaching what a framing IS.** The concept chapter is read-only
and infinitely repeatable; the write chapter then only has to teach *doing* it, to a learner who
already knows what it is.

## Constraints this chapter inherits

- **State nothing not fetched in this conversation.** The corpus numbers here (8 records, 7 significant
  diffs, 290 chunks) are the state on 2026-08-26 and must never be hardcoded into the chapter — the
  assistant fetches them.
- **Never show a human a hash in a list.** Session ids and `fileHashes` above are for the builder
  reading this file, not for the learner.
- **Teach in Hebrew.**

## Material added 2026-08-26 — the production run, and a better ending

The production framing (`cmta7d2zs0001fd7pxtbezflk`) reproduced the staging arc exactly: round 1 drew
the same misquote-contradiction, round 2 sent the researcher's rebuttal verbatim and cleared it to
`contradictions: []`. **Four for four** across both environments — see
`docs/gf-framing-assessor-defects.md`.

That gives the chapter a second act it did not have, and it is the stronger half: **the researcher was
also wrong, and the machine did not catch that either.**

- The rebuttal asserted *"חמישה דפוסי טענות"*. Production's own deterministic layer says **seven**
  (23 claims). The number was true on staging and carried across unverified.
- A far worse one: *"ונוספה הקביעה 'נמצאו יעילים ובטוחים לשימוש'"* is **false in both environments**.
  The phrase was on the raw page on 2022-07-24, 2022-08-05 and 2022-09-06 alike. It was never added,
  and never removed. `verify_claim_text` on the 08-05 capture returns `EXTRACTION_DIVERGENCE` — the
  phrase is in the page and absent from the extraction every derived layer is computed over.
- Three models and the researcher all agreed on it, because all four were reading the same extraction.

**The lesson the chapter should end on:** agreement between readers of one derived artifact is not
corroboration. The framing round audits neither party, so the researcher must audit both — and
`verify_claim_text` is the instrument, because it reads the raw archived document rather than what the
platform stored.

This is teachable read-only: a learner can watch the exchange with `get_thesis_framing`, then run
`verify_claim_text` on the disputed phrase themselves and find that **both sides were wrong about it**.
No writes, no auth, and it ends with the learner holding something neither participant had.

## Open before this becomes a chapter

- **Which session does the learner read?** Staging's `cmt5gm7lr…` has the complete arc including the
  rebuttal. Production's `cmta7d2zs0001fd7pxtbezflk` is being written now and may end with no
  contradiction at all — in which case it teaches a weaker version of the lesson.
- Whether a chapter may point a learner at staging, given that staging is behind the access gate.
