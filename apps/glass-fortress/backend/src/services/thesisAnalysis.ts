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
  buildCritiqueMessages,
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
export interface AnalysisRun {
  /** False when the stored critique already answers exactly this input. */
  ran: boolean;
}

/**
 * Everything the critic is given, and the fingerprint of it.
 *
 * Extracted so the runner and the PUBLICATION GATE cannot disagree about what
 * "the critic's input" is. They already did once in spirit: the fingerprint
 * closed the serving path while check 2 went on asking only whether an analysis
 * EXISTED, so a thesis could still publish carrying a critique argued against
 * facts that had since changed — the exact thing the fingerprint was added to
 * prevent. One assembly, one hash, two callers.
 */
export interface CritiqueInput {
  thesisText: string;
  referenced: ReferencedEvidence[];
  resolvedGaps: ResolvedGapContext[];
  trajectories: Awaited<ReturnType<typeof loadTrajectoryContext>>;
  summaryCaveat: Awaited<ReturnType<typeof loadSummaryCaveat>>;
  /** SHA-256 of the exact message array these produce. */
  fingerprint: string;
  version: { thesisId: string; status: string; aiAnalysis: unknown; analysisInputHash: string | null };
}

export async function buildCritiqueInput(
  versionId: string,
  userContent: unknown,
): Promise<CritiqueInput | null> {
  {
    const version = await prisma.thesisVersion.findUnique({
      where: { id: versionId },
      // Both cited types. EVIDENCE alone was the defect: a thesis could cite
      // twenty-one trajectories and be critiqued on an input byte-identical to
      // the version that cited none.
      include: { mentions: { where: { type: { in: ['EVIDENCE', 'CLAIM_TRAJECTORY'] } } } },
    });
    if (!version) return null;

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
    // The label travels WITH the group, so the marker in the prose and the block
    // header are the same trajectory by construction rather than by a second
    // lookup that could drift — and because a label is derived from the group's
    // own claim identity, a critique quoting one stays readable after the bundle
    // changes shape. A positional label did not: adding context groups moved
    // every label after the first, and a stored critique came to name movements
    // the thesis never cited.
    const trajectoryLabels = new Map<string, string>();
    for (const group of trajectories.trajectories) {
      for (const id of group.citedIds) trajectoryLabels.set(id, group.label);
    }
    const thesisText = extractText(userContent, trajectoryLabels);
    const summaryCaveat = await loadSummaryCaveat(referenced);
    return {
      thesisText,
      referenced,
      resolvedGaps,
      trajectories,
      summaryCaveat,
      fingerprint: sha256(
        buildCritiqueMessages(thesisText, referenced, resolvedGaps, trajectories, summaryCaveat),
      ),
      version,
    };
  }
}

/**
 * Whether the stored critique still answers the input that would be produced now.
 *
 * `null` when there is nothing to judge — no version at all. `false` covers both
 * "never analysed" and "analysed against something else", which the caller
 * distinguishes by looking at the version itself.
 */
export async function analysisIsCurrent(
  versionId: string,
  userContent: unknown,
): Promise<boolean | null> {
  const input = await buildCritiqueInput(versionId, userContent);
  if (!input) return null;
  return (
    input.version.status === 'COMPLETE' &&
    input.version.aiAnalysis !== null &&
    input.version.analysisInputHash === input.fingerprint
  );
}

export async function triggerAIAnalysis(
  versionId: string,
  userContent: unknown,
): Promise<AnalysisRun> {
  try {
    const input = await buildCritiqueInput(versionId, userContent);
    if (!input) return { ran: false };
    const { thesisText, referenced, resolvedGaps, trajectories, summaryCaveat, version } = input;
    const analysisInputHash = input.fingerprint;

    // Serve the stored critique only while it answers this exact input. Status
    // cannot decide it: PENDING_AI is set only when a version is CREATED, so a
    // critique outlived corrected summaries, new detection passes, and changes to
    // what the critic is given.
    if (
      version.status === 'COMPLETE' &&
      version.aiAnalysis !== null &&
      version.analysisInputHash === analysisInputHash
    ) {
      return { ran: false };
    }

    const aiAnalysis = await getAgent().analyze(thesisText, referenced, resolvedGaps, trajectories, summaryCaveat);
    const contentHash = sha256({ userContent, aiAnalysis });

    await prisma.thesisVersion.update({
      where: { id: versionId },
      data: { aiAnalysis, contentHash, analysisInputHash, status: 'COMPLETE' },
    });

    void logSessionEvent(
      version.thesisId,
      'AI_ANALYSIS_RUN',
      `AI analysis complete: ${aiAnalysis.overallStrengthAssessment} — ${aiAnalysis.evidenceGaps.length} gap(s), ${aiAnalysis.counterArguments.length} counter-argument(s)`,
      versionId,
    );
    return { ran: true };
  } catch (err) {
    console.error('[thesis] AI analysis failed for version', versionId, err);
    throw err;
  }
}
