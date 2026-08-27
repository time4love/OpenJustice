/**
 * Repair captures whose stored payload does not reproduce the Archive's digest.
 *
 *   npm run forensics:repair-against-cdx -- --url <url>          ← dry run
 *   npm run forensics:repair-against-cdx -- --url <url> --apply
 *
 * Keyed on verification failure rather than on a null column: `document` and
 * `documentHash` are NOT NULL, so nulling-then-refilling would need the
 * constraint dropped and re-added — three migrations and a degraded window to
 * fix a handful of rows. Keying on the check is self-targeting, idempotent, and
 * cannot touch a row that is already correct.
 *
 * NEVER SILENTLY OVERWRITES. A stored payload that disagrees with the index is
 * only replaced when a fresh identity fetch REPRODUCES the index; if the fresh
 * fetch also disagrees, the Archive's replay contradicts its own record and the
 * stored bytes are left alone and reported.
 *
 * DRY RUN IS THE DEFAULT. --apply is required to write.
 */
import 'dotenv/config';
import { repairAgainstCdx } from '../src/services/repairAgainstCdx';

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
  if (!url) {
    console.error('--url is required.');
    process.exit(1);
  }

  const report = await repairAgainstCdx({ url, dryRun });

  console.log(`${dryRun ? 'DRY RUN' : 'APPLY'} — ${report.url}`);
  console.log(`captures whose payload contradicts the Archive: ${String(report.contradictedBefore)}`);

  if (report.contradictedBefore === 0) {
    console.log('Nothing to repair.');
    return;
  }

  for (const o of report.outcomes) {
    console.log(`\n  ${o.waybackTimestamp}  ${o.action}`);
    console.log(`     cdx        : ${String(o.cdxDigest)}`);
    console.log(`     stored     : ${o.storedBefore}  (${String(o.bytesBefore)} bytes)`);
    if (o.fetched !== undefined) {
      console.log(
        `     refetched  : ${o.fetched}  (${String(o.bytesAfter)} bytes, ` +
          `content-encoding: ${String(o.contentEncoding)})`,
      );
    }
    if (o.error !== undefined) console.log(`     error      : ${o.error}`);
  }

  console.log('\nSummary:');
  console.log(`  repaired             : ${String(report.repaired)}`);
  console.log(`  archive contradicted : ${String(report.archiveContradicted)}  (left untouched — the Archive disagrees with itself)`);
  console.log(`  failed               : ${String(report.failed)}`);
  if (dryRun) console.log('\nDry run — nothing written. Re-run with --apply.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
