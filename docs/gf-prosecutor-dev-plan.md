# The Prosecutor, and how the Nuremberg Code enters the platform

Design record. Decided 2026-08-30 in discussion with the researcher, after an earlier design was
started and abandoned — that abandonment is recorded below, because the reason it was wrong is the
clearest statement of what the Prosecutor is.

## 1. What it is, and what it is not

**It is not an author.** A thesis is written by a human. Model output is non-deterministic and error
prone, and this platform has already published a false claim produced by exactly that route. Nothing
here writes a claim. *Re-read 2026-09-03 under `docs/gf-thesis-flows.md` §2: the drafting model
writes thesis text WITH the researcher, in the chat, and the researcher decides what becomes a
version; what this sentence rules is that the Prosecutor proposes CLUSTERS, never claims — a claim is
chosen at framing (thesis flows T1, §10).*

**It is not a second critic.** The Devil's Advocate reasons about the thesis. The Prosecutor reasons
about the *corpus*.

**What it is:** the instrument that reads a corpus too large for a person to hold in their head and
says *"these records, in this order, in this window, have the shape of a violation."* The
cross-referencing across a timeline is the work a human genuinely cannot do at scale — a single
record ("the reporting channel was absent for 32 days") is weak; the same record placed against
another record of what was known internally is not. The researcher still decides whether it is a
claim, and still writes it.

### The abandoned design, and why it was wrong

The first attempt had the Prosecutor emit `{claim, facts, inference}` — it proposed claims, ran
archive probes on them, and discarded what failed. The verification discipline was right. **The
output was not: it wrote claims.** That is the human's task, and no amount of verification around a
generated claim changes whose judgement it is.

It was also converging on a duplicate. `audit_thesis_claims` already extracts quoted assertions from
a thesis, runs `verify_claim_text` over them, and returns `PRESENT` / `ABSENT` /
`EXTRACTION_DIVERGENCE` / `NOT_CHECKED` with its own caps and blind-spot list. The probe runner being
written would have been a second implementation of `verdictFor` in `thesisClaimAudit.ts` — one rule,
two implementations, in the one place where divergence means the platform disagrees with itself about
whether a claim is verified.

**Whatever is built reuses that verdict rule. It does not restate it.**

## 2. What already exists — the duplication surface

Read this before writing anything.

| exists | does | gap against this design |
|---|---|---|
| `suggest_thesis` → `ThesisSynthesisAgent` | semantic search by topic over ≤20 `CONFIRMED` records, then emits `proposedTitle`, `thesisStatement`, a **full Hebrew `narrativeBody`** with footnote citations, `keyFigures`, `confidenceLevel`, `missingEvidence` | **it writes the thesis** — the risk named above, live today. No time range. No legal framework. No timeline. |
| `audit_thesis_claims` | verifies quoted claims already written, against the raw archive | owns the verdict rule; the Prosecutor must call it, not copy it |
| `ClaimTrajectory` | one claim followed through every capture, with intervals | already **is** the public disclosure timeline |
| `ThesisMention` | `KEY_FIGURE` · `EVIDENCE` · `TRACKED_URL` · `CLAIM_TRAJECTORY` on a version | carries all the ingredients; carries no **role** |
| `THESIS_REVISION_PROMPT` → `RevisionAgent` | takes the Devil's Advocate critique and revises | **instructs the model to soften** — see §7 |

**Semantic top-k cannot find what this design is for.** It ranks records that *resemble a query*. The
case that matters is records that are individually unremarkable and **jointly** damning — each one
alone looks ordinary and ranks low. A topic search returns the obvious records first, which are the
ones the researcher already knows about.

## 3. The Nuremberg Code sits at THESIS level, never at evidence level

Decided by the researcher, and the reason generalises.

`WITHHOLDING_INFORMATION` is tagged on nearly every MOH record, so as a filter it selects everything.
But over-tagging is the symptom, not the cause. The cause is:

> **A Nuremberg Code violation is not a property of a record. It is a relationship between records
> over an interval.**

No amount of tagging at the evidence level can express it, because the thing being asserted is not
present in any single record. Categories remain useful as a **ranking signal** and must never become
the filter that decides what a researcher gets to see — they are model-assigned at intake, so
clustering on them inherits intake's errors, while dates, ordering and trajectory intervals are
computed.

## 4. The four elements of an Article 1 violation

Article 1 requires consent given with *"sufficient knowledge and comprehension of the elements
involved"*, including *"all hazards reasonably to be expected"*, and places that duty on *"the person
who initiates, directs or engages in"* the intervention — personal and non-delegable.

Taken apart, it has four structural parts, and each is a different kind of thing:

