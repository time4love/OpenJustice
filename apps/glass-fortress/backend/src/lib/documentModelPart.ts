// ---------------------------------------------------------------------------
// A DOCUMENT'S BYTES AS A MODEL READS THEM — document flows A4 :1441 as ruled 2026-09-23, §6 :739 (R81 Q-3).
//
// ONE SPELLING, TWO MODEL ACTORS. `describe_document` hands an image or a PDF to the describer AS ITS FILE, and the
// debate's assessor is handed a HELD document with no computed text "as describe_document hands it" (§6 :739). Both
// build the part HERE, so the two can never disagree about what a file looks like to a provider.
//
// PURE, AND IN `lib/`: the assessor imports no database client (thesis A7 `models-write-no-state`), and the describer's
// neighbour `documentContentVersions` holds the opinion writer — a part builder beside either would carry one of them in.
// ---------------------------------------------------------------------------

/** A file as the model is handed it: its declared type and its bytes, base64-encoded. */
export interface ModelFile {
  mimeType: string;
  base64: string;
}

/** The bytes the bucket holds, encoded ONCE for any model actor. */
export function modelFileOf(mimeType: string, bytes: Uint8Array): ModelFile {
  return { mimeType, base64: Buffer.from(bytes).toString('base64') };
}

/**
 * LangChain's standard data content block for a file — each provider adapter converts it. The FIELD NAMES are the
 * adapter's contract (`source_type`, `mime_type`), which is why they are spelled nowhere else.
 */
export function modelFilePart(file: ModelFile): { type: 'file'; source_type: 'base64'; mime_type: string; data: string } {
  return { type: 'file', source_type: 'base64', mime_type: file.mimeType, data: file.base64 };
}
