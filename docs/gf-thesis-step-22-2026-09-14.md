# Thesis step 22 on staging — the critic, the gaps and the request, exercised through the connector (2026-09-14)

**What this records.** Thesis step 22 landed on 2026-09-14 as PR #444 (`staging` `866e57d`): `run_analysis`,
`decide_gap`, `draft_foia_request` and `get_whistleblower_call` (thesis flows T4 :565–:704, A4 :1481–:1504), the
predicates FINGERPRINT · CURRENT_ANALYSIS · GAPS_DECIDED · THE_CALL · THE_REQUESTS, the identity `gapId`, the critic and
the drafter as model actors, the MCP surface 34 → 38, no migration. The same afternoon the researcher ran the step on
staging through the claude.ai connector, UNSTEERED — they typed, the REVIEW seat predicted each step on record before it
ran and scored it after from what the session returned. Twelve predictions: ten held, one held with a miss, one missed.
Two model calls were spent, both on the default provider (Gemini flash). The step's contract is `test/thesis/analysis.test.ts`
and its neighbours (thesis 387 = 277 / 110, every red naming step 23 or 24); the review log with every decoy is
`handoffs/R48-review-state.md`, outside this repository.

The thesis is the one step 20's exercise created: `cmu0yyflb00028861pp46alwq` under `PATIENT_RIGHTS_13`, head
`cmu10rkop00088861e6zgcf4b` (its second version), two EVIDENCE citations of the corona page's diffs, nothing published.

## 1. Verified, and not

**Verified by the run — each a prediction written before the step and matched to the return:**

