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
 * One statement per run. Prisma issues raw SQL as a single prepared statement,
 * and PostgreSQL refuses more than one command in one — the simulator reports
 * that as "not simulated" rather than guessing. Migration files are not input
 * for this tool; they apply through `prisma migrate deploy` in the pipeline.
 *
 * Exit codes: 0 = no data would be lost. 2 = data WOULD be lost (HIGH RISK).
 *             1 = nothing was measured (statement failed, more than one
 *                 statement, or a table's row count could not be taken).
 */

// FIRST IMPORT, AND THE ORDER IS LOAD-BEARING.
//
// Without it DOTENV_CONFIG_PATH is honoured by nobody and Prisma Client quietly
// auto-loads `.env` — so `DOTENV_CONFIG_PATH=.env.production.local npm run <this>`
// runs against STAGING while reporting nothing unusual. That is not theoretical:
// on 2026-08-27 db:simulate did exactly this and printed
// "target: staging ... Safe to proceed on the evidence of this simulation alone"
// for a statement written for production — a true statement about the wrong
// database.
//
// It must come BEFORE any import that reaches src/lib/prisma, which constructs
// PrismaClient at module load; CommonJS runs imports in source order, so a
// dotenv import placed after it loads the env too late to matter.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { identifyEnvironment } from '../src/lib/dbEnvironment';
import { simulateStatement, type SimulationOutcome } from '../src/services/dbSimulation';

function banner(text: string): void {
  console.log('\n' + '='.repeat(72));
  console.log(text);
  console.log('='.repeat(72));
}

/** Exit code for each outcome: 0 = nothing lost, 2 = data WOULD be lost, 1 = nothing measured. */
function report(outcome: SimulationOutcome): number {
  if (outcome.kind === 'failed') {
    banner('STATEMENT FAILED — nothing was changed');
    console.log(`  ${outcome.reason}`);
    console.log('\n  The statement did not execute, so no impact could be measured.');
    return 1;
  }

  if (outcome.kind === 'multi-statement') {
    banner('NOT SIMULATED — more than one statement');
    console.log('  PostgreSQL rejected the input as multiple commands, so NOTHING ran and');
    console.log('  nothing was measured. The simulator can only execute one statement at a');
    console.log('  time (Prisma sends raw SQL as a single prepared statement).');
    console.log('\n  Simulate each statement separately. If this is a migration file, it does');
    console.log('  not belong here at all: migrations apply through `prisma migrate deploy`');
    console.log('  in the deploy pipeline, and are reviewed as SQL in the pull request.');
    return 1;
  }

  if (outcome.kind === 'uncountable') {
    banner('NOT MEASURED — a row count could not be taken');
    if (outcome.before.length > 0) {
      console.log(`  uncountable BEFORE the statement : ${outcome.before.join(', ')}`);
    }
    if (outcome.after.length > 0) {
      console.log(`  uncountable AFTER the statement  : ${outcome.after.join(', ')}`);
    }
    console.log('\n  This is NOT a LOW RISK result. Without a count on both sides of the');
    console.log('  statement, a loss in these tables could not be seen — so no verdict is');
    console.log('  given. Find out why the count failed before acting on anything.');
    return 1;
  }

  const { affected, losses, totalLost, droppedTables } = outcome;
  const destructive = totalLost > 0 || droppedTables.length > 0;

  banner(destructive ? 'HIGH RISK — THIS WOULD DESTROY DATA' : 'LOW RISK — no rows would be lost');

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

  if (destructive) {
    console.log('\n  This was rolled back. Nothing has been destroyed yet.');
    console.log('  Do not run this for real until the number above is the number you intended,');
    console.log('  in a session whose stated purpose is exactly this cleanup.');
    return 2;
  }

  console.log('\n  Safe to proceed on the evidence of this simulation alone: the statement ran');
  console.log('  in full and removed nothing.');
  return 0;
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

  let outcome: SimulationOutcome;
  try {
    outcome = await simulateStatement(prisma, sql);
  } finally {
    await prisma.$disconnect();
  }

  process.exit(report(outcome));
}

main().catch((err) => {
  console.error('simulation failed to run:', err instanceof Error ? err.message : err);
  process.exit(1);
});
