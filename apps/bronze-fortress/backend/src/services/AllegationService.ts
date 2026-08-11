import crypto from 'crypto';
import { Allegation, PatternCategory } from '../generated/prisma';
import { prisma } from '../lib/prisma';
import { getWeb3Service } from '../lib/web3';

export interface RegisterAllegationInput {
  caseId: string;
  figureId: string;
  courtId: string;
  patternCategory: PatternCategory;
  eventStartDate?: Date;
  eventEndDate?: Date;
}

export interface AllegationRegistration {
  allegation: Allegation;
  isDuplicate: boolean;
}

export interface PatternCount {
  patternCategory: PatternCategory;
  caseCount: number;
}

export interface FigurePatternSummary {
  figureId: string;
  totalCases: number;
  patterns: PatternCount[];
}

// Allegation hash: hash(caseId + "|" + keyFigureId + "|" + patternCategory + "|" + courtId)
//
// caseId IS included — each case registers its own independent on-chain allegation,
// so the timestamp belongs to that case, not to whoever registered first.
// Legal argument: "N independent registrations before any connection."
//
// Quarter/year intentionally excluded — time fragments the count.
// Time context is stored in eventStartDate/eventEndDate for the pattern thesis narrative.
export function buildAllegationHash(
  caseId: string,
  figureId: string,
  patternCategory: PatternCategory,
  courtId: string,
): string {
  return crypto
    .createHash('sha256')
    .update(`${caseId}|${figureId}|${patternCategory}|${courtId}`)
    .digest('hex');
}

async function registerOnChainFireAndForget(allegationId: string, allegationHash: string): Promise<void> {
  const web3 = getWeb3Service();
  if (!web3) return;
  try {
    const txHash = await web3.registerCommitmentHash(allegationHash);
    await prisma.allegation.update({
      where: { id: allegationId },
      data: { onChainTxHash: txHash },
    });
  } catch (err) {
    console.error(
      `[BF Web3] Failed to register allegation ${allegationId} on-chain:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export class AllegationService {
  // Idempotent — returns existing record without error if this case already
  // registered this exact allegation. Prevents double-counting.
  async registerAllegation(input: RegisterAllegationInput): Promise<AllegationRegistration> {
    const allegationHash = buildAllegationHash(
      input.caseId,
      input.figureId,
      input.patternCategory,
      input.courtId,
    );

    const existing = await prisma.allegation.findUnique({
      where: { allegationHash },
    });
    if (existing) {
      return { allegation: existing, isDuplicate: true };
    }

    const allegation = await prisma.allegation.create({
      data: {
        caseId: input.caseId,
        figureId: input.figureId,
        courtId: input.courtId,
        patternCategory: input.patternCategory,
        allegationHash,
        eventStartDate: input.eventStartDate,
        eventEndDate: input.eventEndDate,
      },
    });

    // Fire-and-forget: register on-chain after DB save.
    // Non-blocking — DB record is the source of truth; tx hash is enrichment.
    void registerOnChainFireAndForget(allegation.id, allegation.allegationHash);

    return { allegation, isDuplicate: false };
  }

  // Returns aggregate pattern counts for a key figure — no case content exposed.
  // "34 independent cases registered this pattern."
  async getFigurePatternSummary(figureId: string): Promise<FigurePatternSummary> {
    const grouped = await prisma.allegation.groupBy({
      by: ['patternCategory'],
      where: { figureId },
      _count: { caseId: true },
    });

    const patterns: PatternCount[] = grouped.map((row) => ({
      patternCategory: row.patternCategory,
      caseCount: row._count.caseId,
    }));

    const distinctCases = await prisma.allegation.findMany({
      where: { figureId },
      distinct: ['caseId'],
      select: { caseId: true },
    });

    return {
      figureId,
      totalCases: distinctCases.length,
      patterns,
    };
  }

  // Count of independent cases that registered a specific pattern for a figure.
  async getPatternCount(figureId: string, patternCategory: PatternCategory): Promise<number> {
    const result = await prisma.allegation.groupBy({
      by: ['caseId'],
      where: { figureId, patternCategory },
    });
    return result.length;
  }

  // Batch version: returns counts for all (figureId, patternCategory) combinations
  // observed across a set of figures. Key format: "${figureId}:${patternCategory}".
  // One DB query regardless of how many figures/patterns are in the set.
  async getPatternCountsByFigure(figureIds: string[]): Promise<Map<string, number>> {
    if (figureIds.length === 0) return new Map();
    const rows = await prisma.allegation.groupBy({
      by: ['figureId', 'patternCategory'],
      where: { figureId: { in: figureIds } },
      _count: { id: true },
    });
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(`${row.figureId}:${row.patternCategory}`, row._count.id);
    }
    return map;
  }

  async updateOnChainTxHash(allegationId: string, txHash: string): Promise<void> {
    await prisma.allegation.update({
      where: { id: allegationId },
      data: { onChainTxHash: txHash },
    });
  }
}
