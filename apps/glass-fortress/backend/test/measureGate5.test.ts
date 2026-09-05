import {
  drawSample,
  foldConfusion,
  measureGate5,
  parseLabels,
  type SampleCandidate,
  type SampledDiff,
  type Verdict,
} from '../src/services/measureGate5';
import { classifierDiffOf } from '../src/walk/gates';

// ---------------------------------------------------------------------------
// GATE 5'S MEASUREMENT INSTRUMENT — refactor step 4, part 1 of the measurement
// doc (plan §6 item 4; Q5 and Q6 ruled 2026-09-05). The instrument samples 20
// stored diffs — every diff a researcher promoted to evidence, plus the rest of
// the twenty drawn at random with the seed recorded — prints what Gate 5 hands
// the classifier for the researcher to label, and after the labels are in runs
// THE GATE over each and folds a confusion table.
//
// The pure parts are held here: the sampler (promoted first, the remainder
// seeded and deterministic, a refusal under twenty), the labels parser (the
// twenty ids exactly, nothing extra, nothing missing), and the fold (four
// cells, b and c named, no rate). The database reads and the model call live in
// the same module and are the script's; `measureEraDetectors` is the ancestor
// and is retired once the doc exists.
// ---------------------------------------------------------------------------

const candidate = (id: string, promoted: boolean): SampleCandidate => ({ diffId: id, promoted });

/** Twenty-six candidates, `p1`–`p9` promoted, `r1`–`r17` not. */
const CANDIDATES = [
  ...Array.from({ length: 9 }, (_, i) => candidate(`p${String(i + 1)}`, true)),
  ...Array.from({ length: 17 }, (_, i) => candidate(`r${String(i + 1)}`, false)),
];

describe('drawSample — the promoted diffs, then the rest of twenty at random, seeded', () => {
  it('takes every promoted diff and fills to twenty from the rest', () => {
    const sample = drawSample(CANDIDATES, 20260905);
    expect(sample).toHaveLength(20);
    expect(sample.filter((s) => s.promoted).map((s) => s.diffId).sort()).toEqual(CANDIDATES.filter((c) => c.promoted).map((c) => c.diffId).sort());
    expect(sample.filter((s) => !s.promoted)).toHaveLength(11);
  });

  it('is deterministic for a seed, and differs across seeds', () => {
    const a = drawSample(CANDIDATES, 20260905).map((s) => s.diffId);
    const b = drawSample(CANDIDATES, 20260905).map((s) => s.diffId);
    const c = drawSample(CANDIDATES, 7).map((s) => s.diffId);
    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
  });

  // The draw is over ids SORTED first, so the database's row order cannot move
  // the sample between two runs of the same seed.
  it('does not depend on the order the candidates arrive in', () => {
    const shuffled = [...CANDIDATES].reverse();
    expect(drawSample(shuffled, 3).map((s) => s.diffId)).toEqual(drawSample(CANDIDATES, 3).map((s) => s.diffId));
  });

  it('refuses when fewer than twenty diffs exist — a smaller table is not this measurement', () => {
    expect(() => drawSample(CANDIDATES.slice(0, 19), 1)).toThrow('20');
  });

  it('caps the promoted share at twenty — more promoted diffs than that is a different instrument', () => {
    const many = Array.from({ length: 21 }, (_, i) => candidate(`p${String(i)}`, true));
    expect(() => drawSample(many, 1)).toThrow('promoted');
  });
});

describe('parseLabels — the twenty ids exactly', () => {
  const ids = ['d1', 'd2', 'd3'];

  it('reads y and n per id', () => {
    expect(parseLabels('d1=y,d2=n,d3=y', ids)).toEqual(new Map([['d1', true], ['d2', false], ['d3', true]]));
  });

  it('refuses a missing id, an extra id, and a value that is neither y nor n', () => {
    expect(() => parseLabels('d1=y,d2=n', ids)).toThrow('d3');
    expect(() => parseLabels('d1=y,d2=n,d3=y,d4=n', ids)).toThrow('d4');
    expect(() => parseLabels('d1=maybe,d2=n,d3=y', ids)).toThrow('d1');
  });
});

describe('foldConfusion — four cells, b and c named, no rate', () => {
  it('counts each diff into the cell its human label and classifier verdict name', () => {
    const table = foldConfusion([
      { diffId: 'a', human: true, classifier: true },
      { diffId: 'b', human: true, classifier: false },
      { diffId: 'c', human: false, classifier: true },
      { diffId: 'd', human: false, classifier: false },
      { diffId: 'e', human: true, classifier: false },
    ]);
    expect(table).toEqual({ agreedEditorial: 1, falseStop: 2, missed: 1, agreedNotEditorial: 1 });
  });

  it('is exactly four counts and nothing derived from them', () => {
    expect(Object.keys(foldConfusion([])).sort()).toEqual(['agreedEditorial', 'agreedNotEditorial', 'falseStop', 'missed']);
  });
});

// THE PART THAT SPENDS, with a fake agent: the gate is run per diff with the
// classifier built as the walk builds it, a fired gate is a NOT-editorial
// verdict with the model's reason kept, the table folds from the verdicts, the
// stamp names the agent, and onVerdict streams in sample order. Ruled 2026-09-05
// after the reviewer found this loop untested — a success arm that never fired.
describe('measureGate5 — the gate over the sample, with a fake agent', () => {
  const sampled = (id: string, before: string, after: string): SampledDiff => ({
    diffId: id,
    promoted: false,
    url: 'https://example.gov.il/page',
    beforeDate: '2021-01-01',
    afterDate: '2021-01-02',
    beforeText: before,
    afterText: after,
    input: classifierDiffOf(before, after),
  });
  const sample = [
    sampled('d1', 'headline\nfirst', 'headline\nfirst edited'),
    sampled('d2', 'headline\nfirst', 'headline\nfirst\nlike · share'),
    sampled('d3', 'headline\nfirst', 'headline\nsecond'),
  ];
  const labels = new Map([['d1', true], ['d2', true], ['d3', false]]);

  it('runs the gate per diff, keeps the reason, folds the table, stamps the agent, streams in order', async () => {
    const answers = [
      { editorial: true, editorialReason: 'authored' },
      { editorial: false, editorialReason: 'a share bar entered the text' },
      { editorial: true, editorialReason: 'authored' },
    ];
    const analyzeChange = jest.fn(async () => {
      const next = answers.shift();
      if (next === undefined) throw new Error('asked more than three times');
      return { ...next, deletedItems: [], addedItems: [], legalSignificance: '', investigativeCategories: [], isLegallySignificant: false, coverage: { complete: true, chunkCount: 0, coveredChunks: 0, uncoveredChunks: [], charCount: 0, coveredChars: 0, chunkRatio: 1, charRatio: 1 }, draws: 1 };
    });
    const streamed: Verdict[] = [];
    const measured = await measureGate5(sample, labels, { analyzeChange, modelId: 'fake:model' }, (v) => streamed.push(v));

    expect(analyzeChange).toHaveBeenCalledTimes(3);
    expect(measured.verdicts.map((v) => [v.diffId, v.human, v.classifier])).toEqual([
      ['d1', true, true],
      ['d2', true, false],
      ['d3', false, true],
    ]);
    expect(measured.verdicts.at(1)?.reason).toBe('a share bar entered the text');
    expect(measured.table).toEqual({ agreedEditorial: 1, falseStop: 1, missed: 1, agreedNotEditorial: 0 });
    expect(measured.stamp.model).toBe('fake:model');
    expect(streamed.map((v) => v.diffId)).toEqual(['d1', 'd2', 'd3']);
  });
});
