import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import type { CellValue, Workbook } from 'exceljs';

// ---------------------------------------------------------------------------
// THE EXTRACTOR THAT READS A DOCUMENT'S BYTES — docs/gf-document-flows.md A1 :1247-:1248.
//
// "CURRENT_EXTRACTOR: one constant naming the extractor and its version; the PDF reader
// and the OCR engine are its parts — the document analogue of flows A2's
// textExtractionVersion."
//
// THE SYMBOL AND ITS VALUE BOTH LAND HERE. Step 29a shipped the symbol typed
// `ExtractorVersion | null` and set to null, because the dependency choice had not been
// made: "the plan picks nothing" (plan :154-:158). THAT STATE IS OVER. The researcher
// ruled on 2026-09-23 (`docs/gf-extractor-ruling-2026-09-23.md`) and the value below is
// SET — so the type is `ExtractorVersion`, not `ExtractorVersion | null`, and every arm
// that existed to answer "what if nothing is chosen" is gone with it. A nullable type
// over a value that cannot be null is two dead branches the checker keeps alive and no
// instrument can see: `no-unnecessary-condition` does not fire on them, because to the
// compiler the condition is not unnecessary.
//
// WHY THE SYMBOL LANDS BEFORE ITS CALLERS. Plan :139-:140 places it at the schema step,
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
 * THE PDF JOIN'S THRESHOLD, in FONT SIZES — RULED 2026-09-25 by the researcher.
 *
 * `joinPdfText` puts a space between two runs on one line only where the gap between them exceeds this many font
 * sizes. The value was read off the MEASURED VALLEY of `docs/gf-document-hebrew-text-layer-2026-09-24.md` §2b (:69–:81),
 * over MK 05/2023: pieces of one word split into two runs sit at or below 0.047, table-of-contents leaders from 0.059,
 * list-bullet dots from 0.077, gaps between words from about 0.20. §2b bounds it to the band 0.05–0.07, and this value is
 * the one point in the band measured on all four of its counts (the three quotes PRESENT, no bullet glued). Within the
 * band only table-of-contents leaders move with the value.
 *
 * SPELLED ONCE: `CURRENT_EXTRACTOR` is built from it, and `test/documentPdfJoin.test.ts` scans this file for any second
 * spelling of the value.
 */
export const PDF_JOIN_GAP_EM = 0.06;

