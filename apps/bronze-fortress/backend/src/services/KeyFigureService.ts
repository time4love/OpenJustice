import { KeyFigure, KeyFigureStatus, KeyFigureType } from '../generated/prisma';
import { prisma } from '../lib/prisma';

export interface ProposeKeyFigureInput {
  caseId: string;
  name: string;
  type: KeyFigureType;
  organization?: string;
  courtId?: string;
}

export interface ProposeKeyFigureResult {
  status: 'created' | 'incremented' | 'already_nominated';
  keyFigure: KeyFigure;
  nominationCount: number;
}

export class KeyFigureService {
  // A case proposes a key figure from their case documents.
  //
  // Matching: exact name + type + organization. Names come from official documents
  // so exact match is intentional — the legal team can merge duplicates via MCP.
  //
  // Flow: find existing KeyFigure (any status) → if this case hasn't nominated it,
  // add to nominatingCaseIds. If no KeyFigure exists, create one as PENDING.
  // Legal reviewer activates via activate_figure MCP tool — no count threshold.
  async proposeKeyFigure(input: ProposeKeyFigureInput): Promise<ProposeKeyFigureResult> {
    const existing = await prisma.keyFigure.findFirst({
      where: { name: input.name, type: input.type, organization: input.organization ?? null },
    });

    if (existing) {
      if (existing.nominatingCaseIds.includes(input.caseId)) {
        return { status: 'already_nominated', keyFigure: existing, nominationCount: existing.nominatingCaseIds.length };
      }

      const updated = await prisma.keyFigure.update({
        where: { id: existing.id },
        data: { nominatingCaseIds: { push: input.caseId } },
      });

      return { status: 'incremented', keyFigure: updated, nominationCount: updated.nominatingCaseIds.length };
    }

    const created = await prisma.keyFigure.create({
      data: {
        name: input.name,
        type: input.type,
        organization: input.organization,
        courtId: input.courtId,
        nominatingCaseIds: [input.caseId],
        status: KeyFigureStatus.PENDING,
      },
    });

    return { status: 'created', keyFigure: created, nominationCount: 1 };
  }

  // Legal review gate — marks a KeyFigure as ACTIVE and assigns its stable public ID.
  // publicSequence is scoped per type: the next integer after the current max for that type.
  async activateFigure(keyFigureId: string): Promise<KeyFigure> {
    return prisma.$transaction(async (tx) => {
      const figure = await tx.keyFigure.findUniqueOrThrow({ where: { id: keyFigureId } });

      const agg = await tx.keyFigure.aggregate({
        where: { type: figure.type, publicSequence: { not: null } },
        _max: { publicSequence: true },
      });
      const nextSequence = (agg._max.publicSequence ?? 0) + 1;

      return tx.keyFigure.update({
        where: { id: keyFigureId },
        data: { status: KeyFigureStatus.ACTIVE, activatedAt: new Date(), publicSequence: nextSequence },
      });
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
}
