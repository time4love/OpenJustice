# Run B on staging — the first real publication of a thesis, exercised through the connector (2026-09-14/15)

**What this records.** Thesis steps 17–25 landed by 2026-09-15 (the last as #448, #450), and step 23's run A had stopped at a refused
publication by the researcher's choice. Run B took the one staging thesis, `cmu0yyflb00028861pp46alwq` under `PATIENT_RIGHTS_13`, from
an unargued draft to a **published version** through the claude.ai connector, UNSTEERED: the researcher typed every prompt, the REVIEW
seat wrote its prediction before each step, scored it after, and read the database through its own staging connector to confirm what
was and was not written. The review log is `handoffs/R50-review-state.md`, outside this repository.

**Its purpose was the PLATFORM, not the thesis's perfection** (the researcher's ruling, mid-run). The thesis's content findings are
recorded in §4 as material for thesis step 26, the rewrite on an expanded corpus; they were not fixed by further paid re-framing.

## 1. Verified, and not

**Verified by the run, each step predicted on record and checked by data:**

| claim | how it was seen |
|---|---|
| a claim can be re-framed to what the corpus holds, and the version write enforces the chosen words | framing rounds 4 (PROPOSED), 5 (ASSESSED), 6 (CHOSEN); the third version written with round 6's claim verbatim |
| a record that cannot be argued is refused before any spend | both cited diffs carry CONTRADICTED chunks; `open_debate` refuses CONTRADICTED (evidence A4 :1124), so the citations moved to the three capture records |
| the raw archive, not the extraction, settles an absence | `verify_claim_text` at five captures: the side-effect phrases present on 28.6 and 31.7, absent on both 5.8 captures and on 5.9, present on 6.9 — raw and stored agreeing, no divergence |
| three debates, three promotions, no chain write | each debate SUPPORTS with substance; promotion wrote the evidence row (created, affirmed = the pin); `get_environment` evidence 0 → 3, snapshots and anchors unchanged |
| the argument carries to the next version | the fourth version's three citations read `argued: true` with the same pins |
| gaps are decided, entered by description, and a request re-drafted | 0x0169… CONCEDED; 0xd4c4… REQUESTED with a re-drafted FOIA request on the three captures (sequence 3 supersedes 2); 0xb05b… entered by description and CONCEDED; none OPEN |
| the analysis binds to its input | `run_analysis` CURRENT on fingerprint 0xfc7062cf…; a new version or an OPEN→CONCEDED decision moves the fingerprint, a REQUESTED→REQUESTED one does not |
| readiness names its one blocker | without and with a rationale: only PUBLIC_INTEREST_STATEMENT fails; with the rationale the assessor returned substance, SUPPORTS, no names, allegations framed |
| publication writes one attempt, the pin and the statement, and opens the cited page | `publishedVersionId` = the head, `publishedAt` 2026-09-15 05:06:27Z, `overObjection` false, `opened` [the corona page]; history one PUBLICATION_ATTEMPT |
| an author owes nothing on a sound published thesis | `list_thesis_reviews` → `{ owed: 0, reviews: [] }` |
| the instrument over a real subject | `forensics:audit-theses -- --env staging` in the container: 1 published version, 3 EVIDENCE citations, every conjunct PASS, CLAIM_FRAMED PASS, exit 0 — the ledger's first recorded run of `thesis-cites-verified` (the zero-subject run of step 24 was deliberately not recorded) |

**Not verified by the run:** a withdrawal and its notice; a refused re-publication; FLAGGED and STALE_TRAJECTORY on a published citation;
`audit-theses` exiting 2 and then 0 — plan step 24's own exercise, which needs a re-walk moving a cited record's content, **deferred until
the corpus is expanded**; the public page rendered by the frontend (§5).

**What it cost:** eight model calls, each approved — framing assessment 1, debates 3, FOIA draft 1, analysis 1, readiness with a
rationale 1, publication 1.

## 2. The run, in outline

