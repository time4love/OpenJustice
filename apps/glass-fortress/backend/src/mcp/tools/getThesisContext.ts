import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { publicationState, versionIdForViewer, type Viewer } from '../../lib/thesisView';

export const getThesisContextSchema = {
  thesisId: z.string().describe('The Thesis cuid to retrieve'),
};

// ---------------------------------------------------------------------------
// Viewer-dependent. An anonymous caller gets the PUBLISHED version, or an
// UNPUBLISHED answer; an approved researcher gets the head, the publication
// state, and how far the public is behind. Session context — research notes,
// who did what — is researcher-only.
// ---------------------------------------------------------------------------

export async function getThesisContextHandler(input: { thesisId: string }): Promise<string> {
  const viewer: Viewer = getResearcherId() ? 'RESEARCHER' : 'PUBLIC';

  const thesis = await prisma.thesis.findUnique({
    where: { id: input.thesisId },
    include: {
      publishedBy: { select: { handle: true } },
      versions: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, status: true, contentHash: true, createdAt: true, aiAnalysis: true },
      },
    },
  });

  if (!thesis) {
    return JSON.stringify({ error: `No thesis found with id: "${input.thesisId}"` });
  }

  const publication = publicationState(thesis, thesis.versions);
  const versionId = versionIdForViewer(thesis, viewer);

  if (viewer === 'PUBLIC' && versionId === null) {
    return JSON.stringify({
      thesisId: thesis.id,
      title: thesis.title ?? null,
      viewer,
      status: 'UNPUBLISHED',
      explanation: 'This thesis has not been published. It is visible to approved researchers only.',
    });
  }

  if (versionId === null) {
    return JSON.stringify({
      thesisId: thesis.id,
      title: thesis.title ?? null,
      viewer,
      status: 'NO_VERSION',
      publication,
      explanation: `Thesis "${input.thesisId}" has no version yet.`,
    });
  }

  const version = await prisma.thesisVersion.findUnique({
    where: { id: versionId },
    include: {
      mentions: true,
      gapResolutions: {
        include: { evidence: { select: { summary: true } } },
        orderBy: { gapIndex: 'asc' },
      },
    },
  });
  if (!version) {
    return JSON.stringify({ error: `Version ${versionId} of thesis "${input.thesisId}" is missing — a data defect.` });
  }

  // Enrich mentions with referenced evidence summaries
  const evidenceHashes = version.mentions.filter((m) => m.type === 'EVIDENCE').map((m) => m.refId);

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
            evidenceType: true,
            urlVersionDiff: { select: { trackedUrlId: true } },
          },
        })
      : [];

  const figureNames = version.mentions.filter((m) => m.type === 'KEY_FIGURE').map((m) => m.refId);

  // Cross-reference gap resolutions with this version's AI analysis gaps
  const aiGaps =
    ((version.aiAnalysis as Record<string, unknown> | null)?.['evidenceGaps'] as
      | { description: string; suggestedSearch: string }[]
      | undefined) ?? [];

  const resolvedGapIndices = new Set(version.gapResolutions.map((r) => r.gapIndex));

  const openGaps = aiGaps
    .map((g, i) => ({ index: i, description: g.description, suggestedSearch: g.suggestedSearch }))
    .filter((g) => !resolvedGapIndices.has(g.index));

  const resolvedGaps = version.gapResolutions.map((r) => ({
    index: r.gapIndex,
    description: aiGaps[r.gapIndex]?.description ?? `Gap #${String(r.gapIndex + 1)}`,
    resolvedBy: r.evidenceId,
    evidenceSummary: r.evidence.summary.slice(0, 120),
  }));

  const shared = {
    thesisId: thesis.id,
    title: thesis.title ?? null,
    viewer,
    versionId: version.id,
    status: version.status,
    publicInterestStatement: thesis.publicInterestStatement,
    content: version.userContent,
    devilsAdvocateCritique: version.aiAnalysis ?? null,
    gapStatus: {
      total: aiGaps.length,
      open: openGaps,
      resolved: resolvedGaps,
    },
    keyFiguresMentioned: figureNames,
    evidenceCited: evidenceRecords.map((e) => ({
      fileHash: e.fileHash,
      summary: e.summary,
      evidenceTier: e.evidenceTier,
      evidenceDate: e.evidenceDate,
      targetEntity: e.targetEntity,
      sourceUrl: e.sourceUrl,
      evidenceType: e.evidenceType,
      forensicTimelineUrl: e.urlVersionDiff?.trackedUrlId ? `/forensics/${e.urlVersionDiff.trackedUrlId}` : null,
    })),
  };

  if (viewer === 'PUBLIC') {
    return JSON.stringify({
      ...shared,
      publication: { publishedVersionId: publication.publishedVersionId, publishedAt: publication.publishedAt },
    });
  }

  // Fetch last session for continuity context
  const lastSession = await prisma.researchSession.findFirst({
    where: { thesisId: input.thesisId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // ACTIVE first, then most recent CLOSED
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });

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
    ...shared,
    headVersionId: version.id,
    publication,
    publicationNote: !publication.isPublished
      ? 'DRAFT — not published. The public cannot see this thesis.'
      : publication.headIsPublished
        ? 'The public sees this head version.'
        : `The public is ${String(publication.versionsAhead)} version(s) behind: it sees ${String(publication.publishedVersionId)}, not this head. Publish again to update it.`,
    versionCount: thesis.versions.length,
    versions: thesis.versions.map((v) => ({
      id: v.id,
      status: v.status,
      createdAt: v.createdAt,
      hasCritique: v.aiAnalysis !== null,
      isPublished: v.id === publication.publishedVersionId,
    })),
    lastSession: lastSessionContext,
  });
}
