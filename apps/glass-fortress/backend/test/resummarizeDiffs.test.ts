// ---------------------------------------------------------------------------
// Rewriting stored summaries so each describes only its own source.
//
// Until v3 the classification prompt told the model to "EXPLICITLY
// cross-reference" correlated evidence inside legalSignificance, and that prose
// becomes Evidence.summary verbatim. Records therefore asserted facts drawn from
// a DIFFERENT record, unverifiable against their own source — and a thesis could
// be corroborated by its own premise, reflected back through a record it cites.
//
// The repair rewrites the SUMMARY ONLY. The evidence fileHash covers the
// extracted items, and re-extracting them with a non-deterministic classifier
// would orphan seven on-chain anchors.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    urlVersionDiff: { findMany: jest.fn(), update: jest.fn() },
    evidence: { update: jest.fn() },
    summaryCorrection: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));
const mockRewrite = jest.fn();
jest.mock('../src/services/ForensicAgent', () => ({
  ForensicSummaryRewriter: jest.fn().mockImplementation(() => ({ rewrite: mockRewrite })),
}));
jest.mock('../src/services/forensicEvidence', () => ({ forensicEvidenceFileHash: jest.fn() }));
jest.mock('../src/services/VectorStoreService', () => ({ VectorStoreService: { create: jest.fn() } }));

import { prisma } from '../src/lib/prisma';
import { forensicEvidenceFileHash } from '../src/services/forensicEvidence';
import { VectorStoreService } from '../src/services/VectorStoreService';
import { SUMMARY_VERSION } from '../src/lib/classifierVersion';
import { resummarizeDiffs } from '../src/services/resummarizeDiffs';

const LEAKY = 'שינוי זה בוצע כשבועיים לאחר חשיפת ההקלטות המודלפות מתחקיר פרופ׳ ברקוביץ׳.';
const CLEAN = 'מן הדף הוסרו טענות היעילות הכמותיות בדבר המנה הרביעית.';
const HASH = '0xabc';

function diff(over: Record<string, unknown> = {}) {
  return {
    id: 'diff-1',
    afterDate: '2022-09-06',
    aiSignificance: LEAKY,
    deletedText: '[]',
    addedText: '[]',
    trackedUrl: { url: 'https://corona.health.gov.il/vaccine-for-covid/' },
    evidence: [{ fileHash: HASH, status: 'CONFIRMED' }],
    ...over,
  };
}

function setup(rows: ReturnType<typeof diff>[]) {
  (prisma.urlVersionDiff.findMany as jest.Mock).mockResolvedValue(rows);
  (prisma.$transaction as jest.Mock).mockResolvedValue([]);
  (forensicEvidenceFileHash as jest.Mock).mockReturnValue(HASH);
  (VectorStoreService.create as jest.Mock).mockResolvedValue({ upsertEvidence: jest.fn() });
  mockRewrite.mockResolvedValue(CLEAN);
}

describe('resummarizeDiffs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes nothing on a dry run', async () => {
    // The script defaults to dry run: an operator who forgets a flag gets a
    // report, not a corpus-wide rewrite of reviewed text.
    setup([diff()]);

    const r = await resummarizeDiffs({ dryRun: true });

    expect(r.rows).toHaveLength(1);
    expect(r.rewritten).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('selects rows whose summaryVersion is NULL — the entire target set', async () => {
    // `NOT: { summaryVersion: X }` compiles to `NOT (summaryVersion = X)`, which
    // is NULL on a NULL column and matches nothing. Every row needing this repair
    // has summaryVersion NULL, so the first version of this filter excluded
    // exactly the rows it exists to find — and reported "examined: 0, failed: 0"
    // with exit code 0. Found by running it, not by reading it.
    setup([]);

    await resummarizeDiffs({ dryRun: false });

    expect((prisma.urlVersionDiff.findMany as jest.Mock).mock.calls[0][0].where).toMatchObject({
      OR: [{ summaryVersion: null }, { summaryVersion: { not: SUMMARY_VERSION } }],
    });
  });

  it('stamps summaryVersion and NOT classifierVersion', async () => {
    // The items were not re-judged — only the prose was rewritten. Stamping
    // classifierVersion would claim a re-classification that did not happen.
    setup([diff()]);

    await resummarizeDiffs({ dryRun: false });

    const data = (prisma.urlVersionDiff.update as jest.Mock).mock.calls[0][0].data;
    expect(data).toEqual({ aiSignificance: CLEAN, summaryVersion: SUMMARY_VERSION });
    expect(data).not.toHaveProperty('classifierVersion');
  });

  it('records the previous prose for every row it touches', async () => {
    // Capturing before-state only for rows that change meaningfully is how a bulk
    // pass rewrites text nobody can recover — the playbook's standing gap.
    setup([diff()]);

    await resummarizeDiffs({ dryRun: false });

    expect(prisma.summaryCorrection.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ previousText: LEAKY, correctedText: CLEAN }) }),
    );
  });

  it('refuses a row whose recomputed hash does not match the registered evidence', async () => {
    // The post-condition that protects the anchors. If a future change ever
    // re-extracts here, this catches it BEFORE the write rather than after seven
    // anchors stop matching anything.
    setup([diff()]);
    (forensicEvidenceFileHash as jest.Mock).mockReturnValue('0xdifferent');

    const r = await resummarizeDiffs({ dryRun: false });

    expect(r.hashDrift).toBe(1);
    expect(r.rewritten).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates the evidence row only when the diff was promoted', async () => {
    setup([diff({ evidence: [] })]);

    const r = await resummarizeDiffs({ dryRun: false });

    expect(r.rewritten).toBe(1);
    expect(prisma.evidence.update).not.toHaveBeenCalled();
    expect(r.rows[0].evidenceUpdated).toBe(false);
  });

  it('re-indexes a CONFIRMED record so search stops serving the old text', async () => {
    const upsert = jest.fn();
    setup([diff()]);
    (VectorStoreService.create as jest.Mock).mockResolvedValue({ upsertEvidence: upsert });

    const r = await resummarizeDiffs({ dryRun: false });

    expect(upsert).toHaveBeenCalledWith(CLEAN, HASH);
    expect(r.rows[0].reindexed).toBe(true);
  });

  it('does not re-index a record that is not CONFIRMED', async () => {
    const upsert = jest.fn();
    setup([diff({ evidence: [{ fileHash: HASH, status: 'PENDING_REVIEW' }] })]);
    (VectorStoreService.create as jest.Mock).mockResolvedValue({ upsertEvidence: upsert });

    await resummarizeDiffs({ dryRun: false });

    expect(upsert).not.toHaveBeenCalled();
  });

  it('counts a failed rewrite and keeps going', async () => {
    // One bad row must not abort a corpus pass — and must not vanish either.
    setup([diff({ id: 'diff-bad' }), diff({ id: 'diff-ok' })]);
    mockRewrite.mockRejectedValueOnce(new Error('LLM unavailable')).mockResolvedValue(CLEAN);

    const r = await resummarizeDiffs({ dryRun: false });

    expect(r.failed).toBe(1);
    expect(r.rewritten).toBe(1);
  });
});
