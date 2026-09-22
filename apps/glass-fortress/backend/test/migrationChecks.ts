import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { normaliseClaim } from '../src/lib/normalise';

// ---------------------------------------------------------------------------
// HOW A `CHECK` CONSTRAINT IS HELD — ONE MECHANISM, ONE HOME.
//
// A CHECK is invisible to Prisma and to `db:check-drift`, so the case holding one is the
// ONLY thing that holds it — and a case in a project that gates nothing holds nothing a
// merge must pass (docs/gf-thesis-step-18-2026-09-11.md §7). Both callers of this module
// therefore live in the UNIT project: `test/thesisGuards.test.ts` (thesis step 18) and
// `test/documentGuards.test.ts` (document step 28).
//
// EACH CHECK IS HELD ACROSS THE WHOLE ORDERED MIGRATION HISTORY, never one folder by name:
// the LAST migration to ADD it is the one in force, every arm of it sits inside THAT
// statement, no LATER migration drops it, and `schema.prisma` names it in the model's `///`
// comment so a reader of the schema alone is not misled into thinking it absent. A
// constraint added and later dropped would otherwise pass forever on the file that added it.
//
// WHY IT IS A MODULE AND NOT COPIED. It was written inside `thesisGuards.test.ts` at thesis
// step 18, when there was one caller. Document step 28 is the second, and a second copy of
// the fold would be a second spelling of the one mechanism that makes a CHECK countable —
// this repository's named dominant defect shape. `test/thesis/absent.ts` set the precedent:
// its loader is EXPORTED for `test/document/built.ts` rather than copied into it.
//
// A WIDENING ADDS THE CONSTRAINT TWICE, AND THE FOLD SAYS SO RATHER THAN REFUSING IT.
// A CHECK's definition cannot be changed in place, so a constraint that is widened is
// DROPPED and re-ADDED under the same name — document step 28 does this to two of thesis
// step 18's. The rule "added by EXACTLY ONE migration" was written when no constraint had
// ever been widened, and it FIRED ON THE FIRST ONE: it was a proxy for the property that
// actually matters, which is stated directly here instead —
//
//   · the LAST add is the one in force, and every arm must be inside THAT statement;
//   · no migration AFTER it may drop it (the original teeth: "a constraint added and later
//     dropped would otherwise pass forever on the file that added it");
//   · every EARLIER add must be followed by a drop before the next add — a name added twice
//     with no drop between is a migration Postgres itself refuses, so the deploy is the
//     guard for that half and this states it rather than duplicating it.
//
// Recorded because the claim this comment first made — that the fold "tolerates a widening"
// because it counts drops only after the adder — was WRONG, and its own decoy is what said
// so: the add count reached two before any drop was consulted.
// ---------------------------------------------------------------------------

const BACKEND = join(__dirname, '..');
const MIGRATIONS_DIR = join(BACKEND, 'prisma', 'migrations');

export interface Migration {
  name: string;
  sql: string;
}

/** Every migration, in the order `prisma migrate deploy` applies them. */
export const HISTORY: readonly Migration[] = readdirSync(MIGRATIONS_DIR)
  .sort()
  .map((name) => ({ name, file: join(MIGRATIONS_DIR, name, 'migration.sql') }))
  .filter(({ file }) => existsSync(file))
  .map(({ name, file }) => ({ name, sql: readFileSync(file, 'utf8') }));

export const SCHEMA = readFileSync(join(BACKEND, 'prisma', 'schema.prisma'), 'utf8');

