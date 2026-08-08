import { createHash } from 'crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { parseMentions } from '../../utils/parseMentions';

// ---------------------------------------------------------------------------
// TipTap document builder
//
// Parses Markdown-flavoured body text into proper TipTap nodes so Claude can
// produce richly formatted theses using familiar Markdown syntax:
//
//   # H1  ## H2  ### H3
//   **bold**  *italic*
//   - bullet item
//   1. ordered item
//   blank line = paragraph break
//
// After the body, appends an evidence-mentions paragraph and a key-figure-
// mentions paragraph so citations are embedded as TipTap mention nodes.
// ---------------------------------------------------------------------------

interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: TipTapMark[];
  content?: TipTapNode[];
  text?: string;
}

/** Parse inline Markdown spans (**bold**, *italic*) into TipTap text nodes with marks. */
function parseInline(raw: string): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  // Regex: bold (**…**), italic (*…*), plain text
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|([^*]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    if (match[1] !== undefined) {
      nodes.push({ type: 'text', marks: [{ type: 'bold' }], text: match[1] });
    } else if (match[2] !== undefined) {
      nodes.push({ type: 'text', marks: [{ type: 'italic' }], text: match[2] });
    } else if (match[3] !== undefined) {
      nodes.push({ type: 'text', text: match[3] });
    }
  }
  return nodes;
}

function buildTipTapDoc(body: string, hashes: string[], figures: string[], evidenceLabelMap: Map<string, string>): TipTapNode {
  const nodes: TipTapNode[] = [];
  const lines = body.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Heading
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      nodes.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: parseInline(headingMatch[2]),
      });
      i++;
      continue;
    }

    // Bullet list — collect consecutive bullet lines into one bulletList node
    if (/^[-*]\s+/.test(line)) {
      const listItems: TipTapNode[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        listItems.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(lines[i].replace(/^[-*]\s+/, '')) }],
        });
        i++;
      }
      nodes.push({ type: 'bulletList', content: listItems });
      continue;
    }

    // Ordered list — collect consecutive numbered lines
    if (/^\d+\.\s+/.test(line)) {
      const listItems: TipTapNode[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        listItems.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(lines[i].replace(/^\d+\.\s+/, '')) }],
        });
        i++;
      }
      nodes.push({ type: 'orderedList', attrs: { start: 1 }, content: listItems });
      continue;
    }

    // Blank line — skip (paragraph breaks come from non-blank content separation)
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — accumulate non-special lines until blank or block element
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      nodes.push({
        type: 'paragraph',
        content: parseInline(paraLines.join(' ')),
      });
    }
  }

  // Evidence mentions paragraph (one chip per hash)
  if (hashes.length > 0) {
    nodes.push({
      type: 'paragraph',
      content: hashes.map((hash) => ({
        type: 'evidenceMention',
        attrs: { id: hash, label: evidenceLabelMap.get(hash) ?? `ev_${hash.slice(0, 10)}` },
      })),
    });
  }

  // Key figure mentions paragraph (one chip per name)
  if (figures.length > 0) {
    nodes.push({
      type: 'paragraph',
      content: figures.map((name) => ({
        type: 'keyFigureMention',
        attrs: { id: name, label: name },
      })),
    });
  }

  // TipTap requires at least one node
  if (nodes.length === 0) {
    nodes.push({ type: 'paragraph', content: [] });
  }

  return { type: 'doc', content: nodes };
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
