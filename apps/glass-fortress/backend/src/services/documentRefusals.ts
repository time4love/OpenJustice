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
// as ruled (UNSUPPORTED_TYPE, and TOO_LARGE against the describer's own bound). Later steps add theirs here.
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
  | 'AWAITING_DERIVATION';

/**
 * The UPLOAD DIALOG's route's codes (ui A1 :1129; R76 sketch §(c) as amended by the R78 chunk-3 prompt): a
 * malformed body, the door's accepted set and its cap — ONE spelling with `add_document`'s — and a bucket that
 * does not exist. The route is the dialog's CACHE act, not a tool, so its set sits beside the tools', not in it.
 */
export type DocumentUploadCode = 'INVALID_BODY' | 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'BUCKET_ABSENT';

export interface DocumentRefusal<C extends DocumentToolCode | DocumentUploadCode = DocumentToolCode> {
  error: string;
  code: C;
}

export function documentRefusal<C extends DocumentToolCode | DocumentUploadCode>(code: C, error: string): DocumentRefusal<C> {
  return { error, code };
}

/** A value that is a refusal rather than an answer — the one discriminant every caller reads. */
export function isDocumentRefusal(value: unknown): value is DocumentRefusal {
  return typeof value === 'object' && value !== null && 'error' in value && 'code' in value;
}

/** The refusal every write and gated read gives without a researcher in context (A4 :1396). */
export const NO_RESEARCHER = (): DocumentRefusal<'NO_RESEARCHER'> =>
  documentRefusal('NO_RESEARCHER', 'Every document tool is attributed — there is no researcher in context.');
