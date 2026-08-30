/**
 * Anchor archived snapshots whose contentHash was never registered on-chain.
 *
 *   npm run forensics:anchor-snapshots -- --dry-run
 *   npm run forensics:anchor-snapshots -- --url https://corona.health.gov.il/vaccine-for-covid/ --limit 5
 *   npm run forensics:anchor-snapshots -- --apply --copy-only     ← fills pointers, cannot spend
 *   npm run forensics:anchor-snapshots -- --apply                 ← may register, costs real money
 *
 * --copy-only makes the run structurally incapable of sending a transaction: it
 * copies a pointer from an already-anchored twin, or recovers one for a hash the
 * registry already holds, and REPORTS anything anchored nowhere instead of
 * publishing it. It also makes the chain optional, because a twin copy is pure
 * database work — a population whose every null has a twin repairs with no RPC
 * endpoint at all.
 *
 * Prefer --copy-only against any populated environment. Registration is only
 * correct when a text is genuinely unanchored, and that is a decision for a
 * person rather than a side effect of a repair.
 *
 * UrlSnapshot.contentHash is the factual layer the forensic model argues from —
 * "this page held exactly this text on this date". FINDING 41 found none of 83
 * anchored: the scan ran while the RPC was down, and registerSnapshotOnChain is
 * fire-and-forget with a swallowed rejection.
 *
 * Idempotent and resumable — anchoring is one transaction per snapshot, so this
 * is meant to be interrupted and run again. Skips rows already anchored, copies
 * the tx from a byte-identical twin rather than re-registering, and recovers the
 * tx by log scan when the hash is already on-chain from an interrupted run.
 *
 * DRY RUN IS THE DEFAULT. --apply is required to send transactions.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { anchorSnapshots, countUnanchoredSnapshots } from '../src/services/anchorSnapshots';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const dryRun = !flag('apply');
  const copyOnly = flag('copy-only');
  const url = arg('url');
  const limitRaw = arg('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (limitRaw && (!Number.isFinite(limit) || (limit as number) < 1)) {
    console.error(`--limit must be a positive number, got "${limitRaw}"`);
    process.exit(1);
  }

  const before = await countUnanchoredSnapshots();
  console.log(`unanchored snapshots, before: ${before}`);
  console.log(dryRun ? 'DRY RUN — no transactions will be sent. Pass --apply to anchor.\n' : 'APPLYING\n');
  if (copyOnly) {
    console.log(
      'COPY-ONLY — this run cannot send a transaction by any path. It fills pointers from\n' +
        'already-anchored twins and recovers pointers for hashes the chain already holds.\n' +
        'Any text anchored nowhere is REPORTED, never published.\n',
    );
  }

  const report = await anchorSnapshots({
    dryRun,
    ...(copyOnly ? { copyOnly: true } : {}),
    ...(url ? { url } : {}),
    ...(limit ? { limit } : {}),
  });

  console.log('---');
  console.log(`examined:         ${report.examined}`);
  console.log(`anchored:         ${report.anchored}${dryRun ? ' (dry run — none sent)' : ''}`);
  console.log(`copied from twin: ${report.copiedFromTwin}`);
  console.log(`recovered:        ${report.recovered}`);
  console.log(`failed:           ${report.failed}`);

  if (report.chainNotConsulted > 0) {
    console.warn(
      `\n⚠️  ${report.chainNotConsulted} snapshot(s) had no twin and the chain was not configured,\n` +
        '    so nothing could be concluded about them. This is NOT "unanchored" — it is unknown.',
    );
  }

  if (report.needsRegistration.length > 0) {
    // Deliberately loud and deliberately not a failure. It is the one outcome a
    // copy-only run exists to surface: a capture whose text is anchored nowhere
    // is a gap in the factual layer, not a missing pointer, and publishing it
    // costs real money on a real chain. That decision belongs to a person.
    console.warn(
      `\n⚠️  ${report.needsRegistration.length} snapshot(s) hold text that is anchored NOWHERE.\n` +
        '    Copy-only refused to publish them. Each would cost one transaction.\n' +
        '    Distinct content hashes needing registration:',
    );
    for (const h of new Set(report.needsRegistration.map((n) => n.anchoredHash))) {
      console.warn(`      ${h}`);
    }
  }

  if (report.failures.length > 0) {
    console.error('\nfailures:');
    // Grouped, because 83 copies of one RPC message is not 83 problems.
    const byReason = new Map<string, number>();
    for (const f of report.failures) byReason.set(f.reason, (byReason.get(f.reason) ?? 0) + 1);
    for (const [reason, count] of byReason) console.error(`  ${count} ×  ${reason}`);
  }

  if (!report.chainAvailable && !copyOnly) {
    // The exact condition that produced FINDING 41: an unreachable chain that
    // reported nothing. It must never again look like a clean run.
    console.error(
      '\n⚠️  The chain is not configured or not reachable. NOTHING was anchored.\n' +
        '    This is not a clean run — it is the same condition that left 83 snapshots unanchored\n' +
        '    while a scan reported success.',
    );
    process.exit(2);
  }

  if (!report.chainAvailable && copyOnly) {
    // Survivable here, and worth saying rather than passing over: twin copies are
    // pure database work, so the run did real repair. Only the rows needing a
    // chain answer were left undecided, and they are counted above.
    console.warn(
      '\n⚠️  The chain was not configured. Twin pointers were still copied, because that\n' +
        '    needs no chain — but nothing could be verified against the registry.',
    );
  }

  const after = await countUnanchoredSnapshots();
  console.log(`unanchored snapshots, after:  ${after}`);
  if (report.failed > 0) process.exit(1);
}

void runOperationalScript(main);
