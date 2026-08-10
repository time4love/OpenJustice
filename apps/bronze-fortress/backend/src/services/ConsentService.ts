import { CooperationLevel, ConsentRecord } from '../generated/prisma';
import { prisma } from '../lib/prisma';

// Ordered tiers — higher index = broader sharing.
// Case.cooperationLevel always reflects the highest active consent.
const TIER_ORDER: CooperationLevel[] = [
  CooperationLevel.NONE,
  CooperationLevel.ANONYMOUS_TIMELINE,
  CooperationLevel.ANONYMOUS_MESSAGING,
  CooperationLevel.MUTUAL_INTRODUCTION,
  CooperationLevel.SHARED_EVIDENCE_ROOM,
];

function highestTier(tiers: CooperationLevel[]): CooperationLevel {
  if (tiers.length === 0) return CooperationLevel.NONE;
  return tiers.reduce((best, tier) =>
    TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(best) ? tier : best,
    CooperationLevel.NONE,
  );
}

export class ConsentService {
  async grantConsent(caseId: string, tier: CooperationLevel): Promise<ConsentRecord> {
    return prisma.$transaction(async (tx) => {
      const record = await tx.consentRecord.create({
        data: { caseId, tier, isActive: true },
      });

      // Elevate cooperationLevel if this tier is higher than the current one.
      const legalCase = await tx.case.findUniqueOrThrow({ where: { id: caseId } });
      if (TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(legalCase.cooperationLevel)) {
        await tx.case.update({
          where: { id: caseId },
          data: { cooperationLevel: tier },
        });
      }

      return record;
    });
  }

  async revokeConsent(caseId: string, tier: CooperationLevel): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.consentRecord.updateMany({
        where: { caseId, tier, isActive: true },
        data: { isActive: false, revokedAt: now },
      });

      // Recalculate cooperationLevel from remaining active consents.
      const active = await tx.consentRecord.findMany({
        where: { caseId, isActive: true },
        select: { tier: true },
      });
      const newLevel = highestTier(active.map((r) => r.tier));
      await tx.case.update({
        where: { id: caseId },
        data: { cooperationLevel: newLevel },
      });
    });
  }

  async getActiveConsents(caseId: string): Promise<ConsentRecord[]> {
    return prisma.consentRecord.findMany({
      where: { caseId, isActive: true },
      orderBy: { grantedAt: 'asc' },
    });
  }

  async getCooperationLevel(caseId: string): Promise<CooperationLevel> {
    const legalCase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    return legalCase.cooperationLevel;
  }
}
