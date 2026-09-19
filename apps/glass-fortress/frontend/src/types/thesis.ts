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

// ---------------------------------------------------------------------------
// THE PUBLIC BODIES — docs/gf-thesis-flows.md A5 :1565–:1570 and A4 :1501–:1504, as the routes of UI-3 answer
// them; docs/gf-ui-flows.md §16 :507–:515, §17, §20. HAND-WRITTEN FROM THE APPENDIX (UI plan §4 :880–:883): the
// backend's own types are never imported, so a body that drifts from the appendix fails at the parser
// (`lib/thesisBody.ts`), loudly, instead of rendering half a page.
//
// The types above this line are the LEGACY thesis surface. They go at UI-10 with the pages that read them.
// ---------------------------------------------------------------------------

/** A citation as a version lists it: which record, at which pinned content version (thesis A4 :1471). */
export interface CitationRef {
  kind: string;
  name: string;
  pin: string | null;
}

export interface EvidenceRecord {
  url: string;
  /** A CAPTURE names one timestamp; a DIFF names the pair it spans (§18 :567). */
  capture?: string;
  before?: string;
  after?: string;
}

export type CitedContent =
  | { kind: 'CAPTURE'; text: string }
  | { kind: 'DIFF'; chunks: { side: string; text: string }[] };

export type CitationVerdict =
  | { verified: boolean; captures: { capture: string; attributed: boolean | null; anchoredHashMatchesDocumentHash: boolean }[] }
  | { notEvaluable: string };

export interface EvidenceCitation {
  kind: 'EVIDENCE';
  name: string;
  pin: string | null;
  record: EvidenceRecord;
  content: CitedContent;
  verified: CitationVerdict;
  flag: { flagged: boolean; reasons: string[] };
  argued: boolean;
  /** The FACT that the citation was promoted over the assessor's objection — never the objection (T5 :816). */
  overObjection: boolean;
}

export type TrajectoryCitation =
  | { kind: 'TRAJECTORY'; name: string; resolves: true; claimText: string; url: string; transitions: number; current: boolean }
  | { kind: 'TRAJECTORY'; name: string; resolves: false };

export type Citation = EvidenceCitation | TrajectoryCitation;

export interface CallItem {
  whatIsNeeded: string;
  whoWouldHaveSeenIt: string;
  unit: string;
  window: string;
}

export interface RequestItem {
  text: string;
  authority: string;
  legalBasis: string;
  addresses: string[];
  restsOn: string[];
}

export type HistoryEntry =
  | { versionId: string; contentHash: string; publishedAt: string; citations: CitationRef[] }
  | { versionId: string; contentHash: string; publishedAt: string; withdrawn: true; withdrawnAt: string };

/**
 * ONE ROW OF THE PUBLIC THESIS LIST — thesis A4 :1427, the anonymous answer of `list_theses`:
 * `{ thesisId, claim, provision, publishedAt, author: handle, contentHash }`, for theses with PUBLISHED(t).
 *
 * FIVE OF THE SIX, AND `contentHash` IS DELIBERATELY ABSENT. The row never renders it — §4 :168 forbids a hash
 * as text, and the VERIFY disclosure that carries one belongs to the thesis page — so narrowing it here would
 * be `corpusBody.ts`'s own objection: a parser nothing exercises is a parser nothing proves.
 *
 * `publishedAt` IS NULLABLE because the route's own read is: `publishedEntries()` filters on
 * `publishedVersionId: { not: null }` and selects `publishedAt` separately, so the two can disagree.
 */
export interface ThesisListRow {
  thesisId: string;
  claim: string;
  provision: string | null;
  publishedAt: string | null;
  author: string;
}

export interface PublishedThesis {
  thesisId: string;
  publicInterestStatement: string | null;
  claim: string;
  provision: string | null;
  version: { versionId: string; text: string; contentHash: string; publishedAt: string | null; author: string };
  citations: Citation[];
  appeals: { call: CallItem[]; requests: RequestItem[]; intake: string };
  rationale: string;
  overObjection: boolean;
  analysisRun: boolean;
  history: HistoryEntry[];
  pages: { trackedUrlId: string; url: string }[];
}

/** The notice where a withdrawn page was: the date alone (T6 :915–:917). */
export interface WithdrawnNotice {
  thesisId: string;
  withdrawn: true;
  withdrawnAt: string;
}

/** A version that was ever published — the history's read (A5 :1570). */
export interface PublishedVersion {
  thesisId: string;
  versionId: string;
  text: string;
  contentHash: string;
  publishedAt: string;
  citations: CitationRef[];
}

/** `get_whistleblower_call`'s answer (A4 :1501–:1504): the appeals of the published version, or `{ live: false }`. */
export type WhistleblowerCall =
  | { live: false }
  | { live: true; thesisId: string; publishedVersionId: string; call: CallItem[]; requests: RequestItem[]; intake: string };

export type ThesisBody = PublishedThesis | WithdrawnNotice;
export type VersionBody = PublishedVersion | WithdrawnNotice;

export const isWithdrawn = (body: { withdrawn?: unknown }): body is WithdrawnNotice => body.withdrawn === true;
