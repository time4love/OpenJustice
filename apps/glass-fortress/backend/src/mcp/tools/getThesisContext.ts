import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { publicationState, versionIdForViewer, type Viewer } from '../../lib/thesisView';
import {
  resolveTrajectoryCitations,
  type ResolvedTrajectoryCitation,
} from '../../services/trajectoryCitation';

export const getThesisContextSchema = {
  thesisId: z.string().describe('The Thesis cuid to retrieve'),
};

// ---------------------------------------------------------------------------
// Viewer-dependent. An anonymous caller gets the PUBLISHED version, or an
// UNPUBLISHED answer; an approved researcher gets the head, the publication
// state, and how far the public is behind. Session context — research notes,
// who did what — is researcher-only.
// ---------------------------------------------------------------------------

/**
 * Trajectory citations, in as much detail as the response can afford.
 *
 * FULL when it fits, and it usually will: on the first real thesis the complete
 * block is ~18 KB. Summarised only when a thesis cites so much that the whole
 * response would stop fitting in a tool result — and then it SAYS SO, names what
 * it dropped, and names the tool that returns it.
 *
 * The failure this replaces was not a large response, it was a silent one: at
 * 375 KB the result exceeded the limit and the caller received no thesis at all.
 * The failure this avoids is subtler — trimming unconditionally would leave a
 * model reasoning about a thesis from claim previews while believing it had the
 * citations.
 */
const TRAJECTORY_DETAIL_BUDGET_CHARS = 40_000;

function byMovement(resolved: ResolvedTrajectoryCitation[]): ResolvedTrajectoryCitation[][] {
  const groups = new Map<string, ResolvedTrajectoryCitation[]>();
  for (const t of resolved) {
    const key = t.coMovement.patternHash || t.id;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.values()];
}

function movementCounts(groups: ResolvedTrajectoryCitation[][], resolved: ResolvedTrajectoryCitation[]) {
  return {
    citedMovements: groups.length,
    citedTrajectories: resolved.length,
    supersededMovements: groups.filter((m) => m[0].currency.state === 'RECOMPUTED_DISAGREES').length,
  };
}

/** Everything a reader needs to reason about what the thesis cites. */
function fullCitedTrajectories(resolved: ResolvedTrajectoryCitation[]) {
  const groups = byMovement(resolved);
  return {
    ...movementCounts(groups, resolved),
    detailLevel: 'FULL' as const,
    movements: groups.map((members) => {
      const first = members[0];
      return {
        trajectoryIds: members.map((m) => m.id),
        claims: members.map((m) => m.claimText),
        url: first.url,
        claimCount: first.coMovement.claimCount,
        citedCount: first.coMovement.members.filter((m) => m.cited).length,
        transitions: first.transitions,
        firstSeen: first.firstSeen,
        lastSeen: first.lastSeen,
        finalState: first.finalState,
        // The flips, with the capture each was measured in. The dates ARE the
        // finding — a thesis argues about specific captures.
        changes: first.changes.map((o) => ({
          snapshotDate: o.snapshotDate,
          present: o.present,
          snapshotUrl: o.snapshotUrl,
        })),
        capturesExamined: first.observations.length,
        currency: first.currency,
      };
    }),
    caveat: resolved[0]?.caveat,
  };
}

/** One line per movement, for when the full block would not fit. */
function summarisedCitedTrajectories(resolved: ResolvedTrajectoryCitation[]) {
  const groups = byMovement(resolved);
  return {
    ...movementCounts(groups, resolved),
    detailLevel: 'SUMMARY' as const,
    movements: groups.map((members) => {
      const first = members[0];
      return {
        trajectoryIds: members.map((m) => m.id),
        claimPreview: first.claimText.slice(0, 120),
        claimCount: first.coMovement.claimCount,
        citedCount: first.coMovement.members.filter((m) => m.cited).length,
        transitions: first.transitions,
        finalState: first.finalState,
        currency: first.currency.state,
      };
    }),
    reduced: {
      why: 'The full citations would have pushed this response past what a tool result can carry.',
      omitted:
        'the text of every cited claim, the archived capture each one appeared and vanished on, and ' +
        'the extraction caveat that governs what a trajectory can be said to show.',
      callInstead: 'get_thesis_trajectory_citations',
      warning:
        'What this thesis cites deterministically is NOT fully represented above. Reason about its ' +
        'evidentiary weight only after making that call.',
    },
  };
}

