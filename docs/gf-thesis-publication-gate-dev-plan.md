# Glass Fortress — Thesis Publication Gate

**Status:** designed, not built. Canonical spec — implement from this document.
**Designed:** 2026-08-23, with the researcher. **Every decision below was theirs**; where the
rationale is recorded it is because it changed the design, not as decoration.

**Thesis work on staging is deliberately on hold until this ships.** Publishing is the final step
of the thesis workflow, so walking that workflow before the gate exists would mean publishing a
narrative naming living officials through a door with no lock. Holding is the correct order, not a
delay.

---

## 1. What is true today

Nothing gates publication.

`run_ai_analysis` completes → `ThesisVersion.status` becomes `COMPLETE` → the public thesis page,
`get_thesis_context` (an **open**, unauthenticated MCP read) and the derived Call for Whistleblowers
all follow `headVersion`. **Whatever last ran the Devil's Advocate is what the public sees.**

Two things make that worse than it sounds:

- **It is the least gated write in the system.** Promoting a single piece of evidence requires a
  chain check and a deliberate human decision. Promoting one diff by hand requires an argued
  debate with substance as a hard gate. Publishing an entire narrative that names living officials
  requires nothing.
- **It was already a known requirement.** `defamation-risk.md`, from the 2026-08-09 analysis,
  carries an unchecked box: *"Human review gate: researcher must explicitly approve call page
  publication."* This is an outstanding commitment, not a new idea — which is also why the checks
  below are drawn from Rules 1-5 of that document rather than invented.

## 2. Design

### 2.1 Publication is a pinned version, not a flag

`Thesis.publishedVersionId` names the exact `ThesisVersion` the public sees.

- `null` ⇒ DRAFT. Visible to approved researchers only.
- Set ⇒ the public sees **that version and only that version**, until someone publishes again.
  Editing the head and re-running the adversary changes nothing public.

This is not a policy preference. With a boolean flag the public silently follows every later edit,
so a researcher publishes one text and the public ends up reading another. A pinned version is
correctness.

Publication is **reversible**. Unpublishing sets the pin to null and deletes nothing.

### 2.2 Publishing happens inside an active research session

**Decision:** any approved researcher may publish, but only from an `ACTIVE` research session, and
only one session may be active at a time.

Rationale: a publication then attaches to a named, current piece of work, and its rationale lands
in the same event log as the framing that chose the question. An untethered publish is an act with
no context.

**A live defect this exposed.** `createResearchSession` closes prior `ACTIVE` sessions scoped to
`thesisId` — but a framing session (`open_thesis_framing`) has `thesisId: null` and escapes that
scope entirely. Verified against staging on 2026-08-23: **2 of 2 sessions ACTIVE, both with
`thesisId: null`.** The "one active session" guarantee never covered the sessions that matter most.

**Closing another session requires consent, and leaves a trace.** MCP tools cannot prompt, so
confirmation is a parameter:

| Situation | Behaviour |
|---|---|
| No other active session | Open normally |
| Another session, **same researcher** | Refuse; return the open session's id, name, age. Proceed only with `closeActiveSession: true` |
| Another session, **different researcher** | Refuse; require a **distinct** acknowledgement flag **and a reason**. Closing writes an event **onto the closed session** naming who closed it and why |

That last row is the point: the other researcher returns to a closed session and the record tells
them who closed it, rather than leaving them to guess.

`ResearchSession` currently has **no owner**, so `researcherId` is added. Nullable — the two
sessions open today have none and read as legacy, same pattern as `Evidence.createdById`.

### 2.3 The checks

Reported **individually, pass or fail**, so a refusal names exactly what is missing rather than
returning a bare "not publishable".

