/**
 * Level 1's completion criterion: does every stored payload reproduce the
 * Archive's own published digest?
 *
 *   npm run forensics:verify-against-cdx -- --url <url>
 *
 * READ-ONLY. One CDX query, no capture fetches, no writes.
 *
 * This is an EXTERNAL witness, which is why it replaces `document NOT NULL` as
 * the criterion: a structural test says a value is present, never that it is the
 * value the source served. Level 1 was declared done on the structural test once
 * and was wrong — twice, for the same reason both times.
 */
import 'dotenv/config';
import { verifyAgainstCdx } from '../src/services/verifyAgainstCdx';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const url = arg('url');
  if (!url) {
    console.error('--url is required.');
    process.exit(1);
  }

  const report = await verifyAgainstCdx(url);

  console.log(`READ-ONLY — ${report.url}`);
  console.log(`captures: ${String(report.captures)}`);
  console.log(`  VERIFIED     : ${String(report.verified)}  (payload reproduces the Archive's digest)`);
  console.log(`  CONTRADICTED : ${String(report.contradicted)}`);
  console.log(`  UNAVAILABLE  : ${String(report.unavailable)}  (Archive published no digest — a verdict about the CHECK)`);

  for (const v of report.verdicts) {
    if (v.verdict === 'VERIFIED') continue;
    console.log(
      `\n  ${v.waybackTimestamp}  ${v.verdict}` +
        `\n     cdx : ${String(v.cdxDigest)}` +
        `\n     ours: ${v.ourDigest}  (${String(v.bytes)} bytes, content-encoding: ${String(v.contentEncoding)})`,
    );
  }

  console.log(
    `\nLEVEL 1 COMPLETE FOR THIS URL: ${report.levelOneComplete ? 'YES' : 'NO'}`,
  );
  if (!report.levelOneComplete) {
    console.log(
      'A CONTRADICTED capture means the stored payload is not what the Archive recorded.\n' +
        'Re-run forensics:backfill-document-bytes after fixing the cause — never by relaxing this check.',
    );
    process.exitCode = 2;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