function citedTrajectoriesForResponse(resolved: ResolvedTrajectoryCitation[]) {
  if (resolved.length === 0) return fullCitedTrajectories(resolved);
  const full = fullCitedTrajectories(resolved);
  return JSON.stringify(full).length <= TRAJECTORY_DETAIL_BUDGET_CHARS
    ? full
    : summarisedCitedTrajectories(resolved);
}

export async function getThesisContextHandler(input: { thesisId: string }): Promise<string> {
  const viewer: Viewer = getResearcherId() ? 'RESEARCHER' : 'PUBLIC';

  const thesis = await prisma.thesis.findUnique({
    where: { id: input.thesisId },
    include: {
      publishedBy: { select: { handle: true } },
      versions: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, status: true, contentHash: true, createdAt: true, aiAnalysis: true },
      },
    },
  });

  if (!thesis) {
    return JSON.stringify({ error: `No thesis found with id: "${input.thesisId}"` });
  }

  const publication = publicationState(thesis, thesis.versions);
  const versionId = versionIdForViewer(thesis, viewer);

  if (viewer === 'PUBLIC' && versionId === null) {
    return JSON.stringify({
      thesisId: thesis.id,
      title: thesis.title ?? null,
      viewer,
      status: 'UNPUBLISHED',
      explanation: 'This thesis has not been published. It is visible to approved researchers only.',
    });
  }

  if (versionId === null) {
    return JSON.stringify({
      thesisId: thesis.id,
      title: thesis.title ?? null,
      viewer,
      status: 'NO_VERSION',
      publication,
      explanation: `Thesis "${input.thesisId}" has no version yet.`,
    });
  }

  const version = await prisma.thesisVersion.findUnique({
    where: { id: versionId },
    include: {
      mentions: true,
      gapResolutions: {
        include: { evidence: { select: { summary: true } } },
        orderBy: { gapIndex: 'asc' },
      },
    },
  });
  if (!version) {
    return JSON.stringify({ error: `Version ${versionId} of thesis "${input.thesisId}" is missing — a data defect.` });
  }

  // Enrich mentions with referenced evidence summaries
  const evidenceHashes = version.mentions.filter((m) => m.type === 'EVIDENCE').map((m) => m.refId);

  const evidenceRecords =
    evidenceHashes.length > 0
      ? await prisma.evidence.findMany({
          where: { fileHash: { in: evidenceHashes } },
          select: {
            fileHash: true,
            summary: true,
            evidenceTier: true,
            evidenceDate: true,
            targetEntity: true,
            sourceUrl: true,
            evidenceType: true,
            urlVersionDiff: { select: { trackedUrlId: true } },
          },
        })
      : [];

  const figureNames = version.mentions.filter((m) => m.type === 'KEY_FIGURE').map((m) => m.refId);

  // Trajectory citations arrive STRUCTURED, never as ids for the caller to
  // resolve. An opaque id is rendered as an opaque id, and the wording around a
  // trajectory is the part that has to be right: it describes what an archived
  // TEXT EXTRACTION contained, not what the page contained.
  const trajectoryIds = version.mentions.filter((m) => m.type === 'CLAIM_TRAJECTORY').map((m) => m.refId);
  const trajectories = await resolveTrajectoryCitations(trajectoryIds);

  // Cross-reference gap resolutions with this version's AI analysis gaps
  const aiGaps =
    ((version.aiAnalysis as Record<string, unknown> | null)?.['evidenceGaps'] as
      | { description: string; suggestedSearch: string }[]
      | undefined) ?? [];

  const resolvedGapIndices = new Set(version.gapResolutions.map((r) => r.gapIndex));

  const openGaps = aiGaps
    .map((g, i) => ({ index: i, description: g.description, suggestedSearch: g.suggestedSearch }))
    .filter((g) => !resolvedGapIndices.has(g.index));

  const resolvedGaps = version.gapResolutions.map((r) => ({
    index: r.gapIndex,
    description: aiGaps[r.gapIndex]?.description ?? `Gap #${String(r.gapIndex + 1)}`,
    resolvedBy: r.evidenceId,
    evidenceSummary: r.evidence.summary.slice(0, 120),
  }));

  const shared = {
    thesisId: thesis.id,
    title: thesis.title ?? null,
    viewer,
    versionId: version.id,
    status: version.status,
    publicInterestStatement: thesis.publicInterestStatement,
    content: version.userContent,
    devilsAdvocateCritique: version.aiAnalysis ?? null,
    gapStatus: {
      total: aiGaps.length,
      open: openGaps,
      resolved: resolvedGaps,
    },
    keyFiguresMentioned: figureNames,
    // What the thesis cites deterministically — in full when it fits, and
    // summarised WITH a warning when it does not.
    //
    // One entry per cited row with its full capture list made this response
    // 375 KB on the first real thesis: 97% trajectories, 74% capture lists
    // repeated across twenty-one citations describing eight movements. Over
    // HTTP that compresses away; over MCP the reader is a model with a token
    // budget, and the tool for READING a thesis stopped being able to return
    // one. Different transport, different constraint.
    trajectoriesCited: citedTrajectoriesForResponse(trajectories.resolved),
    ...(trajectories.missing.length > 0
      ? {
          trajectoryCitationsMissing: trajectories.missing,
          trajectoryCitationWarning:
            'These cited trajectory ids no longer resolve to any row, so the claims resting on them ' +
            'have nothing behind them. The publication gate refuses a thesis in this state.',
        }
      : {}),
    evidenceCited: evidenceRecords.map((e) => ({
      fileHash: e.fileHash,
      summary: e.summary,
      evidenceTier: e.evidenceTier,
      evidenceDate: e.evidenceDate,
      targetEntity: e.targetEntity,
      sourceUrl: e.sourceUrl,
      evidenceType: e.evidenceType,
      forensicTimelineUrl: e.urlVersionDiff?.trackedUrlId ? `/forensics/${e.urlVersionDiff.trackedUrlId}` : null,
    })),
  };

  if (viewer === 'PUBLIC') {
    return JSON.stringify({
      ...shared,
      publication: { publishedVersionId: publication.publishedVersionId, publishedAt: publication.publishedAt },
    });
  }

  // Fetch last session for continuity context
  const lastSession = await prisma.researchSession.findFirst({
    where: { thesisId: input.thesisId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // ACTIVE first, then most recent CLOSED
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });

  const lastSessionContext = lastSession
    ? {
        id: lastSession.id,
        name: lastSession.name,
        status: lastSession.status,
        createdAt: lastSession.createdAt,
        closedAt: lastSession.closedAt,
        durationMinutes: Math.round(
          ((lastSession.closedAt ?? new Date()).getTime() - lastSession.createdAt.getTime()) / 60000,
        ),
        summary: {
          versionsCreated: lastSession.events.filter((e) => e.type === 'VERSION_CREATED').length,
          gapsResolved: lastSession.events.filter((e) => e.type === 'GAP_RESOLVED').length,
          aiAnalysesRun: lastSession.events.filter((e) => e.type === 'AI_ANALYSIS_RUN').length,
          notes: lastSession.events.filter((e) => e.type === 'NOTE').length,
        },
        lastNote: lastSession.events.filter((e) => e.type === 'NOTE').at(-1)?.description ?? null,
        recentEvents: lastSession.events.slice(-5).map((e) => ({
          type: e.type,
          description: e.description,
          createdAt: e.createdAt,
        })),
      }
    : null;

  return JSON.stringify({
    ...shared,
    headVersionId: version.id,
    publication,
    publicationNote: !publication.isPublished
      ? 'DRAFT — not published. The public cannot see this thesis.'
      : publication.headIsPublished
        ? 'The public sees this head version.'
        : `The public is ${String(publication.versionsAhead)} version(s) behind: it sees ${String(publication.publishedVersionId)}, not this head. Publish again to update it.`,
    versionCount: thesis.versions.length,
    versions: thesis.versions.map((v) => ({
      id: v.id,
      status: v.status,
      createdAt: v.createdAt,
      hasCritique: v.aiAnalysis !== null,
      isPublished: v.id === publication.publishedVersionId,
    })),
    lastSession: lastSessionContext,
  });
}
