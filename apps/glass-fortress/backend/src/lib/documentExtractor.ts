// ---------------------------------------------------------------------------
// THE EXTRACTOR THAT READS A DOCUMENT'S BYTES — docs/gf-document-flows.md A1 :1247-:1248.
//
// "CURRENT_EXTRACTOR: one constant naming the extractor and its version; the PDF reader
// and the OCR engine are its parts — the document analogue of flows A2's
// textExtractionVersion."
//
// THE SYMBOL LANDS HERE; THE VALUE IS A DEPENDENCY CHOICE AND IS NOT MADE IN THIS FILE.
// The plan is explicit that nothing in it picks one: step 29 "makes it, judged by
// `extractor-coverage` over a fixture set ... AND BY NOTHING THIS PLAN SAYS; the plan
// picks nothing" (:154-:158). So `CURRENT_EXTRACTOR` is declared NULL until that
// measurement has been taken and the researcher has ruled on it.
//
// NULL IS A STATE THE DESIGN ALREADY HAS A WORD FOR, which is why it is safe to ship.
// `CURRENT(d)` for a HELD document is "the version whose extractorVersion is
// CURRENT_EXTRACTOR; none exists → AWAITING_DERIVATION" (A3 :1368-:1369). With no
// extractor chosen, no version can carry one, so every held document reads
// AWAITING_DERIVATION — which is TRUE: the platform genuinely owes a derivation it
// cannot yet perform. A placeholder version string would have been the alternative, and
// it would have been a LIE WRITTEN INTO EVERY ROW: `DocumentContentVersion.extractorVersion`
// is provenance, the record of WHAT READ THE BYTES, and a row claiming to have been read
// by an extractor nobody chose is exactly the fabricated-provenance class this platform
// refuses elsewhere.
//
// WHY THE SYMBOL LANDS BEFORE THE VALUE. Plan :139-:140 places it at the schema step,
// "as one importable symbol", precisely so that every consumer imports THE symbol from
// the start and none of them spells a version string of its own. The value moving later
// then changes one line rather than finding its callers by grep — the property
// `anchoredCaptureHash.ts` :61-:67 describes for `ANCHOR_SCHEME`.
//
// EXACT-CASE, AND IT MATTERS. `src/walk/derivations.ts` has a LOWERCASE LOCAL
// `currentExtractor` — the corpus's, a different thing entirely — and the corpus's own
// constant is `TEXT_EXTRACTION_VERSION` (`lib/captureDocument.ts`). A one-symbol scan
// written case-insensitively matches that local, reports a second spelling that is not
// one, and a scan that lies is worse than no scan. `test/documentGuards.test.ts` holds
// this case-sensitively and has a decoy for both directions.
// ---------------------------------------------------------------------------

/**
 * The extractor and its version, as one string — `DocumentContentVersion.extractorVersion`
 * is stamped with it, and `CURRENT(d)` compares against it.
 *
 * Branded so a bare string cannot be passed where the chosen extractor is meant: the
 * version this platform derived under is provenance, and provenance assembled from
 * whatever string was in scope is how `documentHash` once received a base32 SHA-1.
 */
export type ExtractorVersion = string & { readonly __extractorVersion: unique symbol };

/**
 * NULL UNTIL THE DEPENDENCY IS CHOSEN — document refactor step 29's second half.
 *
 * The choice is judged by `extractor-coverage` over the FIVE fixture kinds (plan :157 as
 * amended: a PDF with a text layer, a SPREADSHEET, a paste, a scan, and a photograph no
 * engine reads) and is the researcher's. Until then every HELD document reads
 * AWAITING_DERIVATION, which is the honest answer rather than a placeholder.
 *
 * The annotation is explicit so the type stays `ExtractorVersion | null` rather than
 * narrowing to `null`: a consumer written now must handle both arms, and setting the
 * value later removes the null arm at every call site by the compiler's list rather than
 * by anyone's memory.
 */
export const CURRENT_EXTRACTOR: ExtractorVersion | null = null;
