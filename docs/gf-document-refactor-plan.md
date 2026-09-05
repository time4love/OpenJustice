# Refactoring the document layer — 2026-09-04

**Fourth of four, in implementation order.** `docs/gf-refactor-plan.md` §3 is the CORPUS (steps
0–10) and §3b is EVIDENCE (steps 11–16); `docs/gf-thesis-refactor-plan.md` is the THESIS (steps
17–26); this plan is the DOCUMENT class, steps 27 onward, and it begins where step 26 ends. It is
the last of the four target designs' plans; the Prosecutor's build is its own, later. The target
is `docs/gf-document-flows.md`, whose appendix is the contract every step builds to; the reasoning
is `docs/gf-architecture-target.md` §11; the test rules are the refactor plan's §4, unchanged, and
every rule there binds here; the operating model is its §9. The frontend's cut-over changes —
the intake dialog, the withdrawal dialog, the `/safety` copy, the public page's rendering of a
`#doc_` citation — are NAMED here, at the step each must precede, and built elsewhere.

---

## 1. THE STRATEGY — CLEAN GROUND, NOT BESIDE

The corpus and thesis plans build beside a path that keeps working until one step switches. This
plan has nothing to be beside. Every as-built document writer — the gap route, `/api/evidence/confirm`,
`/recover-confirm` through `persistScreenshotEvidence`, `create_evidence_from_text` and
`recover_evidence_from_screenshot` — writes the columns evidence A2 removes (summary, tier, role,
categories, figures) and writes `PENDING_REVIEW`, a status the target has no spelling for. Step 11
lands the target schema on the rebuilt database, so the as-built document path is EXPECTED to
stop compiling at step 11 — an expectation step 11's build verifies, never a fact observed today —
and the writers retire there, tagged RETIRE-AT-11 in §5, with their tests. From step 11 to this
plan's door there is no document path at all. The steps below build the target on clean ground,
and the switch is the removal of what is left after the frontend's cut-over: the routes that served
DOCUMENT rows, the columns, `Whistleblower`, the provenance values.

**The data story is empty, as the thesis plan's is.** The one legacy DOCUMENT record and the
published thesis that cites it are not carried (flows §10); no migration of any document, arrival
or whistleblower row is ever written; what the researcher wants back re-enters through
`add_document`, held, under its own commitment, or through intake, sealed, if its source sends it
again.

Three things stand where the coexistence stretch stood, and each has a guard:

- **The chain.** A receipt writes a permanent entry under `DOCUMENT_COMMITMENT`, and an entry on
  the old registry would be a fourth kind of legacy entry to explain. Step 27 reads the rotation
  FROM THE CHAIN — `get_environment` names the new address, and index 0 is empty or carries
  `ANCHOR_SCHEME` — never from this plan's order. `WRITES_ALLOWED` refusing is never what saved us;
  it is the net.
- **A stranger's write.** The intake door is the one write an anonymous party makes and the one
  paid call made on a stranger's act. Its instruments — `no-plaintext-at-rest`, `no-sender-identity`,
  `one-hash-two-implementations`, the paid-read count — land WITH the door, not after it; and the
  frontend's dialog lands before the old route goes.
- **The seams.** The landed symbols that gain an arm, and the removal, are the table below; each
  arm is added BY ADDITION, and the sibling acceptance suites — `walk`, evidence's, `thesis` —
  stay green and unedited as the guard (§4 rule 2). A seam that needs a sibling's test edited is a
  seam this plan got wrong.

| seam | landed by | this plan adds | not before |
|---|---|---|---|
| the anchoring module | corpus step 5; the registry rotated at corpus 9.4 | a second caller — the receipt, or the standing pass for what is owed — under category `DOCUMENT_COMMITMENT` | corpus 9.4, read from the chain at step 27 |
| the record key | evidence step 11 — `Evidence.kind`, `documentCommitment` and the three-arm CHECK, from the amended evidence A2 | the first row of kind DOCUMENT, at promotion | evidence 11 |
| the debate | evidence step 13 — `open_debate`, `promote_from_debate` | the record as `{ document: commitment }`; `NOTHING_TO_PROMOTE`; `NOT_ACQUIRED`, `CONTRADICTED`, `NARROWED` never raised | evidence 13 |
| the verdict rule | thesis step 19 — builds the three values, PRESENT · ABSENT · UNCHECKED, from the amended T1 | its first caller with null text | thesis 19 |
| the citation token | thesis step 20 — T2's parser | `#doc_<COMMITMENT>` → a kind DOCUMENT mention, pinned over CURRENT(d) | thesis 20 |
| the gate | thesis step 23 — the seventeen checks | `DOCUMENT_OPENING_DECIDED`, `DOCUMENT_QUOTES_PRESENT`; `CITES_EVIDENCE` counts a DOCUMENT mention; evidence A6's non-binding arm falls | thesis 23 |
| the author's list | thesis step 24 — `list_thesis_reviews` | the ARRIVED arm, over the Arrival table this plan creates | thesis 24 |
| the removal | thesis step 25; the frontend's cut-over of both public routes | the switch | thesis 25, and both public routes cut over |

The seams are the only ordering across the plans; between them the width is the conductor's
(refactor plan §9.4).

**One hazard is created by the strategy itself, and it is named here and in §8.** Between step
11 and this plan's door the public intake is DOWN: the gap modal posts to a route that no longer
exists, and a `SHIP` mid-chain would ship the gap to production. The frontend's cut-over therefore
has two halves, each its own change: HIDE the door — the gap modal and the `/submit` page — landed
with step 11; OPEN the new one — the intake and withdrawal dialogs against A5 — landed before this
plan's door serves. Neither half is a step of this plan; both are preconditions its steps name.

