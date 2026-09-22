import type {
  ArrivalRow,
  Custody,
  DocumentContentVersionRow,
  DocumentRow,
  Opening,
  ShedRow,
} from './contract';

// ---------------------------------------------------------------------------
// THE FIXTURES, WRITTEN FROM THE APPENDICES AND NEVER FROM THE BACKEND'S ANSWERS
// (document plan §4; refactor plan §4 rule 4).
//
// THE FIVE KINDS OF STEP 29 — §3 :280-:286 as AMENDED 2026-09-22 at :284, and plan :157.
// The fifth is the spreadsheet, and it is the one the amendment added: a spreadsheet is
// COMPUTED text, not the "none of the above" row, so a quoted NUMBER is checkable rather
// than UNCHECKED. A media file is the bytes-only arm too, and its TRANSCRIPT is a second
// document — a paste, `derivedFrom` it (:1013).
//
// NOTHING HERE IS A REAL BODY. `bodies.json` holds no document (the boards note), so every
// value is illustrative and the first real bodies come from chunk 4's staging exercise.
// A fixture that pretended to be a measurement would be the shape this repository has paid
// for before.
// ---------------------------------------------------------------------------

/** The five kinds, with what each PROVES about the extractor. */
export const FIXTURE_KINDS = ['PDF_TEXT', 'SPREADSHEET', 'PASTE', 'SCAN', 'PHOTOGRAPH'] as const;
export type FixtureKind = (typeof FIXTURE_KINDS)[number];

export interface KindExpectation {
  /** Does a named extractor produce COMPUTED text from these bytes at a pinned version? */
  computed: boolean;
  /** What the kind proves — the sentence the coverage measurement reports. */
  proves: string;
}

/**
 * §3 :280-:286. `computed: false` is NOT a failure — the photograph is counted as
 * bytes-only and never as one (plan step 29 :169-:170, the FIVE counts).
 */
export const KIND_EXPECTATION: Record<FixtureKind, KindExpectation> = {
  PDF_TEXT: {
    computed: true,
    proves: 'the ordinary path: a quoted span is checkable, so VERDICT returns PRESENT or ABSENT',
  },
  SPREADSHEET: {
    computed: true,
    proves:
      'the 2026-09-22 amendment (:284): cells serialised deterministically sheet by sheet at a pinned version ' +
      'are COMPUTED, so a quoted NUMBER is checkable rather than UNCHECKED',
  },
  PASTE: {
    computed: true,
    proves: 'the bytes ARE the text, decoded UTF-8 — one version by construction, which nothing ever moves',
  },
  SCAN: {
    computed: true,
    proves: 'whether the OCR engine earns its place — the dependency choice coverage judges and the plan does not make',
  },
  PHOTOGRAPH: {
    computed: false,
    proves:
      'the bytes-only arm: text is null, contentVersionHash EQUALS docId, and every assertion about it is ' +
      'UNCHECKED — counted as bytes-only, never as a failure',
  },
};

/**
 * A HELD document. `title` is the fourth assertion (A2 :1271) and is present at the
 * researcher's door; a sealed arrival has none at receipt, which `sealed()` below shows.
 */
export function held(over: Partial<DocumentRow> = {}): DocumentRow {
  return {
    docId: '0x' + 'a1'.repeat(32),
    commitment: '0x' + 'c1'.repeat(32),
    salt: new Uint8Array(32).fill(7),
    cid: null,
    bytes: 'bucket://documents/0xa1a1',
    mimeType: 'application/pdf',
    byteLength: 4096,
    receivedAt: new Date('2026-09-20T09:00:00.000Z'),
    verifiedAtReceipt: null,
    assertedUrl: null,
    assertedAt: null,
    derivedFromCommitment: null,
    title: 'the supplementary dataset of the cardiac risk-communication paper, 2026',
    ...over,
  };
}

/** A SEALED document: a cid, no bytes, and the receipt stamp that can never be repeated (§2 :219-:221). */
export function sealed(over: Partial<DocumentRow> = {}): DocumentRow {
  return held({
    bytes: null,
    cid: 'bafy-illustrative-cid',
    verifiedAtReceipt: new Date('2026-09-20T09:00:00.000Z'),
    // A2 :1271 — a sealed document has none at receipt; step 32's question.
    title: null,
    ...over,
  });
}

/** A SHED document: custody reads as neither held nor sealed (A3 :1363, A2 :1275). */
export function shedRow(over: Partial<ShedRow> = {}): ShedRow {
  return {
    commitment: '0x' + 'c1'.repeat(32),
    cause: 'SENDER',
    researcherId: null,
    reason: null,
    at: new Date('2026-09-21T10:00:00.000Z'),
    ...over,
  };
}

/** A content version. `text: null` is the bytes-only arm, where the hash EQUALS the docId (A1 :1242-:1243). */
export function version(over: Partial<DocumentContentVersionRow> = {}): DocumentContentVersionRow {
  return {
    id: 'dcv_1',
    commitment: '0x' + 'c1'.repeat(32),
    text: 'the ministry instructed, on 3.9.2026, that the reporting channel be kept open.',
    contentVersionHash: '0x' + 'b1'.repeat(32),
    extractor: 'illustrative-pdf-reader',
    extractorVersion: 'v1',
    derivedAt: new Date('2026-09-20T09:00:01.000Z'),
    derivedFrom: 'AT_RECEIPT',
    opinion: null,
    ...over,
  };
}

/** A RESEARCHER arrival: `researcherId` REQUIRED, `thesisId` and `termsHash` NULL (A2 :1280-:1284). */
export function researcherArrival(over: Partial<ArrivalRow> = {}): ArrivalRow {
  return {
    id: 'arr_1',
    door: 'RESEARCHER',
    thesisId: null,
    gapId: null,
    researcherId: 'res_1',
    termsHash: null,
    receivedAt: new Date('2026-09-20T09:00:00.000Z'),
    ...over,
  };
}

/** An INTAKE arrival: `thesisId` and `termsHash` REQUIRED, `researcherId` NULL — the door cannot say who. */
export function intakeArrival(over: Partial<ArrivalRow> = {}): ArrivalRow {
  return {
    id: 'arr_2',
    door: 'INTAKE',
    thesisId: 'th_1',
    gapId: 'gap_1',
    researcherId: null,
    termsHash: '0x' + 'e1'.repeat(32),
    receivedAt: new Date('2026-09-20T10:00:00.000Z'),
    ...over,
  };
}

/** §7 :777-:789 — the order IS the widening rule, so the suite compares by index and never by name. */
export const OPENING_ORDER: readonly Opening[] = ['PASSAGE', 'CONTENT', 'BYTES'];

/** The three custody values, so a case that enumerates them cannot silently miss one. */
export const CUSTODY_VALUES: readonly Custody[] = ['HELD', 'SEALED', 'NONE'];
