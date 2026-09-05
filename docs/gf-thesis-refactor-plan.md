# Refactoring the thesis layer — 2026-09-03

**Third of three, in implementation order.** `docs/gf-refactor-plan.md` §3 is the CORPUS (steps
0–10) and §3b is EVIDENCE (steps 11–16); this plan is the THESIS, steps 17–26, and it begins where
step 16 ends. **Next after this:** `docs/gf-document-refactor-plan.md` — the DOCUMENT class, steps 27–37,
building to `docs/gf-document-flows.md`; nothing here waits for it, and four arms of this plan's
steps are the document plan's — steps 17, 20, 23 and 24 say which. The target is `docs/gf-thesis-flows.md`, whose appendix is the contract every step
builds to; the reasoning is `docs/gf-architecture-target.md` §10; the test rules are the refactor
plan's §4, unchanged, and every rule there binds here.

---

## 1. THE STRATEGY — BESIDE, NOT THROUGH, AND CHEAPER THAN THE WALK'S

The same discipline as the corpus refactor: the new tools, models and reads are built beside the
old ones, nothing new imports a retired module, the legacy suite guards the old path until one
step switches, and that step deletes the old path and its tests in the same commit. Two things
make it cheaper here. **The data story is empty**: every thesis row goes with the rebuilt database
(thesis flows §11), the one thesis is rewritten by the researcher under the design, and no
migration of a session, a figure, a TipTap body or a gap index is ever written. **And the layer
feeds nothing beneath it**: a wrong thesis tool produces a wrong thesis, not a corpus with holes,
so the switch is one reviewable diff that risks a researcher's workflow and nothing else — which
is still the researcher's word.

What does not get cheaper is the suite. Twenty-three test files, ~8,800 lines, assert the session,
the figure, TipTap, the revision agents and a seventeen-check gate of a different shape; §5 tags
every one, and a RETIRE file still present after step 25 is a defect in step 25.

## 2. THE TRANSLATION TABLE — OLD TO NEW, ONE ROW EACH

| old | new | where ruled |
|---|---|---|
| `ResearchSession`, its events, its lock | nothing — `Framing` + rounds, `Note`, HISTORY derived, `NOT_AUTHOR`, `STALE_HEAD` | flows §9 |
| `open_thesis_framing` / `assess_thesis_framing` / `get_thesis_framing` over evidence summaries | `open_framing` / `assess_framing` / `choose_framing` / `get_framing` over computed content, with the audit | T1 |
| `create_thesis_draft` (Markdown → TipTap, framing derived) | `create_thesis` (text with tokens, framing named) | T2 |
| `add_thesis_version` + `cite_trajectories` + `POST /:id/version` | `add_thesis_version`, the one writer, compare-and-set | T2 |
| `ThesisMention { type, refId }` × 4 kinds | `{ kind EVIDENCE|TRAJECTORY, name, contentVersionHash, debateSessionId }` | T2, A2 |
| `KeyFigure`, `KEY_FIGURE`, `get_figure_dossier`, `/figures`, `FIGURES_HEDGED`, `OFFICIAL_CAPACITY` | nothing; `NAMES_NO_PERSON` | T2, T5 |
| `run_ai_analysis` writing `aiAnalysis` on the version | `run_analysis` appending `ThesisAnalysis` with a fingerprint | T4 |
| `ThesisGapResolution` by index; `get_research_agenda` | `ThesisGapDecision` by gap id; the gap list on the thesis read | T4 |
| `generate_foia_request` (text, nothing recorded) | `draft_foia_request` + `decide_gap REQUESTED`; the request public with the thesis | T4 |
| `get_whistleblower_call` from every critic gap; `CALL_LIVE` | derived from CALLED gaps; no gate | T4, T5 |
| 17 checks, two kinds, one non-binding | 17 checks over A3's predicates, none non-binding | T5, A6 |
| `publish_thesis` closing the session | `publish_thesis` writing a `PublicationAttempt` | T5 |
| `unpublish_thesis` by any researcher, 404 after | the author's, a `Withdrawal`, a notice | T6 |
| — | `list_theses`, `list_thesis_reviews`, `add_note` | A4 |
| `RevisionAgent`, `GapRevisionAgent`, `ThesisValidatorAgent`, `suggest_thesis` | nothing | §2, prosecutor plan §11.1 |
| every research-act route under `/api/thesis` and `/mentions` | nothing; three public reads | A5 |

