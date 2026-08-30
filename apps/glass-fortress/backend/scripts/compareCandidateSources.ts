/**
 * What would moving the DIFFER — or splitting candidates into sentences — make
 * detectable? Measured before either is paid for.
 *
 *   npm run forensics:compare-candidate-sources -- --env staging --url <url>
 *
 * READ-ONLY, AND IT CANNOT PERSIST. No Archive, no model, no network, no write.
 * The arms carry `sourceStateHash: null`, so `persistComputation` will not accept
 * them — the compiler enforces that, not this comment.
 *
 * WHY THIS EXISTS. `forensics:compare-detection-layers` varies which text
 * presence is tested against and holds candidates fixed, so its gain arm can only
 * ever return "same or worse": candidates come from diffs over `fullText`, so the
 * ~31% Readability discards can never produce one. Moving the differ for real
 * costs a `diffInputVersion` bump and hundreds of classifier calls. The chunks and
 * the payloads are ALREADY STORED and detection is deterministic, so what the move
 * would make REACHABLE can be computed for nothing first.
 *
 * THE ASYMMETRY, WHICH IS THE WHOLE CAVEAT. `DOCUMENT_CHUNKS` bounds the set a
 * re-classification could draw from, not the set it would produce — the classifier
 * samples and merges. A claim absent from every document chunk cannot be produced
 * by any re-classification, which is a real veto. A claim present in one merely
 * COULD be. This instrument can CANCEL the spend. It can never approve it, and
 * exit 0 must not be read as though it had.
 *
 * Exit 4 the run cannot be believed — an arm had no input, so its zeroes are
 *        absence of measurement rather than absence of effect.
 * Exit 3 the move is not justified by this measurement: it reaches nothing new,
 *        or it costs trajectories the corpus has today.
 * Exit 0 something is reachable and nothing is lost. NOT approval — see above.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import {
  compareCandidateSources,
  type CandidateSourceArm,
} from '../src/services/claimTrajectory';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Claims are Hebrew and long; length is printed because it diagnoses this class. */
function printClaims(label: string, claims: readonly { claimText: string; transitions: number }[]): void {
  console.log(`\n  ${label}: ${String(claims.length)}`);
  for (const t of claims) {
    console.log(`    ${String(t.transitions)} transitions, ${String(t.claimText.length)} chars`);
    console.log(`      ${t.claimText}`);
  }
}

async function main(): Promise<number> {
  const url = arg('url');
  if (url === undefined || url.startsWith('--')) {
    console.error('--url is required.');
    return 1;
  }

  const r = await compareCandidateSources(url);

  console.log(`\nREAD-ONLY — ${r.url}`);
  console.log(`Snapshots examined     ${String(r.snapshotsExamined)}`);
  console.log(
    `Pairs                  ${String(r.eligiblePairs)} eligible of ${String(r.totalPairs)}`,
  );
  for (const [reason, count] of Object.entries(r.excluded)) {
    if (count > 0) console.log(`  excluded ${reason.padEnd(24)} ${String(count)}`);
  }

  // PRINTED AS CONTEXT AND FENCED OFF. It is a different population from the
  // arms, and a reader who compares it to one of them is comparing a population
  // change to an effect.
  console.log(
    `\nProduction baseline (CLASSIFIED over the WHOLE corpus): ` +
      `${String(r.productionBaselineCandidates)} candidates — NOT comparable to the arms below.`,
  );

  console.log('\n                          layer     candidates  trajectories  unmatched');
  for (const a of r.arms) {
    console.log(
      `  ${a.source.padEnd(22)} ${a.layer.padEnd(10)}` +
        `${String(a.candidates).padStart(10)}${String(a.trajectories).padStart(14)}` +
        String(a.unmatched).padStart(11),
    );
  }

  // LOST BEFORE GAINED, always — printing good news first lets a reader stop
  // there, which is the shape that made a broken href measurement read as a
  // discovery.
  for (const a of r.arms.filter((x: CandidateSourceArm) => x.source !== 'CLASSIFIED')) {
    console.log(`\n── ${a.source} vs CLASSIFIED ${'─'.repeat(Math.max(0, 40 - a.source.length))}`);
    // LOST-PROBE-BROKEN FIRST. It is the only one of the three that says the
    // EVIDENCE is wrong; the other two are properties of the pipeline.
    printClaims('LOST — probe broken (NOT FINDABLE on the page)', a.lostProbeBroken);
    printClaims('lost — not re-discovered (still findable)', a.lostNotRediscovered);
    printClaims('GAINED', a.gainedVsClassified);
  }

  if (r.refusals.length > 0) {
    console.error('\n⛔ THIS RUN CANNOT BE BELIEVED:');
    for (const reason of r.refusals) console.error(`   • ${reason}`);
    console.error(
      '\n   Zeroes above are absence of input, not absence of effect. Fix the input\n' +
        '   before reading a single number as a result.',
    );
    return 4;
  }

  const moved = r.arms.find((a) => a.source === 'DOCUMENT_CHUNKS');
  if (!moved) {
    console.error('\n⛔ DOCUMENT_CHUNKS did not run. The comparison has no subject.');
    return 4;
  }

  if (moved.lostProbeBroken.length > 0) {
    console.error(
      `\n⚠️  Moving the differ BREAKS ${String(moved.lostProbeBroken.length)} trajectory(ies): the ` +
        'claim is no longer findable\n    on the page at all, which is the outsider check this ' +
        'platform rests on. Explain\n    every one before bumping diffInputVersion — a ' +
        're-classification makes this the\n    corpus\'s only answer.',
    );
    return 3;
  }

  // NOT AN ERROR, AND DELIBERATELY NOT EXIT 3. A claim the new differ did not
  // re-discover is still on the page; different chunk boundaries produce
  // different quotes, and a re-classification over those chunks may quote it
  // again. Vetoing the move for this would veto it for doing what it means.
  if (moved.lostNotRediscovered.length > 0) {
    console.log(
      `\nℹ️  ${String(moved.lostNotRediscovered.length)} claim(s) would not be re-discovered by the ` +
        'moved differ, but remain\n   findable on the page. That is a chunking difference, not ' +
        'evidence breaking.',
    );
  }

  if (moved.gainedVsClassified.length === 0) {
    console.error(
      '\n⛔ THE SPEND IS VETOED BY MEASUREMENT. Moving the differ reaches no claim the\n' +
        '   extraction did not already contain, so no re-classification can produce one.\n' +
        '   This is the one direction this instrument can settle. Do not pay for it.',
    );
    return 3;
  }

  console.log(
    `\n✅ ${String(moved.gainedVsClassified.length)} claim(s) become REACHABLE by moving the differ, ` +
      'and none is lost.\n' +
      '   THIS IS NOT APPROVAL. Reachable is not produced: the classifier samples and\n' +
      '   merges, so it may quote none of these. The measurement can cancel the spend;\n' +
      '   it cannot justify it. That call is the researcher\'s.',
  );
  return 0;
}

void runOperationalScript(main);