| Article 1 requires | this platform |
|---|---|
| a **duty holder** | the office — see §6 |
| **what was known**, and when | `DOCUMENT` evidence — leaks, minutes, reports |
| **what the public was told**, and when | `ClaimTrajectory` — capture by capture |
| the **gap between them**, over a period | the interval, computed from captures |

**An Article 1 violation is a knowledge point paired with a disclosure interval, bearing a duty
holder.** It asserts a divergence between two timelines, one internal and one public.

This platform already computes both timelines. It was built for the diff problem and it happens to be
shaped like the legal test.

### ONE ARTICLE PER THESIS — decided 2026-08-30

**A thesis asserts exactly one Nuremberg Code article.** If it asserts more, that is the signal it is
covering too much.

The reasoning is the researcher's and it is about strength, not tidiness: a thesis spread across three
articles satisfies each of them halfway, and a half-satisfied test is not a claim. One article, every
element of it filled, is the thesis worth publishing — the same standard as *strong conditional on
what is missing*.

**It is a scope discipline first and a simplification second**, but the simplification is large. It
makes the discovery phase focused: the Prosecutor is asked for **one** article's record shape in a
window, not "find violations", so each run has a single retrieval specification and each run proposes
a separate candidate thesis. Several articles means several runs and several theses — which is the
correct output shape anyway.

**A course of conduct can genuinely engage two articles, and the rule does not deny that.** It
becomes two theses over overlapping evidence, each of which can be published, attacked and
strengthened on its own. That is better than one document where an attack on either half damages the
whole.

**The article is OPTIONAL.** Not every thesis is a Nuremberg claim — the currently published one
argues Israeli administrative duties of disclosure and negligence, and names no article. Null is a
legitimate and expected state.

### What is missing to express it — one field, and it is the judgement

`ThesisMention` already carries every ingredient type. What is absent:

1. **The article** — which provision is engaged. Not derivable: §4's four elements are records, and
   which legal test they satisfy is the judgement. **Stored, one value, on `Thesis`** — not on
   `ThesisVersion`, because the article is what the thesis *is*, and arguing a different one means
   starting a different thesis. That placement is what makes one-article-per-thesis structural rather
   than a rule in prose: there is one field, so there is one article.
2. **The interval, computed.** From the trajectory's capture-bounded interval, never from a stored
   date pair. Level 8's phantom `2024-08-29` boundary is exactly the failure mode of treating a
   stored date as the moment something changed.

**Role is NOT stored — it is derived.** See §4.1.

### 4.1 Role is derived from mention type, given the article

The four elements map one-to-one onto mention types that already exist, so no `role` column is
needed. For Article 1:

```
EVIDENCE, evidenceType DOCUMENT     ->  the knowledge point
CLAIM_TRAJECTORY                    ->  the disclosure interval
targetEntity of the cited evidence  ->  the duty holder (the office, per §6)
TRACKED_URL, or the trajectory's url ->  the page the duty was owed on
```

**Formally: `role = f(mention type, the thesis's article)`.** Because a thesis carries exactly one
article, that function is total — the article is a single value, so every mention type has exactly one
role within a given thesis. Under Article 10 a `CLAIM_TRAJECTORY` would mean "continuation or
expansion" instead of "disclosure interval"; that is a different thesis, and no ambiguity ever arises
inside one.

**Derived rather than stored, which is this repository's own pattern rather than a preference.**
`diffSurvivalView` derives display state from stored columns instead of storing it, and diff
`coverage` is *"derived on read from the raw chunks and the items — that way it answers for rows
written long before the check existed, and cannot go stale."* The same property holds here: the
derivation scores the **already-published** thesis at 3 of 4 elements without a migration, which is
how §8 was measured.

**A `role` column on `ThesisMention` was considered and rejected.** It looks cheap and is the option
that has to be unpicked: a mention would carry one role, roles are only meaningful relative to an
article the column does not record, and it buys nothing the derivation does not already give. If the
one-article rule is ever relaxed, the successor is a typed allegation record — never a role column.

## 5. The Code is bidirectional — a test AND a retrieval specification

Both directions matter and they are easy to conflate.

### As a test, on a cluster

If the prompt says *"read this corpus in light of the Nuremberg Code"*, the model will find
violations, because that is what models do with a frame. The Code becomes a rubber stamp and every
cluster passes. Instead the article's own structure is a gate:

> Article 1 requires a duty holder, a knowledge point, a disclosure interval, and a divergence
> between them. **Which record supplies each?** If any element has no record behind it, this cluster
> does not state an Article 1 violation — say so and stop.

A cluster missing an element then **fails, legibly**, instead of being written up with the gap papered
over in prose. Same shape as every vacuity guard here: an element with nothing behind it must not
count as satisfied. It also makes the output checkable — four named records, each inspectable.

