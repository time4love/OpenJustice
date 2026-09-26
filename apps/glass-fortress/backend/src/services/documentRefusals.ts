// ---------------------------------------------------------------------------
// THE DOCUMENT LAYER'S REFUSALS — docs/gf-document-flows.md A4's conventions (:1395-:1401).
//
// "Every refusal is a JSON `{ error, code }`, never a throw." One module per layer holds the
// shape and the CLOSED SET of codes that layer's tools may return, for the reason
// `mcp/tools/evidenceRefusals.ts` and `thesisRefusals.ts` state: a code the contract does not
// name fails to COMPILE rather than reaching a caller as a new word.
//
// THE SET IS STEP 30'S TOOLS' — `add_document` A4 :1410-:1411 as ruled (:1404 adds NO_TITLE and
// NAME_MISMATCH), `read_document` :1430, `list_documents` :1435, `describe_document` :1440-:1441
// as ruled (UNSUPPORTED_TYPE, TOO_LARGE against the describer's own bound, and INCOMPLETE_ANSWER, :1441 — a cut
// answer). Later steps add theirs here.
// ---------------------------------------------------------------------------

export type DocumentToolCode =
  | 'NO_RESEARCHER'
  | 'NO_BYTES'
  | 'NO_TITLE'
  | 'UNSUPPORTED_TYPE'
  | 'TOO_LARGE'
  | 'NOT_SURVEYED'
  | 'NOT_A_DOCUMENT'
  | 'NAME_MISMATCH'
  | 'NOT_HELD'
  | 'AWAITING_DERIVATION'
  | 'INCOMPLETE_ANSWER'
  // DOCUMENT STEP 33 — `verify_claim_text`'s document arm (A4 :1470): a shed document has no text to check, and a call
  // naming both targets or neither is NEITHER (thesis A4 :1521's spelling for "not exactly one target").
  | 'SHED'
  | 'NEITHER'
  // DOCUMENT STEP 34 — `decide_opening` (A4 :1445–:1446): the thesis's author, the head's citation, the widening order
  // and the log's compare-and-set. NOT_HELD above is shared: BYTES on a sealed document.
  | 'NOT_AUTHOR'
  | 'NOT_CITED'
  | 'CANNOT_NARROW'
  | 'STALE_SEQUENCE';

/**
 * The UPLOAD DIALOG's route's codes (ui A1 :1129; R76 sketch §(c) as amended by the R78 chunk-3 prompt): a
 * malformed body, the door's accepted set and its cap — ONE spelling with `add_document`'s — a bucket that
 * does not exist, and STORAGE_UNAVAILABLE: any other storage failure the route meets, which §9 :998 as ruled
 * 2026-09-23 (F2) makes a CODE the dialog names, never a bare 500. The route is the dialog's CACHE act, not a tool,
 * so its set sits beside the tools', not in it.
 */
export type DocumentUploadCode = 'INVALID_BODY' | 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'BUCKET_ABSENT' | 'STORAGE_UNAVAILABLE';

/**
 * A5 :1506 — the CONTENT serve's codes. Until step 34 builds the opening, its public branch refuses NOT_PUBLIC for
 * every document (A5 :1505 as ruled 2026-09-24); NOT_OPENED_TO and SHED are named here because the contract names them.
 */
export type ContentServeCode = 'NOT_PUBLIC' | 'NOT_OPENED_TO' | 'SHED';

export interface DocumentRefusal<C extends DocumentToolCode | DocumentUploadCode | ContentServeCode = DocumentToolCode> {
  error: string;
  code: C;
}

export function documentRefusal<C extends DocumentToolCode | DocumentUploadCode | ContentServeCode>(code: C, error: string): DocumentRefusal<C> {
  return { error, code };
}

/** A value that is a refusal rather than an answer — the one discriminant every caller reads. */
export function isDocumentRefusal(value: unknown): value is DocumentRefusal {
  return typeof value === 'object' && value !== null && 'error' in value && 'code' in value;
}

/** The refusal every write and gated read gives without a researcher in context (A4 :1396). */
export const NO_RESEARCHER = (): DocumentRefusal<'NO_RESEARCHER'> =>
  documentRefusal('NO_RESEARCHER', 'Every document tool is attributed — there is no researcher in context.');
