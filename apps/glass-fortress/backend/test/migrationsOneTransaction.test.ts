import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// A MIGRATION FILE IS ONE TRANSACTION — AND THAT IS VERSION-PINNED, SO IT IS HELD.
//
// Prisma 5.22.0, the backend's pinned copy, sends a migration file to Postgres as ONE
// simple query, which Postgres runs as one implicit transaction: a failure anywhere
// rolls every statement back, the pre-deploy step fails, and the previous version
// keeps serving (CLAUDE.md, "Schema Migrations Deploy Themselves"). A transaction
// statement INSIDE a file ends that implicit transaction midway — the statements
// before it commit, whatever happens after — and later Prisma engines split a script
// into statements altogether. Thesis step 18's migration carries none, and this holds
// that no later one does.
//
// THREE applied migrations already carry one. Applied migrations are never edited, so
// they are PINNED by name, and each must still carry it: an entry that no longer
// fires is an allow-list with a hole in it.
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');

const HISTORY: readonly { name: string; sql: string }[] = readdirSync(MIGRATIONS_DIR)
  .sort()
  .map((name) => ({ name, file: join(MIGRATIONS_DIR, name, 'migration.sql') }))
  .filter(({ file }) => existsSync(file))
  .map(({ name, file }) => ({ name, sql: readFileSync(file, 'utf8') }));

/** A transaction statement at a line start OR after a `;` on the same line. */
const TRANSACTION = /(?:^|;)[ \t]*(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b[^;]*;/im;

/** Comments and dollar-quoted bodies stripped first: a function's `BEGIN … END;` is not a transaction. */
const carriesTransaction = (sql: string): boolean =>
  TRANSACTION.test(sql.replace(/--[^\n]*/g, '').replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, ''));

const PINNED: readonly string[] = [
  '20260820050000_remove_redundant_death_category',
  '20260820060000_remove_plausibility_service_collapse_care_engagement',
  '20260830020000_misanchored_names_its_route',
];

describe('a migration file is ONE transaction — no BEGIN or COMMIT inside it (thesis step 18)', () => {
  it('no migration file carries a transaction statement but the three pinned', () => {
    expect(HISTORY.length).toBeGreaterThan(60);
    expect(HISTORY.filter(({ name, sql }) => carriesTransaction(sql) && !PINNED.includes(name)).map(({ name }) => name)).toEqual([]);
  });

  it('the allow-list is PINNED — each entry a migration that exists and still carries one', () => {
    expect(PINNED.filter((pinned) => !HISTORY.some(({ name, sql }) => name === pinned && carriesTransaction(sql)))).toEqual([]);
  });

  it('DETECTS a statement at a line start or after a `;` — and a comment, a function body, a column and RENAME VALUE do not fire', () => {
    for (const fires of ['BEGIN;', '  commit;', 'START TRANSACTION;', 'END;', 'ALTER TABLE "X" ADD COLUMN "y" INTEGER; COMMIT;']) {
      expect(carriesTransaction(fires)).toBe(true);
    }
    for (const quiet of [
      '-- BEGIN;',
      'CREATE FUNCTION f() RETURNS void AS $$ BEGIN PERFORM 1; END; $$ LANGUAGE plpgsql;',
      'ALTER TABLE "X" ADD COLUMN "BEGIN_AT" INTEGER;',
      `ALTER TYPE "MentionType" RENAME VALUE 'CLAIM_TRAJECTORY' TO 'TRAJECTORY';`,
    ]) {
      expect(carriesTransaction(quiet)).toBe(false);
    }
  });
});
