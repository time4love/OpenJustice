/**
 * What would a different MIN_CLAIM_LENGTH actually find?
 *
 *   npm run forensics:measure-claim-length -- --env <env> --url <url>
 *   npm run forensics:measure-claim-length -- --env <env> --url <url> --thresholds 0,20,40
 *
 * READ-ONLY. It never lowers the threshold, never recommends a value, and writes
 * nothing — not even a trajectory computation, which `get_claim_trajectories`
 * would persist. A sweep over hypothetical thresholds must not fill that cache
 * with answers no production read can be served.
 *
 * WHY MEASURE BEFORE CHANGING. `MIN_CLAIM_LENGTH = 40` buys precision at the cost
 * of missing terse claims, and its own comment calls that "a trade worth
 * revisiting once there are real trajectories to look at". There are now real
 * ones. Level 4 sits deferred in the same plan because its rationale was
 * falsified by exactly this kind of pass — the mechanism it named turned out to
 * be 13% and 21% of the contradicted excerpts, and every variant measured WORSE
 * than leaving it alone. Changing the constant first would repeat that in a
 * subsystem where it also bumps DETECTION_VERSION and recomputes everything.
 *
 * THE COUNTS DO NOT SETTLE IT; the claims printed under them do. Read each
 * admitted claim against its two numbers:
 *
 *   present in nearly every capture, yet flipping  — an incidental substring
 *     match, the failure mode the threshold exists to prevent
 *   present in a contiguous run, then REMOVED      — a real withdrawal, which is
 *     what this platform exists to catch
 *
 * Deciding is the researcher's; this only makes the decision cost a reading
 * rather than a guess.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { DEFAULT_THRESHOLDS, measureClaimLength } from '../src/services/measureClaimLength';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const url = arg('url');
  if (url === undefined) {
    console.error('Usage: npm run forensics:measure-claim-length -- --env <env> --url <url>');
    process.exit(1);
  }

  const raw = arg('thresholds');
  const thresholds =
    raw === undefined
      ? DEFAULT_THRESHOLDS
      : raw
          .split(',')
          .map((t) => Number(t.trim()))
          .filter((t) => Number.isInteger(t) && t >= 0);

  if (thresholds.length === 0) {
    console.error('--thresholds must be a comma-separated list of non-negative integers.');
    process.exit(1);
  }

  const report = await measureClaimLength(url, thresholds);

  console.log(`\nMIN_CLAIM_LENGTH sweep — ${report.url}`);
  console.log(
    `captures examined ${String(report.snapshotsExamined)}   ` +
      `production threshold ${String(report.productionThreshold)}   ` +
      `surfacing at >= ${String(report.minTransitions)} transitions\n`,
  );

  // A corpus with no candidates reports "no new claims" at every threshold and
  // reads as a settled question. It is not an answer; it is an empty input.
  const anyCandidates = report.measurements.some((m) => m.candidatesConsidered > 0);
  if (!anyCandidates) {
    console.error(
      'No candidate claims at ANY threshold — this URL has no classified diffs to draw quotes\n' +
        'from. This sweep says nothing about the threshold; it is not evidence that lowering it\n' +
        'would find nothing.',
    );
    process.exit(1);
  }

  console.log('  min  candidates  unmatched  detected  surfacing  newly surfacing');
  for (const m of report.measurements) {
    console.log(
      `  ${String(m.minClaimLength).padStart(3)}  ` +
        `${String(m.candidatesConsidered).padStart(10)}  ` +
        `${String(m.candidatesUnmatched).padStart(9)}  ` +
        `${String(m.trajectoriesDetected).padStart(8)}  ` +
        `${String(m.surfacing).padStart(9)}  ` +
        `${String(m.admitted.length).padStart(15)}`,
    );
  }

  // THE DELIVERABLE. Printed for the LOWEST threshold only: its admitted set is
  // a superset of every higher one, so repeating them per threshold would pad
  // the output with the same claims and bury the reading this exists for.
  const lowest = report.measurements[0];
  if (lowest === undefined || lowest.admitted.length === 0) {
    console.log('\nNo claim surfaces below the production threshold that does not already.\n');
    return;
  }

  console.log(
    `\nClaims surfacing at min=${String(lowest.minClaimLength)} and NOT at ` +
      `${String(report.productionThreshold)} — read these, the counts above do not settle it:\n`,
  );
  for (const c of lowest.admitted) {
    console.log(
      `  [${String(c.length).padStart(3)} chars]  ${String(c.transitions)} transitions  ` +
        `present in ${String(c.presentIn)}/${String(report.snapshotsExamined)}  ${c.finalState}`,
    );
    console.log(`    ${c.claim}`);
  }
  console.log(
    '\nPresent in nearly every capture while still flipping is the incidental-match signature.\n' +
      'A contiguous run ending REMOVED is a withdrawal. Changing the constant bumps\n' +
      'DETECTION_VERSION and recomputes every trajectory — it is a research decision.\n',
  );
}

void runOperationalScript(main);
