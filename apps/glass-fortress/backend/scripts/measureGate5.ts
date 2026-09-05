/**
 * Gate 5's editorial verdict against a human's, on twenty stored diffs — the
 * step-4 measurement (docs/gf-refactor-plan.md §6 item 4, part 1).
 *
 *   npm run forensics:measure-gate5 -- --env staging --sample  --seed <n>
 *   npm run forensics:measure-gate5 -- --env staging --measure --seed <n> --labels <diffId>=y,<diffId>=n,…
 *
 * `--sample` reads the corpus and prints, for each of the twenty, ONLY what Gate 5
 * hands the classifier: diff id, page, dates, the removed and added chunks. No
 * stored verdict, no categories, no promotion flag — a led label measures the
 * hint, not the gate. No model, no spend.
 *
 * `--measure` re-draws the same twenty from the seed, refuses unless the labels
 * name exactly those ids, and runs the gate over each — ONE CLASSIFIER CALL PER
 * DIFF, each up to MAX_CLASSIFICATION_DRAWS model draws. Prints each verdict as
 * it lands, then the four-cell table and the stamp. WRITES NOTHING.
 *
 * Exit 4 nothing to measure — fewer than twenty diffs.
 * Exit 1 bad arguments, or labels that do not match the sample.
 * Exit 0 sampled or measured.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { ForensicAgent } from '../src/services/ForensicAgent';
import {
  drawSample,
  loadCandidates,
  loadSample,
  measureGate5,
  parseLabels,
  SAMPLE_SIZE,
} from '../src/services/measureGate5';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const value = process.argv.at(i + 1);
  return i >= 0 && value !== undefined && !value.startsWith('--') ? value : undefined;
}

const flag = (name: string): boolean => process.argv.includes(`--${name}`);

async function main(): Promise<number> {
  const seedArg = arg('seed');
  const seed = seedArg === undefined ? NaN : Number(seedArg);
  if (!Number.isInteger(seed)) {
    console.error('--seed <integer> is required: the draw is recorded by it.');
    return 1;
  }
  const mode = flag('sample') ? 'sample' : flag('measure') ? 'measure' : null;
  if (mode === null) {
    console.error('One of --sample or --measure is required.');
    return 1;
  }

  const candidates = await loadCandidates();
  const promoted = candidates.filter((c) => c.promoted).length;
  console.log(
    `corpus       ${String(candidates.length)} diffs, ${String(promoted)} promoted to evidence · sample ${String(SAMPLE_SIZE)} · seed ${String(seed)}`,
  );
  if (candidates.length < SAMPLE_SIZE) {
    console.error(`Fewer than ${String(SAMPLE_SIZE)} diffs — nothing to measure.`);
    return 4;
  }
  const sample = await loadSample(drawSample(candidates, seed));

  if (mode === 'sample') {
    // What the researcher labels, and nothing that would lead the label.
    for (const [index, diff] of sample.entries()) {
      console.log(`\n#${String(index + 1)}  ${diff.diffId}`);
      console.log(`    ${diff.url}`);
      console.log(`    ${diff.beforeDate} → ${diff.afterDate}`);
      console.log('    removed:');
      for (const chunk of diff.input.removed) console.log(`      - ${chunk}`);
      console.log('    added:');
      for (const chunk of diff.input.added) console.log(`      + ${chunk}`);
    }
    console.log(`\nLabel each id y (editorial) or n (not), then:\n  --measure --seed ${String(seed)} --labels ${sample.map((d) => `${d.diffId}=?`).join(',')}`);
    return 0;
  }

  const labelsArg = arg('labels');
  if (labelsArg === undefined) {
    console.error('--labels <diffId>=y,<diffId>=n,… is required for --measure.');
    return 1;
  }
  let labels: ReadonlyMap<string, boolean>;
  try {
    labels = parseLabels(labelsArg, sample.map((d) => d.diffId));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  // The agent is built here and its model named BEFORE the first paid call.
  const agent = new ForensicAgent();
  console.log(`\nspend        ${String(sample.length)} classifier calls, each 1–3 model draws · model ${agent.modelId}\n`);
  console.log('diff                        human  classifier  reason');
  const measured = await measureGate5(sample, labels, agent, (v) => {
    const promotedMark = sample.find((d) => d.diffId === v.diffId)?.promoted === true ? ' (promoted)' : '';
    console.log(
      `${v.diffId.padEnd(26)}  ${(v.human ? 'y' : 'n').padEnd(5)}  ${(v.classifier ? 'editorial' : 'NOT').padEnd(10)}  ${v.reason}${promotedMark}`,
    );
  });

  const t = measured.table;
  console.log('\n                          classifier: editorial   classifier: NOT editorial   total');
  console.log(`human: editorial          ${String(t.agreedEditorial).padEnd(22)}  ${String(t.falseStop).padEnd(4)} (false stop)          ${String(t.agreedEditorial + t.falseStop)}`);
  console.log(`human: NOT editorial      ${String(t.missed).padEnd(4)} (missed)          ${String(t.agreedNotEditorial).padEnd(26)}  ${String(t.missed + t.agreedNotEditorial)}`);
  console.log(`total                     ${String(t.agreedEditorial + t.missed).padEnd(22)}  ${String(t.falseStop + t.agreedNotEditorial).padEnd(26)}  ${String(measured.verdicts.length)}`);
  console.log(`\nstamp        ${measured.stamp.classifier} · prompt ${measured.stamp.prompt.slice(0, 12)}… · model ${measured.stamp.model}`);
  return 0;
}

void runOperationalScript(main);
