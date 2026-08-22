#!/usr/bin/env ts-node
/**
 * Follow individual claims across a tracked page's whole archived history.
 *
 *   npm run forensics:trajectories -- --url https://corona.health.gov.il/vaccine-for-covid/
 *   npm run forensics:trajectories -- --url <url> --min-transitions 1
 *
 * Deterministic: presence is a string search against the archived snapshot text,
 * with no model involved anywhere. Every result can be checked by opening the
 * listed snapshots on web.archive.org and searching for the claim.
 */
import 'dotenv/config';
import { computeClaimTrajectories } from '../src/services/claimTrajectory';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const url = arg('url');
  if (!url) {
    console.error('Usage: npm run forensics:trajectories -- --url <tracked url> [--min-transitions N]');
    process.exitCode = 1;
    return;
  }

  const minTransitions = arg('min-transitions');
  const result = await computeClaimTrajectories(url, {
    ...(minTransitions ? { minTransitions: parseInt(minTransitions, 10) } : {}),
  });

  console.log(`\nPage:        ${result.url}`);
  console.log(`Snapshots:   ${result.snapshotsExamined}`);
  console.log(`Candidates:  ${result.candidatesConsidered}` +
    (result.candidatesUnmatched > 0
      ? `  (${result.candidatesUnmatched} never found in any snapshot — likely paraphrased extractions)`
      : ''));
  console.log(`Trajectories: ${result.trajectories.length}\n`);

  for (const t of result.trajectories) {
    console.log('─'.repeat(78));
    console.log(`${t.transitions} transitions · ${t.firstSeen} → ${t.lastSeen} · final: ${t.finalState}`);
    console.log(`\n  "${t.claimText.slice(0, 220)}${t.claimText.length > 220 ? '…' : ''}"\n`);
    // Only the flips are printed: the unchanged stretches between them are
    // where nothing happened, and listing every snapshot would bury the shape.
    for (let i = 0; i < t.observations.length; i++) {
      const o = t.observations[i];
      const prev = i > 0 ? t.observations[i - 1] : undefined;
      if (prev && prev.present === o.present) continue;
      console.log(`    ${o.snapshotDate}  ${o.present ? 'PRESENT' : 'ABSENT '}  ${o.snapshotUrl}`);
    }
    console.log();
  }

  if (result.trajectories.length > 0) {
    console.log('Verify any of these by opening the snapshot URLs and searching for the claim text.');
  }
}

main()
  .catch((err: unknown) => {
    console.error('Failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
