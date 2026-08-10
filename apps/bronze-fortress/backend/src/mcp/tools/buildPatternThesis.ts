import { z } from 'zod';
import { PatternThesisService } from '../../services/PatternThesisService';

export const buildPatternThesisSchema = {
  figureId: z.string().describe('ID of an ACTIVE KeyFigure to build the pattern thesis for'),
};

const service = new PatternThesisService();

export async function buildPatternThesisHandler(input: { figureId: string }): Promise<string> {
  const thesis = await service.buildThesis(input.figureId);

  if (!thesis) {
    return JSON.stringify({
      error: `No active figure found for ID ${input.figureId}. The figure must exist and have ACTIVE status.`,
    });
  }

  const domainLabels = service.getDomainLabels();

  // Format each domain section
  const domainSections = Object.entries(thesis.byDomain)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, patterns]) => ({
      domain,
      domainLabel: domainLabels[domain],
      patterns: patterns.map((p) => ({
        category: p.patternCategory,
        labelHe: p.label.he,
        labelEn: p.label.en,
        caseCount: p.caseCount,
        dateRange: p.dateRange,
        courts: p.courts,
        commitmentHashes: p.commitmentHashes,
        onChainRegistered: p.onChainTxHashes.length,
        onChainTxHashes: p.onChainTxHashes,
      })),
    }));

  return JSON.stringify({
    thesis: {
      figureId: thesis.figureId,
      figureName: thesis.figureName,
      figureType: thesis.figureType,
      organization: thesis.organization,
      court: thesis.court,
      activatedAt: thesis.activatedAt,
      summary: {
        totalCases: thesis.totalCases,
        totalCommitments: thesis.totalCommitments,
        onChainRegistered: thesis.onChainCount,
        domainsAffected: Object.keys(thesis.byDomain).length,
        patternsDocumented: Object.values(thesis.byDomain).flat().length,
      },
      domainSections,
      legalNote: thesis.legalNote,
      generatedAt: thesis.generatedAt,
    },
  }, null, 2);
}
