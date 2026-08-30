# The published thesis carried a false claim. It was withdrawn, measured, corrected and republished.

**2026-08-30 · staging · thesis `cmt5jffqy000lf52mn6t56f3l`**

This is a findings record, not a plan. `docs/gf-factual-layer-rebuild-dev-plan.md` holds decisions;
this holds what was measured on one day and the fifteen defects the day surfaced.

## What happened

| time (UTC) | act |
|---|---|
| 11:58 | `unpublish_thesis` — first ever execution of that path, against a **closed** publishing session |
| 12:00–13:00 | 25 raw-archive probes, the Archive's own digests, `list_captures` |
| — | five versions (v3 → v7), five Devil's Advocate critiques, three readiness runs |
| 13:10 | `publish_thesis` — v7 `cmtftn12g00279hs25jmhgdh1`, **16/16 hard checks, zero advisory failures** |

The version published on 2026-08-24 had published *with* `GAP_ACTIONABILITY` failing. The corrected
one clears every check.

## What was actually true

All figures below are `presentInRawArchive` from `verify_claim_text` — the WHOLE archived document,
not the platform's extraction.

| capture | `נמצאו יעילים ובטוחים לשימוש` | `לדיווח על תופעות לוואי >` |
|---|---|---|
| 2022-07-24 | present | **present** |
| 2022-07-31 | — | **present** (capture never scanned by the platform) |
| 2022-08-05 `053301` | present (divergent) | absent |
| 2022-08-05 `093544` | present (divergent) | absent |
| 2022-08-07 | present (divergent) | absent |
| 2022-08-10 | present (divergent) | absent |
| 2022-08-13 | present (divergent) | absent |
| 2022-08-15 | present (divergent) | absent |
| 2022-08-16 `130658` | present (divergent) | absent |
| 2022-08-16 `235351` | present (divergent) | absent |
| 2022-09-05 | present (divergent) | absent |
| 2022-09-06 | present | **present** |

"divergent" = `EXTRACTION_DIVERGENCE`: raw and the platform's extraction disagree.

**The two columns separate perfectly, and that separation is the whole story.** The reporting channel
shows NO divergence anywhere — the pipeline could see it and detected it correctly. The safety line
diverges at every one of the nine window captures — the pipeline was blind to it for the entire
period, and that blindness is where the false claim came from.

There is **no capture at all between 2022-08-16 and 2022-09-05**, so the page's state on the day the
Berkovitch recordings were published (2022-08-21) is not observable. `verify_claim_text` refused the
date rather than reporting absence.

## Four corrections, and who caught each

| claim | verdict | caught by |
|---|---|---|
| the safety line was ADDED on 2022-09-06 | **false** — present at all 11 probed captures | already known (2026-08-26); re-confirmed here at 4 more captures |
| the absence lasted **44 days** | **false** — 32 days, 9 captures. 44 counted from 2022-07-24 because the platform never scanned the 2022-07-31 capture | this session |
| the approved-vaccines detail was REMOVED on 09-06 | **false** — it was UPDATED: three vaccines became four, Novavax added (`cmtepamk8001g14g2nnyusjbc`) | this session, by probing an inference I had flagged as unverified |
| "asserted nothing was reported while offering no way to report" | **non-sequitur** — the 800,000 figure is explicitly US CDC/FDA surveillance, so the Israeli link has no bearing on it | the Devil's Advocate |

The last one is the span trap in a new costume: a verbatim-accurate quote read outside the clause
that scopes it. Raw-verifying a quote proves it was on the page; it can never prove it means what
you say it means.

## What the corrected thesis claims

For 32 days across 9 archived captures, the page urging parents to vaccinate infants from six months
carried **no adverse-event reporting link and no side-effect detail**, while the blanket
"found effective and safe" line stayed. The Archive records a **distinct digest for every one of
those nine captures** — the page was edited continuously and never once restored the link.

It disclaims, in its own body: causation with the recordings (16-day inversion, stated), that the
reporting system was disabled, and intent. A CMS deployment error is left open as an explanation.

