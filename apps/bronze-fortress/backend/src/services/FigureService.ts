import { KeyFigure, KeyFigureType, PatternCategory, Court } from '../generated/prisma';
import { prisma } from '../lib/prisma';
import { PatternDetectionService, PatternSuggestion } from './PatternDetectionService';
import { AllegationService } from './AllegationService';

export class NoCaseCourtError extends Error {
  constructor(caseId: string) {
    super(`Case ${caseId} has no court set — set it via the dashboard before nominating figures`);
    this.name = 'NoCaseCourtError';
  }
}

export interface NominateInput {
  name: string;
  type: KeyFigureType;
  organization?: string;
}

export interface NominationResult {
  figure: KeyFigure;
  court: Court;
  patterns: PatternSuggestion[];
  newAllegationsCreated: number;
}

export interface PublicPatternRow {
  figureId: string;
  figurePublicSequence: number;
  figureType: KeyFigureType;
  courtName: string;
  courtCity: string;
  patternCategory: PatternCategory;
  caseCount: number;
}

const patternService = new PatternDetectionService();
const allegationService = new AllegationService();

export class FigureService {
  // ---------------------------------------------------------------------------
  // Find or create a KeyFigure by name + type + courtId.
  // Creates with status PENDING — legal review gate controls activation.
  // ---------------------------------------------------------------------------
  private async findOrCreateFigure(
    name: string,
    type: KeyFigureType,
    organization: string | undefined,
    courtId: string,
    caseId: string,
  ): Promise<KeyFigure> {
    const existing = await prisma.keyFigure.findFirst({
      where: { name, type, courtId },
    });
    if (existing) {
      if (existing.nominatingCaseIds.includes(caseId)) return existing;
      return prisma.keyFigure.update({
        where: { id: existing.id },
        data: { nominatingCaseIds: { push: caseId } },
      });
    }
    return prisma.keyFigure.create({
      data: { name, type, organization, courtId, nominatingCaseIds: [caseId] },
    });
  }

  // ---------------------------------------------------------------------------
  // Core nomination flow:
  //   1. Read court from the case (set once at case level)
  //   2. Find or create KeyFigure
  //   3. Run pattern detection on the case's structured intake
  //   4. Register Allegations for newly detected patterns (idempotent)
  // ---------------------------------------------------------------------------
  async nominateAndCommit(caseId: string, input: NominateInput): Promise<NominationResult> {
    const legalCase = await prisma.case.findUnique({
      where: { id: caseId },
      select: { courtId: true },
    });

    if (!legalCase?.courtId) {
      throw new NoCaseCourtError(caseId);
    }

    const court = await prisma.court.findUniqueOrThrow({ where: { id: legalCase.courtId } });
    const figure = await this.findOrCreateFigure(
      input.name,
      input.type,
      input.organization,
      court.id,
      caseId,
    );

    const detection = await patternService.suggestAllegations(caseId, figure.id, court.id);

    const newPatterns = detection.suggestions.filter((s) => !s.alreadyRegistered);
    await Promise.all(
      newPatterns.map((s) =>
        allegationService.registerAllegation({
          caseId,
          figureId: figure.id,
          courtId: court.id,
          patternCategory: s.patternCategory,
        }),
      ),
    );

    return {
      figure,
      court,
      patterns: detection.suggestions,
      newAllegationsCreated: newPatterns.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Public aggregation — no case identity, no case content, no real names.
  // Only ACTIVE figures are included. Figures are identified by publicSequence.
  // ---------------------------------------------------------------------------
  async getPublicPatternCounts(): Promise<PublicPatternRow[]> {
    const grouped = await prisma.allegation.groupBy({
      by: ['figureId', 'patternCategory', 'courtId'],
      _count: { caseId: true },
    });

    if (grouped.length === 0) return [];

    const figureIds = [...new Set(grouped.map((r) => r.figureId))];
    const courtIds = [...new Set(grouped.map((r) => r.courtId))];

    const [figures, courts] = await Promise.all([
      prisma.keyFigure.findMany({
        where: { id: { in: figureIds }, status: 'ACTIVE', publicSequence: { not: null } },
      }),
      prisma.court.findMany({ where: { id: { in: courtIds } } }),
    ]);

    const figureMap = new Map(figures.map((f) => [f.id, f]));
    const courtMap = new Map(courts.map((c) => [c.id, c]));

    return grouped
      .map((row) => {
        const figure = figureMap.get(row.figureId);
        const court = courtMap.get(row.courtId);
        if (!figure || !court || figure.publicSequence === null) return null;
        return {
          figureId: figure.id,
          figurePublicSequence: figure.publicSequence,
          figureType: figure.type,
          courtName: court.name,
          courtCity: court.city,
          patternCategory: row.patternCategory,
          caseCount: row._count.caseId,
        };
      })
      .filter((r): r is PublicPatternRow => r !== null);
  }
}
