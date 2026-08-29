/**
 * Confirm what each anchoring transaction actually registered, and record it.
 *
 *   npm run forensics:confirm-anchors -- --env staging
 *   npm run forensics:confirm-anchors -- --env production --apply
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
 * Exit codes: 2 if anything was misanchored, anchored nothing, or came back
 * ambiguous — findings, not failures of the run. 1 if a subject errored.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { confirmAnchors } from '../src/services/confirmAnchors';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<number> {
  const dryRun = !flag('apply');
  const limitRaw = arg('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (limitRaw && (!Number.isFinite(limit) || (limit as number) < 1)) {
    console.error(`--limit must be a positive number, got "${limitRaw}"`);
    return 1;
  }

  console.log(
    dryRun
      ? 'DRY RUN — every chain read happens, nothing is written. Pass --apply to record.\n'
      : 'APPLYING — observed hashes will be written to anchoredHash.\n',
  );

  const report = await confirmAnchors({ dryRun, ...(limit ? { limit } : {}) });

  for (const row of report.rows) {
    const c = row.confirmation;
    const where = `${row.subject} ${row.id.slice(0, 10)}…`;
    switch (c.kind) {
      case 'CONFIRMED':
        console.log(`  ok        ${where}  ${c.anchoredHash.slice(0, 14)}…`);
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
      case 'NO_RECEIPT':
        console.error(`  no receipt ${where}  tx ${row.txHash} — nothing concluded`);
        break;
      case 'AMBIGUOUS':
        console.error(
          `  AMBIGUOUS ${where}  registered ${c.candidates.length} hashes, none is ${c.expected}`,
        );
        break;
    }
  }

  console.log('\n---');
  console.log(`examined:          ${report.examined}`);
  console.log(`confirmed:         ${report.confirmed}${dryRun ? ' (dry run — none written)' : ''}`);
  console.log(`already confirmed: ${report.alreadyConfirmed}`);
  console.log(`MISANCHORED:       ${report.misanchored}`);
  console.log(`ANCHORED NOTHING:  ${report.anchoredNothing}`);
  console.log(`no receipt:        ${report.noReceipt}`);
  console.log(`ambiguous:         ${report.ambiguous}`);
  console.log(`failed:            ${report.failed}`);

  if (report.failures.length > 0) {
    console.error('\nfailures:');
    for (const f of report.failures) console.error(`  ${f.id}: ${f.reason}`);
  }

  if (report.failed > 0) return 1;
  // Findings, not run failures — and non-zero so a pipeline cannot read a
  // corpus with a fabricated anchor in it as a clean pass.
  if (report.misanchored + report.anchoredNothing + report.ambiguous > 0) return 2;
  return 0;
}

void runOperationalScript(main);
