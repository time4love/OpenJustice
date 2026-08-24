import { z } from 'zod';
import { DevilsAdvocateOutputSchema } from './DevilsAdvocateAgent';

// ---------------------------------------------------------------------------
// The Call for Whistleblowers is DERIVED, never stored: one public appeal per
// entry in a version's Devil's Advocate evidenceGaps[]. A version with no gaps
// produces no appeal at all.
//
// One derivation, used by get_whistleblower_call (what the tool reports) and by
// the publication gate's check 9 (the call must be live to publish). Two copies
// would be two answers to "is the call live?", and only one could be right.
// ---------------------------------------------------------------------------

export interface CallVersion {
  id: string;
  status: string;
  aiAnalysis: unknown;
  gapResolutions: { gapIndex: number; evidenceId: string }[];
}

export interface CallGap {
  gapIndex: number;
  description: string;
  suggestedSearch: string;
  /** True once a whistleblower submission or vault hit has been linked to this gap. */
  resolved: boolean;
  resolvedByFileHash: string | null;
}

export type CallState =
  | { isLive: false; reason: 'NO_HEAD_VERSION' }
  | { isLive: false; reason: 'ANALYSIS_INCOMPLETE'; versionId: string }
  | { isLive: false; reason: 'ANALYSIS_SHAPE_INVALID'; versionId: string; details: unknown }
  | { isLive: false; reason: 'NO_GAPS'; versionId: string; currentStrength: string; gaps: [] }
  | { isLive: true; reason: 'LIVE'; versionId: string; currentStrength: string; gaps: CallGap[] };

export function deriveCallState(version: CallVersion | null): CallState {
  if (!version) return { isLive: false, reason: 'NO_HEAD_VERSION' };

  if (version.status !== 'COMPLETE' || version.aiAnalysis === null) {
    return { isLive: false, reason: 'ANALYSIS_INCOMPLETE', versionId: version.id };
  }

  // LLM output read back out of a Json column: validated rather than cast, or a
  // shape change would surface as a silently empty call rather than an error.
  const parsed = DevilsAdvocateOutputSchema.safeParse(version.aiAnalysis);
  if (!parsed.success) {
    return {
      isLive: false,
      reason: 'ANALYSIS_SHAPE_INVALID',
      versionId: version.id,
      details: z.treeifyError(parsed.error),
    };
  }

  const analysis = parsed.data;
  const resolutions = new Map(version.gapResolutions.map((r) => [r.gapIndex, r.evidenceId]));
  const gaps: CallGap[] = analysis.evidenceGaps.map((gap, gapIndex) => ({
    gapIndex,
    description: gap.description,
    suggestedSearch: gap.suggestedSearch,
    resolved: resolutions.has(gapIndex),
    resolvedByFileHash: resolutions.get(gapIndex) ?? null,
  }));

  if (gaps.length === 0) {
    return {
      isLive: false,
      reason: 'NO_GAPS',
      versionId: version.id,
      currentStrength: analysis.overallStrengthAssessment,
      gaps: [],
    };
  }

  return {
    isLive: true,
    reason: 'LIVE',
    versionId: version.id,
    currentStrength: analysis.overallStrengthAssessment,
    gaps,
  };
}
