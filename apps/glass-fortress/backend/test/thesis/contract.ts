import type { ContentVersionProvenance, RecordContent } from '../../src/services/evidencePredicates';
import type { TrajectoryCurrency } from '../../src/services/trajectoryCitation';

// ---------------------------------------------------------------------------
// THE THESIS CONTRACT, TRANSCRIBED FOR THE ACCEPTANCE SUITE — docs/gf-thesis-flows.md
// A2, A4, A6 and A7, composed with evidence A1–A7 and document A6.
//
// WHY A TRANSCRIPTION EXISTS AT ALL. The suite TYPES against A2's target, and the
// generated Prisma client does not have those models until thesis step 18; a type
// imported from an absent module would sink its file (test/thesis/absent.ts says
// why). So the rows are declared here, and so are the SPEC SIDE of every equality
// the suite polices: each tool's closed refusal set, the gate's ids and kinds, the
// module every case loads and the step that owes it. When step 18 lands the
// models, that step replaces the row types with Prisma's generated ones.
//
// ONE VALUE, ONE PLACE. A module path, a tool's code set and a check id each live
// here once; a builder step that renames a path or amends a code edits one line.
//
// THE RULINGS THIS FILE ENCODES (handoffs/R40-chunk-1-sketch.md, rounds 2–3):
// NO_THESIS on every tool taking a `thesisId`, ordered NO_RESEARCHER · NO_THESIS ·
// NOT_AUTHOR (Q2; the order extends step 13's ruling 5, §6-14); NO_FRAMING coined
// for a `framingId` naming none (§6-12, Q3a); `get_whistleblower_call` refuses
// nothing (Q3b); STALE_PIN on the version write, the race guard (Q1); `create_thesis`
// narrowed (§6-13); a code whose only arm crosses a model is OWED, never dropped.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// A2 — THE ROWS, AS THE TARGET SHAPES THEM.
// ---------------------------------------------------------------------------

/** A value from the ONE provision table (A1) — `lib/provisions.ts` at step 18. */
export type Provision = string;

export type ThesisRow = {
  id: string;
  provision: Provision | null;
  createdById: string;
  headVersionId: string | null;
  publishedVersionId: string | null;
  publishedAt: Date | null;
  publishedById: string | null;
  publicInterestStatement: string | null;
  createdAt: Date;
};

/** Immutable after the write: no column is ever updated (A2, `versions-immutable`). */
export type ThesisVersionRow = {
  id: string;
  thesisId: string;
  parentVersionId: string | null;
  /** Markdown with citation tokens — the record. */
  text: string;
  /** sha256(utf8(text)), displayed 0x + 64 lowercase hex. */
  contentHash: string;
  /** The sentence the thesis argues, verbatim from the framing's choice. */
  claim: string;
  createdById: string;
  createdAt: Date;
};

/** EVIDENCE | TRAJECTORY here; DOCUMENT is added by the document plan, by addition. */
export type MentionKind = 'EVIDENCE' | 'TRAJECTORY';

export type ThesisMentionRow = {
  id: string;
  versionId: string;
  kind: MentionKind;
  /** The record's fileHash, or the ClaimTrajectory id. */
  name: string;
  /** The pin — REQUIRED on EVIDENCE, computed by the write, never supplied. */
  contentVersionHash: string | null;
  debateSessionId: string | null;
};

export type FramingRow = {
  id: string;
  question: string;
  provision: Provision | null;
  researcherId: string;
  thesisId: string | null;
  fromRunId: string | null;
  clusterIndex: number | null;
  createdAt: Date;
};

export type FramingRoundType = 'PROPOSED' | 'ASSESSED' | 'CHOSEN';

export type FramingRoundRow = {
  id: string;
  framingId: string;
  sequence: number;
  type: FramingRoundType;
  content: unknown;
  researcherId: string;
  createdAt: Date;
};

export type ThesisAnalysisRow = {
  id: string;
  versionId: string;
  inputFingerprint: string;
  opinion: unknown;
  model: string;
  promptVersion: string;
  runAt: Date;
};