### As a retrieval specification, on the corpus

The researcher's point, and it is the half that makes the Code useful *before* a cluster exists: an
article says **what to go looking for.** Each one implies a record shape.

| article | what it requires the corpus to contain |
|---|---|
| **1** — informed consent, knowledge of hazards | an internal knowledge point **+** a public disclosure timeline **+** a divergence between them |
| **10** — duty to terminate on probable cause of injury | a **harm signal** reaching the responsible body **+** evidence the programme **continued or expanded** after that date |
| **7** — preparations adequate to protect the subject | the existence, or absence, of a protective mechanism — pharmacovigilance and its reporting channel |
| **5** — no experiment where injury is expected a priori | a pre-existing risk assessment held before the intervention began |

**Article 10 is the one this corpus is closest to and has never been framed as.** Its retrieval
specification is *harm signal, then continuation or expansion.* The corpus holds a candidate: in the
same window the adverse-event reporting channel was absent from the page, the eligible population was
**widened to six-month-olds**. Expansion of the subject population is the opposite of termination.
Whether it engages Article 10 depends on the same missing datum as §8, and it is the researcher's
call — but no instrument has ever proposed the pairing, because nothing was looking for that shape.

**This is why the Code goes in as structure rather than as text.** As text it is a lens that flatters
whatever it is pointed at. As a set of required record shapes it both filters clusters and directs
search.

## 6. The duty holder is the OFFICE, not the individual

**Decision:** where an element requires a duty holder, it resolves to the institution — "משרד
הבריאות", not a named official. `Evidence.targetEntity` already holds exactly that, in a
deterministically resolved form.

**Why:** naming a `KeyFigure` as personally responsible for a consent violation is the most
defamation-exposed assertion this platform could publish. Check 7's per-sentence hedging and check
11's official-capacity test were built for *"X signed the guidance"*, not for *"X bears personal,
non-delegable responsibility."* See `defamation-risk.md`.

**The cost, recorded because it is real:** Article 1 makes the duty *personal and non-delegable* in
its own words. Naming the office is legally weaker on precisely the point the article is emphatic
about. This is a deliberate choice of a weaker-but-safer claim, not an oversight, and anyone
revisiting it should revisit it as a trade rather than as a bug.

It also has a modelling consequence: the duty-holder element may bind to `targetEntity` rather than to
a `KEY_FIGURE` mention, which would make three of the four elements resolvable without naming a person
at all.

## 7. The ratchet is implemented, not emergent

`THESIS_REVISION_PROMPT`, fed the Devil's Advocate critique and reachable from the UI:

> *"Addressing the strongest counter-arguments (soften overreaching claims, add nuance where needed)"*

and

> *"If a counter-argument is strong and cannot be addressed with available evidence, acknowledge the
> limitation explicitly in the revised text"*

and `revisionsExplained` asks the model to report *"which claims were softened."*

**The only agent that responds to the adversary is instructed to yield.** Nothing anywhere says a
claim the evidence supports should be *held*, and nothing treats a missing document as a FOI target
rather than as a defect in the thesis. The weakening observed across three consecutive versions was
the pipeline working as written.

**Consequence for the second placement.** Answering an objection has exactly three legitimate outputs:

- **the corpus already answers it** — with record ids;
- **a nameable document would answer it** — it becomes a FOI request and a whistleblower gap;
- **a genuine concession** — explicit, and rare.

If those are the only representable outputs, **"quietly hedge" is not expressible.** The failure is
removed by the shape rather than discouraged by a sentence — the same move as the destructive-DB
guard.

## 8. Measured on the live thesis — the acceptance test

Checked against the published staging thesis `cmt5jffqy000lf52mn6t56f3l` on 2026-08-30. **Three of the
four Article 1 elements are already present**, bound in prose only:

| element | present | which |
|---|---|---|
| duty holder | **no** | names `פרופ' מתי ברקוביץ'` only |
| knowledge point | yes | `0x065403…` rtmag, 2022-08-21 |
| disclosure interval | yes | 15 trajectories, 5 movements, 83 captures examined |
| the page | implicit | inside the trajectories; never cited as a `TRACKED_URL` mention |

**The named figure holds the wrong role.** Berkovitch is the *source* of the knowledge, not the bearer
of the duty. The officials who would bear it appear on the evidence record and nowhere in the thesis.

**And the thesis severs the connection it had assembled:**

> *"התזה אינה טוענת לקשר סיבתי בין הפרסום לבין השינויים בעמוד: ההחלפה אירעה ב-5 באוגוסט 2022 או
> לפניו, שישה-עשר יום לפני הפרסום, וסדר האירועים שולל את הכיוון הזה."*

