#!/usr/bin/env ts-node
/**
 * Bring stored forensic classifications up to the current classifier.
 *
 *   npm run forensics:reclassify -- --dry-run
 *   npm run forensics:reclassify -- --url https://corona.health.gov.il/vaccine-for-covid/
 *   npm run forensics:reclassify -- --adopt-orphans
 *   npm run forensics:reclassify -- --out-of-sync
 *
 * Reads the raw diff text persisted at scan time, so nothing is re-fetched from
 * the Internet Archive and the input is deterministic. UPDATES rows; never
 * deletes. Costs one LLM call per diff, so --dry-run first is usually right.
 */
import 'dotenv/config';
import {
  reclassifyDiffs,
  findOutOfSyncEvidence,
  adoptOrphanedFindings,
} from '../src/services/reclassifyDiffs';
import { CLASSIFIER_VERSION, classifierPromptHash } from '../src/lib/classifierVersion';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  if (flag('out-of-sync')) {
    const rows = await findOutOfSyncEvidence();
    if (rows.length === 0) {
      console.log('✅ No evidence disagrees with its source diff.');
      return;
    }
    console.log(`⚠️  ${rows.length} evidence record(s) disagree with their source diff.\n`);
    console.log('The Evidence row carries the categories it was promoted with; the diff has since');
    console.log('been reclassified. Only a human can decide which should stand.\n');
    for (const r of rows) {
      console.log(`  ${r.evidenceId}  [${r.status}]`);
      console.log(`    evidence: ${r.evidenceCategories.join(', ') || '(none)'}`);
      console.log(`    diff now: ${r.diffCategories.join(', ') || '(none)'}` +
        (r.diffStillSignificant ? '' : '  ← diff is no longer significant at all'));
    }
    process.exitCode = 2;
    return;
  }

  if (flag('adopt-orphans')) {
    // No LLM call: an orphan already carries its classification, so adoption
    // records what the row asserts rather than re-deciding it.
    const result = await adoptOrphanedFindings({ url: arg('url'), dryRun: flag('dry-run') });

    console.log(`\nOrphans found: ${result.examined}  (significant diffs with no evidence record)`);
    for (const o of result.orphans) {
      console.log(`  ${o.beforeDate} → ${o.afterDate}  ${o.categories.join(', ') || '(no categories)'}`);
    }
    if (flag('dry-run')) {
      console.log('\nDRY RUN — nothing was recorded.');
      return;
    }
    console.log(`\nAdopted: ${result.adopted}`);
    if (result.refused > 0) {
      console.log(
        `Refused: ${result.refused} — recordScanFinding declined these, which means the diff is ` +
          'flagged significant while carrying no investigative category. That is a contradiction ' +
          'worth investigating rather than a failure to record.',
      );
      process.exitCode = 2;
    }
    return;
  }

  const dryRun = flag('dry-run');
  const url = arg('url');

  console.log(`Classifier: ${CLASSIFIER_VERSION}`);
  console.log(`Prompt hash: ${classifierPromptHash()}`);
  console.log(url ? `Scope: ${url}` : 'Scope: every tracked URL');
  console.log(dryRun ? 'Mode: DRY RUN — nothing will be written\n' : 'Mode: WRITE\n');

  const result = await reclassifyDiffs({
    url,
    dryRun,
    force: flag('force'),
    onProgress: (done, total) => {
      if (done === 1 || done === total || done % 10 === 0) {
        process.stdout.write(`  ${done}/${total} diffs\r`);
      }
    },
  });

  console.log(`\n\nExamined:      ${result.examined}`);
  console.log(`Reclassified:  ${result.reclassified}${dryRun ? ' (dry run — none written)' : ''}`);
  console.log(`Flipped:       ${result.flips.length}`);
  console.log(`  → significant: ${result.flipsToSignificant}`);
  console.log(`  → routine:     ${result.flipsToRoutine}`);
  // A diff that became significant is not yet a finding: without a
  // PENDING_REVIEW record, promote_scan_findings silently skips it.
  console.log(`Findings recorded: ${result.findingsRecorded}` +
    (result.flipsToSignificant !== result.findingsRecorded && !dryRun
      ? `  ⚠️ ${result.flipsToSignificant - result.findingsRecorded} flip(s) produced no finding — check the logs`
      : ''));

  if (result.flips.length > 0) {
    console.log('\nFlips:');
    for (const f of result.flips) {
      const dir = f.after.length > 0 ? 'ROUTINE → SIGNIFICANT' : 'SIGNIFICANT → ROUTINE';
      console.log(`  ${f.beforeDate} → ${f.afterDate}  ${dir}${f.hadEvidence ? '  ⚠️ HAS EVIDENCE' : ''}`);
      console.log(`    before: ${f.before.join(', ') || '(none)'}`);
      console.log(`    after:  ${f.after.join(', ') || '(none)'}`);
    }
  }

  if (result.flipsWithEvidence > 0) {
    console.log(
      `\n⚠️  ${result.flipsWithEvidence} flip(s) are on diffs that already produced evidence.`,
    );
    console.log('   Those Evidence rows still carry the categories they were promoted with,');
    console.log('   so they now disagree with their source. Run with --out-of-sync to list them.');
  }

  console.log(`\nRun recorded as ${result.runId}.`);
}

main()
  .catch((err: unknown) => {
    console.error('Reclassification failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
