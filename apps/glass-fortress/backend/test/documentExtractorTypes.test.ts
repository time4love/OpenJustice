import { CURRENT_EXTRACTOR, extract } from '../src/lib/documentExtractor';

// ---------------------------------------------------------------------------
// DOCUMENT STEP 29 (b), ROUND 2 — A TYPE THE READER TABLE ACCEPTS IS A TYPE
// `extract` ANSWERS FOR. Flows §3 :284, board י1's approved drop-zone strip.
//
// WHAT ROUND 1 SHIPPED, and it was found by a probe and not by a test: `text/csv`
// and `application/vnd.ms-excel` were both on the SPREADSHEET list and both reached
// `workbook.xlsx.load`, which raised `Can't find end of central directory : is this
// a zip file ?` — because neither is a zip. §3 :284 names a SPREADSHEET as
// "(XLSX, CSV)" and board י1 draws CSV as an accepted type, so a CSV document is a
// world the design CREATES and no clause forbids: the defect stood.
//
// THE TWO ANSWERS, and they are different answers on purpose. CSV gains a READER —
// one kind, two containers, the SAME serialisation. The legacy `.xls` type comes OFF
// the list: `exceljs` cannot read a BIFF compound file and no clause asks for it, so
// it falls to `NO_READER_FOR_TYPE`, which is honest and which the caller can act on.
//
// THESE CASES RUN THE GENUINE READER. `exceljs` is CommonJS and loads under jest;
// `pdfjs-dist` 6.3.289 is ESM-only and does not, in any project of this config, so
// THE PDF ARM IS ASSERTED BY NOTHING HERE and is measured by `extractor-coverage`
// instead. Named rather than implied.
// ---------------------------------------------------------------------------

const CSV = Buffer.from('month,reports,serious\n2022-01,418,37\n2022-02,365,29\n', 'utf8');

describe('§3 :284 — a SPREADSHEET is XLSX *or* CSV, and CSV is READ rather than raised on', () => {
  it('text/csv yields COMPUTED text in the one serialisation — `# <sheet>` then tab-joined cells', async () => {
    const extraction = await extract(CSV, 'text/csv');

    expect(extraction.reason).toBeNull();
    expect(extraction.readerClass).toBe('SPREADSHEET');
    expect(extraction.text).toBe(['# sheet1', 'month\treports\tserious', '2022-01\t418\t37', '2022-02\t365\t29'].join('\n'));
  });

  it('a PARAMETERISED type is the same type — `text/csv; charset=utf-8` routes identically', async () => {
    const plain = await extract(CSV, 'text/csv');
    const parameterised = await extract(CSV, 'text/csv; charset=utf-8');

    expect(parameterised.text).toBe(plain.text);
    expect(parameterised.readerClass).toBe('SPREADSHEET');
  });

  it('a DATE-SHAPED CSV CELL IS NOT COERCED — `csvraw`, and it is a determinism property', async () => {
    // MEASURED, not assumed: `exceljs`'s DEFAULT csv map parses `2022-01-15` with dayjs
    // IN THE HOST'S LOCAL TIMEZONE, giving `2022-01-14T22:00:00.000Z` on a UTC+2 laptop
    // and `2022-01-14T15:00:00.000Z` under TZ=Asia/Tokyo. The same bytes would then
    // compute two different texts, and "pinned at a version" would be a fiction — the
    // second machine's citation would read ABSENT against the first machine's document.
    // It is also the truthful reading: a CSV HAS NO CELL TYPES, so every cell is text.
    const dated = Buffer.from('when,n\n2022-01-15,418\n', 'utf8');

    const extraction = await extract(dated, 'text/csv');

    expect(extraction.text).toBe(['# sheet1', 'when\tn', '2022-01-15\t418'].join('\n'));
    // The shape of the failure this guards against, stated so it cannot be mistaken for
    // a formatting preference: no ISO instant, from any timezone, may appear.
    expect(extraction.text).not.toMatch(/T\d{2}:\d{2}:\d{2}/);
  });
});