export type GapDecisionValue = 'OPEN' | 'CITED' | 'REQUESTED' | 'CALLED' | 'CONCEDED' | 'DISMISSED';

export type ThesisGapDecisionRow = {
  id: string;
  thesisId: string;
  gapId: string;
  description: string;
  sequence: number;
  decision: GapDecisionValue;
  citedName: string | null;
  request: unknown;
  callItem: unknown;
  reason: string | null;
  researcherId: string;
  createdAt: Date;
};

/** `rationale` and `assessment` are NON-NULL (A2 :1332–:1336) — why no refusal before the gate writes one. */
export type PublicationAttemptRow = {
  id: string;
  thesisId: string;
  versionId: string;
  rationale: string;
  assessment: unknown;
  verdict: 'SUPPORTS' | 'DISPUTES' | null;
  outcome: 'PUBLISHED' | 'REFUSED';
  refusedBy: string[];
  researcherId: string;
  createdAt: Date;
};

export type WithdrawalRow = {
  id: string;
  thesisId: string;
  versionId: string;
  reason: string;
  researcherId: string;
  createdAt: Date;
};

/**
 * The debate AS BUILT — `DiffDebateSession`, evidence A2's `DebateSession`, renamed
 * at thesis step 18 (step 13's ruling 4). The columns HISTORY reads; the schema
 * gives it NO researcher column, and evidence A2 takes it "as built".
 */
export type DebateSessionRow = {
  id: string;
  thesisId: string;
  recordFileHash: string;
  recordSnapshotId: string | null;
  recordDiffId: string | null;
  status: 'OPEN' | 'PROMOTED' | 'ABANDONED';
  createdAt: Date;
  closedAt: Date | null;
};

