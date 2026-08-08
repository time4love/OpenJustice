import { createHash } from 'crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { parseMentions } from '../../utils/parseMentions';

// ---------------------------------------------------------------------------
// TipTap document builder
//
// Constructs a minimal but valid TipTap JSON document from:
//   - body      : plain-text content (becomes a paragraph node)
//   - hashes    : evidence file hashes (each becomes an evidenceMention node)
//   - figures   : key figure names (each becomes a keyFigureMention node)
//
// The resulting document is valid input for parseMentions() and the existing
// thesis editor — a human can open it in the UI and continue editing.
// ---------------------------------------------------------------------------

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

function buildTipTapDoc(body: string, hashes: string[], figures: string[]): TipTapNode {
  const paragraphs: TipTapNode[] = [];

  // Body text paragraph
  if (body.trim()) {
    paragraphs.push({
      type: 'paragraph',
      content: [{ type: 'text', text: body.trim() }],
    });
  }

  // Evidence mentions paragraph (one per hash)
  if (hashes.length > 0) {
    paragraphs.push({
      type: 'paragraph',
      content: hashes.map((hash) => ({
        type: 'evidenceMention',
        attrs: { id: hash, label: `#ev_${hash.slice(0, 10)}` },
      })),
    });
  }

  // Key figure mentions paragraph (one per name)
  if (figures.length > 0) {
    paragraphs.push({
      type: 'paragraph',
      content: figures.map((name) => ({
        type: 'keyFigureMention',
        attrs: { id: name, label: `@${name}` },
      })),
    });
  }

  // An empty doc must still have at least one paragraph for TipTap validity
  if (paragraphs.length === 0) {
    paragraphs.push({ type: 'paragraph', content: [] });
  }

  return { type: 'doc', content: paragraphs };
}

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

  const userContent = buildTipTapDoc(input.body, hashes, figures);
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