What does not get cheaper is the suite, as for the thesis. The test files that assert the
as-built intake, the classifier, the ciphertext name and the screenshot record are tagged in §5,
counted from the tree with the command beside the count, and a RETIRE-AT-11 file still present
after step 11 is a defect in step 11.

## 2. THE TRANSLATION TABLE — OLD TO NEW, ONE ROW EACH

| old | new | where ruled |
|---|---|---|
| `EvidenceType.DOCUMENT` as a `PENDING_REVIEW` evidence row the moment bytes arrive | `Document` + `Arrival`; an `Evidence` row of kind DOCUMENT only at promotion, `documentCommitment`, `fileHash = commitment` | §1, §6, A2 |
| three names: the CIPHERTEXT's hash (the gap route), `url + "\n\n" + text.slice(0, 40000)` (`create_evidence_from_text`), the image buffers concatenated (`persistScreenshotEvidence`) | `DOC_ID = sha256(bytes)`, one file one document; `Web3Service.hashFile` survives as the function | §2, A1 |
| the row's hash is the registry's, the page's and the citation's name | `COMMITMENT = sha256(bytes32(DOC_ID) ‖ salt)` is the public name; DOC_ID and the salt GATED, served only with a BYTES opening | §4, §7, A1 |
| the vault on one path: browser strip + AES-GCM, no name computed there; `/submit` posts plaintext to `/api/evidence/intake` | SEALED at INTAKE, always — strip, DOC_ID, encrypt in the browser; HELD at RESEARCHER, always; custody DERIVED from what is held | §2, A2 |
| `IntakeAgent`'s classification — tier, role, figures, categories, summary, date — written onto the row; `buildFileContentBlock` | `DocumentContentVersion.text` by `CURRENT_EXTRACTOR` (COMPUTED, pinned) beside `opinion` (OPINION, labelled, never public) | §3, A2 |
| no extractor anywhere; the model's reading is the only one | `CURRENT_EXTRACTOR` at receipt, both doors; HELD re-derived when it moves, `AWAITING_DERIVATION`; SEALED at receipt, forever | §3, A1, A3 |
| `EvidenceCapture` (the fetched html and text beside a record), `intakeVersion` | nothing: a version carries its extractor and version; a page's text is the walk's `TextVersion` | §3, A2 |
| `/confirm` registering on the OLD registry with the classifier's categories as the label, `CONFIRMED` with no human step; "auto-promoted while registration was unavailable" | the anchoring module's second caller at receipt, category `DOCUMENT_COMMITMENT`, or OWED; `ANCHORED` read from chain state; the standing pass in the deployment; `check_on_chain_status` asked about a commitment answers about its entry | §4, A3, A4, A7 |
| `EphemeralAnalysisService`: decrypt in RAM, Pinata pin, key discarded — on one path | the receipt: decrypt in memory, `NAME_MISMATCH`, derive, one model read, zero, discard the key, pin the ciphertext, a fresh salt — the only path | §5, A5 |
| `Evidence.fileUrl` in storage (`StorageService`), `Evidence.ipfsCid` | `Document.bytes` (a storage reference, HELD) · `Document.cid` (SEALED); the provider unnamed; the platform can release its own pin | §2, §12, A2 |
| `Whistleblower { fileHash, encryptedContact, consentGiven }`, `encryptContact` under `PII_SECRET_KEY`, `POST /contact` | nothing: `Arrival.termsHash`; no contact, no identity, no key kept; the sender's key is the sender's | §5, §8, A2 |
| the gap modal's preview (`/whistleblower/preview`): the AI summary, date, category, figures, "you can still approve"; a free-text tip stored nowhere | nothing a model said reaches the sender; they are told the commitment, the salt, the CID and the terms, once; a written account is a document | §5, A5 |
| `sourceUrl = whistleblower/thesis/<id>/gap/<n>` addressing a gap INDEX the critic renumbers | `Arrival { thesisId, gapId?, termsHash }`; the gap by id, REQUESTED or CALLED on the PUBLISHED version; `NOT_PUBLISHED`, `NOT_AN_APPEAL` | §5, A2, A5 |
| nothing tells the author anything arrived | ARRIVED on `list_thesis_reviews`; `get_arrivals`; `dismiss_arrival` with a reason; ANSWERED derived from the mentions | §5, A3, A4 |
| `aiCostLimiter` on `/intake`, `/confirm`, `/recover-*` and the gap route | the same limiter on the receipt's one paid read — an operational parameter, measured from day one | §5, §12, A5 |
| `promote_evidence` on a DOCUMENT row (a chain write); the UI's promote bypassing the debate; `delete_evidence` on `PENDING_REVIEW` | `#doc_` cited first, argued in the debate as E1; promotion writes no chain entry; no delete — SHED | §6, §8, A4 |
| `ThesisMention { type: EVIDENCE, refId }` on a DOCUMENT row, no pin | kind DOCUMENT, name = commitment, `contentVersionHash` from `affirmed` or CURRENT(d) | §6, A2 |
| the `/api/evidence` routes serving every DOCUMENT row — summary, tier, categories, figures, `fileUrl`, CID — to anyone | `DocumentOpeningDecision` PASSAGE < CONTENT < BYTES, per cited document, before publication; `GET /api/documents/:commitment/content` and `/bytes`; `resolve_record` by commitment; nothing unopened, for anyone | §7, A5 |
| evidence A6's non-binding arm on a DOCUMENT mention; PRESENT · ABSENT | the three checks BIND; `DOCUMENT_OPENING_DECIDED`, `DOCUMENT_QUOTES_PRESENT`, `PassageVerdict`; `CITES_EVIDENCE` counts a document; check 17 examines none; the verdict rule's UNCHECKED (thesis 19) first called with null text | §3, §4, §7, A6 |
| no withdrawal; a ciphertext once pinned is never unpinned | `POST /api/documents/withdraw { commitment, key }` → SHED(SENDER), no decision; `shed_document` → SHED(OPERATOR) with a reason; FLAGGED gains SHED | §8, A2, A5 |
| `create_evidence_from_text` | `add_document`: a paste is a document, the URL its assertion, the text its own version; it writes the Document and an `Arrival(door = RESEARCHER)`, attributed | §9, A2, A4 |
| `recover_evidence_from_screenshot` (up to ten images, one name, `failedUrl`, `failureReason`), `Evidence.additionalScreenshotUrls`, `/recover-intake` + `/recover-confirm` | `add_document`, once per image, each its own Document under one `Arrival(door = RESEARCHER)`; the reason for capturing by hand is the citation's argument; the public screenshot route → intake, sealed | §2, §9, A2, A4, A5 |
| `CaptureProvenance.DIRECT · ASSERTED` on `UrlSnapshot.provenance` | nothing: a direct fetch or a supplied text is a HELD document with `assertedUrl`, `assertedAt`; `EQUALS_CAPTURE` read on demand; `NOT_SURVEYED` | §2, §9, A3 |
| `get_forensic_timeline` shows no document; a document with a `sourceUrl` sits beside diffs unrelated to the page | `list_findings` gains the `documents` register, OPENED only, never interleaved; `list_documents` GATED; nothing diffed against a document | §9, A4 |
| — | `read_document`, `describe_document` (paid), `decide_opening`, `list_documents`, `get_arrivals`, `dismiss_arrival`, `shed_document` | A4 |
| — | `document-recomputable`, `commitments-owed`, `no-plaintext-at-rest`, `no-sender-identity`, `one-hash-two-implementations`, `verdict-rule-one-spelling`; `anchors-explainable`, `opinions-not-facts`, `retired-names` extended; the four `forensics:*` measurements | A7, §12 |
| `/safety`: the CID anchored on Base, structured metadata for the research team, no identity stored | rewritten to what §2, §4, §5 and §8 build — the frontend's, at the step §3 names | §12 |

