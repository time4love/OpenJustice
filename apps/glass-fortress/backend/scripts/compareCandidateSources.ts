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
  findingsIn,
  MIN_TRANSITIONS,
  type CandidateSourceArm,
  type ComparedClaim,
} from '../src/services/claimTrajectory';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Never list more than this per set. Whatever is dropped is COUNTED and said. */
const MAX_LISTED = 8;

/**
 * A set, reported as a size AND a finding count.
 *
 * `MIN_TRANSITIONS` is a read filter applied in `shape()`, which no comparison
 * calls. An unfiltered set therefore includes claims present in EVERY capture —
 * the opposite of a finding. Printing only the size is how a candidate count
 * comes to be read as a result, and it is the number a spend decision would then
 * rest on.
 */
function printSet(label: string, claims: readonly ComparedClaim[]): void {
  const findings = findingsIn(claims);
  console.log(
    `\n  ${label}: ${String(findings.length)} finding(s) ` +
      `[>=${String(MIN_TRANSITIONS)} transitions] of ${String(claims.length)} in the set`,
  );
  const listed = findings.slice(0, MAX_LISTED);
  for (const t of listed) {
    // LENGTH IS PRINTED, and it is the number that diagnoses this class: whether
    // a claim survives the layer move is decided by whether it REACHES the point
    // where the two renderers diverge.
    console.log(`    ${String(t.transitions)} transitions, ${String(t.claimText.length)} chars`);
    console.log(`      ${t.claimText}`);
  }
  // NO SILENT CAP. A bounded listing that says nothing reads as complete coverage.
  const hidden = findings.length - listed.length;
  if (hidden > 0) console.log(`    … ${String(hidden)} more finding(s) not listed`);
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

  console.log('\n                          layer         candidates  trajectories  unmatched');
  for (const a of r.arms) {
    // A CELL THAT CAN ONLY READ ONE WAY IS MARKED, NOT REPORTED AS A RESULT.
    // A chunk arm draws candidates from the very text presence is tested
    // against, so every candidate matches and these two are guaranteed.
    const mark = a.presenceIsStructural ? '*' : ' ';
    console.log(
      `  ${a.source.padEnd(22)} ${a.layer.padEnd(12)}` +
        `${String(a.candidates).padStart(10)}${(String(a.trajectories) + mark).padStart(14)}` +
        (String(a.unmatched) + mark).padStart(11),
    );
  }
  if (r.arms.some((a) => a.presenceIsStructural)) {
    console.log(
      '\n  * GUARANTEED, NOT MEASURED. These arms take candidates from the same text\n' +
        '    presence is tested against, so unmatched is 0 and trajectories == candidates\n' +
        '    by construction — the very defect this instrument exists to study.',
    );
  }

  // LOST BEFORE GAINED, always — printing good news first lets a reader stop
  // there, which is the shape that made a broken href measurement read as a
  // discovery.
  for (const a of r.arms.filter((x: CandidateSourceArm) => x.source !== 'CLASSIFIED')) {
    const control = a.controlSource === null ? '' : ` (control: ${a.controlSource})`;
    console.log(`\n── ${a.source} vs CLASSIFIED${control} ${'─'.repeat(Math.max(0, 30 - a.source.length))}`);
    // The only one of the three that says the EVIDENCE is wrong; the others are
    // properties of the pipeline.
    printSet('LOST — probe broken (NOT FINDABLE on the page)', a.lostProbeBroken);
    printSet('lost — not re-discovered (still findable)', a.lostNotRediscovered);
    printSet('GAINED vs the datum (renderer AND granularity together)', a.gainedVsClassified);
    if (a.controlSource !== null) {
      // WHAT THE ISOLATED AXIS BUYS. A set difference over claim hashes — the
      // difference of the two GAINED counts would assume one set contains the
      // other, which nothing establishes.
      printSet(
        `GAINED and NOT in ${a.controlSource} — attributable to the LAYER alone`,
        a.gainedNotInControl,
      );
    }
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

  // EVERY GATE BELOW COUNTS FINDINGS, NOT SET MEMBERS. A set includes claims
  // present in every capture; gating on its size prices the decision on strings
  // that are the opposite of a finding.
  const brokenFindings = findingsIn(moved.lostProbeBroken);
  const layerFindings = findingsIn(moved.gainedNotInControl);

  if (brokenFindings.length > 0) {
    console.error(
      `\n⚠️  Moving the differ BREAKS ${String(brokenFindings.length)} trajectory(ies) with ` +
        `>=${String(MIN_TRANSITIONS)} transitions:\n    the claim is no longer findable on the ` +
        'page at all, which is the outsider check\n    this platform rests on. Explain every one ' +
        'before bumping diffInputVersion — a\n    re-classification makes this the corpus\'s only ' +
        'answer.\n\n    A BROKEN PROBE IS NOT AUTOMATICALLY A LOSS. If the stored claim is a ' +
        'string the\n    page never contained, losing it is the CORRECTION. Read each one before ' +
        'deciding.',
    );
    return 3;
  }

  // NOT AN ERROR, AND DELIBERATELY NOT EXIT 3. A claim the new differ did not
  // re-discover is still on the page; different chunk boundaries produce
  // different quotes, and a re-classification over those chunks may quote it
  // again. Vetoing the move for this would veto it for doing what it means.
  const notRediscovered = findingsIn(moved.lostNotRediscovered);
  if (notRediscovered.length > 0) {
    console.log(
      `\nℹ️  ${String(notRediscovered.length)} finding(s) would not be re-discovered by the moved ` +
        'differ, but remain\n   findable on the page. That is a chunking difference, not evidence ' +
        'breaking.',
    );
  }

  // THE VETO IS ABOUT THE LAYER, BECAUSE THE LAYER IS WHAT COSTS MONEY.
  //
  // `gainedVsClassified` mixes the renderer with granularity, and granularity is
  // available from sentence candidates for compute alone. What a
  // `diffInputVersion` bump and a full re-classification buy is the part the
  // control arm does NOT already reach.
  if (layerFindings.length === 0) {
    console.error(
      '\n⛔ THE SPEND IS VETOED BY MEASUREMENT. Every finding the moved differ reaches is\n' +
        `   already reachable from ${String(moved.controlSource)}, which needs no re-classification.\n` +
        '   The renderer buys nothing the granularity change does not. Do not pay for it.',
    );
    return 3;
  }

  console.log(
    `\n✅ ${String(layerFindings.length)} finding(s) are reachable ONLY by moving the differ — not ` +
      `by\n   ${String(moved.controlSource)}, and not by the datum. Nothing findable is broken.\n\n` +
      '   THIS IS NOT APPROVAL. Reachable is not produced: the classifier samples and\n' +
      '   merges, so it may quote none of these. The measurement can cancel the spend;\n' +
      '   it cannot justify it. That call is the researcher\'s.',
  );
  return 0;
}

void runOperationalScript(main);
