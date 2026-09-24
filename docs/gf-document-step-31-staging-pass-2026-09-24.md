# Document step 31 — standing, built and exercised on STAGING; the production pass HELD (2026-09-24)

**Bears on:** `docs/gf-document-refactor-plan.md` step 31 :191–:211 — the anchoring module's second caller, ANCHORED(d)
on every read, `check_on_chain_status` for a commitment, `anchors-explainable` over both categories, `commitments-owed`,
and the standing pass `forensics:anchor-documents`. Built in four graded chunks (R80) and landed as PR #588
(`d350d13` on `staging`). Exercised on staging the same day, each act shown to the researcher before it ran. Written the
day it ran; never edited after.

> **STEP 31 IS MET ON STAGING.** Step 30's two documents were owed (exit 2), the pass anchored both (registry indices 27
> and 28), `commitments-owed` answered exit 0 after, `check_on_chain_status` answered each commitment ATTRIBUTED under
> `DOCUMENT_COMMITMENT`, and `anchors-explainable` explained all 29 entries. A NEW document sent by the researcher's own
> path was then anchored AT RECEIPT through MCP (index 29), three seconds after its row. **The PRODUCTION pass is HELD
> until the researcher's word** (plan :191).

No DOC_ID appears in this record: a document's DOC_ID is served only with a BYTES opening (document flows §4
:420–:422). Documents are named here by their COMMITMENT, their public name.

---

## 1. The staging pass, act by act (plan :210–:211)

Every operational act ran in the staging container, the environment stated twice
(`railway ssh --environment staging … -- --env staging`). Each reported `environment staging — agreed by Railway, APP_ENV,
the database and the chain` on deployment `0c1a572a…` at `d350d13`. Exit codes were captured without a pipe.

| # | act | result |
|---|---|---|
| 1 | `forensics:commitments-owed` | **exit 2** — "2 documents asked, 2 owed": `0x09e6…e267` (the dataset) and `0x2c38…a069` (the paper), both UNREGISTERED, received 2026-09-23, about 20 h old; 0 younger than the floor; 0 anchored by an equal capture |
| 2a | the REVIEW seat's read-only precondition, from a laptop (view calls only) | chain 84532, registry `0xDA3B…4C73`, `totalEvidence()` **27**, index 0 registered (the control), both commitments unregistered |
| 2b | `forensics:anchor-documents` | **exit 0** — "WROTE … anchored true" for both; tx `0x6627e22d…` and `0x5f4e424f…`, category `DOCUMENT_COMMITMENT`; "after: 0 owed beyond the floor" |
| — | the REVIEW seat's read-only after-read | `totalEvidence()` **29**; the dataset at index **27** (13:52:14Z), the paper at index **28** (13:52:18Z); each hash equals its commitment, submitter our registrar; both receipts status 1 |
| 3 | `forensics:commitments-owed` | **exit 0** — "2 documents asked, 0 owed" |
| 4 | `check_on_chain_status({ commitment })` ×2, from claude.ai on the `gf-staging` connector | each `attestedBy: COMMITMENT`, registered, attributed, index 27 / 28, block time as above, category `DOCUMENT_COMMITMENT`, `capture: null`, registry 84532 / `0xda3b…4c73`; submitter the same registrar as index 0 |
| 5 | `forensics:audit-registry` (anchors-explainable) | **exit 0** — "29 entries examined, 0 unexplained": `DOCUMENT_HASH` 27, `DOCUMENT_COMMITMENT` 2 |
| 6 | the documents lens on the local pair, reading staging's registry read-only | both rows „מוחזק · מאומת מול העוגן" (board י3's anchored state); none owed |

## 2. Step 7 — the researcher's own path, one NEW document (added by the researcher)

The pass pays what is owed. It does not show the path a researcher takes from step 31 on: `add_document` anchoring a new
document at receipt, through MCP. The researcher asked for it, and it ran the same way, act by act.

