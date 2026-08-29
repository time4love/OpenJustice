/**
 * Dry-run report for the diff re-computation repair.
 *
 * Usage:
 *   npm run forensics:rediff -- --dry-run [--url <tracked url>] [--full]
 *
 * --dry-run is currently the ONLY mode. Applying the repair is a separate,
 * reviewed change: on the measured corpus it roughly doubles the chunk count on
 * the six diffs that back every promoted evidence record, and a subsequent
 * reclassification then judges text no model has ever seen.
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
import { planRediff, applyRediff, REDIFF_TARGET_VERSION } from '../src/services/rediffFromSnapshots';
import { prisma } from '../src/lib/prisma';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const isApply = process.argv.includes('--apply');
  if (!isApply && !process.argv.includes('--dry-run')) {
    console.error('Refusing to run without --dry-run or --apply.');
    process.exit(1);
  }
  const url = arg('url');
  const full = process.argv.includes('--full');

  const plan = await planRediff(url === undefined ? {} : { url });

  console.log(`\n${isApply ? '=== RE-DIFF APPLY ===' : '=== RE-DIFF DRY RUN — nothing was written ==='}\n`);
  console.log(`diffs examined                : ${String(plan.totalDiffs)}`);
  console.log(`diffs needing re-diff         : ${String(plan.diffsNeedingRediff)}`);
  console.log(`chunks that would be recovered: ${String(plan.chunksRecovered)}`);
  console.log(`of those, diffs WITH evidence : ${String(plan.diffsWithEvidenceAffected)}`);
  console.log(`skipped — snapshot hash failed: ${String(plan.snapshotHashFailures)}`);
  console.log(`skipped — snapshots unlinked  : ${String(plan.unlinkedDiffs)}`);
  console.log(`entries UNSAFE to apply       : ${String(plan.unsafeEntries)}` +
    (plan.unsafeEntries > 0 ? '   <-- applying would DESTROY stored text; these are refused' : '   (no stored text would be lost)'));
  console.log(`repaired rows would carry     : diffInputVersion = ${REDIFF_TARGET_VERSION}`);

  // THE PROJECTION — what a cascade would do to Level 5, computed without one.
  //
  // `checkDiffSurvival` is pure, so the outcome is knowable before the write.
  // Printed as a transition table rather than two totals: "CONTRADICTED fell by
  // five" is the number people quote, and it hides a row that moved the wrong
  // way behind four that moved the right way.
  const moves = new Map<string, number>();
  for (const e of plan.entries) {
    const key = `${e.currentSurvivalVerdict ?? 'UNCHECKED'} -> ${e.projectedSurvivalVerdict}`;
    moves.set(key, (moves.get(key) ?? 0) + 1);
  }
  if (moves.size > 0) {
    console.log('\nprojected Level 5 verdicts for the rows this would repair:');
    for (const [move, count] of [...moves].sort()) {
      const marker = move.split(' -> ')[0] === move.split(' -> ')[1] ? ' ' : '*';
      console.log(`  ${marker} ${move.padEnd(30)} ${String(count)}`);
    }
    console.log('  (* = the verdict changes; rows not listed are not repaired and do not move)');
  }
  console.log('');

  for (const e of plan.entries) {
    const ev = e.evidence.length > 0
      ? `  EVIDENCE: ${e.evidence.map((x) => `${x.status} ${x.fileHash.slice(0, 12)}…`).join(', ')}`
      : '';
    console.log(
      `${e.beforeDate} -> ${e.afterDate}` +
        (e.currentlySignificant ? '  [SIGNIFICANT]' : '') +
        `  deleted ${String(e.storedDeleted)}->${String(e.recomputedDeleted)}` +
        `  added ${String(e.storedAdded)}->${String(e.recomputedAdded)}` +
        `  (+${String(e.recoveredChunks)} chunks)${ev}`,
    );
    const show = full ? e.recoveredText : e.recoveredText.slice(0, 5);
    for (const r of show) {
      const t = r.text.replace(/\s+/gu, ' ').trim();
      console.log(`      ${r.side === 'deleted' ? '-' : '+'} ${full ? t : t.slice(0, 110)}`);
    }
    if (!full && e.recoveredText.length > show.length) {
      console.log(`      … ${String(e.recoveredText.length - show.length)} more (use --full)`);
    }
    console.log('');
  }

  if (isApply) {
    if (plan.unsafeEntries > 0) {
      console.error(
        `REFUSING TO APPLY: ${String(plan.unsafeEntries)} entr(ies) would destroy stored text.`,
      );
      await prisma.$disconnect();
      process.exit(2);
    }
    const result = await applyRediff(url === undefined ? {} : { url });
    console.log('=== APPLIED ===');
    console.log(`rows updated       : ${String(result.applied)}`);
    console.log(`rows refused       : ${String(result.refused)}`);
    console.log(`chunks recovered   : ${String(result.chunksRecovered)}`);
    if (result.refused > 0) console.log(`refused diffIds    : ${result.refusedDiffIds.join(', ')}`);
  }

  await prisma.$disconnect();
}

void runOperationalScript(main);
