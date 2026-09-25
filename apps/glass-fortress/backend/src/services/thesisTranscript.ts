import type { MentionType, Prisma } from '@prisma/client';
import { handleOf } from './publishedThesis';
import type { NamedRecord } from './evidenceReviews';

// ---------------------------------------------------------------------------
// THE TRANSCRIPT — docs/gf-thesis-flows.md §9 :974 and A4 :1476, RULED 2026-09-20 (the researcher, R66
// „Q1 transcript approved”); docs/gf-ui-flows.md §11 :431, :436.
//
// HISTORY(t) IS A TRANSCRIPT OF TURNS. "A turn is one thing one voice said in one step: the RESEARCHER (a
// handle, `mine`), the MODEL (its name and prompt version, and who spent the call) or the PLATFORM (a verdict,
// a gate). A stored row is one turn or several — a FramingRound is one; a PublicationAttempt is three (the
// rationale, the assessment, the verdict); a debate is its opening, its events and its close."
//
// ONE BUILDER PER THREAD, AND THREE DOORS READ THEM. `get_thesis_context` serves the whole transcript,
// `get_debate` serves the DEBATE thread and `get_framing` serves the FRAMING thread — all three from the
// functions here, so the page and the chat cannot be told two different stories about the same act. That is
// the whole reason this module exists rather than a switch inside one read: a second spelling of a turn is the
// defect this repository names as its own, and the old `history` — nine kinds, ids alone, no body — was the
// shape that made a second spelling necessary at every caller.
//
// `line` IS A DATUM, NEVER A SENTENCE — RULED 2026-09-20 (the researcher, R66 „Q1 datum”; A4 :1476). It is the
// turn's identifying value VERBATIM: the question, the proposed sentence, the claim, the record's name, the
// strength grade, the gap's description, a note's first line. It is NULL for the nine kinds whose `kind` and
// `body` already name them. **The backend composes no phrase in any language.** The page composes what it
// shows from `body` through its own frozen strings (ui §11 :431), which is what keeps user-visible copy inside
// the freeze and out of a server that has no catalogue.
//
// THE MODEL'S NAME MAY BE NULL, AND THAT IS SAID RATHER THAN HIDDEN (A2 :1317). A debate assessment written
// before document step 33 records neither model nor prompt version — the WRITER's debt, paid since (R82 Entry 2)
// — so `M.model` and `M.promptVersion` are `string | null` and the page says the absence on those rows.
// ---------------------------------------------------------------------------

/** A researcher on the wire: a handle and whether the caller is looking at their own act. NEVER an id (§4 :167). */
export interface Researcher {
  handle: string;
  mine: boolean;
}

/** A model on the wire: what ran, at which prompt version, and who paid for the call (A2 :1317). */
export interface ModelVoice {
  model: string | null;
  promptVersion: string | null;
  spentBy: Researcher;
}

export type Voice =
  | ({ voice: 'RESEARCHER' } & Researcher)
  | ({ voice: 'MODEL' } & ModelVoice)
  | { voice: 'PLATFORM' };

/** The eight steps a turn can belong to; the thread is the step and that step's own id. */
export type ThreadStep = 'FRAMING' | 'VERSION' | 'DEBATE' | 'ANALYSIS' | 'GAP' | 'PUBLICATION' | 'WITHDRAWAL' | 'NOTE';

/**
 * THE SEVENTEEN KINDS, A CLOSED UNION (A4 :1476). "A kind absent from this list is not in the transcript; a
 * kind added (document flows' ARRIVED) is added HERE first." The order of this array is the tie-break inside
 * one moment, and it is the order the acts happen in.
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

/**
 * THE BODIES, ONE PER KIND, EXACTLY AS A4 :1476 SPELLS THEM (M1/M2, 2026-09-20).
 *
 * `body: unknown` was the shape this module shipped first, and it was wrong in a way no case could see: with
 * `unknown` the compiler cannot tell a VERSION's body from a NOTE's, so a builder that returned the wrong one
 * — or dropped half a body — type-checked. The union below makes `every-kind-renders`' exhaustiveness a
 * COMPILE-TIME fact as well as a case, which is what the instrument was promised to be.
 */
