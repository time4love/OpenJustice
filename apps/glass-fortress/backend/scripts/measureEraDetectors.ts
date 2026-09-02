/**
 * What the two era detectors actually see, across a page's whole timeline.
 *
 *   npm run forensics:measure-era-detectors -- --env staging (--url <url> | --run <runId>) [--version <n>]
 *
 * READ-ONLY. It parses documents already held, reaches no network and no model,
 * and writes nothing.
 *
 * WHY THIS EXISTS. Level 4's build order gates automatic mode on a measurement:
 * the detector thresholds may not be supplied by any `src/` module until one
 * exists, and a source scan enforces it. One page currently gives 19 of 21
 * selectors matching within an era and 5 of 21 across a boundary — a data point,
 * not a threshold.
 *
 * MEASURE ONE SELECTOR SET AGAINST EVERY CAPTURE, and run it TWICE. At an early
 * `--version` a ruleset meets a redesign it was never marked against, which is
 * the signal the boundary detector has to catch. At the newest version the UNION
 * of every era meets the same captures, and is expected to MASK that boundary —
 * which is why the union was superseded, and which an instrument measuring only
 * the union could not show.
 *
 * Exit 4 nothing to measure — no such run, or a ruleset with no selectors. Its
 *        zeroes would be absence of measurement rather than absence of effect,
 *        and this level has already been bitten by a check that reported seven
 *        captures intact having tested three.
 * Exit 1 bad arguments.
 * Exit 0 measured.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { measureEraDetectors, newestRunForUrl } from '../src/services/measureEraDetectors';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  // `--url` IS THE INTENDED INTERFACE. A researcher holds a page, not a cuid, and
  // the only other way to reach a run id is `correct_article_rules`, which always
  // OPENS A NEW RUN — a write, to learn an identifier. `--run` remains for naming
  // one run when a URL has several.
  const url = arg('url');
  const explicitRun = arg('run');
  const runId =
    explicitRun !== undefined && !explicitRun.startsWith('--')
      ? explicitRun
      : url !== undefined && !url.startsWith('--')
        ? await newestRunForUrl(url)
        : undefined;
  if (runId === undefined) {
    console.error('--url <url> or --run <calibrationRunId> is required.');
    return 1;
  }
  if (runId === null) {
    console.error(`No calibration run for ${String(url)} — nothing has been marked on it.`);
    return 4;
  }
  const versionArg = arg('version');
  const version = versionArg === undefined ? undefined : Number(versionArg);
  if (version !== undefined && !Number.isInteger(version)) {
    console.error('--version must be an integer decision sequence.');
    return 1;
  }

  const measured = await measureEraDetectors(runId, version);
  if (measured === null) {
    console.error(`No calibration run ${runId}, or it holds no decisions.`);
    return 4;
  }
  if (measured.selectors.length === 0) {
    console.error(`Run ${runId} at version ${String(measured.version)} has NO SELECTORS — nothing to measure.`);
    return 4;
  }
  if (measured.captures.length === 0) {
    console.error(`${measured.url} has no stored captures — nothing to measure.`);
    return 4;
  }

  console.log(`\n${measured.url}`);
  console.log(`run ${measured.runId}  version ${String(measured.version)}  ${String(measured.selectors.length)} selectors\n`);
  // BOTH MODELS, SIDE BY SIDE. The union applies every selector to every capture;
  // DATE-SCOPED applies only those anchored at or before the capture's date, which
  // is what makes a future rule structurally unable to touch a past capture.
  console.log(
    `anchored     ${String(measured.anchoredSelectors)} of ${String(measured.selectors.length)} selectors carry a usable date`,
  );
  if (measured.anchoredSelectors < measured.selectors.length) {
    console.log(
      'WARNING      unanchored selectors ALWAYS apply, so the scoped columns understate the filtering.',
    );
  }
  console.log('');
  console.log('                 union                      date-scoped');
  console.log('date         matched/total  rate   kept    matched/total  rate   kept');
  console.log('----------   -------------  -----  -----   -------------  -----  -----');
  for (const capture of measured.captures) {
    const union = `${String(capture.matchedSelectors)}/${String(capture.totalSelectors)}`;
    const scoped = capture.scoped;
    const scopedCell =
      scoped === undefined
        ? '—'
        : `${String(scoped.matchedSelectors)}/${String(scoped.totalSelectors)}`;
    const scopedRate = scoped === undefined ? '  —  ' : scoped.matchRate.toFixed(2);
    const scopedKept = scoped === undefined ? '—' : String(scoped.keptTextLength);
    console.log(
      `${capture.snapshotDate}   ${union.padEnd(13)}  ${capture.matchRate.toFixed(2)}   ${String(capture.keptTextLength).padEnd(5)}   ${scopedCell.padEnd(13)}  ${scopedRate}  ${scopedKept}`,
    );
  }

  // THE SHAPE, NOT A THRESHOLD. Reported so the distribution can be read at a
  // glance; choosing a number from it is the researcher's act and lands with the
  // source scan that currently forbids one.
  const rates = measured.captures.map((c) => c.matchRate);
  const kept = measured.captures.map((c) => c.keptTextLength);
  console.log(
    `\nmatch rate  min ${Math.min(...rates).toFixed(2)}  max ${Math.max(...rates).toFixed(2)}`,
  );
  console.log(`kept chars  min ${String(Math.min(...kept))}  max ${String(Math.max(...kept))}\n`);
  return 0;
}

void runOperationalScript(main);