/**
 * THE EXTRACTOR, RULED 2026-09-23 — `docs/gf-extractor-ruling-2026-09-23.md`.
 *
 * The researcher's two rulings: **SHIP `ocr-none`** — no OCR engine enters v1 — and a
 * SCANNED DOCUMENT IS OPENED TO BYTES. Written into the design at flows §3 :282.
 *
 * EVERY STAGE NAMES ITS ENGINE AND ITS BUILD, and that is ruling §6.6 :198-:206 in terms,
 * in `TEXT_EXTRACTION_VERSION`'s grammar (dash-joined, no `+`):
 *
 *   v2              this layer's second extractor: `v1` joined every PDF text item with a
 *                   space, and that join was RULED A DEFECT on 2026-09-25 — it split words
 *                   a producer drew as two runs (the Hebrew text-layer doc, §5 ruling 3)
 *   pdfjs6.3.289    the PDF text-layer reader, EXACT-pinned — the version is part of the
 *                   provenance because a reader's output is the reader's
 *   streamorder     `getTextContent()` items joined in CONTENT-STREAM ORDER, with no
 *                   bidi-reordering heuristic: "it is a second reading of the bytes and
 *                   it moves when tuned" (the ruling, §6.5)
 *   gapjoin<N>em    the JOIN POLICY and its THRESHOLD: a space between two runs on one
 *                   line only where the gap exceeds `PDF_JOIN_GAP_EM` font sizes, a new
 *                   line where the baseline moves or pdf.js marks one (`joinPdfText`).
 *                   Built from the constant below, so the number is spelled once
 *   ocr-none        NO OCR STAGE. A scan derives no computed text; its content IS the
 *                   bytes and a quoted span from it is UNCHECKED, with the reason
 *   exceljs4.4.0    the spreadsheet PARSER, EXACT-pinned, for the same reason the PDF
 *                   reader is: it decodes date serials, shared and inline strings and
 *                   cached formula results, so an upgrade can move the computed text
 *   xlsxcells       the XLSX cell serialisation below — ours, deterministic, sheet by sheet
 *   csvraw          the CSV policy below: every cell is its RAW STRING, never coerced
 *   nfc             the emitted text is Unicode-normalised, so one string has one form
 *
 * `exceljs4.4.0` AND `csvraw` ARE A PROPOSAL OF ROUND 2 AND ARE THE RESEARCHER'S TO RULE.
 * Round 1 shipped `…-ocr-none-xlsxcells-nfc`, which named the spreadsheet POLICY and
 * neither its engine nor its build — so an `exceljs` upgrade could move every
 * spreadsheet's computed text while this string stood still, and `extractor-coverage`
 * could not see it (it counts WHETHER text was derived, never whether it is right).
 * `documentGuards.test.ts` now ties both reader versions in this string to what
 * `package.json` declares, so the two cannot drift apart silently.
 *
 * WHY `ocr-none` IS SMALLER AND SAFER, AND IT IS NOT ABOUT QUALITY. The line the design
 * draws is REPRODUCIBILITY (§3 :299-:305). A weak engine costs MORE at the gate than no
 * engine: `DOCUMENT_QUOTES_PRESENT` (A6 :1536) is HARD, so a true quote carrying one
 * misread letter comes back as a blocking ABSENT — "a machine-generated accusation
 * against the platform's own researcher, produced by a fax artefact" — where `ocr-none`
 * leaves an honest, NON-BLOCKING UNCHECKED. It also removes the rasteriser, a stage with
 * its own determinism hole that nobody had counted.
 *
 * MOVING IT IS ONE EDIT AND THE PASS RE-DERIVES. Adding an OCR stage later moves this
 * string; `forensics:rederive-documents` then re-derives HELD documents, and only those
 * whose text actually changes gain a version (§3 :316-:317). Moving it to `v2` is exactly
 * that: from the deploy until the pass runs, every HELD document reads AWAITING_DERIVATION.
 */
export const CURRENT_EXTRACTOR: ExtractorVersion =
  `v2-pdfjs6.3.289-streamorder-gapjoin${String(PDF_JOIN_GAP_EM)}em-ocr-none-exceljs4.4.0-xlsxcells-csvraw-nfc` as ExtractorVersion;

// ---------------------------------------------------------------------------
// WHAT READS THE BYTES — §3 :277-:286, the four kinds as amended 2026-09-23.
//
// THE MIME TYPE SELECTS A READER CLASS AND NEVER THE OUTCOME, and the distinction
// is load-bearing rather than pedantic. `image/png` is the type of BOTH a scan
// carrying Hebrew text and a photograph carrying none. So nothing here may report
// "this is a scan" — only the READER's answer says whether COMPUTED text exists,
// and a reader that returns nothing leaves the content as the bytes (§3 :284),
// which is an OUTCOME and never a failure (plan :169-:170).
//
// THE TABLE HAS TWO ENTRIES AND ONE DELIBERATE ABSENCE. `PDF` and `SPREADSHEET`
// have readers; `IMAGE` has none, and that is `ocr-none` — a decision, named as
// one, not a missing dependency. It is the ONE place a chosen reader lands, which
// is what A1 :1247-:1248 asks of a constant "naming the extractor and its version"
// whose "PDF reader and OCR engine are its parts": the parts arrive here, the
// version string moves with them, and no caller changes.
//
// A TYPE THIS TABLE ACCEPTS IS A TYPE `extract` ANSWERS FOR — it never throws for
// one. `text/csv` and `application/vnd.ms-excel` both reached `workbook.xlsx.load`
// in round 1 and raised "Can't find end of central directory : is this a zip
// file ?", because neither is a zip. CSV now has its own arm below, and the legacy
// `.xls` type is OFF the list: `exceljs` cannot read it and no clause asks for it,
// so it falls to `NO_READER_FOR_TYPE`, which is honest.
// ---------------------------------------------------------------------------

/**
 * The reader class a MIME type selects.
 *
 * `NONE` is not "unreadable" — it is "no reader class is even selected", which is
 * what a type outside the supported set gets. An IMAGE whose reader finds no text
 * is a different answer and is reported as one.
 */
