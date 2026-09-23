import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CURRENT_EXTRACTOR } from '../src/lib/documentExtractor';

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
// ---------------------------------------------------------------------------

/** The backend workspace root — the cwd every operational script is invoked from. */
const ROOT = join(__dirname, '..');
const COMPILED = join(ROOT, 'dist', 'src', 'lib', 'documentExtractor.js');

/**
 * The sha256 of the text the compiled reader emits for the committed PDF fixture.
 *
 * STATED, so a change to the reader, to `pdfjs-dist`, or to the fixture's bytes has to be
 * a deliberate edit of this line rather than a number that quietly follows the code. It
 * was cross-checked at 152 characters with this prefix before it was written down; if a
 * run disagrees, something moved and THAT is the finding.
 */
const PDF_TEXT_SHA = '1c008321b45019d28db2b7c47fccf8a2b888416a7c840b4faf176bb813a39595';
const PDF_TEXT_CHARACTERS = 152;

/**
 * The child, as a program rather than a file.
 *
 * It is inline so it travels with the case that reads it and is type-checked as part of
 * this file's source; a sibling `.js` in `test/` would be neither. It prints ONE JSON
 * object on stdout and nothing else, so a stray log from a dependency cannot be parsed as
 * the measurement.
 */
const CHILD = `
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const compiled = require(process.argv[1]);
void (async () => {
  const bytes = readFileSync(join(process.cwd(), 'fixtures', 'documents', 'pdf-text-layer.pdf'));
  const extraction = await compiled.extract(bytes, 'application/pdf');
  process.stdout.write(JSON.stringify({
    sha: extraction.text === null ? null : createHash('sha256').update(extraction.text, 'utf8').digest('hex'),
    characters: extraction.text === null ? 0 : extraction.text.length,
    reason: extraction.reason === null ? 'COMPUTED' : extraction.reason,
    extractor: compiled.CURRENT_EXTRACTOR,
  }));
})();
`;

interface ChildReading {
  sha: string | null;
  characters: number;
  reason: string;
  extractor: string;
}

/**
 * Run the compiled reader in a child `node` and return what it printed.
 *
 * `compiled` is a parameter so a decoy can point it at a path that does not exist and
 * watch this throw — the arm below is not reachable any other way.
 */
function readInChildProcess(compiled: string): ChildReading {
  if (!existsSync(compiled)) {
    throw new Error(
      `documentPdfProcess: ${compiled} does not exist, so the compiled reader was not measured. ` +
        'Run `npm run build` first; CI does it at .github/workflows/tests.yml :64-:66. ' +
        'This THROWS rather than skipping: a case that skips when its subject is absent reports nothing and looks like coverage.',
    );
  }
  const printed = execFileSync(process.execPath, ['-e', CHILD, compiled], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return JSON.parse(printed) as ChildReading;
}

describe('the PDF reader, in a child process over the compiled module', () => {
  let reading: ChildReading;

  beforeAll(() => {
    reading = readInChildProcess(COMPILED);
  }, 60_000);

  it('THE VACUITY GUARD: the compiled module and the source agree on CURRENT_EXTRACTOR', () => {
    // FIRST, because every other case below is meaningless if `dist/` is stale — it would
    // be measuring an older reader and reporting it as today's. This is not an mtime
    // comparison: it asks both copies what they HOLD.
    expect(reading.extractor).toBe(CURRENT_EXTRACTOR);
  });

  it('reads the committed PDF fixture and emits the pinned text — COMPUTED, 152 characters', () => {
    expect(reading.reason).toBe('COMPUTED');
    expect(reading.characters).toBe(PDF_TEXT_CHARACTERS);
    expect(reading.sha).toBe(PDF_TEXT_SHA);
  });

  it('DETECTS a missing dist/ by THROWING, and names what to do — never a skip', () => {
    // The arm the guard above depends on, exercised rather than assumed. A case that
    // trusted `existsSync` without ever running the false branch would leave the one
    // behaviour that separates "not built" from "built and wrong" untested.
    expect(() => readInChildProcess(join(ROOT, 'dist', 'src', 'lib', 'noSuchModule.js'))).toThrow(
      /does not exist, so the compiled reader was not measured/,
    );
  });
});
