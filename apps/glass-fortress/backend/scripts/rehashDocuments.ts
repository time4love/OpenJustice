/**
 * Repair `documentHash` to SHA-256 of the bytes the row already holds.
 *
 *   npm run build
 *   npm run forensics:rehash-documents -- --url <url>            # dry run (default)
 *   npm run forensics:rehash-documents -- --url <url> --apply
 *
 * LOCAL AND DETERMINISTIC. No Archive fetch, no network, no chain write, no
 * model call — the bytes are already correct and settled by the external axis of
 * forensics:verify-against-cdx, so this is a pure function of data already held.
 *
 * Dry run is the default. Run verify-against-cdx before and after: its
 * INTERNALLY CONTRADICTED count is the before-state and the proof.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { rehashDocuments } from '../src/services/rehashDocuments';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const url = arg('url');
  if (!url) {
    console.error('--url is required.');
    process.exit(1);
  }
  const dryRun = !process.argv.includes('--apply');

  console.log(dryRun ? 'DRY RUN — nothing will be written.' : 'APPLYING.');

  const report = await rehashDocuments({
    url,
    dryRun,
    onProgress: (done, total, o) => {
      if (o.action === 'ALREADY_CORRECT') return;
      console.log(
        `  [${String(done)}/${String(total)}] ${o.capturedAt.toISOString()} ${o.provenance} ` +
          `${o.action}\n     stored     : ${o.storedDocumentHash}` +
          `\n     recomputed : ${o.recomputedDocumentHash}`,
      );
    },
  });

  console.log(`\ncaptures        : ${String(report.captures)}`);
  console.log(`  ALREADY_CORRECT : ${String(report.alreadyCorrect)}`);
  console.log(`  REHASHED        : ${String(report.rehashed)}${dryRun ? ' (would be)' : ''}`);
  console.log(`  RACED           : ${String(report.raced)}  (row changed since it was read — nothing written)`);

  if (report.raced > 0) process.exitCode = 2;
}

void runOperationalScript(main);
