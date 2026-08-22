#!/usr/bin/env ts-node
/**
 * Rewrite stored forensic summaries so each describes only its own source.
 *
 *   npm run forensics:resummarize -- --dry-run
 *   npm run forensics:resummarize -- --url https://corona.health.gov.il/vaccine-for-covid/
 *   npm run forensics:resummarize -- --limit 5
 *   npm run forensics:resummarize -- --apply
 *
 * Until v3 the classification prompt told the model to cross-reference other
 * evidence records inside legalSignificance, and that prose becomes
 * Evidence.summary verbatim — so records asserted facts drawn from a different
 * source, unverifiable against their own.
 *
 * Rewrites the SUMMARY ONLY, from items already extracted at scan time. Never
 * re-extracts, never re-fetches the archive, and asserts the evidence fileHash is
 * unmoved before writing — because the hash covers the items, and moving it would
 * orphan the on-chain anchors. Records the previous prose for every row it
 * touches.
 *
 * DRY RUN IS THE DEFAULT. --apply is required to write.
 */
import 'dotenv/config';
import { resummarizeDiffs } from '../src/services/resummarizeDiffs';
import { SUMMARY_VERSION } from '../src/lib/classifierVersion';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  // Default to dry run. An operator who forgets a flag gets a report, not a
  // corpus-wide rewrite of reviewed text.
  const dryRun = !flag('apply');
  const url = arg('url');
  const limitRaw = arg('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (limitRaw && (!Number.isFinite(limit) || (limit as number) < 1)) {
    console.error(`--limit must be a positive number, got "${limitRaw}"`);
    process.exit(1);
  }

  console.log(`forensics:resummarize — target summaryVersion ${SUMMARY_VERSION}`);
  console.log(dryRun ? 'DRY RUN — nothing will be written. Pass --apply to write.\n' : 'APPLYING\n');

  const report = await resummarizeDiffs({ dryRun, ...(url ? { url } : {}), ...(limit ? { limit } : {}) });

  for (const row of report.rows) {
    console.log(`${row.afterDate}  ${row.diffId}${row.fileHash ? `  → evidence ${row.fileHash.slice(0, 10)}…` : '  (not promoted)'}`);
    console.log(`  BEFORE: ${row.previousText.slice(0, 220)}`);
    console.log(`  AFTER : ${row.newText.slice(0, 220)}`);
    if (!dryRun) console.log(`  evidence updated: ${row.evidenceUpdated}   reindexed: ${row.reindexed}`);
    console.log('');
  }

  console.log('---');
  console.log(`examined:  ${report.examined}`);
  console.log(`rewritten: ${report.rewritten}${dryRun ? ' (dry run — none written)' : ''}`);
  console.log(`failed:    ${report.failed}`);
  console.log(`hashDrift: ${report.hashDrift}`);

  // A non-zero drift means a rewrite moved a field that feeds the evidence
  // fileHash. Those rows were skipped, and the exit code makes it impossible to
  // miss in a script or a log.
  if (report.hashDrift > 0) {
    console.error(
      `\n⚠️  ${report.hashDrift} diff(s) skipped: recomputed fileHash did not match the registered ` +
        'evidence hash. Extracted items must not change here — investigate before re-running.',
    );
    process.exit(2);
  }
  if (report.failed > 0) process.exit(1);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
