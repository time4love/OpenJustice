import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { parseMentions } from '../../utils/parseMentions';
import { buildTipTapDoc, type TipTapNode } from '../../utils/tipTapUtils';
import { sha256, extractPreview } from '../../services/thesisAnalysis';
import { logSessionEvent } from '../../services/sessionService';
import { getResearcherId } from '../../context/researcherContext';

export const addThesisVersionSchema = {
  thesisId: z.string().min(1).describe('ID of the existing thesis to append a version to'),
  body: z.string().min(1).describe(
    'Updated thesis narrative. Supports Markdown formatting: # H1, ## H2, **bold**, *italic*, ' +
    '- bullet lists. Evidence and key-figure mentions are appended as chips via evidenceHashes / keyFigures.',
  ),
  evidenceHashes: z
    .array(z.string())
    .optional()
    .describe(
      'Evidence file hashes (0x…) to link as evidence mention chips. Hashes already covered by ' +
        'a citations entry render inline instead of in a trailing chip list.',
    ),
  keyFigures: z
    .array(z.string())
    .optional()
    .describe('Key figure names to link as mention chips'),
  citations: z
    .array(
      z.object({
        id: z.number().int().min(1).describe('Footnote number matching a [^id] marker in body.'),
        fileHashes: z.array(z.string()).min(1).describe('Evidence file hash(es) (0x…) this footnote cites.'),
      }),
    )
    .optional()
    .describe(
      'Per-claim citations for [^n] footnote markers in body — each renders as an inline ' +
        'evidence-mention chip at that exact position instead of a trailing block. Omit for a ' +
        'plain body with no inline citations.',
    ),
};

export async function addThesisVersionHandler(input: {
  thesisId: string;
  body: string;
  evidenceHashes?: string[];
  keyFigures?: string[];
  citations?: { id: number; fileHashes: string[] }[];
}): Promise<string> {
  const thesis = await prisma.thesis.findUnique({ where: { id: input.thesisId } });
  if (!thesis) {
    return JSON.stringify({ error: `Thesis not found: ${input.thesisId}` });
  }

  const hashes = input.evidenceHashes ?? [];
  const figures = input.keyFigures ?? [];
  const citations = input.citations;

  // Union with citation hashes — a caller may cite a hash inline via citations without also
  // listing it in the flat evidenceHashes array. No Prisma lookup here (matches this tool's
  // existing pre-citations behavior) — labels are a short hash-derived placeholder, not the
  // real evidence summary.
  const citationHashes = citations?.flatMap((c) => c.fileHashes) ?? [];
  const allHashes = [...new Set([...hashes, ...citationHashes])];
  const evidenceLabelMap = new Map<string, string>(
    allHashes.map((h) => [h, `#ev_${h.slice(0, 10)}`]),
  );

  const userContent: TipTapNode = buildTipTapDoc(input.body, hashes, figures, evidenceLabelMap, citations);
  const mentions = parseMentions(userContent);
  const contentHash = sha256(userContent);
  const parentVersionId = thesis.headVersionId;

  const researcherId = getResearcherId();

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
        ...(researcherId ? { createdById: researcherId } : {}),
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
    evidenceLinked: allHashes.length,
    keyFiguresLinked: figures.length,
    message:
      "New version saved as PENDING_AI. Call run_ai_analysis to trigger Devil's Advocate critique.",
  });
}
