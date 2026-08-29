/**
 * Fill in `Evidence.canonicalTargetEntity` for records the vocabulary could not
 * resolve when they were created.
 *
 * Re-runnable, and that is the whole point of the design: the vocabulary grows,
 * and growing it must not mean re-running intake. Re-running intake to fix an
 * entity name would re-roll tier, date, figures and summary too — at LLM cost,
 * non-deterministically, on records that have already been reviewed and in some
 * cases anchored.
 *
 * Reads and writes one derived column. It never touches `targetEntity`, which is
 * the model's observation and stays as it was.
 *
 * Usage:
 *   npm run entities:canonicalise            report only, writes nothing
 *   npm run entities:canonicalise -- --apply write the resolved ids
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
import { runOperationalScript } from '../src/lib/operationalContext';
import { PrismaClient } from '@prisma/client';
import { canonicaliseTargetEntity } from '../src/lib/targetEntity';

async function main(): Promise<number> {
  const apply = process.argv.includes('--apply');

  // The environment is NOT restated here — `runOperationalScript` has already
  // named it, having made Railway, APP_ENV, the database and the chain all agree
  // with the operator's own `--env`, which is strictly more than this line ever
  // checked.
  console.log('\n' + '='.repeat(72));
  console.log(`entities:canonicalise  —  ${apply ? 'APPLY' : 'report only'}`);
  console.log('='.repeat(72));

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.evidence.findMany({
      select: { id: true, targetEntity: true, canonicalTargetEntity: true },
    });

    const changes: { id: string; from: string | null; to: string | null; raw: string }[] = [];
    const unresolved = new Map<string, number>();

    for (const row of rows) {
      const resolved = canonicaliseTargetEntity(row.targetEntity);
      if (resolved === null) {
        unresolved.set(row.targetEntity, (unresolved.get(row.targetEntity) ?? 0) + 1);
      }
      if (resolved !== row.canonicalTargetEntity) {
        changes.push({ id: row.id, from: row.canonicalTargetEntity, to: resolved, raw: row.targetEntity });
      }
    }

    console.log(`\n  records          : ${rows.length}`);
    console.log(`  needing a change : ${changes.length}`);
    for (const c of changes) {
      console.log(`    ${c.id}  ${JSON.stringify(c.raw)}  ${c.from ?? 'null'} -> ${c.to ?? 'null'}`);
    }

    // The visible queue. An entity absent from the vocabulary is a gap to close,
    // and it is reported every run rather than sitting silently as null.
    if (unresolved.size > 0) {
      console.log(`\n  ⚠️  ${unresolved.size} value(s) the vocabulary cannot resolve:`);
      for (const [raw, n] of [...unresolved].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${JSON.stringify(raw)}  (${n} record(s))`);
      }
      console.log('    Add them to KNOWN_ENTITIES in src/lib/targetEntity.ts, then re-run.');
    } else {
      console.log('\n  ✅ every record resolves.');
    }

    if (!apply) {
      console.log('\n  Report only. Re-run with --apply to write.\n');
      return 0;
    }

    for (const c of changes) {
      await prisma.evidence.update({
        where: { id: c.id },
        data: { canonicalTargetEntity: c.to },
      });
    }
    console.log(`\n  ✅ wrote ${changes.length} record(s).\n`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

void runOperationalScript(main);
