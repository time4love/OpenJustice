import type { ChunkSide } from '@/types/record';
import type { RecordNames } from '@/types/corpus';
import type { Citation } from '@/types/thesis';

// ---------------------------------------------------------------------------
// THE READ VIEW'S BODIES — hand-written from the appendices (docs/gf-ui-refactor-plan.md UI-8 :772–:773,
// §4 :960–:963), never from a live answer.
//
// The eleven gated reads and the clause each one is written from:
//   list_thesis_reviews      thesis A4 :1523          GET /api/research/reviews
//   list_evidence_reviews    evidence A4 :1146        GET /api/research/evidence-reviews
//   list_theses              thesis A4 :1429          GET /api/research/theses
//   get_thesis_context       thesis A4 :1476          GET /api/research/theses/:id
//   list_framings            thesis A4 :1432          GET /api/research/framings
//   get_framing              thesis A4 :1459          GET /api/research/framings/:id
//   get_debate               evidence A4 :1144        GET /api/research/debates/:sessionId
//   list_pages               interaction A5 :1071     GET /api/research/pages
//   list_captures            interaction A5 :1208     GET /api/research/pages/:id/captures
//   get_article_rules        interaction A5 :1199     GET /api/research/pages/:id/rules
//   get_rule_history         interaction A5 :1214     GET /api/research/pages/:id/rules/:ruleId/history
//
// AN INSTANT IS A STRING HERE AND A `Date` ON THE BACKEND. Every `at`, `createdAt`, `runAt`, `owedSince` and
// `surveyedAt` crosses the wire as JSON, so it arrives as an ISO string; the backend's own interfaces declare
// `Date` because that is what its Prisma rows hold. Writing `Date` here would be writing the server's type into
// the browser's, and `JSON.parse` never produces one.
//
// NO RESEARCHER ID ANYWHERE ON A THESIS READ (A4 :1476, "NEVER an id on the wire"). The walk's three reads are
// the exception the researcher ruled acceptable this step (R66 „Q6”): `createdById` and `researcherId` arrive on
// `get_rule_history` and are typed here because they are on the wire — no surface renders either, which is how
// `no-id-as-text` stays satisfied.
// ---------------------------------------------------------------------------

/** `P` — a researcher on the wire: a handle and whether the thesis is the caller's (A4 :1476). */
export interface Researcher {
  handle: string;
  mine: boolean;
}

/**
 * `M` — a model, its prompt version, and who spent the call (A2 :1317).
 *
 * BOTH FIELDS ARE NULLABLE AND THE NULL IS A FACT, not an omission: the debate assessor and the publication
 * assessor record neither today (`respondInDebate.ts` :65–:73, `publishThesis.ts` :121 — an A2 :1317 debt of the
 * WRITER). The page says the absence with `research.model.unrecorded` rather than drawing a blank beside rule
 * 3's label.
 */
export interface ModelVoice {
  model: string | null;
  promptVersion: string | null;
  spentBy: Researcher;
}

/** Who spoke — the three registers of ui §10 :377–:389, as the body discriminates them. */
export type Voice = ({ voice: 'RESEARCHER' } & Researcher) | ({ voice: 'MODEL' } & ModelVoice) | { voice: 'PLATFORM' };

/**
 * A record as evidence A1 names it — the page's URL and the archive names of its endpoints.
 *
 * `RecordNames` IS CALLED, never re-spelled: the capture/diff naming is one concept and `types/corpus.ts`
 * already holds it for the public surfaces. What the gated reads add is the `url`, because a reviewer reading
 * an owed entry has no page in hand.
 */
export type NamedRecord = { url: string } & RecordNames;

/** The four state words of ui §11 :398–:399, as ONE union — the same one `list_theses` and the working view answer. */
export type ThesisState =
  | { kind: 'DRAFT_ONLY' }
  | { kind: 'PUBLISHED_IS_HEAD' }
  | { kind: 'PUBLISHED_BEHIND'; versionsAhead: number }
  | { kind: 'WITHDRAWN'; at: string; reason: string };

