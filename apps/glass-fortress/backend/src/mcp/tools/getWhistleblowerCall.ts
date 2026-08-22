import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { routing } from '../../lib/publicRoutes';
import { DevilsAdvocateOutputSchema } from '../../services/DevilsAdvocateAgent';

// ---------------------------------------------------------------------------
// get_whistleblower_call
//
// Returns the public Call for Whistleblowers derived from a thesis.
//
// The call is NOT a stored record — there is nothing to create. The public page
// renders one appeal per entry in the head version's Devil's Advocate
// `evidenceGaps[]`, so the call comes into existence the moment an analysis
// completes with at least one gap, and changes whenever a new version is
// analysed.
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

interface CallGap {
  gapIndex: number;
  description: string;
  suggestedSearch: string;
  /** True once a whistleblower submission or vault hit has been linked to this gap. */
  resolved: boolean;
  resolvedByFileHash: string | null;
}

export async function getWhistleblowerCallHandler(input: { thesisId: string }): Promise<string> {
  const thesis = await prisma.thesis.findUnique({
    where: { id: input.thesisId },
    select: {
      id: true,
      title: true,
      headVersion: {
        select: {
          id: true,
          status: true,
          aiAnalysis: true,
          gapResolutions: { select: { gapIndex: true, evidenceId: true } },
        },
      },
    },
  });

  if (!thesis) {
    return JSON.stringify({ error: `No thesis found with id: "${input.thesisId}"` });
  }

  const urls = routing.callUrls(thesis.id);
  const head = thesis.headVersion;

  if (!head) {
    return JSON.stringify({
      thesisId: thesis.id,
      title: thesis.title,
      isLive: false,
      reason: 'NO_HEAD_VERSION',
      explanation: 'The thesis has no version yet, so there is nothing for the public page to render.',
      urls,
    });
  }

  if (head.status !== 'COMPLETE' || head.aiAnalysis === null) {
    return JSON.stringify({
      thesisId: thesis.id,
      title: thesis.title,
      headVersionId: head.id,
      isLive: false,
      reason: 'ANALYSIS_INCOMPLETE',
      explanation:
        'The head version has no completed Devil\'s Advocate analysis, and the call is derived entirely from it. Run run_ai_analysis first.',
      urls,
    });
  }

  // The analysis is LLM output read back out of a Json column, so it is
  // validated rather than cast — a shape change would otherwise surface as a
  // silently empty call rather than an error.
  const parsed = DevilsAdvocateOutputSchema.safeParse(head.aiAnalysis);
  if (!parsed.success) {
    return JSON.stringify({
      thesisId: thesis.id,
      headVersionId: head.id,
      error: 'ANALYSIS_SHAPE_INVALID',
      explanation:
        'The stored analysis does not match DevilsAdvocateOutputSchema, so the gaps it publishes cannot be trusted. This is a data defect, not an empty call.',
      details: parsed.error.flatten(),
      urls,
    });
  }

  const analysis = parsed.data;
  const resolutions = new Map(head.gapResolutions.map((r) => [r.gapIndex, r.evidenceId]));

  const gaps: CallGap[] = analysis.evidenceGaps.map((gap, gapIndex) => ({
    gapIndex,
    description: gap.description,
    suggestedSearch: gap.suggestedSearch,
    resolved: resolutions.has(gapIndex),
    resolvedByFileHash: resolutions.get(gapIndex) ?? null,
  }));

  const openGaps = gaps.filter((g) => !g.resolved).length;

  return JSON.stringify({
    thesisId: thesis.id,
    title: thesis.title,
    headVersionId: head.id,
    isLive: gaps.length > 0,
    reason: gaps.length > 0 ? 'LIVE' : 'NO_GAPS',
    explanation:
      gaps.length > 0
        ? 'The call is live. Each gap below is published as a public appeal, and each can also be turned into a Freedom of Information request via generate_foia_request with the same gapIndex.'
        : 'The analysis found no evidence gaps, so the page renders no appeals. A thesis with nothing missing has nothing to ask the public for.',
    urls,
    currentStrength: analysis.overallStrengthAssessment,
    totalGaps: gaps.length,
    openGaps,
    gaps,
  });
}