export type ReaderClass = 'PDF' | 'IMAGE' | 'SPREADSHEET' | 'NONE';

/** What `extract` answers: the COMPUTED text, or the reason there is none. */
export interface Extraction {
  readerClass: ReaderClass;
  /** The COMPUTED text (§3's line), or null when the content IS the bytes. */
  text: string | null;
  /** The reader that answered — provenance, `DocumentContentVersion.extractor`. */
  extractor: string | null;
  /**
   * Why there is no text. Null exactly when `text` is not.
   *
   * FOUR REASONS, AND THE LAST TWO ARE DIFFERENT FACTS — A2 :1300, RULED 2026-09-23.
   * `NO_READER_FOR_TYPE`: no reader class was even selected. `OCR_NONE`: the class is
   * IMAGE and the researcher ruled no OCR engine ships. `READ_NOTHING`: a reader ran and
   * found no text — a scan inside a PDF wrapper. `READ_FAILED`: a reader was SELECTED and
   * THREW. A broken PDF and a photograph are the same COUNT and not the same FACT, and
   * `extractor-coverage` is required to tell them apart (A7 :1591).
   */
  reason: 'OCR_NONE' | 'NO_READER_FOR_TYPE' | 'READ_NOTHING' | 'READ_FAILED' | null;
  /**
   * The reader was selected and threw — `DocumentContentVersion.readFailed` (A2 :1300).
   *
   * True exactly when `reason` is `READ_FAILED`; carried as its own field because that is
   * the shape the ROW takes, and a caller reading a boolean cannot mis-spell a literal.
   */
  readFailed: boolean;
}

/**
 * A reader takes the bytes AND THE NORMALISED TYPE, and returns the text it found.
 *
 * The type is passed because one reader class can cover more than one type: §3 :284
 * rules a SPREADSHEET to be "XLSX, CSV", one kind with two containers, and the
 * container decides how the workbook is opened while the serialisation below is the
 * same for both. A reader that had to re-derive the type from the bytes would be a
 * second, sniffing answer to a question the caller already has.
 */
type Reader = (bytes: Uint8Array, type: string) => Promise<string | null>;

/**
 * One pdf.js text item, by the four fields the join reads — pdf.js 6.3.289's `TextItem` satisfies it structurally.
 *
 * `transform` is `[a, b, c, d, x, y]`: the run starts at (`x`, `y`) on its baseline, and `hypot(c, d)` is its font size
 * on the page. `width` is the run's advance. `hasEOL` is pdf.js's own end-of-line mark: set on the run before a break,
 * or carried by an EMPTY run pdf.js pushes when no run is open (`appendEOL`).
 */
export interface PdfTextRun {
  str: string;
  transform: number[];
  width: number;
  hasEOL: boolean;
}

/** A run's place on the page — a LOUD guard, because a run that is not six numbers is not a pdf.js text item. */
function geometryOf(run: PdfTextRun): { left: number; right: number; baseline: number; fontSize: number } {
  const [c, d, x, y] = [run.transform.at(2), run.transform.at(3), run.transform.at(4), run.transform.at(5)];
  if (run.transform.length !== 6 || c === undefined || d === undefined || x === undefined || y === undefined) {
    throw new Error(`joinPdfText: a text run's transform is not six numbers (${JSON.stringify(run.transform)}).`);
  }
  return { left: x, right: x + run.width, baseline: y, fontSize: Math.hypot(c, d) };
}

