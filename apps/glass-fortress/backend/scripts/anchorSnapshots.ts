#!/usr/bin/env ts-node
/**
 * Anchor archived snapshots whose contentHash was never registered on-chain.
 *
 *   npm run forensics:anchor-snapshots -- --dry-run
 *   npm run forensics:anchor-snapshots -- --url https://corona.health.gov.il/vaccine-for-covid/ --limit 5
 *   npm run forensics:anchor-snapshots -- --apply
 *
 * UrlSnapshot.contentHash is the factual layer the forensic model argues from —
 * "this page held exactly this text on this date". FINDING 41 found none of 83
 * anchored: the scan ran while the RPC was down, and registerSnapshotOnChain is
 * fire-and-forget with a swallowed rejection.
 *
 * Idempotent and resumable — anchoring is one transaction per snapshot, so this
 * is meant to be interrupted and run again. Skips rows already anchored, copies
 * the tx from a byte-identical twin rather than re-registering, and recovers the
 * tx by log scan when the hash is already on-chain from an interrupted run.
 *
 * DRY RUN IS THE DEFAULT. --apply is required to send transactions.
 */
import 'dotenv/config';
import { anchorSnapshots, countUnanchoredSnapshots } from '../src/services/anchorSnapshots';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const dryRun = !flag('apply');
  const url = arg('url');
  const limitRaw = arg('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (limitRaw && (!Number.isFinite(limit) || (limit as number) < 1)) {
    console.error(`--limit must be a positive number, got "${limitRaw}"`);
    process.exit(1);
  }

  const before = await countUnanchoredSnapshots();
  console.log(`unanchored snapshots, before: ${before}`);
  console.log(dryRun ? 'DRY RUN — no transactions will be sent. Pass --apply to anchor.\n' : 'APPLYING\n');

  const report = await anchorSnapshots({ dryRun, ...(url ? { url } : {}), ...(limit ? { limit } : {}) });

  console.log('---');
  console.log(`examined:         ${report.examined}`);
  console.log(`anchored:         ${report.anchored}${dryRun ? ' (dry run — none sent)' : ''}`);
  console.log(`copied from twin: ${report.copiedFromTwin}`);
  console.log(`recovered:        ${report.recovered}`);
  console.log(`failed:           ${report.failed}`);

  if (report.failures.length > 0) {
    console.error('\nfailures:');
    // Grouped, because 83 copies of one RPC message is not 83 problems.
    const byReason = new Map<string, number>();
    for (const f of report.failures) byReason.set(f.reason, (byReason.get(f.reason) ?? 0) + 1);
    for (const [reason, count] of byReason) console.error(`  ${count} ×  ${reason}`);
  }

  if (!report.chainAvailable) {
    // The exact condition that produced FINDING 41: an unreachable chain that
    // reported nothing. It must never again look like a clean run.
    console.error(
      '\n⚠️  The chain is not configured or not reachable. NOTHING was anchored.\n' +
        '    This is not a clean run — it is the same condition that left 83 snapshots unanchored\n' +
        '    while a scan reported success.',
    );
    process.exit(2);
  }

  const after = await countUnanchoredSnapshots();
  console.log(`unanchored snapshots, after:  ${after}`);
  if (report.failed > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
