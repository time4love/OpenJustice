// ---------------------------------------------------------------------------
// Reclassification, and detecting evidence that no longer matches its source.
//
// Stored LLM-derived columns drift the moment the prompt changes. Bringing them
// forward must not require re-scanning (the archive may have changed since) and
// must never require deleting anything — see the 2026-08-21 postmortem.
// ---------------------------------------------------------------------------

const mockAnalyzeChange = jest.fn();
const mockFetchCorrelated = jest.fn().mockResolvedValue([]);
jest.mock('../src/services/WaybackScraper', () => ({
  WaybackScraper: jest.fn().mockImplementation(() => ({
    fetchCorrelatedEvidence: (...a: unknown[]) => mockFetchCorrelated(...a),
  })),
}));
jest.mock('../src/services/ForensicAgent', () => {
  const actual = jest.requireActual('../src/services/ForensicAgent');
  return {
    ...actual,
    ForensicAgent: jest.fn().mockImplementation(() => ({ analyzeChange: mockAnalyzeChange })),
  };
});

const db = {
  diffs: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  runs: [] as Record<string, unknown>[],
  evidence: [] as Record<string, unknown>[],
};

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn(async () => ({ id: 't-1' })) },
    urlVersionDiff: {
      findMany: jest.fn(async () => db.diffs),
      update: jest.fn(async (a: Record<string, unknown>) => {
        db.updates.push(a);
        return {};
      }),
    },
    evidence: { findMany: jest.fn(async () => db.evidence) },
    reclassificationRun: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const r = { id: `run-${db.runs.length + 1}`, ...data };
        db.runs.push(r);
        return r;
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(db.runs[db.runs.length - 1] as object, data);
        return {};
      }),
    },
  },
}));

import { prisma } from '../src/lib/prisma';
import { reclassifyDiffs, findOutOfSyncEvidence } from '../src/services/reclassifyDiffs';

function diff(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'd-1',
    trackedUrlId: 't-1',
    beforeDate: '2022-09-21',
    afterDate: '2022-11-29',
    rawDeletedText: '["chunk a"]',
    rawAddedText: '[]',
    investigativeCategories: [],
    isLegallySignificant: false,
    trackedUrl: { url: 'https://health.gov.il/x' },
    evidence: [],
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.diffs = [];
  db.updates = [];
  db.runs = [];
  db.evidence = [];
});

