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

  return JSON.stringify({
    thesisId: thesis.id,
    headVersionId: head.id,
    status: head.status,
    content: head.userContent,
    devilsAdvocateCritique: head.aiAnalysis ?? null,
    keyFiguresMentioned: figureNames,
    evidenceCited: evidenceRecords,
    versionCount: thesis.versions.length,
    versions: thesis.versions.map((v) => ({
      id: v.id,
      status: v.status,
      createdAt: v.createdAt,
      hasCritique: v.aiAnalysis !== null,
    })),
  });
}