describe('a type the table does NOT accept falls to NO_READER_FOR_TYPE — it never raises', () => {
  it('application/vnd.ms-excel is OFF the spreadsheet list — exceljs cannot read BIFF', async () => {
    // It is the legacy `.xls` compound file, not a zip. On the list it reached
    // `workbook.xlsx.load` and threw; off it, the content is the bytes, which is true.
    const extraction = await extract(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), 'application/vnd.ms-excel');

    expect(extraction.reason).toBe('NO_READER_FOR_TYPE');
    expect(extraction.text).toBeNull();
    expect(extraction.extractor).toBeNull();
  });

  it('an IMAGE is OCR_NONE and not NO_READER_FOR_TYPE — a decision, never a missing dependency', async () => {
    const extraction = await extract(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/jpeg');

    expect(extraction.readerClass).toBe('IMAGE');
    expect(extraction.reason).toBe('OCR_NONE');
  });

  it('EVERY accepted spreadsheet type answers rather than throwing — the property, over the list', async () => {
    // The floor: each type below is one `readerClassOf` accepts, and `extract` returns
    // an `Extraction` for each. A case that only proved "no throw" would be satisfied by
    // a reader that answered nothing, so the reasons are asserted too.
    const accepted = ['text/csv', 'TEXT/CSV', 'text/csv;charset=utf-8'] as const;

    for (const type of accepted) {
      const extraction = await extract(CSV, type);
      expect(extraction.readerClass).toBe('SPREADSHEET');
      expect(extraction.reason).toBeNull();
      expect(extraction.text).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// THE FOUR BYTES-ONLY REASONS ARE FOUR DIFFERENT FACTS — A2 :1300, A7 :1591,
// RULED BY THE RESEARCHER 2026-09-23.
//
// A CORRUPT FILE OF AN ACCEPTED TYPE IS ACCEPTED AS BYTES-ONLY AND NEVER REFUSED.
// A refusal would turn the platform's OWN READER FAILING into a reason to hold nothing —
// the document turned away at the door because of a defect on this side of it. And A5
// :1493's `UNREADABLE` refuses a KEY THAT DOES NOT OPEN A CIPHERTEXT, an entirely
// different fact about an entirely different actor; the two must not share one spelling.
//
// `extractor-coverage` COUNTS THEM APART because a broken PDF and a photograph are the
// same COUNT and not the same FACT (A7 :1591): one is a document the platform could not
// read, the other a document there is nothing to read in.
// ---------------------------------------------------------------------------

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('a reader that was SELECTED and THREW — `READ_FAILED`, never a refusal', () => {
  it('a corrupt workbook of an accepted type is BYTES-ONLY with readFailed, and does NOT throw', async () => {
    // Not a zip at all. Round 2's reader raised `Can't find end of central directory`
    // straight out of `extract`, which would have reached `add_document` as a 500.
    const extraction = await extract(Buffer.from('this is not a workbook at all', 'utf8'), XLSX);

    expect(extraction.reason).toBe('READ_FAILED');
    expect(extraction.readFailed).toBe(true);
    expect(extraction.text).toBeNull();
    // The READER is named even though it failed: which extractor could not read this is
    // provenance, and the row keeps it.
    expect(extraction.extractor).toBe(CURRENT_EXTRACTOR);
  });

  it('a TRUNCATED zip is the same answer — the arm is the reader throwing, not one error string', async () => {
    const extraction = await extract(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]), XLSX);

    expect(extraction.reason).toBe('READ_FAILED');
    expect(extraction.readFailed).toBe(true);
  });
});

describe('a reader that RAN and found nothing — `READ_NOTHING`, a different fact', () => {
  it('an EMPTY spreadsheet is bytes-only, and its text is not the serialiser\u2019s own header', async () => {
    // THE FLOOR UNDER THE WHOLE REGISTER. Before this, an empty workbook came back
    // COMPUTED with the text `# sheet1` — a string this repository's serialiser invented,
    // whose hash would then have become the document's content version instead of the
    // document's commitment (A1 :1243 as CONFORMED 2026-09-26, R85 Q-G). A serialiser must not author content under
    // the document's name, and `READ_NOTHING` was unreachable for a spreadsheet while it did.
    const extraction = await extract(Buffer.alloc(0), 'text/csv');

    expect(extraction.reason).toBe('READ_NOTHING');
    expect(extraction.readFailed).toBe(false);
    expect(extraction.text).toBeNull();
  });

  it('a workbook of EMPTY CELLS is bytes-only too — structure is not content', async () => {
    const extraction = await extract(Buffer.from('\n\n', 'utf8'), 'text/csv');

    expect(extraction.reason).toBe('READ_NOTHING');
    expect(extraction.readFailed).toBe(false);
  });

  it('and a workbook with ONE cell is COMPUTED — the floor, so the two above are not a blinded reader', async () => {
    const extraction = await extract(Buffer.from('x\n', 'utf8'), 'text/csv');

    expect(extraction.reason).toBeNull();
    expect(extraction.text).toBe('# sheet1\nx');
  });
});

describe('the four reasons are four DISTINCT answers, and only one sets readFailed', () => {
  it('READ_FAILED \u00b7 READ_NOTHING \u00b7 NO_READER_FOR_TYPE \u00b7 OCR_NONE', async () => {
    const answers = await Promise.all([
      extract(Buffer.from('not a workbook', 'utf8'), XLSX),
      extract(Buffer.alloc(0), 'text/csv'),
      extract(Buffer.from('x'), 'application/zip'),
      extract(Buffer.from('x'), 'image/png'),
    ]);

    expect(answers.map((answer) => answer.reason)).toEqual([
      'READ_FAILED',
      'READ_NOTHING',
      'NO_READER_FOR_TYPE',
      'OCR_NONE',
    ]);
    // EXACTLY ONE sets `readFailed` — the column exists to separate that one arm from the
    // other three, and a field true for all of them would count nothing apart.
    expect(answers.map((answer) => answer.readFailed)).toEqual([true, false, false, false]);
    // Every one of them is bytes-only, and NONE of them threw: that is the ruling.
    expect(answers.every((answer) => answer.text === null)).toBe(true);
  });
});