## 3. THE STEPS — EACH LEAVES THE OLD PATH WORKING; THE TWENTY-FIFTH SWITCHES

### 17 · The acceptance suite, failing

A jest project `thesis`, like `walk`: A3's derivations as pure functions over fixtures — CLAIM_FRAMED,
FINGERPRINT, GAP_IN_FORCE, GAPS_DECIDED, UNARGUED, PUBLISHABLE(v), PUBLIC_PAGE as amended; A4's
tools with every refusal; seventeen of A6's nineteen checks by id and kind — 18 and 19 are the
document plan's; A7's scans with decoys —
`thesis-no-log`, `versions-immutable`, `models-write-no-state`, `one-symbol`, `names-vacuity`,
`gap-id-stable`; the nine invariants of target §10.5. Every file red. Informational in CI until
step 25.

*Leaves working:* everything.

### 18 · Schema, on the target schema

After the rebuild, so nothing is migrated: `Framing`, `FramingRound`, `ThesisAnalysis`,
`ThesisGapDecision`, `PublicationAttempt`, `Withdrawal`, `Note`; `Thesis.provision`,
`ThesisVersion.text` and `.claim`, the mention's `kind`, `name`, `contentVersionHash`,
`debateSessionId` beside the old columns; the `PROVISION` table and `NORMALISE` as one importable
symbol each. The old tables and columns stay until step 25.

*Verified by:* `db:check-drift` clean before writing; the migration read; deploys itself.

### 19 · Framing

The four framing tools over the corpus reads — computed content per record, trajectories, the
provision's elements — with the assessor's output audited before it is recorded (`quoteVerified`,
`phraseVerified` by the one verdict rule, `filled` by ACQUIRED); `choose_framing`; CLAIM_FRAMED.

*Verified by:* the T1 contract green; on staging, one framing walked against the MOH page with a
round whose contradiction fails the substring check and is shown flagged.

### 20 · The version write

`create_thesis` and `add_thesis_version`: the token parser, the pin computed from `affirmed` or
CURRENT, the argument carried forward, `STALE_HEAD`, `STALE_PIN`; `get_thesis_context` with
HISTORY, UNARGUED and the gap list; `list_theses`; `add_note`.
The `#doc_` kind of the amended T2 is added by `docs/gf-document-refactor-plan.md` step 33: it
resolves against a table that plan creates — amended 2026-09-05 (document refactor plan).

*Verified by:* the T2 contract; two writes against one head, the second refused; `affirmed` moved
between two writes, the second refused; `versions-immutable` green.

### 21 · The argument's thesis side

After evidence step 13: the citing paragraph handed to the assessor by `open_debate`,
`debateSessionId` written on the head's mention by `promote_from_debate`, `STALE_PIN` at promotion.

*Verified by:* the T3 contract; `EVIDENCE_ARGUED` proven to fail on a re-pinned mention until it is
argued again.

### 22 · Analysis and gaps

`run_analysis` with FINGERPRINT and the audit, appending `ThesisAnalysis`; `decide_gap` with the
six decisions and `STALE_SEQUENCE`; `draft_foia_request`; `get_whistleblower_call` derived from
CALLED gaps, public, no model.
FINDINGS 77 and 78 of the staging critique runs — absence rendered as a duration, a trajectory label that can be quoted — are the critic prompt's own change here, measured by its verdict rates (thesis flows §13) — amended 2026-09-04 (pre-design triage, docs/gf-pre-design-plans-triage-2026-09-04.md).

*Verified by:* the T4 contract; `gap-id-stable`; a second `run_analysis` on the same input refused
`ANALYSIS_CURRENT` — no call spent twice.

### 23 · The gate, publication, the public reads

The seventeen checks of A6 calling A3's predicates, `NAMES_NO_PERSON` with its examined count;
`publish_thesis` writing a `PublicationAttempt`, refused or not; `unpublish_thesis` writing a
`Withdrawal`; the three public routes of A5 serving text and resolved mentions, never TipTap and
never model prose; PUBLIC_PAGE amended in evidence's predicate module.
Checks 18 and 19 of the amended A6, and `CITES_EVIDENCE`'s document arm, are added by
`docs/gf-document-refactor-plan.md` step 34: they read tables that plan creates — amended
2026-09-05 (document refactor plan).

