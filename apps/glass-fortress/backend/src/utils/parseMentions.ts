import { z } from 'zod';
import { MentionType } from '@prisma/client';

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: unknown[];
  text?: string;
}

const TipTapNodeSchema: z.ZodType<TipTapNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(TipTapNodeSchema).optional(),
    marks: z.array(z.unknown()).optional(),
    text: z.string().optional(),
  }),
);

export type ParsedMention = {
  type: MentionType;
  refId: string;
};

const MENTION_NODE_TYPES: Record<string, MentionType> = {
  keyFigureMention: 'KEY_FIGURE',
  evidenceMention: 'EVIDENCE',
  trackedUrlMention: 'TRACKED_URL',
};

function walkNodes(nodes: TipTapNode[], acc: Map<string, ParsedMention>): void {
  for (const node of nodes) {
    const mentionType = MENTION_NODE_TYPES[node.type];
    if (mentionType) {
      const refId = node.attrs?.id;
      if (typeof refId === 'string' && refId.trim() !== '') {
        // Deduplicate by type+refId — a thesis mentioning the same entity
        // twice needs only one ThesisMention row for query purposes.
        const key = `${mentionType}:${refId}`;
        if (!acc.has(key)) {
          acc.set(key, { type: mentionType, refId });
        }
      }
    }
    if (node.content) {
      walkNodes(node.content, acc);
    }
  }
}

/**
 * Extract all @keyFigure / #evidence / #trackedUrl mentions from a TipTap
 * document JSON. Returns deduplicated ParsedMention[] ready to be written
 * to ThesisMention rows (without id/thesisVersionId — caller fills those in).
 *
 * Throws a ZodError if `document` is not a valid TipTap node shape.
 */
export function parseMentions(document: unknown): ParsedMention[] {
  const root = TipTapNodeSchema.parse(document);
  const acc = new Map<string, ParsedMention>();
  walkNodes([root], acc);
  return Array.from(acc.values());
}