/** Exactly one of `thesisId` and `framingId` is set — a CHECK in A2. */
export type NoteRow = {
  id: string;
  thesisId: string | null;
  framingId: string | null;
  text: string;
  researcherId: string;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// THE MODULES THE SUITE LOADS, AND THE STEP THAT OWES EACH EXPORT.
//
// The designs name no module path (grepped: none of these names appears in any
// design, plan or triage). Every path avoids `RETIRED_THESIS_MODULES`
// (test/walk/retiredNames.test.ts) — `services/thesisPublication`,
// `services/whistleblowerCall` and the rest are forbidden import targets, so no
// successor is built there. A module's `step` is the one that first creates the
// file; each export carries the step that owes it.
// ---------------------------------------------------------------------------

/**
 * WHAT AN EXPORT IS, not only that it exists (round 2, M1). A table the loader
 * accepted as a function — or a function it accepted as a table — would let a
 * stub turn a case green by exporting the right NAME with the wrong thing behind
 * it. Every export names its kind, and a mismatch fails on the name, the kind and
 * the step. A `value` is a primitive constant — a version string, as
 * `CRITIC_PROMPT_VERSION` is.
 */
export type ExportKind = 'function' | 'table' | 'value';

export interface ExportContract {
  step: number;
  kind: ExportKind;
}

const fn = (step: number): ExportContract => ({ step, kind: 'function' });
const table = (step: number): ExportContract => ({ step, kind: 'table' });
const value = (step: number): ExportContract => ({ step, kind: 'value' });

export const MODULES = {
  'services/thesisPredicates': {
    step: 19,
    exports: {
      claimFramed: fn(19),
      unargued: fn(20),
      history: fn(20),
      fingerprint: fn(22),
      currentAnalysis: fn(22),
      gapInForce: fn(22),
      gapList: fn(22),
      gapsDecided: fn(22),
      theCall: fn(22),
      theRequests: fn(22),
      trajectoryCurrent: fn(23),
      publishableVersion: fn(23),
      reviews: fn(24),
      // FINGERPRINT's last input (A3 :1378) — exported so a case can compute the
      // fingerprint the version's CURRENT analysis must carry, rather than guess it.
      CRITIC_PROMPT_VERSION: value(22),
    },
  },
  'lib/provisions': { step: 18, exports: { PROVISIONS: table(18) } },
  'lib/thesisIdentity': { step: 20, exports: { contentHash: fn(20), gapId: fn(22) } },
  'services/thesisVersionWrite': { step: 20, exports: { writeThesisVersion: fn(20) } },
  'services/thesisGate': { step: 23, exports: { thesisChecks: fn(23) } },
  'routes/publicThesisRoutes': { step: 23, exports: { publicThesisRouter: fn(23) } },
  // EVERY TOOL MODULE exports its handler AND its zod schema (sketch §3a) — the
  // `mcp/tools/reviewEvidence.ts` shape, whose schema is a plain object of zod
  // fields, so a TABLE. The schema is what lets a case hold that no tool input can
  // carry a pin (§3c; target §10.5): asked of the schema, never inferred from a
  // handler that happened to ignore a key.
  'mcp/tools/listTheses': { step: 20, exports: { listThesesHandler: fn(20), listThesesSchema: table(20) } },
  'mcp/tools/openFraming': { step: 19, exports: { openFramingHandler: fn(19), openFramingSchema: table(19) } },
  'mcp/tools/assessFraming': { step: 19, exports: { assessFramingHandler: fn(19), assessFramingSchema: table(19) } },
  'mcp/tools/chooseFraming': { step: 19, exports: { chooseFramingHandler: fn(19), chooseFramingSchema: table(19) } },
  'mcp/tools/getFraming': { step: 19, exports: { getFramingHandler: fn(19), getFramingSchema: table(19) } },
  'mcp/tools/createThesis': { step: 20, exports: { createThesisHandler: fn(20), createThesisSchema: table(20) } },
  'mcp/tools/addThesisVersion': {
    step: 20,
    exports: { addThesisVersionHandler: fn(20), addThesisVersionSchema: table(20) },
  },
  'mcp/tools/getThesisContext': {
    step: 20,
    exports: { getThesisContextHandler: fn(20), getThesisContextSchema: table(20) },
  },
  'mcp/tools/addNote': { step: 20, exports: { addNoteHandler: fn(20), addNoteSchema: table(20) } },
  'mcp/tools/runAnalysis': { step: 22, exports: { runAnalysisHandler: fn(22), runAnalysisSchema: table(22) } },
  'mcp/tools/decideGap': { step: 22, exports: { decideGapHandler: fn(22), decideGapSchema: table(22) } },
  'mcp/tools/draftFoiaRequest': {
    step: 22,
    exports: { draftFoiaRequestHandler: fn(22), draftFoiaRequestSchema: table(22) },
  },
  'mcp/tools/getWhistleblowerCall': {
    step: 22,
    exports: { getWhistleblowerCallHandler: fn(22), getWhistleblowerCallSchema: table(22) },
  },
  'mcp/tools/checkPublicationReadiness': {
    step: 23,
    exports: { checkPublicationReadinessHandler: fn(23), checkPublicationReadinessSchema: table(23) },
  },
  'mcp/tools/publishThesis': { step: 23, exports: { publishThesisHandler: fn(23), publishThesisSchema: table(23) } },
  'mcp/tools/unpublishThesis': {
    step: 23,
    exports: { unpublishThesisHandler: fn(23), unpublishThesisSchema: table(23) },
  },
  'mcp/tools/listThesisReviews': {
    step: 24,
    exports: { listThesisReviewsHandler: fn(24), listThesisReviewsSchema: table(24) },
  },
} as const satisfies Record<string, { step: number; exports: Record<string, ExportContract> }>;

export type ModulePath = keyof typeof MODULES;

// ---------------------------------------------------------------------------
// A3 — `services/thesisPredicates`' SIGNATURES, as the acceptance suite calls them.
//
// The designs fix what each predicate MEANS, never its signature; these are the
// suite's, under the purity rule `evidencePredicates.ts` states once: a predicate
// over small rows the caller loaded is PURE and SYNC, a question about the database
// is async and loads for itself. A builder step may reshape one — it is one
// interface, in one place, and the cases follow it.
// ---------------------------------------------------------------------------

export interface DebateRef {
  status: string;
  recordFileHash: string;
  thesisId: string;
}

/** A mention with the debate it references, loaded by the caller — as evidence's `argued` reads it. */
export type CitedMention = ThesisMentionRow & { debate: DebateRef | null };

export interface FingerprintInput {
  contentHash: string;
  /** Each cited record's content, so CURRENT is asked through evidence's `currentVersionOf`. */
  evidence: readonly { name: string; record: RecordContent<ContentVersionProvenance> }[];
  trajectoryIds: readonly string[];
  gaps: readonly { gapId: string; decision: GapDecisionValue }[];
  promptVersion: string;
}

export type Fingerprinted =
  | { defined: true; fingerprint: string }
  | { defined: false; reason: 'AWAITING_DERIVATION'; name: string };

/** One gap of GAP_LIST: its decision in force, and what it READS as (a CITED gap whose citation left reads OPEN). */
export interface GapEntry {
  gapId: string;
  readsAs: GapDecisionValue;
  inForce: ThesisGapDecisionRow;
}

/**
 * The publication assessor's answers the gate reads (A3 :1394; A6 :1599–:1601): the
 * two PUBLISHABLE(v) composes, and the advisory third.
 *
 * `allegationsFramed` IS COINED (7.4). A6's check 17 is "the assessor's opinion that
 * claims are framed as allegations under investigation" (T5 :758), and neither A2 nor
 * A4 names the field that carries it. The gate reads it; PUBLISHABLE(v) does not — an
 * advisory check binds nothing.
 */
export interface PublicationAssessment {
  substance: boolean;
  names: readonly string[];
  allegationsFramed: boolean;
}

/** One of A6's check NAMES — the `id` a gate row carries, as evidence's `EvidenceCheck` carries its. */
export type CheckName = (typeof CHECKS)[number]['name'];

/**
 * ONE ROW OF THE GATE (sketch §4) — `services/evidenceChecks.ts`'s `EvidenceCheck`
 * shape, so that rows 5–10 can BE evidenceChecks' rows, deep-equal. `verdict` is
 * three-valued and the third is not a pass (evidence §0b); `examined` is present at
 * zero (A6 :1588, "an empty scope says so"); `failures` name their subjects. What an
 * entry of `examined` or `failures` looks like is each check's, the builder's: the
 * suite asks only that a failure NAMES its subject, and looks for the subject's
 * VALUE, never a field name. There is no binding flag (A6 :1605–:1608).
 */
export interface ThesisCheckRow {
  id: CheckName;
  kind: 'hard' | 'advisory';
  verdict: 'PASS' | 'FAIL' | 'EXAMINED_NONE';
  examined: readonly unknown[];
  failures: readonly unknown[];
}

/**
 * `services/thesisGate` (sketch §4): it MAPS one evaluation and does not load; the
 * publication assessor's answer is an INPUT — null when no rationale was given — so
 * the gate asks no model.
 */
export interface ThesisGateModule {
  thesisChecks(versionId: string, assessment: PublicationAssessment | null): Promise<ThesisCheckRow[]>;
}

/** PUBLISHABLE(v) as a report; `failed` names A6's check names (§4). */
export interface VersionPublishability {
  publishable: boolean;
  failed: readonly string[];
}

export interface HistoryEntry {
  kind: string;
  id: string;
  createdAt: Date;
  researcherId: string | null;
}

export interface ReviewEntry {
  kind: 'FLAGGED' | 'STALE_TRAJECTORY' | 'UNARGUED';
  thesisId: string;
  name: string;
  command: string;
}

/**
 * `list_thesis_reviews`' ANSWER, as JSON (A4 :1523–:1525; T6 :868–:878): REVIEWS(caller),
 * oldest first, "each with its material and one command; an empty list is an answer".
 *
 * WHERE THE MATERIAL LIVES — on the TOOL's entry, not on REVIEWS' (7.3). REVIEWS says
 * WHAT is owed, and `derivations.test.ts` holds it as that; the tool renders each item
 * stop-shaped, "material, old beside new, and one command to paste" (T6 :881–:882), as
 * `list_evidence_reviews`' entries carry theirs (evidence A4 :1146–:1152). A4 names no
 * field for either, so the suite names them from the one precedent: the evidence list's
 * `owedSince` (`services/evidenceReviews.ts` ReviewEntry) is the ORDER'S KEY, the instant
 * the item became owed; the envelope is its `{ owed, reviews }`, the count first. A
 * builder step may reshape this — one interface, in one place.
 *
 * THE ENVELOPE IS A DECLARED DEVIATION from thesis A4 :1524 (7.3 round 2, L3), which
 * returns REVIEWS(caller) as a list — "an empty list is an answer". It follows step
 * 14's ruling 5 and evidence's `{ owed, reviews, notEvaluable }`, so an empty answer
 * is `{ owed: 0, reviews: [] }`: still an answer, never a refusal. The A4 amendment is
 * owed with NO_FRAMING's, create_thesis's and `since`'s; step 17's dated record
 * names it.
 */
export interface ThesisReviewListEntry extends ReviewEntry {
  owedSince: string;
  material: Record<string, unknown>;
}

export interface ThesisReviewList {
  owed: number;
  reviews: ThesisReviewListEntry[];
}

export interface ThesisPredicatesModule {
  CRITIC_PROMPT_VERSION: string;
  claimFramed(input: {
    version: Pick<ThesisVersionRow, 'thesisId' | 'claim'>;
    thesis: Pick<ThesisRow, 'id' | 'provision'>;
    framings: readonly FramingRow[];
    rounds: readonly FramingRoundRow[];
  }): boolean;
  unargued(version: Pick<ThesisVersionRow, 'thesisId'>, mentions: readonly CitedMention[]): string[];
  fingerprint(input: FingerprintInput): Fingerprinted;
  currentAnalysis(versionId: string, analyses: readonly ThesisAnalysisRow[], fingerprint: string): ThesisAnalysisRow | null;
  gapInForce(decisions: readonly ThesisGapDecisionRow[], thesisId: string, gapId: string): ThesisGapDecisionRow | null;
  gapList(decisions: readonly ThesisGapDecisionRow[], thesisId: string, headNames: readonly string[]): GapEntry[];
  gapsDecided(list: readonly GapEntry[]): { decided: boolean; examined: number };
  theCall(published: boolean, list: readonly GapEntry[]): unknown[];
  theRequests(published: boolean, list: readonly GapEntry[]): unknown[];
  trajectoryCurrent(currency: TrajectoryCurrency): boolean;
  publishableVersion(versionId: string, assessment: PublicationAssessment): Promise<VersionPublishability>;
  history(thesisId: string, since?: Date): Promise<HistoryEntry[]>;
  reviews(researcherId: string): Promise<ReviewEntry[]>;
}

/**
 * The model actors `models-write-no-state` scans (A7 :1639–:1642) — by SOURCE, so
 * they are not loaded and carry no exports. The debate assessor exists today; the
 * Prosecutor has no subject until its own build (thesis §10).
 */
export const MODEL_ACTORS = {
  'services/promotionAssessor.ts': 13,
  'services/framingAssessor.ts': 19,
  'services/thesisCritic.ts': 22,
  'services/foiaDrafter.ts': 22,
  'services/publicationAssessor.ts': 23,
} as const;

// ---------------------------------------------------------------------------
// A4 — EVERY TOOL'S CLOSED REFUSAL SET, IN THE RULED ORDER.
// ---------------------------------------------------------------------------

export type ThesisCode =
  | 'NO_RESEARCHER'
  | 'NO_THESIS'
  | 'NO_FRAMING'
  | 'NOT_AUTHOR'
  | 'NOT_YOURS'
  | 'NO_PROVISION_SHAPE'
  | 'PUBLISHED'
  | 'NO_SUCH_RUN'
  | 'NO_RECORDS'
  | 'NOT_A_RECORD'
  | 'NOT_ACQUIRED'
  | 'AWAITING_DERIVATION'
  | 'UNKNOWN_TRAJECTORY_ID'
  | 'NOT_ASSESSED'
  | 'PROVISION_MISMATCH'
  | 'EMPTY'
  | 'CLAIM_MISMATCH'
  | 'FRAMING_ATTACHED'
  | 'STALE_HEAD'
  | 'STALE_PIN'
  | 'NO_HEAD'
  | 'ANALYSIS_CURRENT'
  | 'NOT_CITED'
  | 'REASON_REQUIRED'
  | 'REQUEST_REQUIRED'
  | 'CALL_ITEM_REQUIRED'
  | 'STALE_SEQUENCE'
  | 'NAMES_PERSON'
  | 'NO_SUCH_GAP'
  | 'NOTHING_NEW'
  | 'NOT_PUBLISHABLE'
  | 'NOT_PUBLISHED'
  | 'NEITHER';

export type ToolName =
  | 'list_theses'
  | 'open_framing'
  | 'assess_framing'
  | 'choose_framing'
  | 'get_framing'
  | 'create_thesis'
  | 'add_thesis_version'
  | 'get_thesis_context'
  | 'run_analysis'
  | 'decide_gap'
  | 'draft_foia_request'
  | 'get_whistleblower_call'
  | 'check_publication_readiness'
  | 'publish_thesis'
  | 'unpublish_thesis'
  | 'add_note'
  | 'list_thesis_reviews';

export interface ToolContract {
  module: ModulePath;
  access: 'PUBLIC' | 'GATED' | 'WRITE';
  paid: boolean;
  /** Every code a case produces at step 17 or later, in the order the tool checks them. */
  codes: readonly ThesisCode[];
  /** A code whose only arm crosses a model: in the set, OWED to its step, never claimed tested. */
  owed: readonly { code: ThesisCode; step: number }[];
}

export const TOOLS: Readonly<Record<ToolName, ToolContract>> = {
  list_theses: { module: 'mcp/tools/listTheses', access: 'PUBLIC', paid: false, codes: [], owed: [] },
  open_framing: {
    module: 'mcp/tools/openFraming',
    access: 'WRITE',
    paid: false,
    codes: ['NO_RESEARCHER', 'NO_THESIS', 'NOT_AUTHOR', 'NO_PROVISION_SHAPE', 'PUBLISHED', 'NO_SUCH_RUN'],
    owed: [],
  },
  assess_framing: {
    module: 'mcp/tools/assessFraming',
    access: 'WRITE',
    paid: true,
    codes: [
      'NO_RESEARCHER',
      'NO_FRAMING',
      'NOT_YOURS',
      'NO_RECORDS',
      'NOT_A_RECORD',
      'NOT_ACQUIRED',
      'AWAITING_DERIVATION',
      'UNKNOWN_TRAJECTORY_ID',
    ],
    owed: [],
  },
  choose_framing: {
    module: 'mcp/tools/chooseFraming',
    access: 'WRITE',
    paid: false,
    codes: ['NO_RESEARCHER', 'NO_FRAMING', 'NOT_YOURS', 'NOT_ASSESSED', 'PROVISION_MISMATCH'],
    owed: [],
  },
  get_framing: { module: 'mcp/tools/getFraming', access: 'GATED', paid: false, codes: ['NO_FRAMING'], owed: [] },
  create_thesis: {
    module: 'mcp/tools/createThesis',
    access: 'WRITE',
    paid: false,
    // add_thesis_version's MINUS NOT_AUTHOR and STALE_HEAD, which a call that
    // creates the thesis cannot reach (§6-13), PLUS A4's two and Q2's one.
    codes: [
      'NO_RESEARCHER',
      'NO_PROVISION_SHAPE',
      'EMPTY',
      'NOT_A_RECORD',
      'NOT_ACQUIRED',
      'AWAITING_DERIVATION',
      'UNKNOWN_TRAJECTORY_ID',
      'CLAIM_MISMATCH',
      'FRAMING_ATTACHED',
      'STALE_PIN',
    ],
    owed: [],
  },
  add_thesis_version: {
    module: 'mcp/tools/addThesisVersion',
    access: 'WRITE',
    paid: false,
    codes: [
      'NO_RESEARCHER',
      'NO_THESIS',
      'NOT_AUTHOR',
      'STALE_HEAD',
      'NOT_A_RECORD',
      'NOT_ACQUIRED',
      'AWAITING_DERIVATION',
      'UNKNOWN_TRAJECTORY_ID',
      'EMPTY',
      // LAST (round 2, L1): Q1's race guard is decided INSIDE the write's
      // transaction, after every check that reads before it opens.
      'STALE_PIN',
    ],
    owed: [],
  },
  // `since` (ISO-8601) IS COINED — 7.3 round 2, M2, REVIEW's ruling, the
  // researcher's to overturn. A4 :1479 returns "HISTORY(t), optionally since a
  // date" (§9 :977–:978), and its input line `{ thesisId }` names no parameter for
  // it; the A4 amendment is owed with NO_FRAMING's and create_thesis's. It adds no
  // refusal code.
  get_thesis_context: {
    module: 'mcp/tools/getThesisContext',
    access: 'GATED',
    paid: false,
    codes: ['NO_THESIS'],
    owed: [],
  },
  run_analysis: {
    module: 'mcp/tools/runAnalysis',
    access: 'WRITE',
    paid: true,
    codes: ['NO_RESEARCHER', 'NO_THESIS', 'NOT_AUTHOR', 'NO_HEAD', 'ANALYSIS_CURRENT', 'AWAITING_DERIVATION'],
    owed: [],
  },
  decide_gap: {
    module: 'mcp/tools/decideGap',
    access: 'WRITE',
    paid: false,
    codes: [
      'NO_RESEARCHER',
      'NO_THESIS',
      'NOT_AUTHOR',
      'NO_HEAD',
      'NOT_CITED',
      'REASON_REQUIRED',
      'REQUEST_REQUIRED',
      'CALL_ITEM_REQUIRED',
      'STALE_SEQUENCE',
    ],
    // A4 :1494: "checked by the same rule as T5" — T5's rule is the publication
    // assessor's name list, a model nothing mocks at step 17.
    owed: [{ code: 'NAMES_PERSON', step: 22 }],
  },
  draft_foia_request: {
    module: 'mcp/tools/draftFoiaRequest',
    access: 'GATED',
    paid: true,
    codes: ['NO_RESEARCHER', 'NO_THESIS', 'NOT_AUTHOR', 'NO_HEAD', 'NO_SUCH_GAP'],
    owed: [],
  },
  // Q3b: a PUBLIC read refuses nothing — an id naming no thesis is `{ live: false }`.
  get_whistleblower_call: {
    module: 'mcp/tools/getWhistleblowerCall',
    access: 'PUBLIC',
    paid: false,
    codes: [],
    owed: [],
  },
  check_publication_readiness: {
    module: 'mcp/tools/checkPublicationReadiness',
    access: 'GATED',
    paid: true,
    // NO NO_RESEARCHER (round 2, L2): a GATED read's handler answers without an
    // identity — interaction flows A5 :1037–:1038. `draft_foia_request` and
    // `list_thesis_reviews` keep it: the first refuses NOT_AUTHOR and the second
    // answers REVIEWS(caller), and neither has a subject without a caller.
    codes: ['NO_THESIS'],
    owed: [],
  },
  publish_thesis: {
    module: 'mcp/tools/publishThesis',
    access: 'WRITE',
    paid: true,
    codes: ['NO_RESEARCHER', 'NO_THESIS', 'NOT_AUTHOR', 'REASON_REQUIRED', 'NOTHING_NEW'],
    // Decided past the assessor: checks 15 and 16 are its answers (A6 :1599–:1600).
    owed: [{ code: 'NOT_PUBLISHABLE', step: 23 }],
  },
  unpublish_thesis: {
    module: 'mcp/tools/unpublishThesis',
    access: 'WRITE',
    paid: false,
    codes: ['NO_RESEARCHER', 'NO_THESIS', 'NOT_AUTHOR', 'NOT_PUBLISHED', 'REASON_REQUIRED'],
    owed: [],
  },
  add_note: {
    module: 'mcp/tools/addNote',
    access: 'WRITE',
    paid: false,
    // NEITHER is an input-SHAPE refusal ("not exactly one"): it decides which
    // row to look up, so it precedes the lookup.
    codes: ['NO_RESEARCHER', 'NEITHER', 'NO_THESIS', 'NO_FRAMING', 'NOT_AUTHOR', 'EMPTY'],
    owed: [],
  },
  list_thesis_reviews: {
    module: 'mcp/tools/listThesisReviews',
    access: 'GATED',
    paid: false,
    codes: ['NO_RESEARCHER'],
    owed: [],
  },
};

/**
 * §3g's coverage set (L4): A4's writes on a thesis MINUS `create_thesis`, PLUS
 * `draft_foia_request`. The three debate writes are `test/debate.test.ts`'s.
 */
export const WRITE_TOOLS_ON_A_THESIS = [
  'open_framing',
  'assess_framing',
  'choose_framing',
  'add_thesis_version',
  'run_analysis',
  'decide_gap',
  'draft_foia_request',
  'publish_thesis',
  'unpublish_thesis',
  'add_note',
] as const satisfies readonly ToolName[];

/**
 * A TUPLE, so a table keyed by it (`test/thesis/tools.ts`'s `ON_THE_FIXTURE`) is
 * checked by the compiler to hold one entry per tool — a tool added here without an
 * input fails the compile, loudly, rather than going uncalled (7.3).
 */
export type WriteToolOnAThesis = (typeof WRITE_TOOLS_ON_A_THESIS)[number];

// ---------------------------------------------------------------------------
// A6 — THE FIRST SEVENTEEN CHECKS, BY ID AND KIND. Nothing is said here about ids
// beyond 17: checks 18 and 19 are the document plan's, added BY ADDITION
// (document plan §1 :46–:49), and a statement of their absence would have to be
// edited on that day.
// ---------------------------------------------------------------------------

export const CHECKS = [
  { id: 1, name: 'HEAD_VERSION', kind: 'hard' },
  { id: 2, name: 'CLAIM_FRAMED', kind: 'hard' },
  { id: 3, name: 'CITES_EVIDENCE', kind: 'hard' },
  { id: 4, name: 'PUBLIC_INTEREST_STATEMENT', kind: 'hard' },
  { id: 5, name: 'EVIDENCE_VERIFIED', kind: 'hard' },
  { id: 6, name: 'EVIDENCE_PINNED_CURRENT', kind: 'hard' },
  { id: 7, name: 'EVIDENCE_ARGUED', kind: 'hard' },
  { id: 8, name: 'EVIDENCE_NOT_WITHDRAWN', kind: 'hard' },
  { id: 9, name: 'EVIDENCE_DERIVED', kind: 'hard' },
  { id: 10, name: 'EVIDENCE_DIFF_INPUT_SOUND', kind: 'hard' },
  { id: 11, name: 'TRAJECTORIES_RESOLVE', kind: 'hard' },
  { id: 12, name: 'TRAJECTORIES_CURRENT', kind: 'hard' },
  { id: 13, name: 'ANALYSIS_CURRENT', kind: 'hard' },
  { id: 14, name: 'GAPS_DECIDED', kind: 'hard' },
  { id: 15, name: 'RATIONALE_SUBSTANCE', kind: 'hard' },
  { id: 16, name: 'NAMES_NO_PERSON', kind: 'hard' },
  { id: 17, name: 'ALLEGATIONS_FRAMED', kind: 'advisory' },
] as const;

// ---------------------------------------------------------------------------
// A7 — the EIGHT suite names the meta-case holds (§5h), and the ninth it excludes.
// ---------------------------------------------------------------------------

export const A7_SUITE_NAMES = [
  'thesis-no-log',
  'versions-immutable',
  'models-write-no-state',
  'one-symbol',
  'pin-equals-affirmed',
  'gap-id-stable',
  'names-vacuity',
  'retired-names',
] as const;

/** An operational instrument run in the deployment, not a suite scan — step 24's. */
export const A7_EXCLUDED = { 'thesis-cites-verified': 24 } as const;
