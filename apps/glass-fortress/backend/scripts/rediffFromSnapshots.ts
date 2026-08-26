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
import { planRediff, REDIFF_TARGET_VERSION } from '../src/services/rediffFromSnapshots';
import { prisma } from '../src/lib/prisma';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  if (!process.argv.includes('--dry-run')) {
    console.error('Refusing to run without --dry-run. No apply mode exists yet.');
    process.exit(1);
  }
  const url = arg('url');
  const full = process.argv.includes('--full');

  const plan = await planRediff(url === undefined ? {} : { url });

  console.log('\n=== RE-DIFF DRY RUN — nothing was written ===\n');
  console.log(`diffs examined                : ${String(plan.totalDiffs)}`);
  console.log(`diffs needing re-diff         : ${String(plan.diffsNeedingRediff)}`);
  console.log(`chunks that would be recovered: ${String(plan.chunksRecovered)}`);
  console.log(`of those, diffs WITH evidence : ${String(plan.diffsWithEvidenceAffected)}`);
  console.log(`skipped — snapshot hash failed: ${String(plan.snapshotHashFailures)}`);
  console.log(`skipped — snapshots unlinked  : ${String(plan.unlinkedDiffs)}`);
  console.log(`repaired rows would carry     : diffInputVersion = ${REDIFF_TARGET_VERSION}\n`);

  for (const e of plan.entries) {
    const ev = e.evidence.length > 0
      ? `  EVIDENCE: ${e.evidence.map((x) => `${x.status} ${x.fileHash.slice(0, 12)}…`).join(', ')}`
      : '';
    console.log(
      `${e.beforeDate} -> ${e.afterDate}` +
        `${e.currentlySignificant ? '  [SIGNIFICANT]' : ''}` +
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

  await prisma.$disconnect();
}

void main();