export interface Elements {
  element: string;
  records: string[] | 'MISSING';
}

/** Whether the stored Json was an object at all. Reported, never smoothed into `{}` (A4 :1459). */
interface Malformed {
  malformed: boolean;
}

export interface FramingOpenedBody {
  question: string;
  provision: string | null;
  fromRunId: string | null;
}
export type RoundProposedBody = Malformed & { framing: string | null; elements: Elements[] | null };
export type RoundAssessedBody = Malformed & { content: Record<string, unknown> | null };
export type RoundChosenBody = Malformed & {
  claim: string | null;
  provision: string | null;
  elements: Elements[] | null;
  /** The versions whose `claim` equals the chosen one, character for character (CLAIM_FRAMED, A3 :1366). */
  restatedBy: string[];
};
export interface VersionBody {
  text: string;
  claim: string;
  contentHash: string;
  parentVersionId: string | null;
  mentions: MentionRow[];
  citationsVsParent: { added: string[]; repinned: string[]; dropped: string[]; carried: string[] };
}
export interface DebateOpenedBody {
  sessionId: string;
  /** The record as a read answers it — `evidenceReviews.NamedRecord`, ONE shape, a document's `{ commitment, title }` (QB). */
  record: NamedRecord | null;
  pin: string | null;
}
export interface TextBody {
  text: string;
}
export type AssessmentBody = Malformed & {
  hasSubstance: unknown;
  substanceGaps: unknown;
  verdict: unknown;
  objection: unknown;
  assessment: unknown;
  /**
   * The assertions the assessor named, each with the audit's verdicts beside it (R81 QA; thesis A4 :1476 as conformed,
   * R82). NULL on a row written before the ruling — never `[]`, which would read as an assessor that checked and found
   * nothing — and on a malformed row, which records nothing readable.
   */
  assertions: unknown;
};
export interface DebateClosedBody {
  outcome: 'PROMOTED' | 'ABANDONED';
  overObjection: boolean;
  evidenceFileHash: string | null;
}
export interface AnalysisBody {
  analysisId: string;
  inputFingerprint: string;
  current: boolean;
  opinion: Prisma.JsonValue;
}
export interface GapDecisionBody {
  gapId: string;
  description: string;
  sequence: number;
  decision: string;
  citedName: string | null;
  request: Prisma.JsonValue | null;
  callItem: Prisma.JsonValue | null;
  reason: string | null;
  earlier: { sequence: number; decision: string; at: Date }[];
}
export interface PublicationRationaleBody {
  attemptId: string;
  rationale: string;
}
export interface PublicationAssessmentBody {
  attemptId: string;
  assessment: Prisma.JsonValue;
  verdict: string | null;
}
export interface PublicationVerdictBody {
  attemptId: string;
  outcome: 'PUBLISHED' | 'REFUSED';
  refusedBy: string[];
}
export interface WithdrawalBody {
  versionId: string;
  reason: string;
}
export interface NoteBody {
  text: string;
  on: 'THESIS' | 'FRAMING';
}

