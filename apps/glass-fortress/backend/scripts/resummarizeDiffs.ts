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
 * re-extracts and never re-fetches the archive, and asserts against the PERSISTED
 * row that its own write left the evidence fileHash exactly where it was.
 *
 * Separately reports rows whose registered evidence hash no longer derives from
 * the diff at all — a pre-existing condition caused by reclassification rewriting
 * the extracted items after the evidence was created and anchored. Those rows are
 * processed normally: nothing here touches a hashed field.
 *
 * Records the previous prose for every row it touches.
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
    if (row.registeredHashUnverifiable) {
      console.log('  ⚠️  registered evidence hash does not derive from this diff (pre-existing — see below)');
    }
    if (!dryRun) console.log(`  evidence updated: ${row.evidenceUpdated}   reindexed: ${row.reindexed}`);
    console.log('');
  }

  console.log('---');
  console.log(`examined:  ${report.examined}`);
  console.log(`rewritten: ${report.rewritten}${dryRun ? ' (dry run — none written)' : ''}`);
  console.log(`failed:    ${report.failed}`);
  if (report.failures.length > 0) {
    console.error('\nfailures:');
    const byReason = new Map<string, number>();
    for (const f of report.failures) byReason.set(f.reason, (byReason.get(f.reason) ?? 0) + 1);
    for (const [reason, count] of byReason) console.error(`  ${count} ×  ${reason}`);
  }
  console.log(`hashDrift: ${report.hashDrift}`);
  console.log(`registered hash unverifiable: ${report.registeredHashUnverifiable}`);

  if (report.registeredHashUnverifiable > 0) {
    console.warn(
      `\n⚠️  ${report.registeredHashUnverifiable} evidence record(s) carry a fileHash that cannot be ` +
        'recomputed from the diff as it now stands.\n' +
        '    Cause: forensics:reclassify rewrites deletedText/addedText, two of the four inputs to\n' +
        '    forensicEvidenceFileHash, so any Evidence row created before a reclassification stops\n' +
        '    verifying. The anchors are real; what is lost is the ability to rederive them.\n' +
        '    NOT caused by this operation, which writes no hashed field. Needs its own remediation.',
    );
  }

  // Non-zero means THIS operation moved a field feeding the evidence fileHash,
  // which it must never do. Loud, and non-zero exit so a script or a log cannot
  // miss it.
  if (report.hashDrift > 0) {
    console.error(
      `\n⚠️  ${report.hashDrift} diff(s) had their evidence fileHash MOVED by this run. ` +
        'resummarize must never write a hashed field — stop and investigate.',
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
