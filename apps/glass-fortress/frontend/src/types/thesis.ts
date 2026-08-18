// Shared thesis types — used by thesis pages, call page, and modal components.

export interface ThesisSummary {
  id: string;
  title: string | null;
  createdAt: string;
  openGapCount: number;
  headVersion: {
    id: string;
    status: string;
    preview: string;
    mentionCount: number;
    strength: string | null;
    createdAt: string;
  } | null;
}

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
