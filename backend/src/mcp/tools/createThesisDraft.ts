import { createHash } from 'crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { parseMentions } from '../../utils/parseMentions';
import { buildTipTapDoc } from '../../utils/tipTapUtils';

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

// ---------------------------------------------------------------------------
// Tool schema + handler
// ---------------------------------------------------------------------------

export const createThesisDraftSchema = {
  body: z
    .string()
    .min(1)
    .describe('Plain-text thesis narrative. Can be edited further in the UI.'),
  evidenceHashes: z
    .array(z.string())
    .optional()
    .describe('Evidence file hashes (0x…) to pre-link as evidence mentions'),
  keyFigures: z
    .array(z.string())
    .optional()
    .describe('Key figure names to pre-link as mentions (Hebrew or English)'),
};

export async function createThesisDraftHandler(input: {
  body: string;
  evidenceHashes?: string[];
  keyFigures?: string[];
}): Promise<string> {
  const hashes = input.evidenceHashes ?? [];
  const figures = input.keyFigures ?? [];

  // Look up evidence summaries so mention chips show readable labels instead of raw hashes
  const evidenceRecords = hashes.length > 0
    ? await prisma.evidence.findMany({
        where: { fileHash: { in: hashes } },
        select: { fileHash: true, summary: true },
      })
    : [];
  const evidenceLabelMap = new Map(evidenceRecords.map((e) => [e.fileHash, e.summary.slice(0, 40)]));

  const userContent = buildTipTapDoc(input.body, hashes, figures, evidenceLabelMap);
  const mentions = parseMentions(userContent);
  const contentHash = sha256(userContent);

  const { thesis, version } = await prisma.$transaction(async (tx) => {
    const thesis = await tx.thesis.create({ data: {} });

    const version = await tx.thesisVersion.create({
      data: {
        thesisId: thesis.id,
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
      where: { id: thesis.id },
      data: { headVersionId: version.id },
    });

    return { thesis: updatedThesis, version };
  });

  return JSON.stringify({
    thesisId: thesis.id,
    headVersionId: version.id,
    status: version.status,
    mentionsCreated: mentions.length,
    evidenceLinked: hashes.length,
    keyFiguresLinked: figures.length,
    message:
      'Thesis draft saved as PENDING_AI. Open it in the UI to review, edit, and trigger ' +
      'Devil\'s Advocate AI analysis before publishing.',
  });
}
