import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// THE FOUR FIXTURE KINDS OF DOCUMENT STEP 29, GENERATED — plan :157 as amended
// 2026-09-23, flows §3 :280-:286.
//
// THE RESEARCHER RULED THEM SYNTHETIC (2026-09-23): "the fixtures are SYNTHETIC,
// generated deterministically, in the repo. A generated file carries no EXIF and
// is reproducible; the real XLSX and the paper are step 30's page."
//
// SO THIS MODULE IS THE FIXTURES' ONLY AUTHOR, and the committed bytes under
// `fixtures/documents/` are its output. `test/documentGuards.test.ts` regenerates
// them on every run and refuses a byte that differs — which is what makes
// "reproducible" a property a merge holds rather than a sentence in a doc.
//
// NODE BUILTINS ONLY, and that is the point rather than an economy. A generator
// that needed a dependency would put the fixture set behind the very choice the
// fixtures exist to judge, and `CURRENT_EXTRACTOR` is null precisely because that
// choice is the researcher's. `node:zlib` and `node:crypto` are the platform's.
//
// NO CLOCK, NO RANDOMNESS, NO FILESYSTEM. Every byte is a pure function of the
// constants below: the ZIP entries carry a fixed DOS timestamp, the PDF carries
// no `/CreationDate`, and the PNG carries no `tIME` chunk. A generated file has
// no EXIF to strip because nothing ever wrote one.
// ---------------------------------------------------------------------------

/** The four kinds, as flows §3 :280-:286 names them after the paste was retired. */
export const FIXTURE_KINDS = ['PDF_TEXT_LAYER', 'SCAN', 'SPREADSHEET', 'UNREADABLE'] as const;
export type FixtureKind = (typeof FIXTURE_KINDS)[number];

export interface Fixture {
  kind: FixtureKind;
  /** The committed file name under `fixtures/documents/`. */
  file: string;
  mimeType: string;
  /**
   * What a reader that works MUST return, in the words the fixture was built from.
   *
   * It is the ground truth and never the measurement: a candidate is scored by
   * comparing what it returned against this, and a candidate that returns nothing
   * is BYTES-ONLY and is counted as such, never as a failure (plan :169-:170).
   */
  groundTruth: string;
  /** Why this kind is in the set — the sentence the coverage measurement reports. */
  proves: string;
  bytes: () => Buffer;
}

// ---------------------------------------------------------------------------
// THE PRIMITIVES — CRC-32, PNG and ZIP, each written here because each is eight
// lines and a dependency for eight lines would be the choice this step defers.
// ---------------------------------------------------------------------------

const CRC_TABLE: readonly number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

/** CRC-32, the one both PNG chunks and ZIP entries are checked by. */
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (CRC_TABLE.at(((c ^ byte) & 0xff) >>> 0) ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value >>> 0, 0);
  return b;
}

function u16le(value: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value & 0xffff, 0);
  return b;
}

function u32le(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0, 0);
  return b;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  return Buffer.concat([u32be(data.length), typed, u32be(crc32(typed))]);
}

/**
 * An 8-bit greyscale PNG from a pixel grid — colour type 0, no interlace, filter 0.
 *
 * Greyscale because an OCR engine reads luminance and a colour fixture would
 * carry three bytes per pixel to say the same thing. `deflateSync` at a fixed
 * level so two runs produce identical bytes.
 */
