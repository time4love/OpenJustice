/**
 * WHEN THE RULES STOPPED WORKING — the two signals, and why there must be two.
 *
 * The third marking walk established the asymmetry this rests on: UNDER-MATCHING
 * IS LOUD AND HARMLESS, OVER-MATCHING IS QUIET AND DESTRUCTIVE. One signal cannot
 * serve both, and the reason is not caution:
 *
 *   A MATCH RATE CANNOT SEE AN OVER-MATCH. The selectors are matching exactly as
 *   intended — that is the problem — so the rate is healthy while article text is
 *   being removed.
 *
 *   A LENGTH CHECK CANNOT SEE A REDESIGN. A page whose rules stopped matching
 *   keeps everything, and a page that keeps everything is not short.
 *
 * Using either alone leaves one failure direction unwatched, so they are reported
 * SEPARATELY and never combined into a score. A composite signal has been
 * rejected twice already in this level; the researcher reads the facts.
 *
 * NEITHER NEEDS A MODEL, and neither may be replaced by one. Both are arithmetic
 * over numbers the pipeline already produces.
 */

/**
 * What one capture looked like under the era's rules.
 *
 * `matchedSelectors` counts selectors that matched AT LEAST ONE node, not total
 * nodes matched: a selector matching thirty rotating adverts and one matching a
 * footer are equally "still applying", and weighting by node count would let a
 * single busy selector mask a dozen dead ones.
 */
export interface CaptureReading {
  matchedSelectors: number;
  totalSelectors: number;
  keptTextLength: number;
}

/** The era's own history — what "normal" means HERE, not across the corpus. */
export interface EraBaseline {
  /** Readings from captures already judged clean in this era. */
  readings: readonly CaptureReading[];
}

/**
 * The numbers that decide. NO DEFAULT IS EXPORTED, and that is the gate.
 *
 * The plan: automatic mode may be BUILT before these are measured and may NOT be
 * ENABLED, because a batch running unattended on guessed thresholds is the one
 * configuration that can silently corrupt a corpus. A default here would let
 * someone switch it on without anyone measuring anything — the difference
 * between a rule written in prose and a rule the code enforces.
 *
 * One page currently gives 19→5 across a boundary and 16 of 19 within one. That
 * is a data point. `test/eraDetectorsUnmeasured.test.ts` holds that no `src/`
 * module supplies these values, and it is meant to be changed in the SAME commit
 * as the measurement that justifies them.
 */
export interface DetectorThresholds {
  /** Below this fraction of the era's baseline match rate, the rules stopped applying. */
  minMatchRateRatio: number;
  /** Below this fraction of the era's baseline kept length, the rules ate the article. */
  minKeptLengthRatio: number;
  /**
   * How many clean captures an era needs before its baseline decides anything.
   *
   * BELOW IT THE ANSWER IS ALWAYS `ASK`, NEVER `PROCEED`. A baseline of one
   * capture is that capture, and a detector comparing a capture with itself
   * would clear everything — the vacuity that has already cost this level a
   * check reporting seven captures intact having tested three.
   */
  minBaselineSamples: number;
}

/** What the detectors found. Structured, so nothing authors a sentence beside it. */
export type DetectorSignal =
  | { kind: 'BASELINE_TOO_THIN'; samples: number; required: number }
  | { kind: 'MATCH_RATE_FELL'; observed: number; baseline: number; ratio: number }
  | { kind: 'KEPT_TEXT_FELL'; observed: number; baseline: number; ratio: number };

export interface DetectorReading {
  /** `ASK` means stop and put the binary question to the researcher. */
  outcome: 'PROCEED' | 'ASK';
  /** Every signal that fired, in the order the detectors are defined. May be empty. */
  signals: readonly DetectorSignal[];
}

/**
 * THE MEDIAN, NOT THE MEAN. An era's baseline is built from few captures, and one
 * unusual page — a live-blog day, a capture that happened to carry an extra
 * promo block — would drag a mean far enough to hide the next real failure.
 */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted.at(middle) ?? 0;
  return ((sorted.at(middle - 1) ?? 0) + (sorted.at(middle) ?? 0)) / 2;
}

/** Fraction of the era's selectors that still match. `0` when the era has none. */
export function matchRate(reading: CaptureReading): number {
  if (reading.totalSelectors === 0) return 0;
  return reading.matchedSelectors / reading.totalSelectors;
}

/**
 * Assess one capture against its era.
 *
 * A THIN BASELINE ALWAYS ASKS. It does not proceed and it does not claim a
 * failure — it says the era has not yet shown what normal looks like, which is
 * true and is the only honest answer.
 */
export function assessCapture(
  reading: CaptureReading,
  baseline: EraBaseline,
  thresholds: DetectorThresholds,
): DetectorReading {
  const samples = baseline.readings.length;
  if (samples < thresholds.minBaselineSamples) {
    return {
      outcome: 'ASK',
      signals: [{ kind: 'BASELINE_TOO_THIN', samples, required: thresholds.minBaselineSamples }],
    };
  }

  const signals: DetectorSignal[] = [];

  const baselineRate = median(baseline.readings.map(matchRate));
  const observedRate = matchRate(reading);
  // A baseline of zero cannot be fallen below, and dividing by it would report
  // Infinity as a healthy ratio.
  const rateRatio = baselineRate === 0 ? 1 : observedRate / baselineRate;
  if (rateRatio < thresholds.minMatchRateRatio) {
    signals.push({
      kind: 'MATCH_RATE_FELL',
      observed: observedRate,
      baseline: baselineRate,
      ratio: rateRatio,
    });
  }

  const baselineLength = median(baseline.readings.map((r) => r.keptTextLength));
  const lengthRatio = baselineLength === 0 ? 1 : reading.keptTextLength / baselineLength;
  if (lengthRatio < thresholds.minKeptLengthRatio) {
    signals.push({
      kind: 'KEPT_TEXT_FELL',
      observed: reading.keptTextLength,
      baseline: baselineLength,
      ratio: lengthRatio,
    });
  }

  return { outcome: signals.length === 0 ? 'PROCEED' : 'ASK', signals };
}