/**
 * THE GEOMETRY JOIN — one page's runs, in CONTENT-STREAM ORDER, into text. Ruling 3 of
 * `docs/gf-document-hebrew-text-layer-2026-09-24.md` §5 (:126–:129), within §2b's bounds (:57–:88).
 *
 * IT DECIDES ONLY THE SEPARATOR BETWEEN TWO RUNS. A run's own characters are emitted as pdf.js returned them, never
 * edited and never reordered: a trailing space before a line break is kept, and a Latin run a producer wrote in visual
 * order stays where the content stream put it — the residual the extractor ruling accepted without a reordering
 * heuristic (`docs/gf-extractor-ruling-2026-09-23.md` §6.5 :184–:189; §2b :82–:85).
 *
 *   a NEW LINE   where the baseline moves (`y` differs — strict, no tolerance), or where pdf.js marks an end of line.
 *                Both: on MK 05/2023 the mark alone misses real line breaks (pdf.js's test is a strict `> height`),
 *                and a missed break would be measured as a horizontal gap and could glue two lines' words together.
 *   a SPACE      between two runs on one line when the gap between their boxes exceeds `PDF_JOIN_GAP_EM` font sizes,
 *                and neither side already carries whitespace — so a separator is never doubled.
 *   nothing      otherwise: a word its producer drew as two runs reads as one word.
 *
 * THE GAP IS THE DISTANCE BETWEEN THE TWO BOXES ALONG THE BASELINE, whichever way the line advances —
 * `max(b.left − a.right, a.left − b.right)` — so a right-to-left run drawn leftward is measured from its right edge
 * with no direction guess, and it is NEGATIVE when the boxes overlap (a visual-order run), which never spaces. The font
 * size is the LATER run's vertical scale, `hypot(c, d)`, as pdf.js computes a run's height. The comparison is written
 * `gap > PDF_JOIN_GAP_EM * fontSize`: the same inequality as gap ÷ size for any positive size, and a degenerate
 * zero-size run spaces exactly when the gap is positive rather than dividing by zero.
 */
export function joinPdfText(runs: readonly PdfTextRun[]): string {
  let text = '';
  let previous: PdfTextRun | null = null;
  let marked = false;
  for (const run of runs) {
    if (run.str === '') {
      // An empty run carries nothing but, possibly, pdf.js's end-of-line mark for the pair around it.
      if (run.hasEOL && previous !== null) marked = true;
      continue;
    }
    if (previous !== null) {
      const before = geometryOf(previous);
      const after = geometryOf(run);
      if (marked || after.baseline !== before.baseline) {
        text += '\n';
      } else {
        const gap = Math.max(after.left - before.right, before.left - after.right);
        const whitespaceAlready = /\s$/u.test(text) || /^\s/u.test(run.str);
        if (gap > PDF_JOIN_GAP_EM * after.fontSize && !whitespaceAlready) text += ' ';
      }
    }
    text += run.str;
    previous = run;
    marked = run.hasEOL;
  }
  return text;
}

/**
 * THE PDF TEXT LAYER — `pdfjs-dist`, items in CONTENT-STREAM ORDER.
 *
 * A born-digital PDF and a scanned one wear the same extension: the first carries a text
 * layer and is read here, the second is an image in a PDF wrapper and, under `ocr-none`,
 * returns nothing — which this reader reports as READ_NOTHING rather than as an error,
 * because "a scan is bytes-only" is an outcome the design accepts.
 *
 * A PAGE'S RUNS ARE JOINED BY GEOMETRY (`joinPdfText` above), pages by a line break.
 *
 * NO BIDI HEURISTIC, DELIBERATELY. A producer that wrote Hebrew in VISUAL order comes back
 * word-reversed, and a true quote against such a PDF then reads ABSENT — visibly. The
 * ruling (§6.5) refuses to add a reordering pass for it: "it is a second reading of the
 * bytes and it moves when tuned."
 */
// ---------------------------------------------------------------------------
// `pdfjs-dist` 6.3.289 IS ESM-ONLY, AND NO TEST IN THIS HARNESS CAN LOAD IT.
//
// The package ships `legacy/build/pdf.mjs` and NO CJS build. The `await import()` below is
// compiled to a `require()` by `module: commonjs`, which is correct everywhere the code
// actually runs — `dist/`, every operational script, the server, `ts-node` — because Node
// 22 supports `require(esm)`.
//
// INSIDE JEST IT DOES NOT WORK, AND THREE MECHANISMS WERE MEASURED FAILING, recorded so no
// later seat spends the afternoon again:
//
//   `await import(...)` compiled to require   -> "Cannot use 'import.meta' outside a module"
//   Node's own require, via createRequire      -> the SAME error. It does NOT escape jest:
//                                                 jest-runtime hooks `Module._load`
//                                                 process-wide, so a require built inside a
//                                                 transformed module still routes through
//                                                 jest's loader rather than Node's.
//   a NATIVE dynamic import, hidden from the
//   transform by `new Function('s','return import(s)')`
//                                              -> "A dynamic import callback was invoked
//                                                 without --experimental-vm-modules"
//
// The last one works with `NODE_OPTIONS=--experimental-vm-modules`, and it was measured
// BREAKING the gating run: every `test/extraction` suite then fails to load on Node 22, and
// 93 cases stop running. So the researcher ruled (2026-09-23) that the PDF arm is held by a
// PROCESS-LEVEL test instead — `test/documentPdfProcess.test.ts` runs this module COMPILED
// in a child `node`, with a vacuity guard against a stale `dist/`. The join itself,
// `joinPdfText`, imports nothing from pdfjs, so jest tests it directly
// (`test/documentPdfJoin.test.ts`).
// ---------------------------------------------------------------------------

