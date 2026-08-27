/**
 * Store the archived document for snapshots that hold only its extraction.
 *
 *   npm run forensics:backfill-raw-text                 ← dry run, the default
 *   npm run forensics:backfill-raw-text -- --apply
 *   npm run forensics:backfill-raw-text -- --url https://corona.health.gov.il/vaccine-for-covid/ --limit 5 --apply
 *
 * Level 1 of docs/gf-factual-layer-rebuild-dev-plan.md, and the only
 * step between "the columns exist" and "the columns are NOT NULL". Until it has
 * run in an environment, that environment's step-3 migration will fail and the
 * deploy will abort with the previous version still serving — which is the
 * intended ordering guarantee, not an accident.
 *
 * Reads from the Internet Archive; writes only to columns that are currently
 * null. Never overwrites a stored document: a refetch that disagrees with one
 * means the Archive's own copy changed, which is a finding rather than something
 * to paper over. Touches no hash anything is anchored to.
 *
 * Idempotent and resumable — run it again after an interruption or an archive
 * outage and it picks up exactly what is still missing.
 *
 * DRY RUN IS THE DEFAULT. --apply is required to write.
 */
import 'dotenv/config';
import {
  backfillSnapshotRawText,
  countSnapshotsWithoutRawText,
} from '../src/services/backfillSnapshotRawText';

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

  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    console.error(`--limit must be a positive integer, got '${String(limitRaw)}'`);
    process.exit(1);
  }

  const before = await countSnapshotsWithoutRawText(url);
  console.log(
    `${dryRun ? 'DRY RUN' : 'APPLY'} — ${String(before)} snapshot(s) hold no archived document` +
      `${url ? ` for ${url}` : ''}.`,
  );
  if (before === 0) {
    console.log('Nothing to do.');
    return;
  }

  const result = await backfillSnapshotRawText({
    dryRun,
    ...(url ? { url } : {}),
    ...(limit !== undefined ? { limit } : {}),
  });

  console.log(
    `${dryRun ? 'Would fill' : 'Filled'}: ${String(result.filled)}. ` +
      `Still missing: ${String(result.missingAtEnd)}.`,
  );

  if (result.failures.length > 0) {
    console.warn(`\n${String(result.failures.length)} could not be filled:`);
    for (const f of result.failures) {
      console.warn(`  ${f.waybackTimestamp}  ${f.reason}  ${f.detail}`);
    }
    // A partial fill is a normal outcome of an archive outage, and re-running is
    // the remedy. Exit non-zero so a pipeline never reads it as complete.
    process.exit(2);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