## 3. THE STEPS — EACH BUILDS ON CLEAN GROUND; THE THIRTY-SIXTH REMOVES WHAT IS LEFT

### 27 · The acceptance suite, failing — and the rotation read from the chain

A jest project `document`, like `walk` and `thesis`: A3's derivations as pure functions over
fixtures — CUSTODY, RECOMPUTABLE by mode, ANCHORED, VERIFIED, CURRENT with AWAITING_DERIVATION,
ANSWERED, ARRIVED, OPENED, PUBLIC(d), SHED, FLAGGED's third arm, EQUALS_CAPTURE, VERDICT with its
third value; A4's tools with every refusal, the amended tools by their added arms only; A5's four
routes with every refusal, `NAME_MISMATCH` against the shared test vector; A6's two added checks
and the three that now bind, by id; A7's scans with decoys — `no-plaintext-at-rest`,
`no-sender-identity`, `one-hash-two-implementations`, `verdict-rule-one-spelling`, the anchoring
module's caller count broken by a third caller; the six invariants of A7's closing list and the
eight of target §11.7. Every file red. Informational in CI until step 36.

The same step reads the rotation FROM THE CHAIN and records it: on staging, `get_environment`
names the new registry's address, `eth_getCode` at it is not `0x`, and `totalEvidence()` is 0 or
index 0's category is `ANCHOR_SCHEME`. The read goes into the step's dated doc, and it is the
precondition every later step inherits: no step below runs on an environment whose read is not on
record, and a read that names the old registry ends the step — the suite may be written, and
nothing after it begins. Production's read is taken at SHIP, the same way.

*Leaves working:* everything; nothing under `src/` is touched.

### 28 · Schema, on the target schema

After step 11, so nothing is migrated and `Evidence` already carries kind DOCUMENT, `documentCommitment` and the three-arm CHECK from the amended evidence A2: `Document`,
`Arrival` with `ArrivalDocument`, `ArrivalDecision`, `DocumentContentVersion`,
`DocumentOpeningDecision`, `PassageVerdict`, `Shed`, each with A2's CHECK constraints — `thesisId`
and `termsHash` iff INTAKE, `researcherId` iff RESEARCHER, `reason` and `researcherId` iff OPERATOR;
`ThesisMention.kind` gains DOCUMENT;
`DebateSession.recordCommitment`; `DOCUMENT_COMMITMENT` beside `ANCHOR_SCHEME` and
`CURRENT_EXTRACTOR` as one importable symbol each, the extractor's value chosen at step 29. Nothing
is removed here. Step 11 already removed `sourceUrl`, `evidenceType` and `EvidenceCapture` with
the rest of evidence A2's list; what stays until step 36 is exactly `fileUrl`,
`additionalScreenshotUrls`, `ipfsCid`, `intakeVersion`, `Whistleblower`, and `CaptureProvenance`'s
`DIRECT` and `ASSERTED`.

*Verified by:* `db:check-drift` clean before writing; the migration read; deploys itself; the schema
half of `no-sender-identity` green with its decoy — a fixture schema carrying a contact column is
caught; `document-recomputable` observed to exit 1 on a fixture row whose bytes do not hash to its
name, then 0 on an empty database.

### 29 · Identity and content — the name, the extractor, the first null text

The identity module: `DOC_ID` and `COMMITMENT` as one importable symbol each over the server's
SHA-256, the shared test vector beside them for the browser's half. The extractor: `CURRENT_EXTRACTOR`
is a dependency choice — a PDF text library, an OCR engine that reads Hebrew — and this step makes
it, judged by `extractor-coverage` over a fixture set that holds one of each of §3's four kinds (a
PDF with a text layer, a scan, a paste, a photograph no engine reads) and by nothing this plan
says; the plan picks nothing. `DocumentContentVersion`'s one writer, `derivedFrom` AT_RECEIPT or
HELD_BYTES, a re-derivation with identical text not a new row; the derivation pass over HELD bytes
for when `CURRENT_EXTRACTOR` moves, in the deployment, writing versions and never a decision; the
OPINION register's two writers — the receipt's one read and `describe_document`'s — labelled with
model and prompt version. The verdict rule is thesis step 19's, built with its three values from
the amended T1; this step adds nothing to that symbol. A document is its first caller with null
text, and the call is made here, through `CURRENT(d)`, with the thesis suite green and unedited.

