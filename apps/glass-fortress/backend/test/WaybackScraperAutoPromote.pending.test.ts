// ---------------------------------------------------------------------------
// autoPromoteToEvidence — Web3Service unavailable (e.g. staging, no RPC_URL).
//
// Regression test for the bug where a diff auto-promoted while the chain was
// unreachable was still written as status: 'CONFIRMED' — which the schema
// defines as "registered on-chain" — so it lied about being on-chain. It must
// now fall back to PENDING_REVIEW instead, and never call registerEvidenceHash.
//
// Split into its own file (rather than a describe block) because
// getWeb3Service() memoizes Web3Service construction at module scope; each
// test file gets its own fresh module registry, which is the simplest way to
// get isolated web3-availability scenarios without reaching for
// jest.isolateModules/doMock gymnastics.
// ---------------------------------------------------------------------------

jest.mock('axios');
// jsdom/@mozilla/readability pull in ESM-only transitive deps (e.g.
// @exodus/bytes) that Jest's default transform can't parse — stub them out
// exactly like WaybackScraper.test.ts does, even though this file never
// exercises the scraping path, since importing WaybackScraper.ts at all pulls
// these in at module load time.
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

jest.mock('../src/services/Web3Service', () => ({
  Web3Service: jest.fn().mockImplementation(() => {
    throw new Error('RPC_URL not set');
  }),
  DuplicateEvidenceError: jest.requireActual('../src/services/Web3Service').DuplicateEvidenceError,
}));

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
import { Web3Service } from '../src/services/Web3Service';
import type { ForensicEvidenceSource } from '../src/services/forensicEvidence';

const MockWeb3Service = Web3Service as unknown as jest.Mock;

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

describe('autoPromoteToEvidence — Web3Service unavailable', () => {
  // getWeb3Service() memoizes Web3Service construction at module scope for the
  // lifetime of this file's module instance, so both assertions below must
  // live in one test — a fresh `it()` would see the already-memoized (null)
  // result and never re-invoke the constructor, making a separately-asserted
  // call count order-dependent on describe-block execution order.
  beforeEach(() => mockUpsert.mockClear());

  it('writes PENDING_REVIEW (never falsely CONFIRMED) and only attempts construction once', async () => {
    await autoPromoteToEvidence(source());
    await autoPromoteToEvidence(source({ diffId: 'diff-2' }));

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    for (const [args] of mockUpsert.mock.calls) {
      const call = args as { create: { status: string }; update: unknown };
      expect(call.create.status).toBe('PENDING_REVIEW');
      expect(call.update).toEqual({});
    }

    // Attempted once for the first call, then reused the memoized null result.
    expect(MockWeb3Service).toHaveBeenCalledTimes(1);
  });

  it('refuses to promote a diff with no investigative category, without touching Prisma', async () => {
    await autoPromoteToEvidence(source({ investigativeCategories: [] }));

    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
