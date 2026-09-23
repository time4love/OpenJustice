import { normaliseType } from './documentExtractor';

// ---------------------------------------------------------------------------
// WHAT THE RESEARCHER'S DOOR ACCEPTS — the ONE spelling, and the numbers beside it.
//
// THE SET IS THE APPROVED BOARDS' STRIP — `docs/boards/gf-ui-boards-2026-09-22.html` י1 and
// י2: `קובץ אחד · CSV · XLSX · PDF · תמונה · שמע · וידאו · עד 50 MB`. A shape on an approved
// board is decided (two-session protocol :268-:271); the supported types are an operational
// parameter of flows A8's kind (document flows §12 :1186), and the strip is where it was set.
//
// THIS IS `add_document`'s ACCEPTED SET, AND IT IS NOT THE EXTRACTOR'S READER TABLE — both
// hold, and they answer different questions (R76 chunk-1 grading). `text/plain` is not on the
// strip, so the door refuses it UNSUPPORTED_TYPE; an AUDIO file IS on the strip, so the door
// accepts it and the extractor answers NO_READER_FOR_TYPE — bytes-only, never a failure
// (flows §3 :284). The route that signs an upload, `add_document`, and the dialog's refusal all
// read THIS module; the bucket's migration deliberately sets no MIME list, so there is no
// second spelling to drift.
//
// `describe_document`'s narrower set is DERIVED here, never listed again: A4 :1440-:1441 as
// ruled 2026-09-23 — no model reads audio or video.
//
// PURE, AND IT IMPORTS ONLY THE PURE TYPE NORMALISER — a pure module never gains a dependency.
// ---------------------------------------------------------------------------

/** A family of accepted types — the board's six words. */
export type DocumentFamily = 'PDF' | 'XLSX' | 'CSV' | 'IMAGE' | 'AUDIO' | 'VIDEO';

const EXACT: ReadonlyMap<string, DocumentFamily> = new Map([
  ['application/pdf', 'PDF'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'XLSX'],
  ['text/csv', 'CSV'],
]);

const BY_PREFIX: readonly (readonly [string, DocumentFamily])[] = [
  ['image/', 'IMAGE'],
  ['audio/', 'AUDIO'],
  ['video/', 'VIDEO'],
];

/**
 * TOO_LARGE — 50 MB, RULED 2026-09-23 (the researcher; boards י1/י2 "עד 50 MB"). 52 428 800
 * bytes, and the bucket's migration writes the SAME number as `file_size_limit` so the storage
 * itself refuses a larger upload to a signed URL; a test holds the two EQUAL by reading the
 * migration file. `add_document` reads it against the OBJECT'S OWN SIZE (A4 :1404).
 */
export const TOO_LARGE_BYTES = 52_428_800;

/**
 * THE DESCRIBER'S BOUND — `describe_document` refuses TOO_LARGE above it (flows A4 :1440 as RULED
 * 2026-09-23: the researcher adopted Fable's advice with the bound amended to 50 MB). One word with
 * the door's TOO_LARGE, two thresholds: the door's is the bucket's, this one is the MODEL's.
 *
 * MEASURED FOR ONE PROVIDER — `DESCRIBE_BOUND_PROVIDER`, below. With `DOCUMENT_DESCRIBER_PROVIDER`
 * unset the factory resolves the describer to Gemini (`factories/LLMFactory.ts` :57-:60), and Google
 * documents inline input as "100 MB per request or payload (50 MB for PDFs)", PDFs "up to 1000 pages"
 * (https://ai.google.dev/gemini-api/docs/file-input-methods, page updated 2026-09-17, read 2026-09-23).
 * The ruling reads that 50 MB as the RAW file: 50 000 000 bytes. The door's cap (52 428 800) sits
 * just above it, so a stored document of 50 000 001-52 428 800 bytes is refused here.
 *
 * THE KNOWN RISK, recorded rather than guessed away: the file travels base64-encoded, which adds a
 * third. If Google counts the ENCODED payload against its 50 MB, the raw bound is 37 500 000 bytes,
 * and a PDF of 37.5-50 MB passes this check and fails AT THE PROVIDER — loudly, the call rejected and
 * no opinion row written. The 1000-page limit is not checked here either — RULED 2026-09-23 (the researcher):
 * "no need to refuse over 1000 pages for now"; a longer PDF fails at the provider, loudly, and writes no row.
 */
export const DESCRIBE_TOO_LARGE_BYTES = 50_000_000;

/**
 * The provider `DESCRIBE_TOO_LARGE_BYTES` was measured for — the `provider` half of
 * `resolveModelId`'s `provider:model`. A test holds that the describer resolves to it with no
 * variable set, so a provider change reddens and forces the bound to be measured again.
 */
export const DESCRIBE_BOUND_PROVIDER = 'gemini';

/**
 * The largest IMAGE `read_document` hands the model as an image block — 5 MB, RULED 2026-09-23
 * (the researcher, A4 :1425's operational parameter). Above it an image rides as a signed
 * download link like every other bytes-only kind.
 */
export const IMAGE_BLOCK_BYTES = 5_242_880;

/** The family a declared MIME type belongs to, or null when the door does not accept it. */
export function familyOf(mimeType: string): DocumentFamily | null {
  const type = normaliseType(mimeType);
  const exact = EXACT.get(type);
  if (exact !== undefined) return exact;
  return BY_PREFIX.find(([prefix]) => type.startsWith(prefix))?.[1] ?? null;
}

/** Whether `add_document` accepts this declared type — UNSUPPORTED_TYPE otherwise. */
export function isAccepted(mimeType: string): boolean {
  return familyOf(mimeType) !== null;
}

/** The families NO MODEL READS — A4 :1440 as ruled 2026-09-23. */
const NO_MODEL_READS: ReadonlySet<DocumentFamily> = new Set(['AUDIO', 'VIDEO']);

/** How a model reads a family: as its FILE (an image, a PDF), or through its COMPUTED TEXT (a spreadsheet) — A4 :1441. */
export type ModelReading = 'FILE' | 'TEXT';

/** A4 :1441 as ruled — a model reads an image or a PDF as its file, and a spreadsheet through its computed text. */
export function modelReadingOf(family: DocumentFamily): ModelReading | null {
  if (NO_MODEL_READS.has(family)) return null;
  return family === 'IMAGE' || family === 'PDF' ? 'FILE' : 'TEXT';
}
