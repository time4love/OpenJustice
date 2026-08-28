/**
 * Compute and store the Level 5 verdict for diffs that lack a current one.
 *
 *   npm run forensics:backfill-survival -- --dry-run
 *   npm run forensics:backfill-survival
 *
 * WRITES the six survival columns, and nothing else. It does not repair a diff:
 * `rawDeletedText`, `rawAddedText` and every classification column are untouched,
 * and the compiler holds it to that. A CONTRADICTED verdict is the FINDING —
 * recomputing a classification to make one go away would destroy the only
 * real-world material that shows the check fires.
 *
 * Verify with `npm run forensics:audit-survival`, which writes nothing and can
 * therefore be trusted to check this. Run the audit BEFORE as well: the counts it
 * reports are the before-state this run should be measured against.
 */
import 'dotenv/config';
import { backfillDiffSurvival } from '../src/services/backfillDiffSurvival';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const report = await backfillDiffSurvival({ dryRun });

  console.log(`\n${dryRun ? 'DRY RUN — nothing written' : 'Backfill'}\n`);
  console.log(`Eligible                  ${String(report.eligible)}`);
  console.log(`  from UNCHECKED          ${String(report.fromUnchecked)}`);
  console.log(`  from STALE              ${String(report.fromStale)}`);
  console.log(`Verdicts written          ${String(report.written)}\n`);

  if (report.eligible === 0) {
    console.log('Every diff already carries a verdict computed against what it holds.\n');
  } else if (!dryRun) {
    console.log('Now run: npm run forensics:audit-survival\n');
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