/** A gap's decision — the six words of A3 :1381–:1383, which `readsAs` and a decision row both carry. */
export const GAP_DECISIONS = ['OPEN', 'CITED', 'REQUESTED', 'CALLED', 'CONCEDED', 'DISMISSED'] as const;
export type GapDecision = (typeof GAP_DECISIONS)[number];

/**
 * THE ASSESSOR'S VERDICT — two words, or none.
 *
 * `promotionAssessor.ts` :58 and `publicationAssessor.ts` :42 enumerate them, and A2 :1335 stores NOT_REACHED as
 * null. The frozen copy has exactly two words (`research.verdict.SUPPORTS`, `research.verdict.DISPUTES`) and
 * says a null verdict renders NO word — so a third value is a drift and the parser says so by name.
 */
export const ASSESSOR_VERDICTS = ['SUPPORTS', 'DISPUTES'] as const;
export type AssessorVerdict = (typeof ASSESSOR_VERDICTS)[number];

/** The seven outcomes of a work-list row (interaction A2), in the order the backend's one list holds them. */
export const OUTCOMES = ['UNFETCHED', 'UNSERVABLE', 'IDENTICAL', 'DUPLICATE', 'ACQUIRED', 'PENDING_JUDGEMENT', 'SKIPPED'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** A stop's gates (interaction A2; `walk/stop.ts` :12). `DIGEST` is a gate like the numbered five. */
export const GATES = [0, 1, 2, 4, 5, 'DIGEST'] as const;
export type Gate = (typeof GATES)[number];

// ---------------------------------------------------------------------------
// THE TRANSCRIPT — thesis §9 :974 and A4 :1476. Seventeen kinds, a closed union, one body each.
// ---------------------------------------------------------------------------

/**
 * THE SEVENTEEN KINDS (A4 :1476): "a kind absent from this list is not in the transcript; a kind added
 * (document flows' ARRIVED) is added HERE first." The array's order is the order the acts happen in, and it is
 * the tie-break inside one instant.
 */
export const TURN_KINDS = [
  'FRAMING_OPENED',
  'ROUND_PROPOSED',
  'ROUND_ASSESSED',
  'ROUND_CHOSEN',
  'VERSION',
  'DEBATE_OPENED',
  'RATIONALE',
  'ASSESSMENT',
  'RESPONSE',
  'DEBATE_CLOSED',
  'ANALYSIS',
  'GAP_DECISION',
  'PUBLICATION_RATIONALE',
  'PUBLICATION_ASSESSMENT',
  'PUBLICATION_VERDICT',
  'WITHDRAWAL',
  'NOTE',
] as const;
export type TurnKind = (typeof TURN_KINDS)[number];

/** The eight threads a turn can belong to — a step and that step's own id. */
export const THREAD_STEPS = ['FRAMING', 'VERSION', 'DEBATE', 'ANALYSIS', 'GAP', 'PUBLICATION', 'WITHDRAWAL', 'NOTE'] as const;
export type ThreadStep = (typeof THREAD_STEPS)[number];

export interface Thread {
  step: ThreadStep;
  id: string;
}

/** One element of a framing, and the records that fill it — or MISSING (A2 :1305). */
export interface ElementFill {
  element: string;
  records: string[] | 'MISSING';
}

/**
 * A citation of HEAD or PUBLISHED — `A4 :1476`'s `V.mentions`, and it is the PUBLIC `Citation` and not a
 * narrower cousin.
 *
 * RE-SHAPED 2026-09-22 (R73 chunk 2), and the appendix is not gaining a requirement — this file is catching
 * up with one it already carried. A4 :1476 as amended 2026-09-21 ("option (a)") rules that `V.mentions` is
 * RESOLVED, *"the `V` shape is now the ONE citation shape, public and gated, so the thesis column (ui §17,
 * UI-5's `components/thesis/*`) is CALLED by the working view with no second read and no second chip"*.
 * What stood here was `{ kind, name, pin, argued }` — the CODE's narrower sense of "resolved", which is the
 * failure ui §6.1 :248 is the precedent for: an envelope read off an implementation states what is SERVED,
 * never what is OWED. The backend has served the wide shape since R70 (`getThesisContext.ts` :71); only this
 * reader was narrow, and it DROPPED `record`, `content`, `verified`, `flag` and `overObjection` in silence.
 *
 * `currency` IS ABSENT ON PURPOSE. A4 :1476 dropped it from the wire on 2026-09-21: it had been written onto
 * the `resolves: false` arm, where a currency cannot exist, and no reader consumes a mention's currency —
 * `OwedStrip.tsx` reads `review.state` from a thesis REVIEW, not from a mention. With it gone the gated
 * TRAJECTORY arm is EXACTLY the public `TrajectoryCitation`, which is what one citation shape was meant to mean.
 */
export type Mention = Citation;

/**
 * A cited trajectory's standing against the newest pass (`trajectoryCitation.ts` :54–:76).
 *
 * The four states are narrowed; everything else each arm carries is the pass's own material and is not narrowed
 * here — no surface of this step renders it, and a parser nothing exercises is a parser nothing proves
 * (`lib/corpusBody.ts` :38–:41).
 */
export interface TrajectoryCurrency {
  state: 'PINNED_IS_LATEST' | 'RECOMPUTED_AGREES' | 'RECOMPUTED_DISAGREES' | 'NOT_FOLLOWED_BY_LATEST';
}

export interface FramingOpenedBody {
  question: string;
  provision: string | null;
  fromRunId: string | null;
}

/** `malformed` is on the three round bodies because the stored Json may not be an object; it is SAID, never smoothed to `{}` (A4 :1459). */
export interface RoundProposedBody {
  malformed: boolean;
  framing: string | null;
  elements: ElementFill[] | null;
}

export interface RoundAssessedBody {
  malformed: boolean;
  /** The ASSESSED content with its marks (A2 :1306–:1309) — a model's Json, rendered inside the labelled container and narrowed where it is rendered. */
  content: Record<string, unknown> | null;
}

export interface RoundChosenBody {
  malformed: boolean;
  claim: string | null;
  provision: string | null;
  elements: ElementFill[] | null;
  /** The versions whose claim restates the chosen one character for character (CLAIM_FRAMED, A3 :1366). */
  restatedBy: string[];
}

/**
 * A VERSION TURN'S MENTION — THE STORED ROW, not the resolved citation (RULED 2026-09-20, R67 Q-D; A4 :1476).
 *
 * TWO SHAPES OF ONE WORD ON ONE READ, and this is the one that surprised a parser: `head.mentions` and
 * `published.mentions` are RESOLVED (`{ kind, name, pin, argued }`, through `ResolvedMention`), because the
 * page draws a chip with its pin and its ARGUED mark. A VERSION turn in the transcript carries the row as it
 * was stored — `thesisPredicates.ts` :636 selects exactly these five and `thesisTranscript.ts` :558–:566
 * passes them through untouched — because a turn is what happened, not what it resolves to now.
 */
export interface VersionMentionRow {
  versionId: string;
  kind: 'EVIDENCE' | 'TRAJECTORY';
  name: string;
  contentVersionHash: string | null;
  debateSessionId: string | null;
}

export interface VersionBody {
  text: string;
  claim: string;
  contentHash: string;
  parentVersionId: string | null;
  mentions: VersionMentionRow[];
  citationsVsParent: { added: string[]; repinned: string[]; dropped: string[]; carried: string[] };
}

export interface DebateOpenedBody {
  sessionId: string;
  /** Null only for a session whose key resolves to nothing — a malformed row (`debateState.ts` :47–:53). */
  record: NamedRecord | null;
  pin: string | null;
}

/** RATIONALE and RESPONSE — the researcher's words, and nothing else. */
export interface TextBody {
  text: string;
}

/**
 * The debate assessment, the event's Json PARSED (A4 :1476).
 *
 * `hasSubstance`, `substanceGaps`, `objection` and `assessment` are the model's own material and stay `unknown`:
 * the appendix names them and spells none, and every one of them renders inside `LabelledOpinion` or not at all.
 * `verdict` is narrowed because the page draws a WORD for it from the frozen copy.
 */
export interface AssessmentBody {
  malformed: boolean;
  hasSubstance: unknown;
  substanceGaps: unknown;
  verdict: AssessorVerdict | null;
  objection: unknown;
  assessment: unknown;
}

export interface DebateClosedBody {
  outcome: 'PROMOTED' | 'ABANDONED';
  overObjection: boolean;
  evidenceFileHash: string | null;
}

export interface AnalysisBody {
  analysisId: string;
  inputFingerprint: string;
  current: boolean;
  /** The critic's opinion — inside the labelled container, narrowed by the surface that draws it. */
  opinion: unknown;
}

export interface GapDecisionBody {
  gapId: string;
  description: string;
  sequence: number;
  decision: GapDecision;
  citedName: string | null;
  /** A REQUESTED request is the researcher's approved text (T4 :670–:672); its fields are the appeals pane's. */
  request: unknown;
  callItem: unknown;
  reason: string | null;
  earlier: { sequence: number; decision: GapDecision; at: string }[];
}

export interface PublicationRationaleBody {
  attemptId: string;
  rationale: string;
}

export interface PublicationAssessmentBody {
  attemptId: string;
  assessment: unknown;
  verdict: AssessorVerdict | null;
}

export interface PublicationVerdictBody {
  attemptId: string;
  outcome: 'PUBLISHED' | 'REFUSED';
  refusedBy: string[];
}

export interface WithdrawalBody {
  versionId: string;
  /** Shown here and never publicly (T6 :916). */
  reason: string;
}

export interface NoteBody {
  text: string;
  on: 'THESIS' | 'FRAMING';
}

interface TurnBase {
  id: string;
  at: string;
  thread: Thread;
  by: Voice;
  /**
   * The turn's identifying DATUM, verbatim — or null where the kind and the body name it (A4 :1476, „Q1 datum”).
   * It is NEVER a sentence the backend authored: the page composes every phrase of ui §11's table from `body`
   * through the frozen `research.line.*` strings.
   */
  line: string | null;
}

export type Turn =
  | (TurnBase & { kind: 'FRAMING_OPENED'; body: FramingOpenedBody })
  | (TurnBase & { kind: 'ROUND_PROPOSED'; body: RoundProposedBody })
  | (TurnBase & { kind: 'ROUND_ASSESSED'; body: RoundAssessedBody })
  | (TurnBase & { kind: 'ROUND_CHOSEN'; body: RoundChosenBody })
  | (TurnBase & { kind: 'VERSION'; body: VersionBody })
  | (TurnBase & { kind: 'DEBATE_OPENED'; body: DebateOpenedBody })
  | (TurnBase & { kind: 'RATIONALE'; body: TextBody })
  | (TurnBase & { kind: 'ASSESSMENT'; body: AssessmentBody })
  | (TurnBase & { kind: 'RESPONSE'; body: TextBody })
  | (TurnBase & { kind: 'DEBATE_CLOSED'; body: DebateClosedBody })
  | (TurnBase & { kind: 'ANALYSIS'; body: AnalysisBody })
  | (TurnBase & { kind: 'GAP_DECISION'; body: GapDecisionBody })
  | (TurnBase & { kind: 'PUBLICATION_RATIONALE'; body: PublicationRationaleBody })
  | (TurnBase & { kind: 'PUBLICATION_ASSESSMENT'; body: PublicationAssessmentBody })
  | (TurnBase & { kind: 'PUBLICATION_VERDICT'; body: PublicationVerdictBody })
  | (TurnBase & { kind: 'WITHDRAWAL'; body: WithdrawalBody })
  | (TurnBase & { kind: 'NOTE'; body: NoteBody });

// ---------------------------------------------------------------------------
// get_thesis_context — thesis A4 :1476
// ---------------------------------------------------------------------------

/** HEAD or PUBLISHED, with its text and its resolved mentions. */
export interface VersionView {
  versionId: string;
  by: Researcher;
  text: string;
  claim: string;
  contentHash: string;
  createdAt: string;
  mentions: Mention[];
}

/** One gap and the decision in force — the row WITHOUT `researcherId` (RULED 2026-09-20, „inForce approved”). */
export interface GapEntry {
  gapId: string;
  readsAs: GapDecision;
  inForce: {
    id: string;
    thesisId: string;
    versionId: string;
    gapId: string;
    description: string;
    sequence: number;
    decision: GapDecision;
    citedName: string | null;
    request: unknown;
    callItem: unknown;
    reason: string | null;
    createdAt: string;
  };
  by: Researcher;
}

export type AnalysisState =
  | { state: 'NONE'; fingerprint?: string }
  | { state: 'AWAITING_DERIVATION'; name: string }
  | { state: 'CURRENT'; fingerprint: string; analysisId: string; runAt: string; by: ModelVoice; opinion: unknown }
  | { state: 'STALE'; fingerprint: string; latest: { analysisId: string; inputFingerprint: string; runAt: string } };

export interface ThesisContext {
  thesis: {
    thesisId: string;
    provision: string | null;
    by: Researcher;
    headVersionId: string | null;
    publishedVersionId: string | null;
    publishedAt: string | null;
    publicInterestStatement: string | null;
    createdAt: string;
    state: ThesisState;
  };
  head: VersionView | null;
  published: VersionView | null;
  /**
   * THE CITED PAGES — the UNION of HEAD's and PUBLISHED's, DEDUPLICATED BY URL (A4 :1476, ruled 2026-09-21).
   *
   * It is the union and not HEAD's because the centre draws HEAD's text with PUBLISHED one toggle away, and
   * BOTH texts' chips resolve their page from this one list: a list covering one version loses every link on
   * the toggle. A page named here that the version on screen does not cite is harmless — the lookup is BY URL.
   *
   * WHO CONSUMES IT: `PaneTabs.tsx` :59, which hands `pageId` to `RecordPane` for the record's one link
   * onward to `/corpus?page=`. `ThesisText.tsx` :49 also computes a `pageId` from it, and that value is
   * discarded by `CitationChip` — recorded, measured and reported; it is not this parser's business.
   */
  pages: { trackedUrlId: string; url: string }[];
  unargued: string[];
  gapList: GapEntry[];
  analysis: AnalysisState;
  framings: { framingId: string; question: string; provision: string | null; by: Researcher; createdAt: string }[];
  history: Turn[];
  /**
   * WHAT THIS THESIS OWES — A4 :1476, ruled 2026-09-22 (the researcher, R71); ui §11 :402.
   *
   * `owed` IS THE COUNT AND `reviews` THE ENTRIES, mirroring A4 :1523 — one name, one meaning, on both
   * `/api/research/*` envelopes this file parses. The page used to read `/api/research/reviews` a second time and
   * keep the entries naming this thesis; that read is gone.
   *
   * The ROW is `ThesisOwedEntry` — `E` with the record and `owedSince` paired by kind, all of it free.
   */
  owed: number;
  reviews: ThesisOwedEntry[];
}

// ---------------------------------------------------------------------------
// get_framing — thesis A4 :1459 · get_debate — evidence A4 :1144
// ---------------------------------------------------------------------------

/** `rounds` and `researcherId` are RETIRED with the builder: one shape, three doors. */
export interface FramingRead {
  framingId: string;
  question: string;
  provision: string | null;
  thesisId: string | null;
  by: Researcher;
  turns: Turn[];
}

export interface DebateRead {
  sessionId: string;
  thesisId: string;
  fileHash: string;
  record: NamedRecord | null;
  status: string;
  hasSubstance: boolean;
  verdict: AssessorVerdict | null;
  canPromote: boolean;
  blockedBy: string[];
  promotedOverObjection: boolean;
  evidenceFileHash: string | null;
  turns: Turn[];
}

// ---------------------------------------------------------------------------
// list_theses — thesis A4 :1429 · list_framings — thesis A4 :1432
// ---------------------------------------------------------------------------

/**
 * One row of the researcher's list.
 *
 * `author` and `mine` are REQUIRED here because the read view's route fixes `scope: 'all'`
 * (`researchRoutes.ts` :38) and the envelope gives both at `all`. A row without them is a body answered at
 * `mine`, which this door cannot produce — so it is a drift and it fails by name rather than rendering a row
 * whose author the page would have to invent.
 */
export interface ThesisRow {
  thesisId: string;
  state: ThesisState;
  claim: string | null;
  provision: string | null;
  headVersionId: string | null;
  publishedVersionId: string | null;
  headIsPublished: boolean;
  framingIds: string[];
  unarguedMentions: number;
  openGaps: number;
  author: string;
  mine: boolean;
}

export interface PublishedRow {
  thesisId: string;
  claim: string;
  provision: string | null;
  publishedAt: string | null;
  author: string;
  contentHash: string;
}

export interface ThesesList {
  theses: ThesisRow[];
  published: PublishedRow[];
}

export interface FramingRow {
  framingId: string;
  question: string;
  provision: string | null;
  author: string;
  thesisId: string | null;
  openedAt: string;
  rounds: number;
  /** The highest-sequence round, or null on a framing with no round yet. */
  latest: { sequence: number; type: 'PROPOSED' | 'ASSESSED' | 'CHOSEN' } | null;
  claim: string | null;
}

// ---------------------------------------------------------------------------
// list_thesis_reviews — thesis A4 :1523 · list_evidence_reviews — evidence A4 :1146
// ---------------------------------------------------------------------------

/** A unit of a version's computed content (`evidencePredicates.ts` :225). A capture's segment has no side. */
export interface ContentUnit {
  side?: ChunkSide | 'ABSENT';
  text: string;
  survival?: 'SURVIVES' | 'CONTRADICTED' | 'UNCHECKABLE';
}

export interface ContentVersion {
  hash: string;
  chunks: ContentUnit[];
}

export interface Moved {
  entered: ContentUnit[];
  left: ContentUnit[];
}

/** Why the content moved — a UNION, accumulated, never one object (evidence A4 :1146). */
export type Cause =
  | { kind: 'DECISION'; capture: string; decisionId: string; decisionType: string; waybackTimestamp: string | null; sequence: number; at: string }
  | { kind: 'EXTRACTOR'; capture: string; from: string; to: string; at: string }
  | { kind: 'DIFF_VERSION'; from: string; to: string; at: string }
  | { kind: 'UNREADABLE'; capture: string; reason: string };

export const FLAG_REASONS = ['WITHDRAWN', 'NOT_CITATION_CURRENT', 'AWAITING_DERIVATION'] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

/** Where a review's subject is cited — a version, and whether the public sees it. */
export interface CitedOn {
  versionId: string;
  published: boolean;
}

/**
 * ONE THING OWED, AS THE ENTRY ALONE — thesis A4's `E`, the union BOTH gated doors are built on.
 *
 * THE TWO DOORS SERVE THE SAME `E` AND NOT THE SAME ROW, and each row says which fields it adds: `ThesisReview`
 * below is A4 :1523's, `ThesisOwedEntry` is A4 :1476's. Everything the working view adds is FREE from the rows
 * that read already loads; everything the list adds costs it reads of its own.
 */
export type ThesisReviewEntry =
  | {
      kind: 'FLAGGED';
      thesisId: string;
      name: string;
      versionId: string;
      mentionId: string;
      reasons: FlagReason[];
      command: string;
    }
  | {
      kind: 'STALE_TRAJECTORY';
      thesisId: string;
      /** The trajectory id — rendered in a COPY control, never as a text node (§4 :167). */
      name: string;
      citedOn: CitedOn[];
      state: TrajectoryCurrency['state'];
      command: string;
    }
  | {
      kind: 'UNARGUED';
      thesisId: string;
      name: string;
      versionId: string;
      mentionId: string;
      command: string;
    };

/** FLAGGED's material: the pin beside CURRENT, what moved, why, and what E3 last decided about the record. */
export interface FlaggedMaterial {
  versionId: string;
  record: NamedRecord;
  pin: ContentVersion;
  current: ContentVersion | null;
  moved: Moved | null;
  cause: Cause[];
  /** E3's last decision about the record, or none — its fields are the decision pane's, not this step's. */
  decision: unknown;
}

/** STALE_TRAJECTORY's material: the cited pass beside the newest one. */
export interface StaleMaterial {
  citedOn: CitedOn[];
  /** The cited pass; `changes` is the pass's own material and is not narrowed here. */
  cited: { claimText: string; url: string; finalState: string; changes: unknown; computation: { id: string; computedAt: string } };
  currency: TrajectoryCurrency;
}

/** UNARGUED's material: the citation to argue — the record at its pin. */
export interface UnarguedMaterial {
  versionId: string;
  record: NamedRecord;
  pin: string;
}

/**
 * A4 :1476's ROW — `E` plus the RECORD and `owedSince`, **PAIRED PER KIND** (the researcher, 2026-09-22,
 * „approve c, rule the record in”).
 *
 *   FLAGGED           { record, owedSince: null }   its date AND its material are the CITATION SHEET's (§11 :404)
 *   UNARGUED          { record, owedSince }         the date is HEAD's own `createdAt`
 *   STALE_TRAJECTORY  { record: null, owedSince }   a trajectory has no record — `/research`'s shape for the arm
 *
 * THREE ARMS AND NOT TWO NULLABLE FIELDS. `record: R | null` beside `owedSince: ISO | null` describes FOUR
 * combinations where the appendix names three, and a type that admits a shape the design does not is a type
 * read off an implementation. FLAGGED carries no date because computing it needs `decision.at` and
 * `material.movedAt` — evidence-side rows this read never loads — and `publishedAt` alone is a LOWER BOUND,
 * which would claim a flag had been open longer than it has.
 */
export type ThesisOwedEntry =
  | (Extract<ThesisReviewEntry, { kind: 'FLAGGED' }> & { record: NamedRecord; owedSince: null })
  | (Extract<ThesisReviewEntry, { kind: 'UNARGUED' }> & { record: NamedRecord; owedSince: string })
  | (Extract<ThesisReviewEntry, { kind: 'STALE_TRAJECTORY' }> & { record: null; owedSince: string });

/** A4 :1523's element — the entry, the instant it became owed, the material, and whose thesis it is on. */
export type ThesisReview = {
  owedSince: string;
  author: string;
  mine: boolean;
} & (
  | (Extract<ThesisReviewEntry, { kind: 'FLAGGED' }> & { material: FlaggedMaterial })
  | (Extract<ThesisReviewEntry, { kind: 'STALE_TRAJECTORY' }> & { material: StaleMaterial })
  | (Extract<ThesisReviewEntry, { kind: 'UNARGUED' }> & { material: UnarguedMaterial })
);

export interface ThesisReviewList {
  owed: number;
  reviews: ThesisReview[];
}

/** One citation of the record, on a head or published version (`evidenceReviews.ts` :92). */
export interface EvidenceCitation {
  thesisId: string;
  versionId: string;
  published: boolean;
  argument: { debateSessionId: string; argued: boolean } | null;
}

export interface EvidenceReview {
  kind: 'CONTENT_MOVED';
  fileHash: string;
  record: NamedRecord;
  owedSince: string;
  decisionSequence: number;
  affirmed: ContentVersion;
  current: ContentVersion;
  moved: Moved;
  cause: Cause[];
  citedBy: EvidenceCitation[];
  /** DIFF only — a capture record is never narrowed. Its members are the narrowing pane's, not this step's. */
  narrowed: unknown;
  /** §29 :892–:894's plural: an evidence review draws one COPY control per command. */
  commands: string[];
}

export const NOT_EVALUABLE_REASONS = ['AWAITING_DERIVATION', 'AFFIRMED_VERSION_MISSING'] as const;
export type EvidenceNotEvaluableReason = (typeof NOT_EVALUABLE_REASONS)[number];

export interface NotEvaluable {
  fileHash: string;
  record: NamedRecord | null;
  reason: EvidenceNotEvaluableReason;
  detail: string;
}

export interface EvidenceReviewList {
  owed: number;
  reviews: EvidenceReview[];
  notEvaluable: NotEvaluable[];
}

// ---------------------------------------------------------------------------
// The walk's four reads — interaction A5 :1071, :1199, :1208, :1214
// ---------------------------------------------------------------------------

export interface PageEntry {
  trackedUrlId: string;
  url: string;
  public: boolean;
  title: string | null;
  surveyedAt: string;
  total: number;
  outcomes: Record<Outcome, number>;
  /** Through the one function `pendingStopOf` — the page derives nothing (ui §29 :908's fact). */
  stopPending: boolean;
}

export interface CaptureRow {
  capture: string;
  snapshotDate: string;
  outcome: Outcome;
  digest: string;
  comparedTo: string | null;
  rulesetId: string | null;
  snapshotId: string | null;
  stale: boolean;
  stopGates: Gate[] | null;
}

export interface ArticleRule {
  ruleId: string;
  selector: string;
  validFrom: string;
  validTo: string | null;
  trusted: boolean;
  lastMatched: string | null;
}

/**
 * The stop waiting on this page.
 *
 * `markingUrl` IS ON THE WIRE and the read view renders it as NO ANCHOR (ui §31 :925): the instructions come
 * from the chat before the URL does (MARKING :576–:578). It is typed here so the fixture can carry it, which is
 * what makes `no-marking-link-from-research` an absence over something rather than over nothing.
 */
export interface PendingStop {
  capture: string;
  gates: { gate: Gate; material: unknown }[];
  markingUrl: string;
}

export interface ArticleRules {
  rules: ArticleRule[];
  pendingStop: PendingStop | null;
  counts: Record<Outcome, number>;
  stale: number;
  /** A COUNT on the wire, where the clause's `returns` says "every decision on the page" (A5 :1199). */
  decisions: number;
  lastDecisionAt: string | null;
}

export interface RuleDecision {
  type: string;
  waybackTimestamp: string | null;
  /** On the wire and rendered by nothing — the walk's reads still carry ids (R66 „Q6”, an issue filed). */
  researcherId: string;
  createdAt: string;
}

export interface RuleMatch {
  capture: string;
  outcome: Outcome;
  matchedNodes: number;
  /** The lines the rule removed; null where the corpus holds no body — null is a fact, `[]` a different claim. */
  removed: string[] | null;
  removedCount: number | null;
}

export interface RuleHistory {
  rule: {
    ruleId: string;
    selector: string;
    validFrom: string;
    validTo: string | null;
    trusted: boolean;
    createdAt: string;
    createdById: string;
    decisions: RuleDecision[];
  };
  matches: RuleMatch[];
}
