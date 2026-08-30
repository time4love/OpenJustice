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
  unique,
  unclassifiable,
  MIN_TRANSITIONS,
  type CandidateSourceArm,
  CONTAINMENT_MATCH_MIN_LENGTH,
  type ComparedClaim,
  type DifferedClaim,
} from '../src/services/claimTrajectory';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Never list more than this per set. Whatever is dropped is COUNTED and said.
 *
 * `--list-all` lifts it, which a researcher wants when reading the sets rather
 * than the summary. It also restores the output volume that exposed the ledger
 * record being discarded by `process.exit()`, so the two are the same switch.
 */
const MAX_LISTED = 8;
const listAll = process.argv.includes('--list-all');

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
  const listed = listAll ? findings : findings.slice(0, MAX_LISTED);
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

/**
 * A set difference, split by whether each member is genuinely new.
 *
 * `claimHash` is exact and the arms read different renderings, so a paragraph
 * with a heading beside it differs as a STRING while being one finding in
 * substance. Members that overlap nothing in the other set are the real
 * difference; the rest are re-spellings and must not be counted as a purchase.
 */
function printDifference(label: string, claims: readonly DifferedClaim[]): void {
  const findings = findingsIn(claims) as DifferedClaim[];
  const genuinelyNew = unique(findings);
  const undecidable = unclassifiable(findings);
  const respellings = findings.length - genuinelyNew.length - undecidable.length;
  // THE THREE ARE PRINTED APART BECAUSE ONE OF THEM IS NOT A MEASUREMENT.
  // Merging the undecidable band into either neighbour hands the reader a single
  // figure blending what was measured with what the floor could not rule on.
  console.log(
    `\n  ${label}:` +
      `\n    ${String(genuinelyNew.length)} GENUINELY NEW  [measured: overlaps nothing in the ` +
      `other set]` +
      `\n    ${String(respellings)} re-spelling(s)  [measured: covered on >=` +
      `${String(CONTAINMENT_MATCH_MIN_LENGTH)} chars]` +
      `\n    ${String(undecidable.length)} UNCLASSIFIABLE  [NOT measured: overlaps something, but ` +
      `below the floor]` +
      `\n    ${String(findings.length)} finding(s) [>=${String(MIN_TRANSITIONS)} transitions] of ` +
      `${String(claims.length)} in the set`,
  );
  const listed = listAll ? genuinelyNew : genuinelyNew.slice(0, MAX_LISTED);
  for (const t of listed) {
    console.log(`      ${String(t.transitions)} transitions, ${String(t.claimText.length)} chars`);
    console.log(`        ${t.claimText}`);
  }
  const hidden = genuinelyNew.length - listed.length;
  if (hidden > 0) console.log(`      … ${String(hidden)} more genuinely-new finding(s) not listed`);
}

/**
 * How much this run wrote before it exited — the quantity the ledger record depends on.
 *
 * `emitLedgerRecord` writes from a `process.on('exit')` handler. The old
 * `console.log` version lost the record whenever enough output was queued on a
 * pipe for `process.exit()` to discard it, and the run that exposed it wrote
 * 164KB. A later run whose record SURVIVES therefore proves nothing unless it
 * wrote comparably much — a small run would have survived the broken version too.
 *
 * Printing the size turns "the record survived" into "the record survived N KB",
 * which is the difference between a claim and a measurement.
 */
function reportOutputSize(): void {
  // `bytesWritten` exists on a socket, which stdout is when piped — and not on
  // every stream stdout can be. Asserted as optional so the fallback is real.
  const written = (process.stdout as { bytesWritten?: number }).bytesWritten ?? 0;
  console.log(
    `\nOutput written before exit: ${String(Math.round(written / 1024))} KB` +
      (listAll ? ' (--list-all)' : ' (listings capped — pass --list-all to lift)'),
  );
}

async function main(): Promise<number> {
  const url = arg('url');
  if (url === undefined || url.startsWith('--')) {
    console.error('--url is required.');
    return 1;
  }

  // EVERY EXIT PATH REPORTS THE SIZE, and the last real run exited 3. A helper
  // rather than a call before each `return`, because the path that forgets it
  // would be the one that mattered.
  const finish = (code: number): number => {
    reportOutputSize();
    return code;
  };

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
      // BOTH DIRECTIONS, AND THE COST ONE FIRST. Reporting only what the axis
      // BUYS and leaving the reader to infer what it COSTS is the
      // count-subtraction error one level up — the sets are not nested, so the
      // net is not recoverable from one direction.
      printDifference(
        `LOST to ${a.controlSource} — reachable for free, NOT by this arm`,
        a.controlGainsNotHere,
      );
      printDifference(
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
    return finish(4);
  }

  const moved = r.arms.find((a) => a.source === 'DOCUMENT_CHUNKS');
  if (!moved) {
    console.error('\n⛔ DOCUMENT_CHUNKS did not run. The comparison has no subject.');
    return finish(4);
  }

  // EVERY GATE BELOW COUNTS FINDINGS, NOT SET MEMBERS. A set includes claims
  // present in every capture; gating on its size prices the decision on strings
  // that are the opposite of a finding.
  const brokenFindings = findingsIn(moved.lostProbeBroken);
  // GENUINELY NEW, NOT MERELY DIFFERENT. A re-spelling of a claim the free option
  // already reaches is not something a re-classification buys.
  const layerFindings = unique(findingsIn(moved.gainedNotInControl) as DifferedClaim[]);
  const layerCost = unique(findingsIn(moved.controlGainsNotHere) as DifferedClaim[]);

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
    return finish(3);
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
  // THE NET, NOT THE GROSS. A move that reaches 25 findings while losing 12 to the
  // free option buys 13, and a gate reading only the forward direction would
  // approve an exchange it never measured.
  if (layerFindings.length - layerCost.length <= 0) {
    console.error(
      '\n⛔ THE SPEND IS VETOED BY MEASUREMENT. Net of what it also loses, moving the\n' +
        `   differ reaches nothing beyond ${String(moved.controlSource)} — ` +
        `+${String(layerFindings.length)} / −${String(layerCost.length)} genuinely-new finding(s),\n` +
        '   and that arm needs no re-classification at all. Do not pay for it.',
    );
    return finish(3);
  }

  const undecided =
    unclassifiable(findingsIn(moved.gainedNotInControl) as DifferedClaim[]).length +
    unclassifiable(findingsIn(moved.controlGainsNotHere) as DifferedClaim[]).length;
  console.log(
    `\n✅ NET ${String(layerFindings.length - layerCost.length)} finding(s): ` +
      `+${String(layerFindings.length)} reachable ONLY by moving the differ, ` +
      `−${String(layerCost.length)} reachable\n   only from ${String(moved.controlSource)}, which ` +
      'needs no re-classification. Nothing findable is broken.\n' +
      `   ${String(undecided)} further claim(s) the containment floor could not rule on, counted ` +
      'as NEITHER.\n\n' +
      '   THIS IS NOT APPROVAL. Reachable is not produced: the classifier samples and\n' +
      '   merges, so it may quote none of these. The measurement can cancel the spend;\n' +
      '   it cannot justify it. That call is the researcher\'s.',
  );
  return finish(0);
}

void runOperationalScript(main);