| # | Check | Kind | Source |
|---|---|---|---|
| 1 | Head version exists | hard | |
| 2 | Analysis `COMPLETE` on **exactly this text** | hard | the adversary must have spoken on what is being published, not on an ancestor |
| 3 | Analysis parses as a well-formed Devil's Advocate result | hard | present ≠ valid |
| 4 | The narrative cites at least one evidence record | hard | |
| 5 | Every cited record is in the vault, `CONFIRMED`, **and anchored on-chain** | hard | parity with `promote_evidence`; a thesis cannot be public on evidence the vault has not made public |
| 6 | Cited evidence at or above **Tier 2** | hard | Rule 2 |
| 7 | **No sentence naming a key figure without a hedge marker in that same sentence** | hard, deterministic | Rules 1 + 4 |
| 8 | `publicInterestStatement` present and non-trivial | hard, structural | Rule 5 |
| 9 | **The Call for Whistleblowers is live** (head + complete analysis + ≥1 gap) | hard | §2.4 |
| 10 | Argued rationale — **substance** | hard gate; **merit advisory** | Step 7 parity |
| 11 | Official-capacity framing, no character claims | advisory, model | Rule 4 |
| 12 | Gap actionability — names a document and a holder | advisory, model | §2.4 |
| 13 | Framing session attached | advisory | the reasoning that chose this framing is on record |

**Check 6 is currently non-binding** — every record in the vault is `Tier 2: Material`. The check
must SAY that in its output rather than reporting a pass that means nothing. A threshold that looks
strict and blocks nothing is worse than none, because it reads as protection.

**Check 7, in detail.** The hedge vocabulary is already documented in `defamation-risk.md` and must
be taken from there rather than invented: `לכאורה`, `הראיות מצביעות על`, `ייתכן כי`,
`על פי המסמכים`, `המסמכים מצביעים`, `בהתאם לממצאים`, `על פי ראיה`.

Per **sentence**, not per document. "Contains at least one hedge" is trivially satisfied by a text
that hedges once and asserts flatly ten times. Requiring the hedge in the same sentence as the named
figure is deterministic, reproducible, and implements Rule 1 directly.

> **What this check does not do.** It can be satisfied by sprinkling `לכאורה`. It raises the floor;
> it does not establish good faith. That is the same posture as the substance gate — *did you
> argue*, not *are you right* — and it is the only part checkable without a model. Keep the
> deterministic thing deterministic and put Rule 4 judgment in an advisory pass beside it.

### 2.4 Why a live whistleblower call is a *hard* check

The first instinct is to gate on quality — publish only when the thesis is strong. That is
backwards here, and the platform's own design says so: `get_whistleblower_call` is **derived from
`evidenceGaps`**, and its not-live reasons are `NO_HEAD_VERSION`, `ANALYSIS_INCOMPLETE`, `NO_GAPS`.
A thesis with no gaps produces **no public appeal at all**.

So publishing is not the reward for a finished argument. **Publishing is how you ask for the
evidence you do not have.** The bar is therefore **actionability**, not completeness:

> A thesis worth publishing is one that knows what would strengthen it, specifically enough that a
> whistleblower or a FOIA request could deliver it. A moderate thesis with a well-defined ask is
> stronger than a moderate thesis without one, because the ask is a route to becoming strong.

Hard part: the call is live (≥1 gap) — deterministic, reuses the existing derivation.
Advisory part: does each gap name *what document* and *who holds it* — the two things a FOIA request
needs.

**This is safe from gaming by construction:** the Devil's Advocate runs upstream of the gate and
knows nothing about it, so a gate requiring gaps cannot cause gaps to be invented.

### 2.5 The argued rationale

Mirrors the diff debate exactly — **substance is a hard gate, merit is advisory, dissent is
recorded permanently**. Publishing is a strictly larger assertion than promoting one diff and must
not require less justification.

The rationale must state three things:

1. what this thesis claims,
2. what the cited evidence supports,
3. **where it stops** — what is asserted as allegation rather than established fact.

The third is the truth-defence posture under `חוק איסור לשון הרע`, and it is the one a researcher
is most likely to skip.

## 3. Schema

All additive — nullable columns and new enum values. No drops, no constraint changes on existing
data.

```
Thesis
  publishedVersionId       String?  @unique   → ThesisVersion
  publishedAt              DateTime?
  publishedById            String?            → Researcher
  publicInterestStatement  String?            // Rule 5, structural rather than free text

ResearchSession
  researcherId             String?            → Researcher   // nullable; legacy rows null

ResearchSessionEventType  += THESIS_PUBLISHED, THESIS_UNPUBLISHED,
                             PUBLICATION_RATIONALE, PUBLICATION_ASSESSED,
                             SESSION_CLOSED_BY_OTHER
```