/** A constraint, the model whose `///` comment must name it, and its arms. */
export interface CheckSpec {
  model: string;
  arms: readonly string[];
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The statement that adds `name`, whole. */
export const addingStatement = (sql: string, name: string): string | undefined =>
  new RegExp(`ALTER TABLE "\\w+" ADD CONSTRAINT "${escaped(name)}" CHECK \\([\\s\\S]*?\\);`).exec(sql)?.[0];

/** The `///` comment immediately above `model <name> {`. */
const modelComment = (schema: string, model: string): string =>
  new RegExp(`((?:^///[^\\n]*\\n)+)model ${model} \\{`, 'm').exec(schema)?.[1] ?? '';

/** Everything wrong with how `name` is held — empty when it is held. */
export function problemsWith(
  history: readonly Migration[],
  schema: string,
  name: string,
  spec: CheckSpec,
): string[] {
  const { model, arms } = spec;
  const adders = history.filter(({ sql }) => addingStatement(sql, name) !== undefined);
  const adder = adders.at(-1);
  if (adder === undefined) return [`${name}: added by no migration`];
  const problemsBefore: string[] = [];
  // Every add but the last must be followed by a drop before the next add — otherwise two
  // definitions of one name stand and which is in force is undecidable from the history.
  for (const [i, earlier] of adders.slice(0, -1).entries()) {
    const next = adders[i + 1];
    if (next === undefined) continue;
    const between = history.slice(history.indexOf(earlier), history.indexOf(next) + 1);
    const dropped = new RegExp(`DROP CONSTRAINT (?:IF EXISTS )?"${escaped(name)}"`);
    if (!between.some(({ sql }) => dropped.test(sql))) {
      problemsBefore.push(`${name}: re-added by ${next.name} with no drop after ${earlier.name}`);
    }
  }
  const body = normaliseClaim(addingStatement(adder.sql, name) ?? '');
  const problems = [
    ...problemsBefore,
    ...arms.filter((arm) => !body.includes(normaliseClaim(arm))).map((arm) => `${name}: arm missing — ${arm}`),
  ];
  const dropped = new RegExp(`DROP CONSTRAINT (?:IF EXISTS )?"${escaped(name)}"`);
  problems.push(
    ...history
      .slice(history.indexOf(adder) + 1)
      .filter(({ sql }) => dropped.test(sql))
      .map((later) => `${name}: dropped later by ${later.name}`),
  );
  if (!modelComment(schema, model).includes(name)) {
    problems.push(`${name}: not named in model ${model}'s /// comment`);
  }
  return problems;
}

/**
 * The four decoys every CHECK is proven against: the whole constraint removed, EACH ARM
 * removed one at a time, a LATER migration dropping it, and the schema's `///` mention
 * removed. Returned rather than asserted so each caller names its own constraint in the
 * failure. None touches a file: the history is mutated IN MEMORY, so nothing is planted on
 * disk and nothing has to be restored.
 */
export function decoysFor(
  history: readonly Migration[],
  name: string,
  spec: CheckSpec,
): { histories: readonly (readonly Migration[])[]; statement: string; adder: Migration } {
  const adder = history.filter(({ sql }) => addingStatement(sql, name) !== undefined).at(-1);
  if (adder === undefined) {
    throw new Error(`${name} is added by no migration — there is nothing to plant a decoy on`);
  }
  const statement = addingStatement(adder.sql, name) ?? '';
  const withAdder = (sql: string): Migration[] =>
    history.map((m) => (m === adder ? { name: m.name, sql } : m));
  const armRemoved = spec.arms.map((arm) => {
    const cut = normaliseClaim(statement).replace(normaliseClaim(arm), 'TRUE');
    // THE FLOOR ON THE DECOY ITSELF: a "removal" that removed nothing would make the
    // decoy pass while proving the instrument saw nothing.
    if (cut === normaliseClaim(statement)) {
      throw new Error(`${name}: the arm "${arm}" is not in the statement, so removing it changes nothing`);
    }
    return withAdder(adder.sql.replace(statement, cut));
  });
  return {
    histories: [
      withAdder(adder.sql.replace(statement, '')),
      ...armRemoved,
      [...history, { name: '29990101000000_a_later_drop', sql: `ALTER TABLE "${spec.model}" DROP CONSTRAINT "${name}";` }],
    ],
    statement,
    adder,
  };
}
