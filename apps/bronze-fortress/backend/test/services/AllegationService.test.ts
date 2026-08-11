import {
  AllegationService,
  buildAllegationHash,
} from '../../src/services/AllegationService';
import { PatternCategory } from '../../src/generated/prisma';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    allegation: {
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

describe('buildAllegationHash', () => {
  it('produces a 64-char hex SHA-256 string', () => {
    const hash = buildAllegationHash('case-1', 'fig-1', PatternCategory.WELFARE_REFERRAL_AT_FIRST_HEARING, 'court-1');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same inputs always produce same hash', () => {
    const a = buildAllegationHash('case-1', 'fig-1', PatternCategory.EX_PARTE_HEARING, 'court-1');
    const b = buildAllegationHash('case-1', 'fig-1', PatternCategory.EX_PARTE_HEARING, 'court-1');
    expect(a).toBe(b);
  });

  it('differs when any input changes', () => {
    const base = buildAllegationHash('case-1', 'fig-1', PatternCategory.EX_PARTE_HEARING, 'court-1');
    expect(buildAllegationHash('case-2', 'fig-1', PatternCategory.EX_PARTE_HEARING, 'court-1')).not.toBe(base);
    expect(buildAllegationHash('case-1', 'fig-2', PatternCategory.EX_PARTE_HEARING, 'court-1')).not.toBe(base);
    expect(buildAllegationHash('case-1', 'fig-1', PatternCategory.RECUSAL_DENIED_CONFLICT, 'court-1')).not.toBe(base);
    expect(buildAllegationHash('case-1', 'fig-1', PatternCategory.EX_PARTE_HEARING, 'court-2')).not.toBe(base);
  });
});

describe('AllegationService', () => {
  let service: AllegationService;

  beforeEach(() => {
    service = new AllegationService();
    jest.clearAllMocks();
    // Default: no blockchain configured
    (getWeb3Service as jest.Mock).mockReturnValue(null);
  });

  describe('registerAllegation', () => {
    const input = {
      caseId: 'case-1',
      figureId: 'fig-1',
      courtId: 'court-1',
      patternCategory: PatternCategory.WELFARE_REFERRAL_AT_FIRST_HEARING,
    };

    it('creates a new allegation when none exists', async () => {
      const allegation = { id: 'al-1', allegationHash: 'abc123' };
      (mockPrisma.allegation.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.allegation.create as jest.Mock).mockResolvedValue(allegation);

      const result = await service.registerAllegation(input);

      expect(mockPrisma.allegation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          caseId: 'case-1',
          figureId: 'fig-1',
          courtId: 'court-1',
          patternCategory: PatternCategory.WELFARE_REFERRAL_AT_FIRST_HEARING,
          allegationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      });
      expect(result).toEqual({ allegation, isDuplicate: false });
    });

    it('returns existing allegation as duplicate without creating a new record', async () => {
      const existing = { id: 'al-existing', allegationHash: 'abc123' };
      (mockPrisma.allegation.findUnique as jest.Mock).mockResolvedValue(existing);

      const result = await service.registerAllegation(input);

      expect(mockPrisma.allegation.create).not.toHaveBeenCalled();
      expect(result).toEqual({ allegation: existing, isDuplicate: true });
    });

    it('includes eventStartDate and eventEndDate when provided', async () => {
      const start = new Date('2023-01-01');
      const end = new Date('2023-06-01');
      (mockPrisma.allegation.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.allegation.create as jest.Mock).mockResolvedValue({});

      await service.registerAllegation({ ...input, eventStartDate: start, eventEndDate: end });

      expect(mockPrisma.allegation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventStartDate: start, eventEndDate: end }),
      });
    });

    it('does not block when web3 is not configured', async () => {
      (getWeb3Service as jest.Mock).mockReturnValue(null);
      (mockPrisma.allegation.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.allegation.create as jest.Mock).mockResolvedValue({ id: 'al-1', allegationHash: 'abc' });

      const result = await service.registerAllegation(input);

      expect(result.isDuplicate).toBe(false);
      expect(mockPrisma.allegation.update).not.toHaveBeenCalled();
    });

    it('fires on-chain registration and stores txHash when web3 is configured', async () => {
      mockRegisterCommitmentHash.mockResolvedValue('0xdeadbeef');
      (getWeb3Service as jest.Mock).mockReturnValue({
        registerCommitmentHash: mockRegisterCommitmentHash,
      });
      (mockPrisma.allegation.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.allegation.create as jest.Mock).mockResolvedValue({ id: 'al-1', allegationHash: 'abc' });
      (mockPrisma.allegation.update as jest.Mock).mockResolvedValue({});

      await service.registerAllegation(input);

      // Allow fire-and-forget to settle
      await new Promise((r) => setImmediate(r));

      expect(mockRegisterCommitmentHash).toHaveBeenCalledWith('abc');
      expect(mockPrisma.allegation.update).toHaveBeenCalledWith({
        where: { id: 'al-1' },
        data: { onChainTxHash: '0xdeadbeef' },
      });
    });

    it('does not throw when on-chain registration fails', async () => {
      mockRegisterCommitmentHash.mockRejectedValue(new Error('RPC timeout'));
      (getWeb3Service as jest.Mock).mockReturnValue({
        registerCommitmentHash: mockRegisterCommitmentHash,
      });
      (mockPrisma.allegation.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.allegation.create as jest.Mock).mockResolvedValue({ id: 'al-1', allegationHash: 'abc' });

      await expect(service.registerAllegation(input)).resolves.not.toThrow();

      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.allegation.update).not.toHaveBeenCalled();
    });
  });

  describe('getFigurePatternSummary', () => {
    it('returns aggregated pattern counts and total distinct cases', async () => {
      (mockPrisma.allegation.groupBy as jest.Mock).mockResolvedValue([
        { patternCategory: PatternCategory.EX_PARTE_HEARING, _count: { caseId: 12 } },
        { patternCategory: PatternCategory.SYSTEMIC_HEARING_DELAYS, _count: { caseId: 7 } },
      ]);
      (mockPrisma.allegation.findMany as jest.Mock).mockResolvedValue([
        { caseId: 'case-1' },
        { caseId: 'case-2' },
        { caseId: 'case-3' },
      ]);

      const result = await service.getFigurePatternSummary('fig-1');

      expect(result).toEqual({
        figureId: 'fig-1',
        totalCases: 3,
        patterns: [
          { patternCategory: PatternCategory.EX_PARTE_HEARING, caseCount: 12 },
          { patternCategory: PatternCategory.SYSTEMIC_HEARING_DELAYS, caseCount: 7 },
        ],
      });
    });
  });

  describe('getPatternCount', () => {
    it('returns number of distinct cases for a pattern + figure', async () => {
      (mockPrisma.allegation.groupBy as jest.Mock).mockResolvedValue([
        { caseId: 'case-1' },
        { caseId: 'fam-2' },
        { caseId: 'fam-3' },
      ]);

      const count = await service.getPatternCount('fig-1', PatternCategory.EX_PARTE_HEARING);

      expect(count).toBe(3);
      expect(mockPrisma.allegation.groupBy).toHaveBeenCalledWith({
        by: ['caseId'],
        where: { figureId: 'fig-1', patternCategory: PatternCategory.EX_PARTE_HEARING },
      });
    });
  });

  describe('getPatternCountsByFigure', () => {
    it('returns a map of figureId:patternCategory to case count', async () => {
      (mockPrisma.allegation.groupBy as jest.Mock).mockResolvedValue([
        { figureId: 'fig-1', patternCategory: PatternCategory.EX_PARTE_HEARING, _count: { id: 5 } },
        { figureId: 'fig-1', patternCategory: PatternCategory.SYSTEMIC_HEARING_DELAYS, _count: { id: 2 } },
        { figureId: 'fig-2', patternCategory: PatternCategory.EX_PARTE_HEARING, _count: { id: 1 } },
      ]);

      const result = await service.getPatternCountsByFigure(['fig-1', 'fig-2']);

      expect(mockPrisma.allegation.groupBy).toHaveBeenCalledWith({
        by: ['figureId', 'patternCategory'],
        where: { figureId: { in: ['fig-1', 'fig-2'] } },
        _count: { id: true },
      });
      expect(result.get(`fig-1:${PatternCategory.EX_PARTE_HEARING}`)).toBe(5);
      expect(result.get(`fig-1:${PatternCategory.SYSTEMIC_HEARING_DELAYS}`)).toBe(2);
      expect(result.get(`fig-2:${PatternCategory.EX_PARTE_HEARING}`)).toBe(1);
    });

    it('returns an empty map when no figureIds provided', async () => {
      const result = await service.getPatternCountsByFigure([]);
      expect(mockPrisma.allegation.groupBy).not.toHaveBeenCalled();
      expect(result.size).toBe(0);
    });
  });

  describe('updateOnChainTxHash', () => {
    it('stores the tx hash on the allegation', async () => {
      (mockPrisma.allegation.update as jest.Mock).mockResolvedValue({});

      await service.updateOnChainTxHash('al-1', '0xdeadbeef');

      expect(mockPrisma.allegation.update).toHaveBeenCalledWith({
        where: { id: 'al-1' },
        data: { onChainTxHash: '0xdeadbeef' },
      });
    });
  });
});
