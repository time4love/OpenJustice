import { KeyFigureService } from '../../src/services/KeyFigureService';
import { KeyFigureStatus, KeyFigureType } from '../../src/generated/prisma';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    keyFigure: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function mockTransaction() {
  (mockPrisma.$transaction as jest.Mock).mockImplementation(
    (cb: (tx: typeof prisma) => Promise<unknown>) => cb(mockPrisma),
  );
}

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
    it('creates a new KeyFigure(PENDING) when none exists', async () => {
      (mockPrisma.keyFigure.findFirst as jest.Mock).mockResolvedValue(null);
      const created = {
        id: 'kf-1',
        status: KeyFigureStatus.PENDING,
        nominatingCaseIds: ['case-1'],
        ...baseInput,
      };
      (mockPrisma.keyFigure.create as jest.Mock).mockResolvedValue(created);

      const result = await service.proposeKeyFigure(baseInput);

      expect(result.status).toBe('created');
      expect(result.nominationCount).toBe(1);
      expect(result.keyFigure).toEqual(created);
      expect(mockPrisma.keyFigure.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: baseInput.name,
          type: baseInput.type,
          status: KeyFigureStatus.PENDING,
          nominatingCaseIds: ['case-1'],
        }),
      });
    });

    it('increments nominatingCaseIds when a different case nominates the same figure', async () => {
      const existing = {
        id: 'kf-1',
        status: KeyFigureStatus.PENDING,
        nominatingCaseIds: ['case-1'],
        ...baseInput,
      };
      (mockPrisma.keyFigure.findFirst as jest.Mock).mockResolvedValue(existing);
      const updated = { ...existing, nominatingCaseIds: ['case-1', 'case-2'] };
      (mockPrisma.keyFigure.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.proposeKeyFigure({ ...baseInput, caseId: 'case-2' });

      expect(result.status).toBe('incremented');
      expect(result.nominationCount).toBe(2);
      expect(mockPrisma.keyFigure.update).toHaveBeenCalledWith({
        where: { id: 'kf-1' },
        data: { nominatingCaseIds: { push: 'case-2' } },
      });
    });

    it('returns already_nominated when the same case nominates again', async () => {
      const existing = {
        id: 'kf-1',
        status: KeyFigureStatus.PENDING,
        nominatingCaseIds: ['case-1'],
        ...baseInput,
      };
      (mockPrisma.keyFigure.findFirst as jest.Mock).mockResolvedValue(existing);

      const result = await service.proposeKeyFigure(baseInput);

      expect(result.status).toBe('already_nominated');
      expect(mockPrisma.keyFigure.update).not.toHaveBeenCalled();
    });
  });

  describe('activateFigure', () => {
    it('sets status to ACTIVE, assigns publicSequence, and records activatedAt', async () => {
      const pending = { id: 'kf-1', type: KeyFigureType.EVALUATOR, status: KeyFigureStatus.PENDING };
      (mockPrisma.keyFigure.findUniqueOrThrow as jest.Mock).mockResolvedValue(pending);
      (mockPrisma.keyFigure.aggregate as jest.Mock).mockResolvedValue({ _max: { publicSequence: 2 } });
      const activated = { ...pending, status: KeyFigureStatus.ACTIVE, publicSequence: 3 };
      (mockPrisma.keyFigure.update as jest.Mock).mockResolvedValue(activated);

      const result = await service.activateFigure('kf-1');

      expect(mockPrisma.keyFigure.aggregate).toHaveBeenCalledWith({
        where: { type: KeyFigureType.EVALUATOR, publicSequence: { not: null } },
        _max: { publicSequence: true },
      });
      expect(mockPrisma.keyFigure.update).toHaveBeenCalledWith({
        where: { id: 'kf-1' },
        data: { status: KeyFigureStatus.ACTIVE, activatedAt: expect.any(Date), publicSequence: 3 },
      });
      expect(result).toEqual(activated);
    });

    it('assigns publicSequence 1 when no active figures of that type exist yet', async () => {
      const pending = { id: 'kf-1', type: KeyFigureType.SOCIAL_WORKER, status: KeyFigureStatus.PENDING };
      (mockPrisma.keyFigure.findUniqueOrThrow as jest.Mock).mockResolvedValue(pending);
      (mockPrisma.keyFigure.aggregate as jest.Mock).mockResolvedValue({ _max: { publicSequence: null } });
      const activated = { ...pending, status: KeyFigureStatus.ACTIVE, publicSequence: 1 };
      (mockPrisma.keyFigure.update as jest.Mock).mockResolvedValue(activated);

      const result = await service.activateFigure('kf-1');

      expect(mockPrisma.keyFigure.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ publicSequence: 1 }) }),
      );
      expect(result.publicSequence).toBe(1);
    });
  });

  describe('getPendingFiguresAwaitingReview', () => {
    it('returns KeyFigures with PENDING status ordered by createdAt', async () => {
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
