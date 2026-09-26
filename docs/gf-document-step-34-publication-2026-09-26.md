# Document step 34 — publication: the openings, the two checks, what the public reads (2026-09-26)

**Bears on:** `docs/gf-document-refactor-plan.md` step 34 :266–:293 — `decide_opening`, OPENED(d) and PUBLIC(d) derived,
checks 18 and 19, the evidence checks binding on a DOCUMENT mention, `PassageVerdict` and `documentsOpened` at
`publish_thesis`, the two public serves, `resolve_record`'s block, the `documents` register, and
`forensics:document-openings`. Also #594 (the review over a DOCUMENT row, document flows §3 :348) and LOW-m (row 16 over
an untitled document), both carried into this step.

> **SKELETON — written by the R86 DEV seat at chunk 6, before the staging exercise.** §1–§3 record what was built and the
> rulings it was built to, by pointer. §4 (the staging exercise) and §5 (the close) are EMPTY and are written by the seat
> that runs the exercise, from its log. The step is not closed by this document.

No DOC_ID appears in this record (document flows §4 :420–:422). Documents are named by title, or by their COMMITMENT, their
public name.

---

## 1. What was built, by chunk

| chunk | what | landed |
|---|---|---|
| 1–3 | VERIFIED(d) at the gate; `decide_opening` and `documentOpenings.openingsOf`, THE loader of OPENED(d)/PUBLIC(d); check 19 `DOCUMENT_QUOTES_PRESENT`; `PassageVerdict` per (mention, span) and `documentsOpened` at publication; each cited document's title handed to the publication assessor (prompt V2) | PR #604 → `7d9e845` |
| 4a | §7's public block (`documentPublicRead`, the one composer); `resolve_record` on a commitment; the public thesis page's DOCUMENT citation; the `documents` register, OPENED only, with `title` | PR #604 |
| 4b | `/content` serves a PINNED version (`NOT_PINNED` otherwise); `/bytes` with `{ docId, salt }` beside the file | PR #604 |
| 5-0 | one `DocumentContentDerivation` row per derivation, `derivedUnder` dropped in the same migration (`20260926120000_document_content_derivation`) | PR #604 — staging after LAND: 6 rows, 1 NULL `at` |
| 5a | #594 — a promoted document whose CURRENT(d) moved enters `list_evidence_reviews`; REAFFIRM / WITHDRAW over it; FLAGGED's content arm over CURRENT(d); the FLAGGED material of `list_thesis_reviews` | not yet landed |
| 5b | the research page's parser reads a review's `record` before its `cause` | not yet landed |
| 6 | `forensics:document-openings` (openings by custody, the §2 equality — counts only); row 16 names an untitled cited document NOT EXAMINED | not yet landed |

## 2. The rulings this step was built to — each written where it binds

| ruling | written at |
|---|---|
| Q-D — a document's review cause is the EXTRACTOR cause naming the RECORD, no new kind | evidence flows A4 :1146 (CONFORMED 2026-09-26) |
| Q-E — `title` on the register row | document flows §9 :1031, :1034 |
| Q-G — a bytes-only version's hash is the COMMITMENT | document flows A1 :1243, §3 :293, §3 :323 |
| Q-H — `/content` serves a pinned version; `NOT_PINNED` | document flows A5 :1505–:1506 |
| Q-R1 — one row per derivation, `at` NULL only before the table; the cause's `to` = CURRENT_EXTRACTOR, `at` = that row's moment | document flows §3 :324, A2 :1300, A3 :1368–:1369; evidence flows A4 :1146 |
| the FLAGGED material of `list_thesis_reviews` carries `{ commitment, title }` and the document cause | thesis flows A4 :1523 (CONFORMED 2026-09-26, to evidence :1123) |
| Q-S — the ORDER: chunks 1–4 and the Q-R1 migration landed first, so chunks 5–6 end at a local page against staging's schema | this record — a ruling on sequence, with no design line |
| Q-R2 (a) — the assessor's material unchanged; row 16 alone names an untitled document NOT EXAMINED | document flows A6 :1537 (unchanged — the row now meets it) |

Rulings R84 Q1–Q16 and Q-P, Q-A…Q-C and Q-F bind as carried by the step's review logs; where each moved a design line, the
line carries its CONFORMED clause.

## 3. What the review caught

— to be written at the close, from the review logs (each MEDIUM with the case that holds it).

## 4. The staging exercise (plan :284–:293)

— EMPTY. Written by the seat that runs it, every act shown to the researcher before it runs (Guided Execution), in a NEW
claude.ai conversation (a connector's tool schemas are cached per conversation).

| act (plan :284–:293) | result |
|---|---|
| `publish_thesis` refused on step 33's version, naming the undecided mention | |
| `decide_opening BYTES` on the sealed document refused `NOT_HELD` | |
| PASSAGE for the sealed, CONTENT for the held | |
| a quoted phrase the held document does not contain — check 19 refusing and naming the span; the phrase corrected | |
| published — `PassageVerdict` rows PRESENT, and UNCHECKED for the sealed photograph's citing paragraph | |
| `/content` serving the held text; `/bytes` on it refused `NOT_OPENED_TO` | |
| `resolve_record` on the sealed commitment carrying the notice and no DOC_ID | |
| `list_findings` on the page the held document asserts, showing it in the register | |
| `decide_opening PASSAGE` on the held document after CONTENT refused `CANNOT_NARROW` | |
| `forensics:document-openings -- --env staging`, in the container, after the publication | |

## 5. The close — deferred, owed, found

— to be written at the close. Carried into it: the SEALED acts wait on step 32's door; #594 is proven by the suite only,
because `CURRENT_EXTRACTOR` does not move in this step; SHED by cause is step 35's measurement (plan :304); `SHIP` of this
step is HELD until the frontend renders a `#doc_` citation (Q7); the issues owed at the close (#602's re-gate, #596's
disposition, LOW-r, LOW-u, the public-read cost of Q-A/Q-B).