*Verified by:* the A1 contract green; `one-hash-two-implementations`' server half against the
vector, and `NAME_MISMATCH` observed to fire when one byte of the vector is altered;
`verdict-rule-one-spelling` with its decoy, a second spelling planted and caught; `extractor-coverage`
run over the fixture set with the four counts in the step's dated doc — the photograph counted as
bytes-only, never as a failure; the derivation pass observed to write a second version for one
HELD fixture under a moved `CURRENT_EXTRACTOR` and none for a SEALED one.

### 30 · The researcher's door

`add_document` with §9's refusals — `NO_BYTES`, `UNSUPPORTED_TYPE`, `TOO_LARGE`, `NOT_SURVEYED`,
`NOT_A_DOCUMENT` for `derivedFrom`: DOC_ID, HELD, the bytes to storage, a fresh salt, the content
derived by step 29's writer or owed, an `Arrival(door = RESEARCHER)` attributed, the assertions
recorded as the caller's and verified by nothing; `existed` on a known DOC_ID, one Document with a
further Arrival. The commitment is OWED: step 31 builds what pays it, so every document this step
receives is owed by construction and every read says so. `read_document`'s HELD shape;
`list_documents`, GATED; `describe_document`, paid, on the researcher's word, appending an OPINION
to CURRENT(d); EQUALS_CAPTURE read on demand.

*Verified by:* the §9 and A4 contract green; on staging, the four fixture kinds of step 29 sent
through `add_document`, each answering `anchored: false` and the photograph `text: null`;
`NOT_SURVEYED` refused on an unsurveyed URL and the same bytes accepted after a survey of a page
with zero captures; the second send of one file answering `existed: true` with one Document row
and two Arrivals; `document-recomputable` exit 0 over them; `commitments-owed` exit 2 listing
exactly them — the debt step 31 pays.

### 31 · Standing — the anchoring module's second caller, and the pass that pays what is owed

By addition on the walk's anchoring module: a caller taking `(commitment, DOCUMENT_COMMITMENT)`;
`submit` keeps one caller and `WRITES_ALLOWED` is evaluated in the module, unchanged; the `walk`
suite green and unedited. `add_document` calls it at receipt from this step on and owes on any
failure — a receipt is never refused for the chain. `ANCHORED(d)` read from chain state on every
read, nothing stored; `check_on_chain_status` asked about a commitment answers about its entry;
`anchors-explainable` extended to both categories; `commitments-owed`. The standing pass
`forensics:anchor-documents -- --env <env>`, an operational script under `runOperationalScript`,
takes `commitments-owed`'s list, anchors each through the same caller, and reads chain state after.
It is run ON DEMAND, in the container, like every maintenance act; `get_environment` gains the
owed count beside its unanchored-snapshot count, so the debt is on the first read of every
session; §12's measurement — documents owed, and the age of the oldest — decides whether a
scheduler is ever earned, and none is built here.

*Verified by:* the caller-count scan catches a planted third caller; `anchors-explainable` exit 1
on a planted entry no document row explains, by index, then 0; in the suite, with an injected
chain client that fails, a receipt through either door completes with `anchored: false` and the
document listed as owed — the outage proven on every commit, never staged on an environment; on
staging, `commitments-owed` exit 2 over step 30's documents, the pass run, exit 0 after, and
`check_on_chain_status` on each commitment ATTRIBUTED under `DOCUMENT_COMMITMENT`.

### 32 · The public door — the receipt, the arrival, the author told

`POST /api/thesis/:thesisId/intake` with A5's body and refusals; the receipt as §5, ONE
transaction per arrival: decrypt in memory, `NAME_MISMATCH`, step 29's derivation, the one paid
read as an OPINION on the receipt version, zero the plaintext, discard the key, pin the ciphertext
to its CID, a fresh salt, step 31's commitment or its debt, the `Arrival(door = INTAKE)` with
`thesisId`, `gapId?`, `termsHash`; `NOT_PUBLISHED` and `NOT_AN_APPEAL` read from the published
version's gap decisions; the terms served and hashed by one symbol; the answer — commitments,
salts, CIDs, the terms verbatim, and nothing a model said. `aiCostLimiter` on the route: the rate
limit is set where the cost plan's phase 1 sets every other, an operational parameter, and the
paid-read count is measured from this step. `get_arrivals`, `dismiss_arrival`; ARRIVED on
`list_thesis_reviews` — the arm thesis step 24 left to this plan, by addition; `read_document`'s
SEALED shape. The door's instruments land with it: `no-plaintext-at-rest`, `no-sender-identity`'s
handler half, `one-hash-two-implementations`' browser half as the vector in the frontend suite,
`forensics:count-documents`, `forensics:arrivals-age`.

The frontend's OPEN half — the intake dialog against A5: strip, DOC_ID by WebCrypto, encrypt, the
terms, the key, salt and CID shown once, posting here — lands after this step and before step 36,
in its own change. The intake-down window of §1 closes when it lands, and §7 counts it.

*Verified by:* the §5 and A5 contract green; `no-plaintext-at-rest` observed to fail on a planted
handler that keeps a reference past a refusal; `no-sender-identity` observed to fail on a planted
read of the request's address; on staging, against a thesis published under the thesis tools, a
sealed file posted by the test client from the vector — `NAME_MISMATCH` on one altered byte, then
a receipt; `list_thesis_reviews` ARRIVED with the gap id and the count; `get_arrivals` with the
opinion labelled and no sender field in the shape; `dismiss_arrival`, then ARRIVED empty; the
paid-read count one per document.

