import { createHash } from 'crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { parseMentions } from '../../utils/parseMentions';

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

function buildTipTapDoc(body: string, hashes: string[], figures: string[]): TipTapNode {
  const paragraphs: TipTapNode[] = [];

  if (body.trim()) {
    paragraphs.push({
      type: 'paragraph',
      content: [{ type: 'text', text: body.trim() }],
    });
  }

  if (hashes.length > 0) {
    paragraphs.push({
      type: 'paragraph',
      content: hashes.map((hash) => ({
        type: 'evidenceMention',
        attrs: { id: hash, label: `#ev_${hash.slice(0, 10)}` },
      })),
    });
  }

  if (figures.length > 0) {
    paragraphs.push({
      type: 'paragraph',
      content: figures.map((name) => ({
        type: 'keyFigureMention',
        attrs: { id: name, label: `@${name}` },
      })),
    });
  }

  if (paragraphs.length === 0) {
    paragraphs.push({ type: 'paragraph', content: [] });
  }

  return { type: 'doc', content: paragraphs };
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export const addThesisVersionSchema = {
  thesisId: z.string().min(1).describe('ID of the existing thesis to append a version to'),
  body: z.string().min(1).describe('Updated plain-text thesis narrative'),
  evidenceHashes: z
    .array(z.string())
    .optional()
    .describe('Evidence file hashes (0x…) to link as evidence mentions in this version'),
  keyFigures: z
    .array(z.string())
    .optional()
    .describe('Key figure names to link as mentions in this version'),
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

  const userContent = buildTipTapDoc(input.body, hashes, figures);
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

  return JSON.stringify({
    thesisId: updatedThesis.id,
    headVersionId: version.id,
    parentVersionId: version.parentVersionId ?? null,
    status: version.status,
    mentionsCreated: mentions.length,
    evidenceLinked: hashes.length,
    keyFiguresLinked: figures.length,
    message:
      'New version saved as PENDING_AI. Open it in the UI to trigger Devil\'s Advocate AI analysis.',
  });
}