function greyscalePng(width: number, height: number, pixel: (x: number, y: number) => number): Buffer {
  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0;
    for (let x = 0; x < width; x += 1) raw[y * (width + 1) + 1 + x] = pixel(x, y) & 0xff;
  }
  const ihdr = Buffer.concat([
    u32be(width),
    u32be(height),
    Buffer.from([8, 0, 0, 0, 0]),
  ]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * A ZIP with every entry STORED — method 0, no compression.
 *
 * Stored rather than deflated so the archive's bytes depend on nothing but the
 * entries, and a fixed DOS date so they depend on no clock. An XLSX is a ZIP of
 * XML parts, and a reader does not care whether they were compressed.
 */
function zip(entries: readonly ZipEntry[]): Buffer {
  const DOS_TIME = u16le(0);
  const DOS_DATE = u16le(((2026 - 1980) << 9) | (9 << 5) | 23);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const sum = crc32(entry.data);
    const common = Buffer.concat([
      u16le(20),
      u16le(0),
      u16le(0),
      DOS_TIME,
      DOS_DATE,
      u32le(sum),
      u32le(entry.data.length),
      u32le(entry.data.length),
      u16le(name.length),
      u16le(0),
    ]);
    const local = Buffer.concat([Buffer.from('PK\x03\x04', 'ascii'), common, name, entry.data]);
    locals.push(local);
    centrals.push(
      Buffer.concat([
        Buffer.from('PK\x01\x02', 'ascii'),
        u16le(20), // version made by
        common, // version needed · flags · method · time · date · crc · sizes · name and extra lengths
        u16le(0), // file comment length
        u16le(0), // disk number start
        u16le(0), // internal attributes
        u32le(0), // external attributes
        u32le(offset),
        name,
      ]),
    );
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  return Buffer.concat([
    Buffer.concat(locals),
    central,
    Buffer.from('PK\x05\x06', 'ascii'),
    u16le(0),
    u16le(0),
    u16le(entries.length),
    u16le(entries.length),
    u32le(central.length),
    u32le(offset),
    u16le(0),
  ]);
}

// ---------------------------------------------------------------------------
// 1 · A PDF WITH A TEXT LAYER.
//
// THE GROUND TRUTH IS LATIN, AND THE REASON IS THE FORMAT AND NOT A SHORTCUT.
// A text layer's bytes are drawn with a FONT, and the only fonts a PDF may name
// without embedding one are the base fourteen — Helvetica among them — none of
// which contains a Hebrew glyph. Hebrew in a text-layer PDF therefore requires an
// EMBEDDED font subset, which is the producing tool's business and not the
// reader's: a reader's job is to return the string the layer carries, whatever
// script it is in. So this fixture measures exactly that, and HEBREW COVERAGE IS
// MEASURED ON THE SCAN, which is where "an OCR engine that reads Hebrew"
// (plan :154-:155) actually bites.
// ---------------------------------------------------------------------------

const PDF_LINES = [
  'Ministry of Health - circular 4/2026',
  'The reporting channel for adverse events remained open',
  'throughout the period 3 September 2026 to 30 September 2026.',
] as const;

/** A PDF string literal's body — `(`, `)` and `\\` escaped. */
function pdfString(text: string): string {
  return text.replace(/([()\\])/g, '\\$1');
}

function pdfWithTextLayer(): Buffer {
  return pdfOf(
    [
      'BT',
      '/F1 12 Tf',
      '72 720 Td',
      '16 TL',
      ...PDF_LINES.map((line) => `(${pdfString(line)}) Tj T*`),
      'ET',
    ].join('\n'),
  );
}

/**
 * A one-page PDF around a content stream — Helvetica as `/F1`, US Letter, no `/CreationDate`.
 *
 * Shared by both text-layer PDFs, so the committed `pdf-text-layer.pdf` is byte-for-byte what it was before the second
 * one existed (`test/documentGuards.test.ts` regenerates it and refuses a changed byte).
 */
function pdfOf(stream: string): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${String(Buffer.byteLength(stream, 'latin1'))} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body, 'latin1');
  let xref = `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const at of offsets) xref += `${String(at).padStart(10, '0')} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefAt)}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer, 'latin1');
}

