import { StructuredIntakeService } from '../../src/services/StructuredIntakeService';
import { PoliceCaseStatus, NzakutOrderType } from '../../src/generated/prisma';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    criminalComplaint: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    nzakutOrder: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('StructuredIntakeService', () => {
  let service: StructuredIntakeService;

  beforeEach(() => {
    service = new StructuredIntakeService();
    jest.clearAllMocks();
  });

  // ── Domain A — CriminalComplaint ─────────────────────────────────────────

  describe('addCriminalComplaint', () => {
    const complaintData = {
      policeStatus: PoliceCaseStatus.CLOSED_CLEARED,
      closureConsideredByCourt: false,
      custodyChangedAfterClosure: 'worsened' as const,
    };

    it('creates a complaint record with minimal required fields', async () => {
      const expected = { id: 'cmp-1', caseId: 'case-1', ...complaintData, createdAt: new Date() };
      (mockPrisma.criminalComplaint.create as jest.Mock).mockResolvedValue(expected);

      const result = await service.addCriminalComplaint('case-1', complaintData);

      expect(mockPrisma.criminalComplaint.create).toHaveBeenCalledWith({
        data: { caseId: 'case-1', ...complaintData },
      });
      expect(result).toBe(expected);
    });

    it('passes optional date fields through', async () => {
      const withDates = {
        ...complaintData,
        complaintDate: new Date('2022-03-01'),
        closureDate: new Date('2022-09-01'),
      };
      (mockPrisma.criminalComplaint.create as jest.Mock).mockResolvedValue({});

      await service.addCriminalComplaint('case-1', withDates);

      expect(mockPrisma.criminalComplaint.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          complaintDate: withDates.complaintDate,
          closureDate: withDates.closureDate,
        }),
      });
    });
  });

  describe('listCriminalComplaints', () => {
    it('returns complaints ordered by createdAt asc', async () => {
      const records = [{ id: 'cmp-1' }, { id: 'cmp-2' }];
      (mockPrisma.criminalComplaint.findMany as jest.Mock).mockResolvedValue(records);

      const result = await service.listCriminalComplaints('case-1');

      expect(mockPrisma.criminalComplaint.findMany).toHaveBeenCalledWith({
        where: { caseId: 'case-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toBe(records);
    });
  });

  // ── Domain B — NzakutOrder ───────────────────────────────────────────────

  describe('addNzakutOrder', () => {
    const orderData = {
      orderType: NzakutOrderType.EMERGENCY,
      evidentiaryHearingHeld: false,
      daysWithoutMeritsHearing: 420,
    };

    it('creates a nzakut order record', async () => {
      const expected = { id: 'nz-1', caseId: 'case-1', ...orderData, createdAt: new Date() };
      (mockPrisma.nzakutOrder.create as jest.Mock).mockResolvedValue(expected);

      const result = await service.addNzakutOrder('case-1', orderData);

      expect(mockPrisma.nzakutOrder.create).toHaveBeenCalledWith({
        data: { caseId: 'case-1', ...orderData },
      });
      expect(result).toBe(expected);
    });

    it('passes optional date and location fields through', async () => {
      const withExtras = {
        ...orderData,
        childrenLocation: 'other_parent' as const,
        orderDate: new Date('2023-01-15'),
      };
      (mockPrisma.nzakutOrder.create as jest.Mock).mockResolvedValue({});

      await service.addNzakutOrder('case-1', withExtras);

      expect(mockPrisma.nzakutOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          childrenLocation: 'other_parent',
          orderDate: withExtras.orderDate,
        }),
      });
    });
  });

  describe('listNzakutOrders', () => {
    it('returns orders ordered by createdAt asc', async () => {
      const records = [{ id: 'nz-1' }, { id: 'nz-2' }];
      (mockPrisma.nzakutOrder.findMany as jest.Mock).mockResolvedValue(records);

      const result = await service.listNzakutOrders('case-1');

      expect(mockPrisma.nzakutOrder.findMany).toHaveBeenCalledWith({
        where: { caseId: 'case-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toBe(records);
    });
  });
});
