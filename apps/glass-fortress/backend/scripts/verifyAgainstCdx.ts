/**
 * Level 1's completion criterion, on TWO axes:
 *
 *   EXTERNAL  sha1b32(document) == cdx.digest    — is it what the source served?
 *   INTERNAL  sha256(document)  == documentHash  — does the row agree with itself?
 *
 *   npm run forensics:verify-against-cdx -- --url <url>
 *
 * READ-ONLY. One CDX query, no capture fetches, no writes.
 *
 * The external axis is why this replaced `document NOT NULL` as the criterion: a
 * structural test says a value is present, never that it is the value the source
 * served. Level 1 was declared done on the structural test once and was wrong —
 * twice, for the same reason both times.
 *
 * The internal axis is here because the external one alone was ALSO wrong, in a
 * quieter way. It recomputes its digest from `document` and never reads
 * `documentHash`, so when reconcileAgainstCdx wrote the CDX digest into that
 * column — all 83 rows, both environments — this check reported 83/83 VERIFIED
 * throughout. A level can verify its claim about the outside world and never
 * verify its claim about itself.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
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
  console.log(
    `internal axis — ALL captures, any provenance: ${String(report.internallyChecked)}`,
  );
  console.log(
    `  INTERNALLY CONTRADICTED : ${String(report.internallyContradicted)}  ` +
      `(sha256(document) != documentHash — the row disagrees with itself)`,
  );

  for (const v of report.verdicts) {
    if (v.verdict !== 'VERIFIED') {
      console.log(
        `\n  ${v.waybackTimestamp}  ${v.verdict}` +
          `\n     cdx : ${String(v.cdxDigest)}` +
          `\n     ours: ${v.ourDigest}  (${String(v.bytes)} bytes, content-encoding: ${String(v.contentEncoding)})`,
      );
    }
  }

  for (const v of report.internalVerdicts) {
    if (v.verdict === 'VERIFIED') continue;
    console.log(
      `\n  ${v.capturedAt.toISOString()}  ${v.provenance}  INTERNALLY CONTRADICTED` +
        `\n     stored     : ${v.storedDocumentHash}` +
        `\n     recomputed : ${v.recomputedDocumentHash}`,
    );
  }

  console.log(
    `\nLEVEL 1 COMPLETE FOR THIS URL: ${report.levelOneComplete ? 'YES' : 'NO'}`,
  );
  if (!report.levelOneComplete) {
    console.log(
      'A CONTRADICTED capture means the stored payload is not what the Archive recorded.\n' +
        'Re-run forensics:backfill-document-bytes after fixing the cause — never by relaxing this check.\n' +
        'An INTERNALLY CONTRADICTED capture means the bytes may be fine while the hash over\n' +
        'them is not: repair it locally with forensics:rehash-documents. Nothing is re-fetched,\n' +
        'because the bytes are settled by the external axis above.',
    );
    process.exitCode = 2;
  }
}

void runOperationalScript(main);