// ---------------------------------------------------------------------------
// 1b · THE SAME KIND, A SECOND FIXTURE — ONE WORD DRAWN AS TWO RUNS. Ruling 7 of
// `docs/gf-document-hebrew-text-layer-2026-09-24.md` §5 (:138–:141), CLOSED 2026-09-25.
//
// WHY IT EXISTS. The fixture above draws one run per line, so it reads the same under any join: a regression to
// joining every pdf.js item with a space would pass every case (§2b :76–:78). This one draws each line as TWO runs,
// each in its OWN marked-content sequence — `/Span BMC … EMC` makes pdf.js close an item at the boundary, which is how
// the producer of MK 05/2023 came to have its words split (§2 :50–:55) — with the gap between the runs placed by a `TJ`
// offset, so no width table is needed:
//
//   line 1   „Adv” | „erse …”      gap 0          one word          — the split the ruling names
//   line 2   „minis” | „try …”     gap 0.04 em    one word          — below the 0.047 ceiling of split pieces (§2b :70)
//   line 3   „-” | „the …”         gap 0.08 em    a space           — above the 0.077 floor of bullet dots (§2b :79)
//
// A SECOND FIXTURE OF KIND PDF_TEXT_LAYER, NOT A FIFTH KIND, AND NOT IN `FIXTURES`: plan step 29 (:157) rules FOUR kinds,
// and `FIXTURES` is pinned at four ENTRIES by `test/documentGuards.test.ts` and the contract case
// `test/document/content.test.ts` :130, while `extractor-coverage` prints its entries as kinds. It is not committed
// either: `test/documentPdfProcess.test.ts` writes these bytes to a temporary file for the compiled reader to read.
// Latin, for the reason the first fixture gives above — and the defect is not Hebrew-specific (§2 :54).
// ---------------------------------------------------------------------------

/**
 * Each line as its two runs, the gap before the second in font sizes, and what the line READS — written out rather
 * than computed, because a ground truth derived from the threshold would agree with any threshold.
 */
const SPLIT_RUN_LINES: readonly { first: string; second: string; gapEm: number; reads: string }[] = [
  { first: 'Adv', second: 'erse events were reported', gapEm: 0, reads: 'Adverse events were reported' },
  { first: 'to the minis', second: 'try within days', gapEm: 0.04, reads: 'to the ministry within days' },
  { first: '-', second: 'the channel stayed open', gapEm: 0.08, reads: '- the channel stayed open' },
];

function pdfWithSplitRuns(): Buffer {
  // A `TJ` number n moves the next glyph by -n/1000 of the font size, so a gap of g font sizes is n = -1000g.
  const run = (text: string, gapEm: number): string =>
    `/Span BMC [${gapEm === 0 ? '' : `${String(-Math.round(gapEm * 1000))} `}(${pdfString(text)})] TJ EMC`;
  return pdfOf(
    [
      'BT',
      '/F1 12 Tf',
      '72 720 Td',
      '16 TL',
      ...SPLIT_RUN_LINES.map((line) => `${run(line.first, 0)} ${run(line.second, line.gapEm)} T*`),
      'ET',
    ].join('\n'),
  );
}

/**
 * The split-run fixture — kind PDF_TEXT_LAYER, outside the four-kind set (see its section above).
 *
 * Its ground truth is what a reader that joins by geometry returns: the first two lines' words WHOLE, the bullet spaced.
 * Today's-join form of the same bytes — „Adv erse” — is asserted by the process test, so the fixture is proven to HOLD
 * the defect rather than assumed to.
 */
export const SPLIT_RUN_FIXTURE: Fixture = {
  kind: 'PDF_TEXT_LAYER',
  file: 'pdf-split-runs.pdf',
  mimeType: 'application/pdf',
  groundTruth: SPLIT_RUN_LINES.map((line) => line.reads).join('\n'),
  proves:
    'a word drawn as two runs reads WHOLE and a bullet gap reads as a space — the geometry join of ruling 3, which a ' +
    'join putting a space between every item fails',
  bytes: pdfWithSplitRuns,
};

// ---------------------------------------------------------------------------
// 2 · A SCAN — HEBREW, RASTERISED FROM A FONT ENCODED HERE.
//
// WHAT THIS FIXTURE IS, SAID BEFORE IT IS MEASURED: a raster of glyphs THIS FILE
// draws. It is a real PNG carrying real Hebrew text and it exercises the SCAN
// kind end to end — but an OCR score against it measures the engine ON THESE
// GLYPHS, which are clean, aligned, noiseless and of one hand. A real scan is
// none of those. So a number taken here is a LOWER BOUND on synthetic input and
// is NOT the judgement plan :154-:155 asks for; the real scan arrives at step 30
// (plan :182, the staging exercise), and the dated doc says so where it reports.
//
// The glyphs are 12 x 14 and the raster upscales them, because an engine wants
// x-heights well above ten pixels and a fixture drawn at its natural size would
// measure the SIZE rather than the shapes.
// ---------------------------------------------------------------------------

