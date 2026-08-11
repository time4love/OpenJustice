import { CaseVaultService } from '../../src/services/CaseVaultService';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    case: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    caseMember: {
      findUnique: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('CaseVaultService', () => {
  let service: CaseVaultService;

  beforeEach(() => {
    service = new CaseVaultService();
    jest.clearAllMocks();
  });

  describe('createCase', () => {
    it('creates a case with PRIMARY_CONTACT member', async () => {
      const legalCase = { id: 'case-1', publicKeyHex: '0xabc', cooperationLevel: 'NONE' };
      (mockPrisma.case.create as jest.Mock).mockResolvedValue(legalCase);

      const result = await service.createCase({
        publicKeyHex: '0xabc',
        supabaseUserId: 'user-1',
      });

      expect(mockPrisma.case.create).toHaveBeenCalledWith({
        data: {
          publicKeyHex: '0xabc',
          cooperationLevel: 'NONE',
          members: {
            create: { role: 'PRIMARY_CONTACT', supabaseUserId: 'user-1' },
          },
        },
      });
      expect(result).toEqual(legalCase);
    });
  });

  describe('storeEncryptedIntake', () => {
    it('updates encryptedIntakeData on the case', async () => {
      const updated = { id: 'case-1', encryptedIntakeData: 'cipher123' };
      (mockPrisma.case.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.storeEncryptedIntake({
        caseId: 'case-1',
        encryptedIntakeData: 'cipher123',
      });

      expect(mockPrisma.case.update).toHaveBeenCalledWith({
        where: { id: 'case-1' },
        data: { encryptedIntakeData: 'cipher123' },
      });
      expect(result).toEqual(updated);
    });
  });

  describe('getCase', () => {
    it('returns case when found', async () => {
      const legalCase = { id: 'case-1' };
      (mockPrisma.case.findUnique as jest.Mock).mockResolvedValue(legalCase);

      const result = await service.getCase('case-1');

      expect(mockPrisma.case.findUnique).toHaveBeenCalledWith({ where: { id: 'case-1' }, include: { court: true } });
      expect(result).toEqual(legalCase);
    });

    it('returns null when not found', async () => {
      (mockPrisma.case.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getCase('missing');

      expect(result).toBeNull();
    });
  });

  describe('getCaseByMember', () => {
    it('returns case via member lookup', async () => {
      const legalCase = { id: 'case-1' };
      (mockPrisma.caseMember.findUnique as jest.Mock).mockResolvedValue({ legalCase });

      const result = await service.getCaseByMember('user-1');

      expect(mockPrisma.caseMember.findUnique).toHaveBeenCalledWith({
        where: { supabaseUserId: 'user-1' },
        include: { legalCase: true },
      });
      expect(result).toEqual(legalCase);
    });

    it('returns null when member not found', async () => {
      (mockPrisma.caseMember.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getCaseByMember('unknown');

      expect(result).toBeNull();
    });
  });
});
