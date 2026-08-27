/**
 * Reconcile every stored capture against the Archive's published digest.
 *
 *   npm run forensics:reconcile-against-cdx -- --url <url>          ← dry run
 *   npm run forensics:reconcile-against-cdx -- --url <url> --apply
 *
 * ONE PASS OVER EVERY CAPTURE, writing only where something changes. Touching
 * only the rows that fail verification would leave the corpus in two partial
 * states — textExtractionVersion split across versions, and
 * documentContentEncoding NULL on rows where it is observable in one fetch.
 * Partial states are what this level is about.
 *
 * Never a blanket overwrite: a payload is replaced only when a fresh identity
 * fetch reproduces the Archive's index, and if the fresh fetch also disagrees
 * the stored bytes are LEFT ALONE and the disagreement recorded.
 *
 * DRY RUN IS THE DEFAULT. --apply is required to write.
 */
import 'dotenv/config';
import { reconcileAgainstCdx } from '../src/services/reconcileAgainstCdx';

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

  const report = await reconcileAgainstCdx({ url, dryRun });

  console.log(`${dryRun ? 'DRY RUN' : 'APPLY'} — ${report.url}`);
  console.log(`captures examined: ${String(report.captures)}`);

  for (const o of report.outcomes) {
    if (o.action === 'UNCHANGED') continue;
    console.log(`\n  ${o.waybackTimestamp}  ${o.action}`);
    if (o.action === 'REPAIRED' || o.action === 'ARCHIVE_CONTRADICTED') {
      console.log(`     cdx      : ${String(o.cdxDigest)}`);
      console.log(`     stored   : ${o.storedDigest}`);
      console.log(`     refetched: ${String(o.fetchedDigest)}`);
    }
    if (o.contentEncoding !== undefined) {
      console.log(`     content-encoding: ${String(o.contentEncoding)}`);
    }
    if (o.error !== undefined) console.log(`     error    : ${o.error}`);
  }

  console.log('\nSummary:');
  console.log(`  repaired (bytes replaced) : ${String(report.repaired)}`);
  console.log(`  encoding filled           : ${String(report.encodingFilled)}`);
  console.log(`  text re-derived           : ${String(report.textRederived)}`);
  console.log(`  archive contradicted      : ${String(report.archiveContradicted)}  (bytes left untouched)`);
  console.log(`  unchanged                 : ${String(report.unchanged)}`);
  console.log(`  failed                    : ${String(report.failed)}`);
  console.log(
    `\n  SUPERSET CHECK — text moved without the bytes moving: ${String(report.textChangedWithoutByteChange)}` +
      ' (expected 0)',
  );
  if (report.textChangedWithoutByteChange > 0) {
    console.log(
      '  STOP. v2 is not a faithful superset of v1: inflateDocument is not a no-op on\n' +
        '  uncompressed input. Investigate before this reaches another environment.',
    );
    process.exitCode = 2;
  }
  if (dryRun) console.log('\nDry run — nothing written. Re-run with --apply.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