| # | act | result |
|---|---|---|
| 0 | `list_findings`, `list_captures` on the page (a first attempt reached PRODUCTION, Live-18) | no capture on 31.7 or 5.9 is a record; the two cited diffs carry CONTRADICTED chunks |
| 1a–c | `get_framing`, `assess_framing` (paid), `choose_framing` | round 6 chose a claim resting on the three captures |
| 1d | `add_thesis_version` | third version citing only the three captures |
| 2a | `verify_claim_text` ×10, `audit_thesis_claims` | the 5.8 absence is in the raw document; the audit refused without a URL (Live-21, #473) |
| 2b–g | three `open_debate` (paid), three `promote_from_debate` | all SUPPORTS, all promoted |
| 3a–d | `draft_foia_request` (paid), three `decide_gap` | no gap OPEN |
| 1e | `add_thesis_version` | fourth version: the capture's time, the raw-archive check, the scope sentence, the reliance argument |
| 4 | `run_analysis` (paid) | MODERATE; three record-grounded challenges (§4) |
| 5–6 | readiness without and with a rationale (paid) | one blocker, the statement |
| 7 | `publish_thesis` (paid), in a new conversation (Live-31) | published |
| 8 | `list_thesis_reviews`; `audit-theses` in the container | nothing owed; exit 0, recorded |

## 3. Findings, by owner

**The platform (code):**
- **Live-21 — `audit_thesis_claims` finds no page for a draft whose citations are not promoted** (scope through `Evidence` rows only). #473.
- **Live-25 — one headline verdict for a quotation checked across dates.** The audit reported PRESENT for phrases present at some
  checked captures and absent at others; the per-capture array carries the truth. #475.
- **`tools/integrity-board/record.mjs` cannot record a run without `--summary`** — with no flag, `summaryAt` is -1 and the filter drops
  argument 0, the log path. Found recording this run. #474.

**The instructions (SPEAKING):**
- **Live-20, 22, 23, 24, 30 — platform state asserted without reading it**: a gap "recorded" by `choose_framing`; an analysis fingerprint
  "changed" by a promotion; debates "still OPEN" after promotion; a decision "attached to the previous version"; an analysis "never run".
  Every one false by data. Five in one run, all the same class, and all in the backlog's instructions item.
- **Live-26 — EXAMINED_NONE read as an unfinished check** on a capture citation, where input soundness has no subject.
- **Live-29 — the publication rationale confused with the public-interest statement.**

**The conversation:**
- **Live-31 — part of the claude.ai conversation disappeared**; the researcher had to re-run a command they had seen run, and the session
  then reasoned from state older than the thesis's. Run B finished in a new conversation opened with a self-contained state message.
- **Live-27 — a transient tool execution error** on a free readiness read; the retry answered.

**The guide (the REVIEW seat's prompts):**
- **Live-18** — a prompt that named no environment reached production. **Live-19** — a prompt carrying a placeholder was pasted as is.
  **Live-28** — "rationale 2 above" collided with the debate rationales' numbering. Each was refused or stopped before a write.

**What held:** the session refused to spend or record unapproved words every time it was unsure; named records by capture and timestamp;
labelled the classifier's, assessor's and critic's opinions as theirs; and re-read before paid calls once asked to.

## 4. The thesis's content — material for step 26

The published version states a bounded fact well: four items (the side-effects heading, the list of common effects, the reporting link,
the referral to the vaccination committees' summaries) absent from the Ministry's central information page at 5.8.2022 and present
before and after, the absence confirmed in the raw archived document, the narrower window (present 31.7, absent 5.9) confirmed against
the raw archive though uncitable.

**The critic's three challenges are grounded in the 5.8 capture's own text, and each holds:**
1. The page **recommends** vaccination for toddlers **in risk groups** and **permits** it for all ("מאפשר לכל ההורים המעוניינים בכך לחסן את
   ילדיהם") — the version's and the claim's "recommends … including toddlers" / "extends the recommendation" are wider than the page.
2. A section "בטיחות החיסון לפעוטות" stands at 5.8 with general safety statements — what is absent is the **list of effects and the
   reporting route**, not every safety statement.
3. The page links "שאלות ותשובות בנושא חיסון קורונה לילדים ולפעוטות" — the alternative reading (the content moved to a linked page) is
   open, and the conceded parallel-channel gap is the thesis's load-bearing weakness.

**The legal element** rests on the researcher's reliance argument — vaccinating clinicians draw the content of the consent conversation
from the Ministry's official publications, all the more in a new pandemic, so the Ministry cannot shift the disclosure duty onto them —
stated in the text as the thesis's argument, with its factual premise (that vaccination teams were directed to this page) conceded.

**The corpus to add before step 26**, in order of what each settles: the linked Q&A page for children and toddlers (challenge 3); the
committee summaries page the removed link pointed to (what was known, when); the Ministry's side-effects and reporting pages; guidance to
vaccination teams for the toddler rollout, summer 2022 (the reliance premise); the page's other language versions (the pattern).

## 5. What run B leaves

- **The public thesis page in the frontend** — thesis plan §7 :324 ("the page rendered a published thesis"); the frontend still renders
  TipTap and calls retired routes. Staging now holds the published thesis it can render against.
- **Plan step 24's exercise** — deferred until the corpus expansion supplies the re-walk.
- **Thesis step 26** — the rewrite on the expanded corpus, then production at SHIP.
