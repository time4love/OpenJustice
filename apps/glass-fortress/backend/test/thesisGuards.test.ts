import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { normaliseClaim } from '../src/lib/normalise';
import { codeOf, readCode } from './walk/scan';

// ---------------------------------------------------------------------------
// THE THESIS LAYER'S GUARDS THAT A MERGE MUST PASS — thesis step 18.
//
// WHY THIS FILE IS IN THE UNIT PROJECT. Only `npm run test:gf` is a required check
// (.github/workflows/tests.yml); the thesis acceptance suite runs beside it,
// continue-on-error, until thesis step 25. A CHECK constraint is invisible to Prisma
// and to `db:check-drift`, so a case holding one is the ONLY thing that holds it —
// and a case in a project that gates nothing holds nothing a merge must pass.
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
const MIGRATIONS_DIR = join(BACKEND, 'prisma', 'migrations');
const SCHEMA = readFileSync(join(BACKEND, 'prisma', 'schema.prisma'), 'utf8');

interface Migration {
  name: string;
  sql: string;
}

const HISTORY: readonly Migration[] = readdirSync(MIGRATIONS_DIR)
  .sort()
  .map((name) => ({ name, file: join(MIGRATIONS_DIR, name, 'migration.sql') }))
  .filter(({ file }) => existsSync(file))
  .map(({ name, file }) => ({ name, sql: readFileSync(file, 'utf8') }));

/** Thesis flows A2 — each constraint, the model that names it, and its arms (each REQUIRES, none forbids). */
const CHECKS = {
  ThesisMention_fields_by_kind: {
    model: 'ThesisMention',
    arms: [`"kind" <> 'EVIDENCE' OR "contentVersionHash" IS NOT NULL`],
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
} as const;

type CheckName = keyof typeof CHECKS;

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The statement that adds `name`, whole. */
const addingStatement = (sql: string, name: string): string | undefined =>
  new RegExp(`ALTER TABLE "\\w+" ADD CONSTRAINT "${escaped(name)}" CHECK \\([\\s\\S]*?\\);`).exec(sql)?.[0];

/** The `///` comment immediately above `model <name> {`. */
const modelComment = (schema: string, model: string): string =>
  new RegExp(`((?:^///[^\\n]*\\n)+)model ${model} \\{`, 'm').exec(schema)?.[1] ?? '';

/** Everything wrong with how `name` is held — empty when it is held. */
function problemsWith(history: readonly Migration[], schema: string, name: CheckName): string[] {
  const { model, arms } = CHECKS[name];
  const adders = history.filter(({ sql }) => addingStatement(sql, name) !== undefined);
  const adder = adders.at(0);
  if (adders.length !== 1 || adder === undefined) {
    return [`${name}: added by ${String(adders.length)} migrations, not exactly one`];
  }
  const body = normaliseClaim(addingStatement(adder.sql, name) ?? '');
  const problems = arms.filter((arm) => !body.includes(normaliseClaim(arm))).map((arm) => `${name}: arm missing — ${arm}`);
  const dropped = new RegExp(`DROP CONSTRAINT (?:IF EXISTS )?"${escaped(name)}"`);
  problems.push(
    ...history
      .slice(history.indexOf(adder) + 1)
      .filter(({ sql }) => dropped.test(sql))
      .map((later) => `${name}: dropped later by ${later.name}`),
  );
  if (!modelComment(schema, model).includes(name)) problems.push(`${name}: not named in model ${model}'s /// comment`);
  return problems;
}

describe("the thesis layer's CHECK constraints — held where a merge must pass (thesis step 18)", () => {
  it('reads the history it holds them across — a silent zero would make every case vacuous', () => {
    expect(HISTORY.length).toBeGreaterThan(60);
  });

  for (const name of Object.keys(CHECKS) as CheckName[]) {
    it(`${name}: added by exactly one migration, every arm inside it, never dropped later, named in the schema`, () => {
      expect(problemsWith(HISTORY, SCHEMA, name)).toEqual([]);
    });

    it(`${name}: DETECTS the constraint removed, each arm removed, a later drop, the schema's name removed — every one red`, () => {
      const adder = HISTORY.find(({ sql }) => addingStatement(sql, name) !== undefined);
      if (adder === undefined) throw new Error(`${name} is added by no migration — there is nothing to plant a decoy on`);
      const statement = addingStatement(adder.sql, name) ?? '';
      const withAdder = (sql: string): Migration[] => HISTORY.map((m) => (m === adder ? { name: m.name, sql } : m));
      const armRemoved = CHECKS[name].arms.map((arm) => {
        const cut = normaliseClaim(statement).replace(normaliseClaim(arm), 'TRUE');
        expect(cut).not.toBe(normaliseClaim(statement));
        return withAdder(adder.sql.replace(statement, cut));
      });
      const decoys: readonly (readonly Migration[])[] = [
        withAdder(adder.sql.replace(statement, '')),
        ...armRemoved,
        [...HISTORY, { name: '29990101000000_a_later_drop', sql: `ALTER TABLE "${CHECKS[name].model}" DROP CONSTRAINT "${name}";` }],
      ];
      for (const history of decoys) expect(problemsWith(history, SCHEMA, name)).not.toEqual([]);
      expect(problemsWith(HISTORY, SCHEMA.split(name).join('x'), name)).not.toEqual([]);
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
// THE SUBJECTS are step 20's six modules: the version write and its five tools.
// ---------------------------------------------------------------------------

const STEP_20_MODULES = [
  'services/thesisVersionWrite.ts',
  'mcp/tools/createThesis.ts',
  'mcp/tools/addThesisVersion.ts',
  'mcp/tools/getThesisContext.ts',
  'mcp/tools/listTheses.ts',
  'mcp/tools/addNote.ts',
] as const;
const VERSION_WRITE = 'services/thesisVersionWrite.ts';

const moduleCode = (module: string): string => readCode(join(BACKEND, 'src', module));
const transactions = (code: string): number => (codeOf(code).match(/\$transaction\s*\(/g) ?? []).length;
const windowed = (code: string): number => (codeOf(code).match(/,\s*WRITE_TRANSACTION\s*\)/g) ?? []).length;
const createsMentionsInBulk = (code: string): boolean => /\.thesisMention\.createMany\s*\(/.test(codeOf(code));
const createsMentionsOneByOne = (code: string): boolean => /\.thesisMention\.create\s*\(/.test(codeOf(code));

describe('the version write — one window, one bulk call (thesis step 20)', () => {
  it('(i) every $transaction( in the step-20 modules carries WRITE_TRANSACTION — and the version write opens one', () => {
    expect(transactions(moduleCode(VERSION_WRITE))).toBeGreaterThan(0);
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