interface TurnBase {
  id: string;
  at: Date;
  thread: { step: ThreadStep; id: string };
  by: Voice;
  /** The turn's identifying DATUM, verbatim — or null where the kind and the body name it (A4 :1476). */
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

/**
 * A turn with the two numbers the ORDER needs and the wire does not carry.
 *
 * A4 :1476 orders the transcript by `at`, "then the thread, then a row's own turn order (rationale before
 * assessment before verdict), then id". The second and third are not fields of a turn — a PublicationAttempt
 * is ONE row whose three turns share one `createdAt`, so without `within` they would sort by id and the
 * verdict could precede the rationale it answers. Kept beside the turn rather than inside it, so the wire
 * carries no sort key a reader could mistake for a fact.
 */
export interface BuiltTurn {
  turn: Turn;
  within: number;
}

const STEP_ORDER: readonly ThreadStep[] = [
  'FRAMING',
  'VERSION',
  'DEBATE',
  'ANALYSIS',
  'GAP',
  'PUBLICATION',
  'WITHDRAWAL',
  'NOTE',
];

/**
 * THE ONE ORDERING (A4 :1476), applied once to everything every builder produced.
 *
 * Every tie is broken the same way every time and the order is stored nowhere — the rule `history` has held
 * since R5, now with the two extra keys the transcript needs.
 */
export function orderTurns(built: readonly BuiltTurn[]): Turn[] {
  return [...built]
    .sort(
      (a, b) =>
        a.turn.at.getTime() - b.turn.at.getTime() ||
        STEP_ORDER.indexOf(a.turn.thread.step) - STEP_ORDER.indexOf(b.turn.thread.step) ||
        a.within - b.within ||
        (a.turn.id < b.turn.id ? -1 : a.turn.id > b.turn.id ? 1 : 0),
    )
    .map((b) => b.turn);
}

/**
 * THE VOICES — a researcherId becomes a handle and a `mine`, and nothing else ever does.
 *
 * `handleOf` THROWS when a row names a researcher that does not exist, and that throw is the point: a thesis
 * cannot outlive its author row, so an id with no handle is a broken foreign key and never an anonymous
 * author (R47 §6-R8). A silent `null` here would put "by nobody" on a page.
 */
export interface Voices {
  researcher(researcherId: string): Researcher;
  model(model: string | null, promptVersion: string | null, spentBy: string): ModelVoice;
}

export function voicesOf(handles: ReadonlyMap<string, string>, callerId: string | null, thesisId: string): Voices {
  const researcher = (researcherId: string): Researcher => ({
    handle: handleOf(handles, researcherId, thesisId),
    mine: researcherId === callerId,
  });
  return {
    researcher,
    model: (model, promptVersion, spentBy) => ({ model, promptVersion, spentBy: researcher(spentBy) }),
  };
}

// ---------------------------------------------------------------------------
// THE ROWS EACH BUILDER TAKES. Each is the shape this module reads, never Prisma's whole row: a builder that
// took the model type would be free to read a column the appendix does not name.
// ---------------------------------------------------------------------------

export interface FramingRow {
  id: string;
  question: string;
  provision: string | null;
  fromRunId: string | null;
  researcherId: string;
  createdAt: Date;
}

export interface RoundRow {
  id: string;
  framingId: string;
  sequence: number;
  type: 'PROPOSED' | 'ASSESSED' | 'CHOSEN';
  content: Prisma.JsonValue;
  researcherId: string;
  createdAt: Date;
}

export interface MentionRow {
  /**
   * `MentionType`, widened at document refactor step 28 with the enum. This reader is
   * KIND-AGNOSTIC — `kind` is only ever half a map key here (:565-:566, "<kind>:<name>"),
   * so a third kind changes nothing it does and the widening is behaviour-neutral. Said
   * rather than left to be re-derived by whoever reads this next.
   */
  kind: MentionType;
  name: string;
  contentVersionHash: string | null;
  debateSessionId: string | null;
}

export interface VersionRow {
  id: string;
  claim: string;
  text: string;
  contentHash: string;
  parentVersionId: string | null;
  createdById: string;
  createdAt: Date;
  mentions: MentionRow[];
}

export interface DebateEventRow {
  id: string;
  type: string;
  content: string;
  createdAt: Date;
}

export interface DebateRow {
  id: string;
  researcherId: string;
  createdAt: Date;
  closedAt: Date | null;
  status: string;
  promotedOverObjection: boolean;
  evidenceFileHash: string | null;
  record: NamedRecord | null;
  pin: string | null;
  events: DebateEventRow[];
}

export interface AnalysisRow {
  id: string;
  inputFingerprint: string;
  opinion: Prisma.JsonValue;
  model: string;
  promptVersion: string;
  researcherId: string;
  runAt: Date;
}

export interface GapDecisionRow {
  id: string;
  gapId: string;
  description: string;
  sequence: number;
  decision: string;
  citedName: string | null;
  request: Prisma.JsonValue | null;
  callItem: Prisma.JsonValue | null;
  reason: string | null;
  researcherId: string;
  createdAt: Date;
}

export interface AttemptRow {
  id: string;
  rationale: string;
  assessment: Prisma.JsonValue;
  verdict: string | null;
  outcome: 'PUBLISHED' | 'REFUSED';
  refusedBy: string[];
  researcherId: string;
  createdAt: Date;
}

export interface WithdrawalRow {
  id: string;
  versionId: string;
  reason: string;
  researcherId: string;
  createdAt: Date;
}

export interface NoteRow {
  id: string;
  text: string;
  thesisId: string | null;
  framingId: string | null;
  researcherId: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// READING A STORED VALUE WITHOUT INVENTING ONE.
// ---------------------------------------------------------------------------

/** A Json object, or null when the stored value is not one — reported as `malformed`, never as `{}` (A4 :1459). */
function objectOrNull(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
}

/** The same question of a STRING that holds JSON — `DebateEvent.content` is stored verbatim, not as Json. */
function parsedObject(text: string): Record<string, unknown> | null {
  try {
    return objectOrNull(JSON.parse(text) as Prisma.JsonValue);
  } catch {
    return null;
  }
}

/**
 * A NESTED Json object, or null when the value at `key` is not one — the same refusal as `objectOrNull`, one
 * level down. It exists because a stored datum can sit inside a sub-object: the critic's grade is
 * `opinion.strength.grade` (`thesisCritic.ts` :92–:97, an object of `grade` and `reasoning`), and reading it
 * with `stringAt(_, 'strength')` answered null on EVERY real body — `stringAt` below refuses a non-string, so
 * the ANALYSIS turn's `line` was silently empty where A4 :1476 requires the grade.
 *
 * THE CAST IS DELIBERATE AND IS NARROWER THAN IT LOOKS. `value` is `unknown`, and the three tests above narrow
 * it to `object` — TypeScript will not carry that on to an index signature, so the assertion bridges `object`
 * to `Record<string, unknown>` and nothing else. It is sound for a value that has been proved non-null, of
 * type object and not an array. `objectOrNull` above needs no cast only because ITS input is
 * `Prisma.JsonValue`, whose object arm already carries the index signature.
 *
 * THE TWO SIBLINGS ARE NAMED AND NOT NUMBERED, deliberately. This docblock has now carried a wrong `:line`
 * for `stringAt` TWICE: once when `objectAt` landed above it, and once when the correction ADDED the
 * paragraph above — the number was computed correctly and then invalidated by the same edit that wrote it.
 * A cite to a symbol in the SAME file gains a reader nothing a name does not, and it is the only part of
 * this comment that an edit here can falsify. Cross-file cites keep their lines, since nothing done in this
 * file moves them.
 */
function objectAt(object: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = object?.[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringAt(object: Record<string, unknown> | null, key: string): string | null {
  const value = object?.[key];
  return typeof value === 'string' ? value : null;
}

/** An array of A2 :1305's element map, or null when the stored content does not hold one. */
function elementsAt(object: Record<string, unknown> | null): Elements[] | null {
  const value = object?.elements;
  return Array.isArray(value) ? (value as Elements[]) : null;
}

/** The first line of a note — a DATUM (the text's own first line), never a summary this module wrote. */
function firstLineOf(text: string): string {
  return text.split('\n')[0] ?? '';
}

/**
 * The record's name as one datum: the page and its dates, exactly the values A1 holds — or, for a document, its TITLE,
 * verbatim (thesis A4 :1476 as ruled 2026-09-25, R81 QB: "for a document the title is this turn's `line`"). A sealed
 * document without a title (step 32's door) has no datum to show, and its line is null.
 */
function recordLine(record: NamedRecord | null): string | null {
  if (record === null) return null;
  if ('commitment' in record) return record.title;
  return 'capture' in record ? `${record.url} ${record.capture}` : `${record.url} ${record.before}–${record.after}`;
}

// ---------------------------------------------------------------------------
// THE BUILDERS — ONE PER THREAD.
// ---------------------------------------------------------------------------

/**
 * THE FRAMING THREAD: the framing opened, then every round in sequence (A4 :1476; :1459's `turns`).
 *
 * `get_framing` serves exactly this and nothing else, so the sheet and the stream render one list from one
 * function. A round whose stored content is not an object is reported `malformed: true` with a null body,
 * never as `{}` — the same rule the framing read has held since its envelope was written.
 */
export function framingTurns(
  framing: FramingRow,
  rounds: readonly RoundRow[],
  versions: readonly { id: string; claim: string }[],
  voices: Voices,
): BuiltTurn[] {
  const built: BuiltTurn[] = [
    {
      within: 0,
      turn: {
        kind: 'FRAMING_OPENED',
        id: framing.id,
        at: framing.createdAt,
        thread: { step: 'FRAMING', id: framing.id },
        by: { voice: 'RESEARCHER', ...voices.researcher(framing.researcherId) },
        line: framing.question,
        body: { question: framing.question, provision: framing.provision, fromRunId: framing.fromRunId },
      },
    },
  ];

  for (const round of [...rounds].sort((a, b) => a.sequence - b.sequence)) {
    const content = objectOrNull(round.content);
    const malformed = content === null;
    if (round.type === 'ASSESSED') {
      built.push({
        within: round.sequence,
        turn: {
          kind: 'ROUND_ASSESSED',
          id: round.id,
          at: round.createdAt,
          thread: { step: 'FRAMING', id: framing.id },
          // A2 :1309: the ASSESSED content carries `model` and `promptVersion` beside the marks. Read from
          // the content, and null when it holds neither — said, not hidden.
          by: {
            voice: 'MODEL',
            ...voices.model(stringAt(content, 'model'), stringAt(content, 'promptVersion'), round.researcherId),
          },
          line: null,
          body: { content, malformed },
        },
      });
      continue;
    }
    const base = {
      id: round.id,
      at: round.createdAt,
      thread: { step: 'FRAMING' as const, id: framing.id },
      by: { voice: 'RESEARCHER' as const, ...voices.researcher(round.researcherId) },
    };
    if (round.type === 'PROPOSED') {
      // A2 :1305: `{ framing: verbatim, elements: [{ element, records }] }`. The FIELDS, not the whole Json —
      // a body that handed the stored object back would make the appendix's shape unverifiable.
      built.push({
        within: round.sequence,
        turn: {
          ...base,
          kind: 'ROUND_PROPOSED',
          line: stringAt(content, 'framing'),
          body: { framing: stringAt(content, 'framing'), elements: elementsAt(content), malformed },
        },
      });
      continue;
    }
    // A2's CHOSEN: `{ claim, provision?, elements }` — and `restatedBy`, the versions whose claim equals the
    // chosen one CHARACTER FOR CHARACTER (CLAIM_FRAMED, A3 :1366). Computed here, because the page must not
    // compare two strings to learn whether its own head restates the framing it was built from.
    const claim = stringAt(content, 'claim');
    built.push({
      within: round.sequence,
      turn: {
        ...base,
        kind: 'ROUND_CHOSEN',
        line: claim,
        body: {
          claim,
          provision: stringAt(content, 'provision'),
          elements: elementsAt(content),
          restatedBy: claim === null ? [] : versions.filter((v) => v.claim === claim).map((v) => v.id),
          malformed,
        },
      },
    });
  }
  return built;
}

/**
 * THE VERSION THREAD: one turn per version, with the citations it changed against its parent.
 *
 * `citationsVsParent` is computed from the two versions' OWN mentions (A4 :1476): added, re-pinned, dropped,
 * carried. The TEXT diff is NOT computed here — it is "the page's ONE derivation" (T6 :900), from two
 * immutable texts, and a second implementation on the server would be the copy that drifts.
 */
export function versionTurns(versions: readonly VersionRow[], voices: Voices): BuiltTurn[] {
  const byId = new Map(versions.map((v) => [v.id, v]));
  return versions.map((version) => {
    const parent = version.parentVersionId === null ? undefined : byId.get(version.parentVersionId);
    const before = new Map((parent?.mentions ?? []).map((m) => [`${m.kind}:${m.name}`, m.contentVersionHash]));
    const after = new Map(version.mentions.map((m) => [`${m.kind}:${m.name}`, m.contentVersionHash]));
    const added: string[] = [];
    const repinned: string[] = [];
    const carried: string[] = [];
    for (const [key, pin] of after) {
      if (!before.has(key)) added.push(key);
      else if (before.get(key) !== pin) repinned.push(key);
      else carried.push(key);
    }
    const dropped = [...before.keys()].filter((key) => !after.has(key));
    return {
      within: 0,
      turn: {
        kind: 'VERSION' as const,
        id: version.id,
        at: version.createdAt,
        thread: { step: 'VERSION' as const, id: version.id },
        by: { voice: 'RESEARCHER' as const, ...voices.researcher(version.createdById) },
        line: version.claim,
        body: {
          text: version.text,
          claim: version.claim,
          contentHash: version.contentHash,
          parentVersionId: version.parentVersionId,
          mentions: version.mentions,
          citationsVsParent: { added, repinned, dropped, carried },
        },
      },
    };
  });
}

/**
 * THE DEBATE THREAD: its opening, its events in order, and its close (A4 :1476; evidence A4 :1144's `turns`).
 *
 * `get_debate` serves EXACTLY this array, from this function — which is why `events` as raw
 * `{ type, content, at }` is retired from every debate tool (evidence :1123): four tools answering one
 * `DebateState` cannot each keep a private spelling of what a turn is.
 *
 * THE ASSESSMENT'S JSON IS PARSED, AND A PARSE FAILURE IS SAID. `DebateEvent.content` is stored verbatim as a
 * string; an assessment that is not JSON is reported `malformed: true` with null fields, never as a body that
 * looks like an assessment nobody wrote.
 */
export function debateTurns(debate: DebateRow, voices: Voices): BuiltTurn[] {
  const thread = { step: 'DEBATE' as const, id: debate.id };
  const researcher = { voice: 'RESEARCHER' as const, ...voices.researcher(debate.researcherId) };
  const built: BuiltTurn[] = [
    {
      within: 0,
      turn: {
        kind: 'DEBATE_OPENED',
        id: debate.id,
        at: debate.createdAt,
        thread,
        by: researcher,
        line: recordLine(debate.record),
        body: { sessionId: debate.id, record: debate.record, pin: debate.pin },
      },
    },
  ];

  for (const [index, event] of debate.events.entries()) {
    const within = index + 1;
    if (event.type === 'RATIONALE_SUBMITTED' || event.type === 'RESPONSE_SUBMITTED') {
      built.push({
        within,
        turn: {
          kind: event.type === 'RATIONALE_SUBMITTED' ? 'RATIONALE' : 'RESPONSE',
          id: event.id,
          at: event.createdAt,
          thread,
          by: researcher,
          line: null,
          body: { text: event.content },
        },
      });
      continue;
    }
    if (event.type === 'ASSESSMENT_RETURNED') {
      const parsed = parsedObject(event.content);
      built.push({
        within,
        turn: {
          kind: 'ASSESSMENT',
          id: event.id,
          at: event.createdAt,
          thread,
          // THE MODEL AND THE PROMPT, read from the event as ROUND_ASSESSED reads them from its content. The
          // writer records both since document step 33 (A2 :1317's debt, paid — R82 Entry 2); a row written
          // before carries neither, and this read answers null rather than inventing a name.
          by: {
            voice: 'MODEL',
            ...voices.model(stringAt(parsed, 'model'), stringAt(parsed, 'promptVersion'), debate.researcherId),
          },
          line: null,
          body: {
            hasSubstance: parsed?.hasSubstance ?? null,
            substanceGaps: parsed?.substanceGaps ?? null,
            verdict: parsed?.verdict ?? null,
            objection: parsed?.objection ?? null,
            assessment: parsed?.assessment ?? null,
            // ABSENT → null, never `[]` (R81 QA): an older row has no key, and an empty list is a real answer.
            assertions: parsed?.assertions ?? null,
            malformed: parsed === null,
          },
        },
      });
      continue;
    }
    if (event.type === 'PROMOTED' || event.type === 'ABANDONED') {
      built.push({
        within,
        turn: {
          kind: 'DEBATE_CLOSED',
          id: event.id,
          at: event.createdAt,
          thread,
          // THE PLATFORM'S VOICE: an outcome is a mechanical verdict on the argument, not a thing a
          // researcher or a model said (ui §10 :385–:390).
          by: { voice: 'PLATFORM' },
          line: null,
          body: {
            outcome: event.type,
            overObjection: debate.promotedOverObjection,
            evidenceFileHash: debate.evidenceFileHash,
          },
        },
      });
    }
    // A DEBATE_OPENED event adds nothing: the session's own row is the opening turn, and a second one from
    // the event would put the same act in the transcript twice.
  }
  return built;
}

/** THE ANALYSIS THREAD: one turn, the model's, with who spent the call (A2 :1317). */
export function analysisTurns(
  analyses: readonly AnalysisRow[],
  currentFingerprint: string | null,
  voices: Voices,
): BuiltTurn[] {
  return analyses.map((analysis) => ({
    within: 0,
    turn: {
      kind: 'ANALYSIS' as const,
      id: analysis.id,
      at: analysis.runAt,
      thread: { step: 'ANALYSIS' as const, id: analysis.id },
      by: { voice: 'MODEL' as const, ...voices.model(analysis.model, analysis.promptVersion, analysis.researcherId) },
      // The STRENGTH GRADE, read from the opinion the critic returned — a datum of the record, not a phrase.
      line: stringAt(objectAt(objectOrNull(analysis.opinion), 'strength'), 'grade'),
      body: {
        analysisId: analysis.id,
        inputFingerprint: analysis.inputFingerprint,
        current: currentFingerprint !== null && analysis.inputFingerprint === currentFingerprint,
        opinion: analysis.opinion,
      },
    },
  }));
}

/**
 * THE GAP THREAD: one turn per decision, grouped by the GAP it decides.
 *
 * `earlier` is every decision on the SAME gap with a lower sequence (A2 :1321–:1330's compare-and-set), so a
 * reader sees that a gap was decided before and how — the page derives none of it.
 */
export function gapTurns(decisions: readonly GapDecisionRow[], voices: Voices): BuiltTurn[] {
  return decisions.map((decision) => ({
    within: decision.sequence,
    turn: {
      kind: 'GAP_DECISION' as const,
      id: decision.id,
      at: decision.createdAt,
      thread: { step: 'GAP' as const, id: decision.gapId },
      by: { voice: 'RESEARCHER' as const, ...voices.researcher(decision.researcherId) },
      line: decision.description,
      body: {
        gapId: decision.gapId,
        description: decision.description,
        sequence: decision.sequence,
        decision: decision.decision,
        citedName: decision.citedName,
        request: decision.request,
        callItem: decision.callItem,
        reason: decision.reason,
        earlier: decisions
          .filter((other) => other.gapId === decision.gapId && other.sequence < decision.sequence)
          .sort((a, b) => a.sequence - b.sequence)
          .map((other) => ({ sequence: other.sequence, decision: other.decision, at: other.createdAt })),
      },
    },
  }));
}

/**
 * THE PUBLICATION THREAD: ONE ROW, THREE TURNS — the rationale (the researcher's), the assessment (the
 * model's) and the verdict (the platform's), in that order.
 *
 * All three share the row's `createdAt`, which is exactly why `within` exists: A4 :1476 orders a row's turns
 * "rationale before assessment before verdict", and without it the three would fall back to their ids.
 */
export function publicationTurns(attempts: readonly AttemptRow[], voices: Voices): BuiltTurn[] {
  return attempts.flatMap((attempt): BuiltTurn[] => {
    const thread = { step: 'PUBLICATION' as const, id: attempt.id };
    const assessment = objectOrNull(attempt.assessment);
    return [
      {
        within: 0,
        turn: {
          kind: 'PUBLICATION_RATIONALE',
          id: `${attempt.id}:rationale`,
          at: attempt.createdAt,
          thread,
          by: { voice: 'RESEARCHER', ...voices.researcher(attempt.researcherId) },
          line: null,
          body: { attemptId: attempt.id, rationale: attempt.rationale },
        },
      },
      {
        within: 1,
        turn: {
          kind: 'PUBLICATION_ASSESSMENT',
          id: `${attempt.id}:assessment`,
          at: attempt.createdAt,
          thread,
          by: {
            voice: 'MODEL',
            ...voices.model(stringAt(assessment, 'model'), stringAt(assessment, 'promptVersion'), attempt.researcherId),
          },
          line: null,
          body: { attemptId: attempt.id, assessment: attempt.assessment, verdict: attempt.verdict },
        },
      },
      {
        within: 2,
        turn: {
          kind: 'PUBLICATION_VERDICT',
          id: `${attempt.id}:verdict`,
          at: attempt.createdAt,
          thread,
          by: { voice: 'PLATFORM' },
          line: null,
          body: { attemptId: attempt.id, outcome: attempt.outcome, refusedBy: attempt.refusedBy },
        },
      },
    ];
  });
}

/** THE WITHDRAWAL THREAD: the author's act and the reason, which is GATED and shown here only (T6 :916). */
export function withdrawalTurns(withdrawals: readonly WithdrawalRow[], voices: Voices): BuiltTurn[] {
  return withdrawals.map((withdrawal) => ({
    within: 0,
    turn: {
      kind: 'WITHDRAWAL' as const,
      id: withdrawal.id,
      at: withdrawal.createdAt,
      thread: { step: 'WITHDRAWAL' as const, id: withdrawal.id },
      by: { voice: 'RESEARCHER' as const, ...voices.researcher(withdrawal.researcherId) },
      line: null,
      body: { versionId: withdrawal.versionId, reason: withdrawal.reason },
    },
  }));
}

/** THE NOTE THREAD: one turn, saying whether it was written on the thesis or on one of its framings. */
export function noteTurns(notes: readonly NoteRow[], voices: Voices): BuiltTurn[] {
  return notes.map((note) => ({
    within: 0,
    turn: {
      kind: 'NOTE' as const,
      id: note.id,
      at: note.createdAt,
      thread: { step: 'NOTE' as const, id: note.id },
      by: { voice: 'RESEARCHER' as const, ...voices.researcher(note.researcherId) },
      line: firstLineOf(note.text),
      body: { text: note.text, on: note.thesisId === null ? ('FRAMING' as const) : ('THESIS' as const) },
    },
  }));
}
