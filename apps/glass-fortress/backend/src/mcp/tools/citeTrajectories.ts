import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { parseMentions } from '../../utils/parseMentions';
import type { TipTapNode } from '../../utils/tipTapUtils';
import { sha256, extractPreview } from '../../services/thesisAnalysis';
import { logSessionEvent } from '../../services/sessionService';
import { getResearcherId } from '../../context/researcherContext';
import { spliceTrajectoryMentions } from '../../services/thesisCitationSplice';
import { loadTrajectoryCitationLabels, resolveTrajectoryCitations } from '../../services/trajectoryCitation';

// ---------------------------------------------------------------------------
// cite_trajectories — attach a claim trajectory to a claim already written.
//
// add_thesis_version is the tool for changing what a thesis SAYS. It takes the
// body as Markdown, so using it to add a citation means retyping the whole
// document out of stored JSON — and nothing hands that JSON back as Markdown,
// so the retyping is done by hand, in Hebrew, past seven working citations.
//
// This tool changes only what a thesis CITES. It anchors on an exact substring
// of the existing prose, splices the mention in after it, and asserts the prose
// is byte-identical afterwards. An anchor that matches zero times or more than
// once is refused rather than guessed at.
//
// It still writes a NEW VERSION rather than editing in place: a version's
// contentHash is what publication pins, and a citation set that changed under a
// fixed version id would make the pin meaningless. The new version is
// PENDING_AI, because the Devil's Advocate critique names what the thesis
// cites, and the citations just changed.
// ---------------------------------------------------------------------------

export const citeTrajectoriesSchema = {
  thesisId: z.string().min(1).describe('The thesis whose head version gains the citations.'),
  placements: z
    .array(
      z.object({
        anchorText: z
          .string()
          .min(8)
          .describe(
            'An EXACT substring of the existing thesis prose, after which the citation is placed — ' +
              'normally the end of the sentence being supported. Must occur exactly once in the ' +
              'document and lie within one text run (a substring split by **bold** cannot be ' +
              'anchored). Zero matches or several is a refusal, not a guess.',
          ),
        trajectoryIds: z
          .array(z.string())
          .min(1)
          .describe(
            'ClaimTrajectory ids from get_claim_trajectories to cite at this point. Cite EVERY ' +
              'member of a co-movement group: the group has no id of its own, and citing all its ' +
              'members is what preserves the finding that they moved together.',
          ),
      }),
    )
    .min(1)
    .describe('Where each citation attaches. All-or-nothing — one bad anchor refuses the whole call.'),
};

export interface CiteTrajectoriesInput {
  thesisId: string;
  placements: { anchorText: string; trajectoryIds: string[] }[];
}

