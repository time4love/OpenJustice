# One stock phrase, three models, an anchored evidence record

*Originally "The framing round audits neither party" — widened when the same fabrication turned up
in the evidence layer.*

**Found 2026-08-26**, during the production thesis walk. Not fixed — deferred deliberately so the fix
is chosen in its own session rather than mid-walk. The reproduction case is permanent production data
and cannot evaporate: framing session `cmta7d2zs0001fd7pxtbezflk`, rounds 1 and 2.

---

## Defect 1 — `researcherClaim` is a paraphrase slot, and the paraphrase is wrong the same way every time

`src/services/ThesisFramingAssessorAgent.ts`:

```ts
researcherClaim: z.string().describe(
  'The part of the proposed framing that the evidence does not support.')
```

Nothing requires this to be a verbatim span of `proposedFraming`, and nothing validates that it is. The
model is asked to *characterise* the researcher's claim, and a characterisation is a generation.

**Four runs, two environments, two corpora, five days apart — the same three errors every time.**

| session | env | round-1 verdict |
|---|---|---|
| `cmt4ptxnt000174gc1fdaaxvz` | staging | contradiction, same shape |
| `cmt4uv9c7001q116spl54e6hg` | staging | contradiction, same shape |
| `cmt5gm7lr0005f52m6v5fiy3r` round 1 | staging | contradiction, same shape |
| `cmta7d2zs0001fd7pxtbezflk` round 1 | **production** | contradiction, same shape |

The researcher wrote: *"השינויים מראים הסרה של התחייבות לבטיחות, **והחזרתה**"*. Every run returned
`researcherClaim` as *"…הסרה של התחייבות לבטיחות **בעקבות החשיפה**…"*.

| error | the prior driving it |
|---|---|
| dropped `והחזרתה` | compression drops a short trailing conjunct after a comma; the sentence's dominant frame is removal |
| inserted `בעקבות החשיפה` | the session's *question* asks about acting "in step with what it knew internally"; the model normalises the claim toward the standard causal shape |
| asserted the page said `קלות וחולפות בלבד` | `תופעות לוואי קלות וחולפות` is a stock Hebrew public-health collocation. It completed a familiar phrase instead of reading the page. |

**Reproducibility is the signature of a systematic bias, not evidence against one.** Sampling
non-determinism moves the wording; it does not move the priors. All three are prior-driven, so all
three reproduce.

Two things in the schema make it worse, and the model reads both:

- `contradictions` is described to it as **"THE most valuable output"** — an incentive to produce one.
  The guard *"never invent one to appear critical"* prevents fabricating a contradiction, not
  misquoting the researcher into one.
- `whatEvidenceShows` is equally unconstrained, and **nothing checks it against the archive.**

Verified against production's raw archived document, capture `20220906232435`:

| phrase | `presentInRawArchive` |
|---|---|
| `חולפות` | **false** |
| `בלבד` | **false** |
| `תופעות הלוואי השכיחות … מופיעות לרוב יום או יומיים אחרי קבלת החיסון` | true |

`extractionDivergence: false` in every case, so the ~34% the extraction discards is not an excuse. The
page states **time of onset**, not duration.

### The fix, and why it is a decision rather than a patch

Enforce `researcherClaim` as a whitespace-collapsed **substring** of `proposedFraming`, using the same
normalisation `verify_claim_text` already applies. That makes all four instances structurally
impossible: the model may still disagree with the researcher, it just cannot disagree with something
they did not say.

What happens when the model will not comply is the actual decision, and the options are not equivalent:

| option | cost |
|---|---|
| drop the contradiction | silently suppresses ones that may be real — worst option |
| retry until it complies | burns LLM calls; may loop on a genuinely paraphrase-shaped objection |
| keep it, flag `claimQuoteVerified: false` | the researcher is shown "the machine paraphrased you here". Suppresses nothing. **Preferred, but it is a judgement about what the researcher should see.** |

## Defect 2 — the researcher is not audited either, and a false number went through unchallenged

Round 2 on production asserted *"חמישה דפוסי טענות"* removed on 05.08.2022 and restored on 06.09.2022.
Production's own trajectory computation (83 snapshots, `v1-collapse-ws-min40-substring-presence`,
`computedAt 2026-08-26T14:52:01Z`, `fromCache: true`) reports **seven** groups — 23 claims — matching
that pattern.

The number was almost certainly correct on staging, where grouping was computed over a different
corpus. It was carried across environments unverified. It understates, so it is safe in direction and
wrong in fact.

**The assessor read the rebuttal, accepted the framing, and never questioned the number.** The other
four assertions in the same rebuttal were verified and all held, including the toddler chapter
(11 claims, `firstSeen: 2022-08-05`, absent by 06.09) and the named claim
`אין סיכוי לחלות בקורונה בגלל החיסון`, which appears in 4 of the 7 groups.

## The finding underneath both

`audit_thesis_claims` checks the **researcher's** quotations, dates and intervals against the archive,
mechanically, with no model involved. Nothing does this for the framing round — in either direction.
The critic can assert page wording that is not on the page; the researcher can assert a count the
platform's own deterministic layer contradicts. Both happened, in the same exchange, and neither was
caught by the system.

The one participant whose assertions are never verified is the one the researcher is told to defer to.

## Why this was not fixed on the spot

The framing phase of the production walk is complete and `contradictions: []`. `assess_thesis_framing`
has no role in any remaining step, and the thesis body has `audit_thesis_claims` waiting for it. A fix
landing now would change nothing downstream — but re-running the framing to obtain a "clean" record
would manufacture precisely the retry pattern `docs/gf-production-thesis-replay-plan.md` exists to
delete. Staging did that three times.

