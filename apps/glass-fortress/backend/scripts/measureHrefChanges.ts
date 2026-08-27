/**
 * Were there href-only changes across the stored captures?
 *
 *   npm run forensics:measure-href-changes -- --url <url>
 *
 * READ-ONLY. No Archive, no model, no writes — it reads stored payloads and
 * compares href sets between consecutive captures.
 *
 * Level 4 reconnaissance, written during Level 1 and run only after it closed.
 * Every finding this corpus has produced was computed over text with no link
 * targets, so the central one — that the adverse-event reporting channel was
 * removed — rests entirely on anchor text.
 */
import 'dotenv/config';
import { measureHrefChanges } from '../src/services/measureHrefChanges';

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

  const report = await measureHrefChanges(url);

  console.log(`READ-ONLY — ${report.url}`);
  console.log(
    `${String(report.capturesExamined)} capture(s), ${String(report.pairsCompared)} consecutive pair(s).`,
  );
  console.log(`Pairs whose href set changed: ${String(report.changes.length)}`);
  console.log(
    `Of those, INVISIBLE to the derived text: ${String(report.invisibleToTextCount)}` +
      ' — changes no diff, trajectory or classifier here could ever have reported.',
  );

  for (const c of report.changes) {
    console.log(
      `\n${c.beforeDate} -> ${c.afterDate}` +
        (c.invisibleToText ? '  [INVISIBLE TO TEXT]' : ''),
    );
    for (const h of c.removed) console.log(`  - ${h}`);
    for (const h of c.added) console.log(`  + ${h}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
