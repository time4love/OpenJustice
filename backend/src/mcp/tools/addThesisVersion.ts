import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { parseMentions } from '../../utils/parseMentions';
import { buildTipTapDoc, type TipTapNode } from '../../utils/tipTapUtils';
import { sha256, extractPreview } from '../../services/thesisAnalysis';
import { logSessionEvent } from '../../services/sessionService';

export const addThesisVersionSchema = {
  thesisId: z.string().min(1).describe('ID of the existing thesis to append a version to'),
  body: z.string().min(1).describe(
    'Updated thesis narrative. Supports Markdown formatting: # H1, ## H2, **bold**, *italic*, ' +
    '- bullet lists. Evidence and key-figure mentions are appended as chips via evidenceHashes / keyFigures.',
  ),
  evidenceHashes: z
    .array(z.string())
    .optional()
    .describe('Evidence file hashes (0x…) to link as evidence mention chips'),
  keyFigures: z
    .array(z.string())
    .optional()
    .describe('Key figure names to link as mention chips'),
};

export async function addThesisVersionHandler(input: {
  thesisId: string;
  body: string;
  evidenceHashes?: string[];
  keyFigures?: string[];
}): Promise<string> {
  const thesis = await prisma.thesis.findUnique({ where: { id: input.thesisId } });
  if (!thesis) {
    return JSON.stringify({ error: `Thesis not found: ${input.thesisId}` });
  }

  const hashes = input.evidenceHashes ?? [];
  const figures = input.keyFigures ?? [];

  const evidenceLabelMap = new Map<string, string>(
    hashes.map((h) => [h, `#ev_${h.slice(0, 10)}`]),
  );

  const userContent: TipTapNode = buildTipTapDoc(input.body, hashes, figures, evidenceLabelMap);
  const mentions = parseMentions(userContent);
  const contentHash = sha256(userContent);
  const parentVersionId = thesis.headVersionId;

  const { version, updatedThesis } = await prisma.$transaction(async (tx) => {
    const version = await tx.thesisVersion.create({
      data: {
        thesisId: input.thesisId,
        parentVersionId,
        userContent: userContent as unknown as Prisma.InputJsonValue,
        contentHash,
        status: 'PENDING_AI',
        mentions: {
          createMany: {
            data: mentions.map((m) => ({ type: m.type, refId: m.refId })),
          },
        },
      },
    });

    const updatedThesis = await tx.thesis.update({
      where: { id: input.thesisId },
      data: { headVersionId: version.id },
    });

    return { version, updatedThesis };
  });

  void logSessionEvent(
    input.thesisId,
    'VERSION_CREATED',
    `New version created: ${extractPreview(userContent)}`,
    version.id,
  );

  return JSON.stringify({
    thesisId: updatedThesis.id,
    headVersionId: version.id,
    parentVersionId: version.parentVersionId ?? null,
    status: version.status,
    mentionsCreated: mentions.length,
    evidenceLinked: hashes.length,
    keyFiguresLinked: figures.length,
    message:
      "New version saved as PENDING_AI. Call run_ai_analysis to trigger Devil's Advocate critique.",
  });
}