### 33 · Citation and the argument — `#doc_`, the pin, the debate's third record

By addition at thesis step 20's parser: `#doc_<COMMITMENT>` becomes a mention of kind DOCUMENT
with name = commitment, the pin from `affirmed` where an Evidence row exists and otherwise
CURRENT(d)'s hash — the receipt version for a sealed document; T2's refusals `NOT_A_DOCUMENT`,
`AWAITING_DERIVATION` and `SHED`, one spelling each. By addition at evidence step 13's debate:
`open_debate` with `{ document: commitment }` and `DebateSession.recordCommitment`; `NOT_CITED`;
`NOTHING_TO_PROMOTE` on a sealed document whose content is its bytes; the assessor handed the
rationale, the passage and CURRENT(d)'s text or bytes, never the opinion; the verdict rule on each
assertion, UNCHECKED where the content is bytes; `promote_from_debate` creating the Evidence row
of kind DOCUMENT — the first row of the kind — with `fileHash = commitment`, `affirmed =
CURRENT(d)`'s hash, and NO chain write; `decide_gap CITED` accepting a commitment the head
mentions; ANSWERED derived. `NOT_ACQUIRED`, `CONTRADICTED` and `NARROWED` never raised for a
document — asserted by the suite, never assumed. The thesis and evidence suites green and
unedited.

*Verified by:* the §6 contract green; evidence A7's no-research-act-reaches-the-chain scan green
with `promote_from_debate` run over a document, and its citation-pins-only-`affirmed` test run
over one; on staging, one of step 30's held documents and one of step 32's sealed ones cited in a
new version, the sealed mention pinned to its AT_RECEIPT hash; `open_debate` on a sealed
photograph refused `NOTHING_TO_PROMOTE`; a SUBSTANCE round on the sealed PDF whose rationale
leans on the letterhead, that assertion recorded UNCHECKED; promotion, then `check_on_chain_status`
on the commitment unchanged from before it; `decide_gap CITED`, then `get_arrivals` showing the
arrival ANSWERED and ARRIVED empty.

### 34 · Publication — the openings, the two checks, what the public reads

`decide_opening` with `NOT_CITED`, `NOT_HELD`, `CANNOT_NARROW` and `STALE_SEQUENCE`; OPENED(d)
and PUBLIC(d) derived, never stored. By addition at thesis step 23's gate: checks 18
`DOCUMENT_OPENING_DECIDED` and 19 `DOCUMENT_QUOTES_PRESENT` over A3's predicates, each naming
the mentions it examined and reporting zero examined on a version with no `#doc_` token rather
than passing silently; `CITES_EVIDENCE` counting a DOCUMENT mention; `EVIDENCE_VERIFIED`,
`EVIDENCE_PINNED_CURRENT` and `EVIDENCE_DERIVED` binding on a DOCUMENT mention — evidence A6's
non-binding arm falls, and a test holds that a document failing VERIFIED refuses; check 17
reporting none examined. `publish_thesis` writing `PassageVerdict` per quoted span and
`documentsOpened`, the openings in force from it. The two public serves,
`GET /api/documents/:commitment/content` and `/bytes` with `{ docId, salt }` beside the file;
`resolve_record` on a commitment answering §7's block or `NOT_PUBLIC`; the SEALED notice as a
fixed field of that block, by custody; `list_findings`' `documents` register, OPENED only;
`forensics:document-openings`. The public page's rendering of a `#doc_` citation — by opening and
custody, the notice, the register on a page's timeline — is the frontend's change, after this step
and before step 36.

*Verified by:* the §7 and A6 contract green; `opinions-not-facts` extended and observed to fail on
a planted opinion field in `resolve_record`'s block; on staging, `publish_thesis` refused on
step 33's version, naming the undecided mention; `decide_opening BYTES` on the sealed document
refused `NOT_HELD`; PASSAGE for the sealed and CONTENT for the held; a quoted phrase the held
document does not contain, check 19 refusing and naming the span, the phrase corrected; published
— `PassageVerdict` rows PRESENT, and UNCHECKED for the sealed photograph's citing paragraph;
`/content` serving the held text and `/bytes` on it refused `NOT_OPENED_TO`; `resolve_record` on
the sealed commitment carrying the notice and no DOC_ID; `list_findings` on the page the held
document asserts showing it in the register; `decide_opening PASSAGE` on the held document after
CONTENT refused `CANNOT_NARROW`.

### 35 · Withdrawal and SHED

`POST /api/documents/withdraw { commitment, key }` with `NOT_A_DOCUMENT`, `NOT_SEALED`, `WRONG_KEY`
and `ALREADY_SHED`: fetch by CID, decrypt in memory, verify DOC_ID, zero, SHED(SENDER) — no
researcher, no decision. `shed_document` as SHED(OPERATOR) with a reason. SHED defined once: null
the bytes, every version's text and every opinion, release the platform's pin, write the `Shed`
row, remove nothing; FLAGGED's third arm on `list_thesis_reviews` with its text by cause;
`EVIDENCE_DERIVED` failing and naming SHED; `read_document`'s NONE shape; `/content` and `/bytes`
refusing `SHED`; T2 refusing `SHED`; `PassageVerdict` kept as observed;
`forensics:document-openings` gaining SHED by cause. The withdrawal dialog — commitment and key,
nothing else asked — is the frontend's change, after this step and before step 36.

*Verified by:* the §8 and A5 contract green; the row-count test — Document, Arrival, versions,
decisions, mentions and PassageVerdict rows equal before and after SHED, the three columns null,
the injected pinning client's release observed once; `no-plaintext-at-rest` covering the
withdrawal handler and observed to fail on a planted reference; on staging, the sealed document
withdrawn with its key after `WRONG_KEY` on an altered one, then `list_thesis_reviews` FLAGGED on
the published mention with the date, `read_document` NONE with hashes only, `/content` refusing
`SHED`, `resolve_record`'s block carrying the flag and the kept verdicts; `shed_document` on a
held document with a reason, then `get_arrivals` still listing its arrival.

