import { ConsentService } from '../../src/services/ConsentService';
import { CooperationLevel } from '../../src/generated/prisma';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    consentRecord: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    case: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Helper: make $transaction execute the callback with the same mock prisma as tx
function mockTransaction() {
  (mockPrisma.$transaction as jest.Mock).mockImplementation(
    (cb: (tx: typeof prisma) => Promise<unknown>) => cb(mockPrisma),
  );
}

describe('ConsentService', () => {
  let service: ConsentService;

  beforeEach(() => {
    service = new ConsentService();
    jest.clearAllMocks();
    mockTransaction();
  });

  describe('grantConsent', () => {
    it('creates a ConsentRecord and elevates cooperationLevel when new tier is higher', async () => {
      const record = { id: 'cr-1', caseId: 'case-1', tier: CooperationLevel.ANONYMOUS_TIMELINE };
      (mockPrisma.consentRecord.create as jest.Mock).mockResolvedValue(record);
      (mockPrisma.case.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'case-1',
        cooperationLevel: CooperationLevel.NONE,
      });
      (mockPrisma.case.update as jest.Mock).mockResolvedValue({});

      const result = await service.grantConsent('case-1', CooperationLevel.ANONYMOUS_TIMELINE);

      expect(mockPrisma.consentRecord.create).toHaveBeenCalledWith({
        data: { caseId: 'case-1', tier: CooperationLevel.ANONYMOUS_TIMELINE, isActive: true },
      });
      expect(mockPrisma.case.update).toHaveBeenCalledWith({
        where: { id: 'case-1' },
        data: { cooperationLevel: CooperationLevel.ANONYMOUS_TIMELINE },
      });
      expect(result).toEqual(record);
    });

    it('does not lower cooperationLevel when new tier is lower than existing', async () => {
      (mockPrisma.consentRecord.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.case.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'case-1',
        cooperationLevel: CooperationLevel.SHARED_EVIDENCE_ROOM,
      });

      await service.grantConsent('case-1', CooperationLevel.ANONYMOUS_TIMELINE);

      expect(mockPrisma.case.update).not.toHaveBeenCalled();
    });
  });

  describe('revokeConsent', () => {
    it('deactivates records and recalculates cooperationLevel from remaining active consents', async () => {
      (mockPrisma.consentRecord.updateMany as jest.Mock).mockResolvedValue({});
      (mockPrisma.consentRecord.findMany as jest.Mock).mockResolvedValue([
        { tier: CooperationLevel.ANONYMOUS_TIMELINE },
      ]);
      (mockPrisma.case.update as jest.Mock).mockResolvedValue({});

      await service.revokeConsent('case-1', CooperationLevel.ANONYMOUS_MESSAGING);

      expect(mockPrisma.consentRecord.updateMany).toHaveBeenCalledWith({
        where: { caseId: 'case-1', tier: CooperationLevel.ANONYMOUS_MESSAGING, isActive: true },
        data: { isActive: false, revokedAt: expect.any(Date) },
      });
      expect(mockPrisma.case.update).toHaveBeenCalledWith({
        where: { id: 'case-1' },
        data: { cooperationLevel: CooperationLevel.ANONYMOUS_TIMELINE },
      });
    });

    it('sets cooperationLevel to NONE when no active consents remain', async () => {
      (mockPrisma.consentRecord.updateMany as jest.Mock).mockResolvedValue({});
      (mockPrisma.consentRecord.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.case.update as jest.Mock).mockResolvedValue({});

      await service.revokeConsent('case-1', CooperationLevel.ANONYMOUS_TIMELINE);

      expect(mockPrisma.case.update).toHaveBeenCalledWith({
        where: { id: 'case-1' },
        data: { cooperationLevel: CooperationLevel.NONE },
      });
    });

    it('selects the highest remaining tier when multiple consents are active', async () => {
      (mockPrisma.consentRecord.updateMany as jest.Mock).mockResolvedValue({});
      (mockPrisma.consentRecord.findMany as jest.Mock).mockResolvedValue([
        { tier: CooperationLevel.ANONYMOUS_TIMELINE },
        { tier: CooperationLevel.MUTUAL_INTRODUCTION },
      ]);
      (mockPrisma.case.update as jest.Mock).mockResolvedValue({});

      await service.revokeConsent('case-1', CooperationLevel.SHARED_EVIDENCE_ROOM);

      expect(mockPrisma.case.update).toHaveBeenCalledWith({
        where: { id: 'case-1' },
        data: { cooperationLevel: CooperationLevel.MUTUAL_INTRODUCTION },
      });
    });
  });

  describe('getActiveConsents', () => {
    it('returns active consent records ordered by grantedAt', async () => {
      const records = [{ id: 'cr-1' }, { id: 'cr-2' }];
      (mockPrisma.consentRecord.findMany as jest.Mock).mockResolvedValue(records);

      const result = await service.getActiveConsents('case-1');

      expect(mockPrisma.consentRecord.findMany).toHaveBeenCalledWith({
        where: { caseId: 'case-1', isActive: true },
        orderBy: { grantedAt: 'asc' },
      });
      expect(result).toEqual(records);
    });
  });

  describe('getCooperationLevel', () => {
    it('returns the family cooperationLevel', async () => {
      (mockPrisma.case.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'case-1',
        cooperationLevel: CooperationLevel.ANONYMOUS_MESSAGING,
      });

      const result = await service.getCooperationLevel('case-1');

      expect(result).toBe(CooperationLevel.ANONYMOUS_MESSAGING);
    });
  });
});