/** `#` is ink. One entry per character of the scan's ground truth, and no other. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  // Hebrew, right to left in the source string; drawn left to right here.
  א: [
    '.##.......##',
    '.##......##.',
    '..##....##..',
    '..##...##...',
    '...##.##....',
    '....###.....',
    '...##.##....',
    '..##...##...',
    '.##.....##..',
    '##.......##.',
    '##.......##.',
    '##.......##.',
    '............',
    '............',
  ],
  ב: [
    '############',
    '##........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '############',
    '############',
    '............',
    '............',
  ],
  // Dalet and resh differ by one column — dalet's vertical is inset, which is the
  // heel that tells them apart in print. Drawn so, rather than identically, because
  // a fixture whose two letters are the same shape would measure nothing about an
  // engine that confuses them.
  ד: [
    '############',
    '############',
    '.........##.',
    '.........##.',
    '.........##.',
    '.........##.',
    '.........##.',
    '.........##.',
    '.........##.',
    '.........##.',
    '.........##.',
    '.........##.',
    '............',
    '............',
  ],
  ה: [
    '############',
    '##........##',
    '..........##',
    '..........##',
    '.##.......##',
    '.##.......##',
    '.##.......##',
    '.##.......##',
    '.##.......##',
    '.##.......##',
    '.##.......##',
    '.##.......##',
    '............',
    '............',
  ],
  ו: [
    '......######',
    '......######',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '............',
    '............',
  ],
  י: [
    '.....#######',
    '.....#######',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
  ],
  מ: [
    '############',
    '##........##',
    '##........##',
    '##........##',
    '##........##',
    '##........##',
    '##........##',
    '##........##',
    '##........##',
    '##........##',
    '##........##',
    '.##########.',
    '............',
    '............',
  ],
  ר: [
    '############',
    '############',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '..........##',
    '............',
    '............',
  ],
  ש: [
    '##.....##..#',
    '##.....##.##',
    '##.....##.##',
    '##.....##.##',
    '##..#..##.##',
    '##..#..##.##',
    '##..#..##.##',
    '.##.#.##..##',
    '..#####...##',
    '...###....##',
    '############',
    '############',
    '............',
    '............',
  ],
  ת: [
    '############',
    '############',
    '..........##',
    '..........##',
    '.##.......##',
    '.##.......##',
    '.##.......##',
    '.##.......##',
    '.##.......##',
    '.##.......##',
    '###.......##',
    '###.......##',
    '............',
    '............',
  ],
  '0': [
    '..########..',
    '.##......##.',
    '##........##',
    '##........##',
    '##........##',
    '##........##',
    '##........##',
    '##........##',
    '##........##',
    '##........##',
    '.##......##.',
    '..########..',
    '............',
    '............',
  ],
  '2': [
    '..########..',
    '.##......##.',
    '##........##',
    '..........##',
    '.........##.',
    '........##..',
    '.......##...',
    '......##....',
    '.....##.....',
    '....##......',
    '..##........',
    '############',
    '............',
    '............',
  ],
  ' ': [
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
  ],
};

/**
 * The scan's ground truth.
 *
 * Hebrew, because the question the plan asks of the OCR engine is whether it
 * reads Hebrew; the digits are there so a run that reads nothing Hebrew still
 * reports whether the engine ran at all.
 */
const SCAN_TEXT = 'משרד הבריאות 2022';

const SCAN_SCALE = 4;
const SCAN_MARGIN = 24;

/**
 * The string in VISUAL order — right-to-left, with DIGIT RUNS LEFT TO RIGHT.
 *
 * A raster has no bidi algorithm, so the order is computed here, and the naive
 * spelling is wrong in a way only the rendered image showed: reversing the whole
 * string drew `2022` as `2202`. Numbers inside Hebrew text run left to right, so
 * the runs are reversed and the digits within a run are not — which is the one
 * bidi rule this fixture needs and the whole of it.
 */
function visualOrder(text: string): string[] {
  const isDigit = (c: string): boolean => c >= '0' && c <= '9';
  const runs: string[][] = [];
  for (const character of text) {
    const last = runs.at(-1);
    const head = last?.at(0);
    if (last === undefined || head === undefined || isDigit(head) !== isDigit(character)) {
      runs.push([character]);
    } else {
      last.push(character);
    }
  }
  return runs
    .reverse()
    .flatMap((run) => (isDigit(run.at(0) ?? '') ? run : [...run].reverse()));
}