### 36 · THE DOCUMENT SWITCH — the researcher's word

Two preconditions, both frontend changes landed before this commit and named in §7: the HIDE half
of §1 — the gap modal and the `/submit` page withdrawn — landed with step 11; and the OPEN half —
the intake dialog after step 32, the public page's rendering of a `#doc_` citation after step 34,
the withdrawal dialog after step 35, and the `/safety` copy rewritten to what §2, §4, §5 and §8
build, landed with the intake dialog. This is the step at which every promise on that page is
true, because the contact column goes here.

One commit. Removed: the model-only halves the five writers left behind — `POST /api/evidence/intake`,
`/recover-intake`, `POST /api/thesis/:id/gaps/:gapIndex/whistleblower/preview` — and `/contact`;
every `/api/evidence` read that still serves a DOCUMENT row's file, CID or model prose, whatever
evidence step 16 left of them; `IntakeAgent`, `EphemeralAnalysisService`, `encryptContact` with
`PII_SECRET_KEY`, `persistScreenshotEvidence`'s remains; `Evidence.fileUrl`,
`additionalScreenshotUrls`, `ipfsCid`, `intakeVersion`; `Whistleblower`; `CaptureProvenance`'s
`DIRECT` and `ASSERTED`, leaving `WAYBACK` — a migration read before commit, on a database that
holds nothing they describe, and the reading is measured: the row count of `Whistleblower` and
the non-null count of each of the four columns, read on staging before the PR opens, all zero.
Every RETIRE file of §5 not already gone at step 11 goes with its code. The `document` jest
project joins the required run. `mcpToolClassification`'s expected set, moved at each step that
registered a tool, is asserted here to equal A4's surface exactly, with neither retired tool's
name in it. The retired-names scan extended with A4's two tools and A5's routes, green with its
decoy. The tutorial's COMMON_RULES re-read against A4, as at step 25 — the rewrite itself is the
tutorial's own change. `get_environment`'s counts checked to name no removed table.

*Verified by:* every KEEP file unchanged since step 27; every RETIRE file gone; `npm test` green
from the backend directory with `document` in the required run; the retired-names scan's decoy
caught; the intake dialog, the page and the withdrawal dialog each exercised once against staging
after the deploy, from a browser, with the response in the step's dated doc.

### 37 · The first document through each door — the researcher's act

Not a step's: on staging, the day of `docs/gf-researcher-day.md` walked under the new tools with
a document at every door — a held FOIA answer and a capture of a blocked page through
`add_document`; a sealed submission answering a published call, sent from the real dialog with the
terms accepted; both cited, argued, an opening decided for each, published, the sealed one
withdrawn with its key and the flag read on the author's list, one arrival dismissed with a
reason — with the transcript, the literal commands and the responses received, in a dated doc.
The four measurements of §12 run once into the same doc. Then production, at SHIP, with step 27's
chain read taken on production first and recorded, and the same walk on production being the
researcher's.

*Verified by:* `audit-documents`, `anchors-explainable` and `commitments-owed` each observed to
fail on a deliberately broken fixture before going green on the received documents;
`audit-theses` green with a version that cites a document; the transcript in the dated doc, and
`get_environment` on staging reporting no document owed.

## 4. THE TEST RULES

The refactor plan's §4, every rule, no exception; the sibling suites' scans, unchanged and
unedited. What this layer holds that no sibling does, each a scan or a test in the `document`
project, written red at step 27 and binding from the step named; each scan carries a decoy, and a
scan that matches nothing is the vacuity this repository has paid for.

| scan or test | holds from | what breaks it |
|---|---|---|
| the caller-count scan, its unit stated: the registry's `submit` has one caller, the anchoring module; the module has exactly two, the walk's anchoring on ACQUIRED and one document-anchoring function; that function has exactly three callers — the intake receipt, `add_document`, the standing pass — each named | step 31 | a second caller of `submit`, a third of the module, a fourth of the function, or an unnamed one; the decoy plants a fourth |
| `no-plaintext-at-rest` — a source scan, no write path under `src/` stores the decrypted bytes of an INTAKE arrival; and a test, the plaintext buffer is zeroed on every exit path of the receipt, refusals included | step 32; the withdrawal handler from step 35 | a handler that keeps a reference past a refusal; a write of plaintext to storage or to a row; the decoy is a planted handler that returns before zeroing |
| `no-sender-identity` — a schema scan, `Arrival` and `Document` have no column for an address, an account, a name or a contact; and a handler scan, the intake and withdrawal handlers read no request address into any write | the schema half from step 28, `Whistleblower`'s absence added at step 36; the handler half from step 32 | a planted column in a fixture schema; a planted read of the request's address in a handler |
| `verdict-rule-one-spelling` — a source scan: one importable symbol computes PRESENT · ABSENT · UNCHECKED, and `PassageVerdict`, the framing assessor's audit and the critic's audit call it | step 29 — the first caller with null text; the symbol is thesis step 19's | a second spelling anywhere under `src/`; the decoy is a planted local function returning the three values |
| the browser/server hash vector — a test in both suites: the browser's WebCrypto SHA-256 over the stripped bytes and the server's over the decrypted bytes agree on one vector, and `NAME_MISMATCH` fires when one byte is altered | the server half from step 29; the browser half from step 32, in the frontend suite | either implementation drifting — a normalisation, a prefix, a different encoding of the stripped bytes |
| SHED removes content and no row — a source scan from step 28, no `delete` on `Document`, `Arrival`, `ArrivalDocument`, `ArrivalDecision`, `DocumentContentVersion`, `DocumentOpeningDecision`, `PassageVerdict` or `Shed` outside the rebuild's cleanup; and a test from step 35, the row count of each of those tables and of `ThesisMention` and `Evidence` equal before and after SHED, bytes, text and opinion null, the pin released exactly once | the scan from step 28; the test from step 35 | a delete on any of those tables; a SHED that leaves text or an opinion; a re-derivation after SHED; a second release of the pin |

