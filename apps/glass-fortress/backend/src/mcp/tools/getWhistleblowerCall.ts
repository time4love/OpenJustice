import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { routing } from '../../lib/publicRoutes';
import { getResearcherId } from '../../context/researcherContext';
import { publicationState, versionIdForViewer, type Viewer } from '../../lib/thesisView';
import { deriveCallState } from '../../services/whistleblowerCall';

// ---------------------------------------------------------------------------
// get_whistleblower_call
//
// Returns the public Call for Whistleblowers derived from a thesis.
//
// The call is NOT a stored record — there is nothing to create. The public page
// renders one appeal per entry in a version's Devil's Advocate `evidenceGaps[]`,
// so the call comes into existence when an analysis completes with at least one
// gap. Which version: the PUBLISHED one for the public, the head for a
// researcher — who is also told when the public call is behind the head.
//
// That derivation is why this tool is a read. What a researcher working through
// MCP lacked was not a way to publish the call but any way to SEE it: whether
// it is live, what it asks the public for, and the URL to circulate.
// ---------------------------------------------------------------------------

export const getWhistleblowerCallSchema = {
  thesisId: z
    .string()
    .min(1)
    .describe('ID of the thesis whose public Call for Whistleblowers should be returned'),
};

export async function getWhistleblowerCallHandler(input: { thesisId: string }): Promise<string> {
  const viewer: Viewer = getResearcherId() ? 'RESEARCHER' : 'PUBLIC';

  const thesis = await prisma.thesis.findUnique({
    where: { id: input.thesisId },
    select: {
      id: true,
      title: true,
      headVersionId: true,
      publishedVersionId: true,
      publishedAt: true,
      publishedBy: { select: { handle: true } },
      versions: { select: { id: true, createdAt: true } },
    },
  });

  if (!thesis) {
    return JSON.stringify({ error: `No thesis found with id: "${input.thesisId}"` });
  }

  const urls = routing.callUrls(thesis.id);
  const publication = publicationState(thesis, thesis.versions);
  const versionId = versionIdForViewer(thesis, viewer);
  const base = { thesisId: thesis.id, title: thesis.title, viewer, urls };

  if (viewer === 'PUBLIC' && versionId === null) {
    return JSON.stringify({
      ...base,
      isLive: false,
      reason: 'UNPUBLISHED',
      explanation: 'The thesis is not published, so the public page renders no call.',
    });
  }

  const version = versionId
    ? await prisma.thesisVersion.findUnique({
        where: { id: versionId },
        select: {
          id: true,
          status: true,
          aiAnalysis: true,
          gapResolutions: { select: { gapIndex: true, evidenceId: true } },
        },
      })
    : null;

  const call = deriveCallState(version);
  const researcherFields =
    viewer === 'RESEARCHER'
      ? {
          publication,
          publicCallNote: !publication.isPublished
            ? 'DRAFT — the public page renders no call until the thesis is published.'
            : publication.headIsPublished
              ? 'The public call is derived from this head version.'
              : `The public call is derived from ${String(publication.publishedVersionId)}, ${String(publication.versionsAhead)} version(s) behind this head.`,
        }
      : {};

  switch (call.reason) {
    case 'NO_HEAD_VERSION':
      return JSON.stringify({
        ...base,
        ...researcherFields,
        isLive: false,
        reason: call.reason,
        explanation: 'The thesis has no version yet, so there is nothing for the public page to render.',
      });
    case 'ANALYSIS_INCOMPLETE':
      return JSON.stringify({
        ...base,
        ...researcherFields,
        versionId: call.versionId,
        isLive: false,
        reason: call.reason,
        explanation:
          "This version has no completed Devil's Advocate analysis, and the call is derived entirely from it. Run run_ai_analysis first.",
      });
    case 'ANALYSIS_SHAPE_INVALID':
      return JSON.stringify({
        ...base,
        ...researcherFields,
        versionId: call.versionId,
        error: call.reason,
        explanation:
          'The stored analysis does not match DevilsAdvocateOutputSchema, so the gaps it publishes cannot be trusted. This is a data defect, not an empty call.',
        details: call.details,
      });
    case 'NO_GAPS':
    case 'LIVE': {
      const openGaps = call.gaps.filter((g) => !g.resolved).length;
      return JSON.stringify({
        ...base,
        ...researcherFields,
        versionId: call.versionId,
        isLive: call.isLive,
        reason: call.reason,
        explanation: call.isLive
          ? 'The call is live. Each gap below is published as a public appeal, and each can also be turned into a Freedom of Information request via generate_foia_request with the same gapIndex.'
          : 'The analysis found no evidence gaps, so the page renders no appeals. A thesis with nothing missing has nothing to ask the public for.',
        currentStrength: call.currentStrength,
        totalGaps: call.gaps.length,
        openGaps,
        gaps: call.gaps,
      });
    }
  }
}
