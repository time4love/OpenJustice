/**
 * db:simulate — execute a statement for real, measure exactly what it destroys,
 * then roll it back.
 *
 * Written after the 2026-08-21 staging wipe (docs/gf-staging-data-loss-postmortem-2026-08-21.md),
 * where a single `DROP SCHEMA "public" CASCADE` removed every row in the
 * database and nobody saw it coming. The lesson was not "write a better rule" —
 * a rule had landed hours earlier and did not help. It was that nothing could
 * answer "what will this actually do?" before the fact.
 *
 * This does, and not by pattern-matching the SQL: PostgreSQL has transactional
 * DDL, so the statement genuinely runs inside a transaction that is always
 * rolled back. Row counts are taken before and after, inside that transaction.
 * The reported damage is measured, not predicted — a DROP, a TRUNCATE, an
 * unbounded DELETE and a careful WHERE clause are all reported the same way,
 * because all of them really executed.
 *
 * Usage:
 *   npm run db:simulate -- 'DELETE FROM "Report" WHERE "createdAt" < now() - interval ''30 days'''
 *
 * Exit codes: 0 = no data would be lost. 2 = data WOULD be lost (HIGH RISK).
 */

import { PrismaClient } from '@prisma/client';
import { identifyEnvironment } from '../src/lib/dbEnvironment';

/** Thrown to force the transaction to roll back. Never escapes this file. */
class Rollback extends Error {}

interface TableCount {
  table: string;
  rows: number;
}

/**
 * Row counts for every table in `public`, in one round trip. query_to_xml is
 * the standard trick for counting dynamically-named tables without issuing a
 * statement per table — it matters here because this runs twice inside the
 * transaction and must not itself become the slow part.
 */
async function countAllTables(tx: {
  $queryRawUnsafe: (sql: string) => Promise<unknown>;
}): Promise<TableCount[]> {
  const rows = (await tx.$queryRawUnsafe(`
    SELECT table_name AS table,
           (xpath('/row/c/text()',
                  query_to_xml(format('SELECT count(*) AS c FROM %I.%I', 'public', table_name),
                               false, true, '')))[1]::text::int AS rows
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `)) as TableCount[];
  return rows.map((r) => ({ table: r.table, rows: Number(r.rows ?? 0) }));
}

function banner(text: string): void {
  console.log('\n' + '='.repeat(72));
  console.log(text);
  console.log('='.repeat(72));
}

async function main(): Promise<void> {
  const sql = process.argv.slice(2).join(' ').trim();
  if (!sql) {
    console.error('Usage: npm run db:simulate -- \'<SQL>\'');
    process.exit(1);
  }

  const env = identifyEnvironment();
  const prisma = new PrismaClient();

  banner(`SIMULATION — nothing below is committed`);
  console.log(`  target      : ${env.label}`);
  console.log(`  project ref : ${env.ref}`);
  console.log(`  statement   : ${sql.replace(/\s+/g, ' ').slice(0, 200)}`);
  if (env.isProduction) {
    console.log('\n  *** THIS IS PRODUCTION. ***');
  }
  if (env.label.startsWith('UNRECOGNISED')) {
    console.log('\n  *** The target project is not recognised. Confirm which database this is');
    console.log('      before acting on anything below. ***');
  }

  let before: TableCount[] = [];
  let after: TableCount[] = [];
  let affected = 0;
  let failure: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      before = await countAllTables(tx);
      affected = await tx.$executeRawUnsafe(sql);
      after = await countAllTables(tx);
      // Everything above really ran. This is what un-runs it.
      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) {
      failure = err instanceof Error ? err.message.split('\n')[0] : String(err);
    }
  } finally {
    await prisma.$disconnect();
  }

  if (failure) {
    banner('STATEMENT FAILED — nothing was changed');
    console.log(`  ${failure}`);
    console.log('\n  The statement did not execute, so no impact could be measured.');
    process.exit(1);
  }

  const afterByTable = new Map(after.map((t) => [t.table, t.rows]));
  const losses = before
    .map((b) => ({ table: b.table, before: b.rows, after: afterByTable.get(b.table), }))
    .map((r) => ({
      ...r,
      // A table absent afterwards was dropped — every row is gone, not zero rows changed.
      dropped: r.after === undefined,
      lost: r.after === undefined ? r.before : Math.max(0, r.before - r.after),
    }))
    .filter((r) => r.lost > 0 || r.dropped);

  const totalLost = losses.reduce((sum, r) => sum + r.lost, 0);
  const droppedTables = losses.filter((r) => r.dropped).map((r) => r.table);

  banner(totalLost > 0 || droppedTables.length > 0 ? 'HIGH RISK — THIS WOULD DESTROY DATA' : 'LOW RISK — no rows would be lost');

  console.log(`  rows reported affected by the statement : ${affected}`);
  console.log(`  rows that would be PERMANENTLY LOST     : ${totalLost}`);
  if (droppedTables.length > 0) {
    console.log(`  TABLES THAT WOULD CEASE TO EXIST        : ${droppedTables.join(', ')}`);
  }

  if (losses.length > 0) {
    console.log('\n  per table:');
    for (const r of losses) {
      const shape = r.dropped ? 'TABLE DROPPED' : `${r.before} -> ${r.after}`;
      console.log(`    ${r.table.padEnd(34)} ${String(r.lost).padStart(7)} lost   (${shape})`);
    }
  }

  if (totalLost > 0 || droppedTables.length > 0) {
    console.log('\n  This was rolled back. Nothing has been destroyed yet.');
    console.log('  Do not run this for real until the number above is the number you intended,');
    console.log('  in a session whose stated purpose is exactly this cleanup.');
    process.exit(2);
  }

  console.log('\n  Safe to proceed on the evidence of this simulation alone: the statement ran');
  console.log('  in full and removed nothing.');
}

main().catch((err) => {
  console.error('simulation failed to run:', err instanceof Error ? err.message : err);
  process.exit(1);
});
