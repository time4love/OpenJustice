# Thesis step 20 on staging — the version write, exercised through the connector (2026-09-14)

**What this records.** Thesis step 20 landed on 2026-09-14 as PR #440 (`staging` `5280f54`): the five tools
`create_thesis`, `add_thesis_version`, `get_thesis_context`, `list_theses`, `add_note`; the version write as one
transaction; the pin computed by the platform; `STALE_HEAD` and `STALE_PIN`. Its contract turned green in the
acceptance suite (thesis 383 = 197 / 186, every red "not built" for steps 22–24). What the suite cannot see is a
researcher using it, so the step owed a staging exercise: the first thesis on staging, written through claude.ai and
the staging connector, **UNSTEERED** — the researcher typed, the REVIEW seat of R48 predicted each step on record
before it ran and scored it from what the session showed, and read the database afterwards through its own
staging connector to confirm each write. This is that exercise, its findings by owner, and the two tools it made
the platform build before it could take its first step.

The run happened on 2026-09-14 between 07:00 and 09:00 UTC, on `staging` `70465b3` after the two tools of §2
landed. Every prediction held. Three refusals were observed, each writing nothing; three writes were observed,
each verified by data.

## 1. Verified, and not

The T2 contract, as the researcher met it:

| clause | observed | how it was verified |
|---|---|---|
| a thesis is created from a framing's CHOSEN claim, restated character for character | `create_thesis` with ONE character changed (position 6, `31.7` → `30.7`, of 689) refused **CLAIM_MISMATCH**, naming the framing and the two ways forward; the same call with the claim verbatim created the thesis | the session's claim compared to the CHOSEN claim by byte before each call; `get_framing` after the refusal showed `thesisId: null` and three rounds |
| the framing is attached in the same transaction | `get_framing` after the create: `thesisId: cmu0yyflb00028861pp46alwq` | by data |
| the pin is computed by the platform, never supplied | the first mention's pin `2d32218b…21640c` equals the 28.6→5.8 diff's CURRENT `contentVersionHash` as `list_findings` returned it that morning; the second version's new mention pinned `b005b1d4…bdf6a78e`, the 5.8→6.9 diff's; the first mention's pin unchanged between the two writes | the two hashes read from `list_findings` by the REVIEW seat before the writes |
| an unargued citation is legal in a draft and comes back in `unargued` | both versions returned every citation with `argued: false` and in `unargued`; the session read it as "the work-list for the argument", not a fault | the return, as the session reported it |
| a write against a head that moved is refused, naming the current head | the third version sent deliberately with the FIRST version's id as `expectedHeadVersionId` refused **STALE_HEAD**, naming `cmu10rkop…` against `cmu0yyg9o…`; no third version, the head unmoved | the session's paste; the state read back |
| HISTORY is derived, never logged | `get_thesis_context` listed five rows — the framing, its three rounds, the version — and the refused attempt was ABSENT; the session said so unprompted: "a refusal writes nothing, and the history is derived from state, not a call log" | the return |
| a draft does not exist to the public | an unauthenticated `tools/call list_theses` over HTTP answered `[]` (HTTP 200); the read refused nothing | the REVIEW seat's own call |
| the analysis arm before step 22 | `analysis.state: NONE`, read by the session as "no analysis has run yet" | the return |
| **STALE_PIN** — `affirmed` moved between a write's two reads | **NOT EXERCISED**: no record on staging is promoted, so nothing can be re-affirmed. Held by the unit race `test/thesisVersionWrite.test.ts` and the acceptance suite's `pin-equals-affirmed`; observable live only after a debate promotes a record (thesis step 21's flow, built at evidence 13) | — |
| `add_note` | NOT EXERCISED in this run | — |

What was written on staging, all by the researcher: thesis `cmu0yyflb00028861pp46alwq` under `PATIENT_RIGHTS_13`,
attached to framing `cmtzc91xx0001j6w3xj663285`; version `cmu0yyg9o000488618pr3m66s` (three paragraphs, one citation);
version `cmu10rkop00088861e6zgcf4b` (the head, one sentence added, two citations). Nothing else moved: no evidence row,
no debate, no gap decision, no note. The chain was not touched — no thesis tool reaches it.

## 2. What the run landed before it could start — two reads, PR #441

The exercise stopped on its **first step**. The plan said "read the framing", and a session driven by the MCP tools
alone had no way to find a framing: nothing listed them, and an id remembered from a previous chat is not a tool.
The step-19 record's F3 had named exactly this — *nothing lists a researcher's framings, theses or pages; state lived
in the chat* — and `list_theses` had closed one third of it at step 20. The researcher ruled: drive the session by
the tools; where a tool is missing, create it.

Two GATED reads were built by the REVIEW seat (seat crossed, DEV reading cold), landed as PR #441 (`staging`
`70465b3`, deploy SUCCESS, `tools/list` 32 → 34, `db:check-drift` clean), and the exercise resumed through them:

- **`list_framings`** — every framing, oldest first: question, provision, the author's handle, the thesis it is attached
  to or null, when it was opened, round count and latest round, and the latest CHOSEN round's claim **verbatim** — one
  read gives a session the bytes `create_thesis` must restate. No identity asked, refuses nothing.
