// ---------------------------------------------------------------------------
// recordScanFinding — a forensic scan records findings, it does not promote them.
//
// Replaces WaybackScraperAutoPromote.{confirmed,pending}.test.ts. Those suites
// asserted the on-chain behaviour of the old auto-promotion path: register the
// hash, write CONFIRMED, fall back to PENDING_REVIEW when registration could
// not be proven. That path is gone — a scan now records PENDING_REVIEW and a
// human promotes via promote_scan_findings.
//
// No coverage was lost in the replacement: every registration semantic those
// files exercised (success, duplicate recovery, unrecoverable duplicate, error
// propagation) is covered directly in evidenceOnChain.test.ts, against the
// service that actually performs it.
// ---------------------------------------------------------------------------

jest.mock('axios');
// jsdom/@mozilla/readability pull in ESM-only transitive deps that Jest's
// default transform cannot parse. Importing WaybackScraper.ts at all pulls them
// in at module load time, so they are stubbed even though nothing here scrapes.
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

const mockRegisterEvidenceHash = jest.fn();
jest.mock('../src/services/Web3Service', () => {
  const actual = jest.requireActual('../src/services/Web3Service');
  return {
    ...actual,
    Web3Service: jest.fn().mockImplementation(() => ({
      registerEvidenceHash: (...args: unknown[]) => mockRegisterEvidenceHash(...args),
    })),
  };
});

const mockUpsertEvidence = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/services/VectorStoreService', () => ({
  VectorStoreService: {
    create: jest.fn().mockResolvedValue({ upsertEvidence: mockUpsertEvidence }),
  },
}));

const mockUpsert = jest.fn().mockResolvedValue({ id: 'evidence-1', fileHash: '0xabc' });
jest.mock('../src/lib/prisma', () => ({
  prisma: { evidence: { upsert: (...args: unknown[]) => mockUpsert(...args) } },
}));

import { recordScanFinding } from '../src/services/WaybackScraper';
import type { ForensicEvidenceSource } from '../src/services/forensicEvidence';

function source(overrides: Partial<ForensicEvidenceSource> = {}): ForensicEvidenceSource {
  return {
    diffId: 'diff-1',
    url: 'https://www.health.gov.il/vaccines',
    afterDate: '2021-06-01',
    beforeSnapshot: { waybackTimestamp: '20210501000000', contentHash: '0xbefore' },
    afterSnapshot: { waybackTimestamp: '20210601000000', contentHash: '0xafter' },
    snapshotUrl: 'https://web.archive.org/web/20210601000000/https://www.health.gov.il/vaccines',
    aiSignificance: 'האזהרה בדבר תופעות לוואי נמחקה.',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
    deletedText: '[]',
    addedText: '[]',
    deletedItems: [],
    addedItems: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockUpsert.mockClear();
  mockRegisterEvidenceHash.mockClear();
  mockUpsertEvidence.mockClear();
});

describe('recordScanFinding', () => {
  it('always writes PENDING_REVIEW', async () => {
    await recordScanFinding(source());

    const [args] = mockUpsert.mock.calls[0] as [{ create: { status: string } }];
    expect(args.create.status).toBe('PENDING_REVIEW');
  });

  it('never registers anything on-chain', async () => {
    // The whole point of the change. A scan classifies; it does not assert.
    await recordScanFinding(source());

    expect(mockRegisterEvidenceHash).not.toHaveBeenCalled();
  });

  it('never indexes the finding for public search', async () => {
    // Indexing made an unreviewed classification publicly searchable in the
    // same step that created it. Indexing now follows confirmation.
    await recordScanFinding(source());

    expect(mockUpsertEvidence).not.toHaveBeenCalled();
  });

  it('leaves an existing record untouched, so a re-scan cannot reopen a reviewed one', async () => {
    await recordScanFinding(source());

    const [args] = mockUpsert.mock.calls[0] as [{ update: unknown }];
    expect(args.update).toEqual({});
  });

  it('refuses a diff with no investigative category, without touching Prisma', async () => {
    // A change can be unusual, or even legally interesting, and still not be
    // evidence for THIS investigation.
    await recordScanFinding(source({ investigativeCategories: [] }));

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('keys the record by content, not by the diff\'s database id', async () => {
    // fileHash is what gets registered on-chain, so it must attest to the
    // change itself. Two diffs of the same change must collide; the same diff
    // id with different content must not.
    await recordScanFinding(source({ diffId: 'diff-1' }));
    await recordScanFinding(source({ diffId: 'diff-999' }));

    const [first] = mockUpsert.mock.calls[0] as [{ where: { fileHash: string } }];
    const [second] = mockUpsert.mock.calls[1] as [{ where: { fileHash: string } }];
    expect(first.where.fileHash).toBe(second.where.fileHash);
  });

  it('does not throw when the write fails — one bad diff must not abort a scan', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('db down'));

    await expect(recordScanFinding(source())).resolves.toBeUndefined();
  });
});