Assertions that survive a retired file move as assertions about the new contract and are tagged
in §5, not here.

## 5. THE TEST INVENTORY — WHAT EACH FILE ASSERTS, AND WHAT BECOMES OF IT

Tags as the thesis plan's §5, with one added: **RETIRE-AT-11** is deleted with its writer at
refactor step 11, and a RETIRE-AT-11 file still present after step 11 is a defect in step 11.
**KEEP** untouched and green throughout; a registry test whose expected set moves is KEEP, as
`mcpToolClassification` is. **MOVE** carries a group to a new file as assertions about the new
contract. **RETIRE** is deleted with its code at step 36. Counted from the tree on 2026-09-04:

```
cd apps/glass-fortress/backend && grep -rliE 'whistleblower|IntakeAgent|createEvidenceFromText|recoverEvidenceFromScreenshot|persistScreenshotEvidence|EphemeralAnalysis|encryptContact|PII_SECRET_KEY|ipfsCid|additionalScreenshotUrls|intakeVersion|EvidenceCapture|CaptureProvenance|recover-intake|recover-confirm|/contact' test | xargs wc -l
```

Twenty-four files, 7,789 lines. Every one is below; the last group is not this plan's and says so.

| test file | lines | tag | what it holds |
|---|---|---|---|
| `persistScreenshotEvidence` | 257 | RETIRE-AT-11 | the screenshot writer: the concatenated name, `fileUrl` and `additionalScreenshotUrls`, `PENDING_REVIEW` |
| `recoverEvidenceFromScreenshot` | 211 | RETIRE-AT-11 | the tool over that writer: ten images, `failedUrl`, `failureReason` |
| `evidenceRecoverRoutes` | 303 | RETIRE-AT-11 the `/recover-confirm` group; RETIRE the `/recover-intake` group | the public screenshot route's two halves, writer and model-only. The RETIRE group must still load at step 11: the writer's imports and mocks go with its group, the model-only group's stay, or step 11 goes red on a file it did not mean to touch |
| `evidenceConfirmPromotionGate` | 217 | RETIRE-AT-11 | `/confirm` refusing a contradicted diff; the assertion moves to evidence step 13, where `open_debate` refuses `CONTRADICTED` |
| `intakeVersion` | 88 | RETIRE-AT-11 | the prompt-hash stamp through the writers' shapers |
| `evidenceIdentityDrift` | 98 | KEEP one group, RETIRE-AT-11 one group | one Readability construction stays, the corpus's; "the url+text hash only through the shared function" goes with `create_evidence_from_text` — the as-built §8's KEEP tag moves. The KEEP group must still load at step 11: only the retired group's imports go |
| `writeAuthorization` | 244 | KEEP | the route allow-list; its entries for `/confirm`, `/recover-confirm` and the gap route go at step 11, for `/intake`, `/recover-intake`, `/preview` and `/contact` at step 36 |
| `diffPromotionGate` | 166 | KEEP | the promotion-site scan; its `createEvidenceFromText.ts` entry goes at step 11 |
| `IntakeAgent` | 949 | RETIRE | the classifier: the output schema, `analyzeEvidence`, `analyzeText`, `analyzeMultiImageEvidence`, `EVIDENCE_TIER`; also `create_evidence_from_url`'s classifier until evidence step 16 |
| `contact` | 113 | RETIRE | `encryptContact` and `decryptContact` round-trip, `PII_SECRET_KEY` required |
| `investigativeCategories` | 87 | RETIRE the `IntakeAgent` group | the taxonomy shared by two classifying agents; the other agent's group is not this plan's |
| `tierRubricConsistency` | 47 | RETIRE | the intake prompt's tier rubric read as text; the tier left the row at step 11 |
| `directProvenanceUnused` | 91 | KEEP until step 36, then RETIRE | "`DIRECT` has no writer", with its own decoy; subsumed at step 36 by the retired-names scan holding `DIRECT` and `ASSERTED` absent — the as-built §8's KEEP tag moves |
| `mcpIntegration` | 526 | KEEP two groups per the as-built §8; MOVE them at step 36 | write-tool auth and evidence creation; the file mocks `IntakeAgent` by path, and a KEEP file that mocks a module step 36 deletes cannot stay green unedited — the two groups move to a file without the mock, and the pointer moves |
| `evidenceCapture` · `extraction/analysisTextDepth` · `extraction/evidenceCaptureStability` | 72 · 70 · 85 | RETIRE — evidence step 11's | `EvidenceCapture` and the url+text identity are on evidence A2's REMOVED list |
| `deleteEvidence` | 142 | RETIRE — evidence step 16's | `delete_evidence`, retired by evidence §6 |
| `keyFigures` | 130 | RETIRE — thesis step 25's | mocks `IntakeAgent` and `encrypt` by path; gone before step 36 |
| `mcpTools` | 1941 | the thesis plan's, group by group | mocks `IntakeAgent` by path for `create_evidence_from_url`; the old file goes at step 25, before step 36 |
| `extraction/recordCapture` | 499 | the corpus's; unaffected | writes `WAYBACK` only; the narrowing at step 36 removes values it never names |
| `getWhistleblowerCall` · `claimTrajectory` · `mcpRoutes` | 218 · 858 · 377 | the thesis plan's | match by the tool's own name or a comment only |