const readPdfTextLayer: Reader = async (bytes) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // No network and no system fonts: a reader that fetched anything would depend on what
  // a host could reach, and provenance would stop being a version. The standard fonts
  // come from the PINNED PACKAGE'S OWN directory — pdfjs warns without them and would
  // otherwise look for them over the network, which is the same hole wearing a warning.
  const standardFontDataUrl = `${dirname(require.resolve('pdfjs-dist/package.json'))}/standard_fonts/`;
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    standardFontDataUrl,
  });
  try {
    const document = await task.promise;
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(joinPdfText(content.items.filter((item) => 'str' in item)));
    }
    return pages.join('\n');
  } finally {
    // The LOADING TASK owns the worker, so it is what must be destroyed — and in a
    // `finally`, because a document that throws mid-read would otherwise leak one.
    await task.destroy();
  }
};

/** `text/csv` — §3 :284's second spreadsheet container, and board י1's approved type. */
const CSV_TYPE = 'text/csv';

/**
 * THE SPREADSHEET — the parser is a library, THE SERIALISATION IS OURS.
 *
 * Flows §3 :284 rules a spreadsheet's cells COMPUTED "serialised deterministically, sheet
 * by sheet, at a pinned version", and names the kind as "XLSX, CSV" — ONE kind, two
 * containers. Board י1's approved drop-zone strip draws both. So both are opened here,
 * into the same `Workbook`, and `serialiseWorkbook` below is the one serialisation:
 *
 *   one `# <sheet name>` line per sheet, in workbook order;
 *   then every row from 1 to the sheet's last, cells from 1 to its last, tab-joined.
 *
 * A CSV CELL IS ITS RAW STRING AND IS NEVER COERCED — `csvraw` in the version string, and
 * it is a DETERMINISM fix rather than a preference. `exceljs`'s default CSV map parses a
 * date-shaped cell with `dayjs` IN THE HOST'S LOCAL TIMEZONE: `2022-01-15` was measured
 * here as `2022-01-14T22:00:00.000Z` on this laptop and `2022-01-14T15:00:00.000Z` under
 * `TZ=Asia/Tokyo` — the same bytes, two computed texts, and "pinned at a version" a
 * fiction. It is also the truthful reading: a CSV has no cell types at all, so every cell
 * IS text, and inventing one is the reader authoring content under the document's name.
 * The identity map is the whole fix; `parserOptions` are left at their defaults, which
 * are RFC 4180's.
 */
const readSpreadsheetCells: Reader = async (bytes, type) => {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  if (type === CSV_TYPE) {
    await workbook.csv.read(Readable.from([Buffer.from(bytes)]), { map: (value: string) => value });
  } else {
    // exceljs types the parameter as the AMBIENT `Buffer`, which on Node 22's typings is
    // `Buffer<ArrayBufferLike>` and no longer structurally accepts `Buffer<ArrayBuffer>`.
    // The value is right and only the declaration is behind, so the cast is named here
    // rather than spread through the caller as `any`.
    type LoadBuffer = Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as LoadBuffer);
  }
  return serialiseWorkbook(workbook);
};

