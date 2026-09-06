/**
 * Custody per capture: extractor equality, and whether the Archive still serves it.
 *
 *   npm run forensics:measure-custody -- --env staging --url <page>
 *   npm run forensics:measure-custody -- --env staging --url <page> --fetch
 *   npm run forensics:measure-custody -- --env staging --url <page> --fetch --delay-ms 4000
 *
 * The rebuild's step 1(a) and 1(c) (evidence flows §8; refactor plan §3 step 9).
 * Per capture: does the pinned extractor over the stored bytes reproduce the
 * stored contentHash — EQUAL / UNEQUAL / NO_BYTES; and with --fetch, one GET of
 * the raw capture with its status recorded and, on 200, its bytes hashed
 * against documentHash and the CDX digest.
 *
 * READ-ONLY. Nothing stored, nothing anchored. --fetch reads the Archive at the
 * given pace and no faster; a 429 is recorded as RATE_LIMITED and never retried
 * inside this run, because the count of 429s is itself part of the measurement.
 *
 * Exits 1 when the page has no archived capture: a report over nothing says
 * nothing, and is not a pass.
 *
 * A JSON block between the two delimiters carries every row, so counts are
 * taken from the file with jq and never transcribed by hand.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { measureCaptureCustody } from '../src/services/measureCaptureCustody';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const DEFAULT_DELAY_MS = 4_000;

async function main(): Promise<number | undefined> {
  const url = arg('url');
  if (url === undefined) {
    console.error('--url is required.');
    return 1;
  }
  const fetch = process.argv.includes('--fetch');
  const delayRaw = arg('delay-ms');
  const delayMs = delayRaw === undefined ? DEFAULT_DELAY_MS : Number(delayRaw);
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    console.error(`--delay-ms must be a non-negative number, got "${delayRaw ?? ''}"`);
    return 1;
  }

  const report = await measureCaptureCustody(url, { fetch, delayMs });

  console.log(`\n${report.url}`);
  console.log(`archived captures   ${String(report.captures)}`);
  console.log(`fetching            ${fetch ? `on, ${String(delayMs)} ms between captures` : 'off'}\n`);

  if (report.captures === 0) {
    console.error('No archived capture on this page. This report says nothing; it is not a pass.');
    return 1;
  }

  console.log('extractor equality  (extractArticleText(captureHtml(document), rawCaptureUrl) vs contentHash)');
  for (const [verdict, n] of Object.entries(report.extraction)) {
    console.log(`  ${verdict.padEnd(18)} ${String(n)}`);
  }
  const disagreeing = report.rows.filter((r) => !r.storedTextAgrees).length;
  console.log(`  stored fullText disagreeing with its own contentHash: ${String(disagreeing)}`);

  console.log('\narchive serving');
  for (const [outcome, n] of Object.entries(report.serving)) {
    console.log(`  ${outcome.padEnd(18)} ${String(n)}`);
  }

  console.log('\ntimestamp        extraction  serving           status  cdx       detail (non-200 only)');
  for (const r of report.rows) {
    const cdx = r.serving.cdxDigestMatch === null ? '-' : r.serving.cdxDigestMatch ? 'match' : 'MISMATCH';
    console.log(
      `${r.waybackTimestamp}  ${r.extraction.padEnd(10)}  ${r.serving.outcome.padEnd(16)}  ` +
        `${String(r.serving.status ?? '-').padStart(6)}  ${cdx.padEnd(8)}  ${r.serving.detail ?? ''}`,
    );
  }

  console.log('\n--- JSON ---');
  console.log(JSON.stringify(report));
  console.log('--- END JSON ---');
  // NO EXIT CODE ON SUCCESS, DELIBERATELY. A number here becomes process.exit(),
  // and under railway ssh stdout is a pipe whose queued output process.exit()
  // discards — the JSON block above is the file the dated doc counts from, and
  // corona's is 83 rows. The refusals above return 1, each after a few lines.
  return undefined;
}

void runOperationalScript(main);
