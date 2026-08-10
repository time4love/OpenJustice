import {
  CommitmentService,
  buildCommitmentHash,
} from '../../src/services/CommitmentService';
import { PatternCategory } from '../../src/generated/prisma';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    commitment: {
      findUnique: jest.fn(),
      create: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockRegisterCommitmentHash = jest.fn();
jest.mock('../../src/lib/web3', () => ({
  getWeb3Service: jest.fn(),
}));
import { getWeb3Service } from '../../src/lib/web3';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('buildCommitmentHash', () => {
  it('produces a 64-char hex SHA-256 string', () => {
    const hash = buildCommitmentHash('fig-1', PatternCategory.WELFARE_REFERRAL_AT_FIRST_HEARING, 'court-1');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same inputs always produce same hash', () => {
    const a = buildCommitmentHash('fig-1', PatternCategory.EX_PARTE_HEARING, 'court-1');
    const b = buildCommitmentHash('fig-1', PatternCategory.EX_PARTE_HEARING, 'court-1');
    expect(a).toBe(b);
  });

  it('differs when any input changes', () => {
    const base = buildCommitmentHash('fig-1', PatternCategory.EX_PARTE_HEARING, 'court-1');
    expect(buildCommitmentHash('fig-2', PatternCategory.EX_PARTE_HEARING, 'court-1')).not.toBe(base);
    expect(buildCommitmentHash('fig-1', PatternCategory.RECUSAL_DENIED_CONFLICT, 'court-1')).not.toBe(base);
    expect(buildCommitmentHash('fig-1', PatternCategory.EX_PARTE_HEARING, 'court-2')).not.toBe(base);
  });
});

describe('CommitmentService', () => {
  let service: CommitmentService;

  beforeEach(() => {
    service = new CommitmentService();
    jest.clearAllMocks();
    // Default: no blockchain configured
    (getWeb3Service as jest.Mock).mockReturnValue(null);
  });

  describe('registerCommitment', () => {
    const input = {
      caseId: 'case-1',
      figureId: 'fig-1',
      courtId: 'court-1',
      patternCategory: PatternCategory.WELFARE_REFERRAL_AT_FIRST_HEARING,
    };

    it('creates a new commitment when none exists', async () => {
      const commitment = { id: 'cm-1', commitmentHash: 'abc123' };
      (mockPrisma.commitment.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.commitment.create as jest.Mock).mockResolvedValue(commitment);

      const result = await service.registerCommitment(input);

      expect(mockPrisma.commitment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          caseId: 'case-1',
          figureId: 'fig-1',
          courtId: 'court-1',
          patternCategory: PatternCategory.WELFARE_REFERRAL_AT_FIRST_HEARING,
          commitmentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      });
      expect(result).toEqual({ commitment, isDuplicate: false });
    });

    it('returns existing commitment as duplicate without creating a new record', async () => {
      const existing = { id: 'cm-existing', commitmentHash: 'abc123' };
      (mockPrisma.commitment.findUnique as jest.Mock).mockResolvedValue(existing);

      const result = await service.registerCommitment(input);

      expect(mockPrisma.commitment.create).not.toHaveBeenCalled();
      expect(result).toEqual({ commitment: existing, isDuplicate: true });
    });

    it('includes eventStartDate and eventEndDate when provided', async () => {
      const start = new Date('2023-01-01');
      const end = new Date('2023-06-01');
      (mockPrisma.commitment.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.commitment.create as jest.Mock).mockResolvedValue({});

      await service.registerCommitment({ ...input, eventStartDate: start, eventEndDate: end });

      expect(mockPrisma.commitment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventStartDate: start, eventEndDate: end }),
      });
    });

    it('does not block when web3 is not configured', async () => {
      (getWeb3Service as jest.Mock).mockReturnValue(null);
      (mockPrisma.commitment.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.commitment.create as jest.Mock).mockResolvedValue({ id: 'cm-1', commitmentHash: 'abc' });

      const result = await service.registerCommitment(input);

      expect(result.isDuplicate).toBe(false);
      expect(mockPrisma.commitment.update).not.toHaveBeenCalled();
    });

    it('fires on-chain registration and stores txHash when web3 is configured', async () => {
      mockRegisterCommitmentHash.mockResolvedValue('0xdeadbeef');
      (getWeb3Service as jest.Mock).mockReturnValue({
        registerCommitmentHash: mockRegisterCommitmentHash,
      });
      (mockPrisma.commitment.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.commitment.create as jest.Mock).mockResolvedValue({ id: 'cm-1', commitmentHash: 'abc' });
      (mockPrisma.commitment.update as jest.Mock).mockResolvedValue({});

      await service.registerCommitment(input);

      // Allow fire-and-forget to settle
      await new Promise((r) => setImmediate(r));

      expect(mockRegisterCommitmentHash).toHaveBeenCalledWith('abc');
      expect(mockPrisma.commitment.update).toHaveBeenCalledWith({
        where: { id: 'cm-1' },
        data: { onChainTxHash: '0xdeadbeef' },
      });
    });

    it('does not throw when on-chain registration fails', async () => {
      mockRegisterCommitmentHash.mockRejectedValue(new Error('RPC timeout'));
      (getWeb3Service as jest.Mock).mockReturnValue({
        registerCommitmentHash: mockRegisterCommitmentHash,
      });
      (mockPrisma.commitment.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.commitment.create as jest.Mock).mockResolvedValue({ id: 'cm-1', commitmentHash: 'abc' });

      await expect(service.registerCommitment(input)).resolves.not.toThrow();

      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.commitment.update).not.toHaveBeenCalled();
    });
  });

  describe('getFigurePatternSummary', () => {
    it('returns aggregated pattern counts and total unique families', async () => {
      (mockPrisma.commitment.groupBy as jest.Mock).mockResolvedValue([
        { patternCategory: PatternCategory.EX_PARTE_HEARING, _count: { caseId: 12 } },
        { patternCategory: PatternCategory.SYSTEMIC_HEARING_DELAYS, _count: { caseId: 7 } },
      ]);
      (mockPrisma.commitment.findMany as jest.Mock).mockResolvedValue([
        { caseId: 'case-1' },
        { caseId: 'fam-2' },
        { caseId: 'fam-3' },
      ]);

      const result = await service.getFigurePatternSummary('fig-1');

      expect(result).toEqual({
        figureId: 'fig-1',
        totalFamilies: 3,
        patterns: [
          { patternCategory: PatternCategory.EX_PARTE_HEARING, familyCount: 12 },
          { patternCategory: PatternCategory.SYSTEMIC_HEARING_DELAYS, familyCount: 7 },
        ],
      });
    });
  });

  describe('getPatternCount', () => {
    it('returns number of distinct families for a pattern + figure', async () => {
      (mockPrisma.commitment.groupBy as jest.Mock).mockResolvedValue([
        { caseId: 'case-1' },
        { caseId: 'fam-2' },
        { caseId: 'fam-3' },
      ]);

      const count = await service.getPatternCount('fig-1', PatternCategory.EX_PARTE_HEARING);

      expect(count).toBe(3);
      expect(mockPrisma.commitment.groupBy).toHaveBeenCalledWith({
        by: ['caseId'],
        where: { figureId: 'fig-1', patternCategory: PatternCategory.EX_PARTE_HEARING },
      });
    });
  });

  describe('updateOnChainTxHash', () => {
    it('stores the tx hash on the commitment', async () => {
      (mockPrisma.commitment.update as jest.Mock).mockResolvedValue({});

      await service.updateOnChainTxHash('cm-1', '0xdeadbeef');

      expect(mockPrisma.commitment.update).toHaveBeenCalledWith({
        where: { id: 'cm-1' },
        data: { onChainTxHash: '0xdeadbeef' },
      });
    });
  });
});