`publicInterestStatement` is a **dedicated field, not free text in the body** — deliberately. In
free text it can only be checked by phrase-matching, which is weak; as a field it is structurally
guaranteed and renders consistently on every thesis and call page, which is what Rule 5 asks for.

## 4. Tools

MCP — this is researcher work, not maintenance, so it belongs here rather than in a script:

- `publish_thesis(thesisId, rationale)` — gated. Runs every check, refuses with the full list, or
  pins the version and records the event.
- `unpublish_thesis(thesisId, reason)` — gated. Sets the pin to null, deletes nothing.
- `check_publication_readiness(thesisId)` — gated, **writes nothing**. The same checks, reported
  without publishing, so a researcher can see what is missing before arguing for it.

`get_thesis_context` becomes viewer-dependent: anonymous callers get the published version or an
`UNPUBLISHED` answer; an authorised researcher gets the head **plus whether the public is behind
it**. The same applies to the public thesis page and the call page.

## 5. What already exists

Branch `feat/gf-thesis-publication-gate`, commit `6bed1b3` — **WIP, unratified, red build, do not
land.** Written by a session that was asked to put this question to the researcher and implemented
it instead.

**Keep:** the pinned-version schema shape, the additive migration style, individually-reported
checks, `FRAMING_ATTACHED` as advisory, and the viewer-dependent `get_thesis_context` approach.

**Discard/redo:** the check set (six of the checks above are missing from it), session semantics
(absent entirely), the rationale requirement (absent), `publicInterestStatement` (absent), and the
researcher-context middleware, which needs review rather than adoption.

**Rewrite from `staging` rather than patch it.** There are no tests to preserve — that branch has
none for any of the new code, and 12 pre-existing tests fail on it.

## 6. Build order

1. Schema + migration. `npm run db:check-drift` must say "No difference detected" **before** writing
   the migration, and must report exactly this change afterwards. Edit the schema **by hand** —
   never run `prisma format`, which produces hundreds of lines of unrelated churn (see PR #99, and
   again on 2026-08-23).
2. Session ownership + single-active enforcement + the consent/trace path. Independently useful and
   fixes a live defect.
3. `publicInterestStatement` and the deterministic language check (7, 8) — pure functions, easiest
   to test hard.
4. The publication service: all checks, individually reported.
5. The rationale assessor (10), reusing the diff-debate pattern.
6. The three MCP tools + classification. **Every tool here is gated.**
7. Viewer-dependent reads: `get_thesis_context`, thesis page, call page.
8. Frontend: publish/unpublish control, draft badge, "the public is N versions behind" indicator.

## 7. Tests — the ones that matter

Beyond per-check coverage:

- Publishing pins a version, then **the head moves and nothing public changes**. This is the whole
  design in one test.
- An anonymous caller sees the published version; a researcher sees the head and is told the public
  is behind.
- Each hard check **blocks alone**, and the refusal **names it**.
- Check 7 catches a sentence naming a key figure with no hedge, and passes the same sentence hedged.
- Check 7 is **per sentence**: a document that hedges once and asserts flatly elsewhere fails.
- Check 6 reports that it is non-binding while every record is Tier 2.
- Opening a session refuses while another is active, and the refusal names the owner.
- Closing another researcher's session writes the event **onto the closed session**.
- Unpublish deletes nothing and is reversible.

## 8. Non-goals

- **No second-researcher approval.** Any approved researcher may publish. Revisit if the researcher
  population grows.
- **No gate on thesis strength.** See §2.4 — that would invert the purpose of publishing.
- **No cooling-off period.**
- **The advisory checks never block.** They are recorded with the publication and visible; a
  researcher may publish over them, and the dissent stands on the record. Same reasoning as the
  diff debate: an override that is permitted but permanently visible deters better than a refusal,
  and unlike a refusal it cannot be defeated by rephrasing until the model yields.

## 9. When this ships

Thesis work resumes at Part III of `gf-researcher-playbook.md`: re-run framing round 1 on the clean
corpus (its current recommendation rests on a representation the page never made), then synthesis →
Devil's Advocate → gaps → FOIA → the public call — which now ends at a door that locks.
