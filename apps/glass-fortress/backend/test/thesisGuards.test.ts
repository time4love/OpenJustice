import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normaliseClaim } from '../src/lib/normalise';
import { HISTORY, SCHEMA, decoysFor, problemsWith, type CheckSpec } from './migrationChecks';
import { codeOf, readCode, tsFiles } from './walk/scan';

// ---------------------------------------------------------------------------
// THE THESIS LAYER'S GUARDS THAT A MERGE MUST PASS — thesis step 18.
//
// WHY THIS FILE IS IN THE UNIT PROJECT. It was written when only `unit` gated a merge and the
// thesis acceptance suite ran continue-on-error; since thesis step 25's remainder (2026-09-15)
// `npm run test:gf` runs every project, `thesis` included. A CHECK constraint is invisible to
// Prisma and to `db:check-drift`, so a case holding one is the ONLY thing that holds it — and a
// case in a project that gates nothing holds nothing a merge must pass.
//
// Each CHECK is held across the WHOLE ordered migration history, never one folder by
// name: it is ADDED by exactly one migration, every arm of it sits inside THAT
// statement, no LATER migration drops it, and `schema.prisma` names it in the model's
// `///` comment so a reader of the schema alone is not misled into thinking it absent.
// A constraint added and later dropped would otherwise pass forever on the file that
// added it. Whitespace is normalised by NORMALISE's one symbol, never a second spelling.
//
// And `lib/normalise.ts` imports nothing (thesis flows A1 :1247–:1250, as amended at
// step 18): a pure module never gains a dependency.
// ---------------------------------------------------------------------------

const BACKEND = join(__dirname, '..');

/**
 * Thesis flows A2 — each constraint, the model that names it, and its arms (each REQUIRES,
 * none forbids). The FOLD that holds them is `test/migrationChecks.ts`: it was written here
 * at thesis step 18 and moved to a module when document step 28 became its second caller,
 * so the mechanism has one home rather than two copies.
 */
const CHECKS: Record<string, CheckSpec> = {
  ThesisMention_fields_by_kind: {
    model: 'ThesisMention',
    // WIDENED AT DOCUMENT STEP 28, and the arm is written as "not TRAJECTORY" rather than
    // naming EVIDENCE and DOCUMENT. Thesis A2 :1284 requires the pin on EVIDENCE; document
    // flows A2 :1335 requires it on DOCUMENT; with three kinds those two ARE "not
    // TRAJECTORY". The spelling is forced, not chosen: that migration adds 'DOCUMENT' to
    // the enum, and Postgres refuses to USE a new enum value in the transaction that added
    // it — a migration file being ONE implicit transaction (§6 of the step-18 record).
    arms: [`"kind" = 'TRAJECTORY' OR "contentVersionHash" IS NOT NULL`],
  },
  ThesisGapDecision_fields_by_decision: {
    model: 'ThesisGapDecision',
    arms: [
      `("decision" <> 'CITED' OR "citedName" IS NOT NULL)`,
      `("decision" <> 'REQUESTED' OR ("request" IS NOT NULL AND jsonb_typeof("request") = 'object'))`,
      `("decision" <> 'CALLED' OR ("callItem" IS NOT NULL AND jsonb_typeof("callItem") = 'object'))`,
      `("decision" NOT IN ('CONCEDED', 'DISMISSED') OR "reason" IS NOT NULL)`,
    ],
  },
  Note_one_target: {
    model: 'Note',
    arms: [`("thesisId" IS NOT NULL) <> ("framingId" IS NOT NULL)`],
  },
};

type CheckName = keyof typeof CHECKS;

describe("the thesis layer's CHECK constraints — held where a merge must pass (thesis step 18)", () => {
  it('reads the history it holds them across — a silent zero would make every case vacuous', () => {
    expect(HISTORY.length).toBeGreaterThan(60);
  });

  for (const name of Object.keys(CHECKS) as CheckName[]) {
    it(`${name}: added by exactly one migration, every arm inside it, never dropped later, named in the schema`, () => {
      expect(problemsWith(HISTORY, SCHEMA, name, CHECKS[name])).toEqual([]);
    });

    it(`${name}: DETECTS the constraint removed, each arm removed, a later drop, the schema's name removed — every one red`, () => {
      const { histories } = decoysFor(HISTORY, name, CHECKS[name]);
      for (const history of histories) expect(problemsWith(history, SCHEMA, name, CHECKS[name])).not.toEqual([]);
      expect(problemsWith(HISTORY, SCHEMA.split(name).join('x'), name, CHECKS[name])).not.toEqual([]);
    });
  }
});

