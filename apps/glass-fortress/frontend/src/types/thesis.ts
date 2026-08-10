// Shared thesis types — used by thesis pages, call page, and modal components.

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
