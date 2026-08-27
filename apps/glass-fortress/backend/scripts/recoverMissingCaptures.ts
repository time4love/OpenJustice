/**
 * Recover archived captures the Archive holds and this platform does not.
 *
 *   npm run forensics:recover-captures -- --url https://corona.health.gov.il/vaccine-for-covid/
 *                                                       ← dry run, the default
 *   npm run forensics:recover-captures -- --url <url> --apply
 *   npm run forensics:recover-captures -- --url <url> --limit 1 --apply
 *
 * INSTRUMENT 1 of Level 1's closing step in
 * docs/gf-factual-layer-rebuild-dev-plan.md.
 *
 * WHY NOT JUST RESCAN: measured 2026-08-27, a rescan fetches nothing and reports
 * success (`computeNextFromDate` returns null on a short final batch, so
 * `runFullScan` completes without one request to the Archive), and forcing one
 * would duplicate every existing diff, because diffs are written with `create`
 * and `UrlVersionDiff` has no unique constraint on the pair it spans.
 *
 * SCOPE: the capture layer only. No diffs, no classification, no LLM call.
 * Re-pairing the diff layer is Level 5's opening act — 7 existing diffs go stale
 * the moment these captures land, which is recorded in the plan rather than
 * marked in the schema. That is safe because it was checked: none of the 7 is
 * legally significant and none backs an evidence record.
 *
 * MAINTENANCE, so it runs in the deploy container (`railway ssh`) — never a
 * laptop and never MCP. That also keeps its chain writes on the correct
 * registry, which is the failure mode that manufactures false CONFIRMED
 * evidence.
 *
 * DRY RUN IS THE DEFAULT. --apply is required to write.
 */
import 'dotenv/config';
import { recoverMissingCaptures } from '../src/services/recoverMissingCaptures';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const dryRun = !flag('apply');
  const url = arg('url');
  const limitRaw = arg('limit');
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);

  if (!url) {
    console.error('--url is required.');
    process.exit(1);
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    console.error(`--limit must be a positive integer, got '${String(limitRaw)}'`);
    process.exit(1);
  }

  const report = await recoverMissingCaptures({
    url,
    dryRun,
    ...(limit !== undefined ? { limit } : {}),
  });

  console.log(`${dryRun ? 'DRY RUN' : 'APPLY'} — ${report.url}`);
  console.log(
    `CDX holds ${String(report.cdxRows)} capture(s); ` +
      `${String(report.storedBefore)} stored; ${String(report.missing)} missing.`,
  );

  if (report.missing === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (dryRun) {
    console.log('\nWould fetch:');
    for (const r of report.recovered) {
      console.log(`  ${r.waybackTimestamp}  ${r.digest}`);
    }
    console.log(`\n${String(report.recovered.length)} capture(s). Re-run with --apply to write.`);
    return;
  }

  // Per capture, not merely in aggregate. Every capture recovered here is
  // byte-identical to one already stored, so each should COPY a twin's
  // transaction rather than register a duplicate — the branch that explains 71
  // null onChainTxHash rows in production, exercised against real data for the
  // first time.
  console.log('\nPer capture:');
  for (const r of report.recovered) {
    if (r.error) {
      console.log(`  ${r.waybackTimestamp}  FAILED  ${r.error}`);
      continue;
    }
    console.log(
      `  ${r.waybackTimestamp}  ${String(r.outcome)}` +
        `  anchoring=${String(r.anchoring)}` +
        (r.documentComparison && r.documentComparison !== 'MATCHES'
          ? `  payload=${r.documentComparison}`
          : ''),
    );
  }

  const tally = (pred: (r: (typeof report.recovered)[number]) => boolean): number =>
    report.recovered.filter(pred).length;

  console.log('\nSummary:');
  console.log(`  created:   ${String(tally((r) => r.outcome === 'CREATED'))}`);
  console.log(`  unchanged: ${String(tally((r) => r.outcome === 'UNCHANGED'))}`);
  console.log(`  exists:    ${String(tally((r) => r.outcome === 'EXISTS'))}`);
  console.log(`  diverged:  ${String(tally((r) => r.documentComparison === 'DIVERGED'))}`);
  console.log(
    `  payload comparison unavailable: ${String(
      tally((r) => r.documentComparison === 'UNAVAILABLE'),
    )}`,
  );
  console.log(`  failed:    ${String(tally((r) => r.error !== undefined))}`);
  for (const kind of [
    'COPIED_FROM_TWIN',
    'REGISTERED',
    'RECOVERED',
    'REGISTERED_TX_UNKNOWN',
    'NEEDS_REGISTRATION',
    'CHAIN_NOT_CONSULTED',
    'ATTEMPT_FAILED',
    'NOT_ATTEMPTED',
  ] as const) {
    const n = tally((r) => r.anchoring === kind);
    if (n > 0) console.log(`  anchoring ${kind}: ${String(n)}`);
  }

  console.log(
    `\nCaptures stored: ${String(report.storedBefore)} -> ${String(report.storedAfter)}. ` +
      `Still missing: ${String(report.stillMissing)}.`,
  );
  if (report.stillMissing > 0) {
    console.log(
      'Still-missing captures are fetch failures, not a design gap — re-run to pick them up.',
    );
  }
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => {
    void 0;
  });
