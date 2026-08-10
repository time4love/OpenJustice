import { PatternDetectionService } from '../../src/services/PatternDetectionService';
import { PatternCategory, PoliceCaseStatus, NzakutOrderType } from '../../src/generated/prisma';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    criminalComplaint: { findMany: jest.fn() },
    nzakutOrder: { findMany: jest.fn() },
    commitment: { findMany: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const BASE = { caseId: 'case-1', figureId: 'fig-1', courtId: 'court-1' };

function setup({
  complaints = [],
  orders = [],
  existing = [],
}: {
  complaints?: object[];
  orders?: object[];
  existing?: { patternCategory: PatternCategory }[];
}) {
  (mockPrisma.criminalComplaint.findMany as jest.Mock).mockResolvedValue(complaints);
  (mockPrisma.nzakutOrder.findMany as jest.Mock).mockResolvedValue(orders);
  (mockPrisma.commitment.findMany as jest.Mock).mockResolvedValue(existing);
}

describe('PatternDetectionService', () => {
  let service: PatternDetectionService;

  beforeEach(() => {
    service = new PatternDetectionService();
    jest.clearAllMocks();
  });

  it('returns empty suggestions when no intake data exists', async () => {
    setup({});
    const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);
    expect(result.suggestions).toHaveLength(0);
  });

  // ── Domain A ─────────────────────────────────────────────────────────────

  describe('Domain A — CRIMINAL_EXONERATION_IGNORED', () => {
    it('suggests pattern when police case closed and court ignored it', async () => {
      setup({
        complaints: [{ policeStatus: PoliceCaseStatus.CLOSED_CLEARED, closureConsideredByCourt: false }],
      });

      const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]?.patternCategory).toBe(PatternCategory.CRIMINAL_EXONERATION_IGNORED);
      expect(result.suggestions[0]?.alreadyRegistered).toBe(false);
    });

    it('does not suggest when closureConsideredByCourt is true', async () => {
      setup({
        complaints: [{ policeStatus: PoliceCaseStatus.CLOSED_CLEARED, closureConsideredByCourt: true }],
      });
      const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);
      expect(result.suggestions).toHaveLength(0);
    });

    it('does not suggest when police case is still open', async () => {
      setup({
        complaints: [{ policeStatus: PoliceCaseStatus.OPEN, closureConsideredByCourt: false }],
      });
      const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);
      expect(result.suggestions).toHaveLength(0);
    });

    it('deduplicates — two qualifying complaints produce one suggestion', async () => {
      setup({
        complaints: [
          { policeStatus: PoliceCaseStatus.CLOSED_CLEARED, closureConsideredByCourt: false },
          { policeStatus: PoliceCaseStatus.CLOSED_LACK_OF_EVIDENCE, closureConsideredByCourt: false },
        ],
      });
      const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);
      expect(result.suggestions).toHaveLength(1);
    });
  });

  // ── Domain B ─────────────────────────────────────────────────────────────

  describe('Domain B — EMERGENCY_ORDER_NO_HEARING_30_DAYS', () => {
    it('suggests pattern for emergency order without evidentiary hearing', async () => {
      setup({
        orders: [{ orderType: NzakutOrderType.EMERGENCY, evidentiaryHearingHeld: false }],
      });
      const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);
      const cats = result.suggestions.map((s) => s.patternCategory);
      expect(cats).toContain(PatternCategory.EMERGENCY_ORDER_NO_HEARING_30_DAYS);
    });

    it('does not suggest for standard order without hearing (only NZAKUT_NO_EVIDENTIARY_HEARING applies)', async () => {
      setup({
        orders: [{ orderType: NzakutOrderType.STANDARD, evidentiaryHearingHeld: false }],
      });
      const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);
      const cats = result.suggestions.map((s) => s.patternCategory);
      expect(cats).not.toContain(PatternCategory.EMERGENCY_ORDER_NO_HEARING_30_DAYS);
      expect(cats).toContain(PatternCategory.NZAKUT_NO_EVIDENTIARY_HEARING);
    });
  });

  describe('Domain B — NZAKUT_NO_EVIDENTIARY_HEARING', () => {
    it('suggests pattern whenever evidentiaryHearingHeld=false', async () => {
      setup({
        orders: [{ orderType: NzakutOrderType.STANDARD, evidentiaryHearingHeld: false }],
      });
      const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);
      const cats = result.suggestions.map((s) => s.patternCategory);
      expect(cats).toContain(PatternCategory.NZAKUT_NO_EVIDENTIARY_HEARING);
    });

    it('does not suggest when hearing was held', async () => {
      setup({
        orders: [{ orderType: NzakutOrderType.STANDARD, evidentiaryHearingHeld: true, daysWithoutMeritsHearing: 100 }],
      });
      const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);
      const cats = result.suggestions.map((s) => s.patternCategory);
      expect(cats).not.toContain(PatternCategory.NZAKUT_NO_EVIDENTIARY_HEARING);
    });
  });

  describe('Domain B — CHILD_REMOVED_OVER_YEAR_NO_HEARING', () => {
    it('suggests pattern when daysWithoutMeritsHearing >= 365', async () => {
      setup({
        orders: [{ orderType: NzakutOrderType.EMERGENCY, evidentiaryHearingHeld: false, daysWithoutMeritsHearing: 420 }],
      });
      const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);
      const cats = result.suggestions.map((s) => s.patternCategory);
      expect(cats).toContain(PatternCategory.CHILD_REMOVED_OVER_YEAR_NO_HEARING);
    });

    it('does not suggest when daysWithoutMeritsHearing < 365', async () => {
      setup({
        orders: [{ orderType: NzakutOrderType.EMERGENCY, evidentiaryHearingHeld: false, daysWithoutMeritsHearing: 200 }],
      });
      const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);
      const cats = result.suggestions.map((s) => s.patternCategory);
      expect(cats).not.toContain(PatternCategory.CHILD_REMOVED_OVER_YEAR_NO_HEARING);
    });

    it('does not suggest when daysWithoutMeritsHearing is null', async () => {
      setup({
        orders: [{ orderType: NzakutOrderType.EMERGENCY, evidentiaryHearingHeld: false, daysWithoutMeritsHearing: null }],
      });
      const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);
      const cats = result.suggestions.map((s) => s.patternCategory);
      expect(cats).not.toContain(PatternCategory.CHILD_REMOVED_OVER_YEAR_NO_HEARING);
    });
  });

  // ── Already-registered flag ───────────────────────────────────────────────

  describe('alreadyRegistered flag', () => {
    it('marks suggestion as alreadyRegistered when commitment exists', async () => {
      setup({
        complaints: [{ policeStatus: PoliceCaseStatus.CLOSED_CLEARED, closureConsideredByCourt: false }],
        existing: [{ patternCategory: PatternCategory.CRIMINAL_EXONERATION_IGNORED }],
      });

      const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);

      expect(result.suggestions[0]?.alreadyRegistered).toBe(true);
    });

    it('marks as not registered when commitment does not exist', async () => {
      setup({
        complaints: [{ policeStatus: PoliceCaseStatus.CLOSED_CLEARED, closureConsideredByCourt: false }],
        existing: [],
      });

      const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);

      expect(result.suggestions[0]?.alreadyRegistered).toBe(false);
    });
  });

  // ── Multi-domain ──────────────────────────────────────────────────────────

  it('returns suggestions from multiple domains in a single call', async () => {
    setup({
      complaints: [{ policeStatus: PoliceCaseStatus.CLOSED_CLEARED, closureConsideredByCourt: false }],
      orders: [{ orderType: NzakutOrderType.EMERGENCY, evidentiaryHearingHeld: false, daysWithoutMeritsHearing: 500 }],
    });

    const result = await service.suggestCommitments(BASE.caseId, BASE.figureId, BASE.courtId);
    const cats = result.suggestions.map((s) => s.patternCategory);

    expect(cats).toContain(PatternCategory.CRIMINAL_EXONERATION_IGNORED);
    expect(cats).toContain(PatternCategory.EMERGENCY_ORDER_NO_HEARING_30_DAYS);
    expect(cats).toContain(PatternCategory.NZAKUT_NO_EVIDENTIARY_HEARING);
    expect(cats).toContain(PatternCategory.CHILD_REMOVED_OVER_YEAR_NO_HEARING);
    expect(result.suggestions).toHaveLength(4);
  });
});