- **`list_pages`** — every surveyed page by its exact URL, when it was surveyed, and its work-list rows counted per
  outcome, the walk's seven each present at zero. Gated on the walk reads' ground: the set of surveyed pages is a
  researcher's working state until a thesis publishes.

Both are design amendments — thesis A4 and interaction A5 name neither — and are owed to the appendices with the
amendments of §4. Ten decoys planted by REVIEW each reddened the case it targets; both modules stubbed out reddened
every case by name (`handoffs/R48-review-state.md`).

## 3. Findings, by owner

**What claude.ai did with the surface alone** — the goal the step-19 record set (how well claude.ai guides a
researcher from the MCP surface, with no design document in its head):

- It found the framing from `list_framings`, the page from `list_pages`, the record names from `list_findings`, and
  the thesis id from its own `create_thesis` return — no id was typed by the researcher at any step.
- It showed every draft and waited for the word before every write; it never retried a refusal on its own.
- It predicted both refusals before sending them, from the tool descriptions, and explained each in the design's own
  terms afterwards: a refusal on CONTENT (a claim that passed no rounds) and a refusal on STATE (a good text written
  against a head that moved), and that "the platform had everything it needed to help, and rightly did not".
- It matched both computed pins to the `contentVersionHash` values `list_findings` had shown, unprompted.
- It read DUPLICATE and IDENTICAL rows correctly as captures the corpus holds on `list_captures` rather than gaps in
  the archive, and pointed at `verify_claim_text` against the raw 31.7 document for the narrower window the claim
  states — the assessor's own unverified assumption of step 19, reached from the timeline.
- It cautioned, unprompted, that a word strengthening the legal conclusion should wait until the cited records are
  promoted.

**Rulings the researcher owes (design), each a UX finding:**

- **F1 — The production connector is chosen first by a fresh conversation.** With both connectors in the catalog, the
  new conversation loaded tools from `gf-production` and proposed to run there; only the researcher's refusal and an
  explicit instruction moved it to staging. The step-19 record's F2, observed a second time. The connector's own
  `get_environment` then answered correctly. Whether the production connector stays in the same catalog as staging's
  is the researcher's — it contradicts `CLAUDE.md`'s standing rule already.
- **F2 — Two reads were missing** — closed by §2. The third of the step-19 F3 trio.
- **F3 — `list_findings` is a generic name for the page's timeline** (the researcher's, during the run). The name is
  evidence A4 :1080's and §4 :324's ("the triage list IS the page's public timeline"), the repaired successor of two
  retired tools. A rename (e.g. `get_page_timeline`) is an evidence A4 amendment plus a retired name for the
  retired-names scan, across 19 source and test files and 67 occurrences with the docs — its own PR, after this record.
- **F4 — A session told to carry a claim verbatim paraphrases it when it reports** (step 1: "the chosen claim adds
  that…"). It copied exactly when it had to (steps 4 and 5). `list_framings` carrying the claim verbatim is what makes
  the copy a read rather than a memory.
- **F5 — After a write the session narrated the return with truncated hashes** rather than showing it as it came,
  which its instructions ask so the researcher checks the record against what they said. Cosmetic in this run — every
  narrated value was verified by data — but it is the rule that exists for the day the narration is wrong.
- **F6 — The session said a moved record "appears in `list_evidence_reviews`"**, which is true of a PROMOTED record;
  an unpromoted citation surfaces as a changed pin at the next write. A confusion of two mechanisms the surface
  describes separately.
- **F7 — The session warned that a period after a citation token "may be swallowed into the record name".** False:
  the parser ends a name at the first character that is not a letter or digit. Nothing on the surface says so; the
  session inferred the risk from silence, then observed the parser cut correctly. The tool description could state
  the boundary in one clause.
- **F8 — The classifier's verdict coloured the timeline chart** the session drew (legend: "change judged legally
  significant"). The opinion did not ORDER the list, which is the rule; whether it may colour one is a presentation
  question for the researcher.

**What the run did not reach:** `add_note`; the debate and promotion of either cited record (step 21's flow, built,
never exercised live); `STALE_PIN`; the critic (step 22).

## 4. What step 20 leaves

- Step 20 is CLOSED: the contract green, the exercise run and recorded here.
- Step 21 closes by the note under it in the plan: built by evidence 13 (`open_debate` hands the assessor the citing
  paragraph and refuses NOT_CITED from the head's mention; `promote_from_debate` writes `debateSessionId` on the head's
  mention with `STALE_PIN` at promotion), evidence 15 (check 7, `EVIDENCE_ARGUED`) and thesis 20 (the re-pinned
  mention carries no argument). Never exercised live — the first live debate is owed to step 22's run or later.
- The appendix amendments now owed, in one docs PR: thesis A4 — NO_FRAMING coined; `create_thesis`'s narrowed set;
  `since` on `get_thesis_context`; NO_THESIS; the provision silence at `create_thesis`; `decide_gap`'s NO_SUCH_GAP;
  `list_framings`; thesis T1 :270's one word; §12 :1132's hole; thesis A3 :1404 — THE_CALL over the decisions decided at
  or before the publication; interaction A5 — `list_pages`. Eleven, each amended in place where a line exists.
- The rename of `list_findings` (F3) — the researcher's to rule, its own PR.
- Step 22 proceeds on `70465b3`, surface 34 → 38, the thesis of this record as the subject of its own live run.