## Two structural facts about the corpus, found in passing

**Nine distinct archived documents collapse to one stored content hash and one anchoring
transaction.** Every capture 2022-08-05 → 2022-09-05 has a different Archive digest; all nine share
`storedContentHash b5c0dd13…` and `storedOnChainTxHash 0xfee1cf0b…`. The extraction discards ~31% of
every page — enough that nine different documents become byte-identical text. Every diff and every
trajectory over that month is computed over an input that cannot tell those nine apart, and the chain
attests a hash that does not distinguish them either.

**A cited trajectory was confirmed capture-by-capture against the raw archive for the first time.**
`cmtepamk8001b14g2l8m3mnfb` (`לדיווח על תופעות לוואי >`) matches 11 independent raw probes exactly.
That is Level 6's unenforced invariant — *every reported flip confirmed against the documents at that
boundary* — satisfied by hand, for one claim.

## Fifteen defects, for R2 to rank

Numbered as found. None of these were being looked for.

1. **`EVIDENCE_DIFF_INPUT_SOUND` — no gate checks whether an evidence summary is true.**
   `0x7517…` is anchored, `CONFIRMED`, passed all 16 checks, and its summary says the safety
   presentation was *added* on 2022-09-06. Computable fix, no model: for every cited `FORENSIC_DIFF`,
   probe the chunks its own diff marked ADDED/REMOVED against the **raw** archive at both boundary
   captures. A chunk marked ADDED at B that is already in raw at A is an extraction artifact.
   **This is Level 6's invariant one layer up — one rule with two callers, not two features.**
2. **Silent retraction.** `unpublishThesis` writes its event only `...(sessionId ? [...] : [])`. With
   no active session and no `THESIS_PUBLISHED` event carrying that `refId`, the retraction proceeds
   and records nothing anywhere. Failure and success share a representation in the one operation
   whose purpose is accountability.
3. **No public retraction notice.** Unpublishing nulls `publishedVersionId`/`publishedAt`/
   `publishedById`; the public gets a 404. A platform whose thesis is that a public body quietly
   removed things from a public page currently retracts by quietly removing a thesis from a public
   page. Researcher's design call.
4. **The framing assessor asserted a model claim as trajectory-proven, and that is the origin of the
   false claim.** Event log: assessment #1 filed a formal `contradictions` entry against the
   researcher claiming the safety line was *added*; the researcher pushed back on textual accuracy;
   assessments #2 and #3 then restated it as `מסלולי הטענות T1, T5 ו-T6 מוכיחים … נוספה לראשונה …
   (T8)`. Check whether `T8` is the trajectory whose stored `finalState` is `REMOVED, lastSeen
   2022-07-24` — if so, a model cited a record saying *removed* as proof of an *addition*.
5. **31% extraction loss collapses 9 documents to 1 hash and 1 anchor tx** (above). Also:
   check 14's own summary says snapshots are "anchored individually"; these nine share one
   transaction.
6. **`storedLocally: false` captures silently widen every published interval.** The 44-vs-32 defect.
   `list_captures` states the hazard in its own explanation; the published thesis contained it.
   Generalises to every duration any thesis prints.
7. **The reporting channel was removed again on 2025-06-01 and is still gone** — 5 captures, 277
   days, open-ended, per `cmtepamk8001b…`. Present-tense, extraction-derived, unverified against raw,
   outside the 2022 scope.
8. **The 2022-08-05 → 09-06 window is a chapter SWAP, not a stripping.** Group `444b89f0` — 7
   toddler-vaccination claims — is present in exactly the 9 captures the reporting link is absent.
   Identical window, inverse polarity. Invisible until the critic named it.
9. **`FIGURES_HEDGED` turns on how a name is spelled — demonstrated, not argued.** v5 wrote
   `צוות ברקוביץ'` and the check passed with *"No sentence names a key figure"*. v6 wrote
   `פרופ' מתי ברקוביץ'` and it failed. Same person, same sentence, same claim. A hard gate with a
   trivial bypass, and an empty check scoring as a pass — the `VACUOUS` shape the integrity board
   already demotes.
