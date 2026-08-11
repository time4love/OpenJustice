import { PatternThesisService } from '../../src/services/PatternThesisService';
import { KeyFigureStatus, KeyFigureType, PatternCategory } from '../../src/generated/prisma';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    keyFigure: { findUnique: jest.fn(), findMany: jest.fn() },
    allegation: { findMany: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const FIGURE = {
  id: 'fig-1',
  name: 'ד"ר יוסי כהן',
  type: KeyFigureType.EVALUATOR,
  organization: 'מכון הערכה ירושלים',
  status: KeyFigureStatus.ACTIVE,
  activatedAt: new Date('2026-01-01'),
  court: { name: 'בית המשפט לענייני משפחה בירושלים' },
  registryVerified: false,
  registrySource: null,
  courtId: 'court-1',
  createdAt: new Date(),
};

describe('PatternThesisService', () => {
  let service: PatternThesisService;

  beforeEach(() => {
    service = new PatternThesisService();
    jest.clearAllMocks();
  });

  describe('buildThesis', () => {
    it('returns null for unknown figure', async () => {
      (mockPrisma.keyFigure.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.buildThesis('fig-missing');

      expect(result).toBeNull();
    });

    it('returns null for PENDING (not yet active) figure', async () => {
      (mockPrisma.keyFigure.findUnique as jest.Mock).mockResolvedValue({
        ...FIGURE,
        status: KeyFigureStatus.PENDING,
      });

      const result = await service.buildThesis('fig-1');

      expect(result).toBeNull();
    });

    it('builds a thesis with correct aggregate counts', async () => {
      (mockPrisma.keyFigure.findUnique as jest.Mock).mockResolvedValue(FIGURE);
      (mockPrisma.allegation.findMany as jest.Mock).mockResolvedValue([
        {
          caseId: 'case-1',
          patternCategory: PatternCategory.EX_PARTE_HEARING,
          allegationHash: 'hash-a',
          onChainTxHash: '0xabc',
          eventStartDate: new Date('2022-03-01'),
          eventEndDate: new Date('2022-06-01'),
          court: { name: 'בית המשפט לענייני משפחה בירושלים' },
        },
        {
          caseId: 'case-2',
          patternCategory: PatternCategory.EX_PARTE_HEARING,
          allegationHash: 'hash-b',
          onChainTxHash: null,
          eventStartDate: new Date('2023-01-15'),
          eventEndDate: null,
          court: { name: 'בית המשפט לענייני משפחה בירושלים' },
        },
        {
          caseId: 'case-3',
          patternCategory: PatternCategory.EVALUATOR_SINGLE_PARENT_ONLY,
          allegationHash: 'hash-c',
          onChainTxHash: '0xdef',
          eventStartDate: null,
          eventEndDate: null,
          court: { name: 'בית המשפט לענייני משפחה בירושלים' },
        },
      ]);

      const thesis = await service.buildThesis('fig-1');

      expect(thesis).not.toBeNull();
      expect(thesis!.figureName).toBe('ד"ר יוסי כהן');
      expect(thesis!.totalCases).toBe(3);
      expect(thesis!.totalAllegations).toBe(3);
      expect(thesis!.onChainCount).toBe(2);
    });

    it('groups patterns correctly by domain', async () => {
      (mockPrisma.keyFigure.findUnique as jest.Mock).mockResolvedValue(FIGURE);
      (mockPrisma.allegation.findMany as jest.Mock).mockResolvedValue([
        {
          caseId: 'case-1',
          patternCategory: PatternCategory.EX_PARTE_HEARING, // domain F
          allegationHash: 'hash-a',
          onChainTxHash: null,
          eventStartDate: null,
          eventEndDate: null,
          court: { name: 'Court A' },
        },
        {
          caseId: 'case-2',
          patternCategory: PatternCategory.EVALUATOR_SINGLE_PARENT_ONLY, // domain D
          allegationHash: 'hash-b',
          onChainTxHash: null,
          eventStartDate: null,
          eventEndDate: null,
          court: { name: 'Court A' },
        },
      ]);

      const thesis = await service.buildThesis('fig-1');

      expect(Object.keys(thesis!.byDomain).sort()).toEqual(['D', 'F']);
      expect(thesis!.byDomain['F']).toHaveLength(1);
      expect(thesis!.byDomain['F']![0]!.patternCategory).toBe(PatternCategory.EX_PARTE_HEARING);
      expect(thesis!.byDomain['D']).toHaveLength(1);
    });

    it('correctly counts distinct cases per pattern', async () => {
      (mockPrisma.keyFigure.findUnique as jest.Mock).mockResolvedValue(FIGURE);
      // Same pattern, two different cases
      (mockPrisma.allegation.findMany as jest.Mock).mockResolvedValue([
        {
          caseId: 'case-1',
          patternCategory: PatternCategory.EX_PARTE_HEARING,
          allegationHash: 'hash-a',
          onChainTxHash: null,
          eventStartDate: null,
          eventEndDate: null,
          court: { name: 'Court A' },
        },
        {
          caseId: 'case-2',
          patternCategory: PatternCategory.EX_PARTE_HEARING,
          allegationHash: 'hash-b',
          onChainTxHash: null,
          eventStartDate: null,
          eventEndDate: null,
          court: { name: 'Court B' },
        },
      ]);

      const thesis = await service.buildThesis('fig-1');
      const pattern = thesis!.byDomain['F']![0]!;

      expect(pattern.caseCount).toBe(2);
      expect(pattern.courts).toEqual(expect.arrayContaining(['Court A', 'Court B']));
      expect(pattern.courts).toHaveLength(2);
    });

    it('computes date range from eventStartDate and eventEndDate', async () => {
      (mockPrisma.keyFigure.findUnique as jest.Mock).mockResolvedValue(FIGURE);
      (mockPrisma.allegation.findMany as jest.Mock).mockResolvedValue([
        {
          caseId: 'case-1',
          patternCategory: PatternCategory.EX_PARTE_HEARING,
          allegationHash: 'hash-a',
          onChainTxHash: null,
          eventStartDate: new Date('2020-05-01'),
          eventEndDate: new Date('2021-01-01'),
          court: { name: 'Court A' },
        },
        {
          caseId: 'case-2',
          patternCategory: PatternCategory.EX_PARTE_HEARING,
          allegationHash: 'hash-b',
          onChainTxHash: null,
          eventStartDate: new Date('2023-08-01'),
          eventEndDate: null,
          court: { name: 'Court A' },
        },
      ]);

      const thesis = await service.buildThesis('fig-1');
      const pattern = thesis!.byDomain['F']![0]!;

      expect(pattern.dateRange.earliest).toBe('2020-05-01');
      expect(pattern.dateRange.latest).toBe('2023-08-01');
    });

    it('returns null date range when no dates are available', async () => {
      (mockPrisma.keyFigure.findUnique as jest.Mock).mockResolvedValue(FIGURE);
      (mockPrisma.allegation.findMany as jest.Mock).mockResolvedValue([
        {
          caseId: 'case-1',
          patternCategory: PatternCategory.EX_PARTE_HEARING,
          allegationHash: 'hash-a',
          onChainTxHash: null,
          eventStartDate: null,
          eventEndDate: null,
          court: { name: 'Court A' },
        },
      ]);

      const thesis = await service.buildThesis('fig-1');
      const pattern = thesis!.byDomain['F']![0]!;

      expect(pattern.dateRange.earliest).toBeNull();
      expect(pattern.dateRange.latest).toBeNull();
    });

    it('returns empty thesis for an active figure with no allegations', async () => {
      (mockPrisma.keyFigure.findUnique as jest.Mock).mockResolvedValue(FIGURE);
      (mockPrisma.allegation.findMany as jest.Mock).mockResolvedValue([]);

      const thesis = await service.buildThesis('fig-1');

      expect(thesis).not.toBeNull();
      expect(thesis!.totalCases).toBe(0);
      expect(thesis!.byDomain).toEqual({});
    });
  });
});
