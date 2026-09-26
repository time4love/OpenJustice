import { createHash } from 'node:crypto';
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
// THE FOUR KINDS OF STEP 29 — §3 :280-:286, amended 2026-09-22 at :284 and 2026-09-23 at
// :283, and plan :157. The SPREADSHEET is the one :284 added: a spreadsheet is COMPUTED
// text, not the "none of the above" row, so a quoted NUMBER is checkable rather than
// UNCHECKED. A media file is the bytes-only arm, and its TRANSCRIPT is a second document
// — **as a PDF**, `derivedFrom` the media (:1013 as amended 2026-09-23), never a paste.
//
// Both corrections are CONFORMING: :283 retired the paste as a kind and :1013 re-formed the
// transcript, each landed before this line was touched. The five-kind wording was this
// file's own leftover — the list it described was deleted in round 4 and the paragraph
// describing it was not, which is a title outliving its assertion one level down.
//
// NOTHING HERE IS A REAL BODY. `bodies.json` holds no document (the boards note), so every
// value is illustrative and the first real bodies come from chunk 4's staging exercise.
// A fixture that pretended to be a measurement would be the shape this repository has paid
// for before.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// THE FIXTURE SET HAS ONE SPELLING IN THIS TREE, AND IT IS NOT HERE.
//
// This module used to declare its own `FIXTURE_KINDS` — `PDF_TEXT · SPREADSHEET · PASTE ·
// SCAN · PHOTOGRAPH` — and a hand-kept `KIND_EXPECTATION` map beside it saying which kind
// yielded COMPUTED text. BOTH ARE DELETED, for two reasons that are really one.
//
// THE PASTE IS A RETIRED CONCEPT. flows :283 retired it as a KIND on 2026-09-23 (landed
// `1ab6296`), and `gf-refactor-plan.md` §4 rule 1 is that "a test asserting a retired
// concept is DELETED in the commit that retires the concept. Never modified to pass, never
// skipped, never left red." That commit was docs-only and left these behind — GREEN on the
// superseded five, which is worse than red: a suite asserting a retired concept and passing
// reports that the retirement did not happen.
//
// AND TWO LISTS OF THE FOUR KINDS WOULD BE THE SAME DEFECT ONE DAY LATER. The kinds, their
// files, their MIME types and what each PROVES are all held by `test/documentFixtureBytes.ts`
// — the generator that AUTHORS the committed bytes, so its list is the one a reader is
// actually pointed at. A second list here could only ever drift from it, and a hand-kept
// `computed: true | false` is a claim about a READER that nothing re-measures. Cases that
// need those facts take them from the generator, and cases that need to know whether a kind
// yields COMPUTED text ASK THE READER.
// ---------------------------------------------------------------------------

/**
 * THE FIXTURE DOCUMENT'S NAME, ITS SALT, AND ITS COMMITMENT — the last COMPUTED from the
 * first two, never hard-coded.
 *
 * CORRECTED, R74 chunk 3. `commitment` was the literal `0xc1…c1`, which is not
 * `sha256(bytes32(docId) ‖ salt)` of this row's own docId and salt. A3 :1364-:1365 defines
 * RECOMPUTABLE(e) for kind DOCUMENT as exactly that recomputation, and A7 :1549-:1552 calls a
 * row failing it MALFORMED — so `standing.test.ts`'s "an Evidence row of kind DOCUMENT is
 * recomputable" case asserted `true` over a row the design calls malformed. A predicate written
 * to the appendix went RED on it and a field comparison — the non-predicate — went GREEN: the
 * exact inversion a fixture must never produce. Computing it here means it cannot drift again.
 */
const FIXTURE_DOC_ID = '0x' + 'a1'.repeat(32);
// `Buffer`, not `Uint8Array` — Prisma maps a `Bytes` column to `Buffer`, and the
// transcription this fixture was written against said `Uint8Array`. The substitution at
// step 28 is what surfaced it: the fixture had been wrong against the schema since it was
// written, and nothing could say so while the row type was hand-copied. A Buffer IS a
// Uint8Array, so every reader that takes the wider type is unaffected.
const FIXTURE_SALT = Buffer.alloc(32, 7);

/** A1 :1236-:1238 — `sha256(bytes32(DOC_ID) ‖ salt)`, the 32 RAW bytes of the name, never its hex text. */
export const FIXTURE_COMMITMENT =
  '0x' +
  createHash('sha256')
    .update(Buffer.concat([Buffer.from(FIXTURE_DOC_ID.slice(2), 'hex'), FIXTURE_SALT]))
    .digest('hex');

/**
 * A HELD document. `title` is the fourth assertion (A2 :1271) and is present at the
 * researcher's door; a sealed arrival has none at receipt, which `sealed()` below shows.
 */
export function held(over: Partial<DocumentRow> = {}): DocumentRow {
  return {
    docId: FIXTURE_DOC_ID,
    commitment: FIXTURE_COMMITMENT,
    salt: FIXTURE_SALT,
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
    // Required by the generated row and absent from the transcription this replaced —
    // the second column the substitution found the fixture had never supplied.
    createdAt: new Date('2026-09-20T09:00:00.000Z'),
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
    commitment: FIXTURE_COMMITMENT,
    cause: 'SENDER',
    researcherId: null,
    reason: null,
    at: new Date('2026-09-21T10:00:00.000Z'),
    ...over,
  };
}

/**
 * A content version. `text: null` is the bytes-only arm, where the hash EQUALS the document's COMMITMENT
 * (A1 :1243 as CONFORMED 2026-09-26, R85 Q-G — never the docId).
 *
 * `derivedUnder` DEFAULTS TO THE ROW'S OWN `extractorVersion`, so a caller overriding one
 * gets a coherent row without naming the other — A2 :1300 (RULED 2026-09-23): the list is
 * every extractor version that REPRODUCED this text, and the version that produced it is
 * the first that reproduced it, by construction. A fixture whose list disagreed with its
 * own provenance would make CURRENT(d) read something no writer could ever create.
 */
export function version(over: Partial<DocumentContentVersionRow> = {}): DocumentContentVersionRow {
  const extractorVersion = over.extractorVersion ?? 'v1';
  return {
    id: 'dcv_1',
    commitment: FIXTURE_COMMITMENT,
    text: 'the ministry instructed, on 3.9.2026, that the reporting channel be kept open.',
    contentVersionHash: '0x' + 'b1'.repeat(32),
    extractor: 'illustrative-pdf-reader',
    extractorVersion,
    derivedUnder: [extractorVersion],
    readFailed: false,
    derivedAt: new Date('2026-09-20T09:00:01.000Z'),
    derivedFrom: 'AT_RECEIPT',
    // No `opinion`: the OPINION register left this row for its own table, `DocumentOpinion`,
    // at step 30 (A2 :1302 as ruled 2026-09-23).
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
