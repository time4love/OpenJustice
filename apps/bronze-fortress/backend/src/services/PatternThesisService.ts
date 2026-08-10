import { KeyFigureType, PatternCategory } from '../generated/prisma';
import { prisma } from '../lib/prisma';
import { PATTERN_LABELS, DOMAIN_LABELS, PatternLabel } from '../lib/patternLabels';

export interface PatternEvidence {
  patternCategory: PatternCategory;
  label: PatternLabel;
  caseCount: number;
  commitmentHashes: string[];
  onChainTxHashes: string[]; // registered hashes only
  dateRange: {
    earliest: string | null; // ISO date
    latest: string | null;
  };
  courts: string[]; // unique court names where pattern occurred
}

export interface PatternThesis {
  figureId: string;
  figureName: string;
  figureType: KeyFigureType;
  organization: string | null;
  court: string | null;
  activatedAt: Date | null;
  totalCases: number;       // distinct cases with ANY commitment for this figure
  totalCommitments: number; // total commitment records
  onChainCount: number;     // commitments with on-chain tx hash
  byDomain: Record<string, PatternEvidence[]>; // domain → patterns
  legalNote: string;
  generatedAt: Date;
}

export class PatternThesisService {
  // Builds a pattern thesis for an ACTIVE key figure.
  // Returns null if the figure does not exist or is not yet ACTIVE.
  async buildThesis(figureId: string): Promise<PatternThesis | null> {
    const figure = await prisma.keyFigure.findUnique({
      where: { id: figureId },
      include: { court: true },
    });

    if (!figure || figure.status !== 'ACTIVE') return null;

    const commitments = await prisma.commitment.findMany({
      where: { figureId },
      select: {
        caseId: true,
        patternCategory: true,
        commitmentHash: true,
        onChainTxHash: true,
        eventStartDate: true,
        eventEndDate: true,
        court: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by patternCategory
    const grouped = new Map<PatternCategory, typeof commitments>();
    for (const c of commitments) {
      const existing = grouped.get(c.patternCategory) ?? [];
      existing.push(c);
      grouped.set(c.patternCategory, existing);
    }

    const distinctCases = new Set(commitments.map((c) => c.caseId)).size;
    const onChainCount = commitments.filter((c) => c.onChainTxHash !== null).length;

    // Build per-pattern evidence records, grouped by domain
    const byDomain: Record<string, PatternEvidence[]> = {};

    for (const [category, records] of grouped.entries()) {
      const label = PATTERN_LABELS[category];
      const domain = label.domain;

      const dates = records
        .flatMap((r) => [r.eventStartDate, r.eventEndDate])
        .filter((d): d is Date => d !== null);

      const evidence: PatternEvidence = {
        patternCategory: category,
        label,
        caseCount: new Set(records.map((r) => r.caseId)).size,
        commitmentHashes: records.map((r) => r.commitmentHash),
        onChainTxHashes: records
          .map((r) => r.onChainTxHash)
          .filter((h): h is string => h !== null),
        dateRange: {
          earliest: dates.length > 0
            ? dates.reduce((a, b) => (a < b ? a : b)).toISOString().split('T')[0]!
            : null,
          latest: dates.length > 0
            ? dates.reduce((a, b) => (a > b ? a : b)).toISOString().split('T')[0]!
            : null,
        },
        courts: [...new Set(records.map((r) => r.court.name))],
      };

      if (!byDomain[domain]) byDomain[domain] = [];
      byDomain[domain]!.push(evidence);
    }

    return {
      figureId: figure.id,
      figureName: figure.name,
      figureType: figure.type,
      organization: figure.organization,
      court: figure.court?.name ?? null,
      activatedAt: figure.activatedAt,
      totalCases: distinctCases,
      totalCommitments: commitments.length,
      onChainCount,
      byDomain,
      legalNote:
        'Each commitment was independently registered by a separate petitioner before any inter-case connection was established. ' +
        'The on-chain timestamp of each commitment hash precedes any cooperation between cases. ' +
        'No case content, identifiers, or personal information is included in this thesis.',
      generatedAt: new Date(),
    };
  }

  // Returns a list of active figures suitable for the MCP list_active_figures tool.
  async listActiveFigures(): Promise<
    { id: string; name: string; type: KeyFigureType; totalCases: number; court: string | null }[]
  > {
    const figures = await prisma.keyFigure.findMany({
      where: { status: 'ACTIVE' },
      include: {
        court: { select: { name: true } },
        _count: { select: { commitments: true } },
      },
      orderBy: { activatedAt: 'desc' },
    });

    // For each figure, get distinct case count
    const results = await Promise.all(
      figures.map(async (f) => {
        const distinct = await prisma.commitment.findMany({
          where: { figureId: f.id },
          distinct: ['caseId'],
          select: { caseId: true },
        });
        return {
          id: f.id,
          name: f.name,
          type: f.type,
          totalCases: distinct.length,
          court: f.court?.name ?? null,
        };
      }),
    );

    return results;
  }

  // Returns the domain label map for use in formatted output.
  getDomainLabels(): typeof DOMAIN_LABELS {
    return DOMAIN_LABELS;
  }
}