The existing record is also better than a clean one: it shows a machine misquoting a researcher and the
researcher refuting it from the raw archive. That is honest provenance, permanently attached to the
thesis.


---

# Defect 3 — the same fabrication is inside a CONFIRMED, anchored evidence record

Found later the same day, while mapping production's corpus for the thesis draft.

Evidence `0x7517947a3d70258567e0e02aa5737668c58ae24b5ee1dfef46eba3b737df2ac9` (2022-09-06, Tier 2,
CONFIRMED, anchored) carries this summary:

> "…תוך צמצום תיאור תופעות הלוואי לתסמינים **קלים וחולפים בלבד** (חום וכאב מקומי)…"

Verified against the raw archived capture `20220906232435`, `extractionDivergence: false` in each case:

| phrase | `presentInRawArchive` |
|---|---|
| `חולפים` | **false** |
| `חולפות` | **false** |
| `בלבד` | **false** |

Being precise about what is wrong, because only part of it is:

| the summary asserts | the page | verdict |
|---|---|---|
| `וחולפים` — a DURATION claim | states only onset: "מופיעות לרוב יום או יומיים אחרי קבלת החיסון" | **unsupported; the page makes no duration claim** |
| `בלבד` — only mild ones | lists common mild effects, mentions no prolonged ones | inference from omission — defensible as characterisation, presented as description |
| toddler content removed, blanket FDA safety claim added | matches the diff | supported |

The fabricated part is narrow and specific: **a duration claim attributed to a source that never made
one** — in a record that is anchored on-chain, citable, and was cited by staging's published thesis.

## The pattern, which is the actual finding

| who | text |
|---|---|
| the forensic **classifier** | evidence summary — `קלים וחולפים בלבד` |
| the framing **assessor** | round-1 contradiction — `קלות וחולפות בלבד` |
| the **researcher** | refused it, twice, in two environments, and was right both times |

`תופעות לוואי קלות וחולפות` is a stock Hebrew public-health collocation. Three independent model calls
imported it from their priors and attributed it to the source. This is training-prior contamination
reaching an evidence layer — and the page's actual wording (**onset, not duration**) is the exact
distinction the thesis turns on.

It also explains Defect 1's reproducibility from a second direction: this is not one model's quirk,
it is what any model fluent in Hebrew public-health register does with this page unless something
stops it.

## What makes the correction possible at all

`forensics:resummarize` rewrites `aiSignificance` from already-extracted items and records a
`SummaryCorrection` row (`src/services/resummarizeDiffs.ts`). It does not re-extract and does not touch
the chain.

**Because evidence identity became snapshot-derived on 2026-08-23, correcting a summary does not change
`fileHash` and does not orphan the anchor.** Under the previous classifier-derived identity, fixing a
summary would have broken the record's chain of custody — the correction would have cost more than the
defect. That design decision pays for itself precisely here.

## Not done, and why

Deferred to its own session. Re-running the same model over the same extracted items gives no guarantee
the collocation does not return — the prior that produced it is still there. A correction pass needs a
before/after verification design (assert the rewritten summary contains no phrase absent from the
capture it describes), which is its own piece of work.

**Interim constraint, applied to the production thesis draft:** cite `0x7517947a…` for what the diff
demonstrably shows, and rest every side-effects claim on `verify_claim_text`-backed page wording rather
than on the classifier's prose.

---

# Defect 4 — the extraction falsified a claim in a PUBLISHED thesis, and the defect was already known

`נמצאו יעילים ובטוחים לשימוש`, checked against the raw archive:

| capture | raw | platform extraction |
|---|---|---|
| 2022-07-24 | present | present |
| **2022-08-05** | **present** | **ABSENT** — `EXTRACTION_DIVERGENCE`, on both captures that day |
| 2022-09-06 | present | present |

The phrase was never removed and never added. The trajectory layer reported it as removed on 08-05 and
never restored, because trajectories are computed over the extraction. On that strength:

- **staging's published thesis** asserts the safety statement was *added* on 2022-09-06;
- so does its `PUBLICATION_RATIONALE`;
- so does the researcher's framing rebuttal, on **both** environments;
- so do the framing assessor's candidate framings, in all four runs.

Three models and the researcher agreed with each other because all four were reading the same
extraction. Agreement between readers of one derived artifact is not corroboration.

**The defect was already documented.** The memory note on `UrlSnapshot.fullText` being a Readability
extraction records — from the same capture — that *"a substantive FDA claim was among what it
dropped"*. Nobody connected the known drop to the claim it had already falsified. **Knowing that an
extraction discards content is not the same as knowing which assertions it has made false.**

`verify_claim_text` finds these and names the condition explicitly. It must be run on every
load-bearing quotation **before** a thesis states it, not after.

## What survived, and on better ground

The seven co-movement groups (23 claims) removed on 2022-08-05 and restored on 2022-09-06 were
re-verified probe-by-probe against the **raw** archive at both ends — six distinct probes covering all
seven groups, `extractionDivergence: false` throughout. Those removals are real.

The corrected version is also the stronger one: the ministry removed the adverse-event reporting
channel, the side-effects detail and the dosing guidance **while the blanket "found safe and effective"
line stayed on the page throughout**.

## Unresolved

Staging's thesis `cmt5jffqy000lf52mn6t56f3l` **is still published and still contains the false claim.**
`unpublish_thesis` exists; the decision is the researcher's.
