/**
 * Record a Level 3a anchor check for every subject that lacks a current one.
 *
 *   npm run forensics:backfill-anchor-checks -- --dry-run
 *   npm run forensics:backfill-anchor-checks
 *
 * READS THE CHAIN, WRITES NOTHING TO IT. One `isHashRegistered` call per
 * subject and one IntegrityCheck row each. It cannot register, supersede or
 * spend anything — the only chain call it makes is a view function — so it is
 * outside the MCP-only rule, which covers chain WRITES.
 *
 * WHY A BACKFILL EXISTS AT ALL. The write path now checks and records, but every
 * record promoted before Level 3a asserts an anchor that was never verified.
 * Leaving them UNCHECKED would make the audit's headline number a statement
 * about when a row was written rather than about whether it is true.
 *
 * IDEMPOTENT AND RESUMABLE. It skips subjects whose newest check is already
 * current, so an interrupted run resumes by being run again. `--force`
 * re-checks everything, which is what to use after the chain was unreachable.
 */
import 'dotenv/config';
import {
  auditOnChainAnchorSubjects,
  auditOnChainAnchors,
} from '../src/services/auditOnChainAnchors';
import { recordOnChainCheck } from '../src/services/onChainVerification';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  const before = await auditOnChainAnchors();
  // The audit already computed exactly this set: every subject not standing at
  // a current VERIFIED check. Re-deriving it here would be a second definition
  // of "needs checking" — the shape this repository keeps paying for.
  const targets = force ? await auditOnChainAnchorSubjects() : before.unverified;

  console.log(`\nSubjects claiming an anchor   ${String(before.subjects)}`);
  console.log(`Needing a check               ${String(targets.length)}`);
  for (const [state, count] of Object.entries(before.byState)) {
    if (count > 0) console.log(`  ${state.padEnd(14)} ${String(count)}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing was checked and nothing was written.\n');
    return;
  }
  if (targets.length === 0) {
    console.log('\nEvery anchoring claim already carries a current check.\n');
    return;
  }

  // One RPC read per subject, sequential. A corpus of this size is under a
  // hundred calls, and firing them concurrently at a public endpoint is how the
  // "no backend is currently healthy" failures that started this whole level
  // were provoked in the first place.
  console.log(`\nChecking ${String(targets.length)} subject(s) — one chain read each.\n`);
  let recorded = 0;
  for (const target of targets) {
    const result = await recordOnChainCheck({
      subjectType: target.subjectType,
      subjectId: target.subjectId,
      fileHash: target.fileHash,
    });
    recorded += 1;
    console.log(
      `${target.subjectType} ${target.subjectId}  ${result.verdict}` +
        (result.onChainVerdict === null ? '' : `  (${result.onChainVerdict})`),
    );
  }

  const after = await auditOnChainAnchors();
  console.log(`\nRecorded ${String(recorded)} check(s).`);
  console.log('State after:');
  for (const [state, count] of Object.entries(after.byState)) {
    console.log(`  ${state.padEnd(14)} ${String(count)}`);
  }
  console.log('\nRun `npm run forensics:audit-anchors` to gate on the result.\n');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
