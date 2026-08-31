import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { linkThesisToFraming } from '../../services/thesisFraming';
import { prisma } from '../../lib/prisma';
import { parseMentions } from '../../utils/parseMentions';
import { buildTipTapDoc } from '../../utils/tipTapUtils';
import { getResearcherId } from '../../context/researcherContext';
import { sha256 } from '../../services/thesisAnalysis';
import { loadTrajectoryCitationLabels } from '../../services/trajectoryCitation';
import {
  allCitedHashes,
  allCitedTrajectoryIds,
  citationsSchema,
  trajectoryIdsSchema,
  type CitationInput,
} from './citationInput';

// ---------------------------------------------------------------------------
// Tool schema + handler
// ---------------------------------------------------------------------------

export const createThesisDraftSchema = {
  framingSessionId: z
    .string()
    .optional()
    .describe(
      'OVERRIDE ONLY — normally omit this. The framing session is DERIVED from the single ACTIVE ' +
        'session that has no thesis yet, so the debate about WHAT to argue is attached to the thesis ' +
        'it produced whether or not the caller remembers to say so. Pass an id only to link a ' +
        'different session than the active one. The result always reports which session was linked, ' +
        'or why none was.',
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
  trajectoryIds: trajectoryIdsSchema,
  keyFigures: z
    .array(z.string())
    .optional()
    .describe('Key figure names to pre-link as mentions (Hebrew or English)'),
  citations: citationsSchema,
};

export async function createThesisDraftHandler(input: {
  framingSessionId?: string;
  title: string;
  body: string;
  evidenceHashes?: string[];
  trajectoryIds?: string[];
  keyFigures?: string[];
  citations?: CitationInput[];
}): Promise<string> {
  const hashes = input.evidenceHashes ?? [];
  const figures = input.keyFigures ?? [];
  const citations = input.citations;

  // Look up evidence summaries so mention chips show readable labels instead of raw hashes.
  // Union with citation hashes — a caller may cite a hash inline via citations without also
  // listing it in the flat evidenceHashes array.
  const allHashes = allCitedHashes(input.evidenceHashes, citations);
  const evidenceRecords = allHashes.length > 0
    ? await prisma.evidence.findMany({
        where: { fileHash: { in: allHashes } },
        select: { fileHash: true, summary: true },
      })
    : [];
  const evidenceLabelMap = new Map(evidenceRecords.map((e) => [e.fileHash, e.summary.slice(0, 40)]));

  const allTrajectoryIds = allCitedTrajectoryIds(input.trajectoryIds, citations);
  const trajectoryLabels = await loadTrajectoryCitationLabels(allTrajectoryIds);
  if (trajectoryLabels.unknown.length > 0) {
    return JSON.stringify({
      error: 'UNKNOWN_TRAJECTORY_ID',
      unknownIds: trajectoryLabels.unknown,
      explanation:
        'These ids match no ClaimTrajectory row, so nothing was written. Pass the trajectoryId ' +
        'field from get_claim_trajectories — a claimHash is not citable, because it does not name ' +
        'the detection pass the citation must be pinned to.',
    });
  }

  const userContent = buildTipTapDoc(input.body, hashes, figures, evidenceLabelMap, citations, {
    ids: input.trajectoryIds ?? [],
    labels: trajectoryLabels.labels,
  });
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

  // Attach the framing that produced this thesis. DERIVED, not requested: the
  // parameter was optional and had one caller, so omitting it lost the link
  // permanently with no way to recover it. Non-fatal by design either way — a
  // thesis must never fail to save because its provenance record could not be
  // updated — but a failure is now REPORTED rather than silent, because an
  // orphan the caller was warned about can be repaired.
  const framingLink = await linkThesisToFraming(thesis.id, input.framingSessionId, getResearcherId());

  return JSON.stringify({
    thesisId: thesis.id,
    framingSessionId: framingLink.linked ? framingLink.sessionId : null,
    framingLink,
    ...(framingLink.linked
      ? {}
      : {
          provenanceWarning:
            framingLink.reason === 'NO_ACTIVE_SESSION'
              ? 'No ACTIVE framing session without a thesis was found, so this thesis has NO recorded ' +
                'framing: the reasoning that chose what it argues is not attached to it. Open one with ' +
                'open_thesis_framing before creating a draft, or repair this afterwards.'
              : `The framing session could not be linked (${framingLink.reason}). This thesis has no ` +
                'recorded framing until that is repaired.',
        }),
    headVersionId: version.id,
    status: version.status,
    mentionsCreated: mentions.length,
    evidenceLinked: allHashes.length,
    trajectoriesLinked: allTrajectoryIds.length,
    keyFiguresLinked: figures.length,
    warning:
      allHashes.length === 0
        ? 'No evidence hashes provided. Theses without evidence citations produce weaker legal arguments. ' +
          'Find relevant vault evidence with search_evidence, then add hashes via evidenceHashes or citations. ' +
          'A thesis cannot be published on trajectories alone: the gate requires at least one cited ' +
          'record that is CONFIRMED and anchored on-chain.'
        : undefined,
    message:
      'Thesis draft saved as PENDING_AI. Open it in the UI to review, edit, and trigger ' +
      'Devil\'s Advocate AI analysis before publishing.',
  });
}
