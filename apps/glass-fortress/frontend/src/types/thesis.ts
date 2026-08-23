// Shared thesis types — used by thesis pages, call page, and modal components.

// Which version the API served: the published one to the public, the head to
// an approved researcher. Mirrors backend lib/thesisView.ts.
export type ThesisViewer = 'PUBLIC' | 'RESEARCHER';

export interface PublicationState {
  isPublished: boolean;
  publishedVersionId: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  headVersionId: string | null;
  headIsPublished: boolean;
  versionsAhead: number;
}

export interface ThesisSummary {
  id: string;
  title: string | null;
  createdAt: string;
  openGapCount: number;
  publication: PublicationState;
  /** The version this viewer is served — published for the public, head for a researcher. */
  version: {
    id: string;
    status: string;
    preview: string;
    mentionCount: number;
    strength: string | null;
    createdAt: string;
  } | null;
}

export type PublicationCheckId =
  | 'HEAD_VERSION'
  | 'ANALYSIS_COMPLETE'
  | 'ANALYSIS_WELL_FORMED'
  | 'CITES_EVIDENCE'
  | 'EVIDENCE_CONFIRMED_AND_ANCHORED'
  | 'EVIDENCE_TIER'
  | 'FIGURES_HEDGED'
  | 'PUBLIC_INTEREST_STATEMENT'
  | 'CALL_LIVE'
  | 'RATIONALE_SUBSTANCE'
  | 'OFFICIAL_CAPACITY'
  | 'GAP_ACTIONABILITY'
  | 'FRAMING_ATTACHED';

export interface PublicationCheck {
  number: number;
  id: PublicationCheckId;
  kind: 'hard' | 'advisory';
  passed: boolean;
  summary: string;
  details?: unknown;
  binding?: boolean;
}

export interface PublicationReport {
  thesisId: string;
  headVersionId: string | null;
  publishedVersionId: string | null;
  checks: PublicationCheck[];
  hardFailures: PublicationCheckId[];
  advisoryFailures: PublicationCheckId[];
  publishable: boolean;
  verdict: 'SUPPORTS' | 'DISPUTES' | null;
  assessment: { objection: string; assessment: string } | null;
}

export type PublishOutcome =
  | { published: true; publishedVersionId: string; overObjection: boolean; advisoryFailures: PublicationCheckId[]; report: PublicationReport }
  | { published: false; refusedBy: PublicationCheckId[]; report: PublicationReport }
  | { published: false; error: string; explanation: string };

export interface EvidenceGap {
  description: string;
  impact: string;
  suggestedSearch: string;
}

export interface CounterArgument {
  claim: string;
  rebuttal: string;
  strength: string;
}

export interface AIAnalysis {
  counterArguments: CounterArgument[];
  evidenceGaps: EvidenceGap[];
  alternativeInterpretations: string[];
  overallStrengthAssessment: 'WEAK' | 'MODERATE' | 'STRONG' | 'COMPELLING';
  summaryHe: string;
}