describe('reclassifyDiffs', () => {
  it('reads stored raw text and never re-fetches the archive', async () => {
    db.diffs = [diff()];
    mockAnalyzeChange.mockResolvedValue({
      investigativeCategories: [], deletedItems: [], addedItems: [], legalSignificance: '', isLegallySignificant: false,
    });

    await reclassifyDiffs({ url: 'https://health.gov.il/x' });

    // Stored chunks are the input — the Internet Archive is never touched, so a
    // page that has since changed or vanished cannot alter a past classification.
    expect(mockAnalyzeChange.mock.calls[0].slice(0, 4)).toEqual([
      ['chunk a'], [], 'https://health.gov.il/x', '2022-11-29',
    ]);
  });

  // -------------------------------------------------------------------------
  // Correlated evidence is supplied, as the original scan does.
  //
  // Three of this corpus's five findings turn on a correlation ("two weeks
  // before the recordings surfaced"). Reclassifying without the vault would
  // overwrite that prose with a version that has none of it, and could flip a
  // verdict for a reason unrelated to the page.
  // -------------------------------------------------------------------------
  it('supplies correlated evidence to the classifier', async () => {
    db.diffs = [diff()];
    const correlated = [{ date: '2022-08-21', summary: 's', investigativeCategories: [], targetEntity: 'MOH', evidenceRole: 'Incriminating' }];
    mockFetchCorrelated.mockResolvedValueOnce(correlated);
    mockAnalyzeChange.mockResolvedValue({
      investigativeCategories: [], deletedItems: [], addedItems: [], legalSignificance: '', isLegallySignificant: false,
    });

    await reclassifyDiffs({});

    expect(mockAnalyzeChange.mock.calls[0][4]).toEqual(correlated);
  });

  it('excludes evidence from the same page, so it cannot corroborate itself', async () => {
    // A sibling diff of the same tracked URL is that page one snapshot earlier,
    // not independent support. Because recordScanFinding writes evidence as a
    // scan walks forward, later diffs otherwise find earlier ones in their
    // window and cite them as corroborating "internal evidence".
    db.diffs = [diff({ id: 'd-42', trackedUrlId: 't-1' })];
    mockAnalyzeChange.mockResolvedValue({
      investigativeCategories: [], deletedItems: [], addedItems: [], legalSignificance: '', isLegallySignificant: false,
    });

    await reclassifyDiffs({});

    expect(mockFetchCorrelated).toHaveBeenCalledWith('2022-11-29', 't-1');
  });

  it('records a flip to significant with its before-state', async () => {
    db.diffs = [diff()];
    mockAnalyzeChange.mockResolvedValue({
      investigativeCategories: ['STATISTICAL_MANIPULATION'],
      deletedItems: [], addedItems: [], legalSignificance: 'x', isLegallySignificant: true,
    });

    const r = await reclassifyDiffs({});

    expect(r.flipsToSignificant).toBe(1);
    expect(r.flips[0]).toMatchObject({ before: [], after: ['STATISTICAL_MANIPULATION'] });
    // Overwriting destroys the only copy of the old verdict — the run is where
    // it survives.
    expect(JSON.parse(db.runs[0]['flips'] as string)).toHaveLength(1);
  });

  it('counts a flip on a diff that already produced evidence separately', async () => {
    db.diffs = [diff({ investigativeCategories: ['INFORMED_CONSENT'], isLegallySignificant: true, evidence: [{ id: 'ev-1' }] })];
    mockAnalyzeChange.mockResolvedValue({
      investigativeCategories: [], deletedItems: [], addedItems: [], legalSignificance: '', isLegallySignificant: false,
    });

    const r = await reclassifyDiffs({});

    expect(r.flipsToRoutine).toBe(1);
    expect(r.flipsWithEvidence).toBe(1);
    expect(r.flips[0].hadEvidence).toBe(true);
  });

  it('writes nothing in a dry run, but still reports the flips', async () => {
    db.diffs = [diff()];
    mockAnalyzeChange.mockResolvedValue({
      investigativeCategories: ['WITHHOLDING_INFORMATION'],
      deletedItems: [], addedItems: [], legalSignificance: '', isLegallySignificant: true,
    });

    const r = await reclassifyDiffs({ dryRun: true });

    expect(db.updates).toHaveLength(0);
    expect(r.reclassified).toBe(0);
    expect(r.flipsToSignificant).toBe(1);
  });

  it('stamps provenance on every row it writes', async () => {
    db.diffs = [diff()];
    mockAnalyzeChange.mockResolvedValue({
      investigativeCategories: [], deletedItems: [], addedItems: [], legalSignificance: '', isLegallySignificant: false,
    });

    await reclassifyDiffs({});

    const data = db.updates[0]['data'] as Record<string, unknown>;
    expect(data['classifierVersion']).toBe('v2-item-level');
    expect(data['classifierPromptHash']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never deletes — bringing a corpus up to date must not destroy it', async () => {
    db.diffs = [diff()];
    mockAnalyzeChange.mockResolvedValue({
      investigativeCategories: [], deletedItems: [], addedItems: [], legalSignificance: '', isLegallySignificant: false,
    });

    await reclassifyDiffs({});

    // The mocked client exposes no delete method at all; this asserts the code
    // never reaches for one.
    expect(db.updates.length).toBeGreaterThan(0);
  });
});

describe('version targeting', () => {
  // -------------------------------------------------------------------------
  // Rows never classified by any version carry classifierVersion NULL, and
  // `NOT: { classifierVersion: X }` compiles to `!= X`, which is NULL — not
  // TRUE — for those rows. The first real run examined 0 of 81 diffs because
  // the filter excluded exactly the rows it existed to find.
  // -------------------------------------------------------------------------
  it('selects rows whose classifierVersion is null', async () => {
    db.diffs = [];
    await reclassifyDiffs({});

    const call = (prisma.urlVersionDiff.findMany as jest.Mock).mock.calls[0][0] as {
      where: { OR?: unknown[] };
    };
    expect(call.where.OR).toEqual([
      { classifierVersion: null },
      { NOT: { classifierVersion: 'v2-item-level' } },
    ]);
  });

  it('drops the version filter entirely under --force', async () => {
    db.diffs = [];
    await reclassifyDiffs({ force: true });

    const call = (prisma.urlVersionDiff.findMany as jest.Mock).mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(call.where.OR).toBeUndefined();
  });
});

describe('findOutOfSyncEvidence', () => {
  it('detects evidence whose categories no longer match its diff', async () => {
    db.evidence = [
      {
        id: 'ev-1', fileHash: '0xa', status: 'CONFIRMED',
        investigativeCategories: ['INFORMED_CONSENT'],
        urlVersionDiff: { investigativeCategories: [], isLegallySignificant: false },
      },
    ];

    const out = await findOutOfSyncEvidence();

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ evidenceId: 'ev-1', diffStillSignificant: false });
  });

  it('ignores evidence that still agrees, regardless of ordering', async () => {
    db.evidence = [
      {
        id: 'ev-2', fileHash: '0xb', status: 'CONFIRMED',
        investigativeCategories: ['B', 'A'],
        urlVersionDiff: { investigativeCategories: ['A', 'B'], isLegallySignificant: true },
      },
    ];

    expect(await findOutOfSyncEvidence()).toEqual([]);
  });
});