function scanPng(): Buffer {
  const characters = visualOrder(SCAN_TEXT);
  const cell = 13;
  const glyphHeight = 14;
  const width = SCAN_MARGIN * 2 + characters.length * cell * SCAN_SCALE;
  const height = SCAN_MARGIN * 2 + glyphHeight * SCAN_SCALE;
  return greyscalePng(width, height, (x, y) => {
    const gx = x - SCAN_MARGIN;
    const gy = y - SCAN_MARGIN;
    if (gx < 0 || gy < 0) return 0xff;
    const character = characters.at(Math.floor(gx / (cell * SCAN_SCALE)));
    if (character === undefined) return 0xff;
    const rows = GLYPHS[character];
    if (rows === undefined) return 0xff;
    const row = rows.at(Math.floor(gy / SCAN_SCALE));
    if (row === undefined) return 0xff;
    return row.at(Math.floor((gx % (cell * SCAN_SCALE)) / SCAN_SCALE)) === '#' ? 0x00 : 0xff;
  });
}

// ---------------------------------------------------------------------------
// 3 · A SPREADSHEET — a real XLSX, because the real material is one.
//
// The researcher's first material is a peer-reviewed paper's supplementary XLSX
// (design session §3), and CSV would have made the fixture cheaper and the
// measurement worthless: a CSV reader costs no dependency at all, so a fixture
// set whose spreadsheet was a CSV would have judged nothing about the choice
// flows §3 :284 actually creates.
//
// INLINE STRINGS, so there is no `sharedStrings.xml` and a reader that handles
// only shared strings is CAUGHT by the fixture rather than flattered by it.
// ---------------------------------------------------------------------------

const SHEET_NAME = 'reports';
const SHEET_ROWS: readonly (readonly string[])[] = [
  ['month', 'reports', 'serious'],
  ['2022-01', '418', '37'],
  ['2022-02', '365', '29'],
  ['2022-03', '502', '44'],
];

function xlsxSpreadsheet(): Buffer {
  const cellRef = (row: number, column: number): string =>
    `${String.fromCharCode(65 + column)}${String(row + 1)}`;
  const rowsXml = SHEET_ROWS.map(
    (row, r) =>
      `<row r="${String(r + 1)}">${row
        .map(
          (value, c) =>
            `<c r="${cellRef(r, c)}" t="inlineStr"><is><t>${value}</t></is></c>`,
        )
        .join('')}</row>`,
  ).join('');
  return zip([
    {
      name: '[Content_Types].xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '</Types>',
        'utf8',
      ),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
        'utf8',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          `<sheets><sheet name="${SHEET_NAME}" sheetId="1" r:id="rId1"/></sheets>` +
          '</workbook>',
        'utf8',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '</Relationships>',
        'utf8',
      ),
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          `<sheetData>${rowsXml}</sheetData>` +
          '</worksheet>',
        'utf8',
      ),
    },
  ]);
}

/**
 * The spreadsheet's ground truth — the deterministic serialisation flows §3 :284
 * rules: the cells, SHEET BY SHEET, at a pinned version.
 *
 * It is written here as the shape a candidate is scored against, and it is NOT an
 * implementation: nothing under `src/` serialises a sheet until the researcher
 * has chosen the reader that parses one.
 */
const SPREADSHEET_GROUND_TRUTH = [`# ${SHEET_NAME}`, ...SHEET_ROWS.map((row) => row.join('\t'))].join('\n');