| act | result |
|---|---|
| 1 | claude.ai, `gf-staging`: `get_environment` staging · CONFIRMED · 84532; `list_documents` → the staging `uploadUrl` |
| 2 | the title proposed in the conversation and approved: „קוד נירנברג (1947) — הנוסח המלא של עשרת הסעיפים"; the link carried it URL-encoded (re-encoding matched byte for byte) |
| 3 | the file: the Nuremberg Code as reprinted in *BMJ* 1996;313:1448, a 2-page PDF with a text layer (all ten articles present). The upload dialog hashed it in the browser and uploaded it: the FIRST real new file through the dialog on staging (R79's absent-key fix on a real page). A second drop hours later answered „כבר במחסן · ממתין לפקודה" and uploaded nothing. The browser's name and the SHA-256 of the stored object agree |
| 4 | `add_document`, run from claude.ai on `gf-staging` after `get_environment` confirmed staging: a Document row with commitment `0x9cec…712d`, received **16:20:43Z**, one content version, one arrival; on chain at index **29**, submitter our registrar, `DOCUMENT_COMMITMENT`, block time **16:20:46Z** — anchored at receipt |
| 5 | `forensics:commitments-owed`: **exit 0**, "3 documents asked, 0 owed", 0 younger (the new document, two minutes old, is anchored, so the floor has nothing to hold back). The lens: three rows, all „מאומת מול העוגן" |

**Not seen whole:** the pasted `add_document` answer was cut off in transit after the commitment's first characters. The
anchor is proven from the chain and the database, above; that the tool's answer carried `anchored: true` to the client
is not shown by this record. The command was not re-run, because a second call is a second arrival.

## 3. The rulings this step was built on (the researcher, 2026-09-24)

Each was made during the R80 round and is written into the design or the code named beside it.

- **ANCHORED(d) has a capture arm.** For a HELD document whose DOC_ID equals an ATTRIBUTED capture's `documentHash`,
  nothing is written; §4 :440–:442 wins over the appendix. The commitment is still computed at receipt, and one written
  before the equality stands. Written at document flows A3 :1366, A4 :1469 and A7 :1559 (delta 0). Unreachable on
  staging today: no document equals a capture.
- **`check_on_chain_status({ commitment })` refuses NOT_PUBLIC unless PUBLIC(d)**, one refusal body for an unknown and
  an unopened commitment; a signed-in researcher reads through, as `openPage` lets a researcher through (A4 :1469).
- **A chain write leaves only from inside a deployment.** The window the anchoring module builds from the environment
  refuses one anywhere else, and the act completes owed; reads stay open. The check is one pure function,
  `inADeployment(env)`, shared with `runOperationalScript`. It closes the walk's own laptop exposure with the same line.
- **A receipt anchors on a document's FIRST arrival only**; a later arrival of a still-owed document leaves it to the
  pass. An in-process lock per commitment covers two simultaneous first sends.
- **The pass's input has a 10-minute floor on `receivedAt`**, an operational parameter, so the receipt's writes and the
  pass's writes never want the same entry. `commitments-owed` prints the younger documents on their own line and counts
  only those beyond the floor.
- **The anchored pill keeps board י3's word**, „מאומת מול העוגן".
- **The document VERIFIED predicate is `verifiedDocument`**, as `recomputable` became `recomputableDocument` on
  2026-09-23: a protected evidence scan holds that no other module declares a `verified`. The contract's
  `standing.test.ts` and `contract.ts` :145 carry the name.

## 4. Recorded, not ruled

- **One instance per environment is ASSUMED.** The in-process lock holds within one process. `railway.json` declares no
  replica count; the dashboard's value is the researcher's to confirm.
- **A second concurrent run of the pass is the operator's error**, prevented by the word, not by code. The read before
  every write and the duplicate refusal keep one from producing a false answer; they do not make two runs a supported
  shape.
- **`forensics:registry-ledger` refuses a commitment entry by name**, and that is correct on a live registry: the
  ledger is the frozen-registry instrument (evidence §8 :672, :702), and the live registry is `anchors-explainable`'s.
  The ledger kind is owed at the next rotation; wording is proposed in #587.
- **`add_document` waits for one confirmation** (`tx.wait(1)`, no timeout of its own): three seconds on staging today.
  §12's measurement decides whether that ever needs a bound.
- **ANCHORED(d) costs about two RPC reads per document** on every `read_document` and `list_documents`, read
  sequentially. §12 decides whether a list read ever needs a batch read.

## 5. What this record does NOT establish

- **Production.** Nothing of step 31 has run there, and production holds no document. The production pass is held until
  the researcher's word (plan :191); production's chain read is taken at SHIP, first.
- **The capture arm on real data.** No staging document equals a capture; the arm is held by the suite alone.
- **Step 29's four fixture kinds** through `add_document` on staging, and the photograph's `text: null` — still owed from
  step 30 (plan :189).
