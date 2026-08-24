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

// ---------------------------------------------------------------------------
// Provenance — how a thesis came to say what it says.
//
// docs/gf-thesis-provenance-ui-dev-plan.md. Mirrors the backend's
// services/thesisProvenance.ts, which parses the stored assessment JSON so
// nothing here ever parses prose: a client that parses prose is a client that
// breaks when the prose changes.
// ---------------------------------------------------------------------------

export type ProvenanceEventType =
  | 'SESSION_STARTED'
  | 'VERSION_CREATED'
  | 'GAP_RESOLVED'
  | 'AI_ANALYSIS_RUN'
  | 'NOTE'
  | 'SESSION_CLOSED'
  | 'FRAMING_PROPOSED'
  | 'FRAMING_ASSESSED'
  | 'THESIS_ATTACHED'
  | 'PUBLICATION_RATIONALE'
  | 'PUBLICATION_ASSESSED'
  | 'THESIS_PUBLISHED'
  | 'THESIS_UNPUBLISHED'
  | 'SESSION_CLOSED_BY_OTHER';

/**
 * Three states, deliberately — not two.
 *
 * `absent` is an event carrying no assessment. `malformed` is a record that
 * exists and cannot be read. Rendering the second as an empty section would say
 * "no contradictions were found", which is the opposite of what is true.
 */
export type ParsedAssessment<T> =
  | { state: 'ok'; value: T }
  | { state: 'malformed'; reason: string; raw: string }
  | { state: 'absent' };

export interface FramingContradiction {
  researcherClaim: string;
  whatEvidenceShows: string;
  fileHash: string;
}

export interface FramingAssessment {
  candidateFramings: {
    framing: string;
    scope: 'NARROW' | 'MODERATE' | 'BROAD';
    backedByFileHashes: string[];
    strength: string;
    weakness: string;
  }[];
  contradictions: FramingContradiction[];
  unverifiedAssumptions: { assumption: string; howToVerify: string }[];
  recommendedTopicString: string;
  assessment: string;
}

export interface PublicationAssessment {
  rationaleHasSubstance: boolean;
  substanceGaps: string[];
  verdict: 'SUPPORTS' | 'DISPUTES';
  objection: string;
  officialCapacityOk: boolean;
  characterClaims: string[];
  gapActionability: { gapIndex: number; namesDocument: boolean; namesHolder: boolean; note: string }[];
  assessment: string;
}

export interface ProvenanceEvent {
  id: string;
  type: ProvenanceEventType;
  createdAt: string;
  refId: string | null;
  /** Null for the two assessment types — their content is in the parsed fields. */
  description: string | null;
  framingAssessment?: ParsedAssessment<FramingAssessment>;
  publicationAssessment?: ParsedAssessment<PublicationAssessment>;
}

export interface ProvenanceSession {
  id: string;
  name: string;
  question: string | null;
  status: string;
  createdAt: string;
  closedAt: string | null;
  /** Null on sessions predating ownership — render as unknown, never as blank. */
  researcherId: string | null;
  researcherHandle: string | null;
  events: ProvenanceEvent[];
}

export interface ThesisProvenance {
  thesisId: string;
  sessions: ProvenanceSession[];
  counts: { sessions: number; events: number; malformedAssessments: number };
  /** True when no session was ever attached — a state, not a blank. */
  empty: boolean;
  recordedDissent: { sessionId: string; eventId: string; createdAt: string; objection: string }[];
}
