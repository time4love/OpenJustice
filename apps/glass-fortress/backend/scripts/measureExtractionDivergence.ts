/**
 * Measure what the extraction discarded, and which reported changes it invented.
 *
 *   npm run forensics:measure-divergence -- --url https://corona.health.gov.il/vaccine-for-covid/
 *   npm run forensics:measure-divergence -- --url <url> --verbose
 *
 * Level 5 of docs/gf-factual-layer-rebuild-dev-plan.md. Read-only: it writes
 * nothing, and it needs neither the Internet Archive nor a model, because Phase 1
 * stored the archived document beside the extraction derived from it.
 *
 * The headline number is CONTRADICTED diffs. A chunk the platform says was
 * REMOVED must be absent from the raw document of the after capture; if the page
 * still said it, the removal never happened and the diff recorded a change in the
 * pipeline as a change in the world. That is how a phrase present in the archive
 * on three consecutive captures came to be reported as removed and restored, and
 * asserted as ADDED in a published thesis.
 *
 * Exits 3 when anything is contradicted, so this can gate a pipeline as well as
 * inform a person. Exit 0 means the raw documents agree with every stored diff.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { measureExtractionDivergence } from '../src/services/measureExtractionDivergence';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const url = arg('url');
  if (url === undefined) {
    console.error('--url is required.');
    process.exit(1);
  }
  const verbose = process.argv.includes('--verbose');
  const report = await measureExtractionDivergence(url);
  const s = report.summary;

  console.log(`\n${report.url}\n`);
  console.log(`Snapshots measured        ${String(s.snapshotsMeasured)}`);
  console.log(
    `  lowest retention        ${s.lowestRetainedPercent === null ? 'n/a' : `${String(s.lowestRetainedPercent)}%`}`,
  );
  console.log(`Diffs checked             ${String(s.diffsChecked)}`);
  console.log(`  CONTRADICTED            ${String(s.diffsContradicted)}`);
  console.log(`  uncheckable             ${String(s.diffsUncheckable)}`);
  console.log(`Chunks contradicted       ${String(s.chunksContradicted)}\n`);

  for (const d of report.diffs) {
    if (d.verdict === 'SURVIVES' && !verbose) continue;
    console.log(`${d.beforeDate} -> ${d.afterDate}  ${d.verdict}  (${String(d.chunksChecked)} chunks)`);
    if (d.reason !== undefined) console.log(`    ${d.reason}`);
    for (const c of d.contradicted) {
      console.log(`    ${c.side} but still on the page: ${c.excerpt}`);
    }
  }

  if (verbose) {
    console.log('\nPer-snapshot retention:');
    for (const snap of report.snapshots) {
      console.log(
        `  ${snap.snapshotDate}  ${String(snap.retainedPercent)}%  ` +
          `${String(snap.droppedBlocks)} block(s) dropped`,
      );
    }
  }

  if (s.chunksContradicted > 0) process.exit(3);
}

void runOperationalScript(main);