export async function citeTrajectoriesHandler(input: CiteTrajectoriesInput): Promise<string> {
  const thesis = await prisma.thesis.findUnique({
    where: { id: input.thesisId },
    include: { headVersion: { include: { mentions: true } } },
  });
  if (!thesis) return JSON.stringify({ error: 'THESIS_NOT_FOUND', thesisId: input.thesisId });

  const head = thesis.headVersion;
  if (!head) {
    return JSON.stringify({
      error: 'NO_HEAD_VERSION',
      thesisId: input.thesisId,
      explanation: 'This thesis has no version to cite into. Write one with add_thesis_version first.',
    });
  }

  const requestedIds = [...new Set(input.placements.flatMap((p) => p.trajectoryIds))];

  const { labels, unknown } = await loadTrajectoryCitationLabels(requestedIds);
  if (unknown.length > 0) {
    return JSON.stringify({
      error: 'UNKNOWN_TRAJECTORY_ID',
      unknownIds: unknown,
      explanation:
        'These ids match no ClaimTrajectory row, so nothing was written. Pass the trajectoryId field ' +
        'from get_claim_trajectories — a claimHash is not citable, because it does not name the ' +
        'detection pass the citation must be pinned to.',
    });
  }

  // Citing the same trajectory twice would render two markers for one finding.
  const alreadyCited = head.mentions
    .filter((m) => m.type === 'CLAIM_TRAJECTORY')
    .map((m) => m.refId)
    .filter((refId) => requestedIds.includes(refId));
  if (alreadyCited.length > 0) {
    return JSON.stringify({
      error: 'ALREADY_CITED',
      alreadyCited,
      explanation:
        'The head version already cites these trajectories. Nothing was written — a second marker ' +
        'for one finding reads as two findings.',
    });
  }

  const spliced = spliceTrajectoryMentions(head.userContent as unknown as TipTapNode, input.placements, labels);
  if (!spliced.ok) {
    return JSON.stringify({
      error: 'ANCHOR_UNRESOLVED',
      failures: spliced.failures,
      explanation:
        'No version was written. NOT_FOUND means the substring does not appear in the thesis, or is ' +
        'split across formatting runs — copy it from the content returned by get_thesis_context. ' +
        'AMBIGUOUS means it appears more than once: extend it until it is unique.',
    });
  }

  const userContent = spliced.doc;
  const mentions = parseMentions(userContent);
  const contentHash = sha256(userContent);
  const researcherId = getResearcherId();

  const { version } = await prisma.$transaction(async (tx) => {
    const version = await tx.thesisVersion.create({
      data: {
        thesisId: input.thesisId,
        parentVersionId: head.id,
        userContent: userContent as unknown as Prisma.InputJsonValue,
        contentHash,
        status: 'PENDING_AI',
        mentions: { createMany: { data: mentions.map((m) => ({ type: m.type, refId: m.refId })) } },
        ...(researcherId ? { createdById: researcherId } : {}),
      },
    });
    await tx.thesis.update({ where: { id: input.thesisId }, data: { headVersionId: version.id } });
    return { version };
  });

  void logSessionEvent(
    input.thesisId,
    'VERSION_CREATED',
    `Trajectory citations added (prose unchanged): ${extractPreview(userContent)}`,
    version.id,
  );

  // Reported, never enforced: citing 3 of 10 claims that moved as one unit is a
  // weaker claim than the archive supports, but which members belong in a given
  // sentence is the researcher's judgement, not this tool's.
  const { resolved } = await resolveTrajectoryCitations(requestedIds);
  const partialGroups = resolved
    .filter((t) => t.coMovement.claimCount > t.coMovement.members.filter((m) => m.cited).length)
    .map((t) => ({
      trajectoryId: t.id,
      coMovementCount: t.coMovement.claimCount,
      citedFromGroup: t.coMovement.members.filter((m) => m.cited).length,
      uncitedIds: t.coMovement.members.filter((m) => !m.cited).map((m) => m.id),
    }));

  return JSON.stringify({
    thesisId: input.thesisId,
    headVersionId: version.id,
    parentVersionId: head.id,
    status: version.status,
    prose: 'UNCHANGED — this tool inserts citations only, and refuses to write if a character moved.',
    trajectoriesCited: requestedIds.length,
    anchored: spliced.anchored.map((a) => ({
      anchorText: a.anchorText.length > 60 ? `${a.anchorText.slice(0, 60)}…` : a.anchorText,
      trajectoryIds: a.trajectoryIds,
    })),
    mentionsCreated: mentions.length,
    ...(partialGroups.length > 0
      ? {
          coMovementIncomplete: partialGroups,
          coMovementNote:
            'Some cited trajectories belong to a co-movement group that is only partly cited. ' +
            'Claims moving as one unit are much harder to explain as routine editing than the same ' +
            'claims cited separately — cite the whole group where the sentence supports it.',
        }
      : {}),
    message:
      'New version saved as PENDING_AI with the prose untouched. The Devil\'s Advocate critique names ' +
      'what the thesis cites, so call run_ai_analysis before attempting to publish.',
  });
}