/**
 * The one serialisation — `xlsxcells`, applied to whichever container was opened.
 *
 * A WORKBOOK WITH NO CELL CONTENT RETURNS NULL, and that is not a tidy-up. The `#` line is
 * a LABEL, not content: without this, an EMPTY spreadsheet came back as COMPUTED text
 * reading exactly `# sheet1`, so the document's `contentVersionHash` would have been the
 * hash of a string this serialiser INVENTED rather than the document's commitment (A1
 * :1243 as CONFORMED 2026-09-26, which rules the bytes-only hash to BE the commitment). That is the serialiser
 * authoring content under the document's name — the same failure the cell rules below
 * refuse for dates and hyperlinks, one level up. It also made `READ_NOTHING` unreachable
 * for a spreadsheet: every workbook, however empty, answered COMPUTED.
 */
function serialiseWorkbook(workbook: Workbook): string | null {
  // THE CELLS ARE COLLECTED AND THE ANSWER IS DERIVED FROM THEM, rather than a flag set
  // inside the callback. TypeScript's control flow does not follow an assignment made in a
  // closure `eachSheet` invokes, so a `let anyCell = false` reads as ALWAYS FALSY at the
  // return — `no-unnecessary-condition` says so, and it was right: the type was lying
  // about a value that does change. A boolean computed FROM the data cannot lie about it.
  const sheets: { name: string; rows: string[][] }[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[][] = [];
    for (let row = 1; row <= sheet.rowCount; row += 1) {
      const cells: string[] = [];
      for (let column = 1; column <= sheet.columnCount; column += 1) {
        cells.push(serialiseCell(sheet.getRow(row).getCell(column).value));
      }
      rows.push(cells);
    }
    sheets.push({ name: sheet.name, rows });
  });
  const anyCell = sheets.some((sheet) => sheet.rows.some((row) => row.some((cell) => cell !== '')));
  if (!anyCell) return null;
  return sheets
    .flatMap((sheet) => [`# ${sheet.name}`, ...sheet.rows.map((row) => row.join('\t'))])
    .join('\n');
}

/**
 * One cell, by VALUE — the cases stated so a reader can check them against a file.
 *
 * Typed against exceljs's OWN `CellValue` union rather than a bag of unknowns, so a cell
 * shape this does not handle is a compile error and not a silent empty string.
 *
 * EVERY CELL IS SERIALISED BY ITS VALUE AND NEVER BY ITS DISPLAY TEXT. A cell's `.text`
 * applies the number format, which is locale- and timezone-sensitive — a date would
 * serialise differently on two machines and the "pinned version" would be a fiction. A
 * date is therefore emitted as an ISO-8601 instant in UTC, and a number as its own digits.
 */
function serialiseCell(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value;
  // Rich text is ONE string to a reader; its runs are styling.
  if ('richText' in value) return value.richText.map((run) => run.text).join('');
  // A formula cell carries its CACHED RESULT; the formula itself is not the content.
  if ('formula' in value || 'sharedFormula' in value) return serialiseCell(value.result ?? '');
  if ('error' in value) return value.error;
  // A hyperlink's content is the text it shows, never the target.
  if ('text' in value) return serialiseCell(value.text);
  return '';
}

/**
 * THE READER TABLE — the one place a reader lands, and the one place `ocr-none` shows.
 *
 * IMAGE IS ABSENT ON PURPOSE. It is not an oversight and not a stub: the researcher ruled
 * that no OCR engine ships in v1, so an image — a scan or a photograph alike — has no
 * reader, derives no text, and its content IS the bytes.
 *
 * Typed as a PARTIAL map so every lookup is forced to handle the miss; a full record would
 * make the absence a lie the compiler helps tell.
 */
const READERS: Partial<Record<ReaderClass, Reader>> = {
  PDF: readPdfTextLayer,
  SPREADSHEET: readSpreadsheetCells,
};

/**
 * The spreadsheet containers, and `application/vnd.ms-excel` IS NOT ONE OF THEM.
 *
 * The legacy `.xls` type is a BIFF compound file, not a zip and not a text format;
 * `exceljs` cannot read it, and no clause of the design or the plan asks for it. It was
 * on this list in round 1 and reached `workbook.xlsx.load`, which raised rather than
 * answering. A type this table does not name falls to `NO_READER_FOR_TYPE` — the content
 * is the bytes, which is honest, and the caller is never handed an exception for a file
 * the platform simply cannot read.
 */
