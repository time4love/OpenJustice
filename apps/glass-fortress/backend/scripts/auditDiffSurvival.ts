/**
 * Does every diff carry a Level 5 verdict, and is it still about that diff?
 *
 *   npm run forensics:audit-survival
 *   npm run forensics:audit-survival -- --verbose
 *
 * Read-only. It needs neither the Internet Archive nor a model nor a network, so
 * it is safe to point at any environment, and it can be re-run to check a
 * backfill it did not perform.
 *
 * THE NUMBER THAT MATTERS IS `unchecked`. A NULL verdict means NEVER CHECKED,
 * which is not the same as passing — and without this script the two are
 * indistinguishable from outside the database. `stale` is the same failure with a
 * verdict in front of it: an answer to a question about inputs the row no longer
 * holds.
 *
 * Exits 4 when anything is unchecked or stale, so it can gate a pipeline as well
 * as inform a person. Exit 0 means every diff in this environment has a verdict
 * computed against what it currently holds.
 */
import 'dotenv/config';
import { auditDiffSurvival } from '../src/services/auditDiffSurvival';

async function main(): Promise<void> {
  const verbose = process.argv.includes('--verbose');
  const report = await auditDiffSurvival();
  const s = report.summary;

  console.log('\nLevel 5 — verdict coverage\n');
  console.log(`Diffs                     ${String(s.total)}`);
  console.log(`  UNCHECKED               ${String(s.unchecked)}   (null verdict — never checked)`);
  console.log(`  STALE                   ${String(s.stale)}   (verdict is about inputs the row no longer holds)`);
  console.log(`  current                 ${String(s.current)}`);
  console.log('\nAmong current verdicts only:');
  console.log(`  SURVIVES                ${String(s.survives)}`);
  console.log(`  CONTRADICTED            ${String(s.contradicted)}`);
  console.log(`  UNCHECKABLE             ${String(s.uncheckable)}\n`);

  // A silent zero here would make every reassuring line above vacuous: an empty
  // corpus reports no unchecked diffs and no contradictions, and reads as a pass.
  if (s.total === 0) {
    console.error('No diffs found. This report says nothing; it is not a pass.');
    process.exit(1);
  }

  for (const d of report.diffs) {
    if (d.state === 'CURRENT' && !verbose) continue;
    console.log(
      `${d.beforeDate} -> ${d.afterDate}  ${d.state}` +
        (d.verdict === null ? '' : `  (${d.verdict})`),
    );
    if (d.reason !== undefined) console.log(`    ${d.reason}`);
  }

  if (s.unchecked > 0 || s.stale > 0) process.exit(4);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
