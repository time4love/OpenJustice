/**
 * Does every anchoring claim in this corpus carry a CHECK, and is it current?
 *
 *   npm run forensics:audit-anchors
 *   npm run forensics:audit-anchors -- --verbose
 *
 * Read-only, and it never touches the chain — every state is derived from stored
 * rows. Safe to point at any environment, and re-runnable against a corpus it
 * did not check.
 *
 * THE NUMBERS THAT MATTER ARE `UNCHECKED` AND `UNAVAILABLE`. A record marked
 * CONFIRMED with no verdict behind it has never been asked whether its anchor
 * exists; a record whose only verdict is UNAVAILABLE was asked and the chain did
 * not answer. NEITHER IS A PASS, and both were indistinguishable from a verified
 * record before Level 3a — which is how 5 of 7 staging rows sat CONFIRMED
 * without anchors for two months.
 *
 * Exits 4 when anything is unchecked, stale, unavailable or contradicted, so it
 * can gate a pipeline as well as inform a person.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { auditOnChainAnchors } from '../src/services/auditOnChainAnchors';

async function main(): Promise<void> {
  const verbose = process.argv.includes('--verbose');
  const report = await auditOnChainAnchors();
  const s = report.byState;

  console.log('\nLevel 3a — anchor check coverage\n');
  console.log(`Subjects claiming an anchor   ${String(report.subjects)}`);
  console.log(`  VERIFIED                    ${String(s.VERIFIED)}`);
  console.log(`  CONTRADICTED                ${String(s.CONTRADICTED)}   (chain and database disagree)`);
  console.log(`  UNAVAILABLE                 ${String(s.UNAVAILABLE)}   (chain unreachable — NOT a pass)`);
  console.log(`  UNCHECKED                   ${String(s.UNCHECKED)}   (no verdict ever recorded — NOT a pass)`);
  console.log(
    `  STALE                       ${String(s.STALE)}   ` +
      '(the claim moved, the rule moved, or the verdict does not name this chain)',
  );
  console.log(`\nVerifier version              ${report.currentVerifierVersion}\n`);

  // A silent zero here would make every reassuring line above vacuous: a corpus
  // with no anchored subjects reports nothing unchecked and reads as a pass.
  if (report.subjects === 0) {
    console.error('No subject claims an anchor. This report says nothing; it is not a pass.');
    process.exit(1);
  }

  for (const row of report.unverified) {
    console.log(
      `${row.subjectType} ${row.subjectId}  ${row.state}` +
        (row.onChainVerdict === null ? '' : `  (${row.onChainVerdict})`),
    );
    if (row.staleReason !== null) console.log(`    ${row.staleReason}`);
  }
  if (verbose && report.unverified.length === 0) {
    console.log('Every subject that claims an anchor has a current, verified check.');
  }

  // Reported loudly rather than counted: a check whose subject is gone means
  // something deleted a record Level 10 forbids deleting.
  if (report.danglingChecks.length > 0) {
    console.error(`\n${String(report.danglingChecks.length)} check(s) point at a subject that no longer exists:`);
    for (const d of report.danglingChecks) console.error(`  ${d.subjectType} ${d.subjectId}`);
  }

  if (s.UNCHECKED > 0 || s.STALE > 0 || s.UNAVAILABLE > 0 || s.CONTRADICTED > 0) process.exit(4);
}

void runOperationalScript(main);
