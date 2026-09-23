// ---------------------------------------------------------------------------
// DOC_ID IN THE BROWSER — docs/gf-document-flows.md A1 :1232 ("sha256( bytes )"), §9 :998 (the UPLOAD DIALOG
// computes DOC_ID in the browser over the file as given); document refactor plan §4 :412 (the shared vector).
//
// THE FILE AS GIVEN, NEVER STRIPPED OR NORMALISED: the name is the bytes' own hash, and `add_document` recomputes
// it from the object the upload wrote and refuses NAME_MISMATCH when the two differ. Not `lib/documentVault.ts`,
// which strips metadata first and names something else. The spelling matches `docId()` in the backend's
// `lib/documentIdentity.ts`: `0x` + 64 lowercase hex.
//
// `subtle` is a parameter so the suite can hand Node's WebCrypto to a jsdom that has none; the page passes nothing.
// ---------------------------------------------------------------------------

export async function docIdOf(bytes: Uint8Array<ArrayBuffer>, subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<string> {
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return `0x${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
