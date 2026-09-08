jest.mock('../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn(), findMany: jest.fn() },
    urlSnapshot: { findMany: jest.fn() },
    urlVersionDiff: { findMany: jest.fn() },
    evidence: { findMany: jest.fn() },
    thesisMention: { count: jest.fn(), findMany: jest.fn() },
    integrityCheck: { findMany: jest.fn() },
  },
}));

jest.mock('../src/context/researcherContext', () => ({ getResearcherId: (): string | null => null }));

import { prisma } from '../src/lib/prisma';
import { listFindingsHandler } from '../src/mcp/tools/listFindings';
import { opinionOf } from '../src/services/corpusReads';
import { CLASSIFICATION_KEYS } from '../src/services/recordDiff';
import {
  AFTER,
  BEFORE,
  CURRENT_VERSION,
  DIFF_NAME,
  DIFF_ROW,
  PAGE,
  URL,
  WHOLE_CLASSIFICATION,
} from './helpers/corpusFixture';

// ---------------------------------------------------------------------------
// `opinions-not-facts` — A7's shape test over `list_findings`' output.
//
// "`opinion` is a separate object from `current.chunks` and is null when no
// classification exists; no field of it appears at the top level of a diff
// entry; the tutorial's COMMON_RULES cites the same shape."
//
// LEVEL 8's SENTENCE, AS A SHAPE. The defect is not that a model's judgement is
// stored — it is stored deliberately, as provenance — but that it can be
// PRESENTED at the same weight as a computed fact. `get_forensic_timeline` did
// exactly that, and the design's answer is structural: two registers, one
// object each, and the ordering never touched by the opinion.
//
// AS A PROPERTY OVER KEYS, NOT AS A LIST. A rule stated as a property and
// implemented as an enumeration is tested against the same enumeration — this
// repository's own words for a defect it has paid for. So the case computes the
// intersection of an entry's keys with the opinion's, and a field added to the
// opinion tomorrow is covered without anyone editing this file.
//
// THE TUTORIAL HALF IS NOT HELD HERE, AND SAYS SO. `src/mcp/tutorial/chapters.ts`
// still carries COMMON_RULES ("Mark model output … NEVER blend the two in one
// table") but has no importer since `start_tutorial` was unregistered in
// 11a-thesis; the tutorial's chapters are rewritten against the flows before
// they are served (the 2026-09-04 triage, decision 1), and that change owns it.
// ---------------------------------------------------------------------------

const page = prisma.trackedUrl.findUnique as jest.Mock;
const snapshots = prisma.urlSnapshot.findMany as jest.Mock;
const diffs = prisma.urlVersionDiff.findMany as jest.Mock;
const evidenceRows = prisma.evidence.findMany as jest.Mock;
const mentionCount = prisma.thesisMention.count as jest.Mock;
const mentions = prisma.thesisMention.findMany as jest.Mock;
const checks = prisma.integrityCheck.findMany as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  page.mockResolvedValue(PAGE);
  snapshots.mockResolvedValue([BEFORE, AFTER]);
  diffs.mockResolvedValue([DIFF_ROW]);
  evidenceRows.mockImplementation((args: { where?: { OR?: unknown } }) =>
    Promise.resolve(args.where?.OR === undefined ? [] : [{ fileHash: DIFF_NAME }]),
  );
  mentionCount.mockResolvedValue(1);
  mentions.mockResolvedValue([]);
  checks.mockResolvedValue([]);
});

async function firstDiff(): Promise<Record<string, unknown>> {
  const out = JSON.parse(await listFindingsHandler({ url: URL })) as {
    diffs: Record<string, unknown>[];
  };
  const diff = out.diffs.at(0);
  if (diff === undefined) throw new Error('the fixture page has no diff — the shape has no subject');
  return diff;
}