The frontend's tests of `WhistleblowerModal`, `documentVault` and the `/submit` page are the
frontend's two changes' to tag, and the shared vector of step 32 is the one file this plan puts
in that suite.

## 6. VERIFICATION — WHAT "VERIFIED" MEANS AT EACH STEP

As the refactor plan's §6: a step is verified by its contract file green, its scan's decoy caught,
and — for steps 30 to 35 and 37 — a staging exercise in the chat, with the literal commands and the
responses received in a dated doc. Three things this layer adds:

- **The chain read.** Step 27 reads the rotation from the chain and records it; every later step
  inherits the record and none runs without one; SHIP takes the same read on production first.
  The plan's order is never the evidence that the registry is the new one.
- **The instruments are red first.** `document-recomputable` at step 28, `commitments-owed` at
  step 30, the caller-count scan and `anchors-explainable` extended at step 31, `verdict-rule-one-spelling`
  and the vector's server half at step 29, `no-plaintext-at-rest`, `no-sender-identity` and the
  vector's browser half at step 32, `opinions-not-facts` extended at step 34, the row-count test at
  step 35 — each observed to fail on a planted case before it counts, and the failure in the step's
  dated doc.
- **The row counts are read on staging, by command.** Step 30's owed list and step 31's paid
  list; step 36's zero counts of `Whistleblower` and the four columns; step 37's `get_environment`
  with no document owed. A number in a dated doc is produced on that day, never carried forward.

The integrity board gains this layer's entry at step 31, colour from this plan, bar from
`audit-documents`, and reads its computed proof from then on.

## 7. DEFINITION OF DONE

- the `document` acceptance suite is green, every file, and in the required run;
- every RETIRE-AT-11 file was gone at step 11 and every RETIRE file is gone at step 36; every
  KEEP file is unchanged since step 27, and the two MOVE'd groups are green in their new file;
- the caller-count scan, `no-plaintext-at-rest`, `no-sender-identity`, `verdict-rule-one-spelling`
  and the retired-names scan are green with their decoys; the vector is green in both suites;
- the MCP surface is exactly A4's, and `mcpToolClassification` agrees;
- the schema holds none of A2's REMOVED list — `db:check-drift` clean after step 36's migration —
  and the rows those columns described were measured zero on staging before it;
- both frontend halves landed: the HIDE half with step 11; the OPEN half's three changes and the
  `/safety` copy before step 36, each exercised from a browser against staging with its response
  in a dated doc;
- the dated docs exist: step 27's chain read, step 29's extractor coverage, the staging
  transcripts of steps 30 to 35, step 36's counts and browser exercise, step 37's walk with the
  four measurements of §12;
- `audit-documents`, `anchors-explainable` and `commitments-owed` have each been observed to
  fail before going green on staging, and `get_environment` there reports no document owed;
- the four thesis-plan sentences, the refactor plan's step-11 pointer and the as-built §8's
  three moved tags are in git.

Production is not part of done. `SHIP` is the researcher's, with step 27's read taken there first.

## 8. HAZARDS, NAMED

- **The intake-down window.** From step 11 until the intake dialog lands after step 32, the
  public page's appeals point at a door that is not there. The HIDE half lands with step 11 and
  the OPEN half after step 32; a `SHIP` inside the window ships the gap. Checked at SHIP: the
  deployed frontend's door state matches the deployed backend's routes.
- **The `/contact` window.** From the `/safety` copy landing, with the intake dialog, until step
  36, `/contact` exists with nothing reaching it — "no identity stored" is true in fact, and the
  capability goes at step 36. Named so the route is not read as the page's contradiction, and so
  step 36 is not skipped as cosmetic.
- **Mock by path.** A KEEP or MOVE file whose `jest.mock` targets a module step 36 deletes throws
  at load. Before step 36's commit, for each module on the removal list: `grep -rn "jest.mock(" test`
  filtered to that module, counting only KEEP and MOVE files. Eight files mock those modules
  today; five are RETIRE-AT-11 or RETIRE and go with the module, and a check that fires on its
  own deletions is ignored. Today's count is one, `mcpIntegration`, hence its MOVE.
- **The five-writer expectation at step 11.** §1 expects the five writers to stop compiling when
  step 11 lands the target schema. Step 11's build verifies it; if a writer still compiles — a
  column it writes survived, or it writes fewer than it reads — it is RETIRE-AT-11 by ruling and
  is deleted regardless. §5's tags do not depend on the expectation.
- **A seam that turned out to be a sibling's.** Twice while this plan was written an arm was
  assigned to it that R12's amendments had already given a sibling's step: the verdict rule's
  UNCHECKED (thesis 19) and the record key's third arm (evidence 11). The principle, ruled: an
  amendment a sibling step can build without this plan's tables, the sibling builds; one that
  needs a table this plan creates, this plan builds, and the sibling's step says so in one
  sentence. The next plan reads the amended contract before it counts its arms.
- **Step 11's pointer.** Refactor plan step 11 points at this plan's §5, or the writers survive
  step 11 and "clean ground" is false. The pointer is in this PR.
- **The first standing pass.** No other anchoring in the target is deferred. A document owed is a
  state `get_environment` shows, paid by a hand in the container, until §12's measurement says an
  outage at receipt is common enough to earn a scheduler.
- **The extractor is a dependency.** Chosen at step 29, judged by coverage. An OCR engine that
  reads no Hebrew turns every scan into bytes-only content and every assertion about it UNCHECKED;
  the measurement says so, and a citation resting on an image is the design's stated cost, not a
  defect to hide.
- **Two public writes, unauthenticated, one paid.** The rate limit is an operational parameter;
  the paid-read count and `commitments-owed` are measured from steps 32 and 31. The cost plan's
  concern is watched here, not closed.
- The refactor plan's §8 — the `railway ssh` pipe, the destructive-DB guard on prose, the two lint
  ratchets, migrations self-applying — unchanged, binding here.
