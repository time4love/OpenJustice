import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CURRENT_EXTRACTOR, PDF_JOIN_GAP_EM } from '../src/lib/documentExtractor';
import { FIXTURES, SPLIT_RUN_FIXTURE } from './documentFixtureBytes';

// ---------------------------------------------------------------------------
// THE PDF READER, IN A CHILD `node` OVER `dist/` — RULED BY THE RESEARCHER 2026-09-23.
//
// THE PROBLEM THIS SOLVES. `pdfjs-dist` 6.3.289 is ESM-ONLY and jest's module registry
// cannot load it: `await import()` compiled to `require()`, Node's own `createRequire`,
// and a native import hidden from the transform were each measured failing, and
// `src/lib/documentExtractor.ts`'s header records all three with their errors. So the
// PDF arm — the ordinary path, the one kind of document whose text a thesis will most
// often quote — was asserted by NOTHING in any project.
//
// WHY NOT THE OBVIOUS FIXES, so nobody re-measures them:
//
//   · `NODE_OPTIONS=--experimental-vm-modules npm test` was measured ON THE WHOLE GATING
//     RUN and BREAKS IT: 179 suites passed / 7 failed, 3105 cases where the control runs
//     3199 — 93 cases never executed. Six of the seven are one cause in one project:
//     every `test/extraction/*` suite fails to load with "Must use import to load ES
//     Module: node_modules/@exodus/bytes/encoding-lite.js … requires Node v24.9+", and
//     this repository pins `engines: node >=22` and runs 22.20. A flag that silently
//     stops 93 cases from running is not a fix; it is a blinded suite.
//   · A SECOND JEST PROJECT or a `test:pdf` script would be one rule with two
//     implementations, and a job that is not on `staging`'s required list holds nothing —
//     `docs/gf-thesis-step-18-2026-09-11.md` §7, "a guard in a job that gates nothing
//     holds nothing", which is why that step's CHECK cases moved into the unit project.
//
// SO THE READER IS RUN THE WAY PRODUCTION RUNS IT: a child `node` over the COMPILED
// module, which is exactly what `dist/` and every operational script do. Precedent:
// `docs/gf-evidence-step-15-2026-09-10.md` — "the returned exit code held by nothing
// until a process-level test".
//
// IT DEPENDS ON THE BUILD, AND CI ALREADY RUNS ONE. `.github/workflows/tests.yml`
// :64-:66 runs `npm run build` in `apps/glass-fortress/backend` BEFORE `npm test`, so
// `dist/` is present in the required run without any change to the workflow. Locally,
// `npm run build` first.
//
// THE VACUITY GUARD IS THE POINT, AND IT IS NOT AN mtime. A process-level test over a
// STALE `dist/` measures old code and goes green about nothing — the exact shape of a
// control that proves an instrument RAN rather than that it SEES. So the child prints
// `CURRENT_EXTRACTOR` AS THE COMPILED MODULE HOLDS IT, and the case compares it against
// the value ts-jest loads from `src/`. A `dist/` built before the constant moved fails
// LOUDLY, by name, saying which two values disagree. A MISSING `dist/` THROWS by name —
// never a skip, never a pass: a case that skips itself when its subject is absent is a
// case that reports nothing and looks like coverage.
//
// TWO PDFs ARE READ (R83, the reader fix — `docs/gf-document-hebrew-text-layer-2026-09-24.md` §5 rulings 3 and 7). The
// committed fixture draws one run per line and reads the same under any join, so it cannot hold the join; the SPLIT-RUN
// fixture draws a word as two runs and can. Its bytes come from the repository's own generator and are written to a
// temporary file here — never committed (`documentFixtureBytes.ts` says why). And a fixture that silently stopped
// splitting would hold nothing, so the child ALSO reads its raw pdf.js items and joins them the way `v1` did: the case
// below requires that reading to be SPLIT, on both split lines.
// ---------------------------------------------------------------------------

/** The backend workspace root — the cwd every operational script is invoked from. */
const ROOT = join(__dirname, '..');
const COMPILED = join(ROOT, 'dist', 'src', 'lib', 'documentExtractor.js');

function fixtureOfKind(kind: string): (typeof FIXTURES)[number] {
  const found = FIXTURES.find((fixture) => fixture.kind === kind);
  if (found === undefined) throw new Error(`documentPdfProcess: no ${kind} fixture in FIXTURES`);
  return found;
}

/** The committed text-layer fixture — its ground truth is the three lines it draws, `\n`-joined. */
const COMMITTED = fixtureOfKind('PDF_TEXT_LAYER');

/**
 * The child, as a program rather than a file.
 *
 * It is inline so it travels with the case that reads it and is type-checked as part of this file's source; a sibling
 * `.js` in `test/` would be neither. It prints ONE JSON object on stdout and nothing else, so a stray log from a
 * dependency cannot be parsed as the measurement. Plain `node` may load `pdfjs-dist` (Node 22's `require(esm)`), which is
 * how the RAW items are read beside the compiled reader's answer.
 */