const SPREADSHEET_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  CSV_TYPE,
]);

/** The declared type, stripped of its parameters and lowercased — ONE spelling of it, which `lib/acceptedDocumentTypes` imports. */
export function normaliseType(mimeType: string): string {
  return mimeType.split(';').at(0)?.trim().toLowerCase() ?? '';
}

/** Which reader class a declared MIME type selects (§3 :280-:286). */
function readerClassOf(mimeType: string): ReaderClass {
  const type = normaliseType(mimeType);
  if (type === 'application/pdf') return 'PDF';
  if (SPREADSHEET_TYPES.has(type)) return 'SPREADSHEET';
  if (type.startsWith('image/')) return 'IMAGE';
  return 'NONE';
}

/**
 * EXTRACT — the COMPUTED register of §3, and the only thing that produces it.
 *
 * It is a PURE FUNCTION OF THE BYTES AND THE DECLARED TYPE: it reads no row, opens
 * no bucket and takes no clock, so the same document yields the same text on every
 * run, which is the whole of §3's line between COMPUTED and OPINION —
 * "reproducible from the bytes by a named extractor at a pinned version".
 *
 * IT NEVER THROWS, FOR ANY INPUT, AND THAT IS A RULING RATHER THAN A CONVENIENCE
 * (2026-09-23, A2 :1300). A CORRUPT FILE OF AN ACCEPTED TYPE IS ACCEPTED AS
 * BYTES-ONLY, like any other bytes no reader can read (§3 :284), and is NEVER
 * REFUSED: a refusal would turn the platform's own reader failing into a reason to
 * hold nothing — the document would be turned away at the door because of a defect
 * on this side of it. A5 :1493's `UNREADABLE` refuses a key that does not open a
 * ciphertext, a different fact, and the two must not share one spelling.
 *
 * FIVE ANSWERS, EACH A DIFFERENT FACT: the text; `NO_READER_FOR_TYPE` where no class
 * is even selected; `OCR_NONE` where the class is IMAGE, which has no reader by the
 * ruling; `READ_NOTHING` where a reader ran and found nothing, which is a scan inside
 * a PDF wrapper; and `READ_FAILED` where a reader was selected and THREW.
 *
 * THE CATCH IS NARROW ON PURPOSE. It wraps the READER and nothing else, so a defect in
 * this module's own dispatch still throws and is still loud — a blanket catch would be
 * the swallowed-rejection shape this house has paid for, and would have hidden the CSV
 * defect round 2 fixed rather than surfacing it.
 */
export async function extract(bytes: Uint8Array, mimeType: string): Promise<Extraction> {
  const readerClass = readerClassOf(mimeType);
  if (readerClass === 'NONE') {
    return { readerClass, text: null, extractor: null, reason: 'NO_READER_FOR_TYPE', readFailed: false };
  }
  const reader = READERS[readerClass];
  if (reader === undefined) {
    // The one class with no reader is IMAGE, and `ocr-none` is why (the ruling of
    // 2026-09-23). It is named rather than reported as a missing dependency, because
    // it is a decision and not a gap.
    return { readerClass, text: null, extractor: null, reason: 'OCR_NONE', readFailed: false };
  }
  let text: string | null;
  try {
    text = await reader(bytes, normaliseType(mimeType));
  } catch {
    // The reader was SELECTED and THREW: a PDF whose xref is damaged, a workbook whose
    // central directory is short, a CSV that is not text. The content is the bytes, the
    // platform holds them, and the fact that its reader failed is RECORDED rather than
    // raised — `readFailed` on the row, counted apart by `extractor-coverage`.
    return { readerClass, text: null, extractor: CURRENT_EXTRACTOR, reason: 'READ_FAILED', readFailed: true };
  }
  if (text === null || text.trim() === '') {
    // A PDF with no text layer lands here — a scan in a PDF wrapper, which under
    // `ocr-none` is bytes-only exactly as a PNG scan is.
    return { readerClass, text: null, extractor: CURRENT_EXTRACTOR, reason: 'READ_NOTHING', readFailed: false };
  }
  return { readerClass, text: text.normalize('NFC'), extractor: CURRENT_EXTRACTOR, reason: null, readFailed: false };
}
