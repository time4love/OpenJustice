// ---------------------------------------------------------------------------
// WHERE CANDIDATES COME FROM — measured before it is paid for.
//
// Moving the differ off Readability's article costs a `diffInputVersion` bump
// and a full re-classification: hundreds of model calls. What it would make
// REACHABLE costs nothing to compute, because the raw chunks and the payloads
// are already stored and detection is deterministic.
//
// The fixture below is the corpus finding in miniature. `htmlToText` keeps a
// section heading that Readability drops, so a change confined to that heading
// is invisible to the extraction — no diff over `fullText` can produce it, and
// therefore no classifier reading those diffs can ever quote it. That is the
// "zero BY CONSTRUCTION" the plan names, expressed as a test.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn() },
    urlSnapshot: { findMany: jest.fn() },
    urlVersionDiff: { findMany: jest.fn() },
    claimTrajectory: { createManyAndReturn: jest.fn() },
    claimTrajectoryComputation: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { prisma } from '../src/lib/prisma';
import { DIFF_INPUT_VERSION } from '../src/lib/diffChunking';
import { TEXT_EXTRACTION_VERSION } from '../src/lib/captureDocument';
import {
  ARM_CONTROL,
  ARM_LAYER,
  ARM_PRESENCE_IS_STRUCTURAL,
  CANDIDATE_SOURCE,
  CANDIDATE_SOURCES,
  MIN_TRANSITIONS,
  CONTAINMENT_MATCH_MIN_LENGTH,
  compareCandidateSources,
  findingsIn,
  unique,
  type CandidateSource,
  type CandidateSourceComparison,
} from '../src/services/claimTrajectory';

const URL = 'https://corona.health.gov.il/vaccine';

// The heading htmlToText keeps and Readability drops. It is renamed in the
// middle capture and restored in the last — a real, two-transition change that
// exists ONLY in the document layer.
const HEADING_A = 'LINKS SECTION';
const HEADING_B = 'MORE INFO';
const BODY = 'The vaccine cannot cause the disease.';
const LINK = 'Report side effects >';

function capture(index: number, heading: string) {
  return {
    snapshotDate: `2022-0${String(index)}-01`,
    waybackTimestamp: `20220${String(index)}01000000`,
    snapshotUrl: `https://web.archive.org/web/20220${String(index)}01000000/${URL}`,
    // Readability's article: the heading is gone in EVERY capture, so this
    // column is byte-identical across all three and its differ sees nothing.
    fullText: `${BODY}\n${LINK}`,
    // The document as served: the heading is present and it changes.
    text: `${BODY}\n${heading}\n${LINK}`,
  };
}

const CAPTURES = [capture(1, HEADING_A), capture(2, HEADING_B), capture(3, HEADING_A)];

/** A stored diff row. Defaults are ELIGIBLE; each test spoils one field. */
function diffRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'diff-1',
    diffInputVersion: DIFF_INPUT_VERSION,
    // The classifier only ever saw the extraction, so it can only quote body text.
    deletedText: JSON.stringify([{ summary: 's', exactQuote: BODY, investigativeCategories: [], relocated: false }]),
    addedText: '[]',
    rawDeletedText: JSON.stringify([BODY]),
    rawAddedText: '[]',
    beforeSnapshot: { text: CAPTURES[0]?.text, textExtractionVersion: TEXT_EXTRACTION_VERSION },
    afterSnapshot: { text: CAPTURES[1]?.text, textExtractionVersion: TEXT_EXTRACTION_VERSION },
    ...overrides,
  };
}

