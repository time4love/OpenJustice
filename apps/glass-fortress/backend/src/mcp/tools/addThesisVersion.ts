import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { parseMentions } from '../../utils/parseMentions';
import { buildTipTapDoc, type TipTapNode } from '../../utils/tipTapUtils';
import { sha256, extractPreview } from '../../services/thesisAnalysis';
import { logSessionEvent } from '../../services/sessionService';
import { getResearcherId } from '../../context/researcherContext';
import { loadTrajectoryCitationLabels } from '../../services/trajectoryCitation';
import {
  allCitedHashes,
  allCitedTrajectoryIds,
  citationsSchema,
  trajectoryIdsSchema,
  type CitationInput,
} from './citationInput';

export const addThesisVersionSchema = {
  thesisId: z.string().min(1).describe('ID of the existing thesis to append a version to'),
  body: z.string().min(1).describe(
    'Updated thesis narrative. Supports Markdown formatting: # H1, ## H2, **bold**, *italic*, ' +
    '- bullet lists. Evidence, trajectory and key-figure mentions are appended as chips via ' +
    'evidenceHashes / trajectoryIds / keyFigures, or inline at [^n] markers via citations.',
  ),
  evidenceHashes: z
    .array(z.string())
    .optional()
    .describe(
      'Evidence file hashes (0x…) to link as evidence mention chips. Hashes already covered by ' +
        'a citations entry render inline instead of in a trailing chip list.',
    ),
  trajectoryIds: trajectoryIdsSchema,
  keyFigures: z
    .array(z.string())
    .optional()
    .describe('Key figure names to link as mention chips'),
  citations: citationsSchema,
};

export async function addThesisVersionHandler(input: {
  thesisId: string;
  body: string;
  evidenceHashes?: string[];
  trajectoryIds?: string[];
  keyFigures?: string[];
  citations?: CitationInput[];
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
  const allHashes = allCitedHashes(input.evidenceHashes, citations);
  const evidenceLabelMap = new Map<string, string>(
    allHashes.map((h) => [h, `#ev_${h.slice(0, 10)}`]),
  );

  // Trajectory labels ARE looked up, unlike evidence labels above: a trajectory
  // chip with no claim text is unreadable, and the same read tells us whether
  // the cited ids exist at all.
  const allTrajectoryIds = allCitedTrajectoryIds(input.trajectoryIds, citations);
  const trajectoryLabels = await loadTrajectoryCitationLabels(allTrajectoryIds);
  if (trajectoryLabels.unknown.length > 0) {
    return JSON.stringify({
      error: 'UNKNOWN_TRAJECTORY_ID',
      unknownIds: trajectoryLabels.unknown,
      explanation:
        'These ids match no ClaimTrajectory row, so no version was written. Pass the trajectoryId ' +
        'field from get_claim_trajectories — a claimHash is not citable, because it does not name ' +
        'the detection pass the citation must be pinned to.',
    });
  }

  const userContent: TipTapNode = buildTipTapDoc(
    input.body,
    hashes,
    figures,
    evidenceLabelMap,
    citations,
    { ids: input.trajectoryIds ?? [], labels: trajectoryLabels.labels },
  );
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
    trajectoriesLinked: allTrajectoryIds.length,
    keyFiguresLinked: figures.length,
    message:
      "New version saved as PENDING_AI. Call run_ai_analysis to trigger Devil's Advocate critique.",
  });
}