// A value import, a re-export, a side-effect import or a require — in code, comments stripped.
const IMPORT = /^\s*(?:import|export)\b[^;]*?\bfrom\s+['"]|^\s*import\s+['"]|\brequire\(\s*['"]/m;
const importsSomething = (code: string): boolean => IMPORT.test(codeOf(code));

describe('lib/normalise.ts imports nothing — thesis flows A1 :1247–:1250, as amended at thesis step 18', () => {
  it('lib/normalise.ts has no import, re-export, side-effect import or require', () => {
    expect(IMPORT.test(readCode(join(BACKEND, 'src', 'lib', 'normalise.ts')))).toBe(false);
  });

  it('DETECTS each shape planted in a module — and a comment naming an import does not fire', () => {
    for (const planted of [
      "import { prisma } from './prisma';",
      "import type { X } from '@prisma/client';",
      "export { y } from './htmlText';",
      "import './setup';",
      "const p = require('./prisma');",
    ]) {
      expect(importsSomething(`${planted}\nexport const a = 1;`)).toBe(true);
    }
    expect(importsSomething("// import { x } from './y';\nexport const a = 1;")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THE VERSION WRITE'S TWO SOURCE RULES — thesis step 20 (the R47 sketch §6-R9).
//
// Held HERE, in the project that gates, and not by widening `test/walk/pageLog.test.ts`, whose scan reads
// `src/walk/tools/` only. Both read CODE, comments stripped: a comment naming `prisma.$transaction(` is not a
// call (`resolveScanStop.ts` carries exactly such a comment).
//
//   (i)  every `$transaction(` in the step-20 thesis modules carries the shared window, `WRITE_TRANSACTION`
//        — Prisma's 5 s default is invisible to a suite that mocks Prisma (memory: the transaction window)
//   (ii) the version write creates a version's mentions in ONE `createMany`, never a `create` per row
//
// THE SUBJECTS are step 20's six modules — the version write and its five tools — and step 22's successors.
// ---------------------------------------------------------------------------

const STEP_20_MODULES = [
  'services/thesisVersionWrite.ts',
  'mcp/tools/createThesis.ts',
  'mcp/tools/addThesisVersion.ts',
  'mcp/tools/getThesisContext.ts',
  'mcp/tools/listTheses.ts',
  'mcp/tools/addNote.ts',
  // THE STEP-22 SUCCESSORS (R48 §6-11): none opens a transaction today — the analysis is ONE create and the loaders
  // read — so the case holds that none is bare, and a planted bare one reddens it.
  'services/criticMaterial.ts',
  'mcp/tools/runAnalysis.ts',
  'mcp/tools/decideGap.ts',
  'mcp/tools/draftFoiaRequest.ts',
  'mcp/tools/getWhistleblowerCall.ts',
  // THESIS STEP 23 (the R49 sketch §f2): the one evaluation of PUBLISHABLE(v) and the appeals' loader open no
  // transaction; readiness opens none; the two publication acts open ONE each — every one held not bare.
  'services/publicationEvaluation.ts',
  'services/publishedThesis.ts',
  'mcp/tools/checkPublicationReadiness.ts',
  'mcp/tools/publishThesis.ts',
  'mcp/tools/unpublishThesis.ts',
  // THESIS STEP 24 (the R50 sketch §f2): the author's list and its tool are reads and open no transaction — held not bare.
  'services/thesisReviews.ts',
  'mcp/tools/listThesisReviews.ts',
] as const;
/** The acts that must OPEN a transaction — so a case cannot pass because the write lost its transaction altogether. */
const OPENS_ONE = ['services/thesisVersionWrite.ts', 'mcp/tools/publishThesis.ts', 'mcp/tools/unpublishThesis.ts'] as const;
const VERSION_WRITE = 'services/thesisVersionWrite.ts';

const moduleCode = (module: string): string => readCode(join(BACKEND, 'src', module));
const transactions = (code: string): number => (codeOf(code).match(/\$transaction\s*\(/g) ?? []).length;
const windowed = (code: string): number => (codeOf(code).match(/,\s*WRITE_TRANSACTION\s*\)/g) ?? []).length;
const createsMentionsInBulk = (code: string): boolean => /\.thesisMention\.createMany\s*\(/.test(codeOf(code));
const createsMentionsOneByOne = (code: string): boolean => /\.thesisMention\.create\s*\(/.test(codeOf(code));

describe('the version write — one window, one bulk call (thesis step 20)', () => {
  it('(i) every $transaction( in the step-20 modules carries WRITE_TRANSACTION — and the version write and the two publication acts each open one', () => {
    expect(OPENS_ONE.filter((m) => transactions(moduleCode(m)) === 0)).toEqual([]);
    const unwindowed = STEP_20_MODULES.filter((m) => transactions(moduleCode(m)) !== windowed(moduleCode(m)));
    expect(unwindowed).toEqual([]);
  });

  it('(i) DETECTS a bare transaction — and a windowed one and a comment naming one do not fire', () => {
    const bare = 'return prisma.$transaction(async (tx) => write(tx));';
    const good = 'return prisma.$transaction(async (tx) => write(tx), WRITE_TRANSACTION);';
    expect(transactions(bare) === windowed(bare)).toBe(false);
    expect(transactions(good) === windowed(good)).toBe(true);
    expect(transactions('// two `prisma.$transaction(` sites would be two spellings\nconst a = 1;')).toBe(0);
  });

  it('(ii) services/thesisVersionWrite.ts calls thesisMention.createMany and never thesisMention.create(', () => {
    const code = moduleCode(VERSION_WRITE);
    expect({ bulk: createsMentionsInBulk(code), oneByOne: createsMentionsOneByOne(code) }).toEqual({ bulk: true, oneByOne: false });
  });

  it('(ii) DETECTS a create per row — and the bulk call and a comment naming create do not fire', () => {
    expect(createsMentionsOneByOne('for (const row of rows) await tx.thesisMention.create({ data: row });')).toBe(true);
    expect(createsMentionsOneByOne('await tx.thesisMention.createMany({ data: rows });')).toBe(false);
    expect(createsMentionsOneByOne('// never tx.thesisMention.create( per row\nconst a = 1;')).toBe(false);
    expect(createsMentionsInBulk('await tx.thesisMention.createMany({ data: rows });')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NO INVISIBLE CONTROL CHARACTER IN THE SOURCE — thesis step 22 (R48 chunk 2, REVIEW's M1).
//
// A raw NUL byte written as FINGERPRINT's part separator compiled, passed every case and read as an empty string in
// every editor and every diff: a byte the layout depends on, that no reviewer could see. The rule is over the WHOLE
// tree, never the one file it was found in — a code unit below 0x20 other than tab, LF and CR belongs in a source file
// only as an ESCAPE (`'\u0000'`), where it can be read.
// ---------------------------------------------------------------------------

/** Every code unit below 0x20 that is not tab, LF or CR — with its line. */
const invisibles = (text: string): { line: number; code: number }[] =>
  text.split('\n').flatMap((line, index) =>
    [...line]
      .map((ch) => ch.charCodeAt(0))
      .filter((code) => code < 0x20 && code !== 0x09 && code !== 0x0d)
      .map((code) => ({ line: index + 1, code })),
  );

describe('no invisible control character in src/ or test/ (thesis step 22)', () => {
  it('no .ts file under src/ or test/ holds a code unit below 0x20 other than tab, LF and CR', () => {
    const files = [...tsFiles(join(BACKEND, 'src')), ...tsFiles(join(BACKEND, 'test'))];
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.flatMap((file) =>
      invisibles(readFileSync(file, 'utf8')).map(({ line, code }) => `${file.slice(BACKEND.length + 1)}:${String(line)} U+${code.toString(16).padStart(4, '0')}`),
    );
    expect(offenders).toEqual([]);
  });

  it('DETECTS a NUL and a bell planted in a line — and tab, LF, CR and the ESCAPE spelling do not fire', () => {
    expect(invisibles(`const PART = '${String.fromCharCode(0)}';`)).toEqual([{ line: 1, code: 0 }]);
    expect(invisibles(`a\nb${String.fromCharCode(7)}`)).toEqual([{ line: 2, code: 7 }]);
    expect(invisibles("const PART = '\\u0000';\tconst b = 1;\r\nconst c = 2;\n")).toEqual([]);
  });
});