function mockCorpus(diffs: ReturnType<typeof diffRow>[]): void {
  (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue({ id: 'tracked-1' });
  (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue(CAPTURES);
  (prisma.urlVersionDiff.findMany as jest.Mock).mockResolvedValue(diffs);
}

function arm(r: CandidateSourceComparison, source: CandidateSource) {
  const found = r.arms.find((a) => a.source === source);
  if (!found) throw new Error(`arm ${source} missing from the comparison`);
  return found;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the arm definition', () => {
  it('pins DOCUMENT_CHUNKS to the DOCUMENT layer', () => {
    // Candidates derived from `text` and tested against `fullText` measure the
    // cross-renderer mismatch the arm exists to remove. If this pairing is ever
    // loosened into a flag, the instrument starts reporting the confound.
    expect(ARM_LAYER.DOCUMENT_CHUNKS).toBe('DOCUMENT');
    expect(ARM_LAYER.CLASSIFIED).toBe('EXTRACTION');
    expect(ARM_LAYER.RAW_CHUNKS).toBe('EXTRACTION');
    expect(ARM_LAYER.CLASSIFIED_SENTENCES).toBe('EXTRACTION');
  });

  it('gives every source a layer, so no arm can run unpaired', () => {
    for (const source of CANDIDATE_SOURCES) {
      expect(ARM_LAYER[source]).toBeDefined();
    }
  });

  it('still reads CLASSIFIED in production — 6.2c has not been taken', () => {
    // The companion of `DETECTION_LAYER === 'EXTRACTION'`. Moving this is the
    // spend decision, and it arrives with a diffInputVersion bump.
    expect(CANDIDATE_SOURCE).toBe('CLASSIFIED');
  });
});

describe('what moving the differ would make reachable', () => {
  it('finds a two-transition claim the extraction can never produce', async () => {
    mockCorpus([
      diffRow({ id: 'd1' }),
      diffRow({
        id: 'd2',
        beforeSnapshot: { text: CAPTURES[1]?.text, textExtractionVersion: TEXT_EXTRACTION_VERSION },
        afterSnapshot: { text: CAPTURES[2]?.text, textExtractionVersion: TEXT_EXTRACTION_VERSION },
      }),
    ]);

    const r = await compareCandidateSources(URL);

    // THE GAIN, and it is zero for every arm that reads the extraction — not
    // because they searched and missed, but because the differ never saw it.
    expect(arm(r, 'RAW_CHUNKS').gainedVsClassified).toEqual([]);
    const gained = arm(r, 'DOCUMENT_CHUNKS').gainedVsClassified;
    expect(gained.map((g) => g.claimText)).toContain(HEADING_A);
    expect(gained.find((g) => g.claimText === HEADING_A)?.transitions).toBe(2);
  });

  it('separates a claim that stopped being FINDABLE from one merely not re-quoted', async () => {
    mockCorpus([diffRow()]);
    const r = await compareCandidateSources(URL);
    const moved = arm(r, 'DOCUMENT_CHUNKS');

    // BODY is present in BOTH renderings of every capture, so the probe still
    // finds it — the moved differ simply did not offer it as a candidate,
    // because it did not change. Counting that as breakage would veto the move
    // for doing exactly what moving the differ means.
    expect(moved.lostProbeBroken).toEqual([]);
    expect(moved.lostNotRediscovered.map((t) => t.claimText)).toEqual([BODY]);
  });

  it('reports a claim the document layer cannot find as PROBE BROKEN', async () => {
    // The stitched-claim shape in miniature: the classifier quotes a string that
    // exists only in Readability's article, because Readability dropped the
    // heading that sits between its two halves. No document contains it.
    const STITCHED = `${BODY} ${LINK}`;
    mockCorpus([
      diffRow({
        deletedText: JSON.stringify([
          { summary: 's', exactQuote: STITCHED, investigativeCategories: [], relocated: false },
        ]),
        rawDeletedText: JSON.stringify([STITCHED]),
      }),
    ]);

    const r = await compareCandidateSources(URL);
    const moved = arm(r, 'DOCUMENT_CHUNKS');

    // Findable in fullText, absent from every `text` — a stranger searching the
    // archived page finds nothing. This is the number that can veto the move.
    expect(moved.lostProbeBroken.map((t) => t.claimText)).toContain(STITCHED);
    expect(moved.lostNotRediscovered.map((t) => t.claimText)).not.toContain(STITCHED);
  });

  it('never writes a computation — the arms cannot reach the cache', async () => {
    mockCorpus([diffRow()]);
    await compareCandidateSources(URL);
    // Three of the four arms hash to a state no scan produced. The type makes
    // the call impossible; this proves the path does not find another way.
    expect(prisma.claimTrajectoryComputation.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.claimTrajectory.createManyAndReturn).not.toHaveBeenCalled();
  });
});

describe('the arms share ONE pair universe', () => {
  it('excludes an understated row from every arm and counts why', async () => {
    mockCorpus([
      diffRow({ id: 'eligible' }),
      // Written under the 8-chunk cap: its raw chunks are understated, so it is
      // not a clean control for ANY arm, including the two that never read them.
      diffRow({ id: 'legacy', diffInputVersion: null }),
    ]);

    const r = await compareCandidateSources(URL);

    expect(r.totalPairs).toBe(2);
    expect(r.eligiblePairs).toBe(1);
    expect(r.excluded.CHUNKS_UNDERSTATED).toBe(1);
  });

  it('excludes a pair whose two captures were derived by different versions', async () => {
    mockCorpus([
      diffRow({
        id: 'mixed',
        afterSnapshot: { text: CAPTURES[1]?.text, textExtractionVersion: 'v1-older-derivation' },
      }),
    ]);

    const r = await compareCandidateSources(URL);

    // Diffing across a derivation boundary reports the DERIVATION change as a
    // page change. Level 5 calls that UNCHECKABLE one layer down.
    expect(r.excluded.TEXT_VERSION_MISMATCH).toBe(1);
    expect(r.eligiblePairs).toBe(0);
    // There is no PAIR_INCOMPLETE reason: the relation is required, so a diff
    // without both captures cannot exist to be excluded.
    expect(Object.keys(r.excluded).sort()).toEqual(['CHUNKS_UNDERSTATED', 'TEXT_VERSION_MISMATCH']);
  });

  it('reports production\'s whole-corpus baseline apart from the arms', async () => {
    mockCorpus([diffRow({ id: 'eligible' }), diffRow({ id: 'legacy', diffInputVersion: null })]);
    const r = await compareCandidateSources(URL);
    // The baseline counts BOTH rows; the CLASSIFIED arm counts one. Printing
    // them as peers is how a population difference gets read as an effect.
    expect(r.productionBaselineCandidates).toBeGreaterThanOrEqual(arm(r, 'CLASSIFIED').candidates);
  });
});

describe('an arm that cannot have measured anything says so', () => {
  it('refuses when no pair is eligible', async () => {
    mockCorpus([diffRow({ diffInputVersion: null })]);
    const r = await compareCandidateSources(URL);
    // Zero eligible pairs yields zero candidates in every arm, and "0 lost"
    // reads as "nothing lost". Failure and success must not share a shape.
    expect(r.refusals.join(' ')).toMatch(/No pair is eligible/);
  });

  it('refuses when a row holds classifier quotes but no raw chunks', async () => {
    mockCorpus([diffRow({ rawDeletedText: '[]', rawAddedText: '[]' })]);
    const r = await compareCandidateSources(URL);
    // `[]` is both "unchanged pair" and "column never written". On an eligible
    // row the current writer always writes them, so this combination is a
    // contradiction rather than a quiet zero.
    expect(r.refusals.join(' ')).toMatch(/no raw chunks/);
  });

  it('accepts an eligible pair that genuinely changed nothing', async () => {
    // The other side of the same coin: empty raw columns beside an empty
    // classification is an unchanged pair, which is ordinary and not a refusal.
    mockCorpus([diffRow({ deletedText: '[]', addedText: '[]', rawDeletedText: '[]', rawAddedText: '[]' })]);
    const r = await compareCandidateSources(URL);
    expect(r.refusals.filter((x) => /no raw chunks/.test(x))).toEqual([]);
  });
});

describe('sentence candidates', () => {
  it('cannot yield fewer candidates than the quotes they came from', async () => {
    mockCorpus([
      diffRow({
        deletedText: JSON.stringify([
          {
            summary: 's',
            exactQuote: `${BODY} ${LINK}`,
            investigativeCategories: [],
            relocated: false,
          },
        ]),
      }),
    ]);

    const r = await compareCandidateSources(URL);

    // `sentencesOf` returns at least one part per non-empty input, so splitting
    // can only hold or grow the set. A structural invariant, not a threshold —
    // this repository has already paid for one unmeasured constant that looked
    // reasonable.
    expect(arm(r, 'CLASSIFIED_SENTENCES').candidates).toBeGreaterThanOrEqual(
      arm(r, 'CLASSIFIED').candidates,
    );
    expect(r.refusals.filter((x) => /fewer candidates/.test(x))).toEqual([]);
  });
});

describe('a set size is not a finding count', () => {
  it('findingsIn keeps only claims that clear MIN_TRANSITIONS', () => {
    // `MIN_TRANSITIONS` is applied in `shape()`, which no comparison calls. An
    // unfiltered set therefore includes claims present in EVERY capture — the
    // opposite of a finding — and a spend decision priced on the set size is
    // priced on those. Measured 2026-08-30: the FDA line arrived in GAINED with
    // 0 transitions.
    const set = [
      { claimText: 'present in every capture', transitions: 0 },
      { claimText: 'removed once', transitions: 1 },
      { claimText: 'removed and restored', transitions: 2 },
      { claimText: 'oscillating', transitions: 6 },
    ];
    expect(findingsIn(set).map((c) => c.claimText)).toEqual(['removed and restored', 'oscillating']);
    expect(MIN_TRANSITIONS).toBe(2);
  });
});

describe('the isolated axis is a SET DIFFERENCE, never a count difference', () => {
  // A body sentence that changes and reverts in BOTH renderings, plus a heading
  // that does so only in the document. RAW_CHUNKS reaches the first; only
  // DOCUMENT_CHUNKS reaches the second, and that difference is what the layer buys.
  const WAS = 'Three vaccines are approved.';
  const NOW = 'Four vaccines are approved.';

  function bothLayers(index: number, heading: string, sentence: string) {
    return {
      snapshotDate: `2022-0${String(index)}-01`,
      waybackTimestamp: `20220${String(index)}01000000`,
      snapshotUrl: `https://web.archive.org/web/20220${String(index)}01000000/${URL}`,
      fullText: `${BODY}\n${sentence}\n${LINK}`,
      text: `${BODY}\n${heading}\n${sentence}\n${LINK}`,
    };
  }

  const PAIR_CAPTURES = [
    bothLayers(1, HEADING_A, WAS),
    bothLayers(2, HEADING_B, NOW),
    bothLayers(3, HEADING_A, WAS),
  ];

  function pairRow(id: string, before: number, after: number) {
    return {
      id,
      diffInputVersion: DIFF_INPUT_VERSION,
      // The classifier quoted only the unchanging body, so the datum gains nothing.
      deletedText: JSON.stringify([
        { summary: 's', exactQuote: BODY, investigativeCategories: [], relocated: false },
      ]),
      addedText: '[]',
      // The raw chunks are the fullText diff: they reach the sentence, not the heading.
      rawDeletedText: JSON.stringify([before === 0 ? WAS : NOW]),
      rawAddedText: JSON.stringify([after === 1 ? NOW : WAS]),
      beforeSnapshot: {
        text: PAIR_CAPTURES[before]?.text,
        textExtractionVersion: TEXT_EXTRACTION_VERSION,
      },
      afterSnapshot: {
        text: PAIR_CAPTURES[after]?.text,
        textExtractionVersion: TEXT_EXTRACTION_VERSION,
      },
    };
  }

  it('excludes what the control already reaches, and keeps what only the layer does', async () => {
    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue({ id: 'tracked-1' });
    (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue(PAIR_CAPTURES);
    (prisma.urlVersionDiff.findMany as jest.Mock).mockResolvedValue([
      pairRow('p1', 0, 1),
      pairRow('p2', 1, 2),
    ]);

    const r = await compareCandidateSources(URL);
    const moved = arm(r, 'DOCUMENT_CHUNKS');
    const control = arm(r, 'RAW_CHUNKS');

    expect(moved.controlSource).toBe('RAW_CHUNKS');

    // The sentence is reached by BOTH, so it is not what the renderer buys —
    // even though it counts toward `gainedVsClassified` in both arms.
    expect(control.gainedVsClassified.map((c) => c.claimText)).toContain(WAS);
    expect(moved.gainedVsClassified.map((c) => c.claimText)).toContain(WAS);
    expect(moved.gainedNotInControl.map((c) => c.claimText)).not.toContain(WAS);

    // The heading is reached ONLY through the document. This is the layer's own
    // contribution, and subtracting the two GAINED counts would not have
    // identified it — the sets were never shown to nest.
    expect(moved.gainedNotInControl.map((c) => c.claimText)).toContain(HEADING_A);
  });
});

describe('cells that can only read one way are declared, not reported', () => {
  it('marks both chunk arms as structural and neither classified arm', () => {
    // A chunk arm draws candidates from the very text presence is tested
    // against, so every candidate matches: unmatched is 0 and trajectories ==
    // candidates by construction. That is the defect this instrument studies,
    // reproduced inside it — reportable only if it is marked.
    expect(ARM_PRESENCE_IS_STRUCTURAL.RAW_CHUNKS).toBe(true);
    expect(ARM_PRESENCE_IS_STRUCTURAL.DOCUMENT_CHUNKS).toBe(true);
    expect(ARM_PRESENCE_IS_STRUCTURAL.CLASSIFIED).toBe(false);
    expect(ARM_PRESENCE_IS_STRUCTURAL.CLASSIFIED_SENTENCES).toBe(false);
  });

  it('gives the moved arm a control that holds granularity constant', () => {
    expect(ARM_CONTROL.DOCUMENT_CHUNKS).toBe('RAW_CHUNKS');
    // RAW_CHUNKS' own control is the datum, which is already the comparison.
    expect(ARM_CONTROL.RAW_CHUNKS).toBeUndefined();
  });
});

describe('both directions of the difference, and whether each side is REAL', () => {
  // `htmlToText` inserts a block boundary where Readability joins, so the SAME
  // content is one chunk in `fullText` and two in `text`. That lands in both
  // directions of the set difference while being one finding in substance —
  // claimHash is exact, and the arms read different renderings.
  // BOTH HALVES CLEAR THE CONTAINMENT FLOOR. A shorter pair would not be a
  // re-spelling under `CONTAINMENT_MATCH_MIN_LENGTH` — it would be an accidental
  // substring, which is exactly what the floor refuses to call coverage.
  const HALF_A = 'The vaccine cannot cause the disease at all.';
  const HALF_B = 'It contains no live virus of any kind here.';
  const JOINED = `${HALF_A} ${HALF_B}`;
  const REPLACEMENT = 'Four vaccines are now approved for use in the country.';
  // Short, and a substring of HALF_A — which is what the floor cannot rule on.
  const SHORT_INSIDE = 'cannot cause';

  function twoRenderings(index: number, heading: string, body: string) {
    const split = body === JOINED ? `${HALF_A}\n${HALF_B}` : body;
    return {
      snapshotDate: `2022-0${String(index)}-01`,
      waybackTimestamp: `20220${String(index)}01000000`,
      snapshotUrl: `https://web.archive.org/web/20220${String(index)}01000000/${URL}`,
      fullText: `${BODY}\n${body}`,
      // The heading exists only here — Readability drops it entirely. The short
      // line likewise appears only in this rendering, as its own block.
      text: `${BODY}\n${heading}\n${body === JOINED ? SHORT_INSIDE : REPLACEMENT}\n${split}`,
    };
  }

  const CAPS = [
    twoRenderings(1, HEADING_A, JOINED),
    twoRenderings(2, HEADING_B, REPLACEMENT),
    twoRenderings(3, HEADING_A, JOINED),
  ];

  function row(id: string, before: number, after: number) {
    return {
      id,
      diffInputVersion: DIFF_INPUT_VERSION,
      deletedText: JSON.stringify([
        { summary: 's', exactQuote: BODY, investigativeCategories: [], relocated: false },
      ]),
      addedText: '[]',
      // The raw chunks are the fullText diff: the JOINED form, not the split one.
      rawDeletedText: JSON.stringify([before === 0 ? JOINED : REPLACEMENT]),
      rawAddedText: JSON.stringify([after === 1 ? REPLACEMENT : JOINED]),
      beforeSnapshot: { text: CAPS[before]?.text, textExtractionVersion: TEXT_EXTRACTION_VERSION },
      afterSnapshot: { text: CAPS[after]?.text, textExtractionVersion: TEXT_EXTRACTION_VERSION },
    };
  }

  async function run() {
    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue({ id: 'tracked-1' });
    (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue(CAPS);
    (prisma.urlVersionDiff.findMany as jest.Mock).mockResolvedValue([row('r1', 0, 1), row('r2', 1, 2)]);
    return arm(await compareCandidateSources(URL), 'DOCUMENT_CHUNKS');
  }

  it('reports what the control reaches and this arm does not', async () => {
    const moved = await run();
    // THE REVERSE DIRECTION. Without it a reader nets the exchange by arithmetic
    // over sets that were never shown to nest — the count-subtraction error one
    // level up.
    expect(moved.controlGainsNotHere.map((c) => c.claimText)).toContain(JOINED);
  });

  it('marks a re-spelling as such in BOTH directions', async () => {
    const moved = await run();
    // `Alpha Beta` contains `Alpha`, so neither side is a new finding — the two
    // renderings spell one change differently.
    const back = moved.controlGainsNotHere.find((c) => c.claimText === JOINED);
    expect(back?.respellingOf).not.toBeNull();
    const forward = moved.gainedNotInControl.find((c) => c.claimText === HALF_A);
    expect(forward?.respellingOf).toBe(JOINED);
    // The overlap is HALF_A's own length, which clears the floor.
    expect(HALF_A.length).toBeGreaterThanOrEqual(CONTAINMENT_MATCH_MIN_LENGTH);
  });

  it('leaves a claim the other rendering never contained as genuinely new', async () => {
    const moved = await run();
    // The heading is absent from `fullText` altogether, so nothing in the control
    // set overlaps it. This is what the layer actually buys.
    const genuinely = unique(moved.gainedNotInControl).map((c) => c.claimText);
    expect(genuinely).toContain(HEADING_A);
    expect(genuinely).not.toContain(HALF_A);
  });

  it('calls a SHORT claim that overlaps NOTHING measured, not assumed', async () => {
    const moved = await run();
    // `HEADING_A` is under the floor, but nothing in the control set contains it
    // at all — Readability drops the heading entirely. "Overlaps nothing" is a
    // measurement at any length, so this is UNIQUE on evidence rather than by
    // default, which is the distinction the third verdict exists to keep.
    expect(HEADING_A.length).toBeLessThan(CONTAINMENT_MATCH_MIN_LENGTH);
    const heading = moved.gainedNotInControl.find((c) => c.claimText === HEADING_A);
    expect(heading?.verdict).toBe('UNIQUE');
    expect(heading?.respellingOf).toBeNull();
  });

  it('refuses to rule on a SHORT claim that DOES overlap — neither new nor covered', async () => {
    const moved = await run();
    // A short claim contained in a counterpart cannot be told from an accidental
    // substring. Counting it as new would make "new" true by construction for
    // every short claim — the cannot-fail shape, one level up from where this
    // instrument started. It gets its own band and counts toward neither side.
    const short = moved.gainedNotInControl.find((c) => c.claimText === SHORT_INSIDE);
    expect(SHORT_INSIDE.length).toBeLessThan(CONTAINMENT_MATCH_MIN_LENGTH);
    expect(short?.verdict).toBe('OVERLAP_BELOW_FLOOR');
    expect(unique(moved.gainedNotInControl).map((c) => c.claimText)).not.toContain(SHORT_INSIDE);
  });
});

describe('the free option, tested against the layer a stranger actually searches', () => {
  it('pairs identical candidates with the DOCUMENT layer and controls on the datum', () => {
    // Sentence candidates cost no model calls, but they are discovered from
    // Readability's article and have only ever been tested against it.
    // CLASSIFIED_SENTENCES' zero broken probes cannot fail by construction.
    expect(ARM_LAYER.CLASSIFIED_SENTENCES_AT_DOCUMENT).toBe('DOCUMENT');
    expect(ARM_CONTROL.CLASSIFIED_SENTENCES_AT_DOCUMENT).toBe('CLASSIFIED_SENTENCES');
    // Candidates from one text, presence against another — matching CAN fail here,
    // which is the whole reason the arm is worth running.
    expect(ARM_PRESENCE_IS_STRUCTURAL.CLASSIFIED_SENTENCES_AT_DOCUMENT).toBe(false);
  });

  it('breaks the probe when a SENTENCE exists only in the extraction', async () => {
    // NOT the stitched-span case — sentence splitting already fixes that, because
    // each half is findable on its own. The free option's real exposure is
    // narrower: Readability JOINS across an element the document keeps, so a
    // single sentence in the article has words inserted into the middle of it on
    // the page. Splitting cannot help; the sentence itself is the artefact.
    const JOINED_SENTENCE = 'Vaccines approved here are safe and effective for use.';
    const captures = [1, 2, 3].map((i) => ({
      snapshotDate: `2022-0${String(i)}-01`,
      waybackTimestamp: `20220${String(i)}01000000`,
      snapshotUrl: `https://web.archive.org/web/20220${String(i)}01000000/${URL}`,
      fullText: `${BODY}\n${JOINED_SENTENCE}`,
      // The document keeps a heading INSIDE what Readability joined.
      text: `${BODY}\nVaccines approved here\n${HEADING_A}\nare safe and effective for use.`,
    }));

    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue({ id: 'tracked-1' });
    (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue(captures);
    (prisma.urlVersionDiff.findMany as jest.Mock).mockResolvedValue([
      diffRow({
        deletedText: JSON.stringify([
          { summary: 's', exactQuote: JOINED_SENTENCE, investigativeCategories: [], relocated: false },
        ]),
        rawDeletedText: JSON.stringify([JOINED_SENTENCE]),
        beforeSnapshot: { text: captures[0]?.text, textExtractionVersion: TEXT_EXTRACTION_VERSION },
        afterSnapshot: { text: captures[1]?.text, textExtractionVersion: TEXT_EXTRACTION_VERSION },
      }),
    ]);

    const r = await compareCandidateSources(URL);

    // The extraction arm CANNOT see this — same renderer both sides, so matching
    // is guaranteed. Only the document arm can, and that is the whole point of
    // running it before choosing free-first.
    expect(arm(r, 'CLASSIFIED_SENTENCES').lostProbeBroken).toEqual([]);
    expect(
      arm(r, 'CLASSIFIED_SENTENCES_AT_DOCUMENT').lostProbeBroken.map((c) => c.claimText),
    ).toContain(JOINED_SENTENCE);
  });
});
