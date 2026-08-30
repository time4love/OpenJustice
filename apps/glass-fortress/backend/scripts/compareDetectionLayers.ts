/**
 * What would change if trajectory detection read the DOCUMENT instead of the EXTRACTION?
 *
 *   npm run forensics:compare-detection-layers -- --env staging --url <url>
 *
 * READ-ONLY, AND IT NEVER PERSISTS. No Archive, no model, no network, no write —
 * it detects twice over one candidate set and compares. Nothing is cached,
 * because a computation written for a layer production does not read would carry
 * a `sourceStateHash` claiming to describe a state the corpus is not in.
 *
 * THE NUMBER THAT MATTERS IS `lostByMoving`, and it is the only one that can veto
 * the change. `fullText` is Readability's article and `text` is derived from the
 * payload by `htmlToText` — DIFFERENT RENDERERS, so the same sentence is not
 * guaranteed to be the same string in both. A claim with a trajectory today can
 * have none after the move, and one of the trajectories at stake is
 * `לדיווח על תופעות לוואי >`, the removal of the page's own adverse-event
 * reporting link.
 *
 * Exit 0 means the move loses nothing. Exit 3 means it loses something and the
 * loss must be explained before `DETECTION_VERSION` is bumped and every
 * trajectory in the corpus recomputed.
 *
 * Written BEFORE the flip on purpose. This repository has twice this week
 * believed an instrument's first run — an anchor audit that could not reach its
 * own success arm, and an href measurer that reported a government reporting
 * channel vanishing thirteen times because it never inflated gzip. A measurement
 * that precedes a full recomputation gets a number that can condemn it.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { compareDetectionLayers } from '../src/services/claimTrajectory';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const url = arg('url');
  if (url === undefined || url.startsWith('--')) {
    console.error('--url is required.');
    return 1;
  }

  const r = await compareDetectionLayers(url);

  console.log(`\nREAD-ONLY — ${r.url}`);
  console.log(`Candidates considered  ${String(r.candidatesConsidered)}\n`);
  console.log('                       trajectories   unmatched   snapshots');
  for (const layer of ['EXTRACTION', 'DOCUMENT'] as const) {
    const p = r.perLayer[layer];
    console.log(
      `  ${layer.padEnd(20)} ${String(p.trajectories).padStart(6)}` +
        `${String(p.unmatched).padStart(12)}${String(p.snapshotsExamined).padStart(12)}`,
    );
  }

  // LOST FIRST, always. It is the finding, and printing the gain above it would
  // let a reader stop at good news — the shape that made a broken href
  // measurement read as a discovery.
  console.log(`\nLOST by moving to DOCUMENT: ${String(r.lostByMoving.length)}`);
  for (const t of r.lostByMoving) {
    console.log(`  ${String(t.transitions)} transitions  ${t.claimText.slice(0, 90)}`);
  }

  console.log(`\nGAINED by moving to DOCUMENT: ${String(r.gainedByMoving.length)}`);
  for (const t of r.gainedByMoving) {
    console.log(`  ${String(t.transitions)} transitions  ${t.claimText.slice(0, 90)}`);
  }

  // Kept by both and NOT the same finding. Reported separately because set
  // membership would call this "survived".
  console.log(`\nSHAPE CHANGED (kept, different transition count): ${String(r.changedShape.length)}`);
  for (const t of r.changedShape) {
    console.log(
      `  ${String(t.extraction)} -> ${String(t.document)}  ${t.claimText.slice(0, 90)}`,
    );
  }

  if (r.lostByMoving.length > 0 || r.changedShape.length > 0) {
    console.error(
      '\n⚠️  The move is NOT free. Explain every lost and reshaped trajectory before\n' +
        '    bumping DETECTION_VERSION — a recompute makes this the corpus\'s only answer.',
    );
    return 3;
  }

  console.log('\n✅ No trajectory is lost or reshaped by reading the document.');
  return 0;
}

void runOperationalScript(main);
