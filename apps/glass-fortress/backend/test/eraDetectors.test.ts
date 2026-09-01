import {
  assessCapture,
  matchRate,
  type CaptureReading,
  type DetectorThresholds,
  type EraBaseline,
} from '../src/lib/eraDetectors';

// THRESHOLDS SUPPLIED BY THE TEST, NEVER BY `src/`. These numbers describe the
// cases below and are NOT a measurement — see `eraDetectorsUnmeasured.test.ts`,
// which holds that no production module has any.
const T: DetectorThresholds = {
  minMatchRateRatio: 0.6,
  minKeptLengthRatio: 0.7,
  minBaselineSamples: 3,
};

const healthy = (over: Partial<CaptureReading> = {}): CaptureReading => ({
  matchedSelectors: 18,
  totalSelectors: 20,
  keptTextLength: 2400,
  ...over,
});

const baselineOf = (n: number): EraBaseline => ({
  readings: Array.from({ length: n }, () => healthy()),
});

describe('the era detectors — two signals, because there are two failure directions', () => {
  it('proceeds when the capture looks like its era', () => {
    expect(assessCapture(healthy(), baselineOf(3), T)).toEqual({ outcome: 'PROCEED', signals: [] });
  });

  // THE VACUITY GUARD. A baseline of one capture IS that capture, and comparing a
  // capture with itself clears everything — which has already cost this level a
  // check reporting seven captures intact having tested three.
  it('never proceeds on a baseline too thin to mean anything', () => {
    const reading = assessCapture(healthy(), baselineOf(2), T);
    expect(reading.outcome).toBe('ASK');
    expect(reading.signals).toEqual([{ kind: 'BASELINE_TOO_THIN', samples: 2, required: 3 }]);
  });

  it('asks when the match rate collapses — the redesign signal', () => {
    // The measured shape of a real boundary: 19 of 21 within the era, 5 of 21 across it.
    const reading = assessCapture(healthy({ matchedSelectors: 5 }), baselineOf(3), T);
    expect(reading.outcome).toBe('ASK');
    expect(reading.signals.map((s) => s.kind)).toEqual(['MATCH_RATE_FELL']);
  });

  it('asks when the kept text collapses — the over-match signal', () => {
    const reading = assessCapture(healthy({ keptTextLength: 900 }), baselineOf(3), T);
    expect(reading.outcome).toBe('ASK');
    expect(reading.signals.map((s) => s.kind)).toEqual(['KEPT_TEXT_FELL']);
  });

  // THE PAIR THAT JUSTIFIES HAVING TWO DETECTORS. Each case is invisible to the
  // other detector, so neither may be dropped and neither may substitute.
  it('the match rate is blind to an over-match: every selector still matches, and the article is gone', () => {
    const overMatched = healthy({ matchedSelectors: 20, keptTextLength: 300 });
    expect(matchRate(overMatched)).toBe(1);
    const reading = assessCapture(overMatched, baselineOf(3), T);
    expect(reading.signals.map((s) => s.kind)).toEqual(['KEPT_TEXT_FELL']);
  });

  it('the length check is blind to a redesign: nothing matches, so nothing is removed and the text is LONGER', () => {
    const unmatched = healthy({ matchedSelectors: 1, keptTextLength: 6300 });
    const reading = assessCapture(unmatched, baselineOf(3), T);
    expect(reading.signals.map((s) => s.kind)).toEqual(['MATCH_RATE_FELL']);
  });

  it('reports both when both fired, and never a combined score', () => {
    const reading = assessCapture(healthy({ matchedSelectors: 4, keptTextLength: 200 }), baselineOf(3), T);
    expect(reading.signals.map((s) => s.kind)).toEqual(['MATCH_RATE_FELL', 'KEPT_TEXT_FELL']);
  });

  // THE MEDIAN, NOT THE MEAN. One unusual capture in the baseline must not drag
  // "normal" far enough to hide the next real failure.
  it('an outlier in the baseline does not move the norm', () => {
    const withOutlier: EraBaseline = {
      readings: [healthy(), healthy(), healthy(), healthy({ keptTextLength: 40000 })],
    };
    // A mean would put the norm near 12,850, making a healthy 2,400 look like a
    // collapse; the median leaves it at 2,400.
    expect(assessCapture(healthy(), withOutlier, T).outcome).toBe('PROCEED');
  });

  it('does not report a fall against a baseline of zero', () => {
    const empty: EraBaseline = {
      readings: [
        { matchedSelectors: 0, totalSelectors: 0, keptTextLength: 0 },
        { matchedSelectors: 0, totalSelectors: 0, keptTextLength: 0 },
        { matchedSelectors: 0, totalSelectors: 0, keptTextLength: 0 },
      ],
    };
    // Nothing can fall below nothing, and dividing by it would report Infinity as health.
    expect(assessCapture(healthy(), empty, T)).toEqual({ outcome: 'PROCEED', signals: [] });
  });
});
