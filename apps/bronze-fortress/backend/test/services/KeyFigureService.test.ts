import { KeyFigureService, THRESHOLD } from '../../src/services/KeyFigureService';
import { KeyFigureStatus, KeyFigureType } from '../../src/generated/prisma';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    pendingKeyFigure: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    keyFigure: {
      update: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function mockTransaction() {
  (mockPrisma.$transaction as jest.Mock).mockImplementation(
    (cb: (tx: typeof prisma) => Promise<unknown>) => cb(mockPrisma),
  );
}

describe('THRESHOLD', () => {
  it('requires 3 families for all figure types', () => {
    Object.values(KeyFigureType).forEach((type) => {
      expect(THRESHOLD[type]).toBe(3);
    });
  });
});

describe('KeyFigureService', () => {
  let service: KeyFigureService;

  beforeEach(() => {
    service = new KeyFigureService();
    jest.clearAllMocks();
    mockTransaction();
  });

  const baseInput = {
    caseId: 'case-1',
    name: 'ד"ר יוסי כהן',
    type: KeyFigureType.EVALUATOR,
    organization: 'מכון הערכה ירושלים',
  };

  describe('proposeKeyFigure', () => {
    it('creates a new PendingKeyFigure when none exists', async () => {
      (mockPrisma.pendingKeyFigure.findFirst as jest.Mock).mockResolvedValue(null);
      const created = { id: 'pf-1', nominationCount: 1, nominatingFamilyIds: ['case-1'], ...baseInput };
      (mockPrisma.pendingKeyFigure.create as jest.Mock).mockResolvedValue(created);

      const result = await service.proposeKeyFigure(baseInput);

      expect(result.status).toBe('created');
      expect(result.nominationCount).toBe(1);
      expect(result.threshold).toBe(3);
      expect(mockPrisma.pendingKeyFigure.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: baseInput.name,
          type: baseInput.type,
          nominatingFamilyIds: ['case-1'],
          nominationCount: 1,
        }),
      });
    });

    it('increments nominationCount when a different family nominates the same figure', async () => {
      const existing = { id: 'pf-1', nominationCount: 1, nominatingFamilyIds: ['case-1'], ...baseInput };
      (mockPrisma.pendingKeyFigure.findFirst as jest.Mock).mockResolvedValue(existing);
      const updated = { ...existing, nominationCount: 2, nominatingFamilyIds: ['case-1', 'case-2'] };
      (mockPrisma.pendingKeyFigure.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.proposeKeyFigure({ ...baseInput, caseId: 'case-2' });

      expect(result.status).toBe('incremented');
      expect(result.nominationCount).toBe(2);
      expect(mockPrisma.pendingKeyFigure.update).toHaveBeenCalledWith({
        where: { id: 'pf-1' },
        data: {
          nominatingFamilyIds: { push: 'case-2' },
          nominationCount: { increment: 1 },
        },
      });
    });

    it('returns already_nominated when the same family nominates again', async () => {
      const existing = { id: 'pf-1', nominationCount: 1, nominatingFamilyIds: ['case-1'], ...baseInput };
      (mockPrisma.pendingKeyFigure.findFirst as jest.Mock).mockResolvedValue(existing);

      const result = await service.proposeKeyFigure(baseInput);

      expect(result.status).toBe('already_nominated');
      expect(mockPrisma.pendingKeyFigure.update).not.toHaveBeenCalled();
    });

    it('promotes to KeyFigure(PENDING) when threshold is reached', async () => {
      const existing = { id: 'pf-1', nominationCount: 2, nominatingFamilyIds: ['case-1', 'case-2'], ...baseInput };
      (mockPrisma.pendingKeyFigure.findFirst as jest.Mock).mockResolvedValue(existing);
      const atThreshold = { ...existing, nominationCount: 3, nominatingFamilyIds: ['case-1', 'case-2', 'case-3'] };
      (mockPrisma.pendingKeyFigure.update as jest.Mock).mockResolvedValue(atThreshold);
      (mockPrisma.pendingKeyFigure.delete as jest.Mock).mockResolvedValue({});
      const keyFigure = { id: 'kf-1', status: KeyFigureStatus.PENDING, name: baseInput.name };
      (mockPrisma.keyFigure.create as jest.Mock).mockResolvedValue(keyFigure);

      const result = await service.proposeKeyFigure({ ...baseInput, caseId: 'case-3' });

      expect(result.status).toBe('promoted');
      expect(result.keyFigure).toEqual(keyFigure);
      expect(mockPrisma.pendingKeyFigure.delete).toHaveBeenCalledWith({ where: { id: 'pf-1' } });
      expect(mockPrisma.keyFigure.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: KeyFigureStatus.PENDING }),
      });
    });
  });

  describe('activateFigure', () => {
    it('sets status to ACTIVE and records activatedAt', async () => {
      const activated = { id: 'kf-1', status: KeyFigureStatus.ACTIVE };
      (mockPrisma.keyFigure.update as jest.Mock).mockResolvedValue(activated);

      const result = await service.activateFigure('kf-1');

      expect(mockPrisma.keyFigure.update).toHaveBeenCalledWith({
        where: { id: 'kf-1' },
        data: { status: KeyFigureStatus.ACTIVE, activatedAt: expect.any(Date) },
      });
      expect(result).toEqual(activated);
    });
  });

  describe('listPendingFigures', () => {
    it('returns pending figures ordered by nomination count descending', async () => {
      const figures = [{ id: 'pf-1', nominationCount: 2 }, { id: 'pf-2', nominationCount: 1 }];
      (mockPrisma.pendingKeyFigure.findMany as jest.Mock).mockResolvedValue(figures);

      const result = await service.listPendingFigures();

      expect(mockPrisma.pendingKeyFigure.findMany).toHaveBeenCalledWith({
        orderBy: { nominationCount: 'desc' },
      });
      expect(result).toEqual(figures);
    });
  });

  describe('getPendingFiguresAwaitingReview', () => {
    it('returns KeyFigures with PENDING status (threshold met, awaiting legal review)', async () => {
      const figures = [{ id: 'kf-1', status: KeyFigureStatus.PENDING }];
      (mockPrisma.keyFigure.findMany as jest.Mock).mockResolvedValue(figures);

      const result = await service.getPendingFiguresAwaitingReview();

      expect(mockPrisma.keyFigure.findMany).toHaveBeenCalledWith({
        where: { status: KeyFigureStatus.PENDING },
        include: { court: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(figures);
    });
  });
});
