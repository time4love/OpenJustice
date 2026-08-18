// ---------------------------------------------------------------------------
// autoPromoteToEvidence — Web3Service available.
//
// Companion to WaybackScraperAutoPromote.pending.test.ts (split into its own
// file for the same reason: getWeb3Service() memoizes construction at module
// scope, so each file needs its own fresh module instance to control whether
// construction succeeds or fails).
// ---------------------------------------------------------------------------

jest.mock('axios');
// jsdom/@mozilla/readability pull in ESM-only transitive deps (e.g.
// @exodus/bytes) that Jest's default transform can't parse — stub them out
// exactly like WaybackScraper.test.ts does, even though this file never
// exercises the scraping path, since importing WaybackScraper.ts at all pulls
// these in at module load time.
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

const mockRegisterEvidenceHash = jest.fn();
const mockFindRegisteringTxHash = jest.fn();

jest.mock('../src/services/Web3Service', () => {
  const actual = jest.requireActual('../src/services/Web3Service');
  return {
    ...actual,
    Web3Service: jest.fn().mockImplementation(() => ({
      registerEvidenceHash: (...args: unknown[]) => mockRegisterEvidenceHash(...args),
      findRegisteringTxHash: (...args: unknown[]) => mockFindRegisteringTxHash(...args),
    })),
  };
});

jest.mock('../src/services/VectorStoreService', () => ({
  VectorStoreService: {
    create: jest.fn().mockResolvedValue({
      upsertEvidence: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

const mockUpsert = jest.fn().mockResolvedValue({ id: 'evidence-1', fileHash: '0xabc' });
jest.mock('../src/lib/prisma', () => ({
  prisma: { evidence: { upsert: (...args: unknown[]) => mockUpsert(...args) } },
}));

import { autoPromoteToEvidence } from '../src/services/WaybackScraper';
import { DuplicateEvidenceError } from '../src/services/Web3Service';
import type { ForensicEvidenceSource } from '../src/services/forensicEvidence';

function source(overrides: Partial<ForensicEvidenceSource> = {}): ForensicEvidenceSource {
  return {
    diffId: 'diff-1',
    url: 'https://www.health.gov.il/vaccines',
    afterDate: '2021-06-01',
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

function upsertStatus(): string {
  const call = mockUpsert.mock.calls[0][0] as { create: { status: string } };
  return call.create.status;
}

function upsertOnChainTxHash(): string | null {
  const call = mockUpsert.mock.calls[0][0] as { create: { onChainTxHash: string | null } };
  return call.create.onChainTxHash;
}

describe('autoPromoteToEvidence — Web3Service available', () => {
  beforeEach(() => {
    mockUpsert.mockClear();
    mockRegisterEvidenceHash.mockReset();
    mockFindRegisteringTxHash.mockReset();
  });

  it('registers on-chain and writes CONFIRMED with the real tx hash when registration succeeds', async () => {
    mockRegisterEvidenceHash.mockResolvedValue('0xtxhash');

    await autoPromoteToEvidence(source());

    expect(mockRegisterEvidenceHash).toHaveBeenCalledTimes(1);
    expect(upsertStatus()).toBe('CONFIRMED');
    expect(upsertOnChainTxHash()).toBe('0xtxhash');
  });

  it('on DuplicateEvidenceError, recovers the original tx hash and still writes CONFIRMED', async () => {
    mockRegisterEvidenceHash.mockRejectedValue(new DuplicateEvidenceError('0xabc'));
    mockFindRegisteringTxHash.mockResolvedValue('0xoriginaltxhash');

    await autoPromoteToEvidence(source());

    expect(upsertStatus()).toBe('CONFIRMED');
    expect(upsertOnChainTxHash()).toBe('0xoriginaltxhash');
  });

  it('on an UNRECOVERABLE duplicate (no tx hash found), falls back to PENDING_REVIEW — never CONFIRMED without proof', async () => {
    mockRegisterEvidenceHash.mockRejectedValue(new DuplicateEvidenceError('0xabc'));
    mockFindRegisteringTxHash.mockResolvedValue(null);

    await autoPromoteToEvidence(source());

    expect(upsertStatus()).toBe('PENDING_REVIEW');
    expect(upsertOnChainTxHash()).toBeNull();
  });

  it('falls back to PENDING_REVIEW (not CONFIRMED) when the transaction itself fails', async () => {
    mockRegisterEvidenceHash.mockRejectedValue(new Error('insufficient funds for gas'));

    await autoPromoteToEvidence(source());

    expect(upsertStatus()).toBe('PENDING_REVIEW');
    expect(upsertOnChainTxHash()).toBeNull();
  });
});
