/**
 * Store the archived payload for captures that hold only text derived from it.
 *
 *   npm run forensics:backfill-document-bytes -- --url <url>          ← dry run
 *   npm run forensics:backfill-document-bytes -- --url <url> --apply
 *   npm run forensics:backfill-document-bytes -- --url <url> --limit 1 --apply
 *
 * Step 2 of Level 1's reopening, and the only thing between "the payload column
 * exists" and "the payload column is NOT NULL". Until it has run in an
 * environment, that environment's enforcing migration (20260827180000) fails and
 * the deploy aborts with the previous version still serving.
 *
 * Replaces forensics:backfill-raw-text, which filled the column that turned out
 * to BE the problem.
 *
 * DRY RUN IS THE DEFAULT. --apply is required to write.
 */
import 'dotenv/config';
import {
  backfillDocumentBytes,
  countSnapshotsWithoutDocument,
} from '../src/services/backfillDocumentBytes';

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

  const before = await countSnapshotsWithoutDocument(url);
  console.log(
    `${dryRun ? 'DRY RUN' : 'APPLY'} — ${String(before)} capture(s) hold no archived payload` +
      `${url ? ` for ${url}` : ''}.`,
  );
  if (before === 0) {
    console.log('Nothing to do.');
    return;
  }

  const report = await backfillDocumentBytes({
    dryRun,
    ...(url ? { url } : {}),
    ...(limit !== undefined ? { limit } : {}),
  });

  if (dryRun) {
    console.log(`Would fetch ${String(report.rows.length)} capture(s). Re-run with --apply.`);
    return;
  }

  console.log(`\nFilled: ${String(report.filled)}. Still missing: ${String(report.missingAtEnd)}.`);

  // Reported, never silently resolved. A recomputation that differs from the
  // stored text means the decoded-string path and the bytes path disagree about
  // this capture — worth knowing, because the stored text was the only thing
  // this platform held until now.
  console.log(`Derived text CHANGED on ${String(report.textChanged)} capture(s).`);
  for (const r of report.rows) {
    if (r.textChanged === true) {
      // The header, not just the count. The stored text came from axios
      // `responseType: 'text'`, which defaults to UTF-8 in Node and ignores a
      // declared charset. On a Hebrew page a windows-1255 payload read as UTF-8
      // is mojibake that passes every structural test — so if the header says
      // windows-1255, the change is a REPAIR rather than a regression.
      console.log(
        `  text changed: ${String(r.waybackTimestamp)}  Content-Type: ${String(r.contentType)}`,
      );
    }
  }
  // Printed whether or not anything changed, so the charset is on the record.
  const charsets = new Set(
    report.rows.map((r) => r.contentType).filter((c): c is string => typeof c === 'string'),
  );
  if (charsets.size > 0) {
    console.log(`Content-Type header(s) seen: ${[...charsets].join(' | ')}`);
  }

  if (report.failures.length > 0) {
    console.log(`\nFailures (${String(report.failures.length)}):`);
    for (const f of report.failures) {
      console.log(`  ${String(f.waybackTimestamp)}  ${String(f.error)}`);
    }
    console.log('Re-run to pick them up — the guard makes it safe.');
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