*Verified by:* the T5 contract; `names-vacuity`; the shape test that no analysis, assessment or
objection field reaches `GET /api/thesis/:id`; a withdrawn thesis answers a notice, a never-published
one 404.

### 24 · After publication

`list_thesis_reviews` — FLAGGED, STALE_TRAJECTORY, UNARGUED; `audit-theses` as A7 specifies, with
the exit that proves the gate held. The ARRIVED arm, in the shape `docs/gf-document-flows.md` §5
gives it, is added by `docs/gf-document-refactor-plan.md` step 32: it reads the Arrival table that
plan creates — amended 2026-09-05 (document refactor plan).

*Verified by:* on staging, a re-walk moving one cited record's content; the author's list shows it;
`audit-theses` exits 2 before the new version and 0 after.

### 25 · THE THESIS SWITCH — the researcher's word

One commit: the retired tools of A4 unregistered and `mcpToolClassification`'s expected set moved;
the retired routes of A5 removed; `ResearchSession`, its events, `KeyFigure`, `ThesisGapResolution`,
`userContent`, `aiAnalysis`, `status`, `title` and the old mention columns removed from the schema —
a migration read before commit, on a database that holds nothing they describe; `RevisionAgent`,
`GapRevisionAgent`, `ThesisValidatorAgent`, `tipTapUtils`, `thesisCitationSplice`, `mentionRoutes`,
`figuresRoutes`, `researchSessions` deleted with their RETIRE tests; the `thesis` jest project
joins the required run; the retired-names scan extended; the tutorial's COMMON_RULES re-read
against A4; the frontend handed the page contract of T5 in its own change, landed FIRST, since the
public page reads TipTap today and would break at this commit otherwise.
`chatRoutes` and `argumentRoutes` are removed in the same commit: public routes that run a model are research acts the browser performs, the class thesis flows §10.6 retired — amended 2026-09-04 (pre-design triage, docs/gf-pre-design-plans-triage-2026-09-04.md).

*Verified by:* every KEEP file unchanged since step 17; every RETIRE file gone; `npm test` green
with `thesis` in it; `get_environment`'s counts no longer name a removed table.

### 26 · The one thesis, rewritten

The researcher's act, not a step's: on staging, the day of `docs/gf-researcher-day.md` walked end
to end under the new tools — framing under a provision, the version, the arguments, the analysis,
the gaps decided, publication — with the transcript in a dated doc. Then production, at SHIP.

*Verified by:* `audit-theses` observed to fail on a deliberately broken fixture before it goes green
on the rewritten thesis; the acceptance test of the prosecutor plan §8 re-read against the new
thesis's gap list.

## 4. THE TEST RULES

The refactor plan's §4, every rule, no exception. What the source scans hold here, from step 17: no
new file imports `researchSessions`, `tipTapUtils`, `thesisCitationSplice`, `parseMentions` (the
TipTap walker), `RevisionAgent`, `GapRevisionAgent`, `upsertKeyFigures` or `mentionRoutes`; after
step 25 no file under `src` names a session, a key figure, `userContent`, `aiAnalysis`,
`gapIndex` or any retired tool; `thesisVersion.create` has one caller and `thesisVersion.update`
none; `normaliseClaim` has one spelling. Each scan carries a decoy.

## 5. THE TEST INVENTORY — WHAT EACH FILE ASSERTS, AND WHAT BECOMES OF IT

Tags as the as-built doc's §8: **KEEP** untouched and green throughout; **REWRITE** to the
appendix in the step that changes the shape, as a new file beside the old; **RETIRE** deleted
with its code at step 25, never weakened.