| claim | how it was seen |
|---|---|
| the environment is identified by configuration, never by name | a fresh conversation chose the PRODUCTION connector first (again — step 20's F1); refused; `get_environment` on staging: chain 84532, registry `0xDA3B…4C73`, project `elws…ae`, CONFIRMED |
| the analysis arm and the refusal share ONE fingerprint loader | `get_thesis_context` at NONE already showed `0xf2d59c8a…41392c83`; `run_analysis` returned the same bytes as `inputFingerprint` |
| the critic's output is audited before it is stored | both counter-arguments came back with `quoteVerified: true` and a PRESENT verdict against `[1]`; the grade MODERATE with `by: "the critic"`; the session presented it as the critic's opinion |
| a suggested gap is a candidate, not a gap | `onTheList: null` on both suggestions; the gap list stayed empty until `decide_gap` |
| a gap's identity is its words | both gaps entered under exactly the id the critic had computed; the session, told to use the critic's words, ignored a typo in the researcher's prompt and said why |
| the gap list is part of the input | after two decisions the analysis read STALE with a moved fingerprint; after the third it moved again |
| `expectedSequence` is a real compare-and-set | a deliberate `0` against a log at 1 refused STALE_SEQUENCE "is at sequence 1 and this call expected 0 … Nothing was written"; the same call with 1 wrote sequence 2 |
| a refusal is not an event | the history went 6 → 7 → 9 → 10 across the writes and did not move on the refusal |
| the drafter writes nothing and the addresses are the platform's | six keys returned, the letter in the statutory form with `{{REQUESTER_NAME}}` and `{{DATE}}` kept, authority `משרד הבריאות` → the code table's two rows, `restsOn` both cited records, `unresolvedLabels` empty; no history row |
| the public call reveals nothing to an anonymous caller | by JSON-RPC with no token: the real draft thesis and a made-up id both answered `{"live":false}` |

**Not verified by the run (the suite holds them; the run did not reach them):** CITED and NOT_CITED (a CITED
decision on this thesis would state something the corpus does not answer); CONCEDED, DISMISSED and CALLED; a second
critic run against the changed list (ANALYSIS_CURRENT was not provoked — it would have spent a call to see it
refuse); AWAITING_DERIVATION on either paid tool (every cited record had current content); `THESIS_CRITIC_PROVIDER` /
`THESIS_FOIA_PROVIDER` set to anything (the default drew both).

## 2. The run, step by step

| step | act | predicted | returned | score |
|---|---|---|---|---|
| 0 | `get_environment` | production first, then staging CONFIRMED | as predicted | held |
| 1 | `list_theses`, `get_thesis_context` | one draft; head `cmu10rkop…`; two unargued citations; analysis NONE; gaps empty; six history rows | as predicted, plus the fingerprint shown at NONE | held |
| 2 | `run_analysis` (paid) | no refusal; one draw; the fingerprint equal; audited counter-arguments; suggested gaps with ids; one gap about the 31.7 narrowing or the June-2022 findings | `cmu193osd0001d5tt4ffyyept`; two counter-arguments (the safety section for toddlers was added; §13 binds the caregiver, not a website); two gaps — the editorial decision record, the parallel channels | held, one sub-prediction missed |
| 3 | `get_thesis_context` | CURRENT; history 7 with an ANALYSIS row | as predicted; model `gemini:gemini-flash-latest`; the ANALYSIS row with `researcherId: null` | held |
| 4 | `decide_gap` OPEN, the parallel-channels gap | enters under the critic's id | the session sent the id ALONE → NO_SUCH_GAP "give its description to enter it"; it asked the researcher to approve the words; accepted verbatim → `{ 0x0169f435…, OPEN, 1 }` | missed, then held |
| 5 | `decide_gap` OPEN, the editorial-record gap | `{ 0xd4c4e83a…, OPEN, 1 }` | as predicted | held |
| 6 | `get_thesis_context` | STALE; two OPEN gaps in entry order; history 9 | as predicted; each decision bound to the head's `versionId` | held |
| 7 | `draft_foia_request` (paid) | six keys; placeholders kept; addresses from the table; nothing written | as predicted; the letter carries the head's dates and the claim's 31.7 parenthetical | held |
| 8a | `decide_gap` REQUESTED with `expectedSequence 0`, on purpose | STALE_SEQUENCE naming 1 and 0; nothing written | word for word | held |
| 8b | the same with 1 | `{ REQUESTED, 2 }` | as predicted | held |
| 9 | `get_thesis_context` | REQUESTED@2 with the five-key request; STALE again; history 10 | as predicted; the refused attempt left no row | held |
| 10 | `get_whistleblower_call`, anonymous (the REVIEW seat, JSON-RPC, no token) | `{ live: false }`, the same bytes as a missing id | identical | held |

What staging holds after the run: analysis `cmu193osd…` on the head; decisions `cmu19b35i…` (OPEN, the parallel
channels), `cmu19cco9…` (OPEN → superseded), `cmu19t07e…` (REQUESTED, the editorial record, with the letter); both
citations still unargued; nothing published.

## 3. Findings, by owner

**What claude.ai did with the surface alone.** It drove every tool in the flow's order from the tool text and the
returns, presented the critic's opinion as the critic's and the grade as advisory, stated the sequence rule back after
every decision ("the next decision on this gap needs `expectedSequence 2`") so the researcher never had to know a
number, and — when refused NO_SUCH_GAP for a gap sent by id alone — read the message, stopped, and asked whose words
should enter the list, which is T4 :622's own rule. Where it stumbled, the refusal's wording carried it.

**Findings on the surface and the run:**

- **Live-1 — the assistant's own opinion, unmarked.** Before the critic ran the session volunteered a three-point
  critique of the claim against the text (the 5.9/5.8 window; the 31.7 narrowing unsupported in the text; the June-2022
  safety findings absent); after the critic ran it ranked the critic's gaps by danger. Both are the assistant's
  opinion and neither was marked as such, which the SPEAKING paragraph asks. The critic raised none of the three
  points, so the two opinions did not overlap. Owner: the instructions (one clause) — and the record notes that the
  assistant's reading was not worse than the critic's.
- **Live-2 — `run_analysis` is to be renamed, and not alone.** "Analysis" is the row's name, not the act's; the design
  says "the critic" (T4 :578, :581). The researcher's ruling, 2026-09-14: **tool naming gets a dedicated session over
  the whole surface**, with one criterion — a name must help Claude know which tool it may use at that point of a
  workflow sequence; `list_findings` (step 20's F3) and `run_analysis` are the two named so far, and none is renamed
  piecemeal. Owner: the researcher, its own session.
- **Live-3 — the critic cuts a quote at a quote mark.** Its second quote stops at the gershayim of `התשנ"ו`;
  `quoteVerified` is a substring check, so a truncated quote passes. Not a platform defect; a property of the audit to
  know: `quoteVerified: true` means "these words are in the text", not "this is a whole sentence". Owner: the record.
- **Live-4 — the suggested gaps are returned twice** (inside `opinion`, with the audit's `gapIdReason` and `onTheList`,
  and at the top level with A4 :1483's four keys). By A4; redundant. Owner: the naming session may fold it (LOW).
- **Live-5 — a paid act with no author.** The history's ANALYSIS row carries `researcherId: null`, because A2 :1313–:1318
  gives `ThesisAnalysis` no researcher column: the history cannot say who spent the critic call. **The researcher's
  ruling, 2026-09-14: a paid act always records who spent it.** A2 is amended in place with this record; the column is a
  migration, the first since step 18, scheduled with step 23 (§4).
- **Live-6 — the id alone is the assistant's first call.** `run_analysis` returns a `gapId` for every suggestion and the
  `decide_gap` schema names it as "the id run_analysis gave it", so the assistant's first instinct is to decide by the
  id alone even with the description in hand; the review's M1 message ("give its description to enter it") recovered
  it in one step. No fix owed; the naming session should know it.
- **Live-7 — the request carries the thesis's dates, and the claim's.** The letter states the head text's restoration
  window (5.8 → 6.9) and the claim's 31.7 parenthetical, because the drafter is handed both by design (T4 :666–:668).
  The content mismatch between claim and text that the session raised at step 1 now sits in a public-facing draft — the
  researcher's to edit before REQUESTED, which is the design's own sequence (amend, then approve). Owner: the
  researcher, on this thesis.
- **Live-8 — the placeholders read as a defect.** The session presented `{{DATE}}` and `{{REQUESTER_NAME}}` as
  "not ready to send until filled". By design they stay: the public sends the request under its own name (T4 :677–:679).
  Owner: the instructions (one clause, with Live-1's).

**Rulings the researcher owes, carried:** step 17's record §9 item 1 — whether a CALLED `decide_gap` is a paid call once
NAMES_PERSON is checked by T5's rule (step 23's); the naming session's date.

**What the run did not reach:** §1's list. **What the run cost:** two model calls.

## 4. What step 22 leaves

- **The twelfth A4 amendment, applied with this record:** `draft_foia_request` returns `unresolvedLabels` beside the
  five keys (A4 :1498, in place).
- **The thirteenth, applied in PR #444:** AWAITING_DERIVATION on `draft_foia_request` (A4 :1499, T4 :665).
- **A2 amended with this record:** `ThesisAnalysis · researcherId` — the column and its migration are owed to step 23
  (plan step 23 amended), and the history's ANALYSIS row then reads its author.
- **Two clauses in the connector instructions, applied with this record:** the analysis arm's fourth state
  (AWAITING_DERIVATION) and the placeholders that stay.
- **The naming session** (Live-2), the researcher's to schedule; until then the names stand.
- **On this thesis:** the claim/text mismatches the session found (Live-1, Live-7) are the researcher's to resolve in a
  third version before anything publishes; both citations are still unargued (step 21's flow, built, unused here).
- **Not built at 22, by the contract:** NAMES_PERSON on `decide_gap` (owed to 23); the gate, publication, the public
  reads (23); `list_thesis_reviews` (24).