const CHILD = `
const { readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const compiled = require(process.argv[1]);
const splitPath = process.argv[2];
const read = async (bytes) => {
  const extraction = await compiled.extract(bytes, 'application/pdf');
  return { text: extraction.text, reason: extraction.reason === null ? 'COMPUTED' : extraction.reason };
};
const rawItems = async (bytes) => {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
  const standardFontDataUrl = join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/';
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, standardFontDataUrl });
  try {
    const page = await (await task.promise).getPage(1);
    return (await page.getTextContent()).items.filter((item) => 'str' in item);
  } finally {
    await task.destroy();
  }
};
void (async () => {
  const committed = await read(readFileSync(join(process.cwd(), 'fixtures', 'documents', 'pdf-text-layer.pdf')));
  const splitBytes = readFileSync(splitPath);
  const split = await read(splitBytes);
  const items = await rawItems(splitBytes);
  process.stdout.write(JSON.stringify({
    extractor: compiled.CURRENT_EXTRACTOR,
    gapEm: compiled.PDF_JOIN_GAP_EM,
    committed,
    split,
    raw: {
      items: items.length,
      joinedWithSpaces: items.map((item) => item.str).join(' '),
      shapedAsTheJoinReads: items.every((item) =>
        typeof item.str === 'string' && Array.isArray(item.transform) && item.transform.length === 6 &&
        item.transform.every((n) => typeof n === 'number') && typeof item.width === 'number' &&
        typeof item.hasEOL === 'boolean'),
    },
  }));
})();
`;

interface ChildReading {
  extractor: string;
  gapEm: number;
  committed: { text: string | null; reason: string };
  split: { text: string | null; reason: string };
  raw: { items: number; joinedWithSpaces: string; shapedAsTheJoinReads: boolean };
}

/**
 * Run the compiled reader in a child `node` and return what it printed.
 *
 * `compiled` is a parameter so a decoy can point it at a path that does not exist and watch this throw — the arm below
 * is not reachable any other way.
 */
function readInChildProcess(compiled: string, splitPath: string): ChildReading {
  if (!existsSync(compiled)) {
    throw new Error(
      `documentPdfProcess: ${compiled} does not exist, so the compiled reader was not measured. ` +
        'Run `npm run build` first; CI does it at .github/workflows/tests.yml :64-:66. ' +
        'This THROWS rather than skipping: a case that skips when its subject is absent reports nothing and looks like coverage.',
    );
  }
  const printed = execFileSync(process.execPath, ['-e', CHILD, compiled, splitPath], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return JSON.parse(printed) as ChildReading;
}

describe('the PDF reader, in a child process over the compiled module', () => {
  let directory: string;
  let splitPath: string;
  let reading: ChildReading;

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'pdf-split-runs-'));
    splitPath = join(directory, SPLIT_RUN_FIXTURE.file);
    writeFileSync(splitPath, SPLIT_RUN_FIXTURE.bytes());
    reading = readInChildProcess(COMPILED, splitPath);
  }, 60_000);

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('THE VACUITY GUARD: the compiled module and the source agree on CURRENT_EXTRACTOR and the join threshold', () => {
    // FIRST, because every other case below is meaningless if `dist/` is stale — it would be measuring an older reader
    // and reporting it as today's. This is not an mtime comparison: it asks both copies what they HOLD.
    expect(reading.extractor).toBe(CURRENT_EXTRACTOR);
    expect(reading.gapEm).toBe(PDF_JOIN_GAP_EM);
  });

  it('reads the committed PDF fixture as EXACTLY its ground truth — COMPUTED, one line per drawn line', () => {
    // Under `v1` this read the same three lines joined by spaces (152 characters either way); a line now ends in `\n`.
    expect(reading.committed.reason).toBe('COMPUTED');
    expect(reading.committed.text).toBe(COMMITTED.groundTruth);
  });

  it('THE FIXTURE HOLDS THE DEFECT: its raw pdf.js items, joined as v1 joined them, read the word SPLIT', () => {
    // Without this, a generator that drew each line as ONE run would still read its ground truth under the new join, and
    // the fixture would silently stop holding what ruling 7 made it for (§2b :76–:78).
    expect(reading.raw.items).toBeGreaterThanOrEqual(6);
    expect(reading.raw.joinedWithSpaces).toContain('Adv erse');
    // Line 2 too: the 0.04 em split floor, on REAL pdf.js geometry, must stay two runs (R83 review Entry 5).
    expect(reading.raw.joinedWithSpaces).toContain('minis try');
    expect(reading.raw.joinedWithSpaces).not.toBe(SPLIT_RUN_FIXTURE.groundTruth);
  });

  it('pdf.js’s real items carry the four fields the join reads — the unit test’s doubles answer what pdf.js answers', () => {
    expect(reading.raw.shapedAsTheJoinReads).toBe(true);
  });

  it('reads the split-run fixture as EXACTLY its ground truth — the word WHOLE, the split floor whole, the bullet spaced', () => {
    expect(reading.split.reason).toBe('COMPUTED');
    expect(reading.split.text).toBe(SPLIT_RUN_FIXTURE.groundTruth);
    expect(reading.split.text).toContain('Adverse');
    expect(reading.split.text).toContain('ministry');
    expect(reading.split.text).toContain('- the channel');
  });

  it('LINE-SIZED: one line of text per drawn line, so verify_claim_text’s ±2-line context is lines, not a page', () => {
    // `v1` wrote `\n` only between pages, so "±2 lines" around a PDF match was up to a whole page (R81 Entry 26's LOW).
    const lines = SPLIT_RUN_FIXTURE.groundTruth.split('\n').length;
    expect(lines).toBe(3);
    expect(reading.split.text?.split('\n')).toHaveLength(lines);
    expect(reading.committed.text?.split('\n')).toHaveLength(COMMITTED.groundTruth.split('\n').length);
  });

  it('DETECTS a missing dist/ by THROWING, and names what to do — never a skip', () => {
    // The arm the guard above depends on, exercised rather than assumed. A case that trusted `existsSync` without ever
    // running the false branch would leave the one behaviour that separates "not built" from "built and wrong" untested.
    expect(() => readInChildProcess(join(ROOT, 'dist', 'src', 'lib', 'noSuchModule.js'), splitPath)).toThrow(
      /does not exist, so the compiled reader was not measured/,
    );
  });
});
