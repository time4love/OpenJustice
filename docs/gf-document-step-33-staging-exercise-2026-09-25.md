# Document step 33 — exercised on STAGING, CLOSED ON THE REDUCED SET (2026-09-25)

**Bears on:** `docs/gf-document-refactor-plan.md` step 33 :241–:264 — `#doc_` citation and its pin, the debate's third
record, promotion of the first DOCUMENT Evidence row with NO chain write, `decide_gap CITED` on a commitment. The code
landed as PRs #592 and #597 (`a8219c1` on `staging`); the PDF reader fix that had to precede this exercise landed as PR #599
(`87679fb`, `docs/gf-document-reader-join-2026-09-25.md`) and staging's HELD documents were re-derived under it first.
Exercised the same day on the researcher's first `#doc_` draft, every act shown to the researcher before it ran.
**Written by the R83 REVIEW seat, which ran the exercise, from its log; read cold by the DEV seat against that log before
landing** (the researcher, 2026-09-25). Never edited after.

> **STEP 33 IS MET ON STAGING ON THE REDUCED SET** (the researcher, R81 Q2). A HELD document was cited in a new version
> and pinned to its current content; debated — the assessor SUPPORTS and the quoted phrase is PRESENT by the ONE verdict
> rule; promoted as the FIRST DOCUMENT Evidence row with **no chain write** (the commitment's registry entry
> byte-identical before and after, the registry's total unchanged at 30); a gap entered by the researcher's own words and
> decided CITED by the document; the working view showed a page plus a document and was accepted. **DEFERRED:** several
> pages plus a document (to the researcher's real end-to-end run); the sealed items and ANSWERED with ARRIVED empty (to
> step 32's round, `gate:document-33`).

No DOC_ID appears in this record (document flows §4 :420–:422). Documents are named by title, or by their COMMITMENT
abbreviated, their public name.

---

## 1. Before the exercise — the reader fix and the re-derivation

The Hebrew text-layer doc's timing ruling (§5, "sharpened") put the reader fix before this exercise, so no citation made
here would be re-pinned when the extractor moved. PR #599 moved `CURRENT_EXTRACTOR` to `v2-…-gapjoin0.06em-…`; staging's
backend deployed it; then, each act shown first:

| act | result |
|---|---|
| read-only precondition from a laptop (SELECT only) | Evidence rows: 3, all CAPTURE; **DOCUMENT 0**; documents 3 — no promoted document whose content could move (#594's guard) |
| `forensics:rederive-documents -- --env staging`, in the container | exit 0; "agreed by Railway, APP_ENV, the database and the chain" at `87679fb`; 3 examined: the dataset UNCHANGED (the extractor appended), the paper and the Nuremberg Code SUPERSEDED (a new version each, the old kept); no chain write |
| `verify_claim_text` on the re-derived Nuremberg Code, „The voluntary consent of the human subject is absolutely essential” | PRESENT over the new version; context 5 lines, 377 characters (under `v1` the whole 4,801-character document) |

The researcher's draft therefore pinned the Nuremberg Code's `v1` version, no longer CURRENT — as the reader-fix doc §10
predicted.

## 2. The exercise, act by act (plan :257–:264)

All MCP calls went through the STAGING connector, confirmed by `get_environment` (staging, CONFIRMED, chain 84532, registry
`0xDA3B…4C73`) before the first; the production connector was never used.

| # | act | result |
|---|---|---|
| 4a | `get_thesis_context` on the draft | DRAFT_ONLY; one DOCUMENT mention pinned to the `v1` version; no gaps; owed 1 (UNARGUED) |
| 4b | `list_corpus` (captures) · `list_trajectories` (the second page) | 27 captures on 3 pages; **Evidence exists on ONE page only** (the vaccine page, 3 records); no trajectory on a second page — so "several pages" could not be cited without manufacturing a record (§4) |
| 4c | `add_thesis_version`, the researcher's approved claim and text | a new version citing the Nuremberg Code **re-pinned to its current (`v2`) version** and one vaccine-page Evidence record (5.8.2022); both unargued; free |
| 4d | the working view on the local pair, beside board ד2·י | the `#doc_` chip (board י4), the strip with ONE page plus the document at the line's end (ד2·י :262), the owed strip with both citations — **accepted by the researcher** ("the page looks right") |
| 4e | `check_on_chain_status` on the commitment, BEFORE | registered, index **29**, attributed to the platform's registrar, category `DOCUMENT_COMMITMENT`; saved verbatim |
| 4f | `open_debate { document: commitment }` — run by the researcher in claude.ai (§5), verified by REVIEW's own `get_debate` | substance cleared; verdict **SUPPORTS**; one assertion, the quoted phrase, **phraseVerified PRESENT** by the verdict rule; `gemini:gemini-flash-latest`, prompt `v3-document-record-and-assertions`; ONE paid call |
| 4e-2 | `totalEvidence()` from a laptop (a read-only view call, chain 84532 checked first) — run AFTER 4f and before 4g, so still a valid BEFORE | **30** |
| 4g | `promote_from_debate` | PROMOTED; the Evidence row **created** (the first of kind DOCUMENT), `fileHash` = the commitment, affirmed = CURRENT(d); then `check_on_chain_status` **byte-identical** to 4e, and `totalEvidence()` **30** — **no chain write anywhere** (plan :252, :262–:263) |
| 4h | `decide_gap` — a gap entered by the researcher's sentence, decided CITED with the commitment | CITED, sequence 1; free, no model (thesis A4 :1488–:1494: a description enters the list) |
| — | `get_thesis_context` read back | the DOCUMENT mention **argued**; the gap reads CITED; the transcript shows the debate, its close and the gap decision |
| — | `list_evidence_reviews` with the DOCUMENT row present | `owed: 0`, nothing moved, nothing unevaluable |

## 3. Graded against plan :257–:264

| the plan asks | here |
|---|---|
| the §6 contract green | MET at the code's landing (#592, #597; R82) |
| no-research-act-reaches-the-chain green with `promote_from_debate` over a document | MET in the suite (R82); **observed on the chain** here (4e/4g) |
| citation-pins-only-`affirmed` over one | MET in the suite (R82); observed: the pin is CURRENT(d) before promotion and `affirmed` = CURRENT(d) after |
| one of step 30's HELD documents cited in a new version | MET IN KIND — the Nuremberg Code, a HELD document received the day after step 30 through the same researcher's door (step 31's record) |
| one of step 32's SEALED documents cited, pinned to AT_RECEIPT; `open_debate` on a sealed photograph refused `NOTHING_TO_PROMOTE`; a SUBSTANCE round on the sealed PDF's letterhead recorded UNCHECKED | **DEFERRED** — no sealed document exists before step 32's door (R81 Q2, `gate:document-33`) |
| promotion, then `check_on_chain_status` unchanged | MET (4e → 4g) |
| `decide_gap CITED`, then `get_arrivals` ANSWERED with ARRIVED empty | `decide_gap CITED` MET (4h); the arrival half **DEFERRED** — no arrival exists before step 32's door |
| the captures strip with SEVERAL pages plus a document (R81 Q2(ii)) | **DEFERRED** to the researcher's real end-to-end run (§4); one page plus a document seen and accepted (4d) |

## 4. Why "several pages" was deferred, not manufactured

The corpus holds Evidence on one page only (4b). A second page could have been reached by promoting a capture through a
paid debate written only to set up this check, or by a trajectory the second page does not have. The researcher chose
instead a real end-to-end thesis run — several captured and document records a researcher gathers — before the
whistleblower intake, in a dedicated session, checking claude.ai, the dialogs and the UI step by step. The several-pages
strip is judged there (#601).

## 5. Found during the exercise — none changes a result above

1. **A connector's tool schemas are cached per conversation.** The REVIEW seat's session held the staging connector's
   pre-#597 schemas: `open_debate`'s record admitted no `{ document }` arm and `add_thesis_version`'s copy named no `#doc_`.
   The landed code is right (`src/mcp/tools/openDebate.ts` :40–:50). The session's reconnect applies only to a FAILED connector; the researcher then refreshed the connector inside the session, and re-loading the schema afterwards still returned the pre-#597 one.
   4f therefore ran in a FRESH claude.ai conversation, the exact prompt shown first, and was verified by REVIEW's own read.
   **For the real run: open it in a new conversation after any LAND that changes a tool.**
2. **v2's transcript card reads "+1 citations"** and does not say the Nuremberg Code was RE-PINNED, although the version's
   `citationsVsParent.repinned` carries it. Filed as #600.
3. **An unpromoted document's mention does not show that its pin is no longer CURRENT(d).** After the re-derivation, the
   draft's `v1` head read `verified: true`, not flagged, with nothing on the page saying its pin had moved. Document flows
   §7 :855 draws "content moved (HELD only)" in the document sheet, which ui §18 :583–:584 reserves for step 34. Filed as
   #602 (`gate:document-34`).
4. **The debate's opening turn carried `pin: null` while the debate was OPEN,** and the affirmed version once promoted.
   Filed with item 3 as #602; whether a capture debate's opening pin behaves the same is a question for the step-34 reading.
5. **Clicking the `#doc_` chip does nothing today** — an inert span, as board י4's caption (:239) and ui §18 :583–:584
   rule until step 34. The researcher asked; answered from the design.

## 6. What holds from here

- **`CURRENT_EXTRACTOR` must not move again before step 34.** A promoted document whose CURRENT(d) moves makes
  `list_evidence_reviews` fail loudly until #594 builds the review over a DOCUMENT row.
- The researcher's draft is a working draft, not published; `publish_thesis` refuses a `#doc_` head until step 34
  (check 18, plan :255).
