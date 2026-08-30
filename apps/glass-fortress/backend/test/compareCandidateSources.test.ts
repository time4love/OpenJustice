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
  ARM_LAYER,
  CANDIDATE_SOURCE,
  CANDIDATE_SOURCES,
  compareCandidateSources,
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