| test file | lines | tag | what it holds |
|---|---|---|---|
| `thesisClaimAudit` | 464 | KEEP | the archive audit of quotes, dates, intervals; unchanged (T5) |
| `evidenceInputSoundness` | — | KEEP | check 17; evidence A6's |
| `mcpToolClassification` | 157 | KEEP | the assertions stay; the expected set moves at step 25 |
| `publicationLanguage` | 207 | KEEP one group, RETIRE one | the public-interest statement check stays; `HEDGE_MARKERS` and per-sentence hedging go with the figure |
| `trajectoryCitation` | 358 | KEEP, one group REWRITE | currency states stay; the mention kind is `TRAJECTORY` and the token `#tr_` (step 20) |
| `thesisFraming` | 499 | REWRITE | step 19: rounds on a `Framing`, computed content, the audit, `choose_framing`; the session and `NO_EVIDENCE` go |
| `thesisPublication` | 889 | REWRITE | step 23: seventeen checks over predicates; the tier, the call, the figures, the session-closing go |
| `thesisRoutes` | 714 | REWRITE one group, RETIRE the rest | the public reads survive to A5's shape; every research-act route goes |
| `getThesisContext` | 350 | REWRITE | step 20: HISTORY, UNARGUED, the gap list |
| `DevilsAdvocateAgent` | 360 | REWRITE | step 22: computed content in, verdicts beside every assertion out |
| `thesisAnalysisCitations` | 323 | REWRITE | step 22: FINGERPRINT and `ThesisAnalysis` rows |
| `thesisProvenance` | 324 | REWRITE | step 19/23: framing rounds and publication attempts are their own rows, read by `get_framing` and the history |
| `getWhistleblowerCall` | 218 | REWRITE | step 22: derived from CALLED gaps; `live` semantics |
| `parseMentions` | 191 | REWRITE | step 20: tokens from text, two kinds |
| `mcpTools` | 1941 | REWRITE per tool, RETIRE per retired tool | one group per tool; tagged group by group at step 17, not as a file |
| `researchSessions` | 322 | RETIRE | there is no session |
| `keyFigures` | 130 | RETIRE | there is no figure |
| `mentionRoutes` | 267 | RETIRE | there is no editor |
| `tipTapUtils` | 223 | RETIRE | the body is text |
| `thesisCitationSplice` | 175 | RETIRE | `cite_trajectories` is retired |
| `RevisionAgent` · `GapRevisionAgent` | 161 · 138 | RETIRE | the ratchet |
| `ThesisValidatorAgent` | 245 | RETIRE | no caller today |
| `thesisAssertions` | 132 | READ AT STEP 17 | tagged when the acceptance suite is written, by what it asserts |

## 6. VERIFICATION — WHAT "VERIFIED" MEANS AT EACH STEP

As the refactor plan's §6: a step is verified by its contract file green, its scan's decoy
caught, and — for steps 19, 24 and 26 — a staging exercise with a transcript in a dated doc. The
instruments of A7 land with the step that gives them a subject and are each observed to fail
first. The integrity board's `thesis-cites-verified` entry gains its command at step 24 and reads
its computed proof from then on.

## 7. DEFINITION OF DONE

- the `thesis` acceptance suite is green, every file, and in the required run;
- every RETIRE file is gone and every KEEP file unchanged since step 17;
- the retired-names scan, `thesis-no-log`, `versions-immutable`, `models-write-no-state` and
  `one-symbol` are green with their decoys;
- the MCP surface is exactly A4's, and `mcpToolClassification` agrees;
- the schema holds none of A2's REMOVED list;
- the one thesis has been rewritten on staging under the new tools, transcript in a dated doc,
  and `audit-theses` has been observed to fail before going green there;
- the public page serves text, resolved citations, the appeals and the notice, and no model prose,
  by a shape test;
- the frontend's change landed before step 25, and the page rendered a published thesis after it.

## 8. HAZARDS, NAMED

- **The frontend reads TipTap.** `GET /api/thesis/:id` serves `userContent` today; step 25 changes
  the read's shape and the page breaks unless the frontend's change lands first. Ordered above.
- **`get_environment` counts tables.** Its eleven counts may name a table step 25 removes; the tool
  that must answer before anything else would then throw. Checked at step 25.
- **`NAMES_NO_PERSON` is an enumeration under a property.** Its recall is measured (flows §13);
  until measured, a passing version is passed by a model, and the check says so.
- **`normaliseClaim` has three spellings today.** `one-symbol` fails on the first run, by design.
- **The tutorial teaches the old tools.** `start_tutorial`'s COMMON_RULES name them; re-read at
  step 25 or the tutorial teaches a surface that does not exist.
- **Step 21 depends on evidence step 13.** The passage and `STALE_PIN` need `open_debate`'s new
  shape; the order across the two plans is corpus → evidence → thesis, and this is where it bites.
