/**
 * Move forensic evidence onto the snapshot-derived identity.
 *
 *   npm run forensics:rehash-evidence -- --dry-run
 *   npm run forensics:rehash-evidence -- --limit 1 --apply
 *   npm run forensics:rehash-evidence -- --apply
 *
 * The previous fileHash was computed over the classifier's extracted items,
 * which reclassification rewrites — so anchored records stopped being
 * recomputable from the database. The replacement is derived from the two
 * archived captures' Wayback timestamps and contentHash values, which cannot
 * drift and are anchored on-chain in their own right.
 *
 * Registers the new hash BEFORE writing it, so a failure leaves the row on its
 * old hash with its old anchor rather than on a new hash with nothing behind it.
 * Records the superseded identity on the row; the old anchor stays on-chain as a
 * deliberate, documented orphan.
 *
 * DRY RUN IS THE DEFAULT. --apply is required to send transactions.
 */
import 'dotenv/config';
import { rehashEvidence } from '../src/services/rehashEvidence';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const dryRun = !flag('apply');
  const limitRaw = arg('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (limitRaw && (!Number.isFinite(limit) || (limit as number) < 1)) {
    console.error(`--limit must be a positive number, got "${limitRaw}"`);
    process.exit(1);
  }

  console.log(dryRun ? 'DRY RUN — no transactions, no writes. Pass --apply.\n' : 'APPLYING\n');

  const report = await rehashEvidence({ dryRun, ...(limit ? { limit } : {}) });

  for (const row of report.rows) {
    console.log(`${row.previousFileHash.slice(0, 14)}…  →  ${row.newFileHash.slice(0, 14)}…`);
    if (!dryRun) {
      console.log(`   new anchor: ${row.newTxHash ?? 'NONE'}   mentions moved: ${row.mentionsUpdated}   reindexed: ${row.reindexed}`);
    }
  }

  console.log('\n---');
  console.log(`examined:        ${report.examined}`);
  console.log(`rehashed:        ${report.rehashed}${dryRun ? ' (dry run — none written)' : ''}`);
  console.log(`already current: ${report.alreadyCurrent}`);
  console.log(`failed:          ${report.failed}`);

  if (report.failures.length > 0) {
    console.error('\nfailures:');
    for (const f of report.failures) console.error(`  ${f.evidenceId}: ${f.reason}`);
  }
  if (!report.chainAvailable) {
    console.error('\n⚠️  The chain is not configured or not reachable. NOTHING was rehashed.');
    process.exit(2);
  }
  if (report.failed > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
