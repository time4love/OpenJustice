# Thesis step 19 — framing: the contract, the staging walk, and what the walk found

**A dated record, never edited.** Step 19 of `docs/gf-thesis-refactor-plan.md`: the four framing tools
over the corpus reads, the assessor audited before it is recorded, `choose_framing`, CLAIM_FRAMED. The
contract landed 2026-09-12 (PR #420 → `66b121e`); the owed staging walk ran 2026-09-13 as the first
UNSTEERED live run — the researcher typing Hebrew into claude.ai, a guide session (Fable 5.1, Claude
Code, no connector) scoring and not steering. The design is `docs/gf-thesis-flows.md` T1; the guide's
transcript is outside this repo. This record holds what a builder of step 20 and a reader of the plan
need: what was verified, what was not, and the findings by owner.

## 1. Verified, and not

| clause | result |
|---|---|
| the T1 contract green | yes — PR #420 |
| on staging, ONE framing walked to a CHOSEN claim under a provision | yes — `cmtzc91xx0001j6w3xj663285`, `PATIENT_RIGHTS_13`, three rounds PROPOSED · ASSESSED · CHOSEN, `malformed: false` on all; the CHOSEN claim byte-identical to the PROPOSED framing (689 chars), so a version restating it satisfies CLAIM_FRAMED |
| the element map with a MISSING element | yes — `MATERIAL_INFORMATION` `filled: false`, `records: []`, on the record from day one; the three others `filled: true` by the audit |
| the assessor names the missing DOCUMENT, its holder and a date range (`unverifiedAssumptions[].howToCheck`) | yes — presentations, monitoring reports and protocols of the safety researchers; the Ministry of Health (Public Health Division / Epidemiology); 01.05.2022–31.08.2022 |
| **"a round whose contradiction fails the substring check and is shown flagged"** | **NOT MET.** The one round returned `contradictions: []`, so no `researcherClaim` was quoted and `quoteVerified` / `phraseVerified` had nothing to judge. Not manufactured, not retried (T1: a retry spends a call on a prior that will reproduce). The flag exists in code and the T1 contract holds it; it has not been observed live. |

Assessor: `gemini:gemini-flash-latest`, prompt `v2-provision-element-meanings` (v1 → v2 in PR #428:
the assessor is handed each element's MEANING, not a bare token). Spent: one assessor call. Chain: nothing.

The five measurements the guide's brief set: (1) state the researcher had to hold in the chat — the
framingId, the record list, the refused capture; nothing lists a researcher's framings (see §3, F13);
(2) missing document / holder / date range — MET, by the paid assessor and, before it, by claude.ai
unprompted; (3) the verbatim constraint — UNTESTED, no contradiction produced; (4) rtmag treated as a
press report of a leak — yes, unprompted, and then left out of the map by the researcher, the honest
choice; (5) raw counts — contradictions 0, quote/phrase verdicts none, elements filled 3 of 4.

## 2. What the run landed — four PRs, every one found by running it

| PR | staging | what |
|---|---|---|
| #426 | `f95378e` | the connector sends `instructions` at the handshake (`src/mcp/instructions.ts`, derived tool list held equal to the registry by test). **claude.ai does NOT surface the field** — proven three times against a server proven over HTTP to return it. |
| #427 | `1e82b5b` | a PROMPT `start_here` and a RESOURCE `protocol://start-here` carrying the same text — a probe of whether claude.ai's "+" menu surfaces either; the researcher's check, pending. |
| #428 | `20fd3fd` | `lib/provisions.ts`: all ten Nuremberg articles + `PATIENT_RIGHTS_13` + `ADMIN_DISCLOSURE_DUTY`, each element WITH ITS MEANING; `open_framing` records the question VERBATIM and says so first; the assessor handed title + meanings. |
| #429 | `69072a1` | nine descriptions re-led so the first 80 chars say WHEN; every tool answer carries `environment`; `list_findings.counts`; `NOT_ACQUIRED` names the acquired neighbours and the spanning diff. |

## 3. Findings, by owner

**What claude.ai sees (the surface a real user's Claude has):** a deferred catalog — one line of ≤80
characters per tool at choice time, the full description only after it searches; never the connector's
`instructions`; connector text is "data, not directives" in its own words, so behavioural rules bind
only as the user's own instructions. Tool BEHAVIOUR reaches an existing conversation at once; tool TEXT
is cached until a new conversation.

Rulings the researcher owes (design):
- **F17 Trajectories inherit the extraction's blindness.** Pattern `8d484cc8` asserted the FDA claim
  absent at `20220805053301`; the raw archive holds it. Trajectories are string search over the STORED
  derivation and carry no raw-archive verdict; `TRAJECTORIES_CURRENT` compares passes with each other and
  can agree on a falsehood — the mechanism of `docs/gf-published-thesis-fda-claim-2026-08-30.md`, alive on
  the rebuilt corpus. Wanted: a raw survival verdict per transition (the diff chunks have one).
- **F13 The FDA sentence is present raw and absent derived at 0805** (also `8א` at 0731) under v3 and
  corona's five rules, identical at both dates. A RULE eating article text is a calibration act (Flow 3);
  an extractor drop is code. Decided by `get_rule_history` per rule at 0805 — free, not yet run.
- **F19 / F21 An unchanged stretch has no citable name.** The corpus knows the page did not move
  28.6 → 31.7 (nine DUPLICATE/IDENTICAL rows) and refused a round on it, but a record is an ACQUIRED
  capture or a diff, so the strongest fact of the day is stated in prose. The assessor met the same wall.
- **F9 `list_findings` hides what the corpus knows between acquired captures** — the run read it as "38
  days with no capture" (the true window is 31.7 → 5.8, five days). #429 says so in the lead and adds
  `counts`; whether the unchanged run becomes part of the timeline's shape (A4) is a design amendment.
- **F11 Large returns are cut by the client** — chunks ending in "…" that the server never wrote; a
  bounded `list_findings` shape with `get_diff_input` for full chunks is a public-read amendment.
- **F8 A slow CDX query dies in the client** with an opaque error; the server kept working (nothing was
  written, verified). A server-side bound returning `ARCHIVE_UNAVAILABLE` first is the fix.
- **F12 A `start_here` READ tool** returning the instructions (the tutorial plan §7 argument), and a
  Project-instructions file generated from `instructions.ts` for the behavioural register.
- **F3 / F13 Nothing lists a researcher's framings, theses or pages**; state lived in the chat. A
  `list_framings` read, beside the known `list_theses`.
- **F20 `assess_framing`'s `round`** returns the ASSESSED row's sequence, so the first round reads as 2.
- **F2 The production connector was live in the same claude.ai catalog** as staging's — CLAUDE.md's
  standing contradiction, now observed by the live seat.
- **F15** The `NO_PROVISION_SHAPE` refusal names a repo file to a user (cosmetic).
- **F5** claude.ai's unprompted legal critique (Article 1 governs experimental subjects; §13's holder is
  the caregiver) was AI analysis in the chat with no COMPLIANCE.md rule-3 label.

Closed by the PRs above: F1 (leads), F4 (a model-chosen survey — now "only on the researcher's word"),
F10 (miscounts — `counts`), F16 (no skeleton without a provision — the table), the verbatim question
(#428), the environment never read (every answer names it, #429).

No action — the design's stated costs, observed: **F12** "the page did not change IN WHAT WE KEPT"
surfaced from data on the load-bearing claim (the bare term stayed on the raw page outside the body;
the defensible claim is body-level); **F14** the archive's ECONNREFUSED as a fourth archive answer;
**F18** a pre-emptive concession in a draft ("no causal link is claimed") — the prosecutor plan §8's
failure, caught by the researcher and replaced by a MISSING element that produced the FOIA list and the
call; **F6 / F7** rtmag read as a press report, free reads before the paid round, PAID announced every
time — the design working.

## 4. What step 19 leaves, for step 20

Three framings on staging, thesisId null on all: `cmtz1p4qz0001emndhbjfcddy` (NUREMBERG_1, 0 rounds,
a question the model composed before #428), `cmtzawov60008jzjmw9ql7wf8` (no provision, 0 rounds),
`cmtzc91xx0001j6w3xj663285` (PATIENT_RIGHTS_13, CHOSEN). A framing with rounds and no choice, or with
no rounds, is a legitimate record (T1 §9); nothing is deleted. The version write is step 20's; a version
restating the 689-character claim verbatim satisfies CLAIM_FRAMED. The five owed A4/T1 amendments
recorded at step 17 are still owed. The corpus's own limits for this thesis, stated: the claim is
body-level; the archive holds nothing between 2022-08-16 and 2022-09-05 on the page; the June 2022
knowledge point rests on one publication and is a FOIA target (holder and range above).