describe('opinions-not-facts — the opinion is an object, and never a fact beside one', () => {
  it('`opinion` is a SEPARATE object from the computed content', async () => {
    const diff = await firstDiff();
    expect(diff.opinion).toEqual({
      significance: WHOLE_CLASSIFICATION.legalSignificance,
      categories: WHOLE_CLASSIFICATION.investigativeCategories,
      legallySignificant: WHOLE_CLASSIFICATION.isLegallySignificant,
      editorial: WHOLE_CLASSIFICATION.editorial,
      classifierVersion: WHOLE_CLASSIFICATION.classifierVersion,
      draws: WHOLE_CLASSIFICATION.draws,
    });
    expect(Object.keys(diff.current as object)).toEqual(['contentVersionHash', 'chunks']);
  });

  it('NO FIELD of the opinion appears at the top level of a diff entry', async () => {
    // The property, computed rather than listed: whatever the opinion carries,
    // the entry does not carry it too.
    const diff = await firstDiff();
    const opinionKeys = Object.keys(diff.opinion as object);
    expect(opinionKeys.length).toBeGreaterThan(0);
    expect(opinionKeys.filter((key) => key in diff)).toEqual([]);
  });

  it('DETECTS an entry that hoisted one — the decoy this rule needs to be real', () => {
    // A scan that matches nothing is the vacuity this suite exists against. The
    // decoy is the shape `get_forensic_timeline` had: significance sitting
    // beside the computed chunks, at one weight.
    const hoisted = {
      before: '20201209134003',
      after: '20210612183110',
      significance: 'a model wrote this',
      current: { contentVersionHash: 'c', chunks: [] },
      opinion: { significance: 'a model wrote this', draws: 1 },
    };
    const opinionKeys = Object.keys(hoisted.opinion);
    expect(opinionKeys.filter((key) => key in hoisted)).toEqual(['significance']);
  });

  it('`opinion` is NULL when nothing classified that derivation — not an empty object', async () => {
    // The state A2 defines and Gate 5 writes for a diff with no chunk on either
    // side: "there is no change to call not-editorial". Absent is a FACT.
    diffs.mockResolvedValue([
      { ...DIFF_ROW, contentVersions: [{ ...CURRENT_VERSION, classification: null }] },
    ]);
    const diff = await firstDiff();
    expect(diff.opinion).toBeNull();
  });

  it('the ORDER is never the opinion\'s: significance appears in no sort', async () => {
    // "A list that sorts by an opinion presents the opinion as the ranking,
    // which is the sentence Level 8 forbids." Two diffs, the LATER one carrying
    // the significant classification, still come back in timestamp order.
    const earlier = {
      ...DIFF_ROW,
      id: 'diff-0',
      beforeSnapshot: { ...BEFORE, waybackTimestamp: '20200101000000' },
      afterSnapshot: BEFORE,
      contentVersions: [
        {
          ...CURRENT_VERSION,
          beforeTextHash: BEFORE.textHash,
          afterTextHash: BEFORE.textHash,
          classification: null,
        },
      ],
    };
    diffs.mockResolvedValue([DIFF_ROW, earlier]);
    snapshots.mockResolvedValue([{ ...BEFORE, waybackTimestamp: '20200101000000' }, BEFORE, AFTER]);

    const out = JSON.parse(await listFindingsHandler({ url: URL })) as {
      diffs: { after: string }[];
    };
    expect(out.diffs.map((d) => d.after)).toEqual([BEFORE.waybackTimestamp, AFTER.waybackTimestamp]);
  });
});

describe('the stored classification is read against what the WRITER writes', () => {
  it('a whole row projects to A4\'s six fields', () => {
    const opinion = opinionOf(WHOLE_CLASSIFICATION, '20201209134003 → 20210612183110');
    expect(opinion).not.toBeNull();
    expect(Object.keys(opinion ?? {})).toHaveLength(6);
  });

  it('a HALF row THROWS, naming the diff — it is never read as null', async () => {
    // The writer refuses to write a half classification (`assertWholeOrAbsent`);
    // the reader must not be the place that quietly turns one into a negative
    // answer. Between whole and absent "is nothing the design names".
    const { classifierVersion: _dropped, ...half } = WHOLE_CLASSIFICATION;
    expect(() => opinionOf(half, '20201209134003 → 20210612183110')).toThrow(
      /HALF.*classifierVersion/s,
    );
    expect(() => opinionOf(half, '20201209134003 → 20210612183110')).toThrow(/20201209134003/);
  });

  it('reads "whole" from the WRITER\'S OWN LIST, not from a copy of it', () => {
    // `CLASSIFICATION_KEYS` is imported from `recordDiff`. A reader with its own
    // list is how the two come to disagree about what a half row is — and the
    // fixture is checked against the same list, so a key added to the type
    // fails here rather than passing quietly.
    expect(Object.keys(WHOLE_CLASSIFICATION).sort()).toEqual([...CLASSIFICATION_KEYS].sort());
  });

  it('a row that is not an object at all is a walk defect, not an opinion', () => {
    expect(() => opinionOf('a string', '20201209134003 → 20210612183110')).toThrow(/whole or absent/);
  });
});
