import { heldBytesOf, publicDocumentOf } from './documentContentServe';
import { openingRank } from './documentPredicates';
import { documentRefusal, type BytesServeCode, type DocumentRefusal } from './documentRefusals';

// ---------------------------------------------------------------------------
// GET /api/documents/:commitment/bytes — docs/gf-document-flows.md A5 :1508–:1511; §7 :785–:788; document step 34
// (plan :276–:277); the researcher's Q6 (R84): "the body IS the file (its Content-Type, `Content-Disposition:
// attachment`), `X-Document-Id` and `X-Document-Salt` headers beside it, AND `Access-Control-Expose-Headers` naming both".
//
// THE ONE PLACE A DOCUMENT'S IDENTITY LEAVES THE PLATFORM — "DOC_ID is served only with the bytes themselves, where anyone
// holding the file could compute it" (§7 :765–:770). With DOC_ID and the salt beside the file a verifier hashes the file,
// hashes again with the salt, and finds the registry entry (§7 :785–:787). So it serves ONLY under OPENED(d) = BYTES.
//
// Refused, in this order: NOT_PUBLIC · SHED (the public gate `/content` passes through too) · NOT_HELD (a sealed document
// has no bytes anywhere, A5 :1511 — decided before the opening, M6) · NOT_OPENED_TO (below BYTES). A HELD row whose object
// is missing THROWS (S6).
// ---------------------------------------------------------------------------

/** The file, and the two values a reader reproduces the commitment with. */
export interface BytesServed {
  bytes: Uint8Array;
  mimeType: string;
  /** DOC_ID(d) = sha256(bytes), `0x` + 64 lowercase hex (A1 :1244). */
  docId: string;
  /** The salt, `0x` + 64 lowercase hex — the display every hash here wears (A1 :1244). */
  salt: string;
}

export async function serveDocumentBytes(commitment: string): Promise<BytesServed | DocumentRefusal<BytesServeCode>> {
  const gate = await publicDocumentOf(commitment);
  if ('code' in gate) return gate;
  // NOT_HELD BEFORE NOT_OPENED_TO (REVIEW's M6, chunk 4b round 2): a sealed document can never be opened to BYTES —
  // `decide_opening` refuses it (A4 :1445) and check 18 refuses a version that tried (A6 :1535) — so for a sealed one the
  // true answer is that there are no bytes, whatever it was opened to.
  const { document, custody } = gate.cited;
  if (custody !== 'HELD' || document.bytes === null) {
    return documentRefusal('NOT_HELD', 'This document is sealed: the platform holds no bytes of it anywhere.');
  }
  if (openingRank(gate.opening) < openingRank('BYTES')) {
    return documentRefusal('NOT_OPENED_TO', 'This document is not opened to its bytes; the file is not served.');
  }
  return {
    bytes: await heldBytesOf(document.commitment, document.bytes),
    mimeType: document.mimeType,
    docId: document.docId,
    salt: `0x${Buffer.from(document.salt).toString('hex')}`,
  };
}
