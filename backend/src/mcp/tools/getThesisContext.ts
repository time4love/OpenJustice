import { z } from 'zod';
import { prisma } from '../../lib/prisma';

export const getThesisContextSchema = {
  thesisId: z.string().describe('The Thesis cuid to retrieve'),
};

export async function getThesisContextHandler(input: { thesisId: string }): Promise<string> {
  const thesis = await prisma.thesis.findUnique({
    where: { id: input.thesisId },
    include: {
      headVersion: {
        include: {
          mentions: true,
          gapResolutions: {
            include: { evidence: { select: { summary: true } } },
            orderBy: { gapIndex: 'asc' },
          },
        },
      },
      versions: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          status: true,
          contentHash: true,
          createdAt: true,
          aiAnalysis: true,
        },
      },
    },
  });

  if (!thesis) {
    return JSON.stringify({ error: `No thesis found with id: "${input.thesisId}"` });
  }

  const head = thesis.headVersion;
  if (!head) {
    return JSON.stringify({ error: `Thesis "${input.thesisId}" has no published version yet` });
  }

  // Fetch last session for continuity context
  const lastSession = await prisma.researchSession.findFirst({
    where: { thesisId: input.thesisId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // ACTIVE first, then most recent CLOSED
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });

  // Enrich mentions with referenced evidence summaries
  const evidenceHashes = head.mentions
    .filter((m) => m.type === 'EVIDENCE')
    .map((m) => m.refId);

  const evidenceRecords =
    evidenceHashes.length > 0
      ? await prisma.evidence.findMany({
          where: { fileHash: { in: evidenceHashes } },
          select: {
            fileHash: true,
            summary: true,
            evidenceTier: true,
            evidenceDate: true,
            targetEntity: true,
            sourceUrl: true,
          },
        })
      : [];

  const figureNames = head.mentions
    .filter((m) => m.type === 'KEY_FIGURE')
    .map((m) => m.refId);

  // Cross-reference gap resolutions with current AI analysis gaps
  const aiGaps = (
    (head.aiAnalysis as Record<string, unknown> | null)?.['evidenceGaps'] as
      | { description: string; suggestedSearch: string }[]
      | undefined
  ) ?? [];

  const resolvedGapIndices = new Set(head.gapResolutions.map((r) => r.gapIndex));

  const openGaps = aiGaps
    .map((g, i) => ({ index: i, description: g.description, suggestedSearch: g.suggestedSearch }))
    .filter((g) => !resolvedGapIndices.has(g.index));

  const resolvedGaps = head.gapResolutions.map((r) => ({
    index: r.gapIndex,
    description: aiGaps[r.gapIndex]?.description ?? `Gap #${r.gapIndex + 1}`,
    resolvedBy: r.evidenceId,
    evidenceSummary: r.evidence.summary.slice(0, 120),
  }));

  // Build last session summary
  const lastSessionContext = lastSession
    ? {
        id: lastSession.id,
        name: lastSession.name,
        status: lastSession.status,
        createdAt: lastSession.createdAt,
        closedAt: lastSession.closedAt,
        durationMinutes: Math.round(
          ((lastSession.closedAt ?? new Date()).getTime() - lastSession.createdAt.getTime()) / 60000,
        ),
        summary: {
          versionsCreated: lastSession.events.filter((e) => e.type === 'VERSION_CREATED').length,
          gapsResolved: lastSession.events.filter((e) => e.type === 'GAP_RESOLVED').length,
          aiAnalysesRun: lastSession.events.filter((e) => e.type === 'AI_ANALYSIS_RUN').length,
          notes: lastSession.events.filter((e) => e.type === 'NOTE').length,
        },
        lastNote: lastSession.events.filter((e) => e.type === 'NOTE').at(-1)?.description ?? null,
        recentEvents: lastSession.events.slice(-5).map((e) => ({
          type: e.type,
          description: e.description,
          createdAt: e.createdAt,
        })),
      }
    : null;

  return JSON.stringify({
    thesisId: thesis.id,
    headVersionId: head.id,
    status: head.status,
    content: head.userContent,
    devilsAdvocateCritique: head.aiAnalysis ?? null,
    gapStatus: {
      total: aiGaps.length,
      open: openGaps,
      resolved: resolvedGaps,
    },
    keyFiguresMentioned: figureNames,
    evidenceCited: evidenceRecords,
    versionCount: thesis.versions.length,
    versions: thesis.versions.map((v) => ({
      id: v.id,
      status: v.status,
      createdAt: v.createdAt,
      hasCritique: v.aiAnalysis !== null,
    })),
    lastSession: lastSessionContext,
  });
}
