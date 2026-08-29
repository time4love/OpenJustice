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
import { runOperationalScript } from '../src/lib/operationalContext';
import { getClaimTrajectories } from '../src/services/claimTrajectory';

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
  const result = await getClaimTrajectories(url, {
    ...(minTransitions ? { minTransitions: parseInt(minTransitions, 10) } : {}),
  });

  console.log(`\nPage:       ${result.url}`);
  console.log(`Snapshots:  ${result.snapshotsExamined}`);
  console.log(`Candidates: ${result.candidatesConsidered}` +
    (result.candidatesUnmatched > 0
      ? `  (${result.candidatesUnmatched} never found in any snapshot — likely paraphrased extractions)`
      : ''));
  // Findings, not trajectories. Pages are edited in blocks, so one event
  // produces a trajectory per paragraph inside it.
  console.log(`Findings:   ${result.groups.length}  (${result.trajectories.length} claims)\n`);

  for (const g of result.groups) {
    console.log('─'.repeat(78));
    console.log(
      `${g.claims.length} claim(s) moved together · ${g.transitions} transitions · ` +
        `${g.firstSeen} → ${g.lastSeen} · final: ${g.finalState}`,
    );
    console.log();
    for (const o of g.changes) {
      console.log(`    ${o.snapshotDate}  ${o.present ? 'PRESENT' : 'ABSENT '}  ${o.snapshotUrl}`);
    }
    console.log();
    for (const c of g.claims) {
      console.log(`    · ${c.claimText.slice(0, 150)}${c.claimText.length > 150 ? '…' : ''}`);
    }
    console.log();
  }

  if (result.groups.length > 0) {
    console.log('Verify any of these by opening the snapshot URLs and searching for the claim text.');
  }
}

void runOperationalScript(main).finally(() => { process.exit(); });