// ---------------------------------------------------------------------------
// 4 · A FILE NO ENGINE READS — §3 :284's "none of the above" row, the bytes-only arm.
//
// IT IS A TYPE OUTSIDE THE READER TABLE ENTIRELY, AND THAT IS THE WHOLE POINT.
// Round 1 made this fixture a PNG, which takes the IMAGE class — the same class,
// the same `OCR_NONE` reason and the same zero characters as the SCAN. Two of the
// four kinds were therefore INDISTINGUISHABLE by outcome, `NO_READER_FOR_TYPE` had
// no fixture at all, and a set the plan built to judge the extractor (:154-:157)
// measured THREE distinguishable answers instead of four.
//
// SO IT IS AUDIO, AND THE CHOICE IS THE BOARD'S RATHER THAN CONVENIENT. Board י1's
// approved drop-zone strip reads `קובץ אחד · PDF · XLSX · CSV · תמונה · שמע · וידאו · עד 50 MB`,
// so audio is an ACCEPTED type that no engine in this version reads — which is
// exactly §3 :284's fourth row rather than an invented one. It is also the real
// corpus case: flows §9 :1013 rules a video interview to be MEDIA plus a derived
// transcript, and the media itself is a document whose content IS its bytes.
//
// COUNTED AS BYTES-ONLY AND NEVER AS A FAILURE (plan :169-:170): the platform holds
// the bytes, the content version IS the bytes, and every assertion about it is
// UNCHECKED, with the reason.
//
// A MINIMAL RIFF/WAVE, WRITTEN HERE IN NODE BUILTINS like every other fixture: one
// 8-bit mono channel at 8 kHz and a sawtooth that is a pure function of the sample
// index. No clock, no randomness, and WAVE carries no metadata chunk to strip.
// ---------------------------------------------------------------------------

const AUDIO_SAMPLE_RATE = 8000;
const AUDIO_SAMPLES = 400;

function noReaderWav(): Buffer {
  const samples = Buffer.alloc(AUDIO_SAMPLES);
  for (let i = 0; i < AUDIO_SAMPLES; i += 1) samples[i] = (i * 7) & 0xff;
  const format = Buffer.concat([
    Buffer.from('fmt ', 'ascii'),
    u32le(16), // the PCM format chunk's length
    u16le(1), // PCM, uncompressed
    u16le(1), // one channel
    u32le(AUDIO_SAMPLE_RATE),
    u32le(AUDIO_SAMPLE_RATE), // byte rate = rate x blockAlign
    u16le(1), // block align
    u16le(8), // bits per sample
  ]);
  const data = Buffer.concat([Buffer.from('data', 'ascii'), u32le(samples.length), samples]);
  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), format, data]);
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), u32le(body.length), body]);
}

// ---------------------------------------------------------------------------
// THE SET
// ---------------------------------------------------------------------------

export const FIXTURES: readonly Fixture[] = [
  {
    kind: 'PDF_TEXT_LAYER',
    file: 'pdf-text-layer.pdf',
    mimeType: 'application/pdf',
    groundTruth: PDF_LINES.join('\n'),
    proves: 'the ordinary path: a reader returns the text layer, so a quoted span is PRESENT or ABSENT',
    bytes: pdfWithTextLayer,
  },
  {
    kind: 'SCAN',
    file: 'scan-hebrew.png',
    mimeType: 'image/png',
    groundTruth: SCAN_TEXT,
    proves:
      'whether an OCR engine reads Hebrew at all — a LOWER BOUND on synthetic glyphs, never the judgement ' +
      'plan :154-:155 asks for, which needs a real scan',
    bytes: scanPng,
  },
  {
    kind: 'SPREADSHEET',
    file: 'spreadsheet.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    groundTruth: SPREADSHEET_GROUND_TRUTH,
    proves:
      'the 2026-09-22 amendment (flows §3 :284): cells serialised deterministically sheet by sheet are ' +
      'COMPUTED, so a quoted NUMBER is checkable rather than UNCHECKED',
    bytes: xlsxSpreadsheet,
  },
  {
    kind: 'UNREADABLE',
    file: 'no-reader.wav',
    mimeType: 'audio/wav',
    groundTruth: '',
    proves:
      "§3 :284's fourth row, and the ONLY fixture that reaches NO_READER_FOR_TYPE: a type outside the " +
      'reader table, text null, contentVersionHash EQUALS docId, every assertion UNCHECKED — counted as ' +
      'bytes-only, NEVER as a failure',
    bytes: noReaderWav,
  },
];

/** `0x` + 64 lowercase hex — DOC_ID's display form, as `lib/documentIdentity` writes it. */
export function docIdOf(bytes: Buffer): string {
  return `0x${createHash('sha256').update(bytes).digest('hex')}`;
}