10. **`FRAMING_ATTACHED` passes on a framing the thesis contradicts.** The attached session asks
    about proximity to the recordings; v7 states the ordering that rules it out. The check verifies
    a framing is attached, never that it is the framing being argued.
11. **`RATIONALE_ENTAILED_BY_BODY` — researcher's design.** The rationale is a claim about the
    thesis, not about the world; its only unique failure mode is misdescribing the body. Verifying it
    against the archive re-runs the gates' work with a model instead of a string search — which is
    how the false claim got in. One importable symbol,
    `checkRationaleAgainstBody(rationale, body, citedRecords)`, deterministic over numbers, dates,
    durations, quoted strings and named entities. Three call sites: `add_thesis_version` (mark
    `RATIONALE_STALE`), `run_ai_analysis` (**refuse while stale** — this is the paid step), the
    publication gate (replacing the *merit* arm of `RATIONALE_SUBSTANCE`). Needs the rationale stored
    as a versioned artifact, and a vacuity guard. **Extend it to the public-interest statement.**
    Three exhibits in one afternoon: rationale drifted twice, public-interest statement once.
12. **The Prosecutor agent — researcher's design, and the highest-value item here.** The pipeline has
    an adversary and no advocate, so every iteration has one direction and the thesis ratchets weaker
    even when each step looks reasonable. That is exactly what v3 → v4 → v5 was. Symmetric in role,
    NOT in privilege: a wrong critic is harmless, a wrong prosecutor publishes. Constraints that make
    it safe: (a) emits a worklist of probes, not prose; (b) runs its own probes before returning and
    discards what fails, so there is no path by which it emits something unverified — the
    `runOperationalScript` pattern; (c) `{claim, facts, inference}` with `inference` separated, which
    is what would have caught the 800,000 bridge and what keeps it inside Level 8; (d) runs BEFORE
    the Devil's Advocate and blind to strength ratings, or it just relocates the timid-reaction bias;
    (e) vacuity guard — `NOTHING_SURVIVED`, never an empty success. MCP tool. Enforced by
    **`PROSECUTION_RUN`** on the head version, advisory at first, so it is countable on the board.
13. **`CITES_EVIDENCE` forces a document onto an archive-based thesis.** v7's factual base is
    trajectories and raw probes, none of which are evidence records; its only cited record is the one
    the critic argued *weakens* it. The gate assumes theses rest on documents. *(One run only — the
    objection did not recur on v7.)*
14. **`overallStrengthAssessment` is `MODERATE` 9 for 9** — every analysis ever run on this thesis,
    across two substantively different theses and five rewrites, including one whose central argument
    its own critic called a non-sequitur and one that removed it. A scale returning one value is not
    measuring. Related: only the top objection reproduces — v6 and v7 assert **identical** claims and
    share 1 of 3 objections. Treat a lone `MODERATE`/`WEAK` as sampled, not as a finding.
15. **No editorial-amendment path.** Any version change resets `PENDING_AI` and invalidates
    `ANALYSIS_CURRENT`, so a two-word hedge fix costs a full paid re-critique. `cite_trajectories`
    covers citation-only edits asserting the prose byte-identical; nothing covers prose-only fixes
    that change no claim. A friction cost paid directly on correctness.

## Open, and reserved to the researcher

- **Track the MOH reporting-portal URL.** The one objection that reproduced in BOTH critiques is
  *"you have not shown the form was unreachable elsewhere"* — and the critic asserts, without
  evidence, that parallel channels existed. It is decidable against the same archive, it is cheap,
  and it could move the published thesis in either direction. `verify_claim_text` and `list_captures`
  both require a **tracked** URL, and adding one is the researcher's call.
- Re-frame the session question to match v7 — the thesis has outgrown its framing.
- The `2025-06-01` removal (item 7).
