/**
 * Confirm what each anchoring transaction actually registered, and record it.
 *
 *   npm run forensics:confirm-anchors -- --env staging
 *   npm run forensics:confirm-anchors -- --env production --apply
 *   npm run forensics:confirm-anchors -- --env staging --apply --recheck
 *
 * `anchoredHash` is added nullable and is never backfilled from the column the
 * code anchors today — that would stamp a belief, which is how ninety-one
 * integrity verdicts came to name a chain they had never been reached against.
 * This reads the receipt of the transaction EACH ROW POINTS AT and writes the
 * hash that transaction's own EvidenceSubmitted log carries.
 *
 * It is also the measurement. `auditOnChainAnchors` asks "is this row's hash
 * registered?", which passes whenever SOME transaction registered it. This asks
 * the question that can fail: did THIS transaction register it? A row whose
 * transaction registered something else is invisible to the audit and is found
 * here.
 *
 * DRY RUN IS THE DEFAULT, and a dry run is a complete measurement: every chain
 * read happens, nothing is written. Run it that way first, in both
 * environments, before --apply.
 *
 * Exit codes: 1 if a subject errored, 2 if any claim is WRONG (misanchored, a
 * transaction that registered nothing, or a claim this chain has no trace of),
 * 3 if any claim could not be CONFIRMED. Only 0 means every claim was checked
 * and every one held — an unresolved run is not a pass.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import {
  confirmAnchors,
  confirmAnchorsExitCode,
  formatConfirmAnchorsSummary,
  unresolvedClaims,
  wrongClaims,
} from '../src/services/confirmAnchors';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<number> {
  const dryRun = !flag('apply');
  // Re-examine subjects that already carry a terminal verdict. Needed after a
  // verdict has been recorded by a rule that has since been corrected — the
  // default filter treats a terminal verdict as done, which is right until the
  // rule that produced it was wrong.
  const recheck = flag('recheck');
  const limitRaw = arg('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (limitRaw && (!Number.isFinite(limit) || (limit as number) < 1)) {
    console.error(`--limit must be a positive number, got "${limitRaw}"`);
    return 1;
  }

  console.log(
    (dryRun
      ? 'DRY RUN — every chain read happens, nothing is written. Pass --apply to record.'
      : 'APPLYING — observed hashes will be written to anchoredHash.') +
      (recheck ? '\nRECHECK — subjects that already carry a terminal verdict are re-examined.' : '') +
      '\n',
  );

  const report = await confirmAnchors({
    dryRun,
    ...(limit ? { limit } : {}),
    ...(recheck ? { recheck: true } : {}),
  });

  for (const row of report.rows) {
    const c = row.confirmation;
    const where = `${row.subject} ${row.id.slice(0, 10)}…`;
    switch (c.kind) {
      case 'CONFIRMED':
        console.log(`  ok        ${where}  ${c.anchoredHash.slice(0, 14)}…`);
        break;
      case 'CONFIRMED_BY_LOG':
        console.log(`  ok (log)  ${where}  ${c.anchoredHash.slice(0, 14)}…`);
        break;
      case 'REGISTERED_BY_ANOTHER_TX':
        console.error(
          `  REGISTERED BY ANOTHER TX ${where}\n` +
            `      row points at  ${row.txHash}\n` +
            `      registry names ${c.txHashFromLog}  for hash ${c.expected}\n` +
            '      The contract reverts duplicate registration, so this should be impossible.',
        );
        break;
      case 'MISANCHORED':
        console.error(
          `  MISANCHORED ${where}\n` +
            `      row carries    ${c.expected}\n` +
            `      tx registered  ${c.anchoredHash}\n` +
            `      tx             ${row.txHash}`,
        );
        break;
      case 'ANCHORED_NOTHING':
        console.error(
          `  ANCHORED NOTHING ${where}  tx ${row.txHash}\n` +
            '      A real transaction that registered nothing with this registry.',
        );
        break;
      case 'NO_RECEIPT_HASH_REGISTERED':
        console.error(
          `  no receipt ${where}  tx ${row.txHash}\n` +
            '      The registry DOES hold this hash, so the fact is anchored on this chain.\n' +
            `      Why no transaction was named: ${c.logLookup}\n` +
            '      Recorded as TX_UNREADABLE: terminal, honest, and not a confirmation.',
        );
        break;
      case 'NO_RECEIPT_HASH_ABSENT':
        console.error(
          `  NO TRACE ${where}  tx ${row.txHash}\n` +
            `      Neither the transaction nor the hash ${c.expected} is on this chain.\n` +
            '      Either the transaction belongs to a chain this deployment no longer reads, ' +
            'or the anchor never existed.',
        );
        break;
      case 'UNREACHABLE':
        console.error(
          `  unreachable ${where}  tx ${row.txHash} — the RPC answered neither question`,
        );
        break;
      case 'AMBIGUOUS':
        console.error(
          `  AMBIGUOUS ${where}  registered ${c.candidates.length} hashes, none is ${c.expected}`,
        );
        break;
    }
  }

  // ONE WRITE, ON THE SAME STREAM AS THE DETAIL ABOVE. Printed line by line to
  // stdout while the detail went to stderr, a `> log 2>&1` interleaved them
  // mid-line and corrupted a count. The summary is what an operator reads to
  // decide, so it may not be corruptible by anything else the run prints.
  console.error(formatConfirmAnchorsSummary(report));

  // The RULE lives in the service, with a test. It was wrong here, inline and
  // unexercised, and reported a run that answered 22 of 113 questions as a pass.
  const code = confirmAnchorsExitCode(report);
  // Counted by the same functions the exit rule uses, so the number printed and
  // the code returned cannot drift apart.
  if (code === 2) {
    console.error(`\n${String(wrongClaims(report))} anchoring claim(s) are WRONG. See above.`);
  }
  if (code === 3) {
    console.error(
      `\n${String(unresolvedClaims(report))} of ${String(report.examined)} anchoring claim(s) ` +
        'could not be confirmed. Nothing is wrong with them and nothing is proven about them.',
    );
  }
  return code;
}

void runOperationalScript(main);
