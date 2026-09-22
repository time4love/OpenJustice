import type {
  ArrivalDoor,
  DocumentDerivedFrom,
  DocumentOpening,
  PassageVerdictValue,
  ShedCause,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// THE DOCUMENT CONTRACT, TRANSCRIBED FOR THE ACCEPTANCE SUITE — docs/gf-document-flows.md
// A1-A7, composed with the factual layer's A1-A8, evidence's A1-A7 and the thesis's
// A1-A7, and restating none of them.
//
// WHY THE ROWS ARE NOT PRISMA'S HERE, where the thesis contract's are. Document step
// 28 has not landed, so `Document`, `Arrival`, `DocumentContentVersion`, `Shed` and the
// rest do not exist in `@prisma/client`. A type imported from an absent model would sink
// this file with a TS2307 and take all nineteen test files with it — the exact failure
// test/thesis/absent.ts was written against. So A2's rows are transcribed below as the
// SPEC, and step 28 replaces each transcription with the generated model, as thesis
// step 18 did for its own.
//
// ONE VALUE, ONE PLACE. A module path, a tool's refusal set and a check id each live here
// once; the builder step that renames a path or amends a code edits one line.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// A2 — THE ROWS. PRISMA'S SINCE STEP 28, as the thesis contract's became Prisma's
// at thesis step 18 (`test/thesis/contract.ts` :21-:25).
//
// UNTIL STEP 28 THEY WERE TRANSCRIBED HERE, and the header above says why: a type
// imported from an absent model is a file-level TS2307 that would have sunk all
// nineteen files. Step 28 landed A2's eight models, so the transcription's whole
// reason expired and each is replaced by the GENERATED model — which is stronger
// than a transcription in the one way that matters: a column renamed or dropped in
// a later migration now breaks this file at COMPILE TIME, where a transcription
// would have gone on agreeing with a schema that had moved.
//
// WHAT IS STILL DECLARED HERE is the SPEC SIDE — the closed refusal sets, the check
// ids, the module every case loads and the step that owes it. Those are the design's
// words and are not the schema's to supply.
// ---------------------------------------------------------------------------

export type {
  Arrival as ArrivalRow,
  ArrivalDecision as ArrivalDecisionRow,
  ArrivalDocument as ArrivalDocumentRow,
  Document as DocumentRow,
  DocumentContentVersion as DocumentContentVersionRow,
  DocumentOpeningDecision as DocumentOpeningDecisionRow,
  PassageVerdict as PassageVerdictRow,
  Shed as ShedRow,
} from '@prisma/client';

/**
 * HELD iff bytes present · SEALED iff cid present and bytes absent · NONE iff a Shed
 * row exists (A2 :1274-:1275). DERIVED, and deliberately NOT a column — so it is not
 * a Prisma enum and never will be.
 */
export type Custody = 'HELD' | 'SEALED' | 'NONE';

/** A2 :1301 — whether the bytes were at rest when the version was derived. */
export type DerivedFrom = DocumentDerivedFrom;

/** A2 :1279 — the door is the one thing the platform verifies (§1 :74-:88). */
export type Door = ArrivalDoor;

/** §7 :777-:789, ordered: PASSAGE < CONTENT < BYTES. The order IS the widening rule (§7 :797). */
export type Opening = DocumentOpening;

/** A2 :1321 — SENDER is the key holder's act, OPERATOR a researcher's with a reason. */
export type { ShedCause };

/** A3 :1385-:1386 — the verdict rule's three values; UNCHECKED is this document's amendment to thesis T1. */
export type Verdict = PassageVerdictValue;

// ---------------------------------------------------------------------------
// THE MODULES THE SUITE LOADS, AND THE STEP THAT OWES EACH EXPORT.
//
// A path here is the specifier `built()` computes; the loader turns a miss into
// "not built — document step N builds it" and lets every other error through.
//
// TWO PATHS ALREADY EXIST AND ARE STILL LISTED, deliberately: `lib/anchoredCaptureHash`
// holds ANCHOR_SCHEME today and gains DOCUMENT_COMMITMENT "beside" it (A1 :1245-:1246),
// and `services/anchorSnapshots` is the anchoring module that gains step 31's second
// caller. For those the loader's MODULE_NOT_FOUND arm never fires and the case fails on
// the missing EXPORT NAME instead — which is what test/thesis/absent.ts :20-:22 promises,
// and is why a stub planted at the right path cannot turn a case green by existing.
// ---------------------------------------------------------------------------

export interface ExportContract {
  step: number;
  kind: 'function' | 'value' | 'table';
}

const fn = (step: number): ExportContract => ({ step, kind: 'function' });
const value = (step: number): ExportContract => ({ step, kind: 'value' });
/**
 * An OBJECT export. The loader classifies `typeof x === 'object' && x !== null` as a
 * TABLE, so a vector, a map or a frozen record is this kind and never `value`.
 *
 * CORRECTED, R74 chunk 3 part (a). `HASH_VECTOR` was declared `value(29)` and A1
 * :1254-:1257 describes an OBJECT — the bytes AND the digest they must hash to, which
 * `identity.test.ts` :81-:86 destructures as `.bytes` and `.docId`. The module was
 * therefore UNLOADABLE by construction: every one of that file's nine cases failed with
 * "exports HASH_VECTOR as a table, not as a value", and no correct implementation could
 * have satisfied it — a primitive vector cannot carry both halves.
 */
const table = (step: number): ExportContract => ({ step, kind: 'table' });

export const MODULES = {
  // A1 :1230-:1252 — one importable symbol each over the server's SHA-256, with the
  // shared test vector beside them for the browser's half (plan step 29 :153-:154).
  'lib/documentIdentity': {
    step: 29,
    exports: {
      docId: fn(29),
      commitment: fn(29),
      contentVersionHashOf: fn(29),
      HASH_VECTOR: table(29),
    },
  },
  // A1 :1247-:1248 — one constant naming the extractor AND its version; the PDF reader,
  // the spreadsheet serialiser and the OCR engine are its parts. The VALUE is step 29's
  // dependency choice, judged by `extractor-coverage` and by nothing the plan says.
  'lib/documentExtractor': {
    step: 29,
    exports: { CURRENT_EXTRACTOR: value(29), extract: fn(29) },
  },
  // A1 :1245-:1246 — DOCUMENT_COMMITMENT beside ANCHOR_SCHEME, which this module already holds.
  'lib/anchoredCaptureHash': {
    step: 28,
    exports: { DOCUMENT_COMMITMENT: value(28) },
  },
  // A3 :1358-:1387 — every predicate, as a pure function over rows.
  'services/documentPredicates': {
    step: 29,
    exports: {
      custody: fn(29),
      recomputable: fn(29),
      recomputableEvidence: fn(29),
      currentVersion: fn(29),
      verdict: fn(29),
      anchored: fn(31),
      verified: fn(31),
      equalsCapture: fn(30),
      answered: fn(32),
      arrived: fn(32),
      opened: fn(34),
      publicDocument: fn(34),
      shed: fn(35),
      flagged: fn(35),
    },
  },
  // A4 :1404-:1411 — the researcher's door.
  'services/addDocument': { step: 30, exports: { addDocument: fn(30) } },
  // A4 :1424-:1435 — the two GATED reads; `uploadUrl` rides both envelopes (:1428, :1434).
  'services/readDocument': { step: 30, exports: { readDocument: fn(30), listDocuments: fn(30) } },
  // A4 :1437-:1441 — PAID, on the researcher's word.
  'services/describeDocument': { step: 30, exports: { describeDocument: fn(30) } },
  // ui :1129 — the dialog's OWN router, behind requireResearcher INSIDE it, mounted beside
  // /api/article-rules. One POST minting a signed upload URL; the dialog's CACHE act.
  'routes/documentUploadRoutes': { step: 30, exports: { documentUploadRouter: value(30) } },
  // §9 :998 — an object no row names is swept after a lifetime; an operational parameter.
  'services/sweepUnclaimedObjects': { step: 30, exports: { sweepUnclaimedObjects: fn(30) } },
  // §4 :444-:450 — the standing pass that pays what receipt owed. Step 31's.
  'services/anchorDocuments': { step: 31, exports: { anchorDocuments: fn(31) } },
  // The anchoring module itself: step 31 adds a SECOND CALLER to it, taking
  // (commitment, DOCUMENT_COMMITMENT). `submit` keeps its one caller (A7 :1600-:1602).
  'services/anchorSnapshots': { step: 31, exports: { anchorDocumentCommitment: fn(31) } },
  // A4 :1413-:1422 — the public door's reads. Step 32, OUT of this round.
  'services/getArrivals': { step: 32, exports: { getArrivals: fn(32), dismissArrival: fn(32) } },
  // A4 :1443-:1446 — the opening, in force from the next publish_thesis.
  'services/decideOpening': { step: 34, exports: { decideOpening: fn(34) } },
  // A4 :1448-:1450 — OPERATOR's SHED, attributed, with a reason. Step 35, OUT of this round.
  'services/shedDocument': { step: 35, exports: { shedDocument: fn(35) } },
} as const satisfies Record<string, { step: number; exports: Record<string, ExportContract> }>;

export type ModulePath = keyof typeof MODULES;

// ---------------------------------------------------------------------------
// A4 — THE CLOSED REFUSAL SETS. A code is here once, and a case names it from here.
//
// EVERY SET IS CLOSED: the suite asserts that a tool refuses EXACTLY these and no
// more, because a refusal the design does not name is a refusal nobody ruled.
// ---------------------------------------------------------------------------

/**
 * A4 :1410-:1411 plus the two 2026-09-22 rulings: the argument is `docId` OR `text`,
 * exactly one (:1404), and `title` is REQUIRED with `NO_TITLE` refused (:1404, A2 :1271).
 *
 * `NO_BYTES` covers a `docId` naming no object, and `NAME_MISMATCH` fires when the
 * object's bytes do not hash to it — so neither is about a `bytes` argument, which the
 * tool no longer takes. The 20 MB JSON limit is IRRELEVANT here and `TOO_LARGE` is read
 * from the object's own size.
 */
export const ADD_DOCUMENT_REFUSALS = [
  'NO_RESEARCHER',
  'NO_BYTES',
  'NO_TITLE',
  'UNSUPPORTED_TYPE',
  'TOO_LARGE',
  'NOT_SURVEYED',
  'NOT_A_DOCUMENT',
  'NAME_MISMATCH',
] as const;

/** A4 :1430 — a name that resolves to none is NOT_A_DOCUMENT, and that is the whole set. */
export const READ_DOCUMENT_REFUSALS = ['NO_RESEARCHER', 'NOT_A_DOCUMENT'] as const;

/** A4 :1435 — refuses NOT_SURVEYED when `url` is given and unknown, and nothing else. */
export const LIST_DOCUMENTS_REFUSALS = ['NO_RESEARCHER', 'NOT_SURVEYED'] as const;

/** A4 :1440-:1441 — PAID; a sealed document was read once, at receipt. */
export const DESCRIBE_DOCUMENT_REFUSALS = [
  'NO_RESEARCHER',
  'NOT_A_DOCUMENT',
  'NOT_HELD',
  'AWAITING_DERIVATION',
] as const;

/** A4 :1416 — a thesisId naming none. */
export const GET_ARRIVALS_REFUSALS = ['NO_RESEARCHER', 'NO_THESIS'] as const;

/** A4 :1421-:1422 — ANSWERED means a document of it is cited; there is nothing to dismiss. */
export const DISMISS_ARRIVAL_REFUSALS = [
  'NO_RESEARCHER',
  'NOT_AUTHOR',
  'NO_SUCH_ARRIVAL',
  'ANSWERED',
  'REASON_REQUIRED',
  'STALE_SEQUENCE',
] as const;

/** A4 :1445-:1446 — NOT_HELD is BYTES on a sealed document; CANNOT_NARROW is below OPENED(d). */
export const DECIDE_OPENING_REFUSALS = [
  'NO_RESEARCHER',
  'NOT_AUTHOR',
  'NOT_CITED',
  'NOT_HELD',
  'CANNOT_NARROW',
  'STALE_SEQUENCE',
] as const;

/** A4 :1450. */
export const SHED_DOCUMENT_REFUSALS = [
  'NO_RESEARCHER',
  'NOT_A_DOCUMENT',
  'ALREADY_SHED',
  'REASON_REQUIRED',
] as const;

/**
 * §6 :723-:725 and A4 :1457 — the three that are NEVER RAISED for a document.
 * "asserted by the suite, never assumed" (plan step 33 :253-:254).
 */
export const NEVER_RAISED_FOR_A_DOCUMENT = ['NOT_ACQUIRED', 'CONTRADICTED', 'NARROWED'] as const;

/** A5 :1492-:1494 — the intake receipt, each per file where it is a file's. Step 32. */
export const INTAKE_ROUTE_REFUSALS = [
  'NOT_PUBLISHED',
  'NOT_AN_APPEAL',
  'TERMS_NOT_ACCEPTED',
  'NO_DOCUMENT',
  'UNSUPPORTED_TYPE',
  'TOO_LARGE',
  'UNREADABLE',
  'NAME_MISMATCH',
] as const;

/** A5 :1502 — the withdrawal door. Step 35. */
export const WITHDRAW_ROUTE_REFUSALS = [
  'NOT_A_DOCUMENT',
  'NOT_SEALED',
  'WRONG_KEY',
  'ALREADY_SHED',
] as const;

/** A5 :1506 — the content serve. */
export const CONTENT_SERVE_REFUSALS = ['NOT_PUBLIC', 'NOT_OPENED_TO', 'SHED'] as const;

/** A5 :1511 — the bytes serve; NOT_HELD because a sealed document has no bytes anywhere. */
export const BYTES_SERVE_REFUSALS = ['NOT_PUBLIC', 'NOT_OPENED_TO', 'NOT_HELD', 'SHED'] as const;

// ---------------------------------------------------------------------------
// A6 — THE CHECKS, BY ID. Two added, three that now BIND, one amended, one with no subject.
// ---------------------------------------------------------------------------

/** thesis A6 :1592-:1602's numbering — 18 and 19 are this design's (A6 :1535-:1536). */
export const DOCUMENT_CHECK_IDS = {
  DOCUMENT_OPENING_DECIDED: 18,
  DOCUMENT_QUOTES_PRESENT: 19,
} as const;

/**
 * A6 :1529-:1531 — evidence A6's NON-BINDING ARM FALLS. Each of these binds on a DOCUMENT
 * mention exactly as on a capture's, because §4 and §3 now define what each reads.
 */
export const CHECKS_THAT_NOW_BIND = [
  'EVIDENCE_VERIFIED',
  'EVIDENCE_PINNED_CURRENT',
  'EVIDENCE_DERIVED',
] as const;

/** A6 :1533 — judges DIFF records only; for a DOCUMENT mention it reports it examined NONE. */
export const CHECK_WITH_NO_SUBJECT = 'EVIDENCE_DIFF_INPUT_SOUND' as const;

// ---------------------------------------------------------------------------
// A7 — THE INSTRUMENTS, AND THE STEP EACH BINDS FROM.
// ---------------------------------------------------------------------------

export const INSTRUMENTS = {
  'document-recomputable': 28,
  'no-sender-identity': 28,
  'verdict-rule-one-spelling': 29,
  'one-hash-two-implementations': 29,
  'commitments-owed': 30,
  'caller-count': 31,
  'anchors-explainable': 31,
  'no-plaintext-at-rest': 32,
  'opinions-not-facts': 34,
  'retired-names': 34,
} as const;

/** §9 :1074-:1085 and A4 :1476-:1477 — retired by this design, replaced by `add_document`. */
export const RETIRED_DOCUMENT_NAMES = [
  'create_evidence_from_text',
  'recover_evidence_from_screenshot',
] as const;

// ---------------------------------------------------------------------------
// `no-sender-identity`, THE SCHEMA HALF — ONE VALUE, ONE PLACE.
//
// A7 :1567-:1569: "Arrival and Document have no column for an address, an account, a name
// or a contact; the intake and withdrawal handlers read no request address into any write;
// Whistleblower absent." Plan §4 :410 SPLITS that clause across three steps: "the schema
// half from step 28, `Whistleblower`'s absence added at STEP 36; the handler half from
// step 32."
//
// CORRECTED, R74 chunk 3. `scans.test.ts` and `invariants.test.ts` each carried their OWN
// banned list — they disagreed with each other — and each scanned the WHOLE schema text
// rather than the two models A7 names. Two consequences, both defects:
//   · `Whistleblower.encryptedContact` (`schema.prisma` :434) is LIVE until step 36 by the
//     amended step-28 body (plan :141, "Nothing is removed here"), so both cases failed at
//     step 29 for a reason STEP 36 owns;
//   · `invariants.test.ts` also banned the word `plaintext`, which occurs at `schema.prisma`
//     :28 in a comment about the MCP BEARER TOKEN — so that case could never pass, in any
//     step. `no-plaintext-at-rest` is a SOURCE scan over `src/` write paths (A7 :1562-:1565),
//     never a schema one.
// The subject is the two MODELS; `Whistleblower` is step 36's and is named there, not here.
// ---------------------------------------------------------------------------

/** The two models A7 :1567 names — the schema half's whole subject at step 28. */
export const NO_SENDER_IDENTITY_MODELS = ['Arrival', 'Document'] as const;

/**
 * A column for an address, an account, a name or a contact — the four shapes A7 :1567 forbids,
 * spelled as the column names a well-meaning implementation would reach for.
 */
export const NO_SENDER_IDENTITY_COLUMNS = [
  'senderIp',
  'ipAddress',
  'remoteAddress',
  'userAgent',
  'accountId',
  'senderName',
  'senderEmail',
  'contactEmail',
  'encryptedContact',
  'senderKey',
] as const;
