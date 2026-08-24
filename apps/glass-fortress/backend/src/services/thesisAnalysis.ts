// ---------------------------------------------------------------------------
// Shared thesis AI analysis logic
//
// Extracted so both thesisRoutes.ts (fire-and-forget REST) and the MCP
// run_ai_analysis tool (synchronous) can reuse the same implementation.
// ---------------------------------------------------------------------------

import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import {
  DevilsAdvocateAgent,
  type ReferencedEvidence,
  type ResolvedGapContext,
} from './DevilsAdvocateAgent';
import { logSessionEvent } from './sessionService';
import { loadTrajectoryContext } from '../lib/trajectoryContext';
import { loadSummaryCaveat } from '../lib/summaryProvenance';

let _agent: DevilsAdvocateAgent | null = null;

function getAgent(): DevilsAdvocateAgent {
  if (!_agent) _agent = new DevilsAdvocateAgent();
  return _agent;
}

export function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Walk a TipTap document JSON and extract plain text, resolving mention nodes
 * to human-readable tokens (e.g. @Netanyahu, #ev_abc123).
 *
 * Trajectory mentions render as NOTHING unless `trajectoryLabels` is supplied,
 * and that default is deliberate rather than an oversight. `cite_trajectories`
 * guarantees the prose is byte-identical across a citation, and the consumers of
 * this function that reason about the prose — the publication gate's hedge and
 * figure checks, `audit_thesis_claims` verifying sentences against the archive,
 * every stored preview — depend on that guarantee. Injecting a token for them
 * would make citing a claim silently change the text being verified.
 *
 * The critique is the one caller that must see them, because a citation is the
 * only thing that says which claims a sentence rests on. It passes labels.
 */
export function extractText(
  doc: unknown,
  /** ClaimTrajectory id → the label its group carries in the trajectory block. */
  trajectoryLabels?: ReadonlyMap<string, string>,
): string {
  function walk(node: Record<string, unknown>): string {
    if (node.type === 'text') return String(node.text ?? '');
    const attrs = node.attrs as Record<string, unknown> | undefined;
    if (node.type === 'keyFigureMention') return `@${String(attrs?.['id'] ?? '')}`;
    if (node.type === 'evidenceMention') return `#ev_${String(attrs?.['id'] ?? '')}`;
    if (node.type === 'trackedUrlMention') return `#url_${String(attrs?.['id'] ?? '')}`;
    if (node.type === 'trajectoryMention') {
      if (!trajectoryLabels) return '';
      const id = attrs?.id;
      const label = typeof id === 'string' ? trajectoryLabels.get(id) : undefined;
      return label === undefined ? '' : `#traj_${label}`;
    }
    const content = node.content;
    if (!Array.isArray(content)) return '';
    return (content as unknown[]).map((c) => walk(c as Record<string, unknown>)).join(' ');
  }
  return collapseTrajectoryRuns(
    walk(doc as Record<string, unknown>)
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

/**
 * Collapse a run of adjacent markers citing the SAME movement to one marker.
 *
 * A co-movement is cited by citing every one of its members, so a ten-claim group
 * splices ten mention nodes at one sentence. Emitting ten identical markers is
 * the same defect the renderer had — one finding reported as ten — reproduced in
 * the prompt, where nothing would ever collapse it.
 *
 * Scoped to a consecutive run: citing the same movement again later in the thesis
 * is a second citation and keeps its own marker.
 */
function collapseTrajectoryRuns(text: string): string {
  return text.replace(/(#traj_\S+)(?: \1)+/g, '$1');
}

export function extractPreview(doc: unknown): string {
  return extractText(doc).slice(0, 120);
}

/**
 * Run Devil's Advocate analysis on a ThesisVersion and persist the result.
 * Safe to call fire-and-forget (errors are caught and logged) or awaited
 * for synchronous use (MCP tool).
 */
export async function triggerAIAnalysis(
  versionId: string,
  userContent: unknown,
): Promise<void> {
  try {
    const version = await prisma.thesisVersion.findUnique({
      where: { id: versionId },
      // Both cited types. EVIDENCE alone was the defect: a thesis could cite
      // twenty-one trajectories and be critiqued on an input byte-identical to
      // the version that cited none.
      include: { mentions: { where: { type: { in: ['EVIDENCE', 'CLAIM_TRAJECTORY'] } } } },
    });
    if (!version) return;

    const evidenceHashes = version.mentions.filter((m) => m.type === 'EVIDENCE').map((m) => m.refId);
    const citedTrajectoryIds = version.mentions
      .filter((m) => m.type === 'CLAIM_TRAJECTORY')
      .map((m) => m.refId);

    const evidenceRecords = await prisma.evidence.findMany({
      where: { fileHash: { in: evidenceHashes } },
      select: {
        fileHash: true,
        investigativeCategories: true,
        targetEntity: true,
        evidenceTier: true,
        evidenceRole: true,
        evidenceDate: true,
        summary: true,
      },
    });

    // Fetch gap resolutions from the parent version, if any, to pass as context
    let resolvedGaps: ResolvedGapContext[] = [];
    if (version.parentVersionId) {
      const parentResolutions = await prisma.thesisGapResolution.findMany({
        where: { thesisVersionId: version.parentVersionId },
        include: { evidence: { select: { summary: true } } },
        orderBy: { gapIndex: 'asc' },
      });
      if (parentResolutions.length > 0) {
        // Fetch gap descriptions from the parent version's aiAnalysis
        const parentVersion = await prisma.thesisVersion.findUnique({
          where: { id: version.parentVersionId },
          select: { aiAnalysis: true },
        });
        const parentGaps = (
          (parentVersion?.aiAnalysis as Record<string, unknown> | null)?.['evidenceGaps'] as
            | { description: string }[]
            | undefined
        ) ?? [];

        resolvedGaps = parentResolutions.map((r) => ({
          gapIndex: r.gapIndex,
          description: parentGaps[r.gapIndex]?.description ?? `Gap #${r.gapIndex + 1}`,
          evidenceSummary: r.evidence.summary,
        }));
      }
    }

    const referenced: ReferencedEvidence[] = evidenceRecords;
    // Devil's Advocate rates thesis STRENGTH, so it is the last place a
    // model-written summary should be the only account of a forensic change.
    const trajectories = await loadTrajectoryContext(referenced, citedTrajectoryIds);
    // Labels come from the bundle's own order, which is the order the block
    // renders in, so #traj_T3 in the prose and [T3] in the block are the same
    // trajectory by construction rather than by a second lookup that could drift.
    const trajectoryLabels = new Map<string, string>();
    trajectories.trajectories.forEach((group, i) => {
      for (const id of group.citedIds) trajectoryLabels.set(id, `T${String(i + 1)}`);
    });
    const thesisText = extractText(userContent, trajectoryLabels);
    const summaryCaveat = await loadSummaryCaveat(referenced);
    const aiAnalysis = await getAgent().analyze(thesisText, referenced, resolvedGaps, trajectories, summaryCaveat);
    const contentHash = sha256({ userContent, aiAnalysis });

    await prisma.thesisVersion.update({
      where: { id: versionId },
      data: { aiAnalysis, contentHash, status: 'COMPLETE' },
    });

    void logSessionEvent(
      version.thesisId,
      'AI_ANALYSIS_RUN',
      `AI analysis complete: ${aiAnalysis.overallStrengthAssessment} — ${aiAnalysis.evidenceGaps.length} gap(s), ${aiAnalysis.counterArguments.length} counter-argument(s)`,
      versionId,
    );
  } catch (err) {
    console.error('[thesis] AI analysis failed for version', versionId, err);
    throw err;
  }
}
