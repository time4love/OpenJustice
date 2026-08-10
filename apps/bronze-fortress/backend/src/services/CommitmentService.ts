import crypto from 'crypto';
import { Commitment, PatternCategory } from '../generated/prisma';
import { prisma } from '../lib/prisma';
import { getWeb3Service } from '../lib/web3';

export interface RegisterCommitmentInput {
  caseId: string;
  figureId: string;
  courtId: string;
  patternCategory: PatternCategory;
  eventStartDate?: Date;
  eventEndDate?: Date;
}

export interface CommitmentRegistration {
  commitment: Commitment;
  isDuplicate: boolean;
}

export interface PatternCount {
  patternCategory: PatternCategory;
  familyCount: number;
}

export interface FigurePatternSummary {
  figureId: string;
  totalFamilies: number;
  patterns: PatternCount[];
}

// Commitment hash: hash(keyFigureId + "|" + patternCategory + "|" + courtId)
//
// Quarter/year is intentionally excluded — including time fragments the count.
// "47 families" is a stronger legal argument than fragmented quarterly buckets.
// Time context is stored in eventStartDate/eventEndDate and used in the pattern
// thesis narrative, not as a filter in the hash.
export function buildCommitmentHash(
  figureId: string,
  patternCategory: PatternCategory,
  courtId: string,
): string {
  return crypto
    .createHash('sha256')
    .update(`${figureId}|${patternCategory}|${courtId}`)
    .digest('hex');
}

async function registerOnChainFireAndForget(commitmentId: string, commitmentHash: string): Promise<void> {
  const web3 = getWeb3Service();
  if (!web3) return;
  try {
    const txHash = await web3.registerCommitmentHash(commitmentHash);
    await prisma.commitment.update({
      where: { id: commitmentId },
      data: { onChainTxHash: txHash },
    });
  } catch (err) {
    console.error(
      `[BF Web3] Failed to register commitment ${commitmentId} on-chain:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export class CommitmentService {
  // Idempotent — returns existing record without error if this family already
  // registered this exact commitment. Prevents double-counting.
  async registerCommitment(input: RegisterCommitmentInput): Promise<CommitmentRegistration> {
    const commitmentHash = buildCommitmentHash(
      input.figureId,
      input.patternCategory,
      input.courtId,
    );

    const existing = await prisma.commitment.findUnique({
      where: { commitmentHash },
    });
    if (existing) {
      return { commitment: existing, isDuplicate: true };
    }

    const commitment = await prisma.commitment.create({
      data: {
        caseId: input.caseId,
        figureId: input.figureId,
        courtId: input.courtId,
        patternCategory: input.patternCategory,
        commitmentHash,
        eventStartDate: input.eventStartDate,
        eventEndDate: input.eventEndDate,
      },
    });

    // Fire-and-forget: register on-chain after DB save.
    // Non-blocking — DB record is the source of truth; tx hash is enrichment.
    void registerOnChainFireAndForget(commitment.id, commitment.commitmentHash);

    return { commitment, isDuplicate: false };
  }

  // Returns aggregate pattern counts for a key figure — no family content exposed.
  // This is the public-facing layer: "34 families independently registered this pattern."
  async getFigurePatternSummary(figureId: string): Promise<FigurePatternSummary> {
    const grouped = await prisma.commitment.groupBy({
      by: ['patternCategory'],
      where: { figureId },
      _count: { caseId: true },
    });

    const patterns: PatternCount[] = grouped.map((row) => ({
      patternCategory: row.patternCategory,
      familyCount: row._count.caseId,
    }));

    const distinctCases = await prisma.commitment.findMany({
      where: { figureId },
      distinct: ['caseId'],
      select: { caseId: true },
    });

    return {
      figureId,
      totalFamilies: distinctCases.length,
      patterns,
    };
  }

  // Count of independent families that registered a specific pattern for a figure.
  // Used to check activation threshold (3 families → key figure becomes ACTIVE).
  async getPatternCount(figureId: string, patternCategory: PatternCategory): Promise<number> {
    const result = await prisma.commitment.groupBy({
      by: ['caseId'],
      where: { figureId, patternCategory },
    });
    return result.length;
  }

  async updateOnChainTxHash(commitmentId: string, txHash: string): Promise<void> {
    await prisma.commitment.update({
      where: { id: commitmentId },
      data: { onChainTxHash: txHash },
    });
  }
}