The ordering does rule out *"the leak caused the removal."* But the leak's date is its **publication**
date, and the internal meeting it describes necessarily preceded it. So the ordering rules out the
weaker reading and is *consistent with* the stronger one. **"The order rules out this direction"
became "there is no connection."** No critic asked for that; it was conceded in the drafting.

**The stronger claim is not currently supported**, and one datum closes it: **the date of the
Berkovitch team's presentation to the Ministry.** Holder: Ministry of Health, or the research team.
Neither of the Devil's Advocate's two gaps is this one — a critic asks what would *undermine* the
thesis, and nothing in the pipeline asks what would *complete* it.

### Therefore, the acceptance test, fixed before the agent exists

A Prosecutor is working when, given this thesis and this corpus, it:

1. finds the pre-emptive concession in the `הקשר` section and names it as a concession;
2. proposes the date of the Berkovitch presentation as the datum that would close it, as a **FOI
   target**, not as a defect;
3. does **not** assert the stronger claim, because the corpus does not yet support it;
4. reports the Article 1 element that has no record behind it, rather than writing around it.

Judging it on whether its prose reads well is how a plausible-and-wrong tool gets shipped.

## 9. Computed versus argued — the line everything crosses

| computed, re-derivable, no model | argued, labelled as judgement |
|---|---|
| which records, their dates, their order | which article is engaged |
| the capture-bounded interval a claim vanished in | why this cluster fits that article |
| shared entity, shared figures, shared categories | what is missing to close it |

Demonstrated live: the reporting link's removal **and restoration**
(`present 2021-12-23 → absent 2022-08-05 → present 2022-09-06 → absent 2025-06-01`) is computed from a
trajectory over 83 captures. The same restoration also appears in the added chunks of diff
`0x751794…`, which check 17 now refuses as `CONTRADICTED`. **The computed layer answered a question the
argued layer could not be trusted on.** That is the whole argument for the split, on a live case.

## 10. The UI is view-only

Researcher work happens **only through MCP**. To be removed from the UI: `suggest_thesis`, and
creating a new thesis.

**Out of scope, deliberately:** whistleblower and FOI intake (`reportRoutes`) is the *public's*
channel, not researcher state, and belongs to its own pipeline and its own discussion.
`oauthInteractionRoutes` is what authorises the MCP connector at all — removing it removes the surface
everything is moving to.

## 11. Decided / open

**Decided:** the Prosecutor does not write claims · it reuses `audit_thesis_claims`' verdict rule ·
the Code applies at thesis level · articles enter as structure, both as a test and as a retrieval
specification · the duty holder is the office · blindness to the critique rather than enforced
ordering · UI is view-only · **one article per thesis, stored on `Thesis`, optional** (§4) · **role is
derived, never stored** (§4.1) · **`suggest_thesis` is RETIRED** (§11.1).

**Open, and the researcher's:** which articles to enable beyond 1 and 10. **Answered 2026-09-03 by
`docs/gf-thesis-flows.md` §10:** the Prosecutor writes its own run record and nothing else; its
consumer is framing, where a cluster is judged as the researcher's own proposal is; the name search
it needs is the gated corpus search, with no index table until a measurement asks for one.

### 11.1 `suggest_thesis` is retired, not narrowed

Decided 2026-08-30. Delete the tool and `ThesisSynthesisAgent` / `prompts/thesisSynthesis`.

**Removing the capability rather than forbidding its use** is already the house rule, established when
a credential file was deleted rather than restricted. `suggest_thesis` writes a full Hebrew narrative;
labelling that output as a draft would be a rule in prose against a copy-and-paste.

Three facts make it a small change:

- **`create_thesis_draft` already covers the human path completely** — `title`, `body`,
  `evidenceHashes`, `citations`. Retiring this blocks nobody from writing a thesis.
- **The citation plumbing is shared and survives** — `citationInput.ts`, `thesisCitationSplice.ts`,
  `tipTapUtils.ts` all serve `create_thesis_draft` too. Only the synthesis agent and its prompt are
  single-purpose.
- **Its retrieval is not salvageable.** Vector top-k by topic is precisely the mechanism §2 records as
  unable to find records that are individually unremarkable and jointly damning. There is no discovery
  brain here to keep.

**The honest cost:** no discovery entry point until the Prosecutor exists. Be clear what that means —
there is no tool today that finds cross-referenced clusters; there is one that drafts theses. What is
removed is a hazard, not a capability anything depends on.

Narrowing it in place was rejected: it keeps a retrieval brain that must be replaced anyway, making
two changes where one would do, under a name that would no longer describe the tool.
