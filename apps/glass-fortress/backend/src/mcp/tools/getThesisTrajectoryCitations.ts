import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { versionIdForViewer, type Viewer } from '../../lib/thesisView';
import { resolveTrajectoryCitations } from '../../services/trajectoryCitation';

// ---------------------------------------------------------------------------
// get_thesis_trajectory_citations
//
// The deterministic citations behind a thesis, in full: which claims, which
// captures they flipped on, how much of each co-movement was cited, and whether
// a later detection pass still agrees.
//
// A separate call rather than part of get_thesis_context, because the size of
// this answer grows with how thoroughly a thesis is cited. Folded into the
// context tool it made the first real thesis a 375 KB response — over the MCP
// tool-result limit, so the tool for READING a thesis could no longer return
// one. Trimming it made today's thesis fit; splitting it keeps the context tool
// bounded no matter how many citations a thesis accumulates.
//
// Same viewer rule as get_thesis_context: the public sees what the published
// version cites, a researcher sees the head.
// ---------------------------------------------------------------------------

export const getThesisTrajectoryCitationsSchema = {
  thesisId: z.string().min(1).describe('The Thesis cuid whose trajectory citations to resolve.'),
};

export async function getThesisTrajectoryCitationsHandler(input: { thesisId: string }): Promise<string> {
  const viewer: Viewer = getResearcherId() ? 'RESEARCHER' : 'PUBLIC';

  const thesis = await prisma.thesis.findUnique({
    where: { id: input.thesisId },
    select: { id: true, headVersionId: true, publishedVersionId: true },
  });
  if (!thesis) return JSON.stringify({ error: `No thesis found with id: "${input.thesisId}"` });

  const versionId = versionIdForViewer(thesis, viewer);
  if (versionId === null) {
    return JSON.stringify({
      thesisId: thesis.id,
      viewer,
      status: 'UNPUBLISHED',
      explanation: 'This thesis has not been published. It is visible to approved researchers only.',
    });
  }

  const mentions = await prisma.thesisMention.findMany({
    where: { thesisVersionId: versionId, type: 'CLAIM_TRAJECTORY' },
    select: { refId: true },
  });
  const { resolved, missing } = await resolveTrajectoryCitations(mentions.map((m) => m.refId));

  // One entry per movement: members of a co-movement share their captures by
  // definition, so repeating the list per member says nothing extra.
  const byMovement = new Map<string, typeof resolved>();
  for (const t of resolved) {
    const key = t.coMovement.patternHash || t.id;
    byMovement.set(key, [...(byMovement.get(key) ?? []), t]);
  }

  return JSON.stringify({
    thesisId: thesis.id,
    viewer,
    versionId,
    citedMovements: byMovement.size,
    citedTrajectories: resolved.length,
    movements: [...byMovement.values()].map((members) => {
      const first = members[0];
      return {
        trajectoryIds: members.map((m) => m.id),
        claims: members.map((m) => m.claimText),
        url: first.url,
        coMovement: {
          claimCount: first.coMovement.claimCount,
          citedCount: first.coMovement.members.filter((m) => m.cited).length,
          uncitedClaims: first.coMovement.members.filter((m) => !m.cited).map((m) => m.claimText),
        },
        transitions: first.transitions,
        firstSeen: first.firstSeen,
        lastSeen: first.lastSeen,
        finalState: first.finalState,
        // The flips, each with the archived capture it was measured in.
        changes: first.changes.map((o) => ({
          snapshotDate: o.snapshotDate,
          present: o.present,
          snapshotUrl: o.snapshotUrl,
        })),
        capturesExamined: first.observations.length,
        capturesAbsent: first.observations.filter((o) => !o.present).length,
        pinnedTo: first.computation,
        currency: first.currency,
      };
    }),
    ...(missing.length > 0
      ? {
          missing,
          missingWarning:
            'These cited trajectory ids no longer resolve to any row, so the claims resting on them ' +
            'have nothing behind them. The publication gate refuses a thesis in this state.',
        }
      : {}),
    caveat: resolved[0]?.caveat,
    fullCaptureList: 'get_claim_trajectories returns every capture examined for a tracked URL.',
  });
}
