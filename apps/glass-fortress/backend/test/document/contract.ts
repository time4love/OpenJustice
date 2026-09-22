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
// A2 — THE ROWS, AS THE TARGET SHAPES THEM. Transcribed until step 28.
// ---------------------------------------------------------------------------

/** HELD iff bytes present · SEALED iff cid present and bytes absent · NONE iff a Shed row exists (A2 :1274-:1275). */
export type Custody = 'HELD' | 'SEALED' | 'NONE';

/** A2 :1301 — whether the bytes were at rest when the version was derived. */
export type DerivedFrom = 'AT_RECEIPT' | 'HELD_BYTES';

/** A2 :1279 — the door is the one thing the platform verifies (§1 :74-:88). */
export type Door = 'INTAKE' | 'RESEARCHER';

/** §7 :777-:789, ordered: PASSAGE < CONTENT < BYTES. The order IS the widening rule (§7 :797). */
export type Opening = 'PASSAGE' | 'CONTENT' | 'BYTES';

/** A2 :1321 — SENDER is the key holder's act, OPERATOR a researcher's with a reason. */
export type ShedCause = 'SENDER' | 'OPERATOR';

/** A3 :1385-:1386 — the verdict rule's three values; UNCHECKED is this document's amendment to thesis T1. */
export type Verdict = 'PRESENT' | 'ABSENT' | 'UNCHECKED';

/**
 * A2 :1262-:1276. `custody` is DERIVED and is deliberately absent as a column.
 * `title` is the FOURTH assertion, RULED 2026-09-22 at :1271 — REQUIRED at the
 * researcher's door, absent on a sealed arrival at receipt (step 32's question),
 * so the column is nullable and `NO_TITLE` binds at the RESEARCHER door alone.
 */
export interface DocumentRow {
  docId: string;
  commitment: string;
  salt: Uint8Array;
  cid: string | null;
  bytes: string | null;
  mimeType: string;
  byteLength: number;
  receivedAt: Date;
  verifiedAtReceipt: Date | null;
  assertedUrl: string | null;
  assertedAt: Date | null;
  derivedFromCommitment: string | null;
  title: string | null;
}

/** A2 :1278-:1288. The CHECKs are the invariants, not conventions. */
export interface ArrivalRow {
  id: string;
  door: Door;
  thesisId: string | null;
  gapId: string | null;
  researcherId: string | null;
  termsHash: string | null;
  receivedAt: Date;
}

/** A2 :1286 — the grouping; several files in one arrival are several documents (§2 :188-:194). */
export interface ArrivalDocumentRow {
  arrivalId: string;
  commitment: string;
}

/** A2 :1290-:1294. DISMISSED is the one value; ANSWERED is derived (A3 :1375). */
export interface ArrivalDecisionRow {
  id: string;
  arrivalId: string;
  sequence: number;
  decision: 'DISMISSED';
  reason: string;
  researcherId: string;
  createdAt: Date;
}

/** A2 :1296-:1305. `text` and `opinion` are NULLED by SHED; the row, its hash and its provenance stay. */
export interface DocumentContentVersionRow {
  id: string;
  commitment: string;
  text: string | null;
  contentVersionHash: string;
  extractor: string;
  extractorVersion: string;
  derivedAt: Date;
  derivedFrom: DerivedFrom;
  opinion: unknown | null;
}

/** A2 :1307-:1311. */
export interface DocumentOpeningDecisionRow {
  id: string;
  thesisId: string;
  commitment: string;
  sequence: number;
  opening: Opening;
  researcherId: string;
  createdAt: Date;
}

/** A2 :1313-:1317 — written by publish_thesis once per published version, KEPT AS OBSERVED even after SHED. */
export interface PassageVerdictRow {
  id: string;
  versionId: string;
  mentionId: string;
  phrase: string;
  verdict: Verdict;
  at: Date;
}

/** A2 :1319-:1323 — one shed per document, ever; `researcherId` and `reason` REQUIRED iff OPERATOR. */
export interface ShedRow {
  commitment: string;
  cause: ShedCause;
  researcherId: string | null;
  reason: string | null;
  at: Date;
}

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

export const MODULES = {
  // A1 :1230-:1252 — one importable symbol each over the server's SHA-256, with the
  // shared test vector beside them for the browser's half (plan step 29 :153-:154).
  'lib/documentIdentity': {
    step: 29,
    exports: {
      docId: fn(29),
      commitment: fn(29),
      contentVersionHashOf: fn(29),
      HASH_VECTOR: value(29),
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
