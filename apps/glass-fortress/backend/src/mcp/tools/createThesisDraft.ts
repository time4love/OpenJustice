import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { attachThesisToFraming } from '../../services/thesisFraming';
import { prisma } from '../../lib/prisma';
import { parseMentions } from '../../utils/parseMentions';
import { buildTipTapDoc } from '../../utils/tipTapUtils';
import { getResearcherId } from '../../context/researcherContext';
import { sha256 } from '../../services/thesisAnalysis';

// ---------------------------------------------------------------------------
// Tool schema + handler
// ---------------------------------------------------------------------------

export const createThesisDraftSchema = {
  framingSessionId: z
    .string()
    .optional()
    .describe(
      'The framing session this thesis came out of, from open_thesis_framing. Attaches the debate ' +
        'about WHAT to argue to the thesis it produced — without it, the reasoning that chose this ' +
        'framing is as lost as it was before framing sessions existed.',
    ),
  title: z
    .string()
    .min(1)
    .describe('Short declarative title for the thesis (Hebrew or English).'),
  body: z
    .string()
    .min(1)
    .describe('Plain-text thesis narrative. Can be edited further in the UI.'),
  evidenceHashes: z
    .array(z.string())
    .optional()
    .describe(
      'Evidence file hashes (0x…) to pre-link as evidence mentions. Hashes already covered by ' +
        'a citations entry render inline instead of in a trailing chip list — pass any remaining ' +
        'supporting evidence not tied to a specific footnote here.',
    ),
  keyFigures: z
    .array(z.string())
    .optional()
    .describe('Key figure names to pre-link as mentions (Hebrew or English)'),
  citations: z
    .array(
      z.object({
        id: z.number().int().positive().describe('Footnote number matching a [^id] marker in body.'),
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

export async function createThesisDraftHandler(input: {
  framingSessionId?: string;
  title: string;
  body: string;
  evidenceHashes?: string[];
  keyFigures?: string[];
  citations?: { id: number; fileHashes: string[] }[];
}): Promise<string> {
  const hashes = input.evidenceHashes ?? [];
  const figures = input.keyFigures ?? [];
  const citations = input.citations;

  // Look up evidence summaries so mention chips show readable labels instead of raw hashes.
  // Union with citation hashes — a caller may cite a hash inline via citations without also
  // listing it in the flat evidenceHashes array.
  const citationHashes = citations?.flatMap((c) => c.fileHashes) ?? [];
  const allHashes = [...new Set([...hashes, ...citationHashes])];
  const evidenceRecords = allHashes.length > 0
    ? await prisma.evidence.findMany({
        where: { fileHash: { in: allHashes } },
        select: { fileHash: true, summary: true },
      })
    : [];
  const evidenceLabelMap = new Map(evidenceRecords.map((e) => [e.fileHash, e.summary.slice(0, 40)]));

  const userContent = buildTipTapDoc(input.body, hashes, figures, evidenceLabelMap, citations);
  const mentions = parseMentions(userContent);
  const contentHash = sha256(userContent);

  const researcherId = getResearcherId();

  const { thesis, version } = await prisma.$transaction(async (tx) => {
    const thesis = await tx.thesis.create({
      data: {
        title: input.title,
        ...(researcherId ? { createdById: researcherId } : {}),
      },
    });

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
        ...(researcherId ? { createdById: researcherId } : {}),
      },
    });

    const updatedThesis = await tx.thesis.update({
      where: { id: thesis.id },
      data: { headVersionId: version.id },
    });

    return { thesis: updatedThesis, version };
  });

  // Attach the framing that produced this thesis. Non-fatal by design: a thesis
  // must never fail to save because its provenance record could not be updated.
  if (input.framingSessionId) {
    await attachThesisToFraming(input.framingSessionId, thesis.id);
  }

  return JSON.stringify({
    thesisId: thesis.id,
    framingSessionId: input.framingSessionId ?? null,
    headVersionId: version.id,
    status: version.status,
    mentionsCreated: mentions.length,
    evidenceLinked: allHashes.length,
    keyFiguresLinked: figures.length,
    warning:
      allHashes.length === 0
        ? 'No evidence hashes provided. Theses without evidence citations produce weaker legal arguments. ' +
          'Call suggest_thesis to discover relevant vault evidence, or add hashes via evidenceHashes or citations.'
        : undefined,
    message:
      'Thesis draft saved as PENDING_AI. Open it in the UI to review, edit, and trigger ' +
      'Devil\'s Advocate AI analysis before publishing.',
  });
}
