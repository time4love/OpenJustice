import { KeyFigure, KeyFigureStatus, KeyFigureType, PendingKeyFigure } from '../generated/prisma';
import { prisma } from '../lib/prisma';

export interface ProposeKeyFigureInput {
  caseId: string;
  name: string;
  type: KeyFigureType;
  organization?: string;
  courtId?: string;
}

export interface ProposeKeyFigureResult {
  status: 'created' | 'incremented' | 'promoted' | 'already_nominated';
  pendingFigure?: PendingKeyFigure;
  keyFigure?: KeyFigure;
  nominationCount: number;
  threshold: number;
}

// Activation thresholds per figure type.
// Judges and court-appointed professionals: 3 independent families.
// Evaluators: 3 (court-appointed by default; private contractor threshold handled
// when that distinction is added to the schema).
// Source: BRONZE_FORTRESS.md § Activation threshold rules.
const THRESHOLD: Record<KeyFigureType, number> = {
  [KeyFigureType.JUDGE]: 3,
  [KeyFigureType.SOCIAL_WORKER]: 3,
  [KeyFigureType.EVALUATOR]: 3,
  [KeyFigureType.GUARDIAN_AD_LITEM]: 3,
  [KeyFigureType.YOUTH_PROBATION]: 3,
  [KeyFigureType.OTHER]: 3,
};

export class KeyFigureService {
  // A family proposes a key figure from their case documents.
  //
  // Matching: exact name + type + organization. Names come from official documents
  // so exact match is intentional — the legal team can merge duplicates via MCP.
  //
  // Flow:
  //   1. Family has not nominated this figure before → add to nominatingFamilyIds
  //   2. nominationCount reaches threshold → promote: delete PendingKeyFigure,
  //      create KeyFigure(PENDING) — still needs legal review before going ACTIVE
  async proposeKeyFigure(input: ProposeKeyFigureInput): Promise<ProposeKeyFigureResult> {
    const threshold = THRESHOLD[input.type];

    const existing = await prisma.pendingKeyFigure.findFirst({
      where: { name: input.name, type: input.type, organization: input.organization ?? null },
    });

    if (existing) {
      if (existing.nominatingFamilyIds.includes(input.caseId)) {
        return { status: 'already_nominated', pendingFigure: existing, nominationCount: existing.nominationCount, threshold };
      }

      const updated = await prisma.pendingKeyFigure.update({
        where: { id: existing.id },
        data: {
          nominatingFamilyIds: { push: input.caseId },
          nominationCount: { increment: 1 },
        },
      });

      if (updated.nominationCount >= threshold) {
        const keyFigure = await this._promote(updated);
        return { status: 'promoted', keyFigure, nominationCount: updated.nominationCount, threshold };
      }

      return { status: 'incremented', pendingFigure: updated, nominationCount: updated.nominationCount, threshold };
    }

    const created = await prisma.pendingKeyFigure.create({
      data: {
        name: input.name,
        type: input.type,
        organization: input.organization,
        courtId: input.courtId,
        nominatingFamilyIds: [input.caseId],
        nominationCount: 1,
      },
    });

    return { status: 'created', pendingFigure: created, nominationCount: 1, threshold };
  }

  // Legal review gate — marks a KeyFigure as ACTIVE, making it visible to families
  // and queryable in pattern theses. Only the legal team may call this.
  async activateFigure(keyFigureId: string): Promise<KeyFigure> {
    return prisma.keyFigure.update({
      where: { id: keyFigureId },
      data: { status: KeyFigureStatus.ACTIVE, activatedAt: new Date() },
    });
  }

  async listPendingFigures(): Promise<PendingKeyFigure[]> {
    return prisma.pendingKeyFigure.findMany({
      orderBy: { nominationCount: 'desc' },
    });
  }

  async listActiveFigures(): Promise<KeyFigure[]> {
    return prisma.keyFigure.findMany({
      where: { status: KeyFigureStatus.ACTIVE },
      include: { court: true },
      orderBy: { activatedAt: 'desc' },
    });
  }

  async getPendingFiguresAwaitingReview(): Promise<KeyFigure[]> {
    return prisma.keyFigure.findMany({
      where: { status: KeyFigureStatus.PENDING },
      include: { court: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Promotes a PendingKeyFigure to KeyFigure(PENDING) in a transaction.
  // The KeyFigure starts as PENDING — legal review required before ACTIVE.
  private async _promote(pending: PendingKeyFigure): Promise<KeyFigure> {
    return prisma.$transaction(async (tx) => {
      await tx.pendingKeyFigure.delete({ where: { id: pending.id } });
      return tx.keyFigure.create({
        data: {
          name: pending.name,
          type: pending.type,
          organization: pending.organization,
          courtId: pending.courtId,
          status: KeyFigureStatus.PENDING,
        },
      });
    });
  }
}

export { THRESHOLD };
