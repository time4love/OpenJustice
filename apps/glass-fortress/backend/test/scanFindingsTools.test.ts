// ---------------------------------------------------------------------------
// get_scan_findings / promote_scan_findings
//
// The review gate between a forensic scan and the evidence vault. A scan
// records what it classified as legally significant; these two tools are how a
// human sees those decisions and then makes one.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn() },
    urlVersionDiff: { findMany: jest.fn() },
    evidence: { findMany: jest.fn() },
  },
}));

const mockPromoteEvidence = jest.fn();
jest.mock('../src/services/promoteEvidence', () => ({
  promoteEvidence: (...args: unknown[]) => mockPromoteEvidence(...args),
}));

import { prisma } from '../src/lib/prisma';
import { getScanFindingsHandler } from '../src/mcp/tools/getScanFindings';
import { promoteScanFindingsHandler } from '../src/mcp/tools/promoteScanFindings';

const URL = 'https://corona.health.gov.il/vaccine-for-covid/';

const trackedFindUnique = prisma.trackedUrl.findUnique as jest.Mock;
const diffFindMany = prisma.urlVersionDiff.findMany as jest.Mock;
const evidenceFindMany = prisma.evidence.findMany as jest.Mock;

function diff(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    beforeDate: '2021-06-01',
    afterDate: '2021-09-01',
    snapshotUrl: 'https://web.archive.org/web/20210901/x',
    aiSignificance: 'האזהרה נמחקה.',
    deletedText: '["warning removed"]',
    addedText: '[]',
    evidence: [
      {
        id: 'ev-1',
        fileHash: '0xaaa',
        status: 'PENDING_REVIEW',
        summary: 'summary',
        evidenceTier: 'Tier 2: Material',
        investigativeCategories: ['WITHHOLDING_INFORMATION'],
        onChainTxHash: null,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  trackedFindUnique.mockResolvedValue({ id: 't-1', url: URL, title: 'Vaccines', status: 'IDLE' });
});

describe('get_scan_findings', () => {
  it('returns pending findings with the classifier reasoning, not just the rows', async () => {
    diffFindMany.mockResolvedValue([diff()]);

    const r = JSON.parse(await getScanFindingsHandler({ url: URL }));

    expect(r.pendingReview).toBe(1);
    // Reviewing decisions requires seeing the decision, not only its result.
    expect(r.findings[0].aiSignificance).toBe('האזהרה נמחקה.');
    expect(r.findings[0].deletedItems).toEqual(['warning removed']);
    expect(r.findings[0].beforeDate).toBe('2021-06-01');
  });

  it('separates already-confirmed findings from pending ones', async () => {
    diffFindMany.mockResolvedValue([
      diff(),
      diff({ evidence: [{ ...(diff().evidence as Record<string, unknown>[])[0], id: 'ev-2', status: 'CONFIRMED' }] }),
    ]);

    const r = JSON.parse(await getScanFindingsHandler({ url: URL }));

    expect(r.pendingReview).toBe(1);
    expect(r.alreadyConfirmed).toBe(1);
    expect(r.findings).toHaveLength(1);
  });

  it('counts significant diffs that produced no evidence row rather than hiding them', async () => {
    // A scan that silently drops findings is indistinguishable from one that
    // found nothing — which is the failure this count exists to make visible.
    diffFindMany.mockResolvedValue([diff({ evidence: [] })]);

    const r = JSON.parse(await getScanFindingsHandler({ url: URL }));

    expect(r.unrecorded).toBe(1);
    expect(r.pendingReview).toBe(0);
  });

  it('tells an unscanned page apart from a scanned one with nothing pending', async () => {
    trackedFindUnique.mockResolvedValue(null);

    const r = JSON.parse(await getScanFindingsHandler({ url: URL }));

    expect(r.error).toContain(URL);
    expect(r.explanation).toContain('start_forensic_scan');
  });
});

describe('promote_scan_findings', () => {
  const pendingRecords = [
    { id: 'ev-1', fileHash: '0xaaa' },
    { id: 'ev-2', fileHash: '0xbbb' },
  ];

  it('promotes every pending finding for the URL', async () => {
    evidenceFindMany.mockResolvedValue(pendingRecords);
    mockPromoteEvidence.mockImplementation((r: { id: string; fileHash: string }) =>
      Promise.resolve({ promoted: true, evidenceId: r.id, fileHash: r.fileHash, txHash: '0xtx' }),
    );

    const r = JSON.parse(await promoteScanFindingsHandler({ url: URL }));

    expect(r.promoted).toBe(2);
    expect(r.failed).toBe(0);
    expect(mockPromoteEvidence).toHaveBeenCalledTimes(2);
  });

  it('queries only PENDING_REVIEW evidence from significant diffs on this URL', async () => {
    evidenceFindMany.mockResolvedValue([]);

    await promoteScanFindingsHandler({ url: URL });

    const [args] = evidenceFindMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(args.where.status).toBe('PENDING_REVIEW');
    expect(args.where.urlVersionDiff).toEqual({ trackedUrlId: 't-1', isLegallySignificant: true });
  });

  it('promotes sequentially — parallel sends race on the registrar nonce', async () => {
    evidenceFindMany.mockResolvedValue(pendingRecords);
    let inFlight = 0;
    let maxInFlight = 0;
    mockPromoteEvidence.mockImplementation(async (r: { id: string; fileHash: string }) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      return { promoted: true, evidenceId: r.id, fileHash: r.fileHash, txHash: '0xtx' };
    });

    await promoteScanFindingsHandler({ url: URL });

    expect(maxInFlight).toBe(1);
  });

  it('one failure does not abandon the rest of the batch', async () => {
    evidenceFindMany.mockResolvedValue(pendingRecords);
    mockPromoteEvidence
      .mockRejectedValueOnce(new Error('chain unreachable'))
      .mockResolvedValueOnce({ promoted: true, evidenceId: 'ev-2', fileHash: '0xbbb', txHash: '0xtx' });

    const r = JSON.parse(await promoteScanFindingsHandler({ url: URL }));

    expect(r.promoted).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.outcomes[0].error).toContain('chain unreachable');
    // A partially promoted batch is recoverable by re-running; an aborted one
    // leaves the researcher unable to tell what was handled.
    expect(r.explanation).toContain('re-run');
  });

  it('reports an empty queue without calling the promotion service', async () => {
    evidenceFindMany.mockResolvedValue([]);

    const r = JSON.parse(await promoteScanFindingsHandler({ url: URL }));

    expect(r.promoted).toBe(0);
    expect(mockPromoteEvidence).not.toHaveBeenCalled();
  });
});
