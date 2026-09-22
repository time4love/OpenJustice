import type { Note, PublicationAttempt, Prisma, ThesisAnalysis, ThesisGapDecision, Withdrawal } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { handlesOf } from './publishedThesis';

// ---------------------------------------------------------------------------
// THE THESIS READ'S ONE LOADER — docs/gf-ui-refactor-plan.md :779, the clause that permits this module.
//
// WHY IT EXISTS. `docs/gf-thesis-read-cost-2026-09-22.md` measured the gated read at 39 delegate calls across
// 19 delegates, with almost every table read twice or more — because the body was assembled THREE times over
// the same rows: the state arm (`thesisContextOf`), the fingerprint (`loadHead`), and the transcript
// (`history`). Three correct implementations of clauses that describe ONE set of rows.
//
// IT SHARES ROWS AND NEVER A VERDICT. thesis A3 :1413–:1414 — "every predicate is computed on read and none is
// stored … this document adds no cache" — so nothing below holds a computed answer: UNARGUED, FLAGGED,
// VERIFIED, GAP_LIST and FINGERPRINT are still CALLED, on rows this module loaded once. `corpusReads.ts`
// :522–:525 already states the same of itself, citing evidence A3 :1060–:1063: an OBSERVATION may be shared, a
// PREDICATE never.
//
// THREE WAVES, because the shape of the dependency is three deep and no deeper: what is keyed on the thesis,
// what is keyed on the ids that answers, and the handles of every researcher those name. Each wave is ONE
// `Promise.all`, so the wall is the slowest query of a wave and not the sum of the wave.
//
// THE SELECTS ARE THE UNION of what every consumer of these rows asks for today, so no consumer reads a column
// it did not read before and none reads one it does not need. Where a consumer's own select was narrower, the
// union is noted at the field.
// ---------------------------------------------------------------------------

const THESIS_SELECT = {
  id: true,
  provision: true,
  createdById: true,
  headVersionId: true,
  publishedVersionId: true,
  publicInterestStatement: true,
  publishedAt: true,
  createdAt: true,
} as const;

const VERSION_SELECT = {
  id: true,
  claim: true,
  text: true,
  contentHash: true,
  parentVersionId: true,
  createdById: true,
  createdAt: true,
} as const;

const MENTION_SELECT = {
  id: true,
  versionId: true,
  kind: true,
  name: true,
  contentVersionHash: true,
  debateSessionId: true,
  debateSession: { select: { status: true, recordFileHash: true, thesisId: true, promotedOverObjection: true } },
} as const;

const FRAMING_SELECT = {
  id: true,
  question: true,
  provision: true,
  fromRunId: true,
  researcherId: true,
  createdAt: true,
} as const;

const ROUND_SELECT = {
  id: true,
  framingId: true,
  sequence: true,
  type: true,
  content: true,
  researcherId: true,
  createdAt: true,
} as const;

const DEBATE_SELECT = {
  id: true,
  researcherId: true,
  createdAt: true,
  closedAt: true,
  status: true,
  promotedOverObjection: true,
  recordSnapshotId: true,
  recordDiffId: true,
  recordSnapshot: { select: { waybackTimestamp: true, trackedUrl: { select: { url: true } } } },
  recordDiff: {
    select: {
      trackedUrl: { select: { url: true } },
      beforeSnapshot: { select: { waybackTimestamp: true } },
      afterSnapshot: { select: { waybackTimestamp: true } },
    },
  },
  evidence: { select: { fileHash: true } },
} as const;

const DEBATE_EVENT_SELECT = { id: true, sessionId: true, type: true, content: true, createdAt: true } as const;

// EVERY ROW TYPE IS DERIVED FROM ITS OWN SELECT, never spelled beside it. A hand-written interface and the
// select it describes are two spellings of one shape, and the first version of this module had four of them
// disagree with the schema (`FramingRound.type` is an enum, `DebateEvent.content` is a string) — caught by
// `tsc` at the consumer rather than here, which is the late catch the rule exists to avoid.
/** The thesis row itself — `thesisContextOf`'s select (`getThesisContext.ts` :145–:154). */
export type ThesisRow = Prisma.ThesisGetPayload<{ select: typeof THESIS_SELECT }>;

/**
 * A version with everything any consumer reads — the transcript's select, which is the widest.
 *
 * `versionView` (`getThesisContext.ts` :330) and `loadHead` (`criticMaterial.ts` :52) each selected a subset of
 * these by `findUnique`; both become a lookup here.
 */
export type VersionRow = Prisma.ThesisVersionGetPayload<{ select: typeof VERSION_SELECT }>;

/**
 * A mention with everything any consumer reads — the UNION of two selects that were separate queries.
 *
 * The transcript reads `{ versionId, kind, name, contentVersionHash, debateSessionId }` (A4 :1476's VERSION
 * body, the STORED rows); the citation resolver reads `id` and the nested `debateSession` for ARGUED. **The
 * transcript's five are a SUBSET of these, so `transcriptOf` projects back down to exactly them** — a wider row
 * handed to `versionTurns` would put `id` and a nested `debateSession` (whose `thesisId` is another thesis's)
 * on the wire, because `versionTurns` :565 passes `version.mentions` through unchanged.
 */
export type MentionRow = Prisma.ThesisMentionGetPayload<{ select: typeof MENTION_SELECT }>;

/** A framing — the transcript's select, which adds `fromRunId` to `thesisContextOf`'s. */
export type FramingRow = Prisma.FramingGetPayload<{ select: typeof FRAMING_SELECT }>;

export type RoundRow = Prisma.FramingRoundGetPayload<{ select: typeof ROUND_SELECT }>;

export type DebateRow = Prisma.DebateSessionGetPayload<{ select: typeof DEBATE_SELECT }>;

export type DebateEventRow = Prisma.DebateEventGetPayload<{ select: typeof DEBATE_EVENT_SELECT }>;

/** A note — the whole row, as both note reads have always taken it. */
export type NoteRow = Note;

/** Every row the thesis read is a function of. Nothing here is a verdict (A3 :1413–:1414). */
export interface ThesisRows {
  thesis: ThesisRow;
  versions: VersionRow[];
  /** EVERY version's mentions, not one version's — the resolver filters, it does not re-read. */
  mentions: MentionRow[];
  framings: FramingRow[];
  rounds: RoundRow[];
  debates: DebateRow[];
  debateEvents: DebateEventRow[];
  analyses: ThesisAnalysis[];
  decisions: ThesisGapDecision[];
  attempts: PublicationAttempt[];
  withdrawals: Withdrawal[];
  /** The thesis's notes and its framings' notes together — a framing's note is the thesis's history (R47 D11). */
  notes: NoteRow[];
  /** researcherId → handle. A turn carries a handle and never an id (§4 :167). */
  handles: Map<string, string>;
}

/**
 * EVERY ROW OF ONE THESIS, in three waves — `null` when no such thesis exists, which is A4 :1476's `NO_THESIS`.
 *
 * `null` rather than a throw because the absence is an ANSWER here: `get_thesis_context` refuses `NO_THESIS` at
 * 404 and must say so in the refusal's own words. Every other missing row below IS a malformed state and is
 * left to the consumer's own loud guard, which is where those guards already live.
 */
export async function loadThesisRows(thesisId: string): Promise<ThesisRows | null> {
  // WAVE 1 — eight reads, every one keyed on `thesisId` and none reading another's answer.
  const [thesis, versions, framings, debates, decisions, attempts, withdrawals, thesisNotes] = await Promise.all([
    prisma.thesis.findUnique({ where: { id: thesisId }, select: THESIS_SELECT }),
    prisma.thesisVersion.findMany({ where: { thesisId }, select: VERSION_SELECT }),
    prisma.framing.findMany({ where: { thesisId }, select: FRAMING_SELECT }),
    prisma.debateSession.findMany({ where: { thesisId }, select: DEBATE_SELECT }),
    prisma.thesisGapDecision.findMany({ where: { thesisId } }),
    prisma.publicationAttempt.findMany({ where: { thesisId } }),
    prisma.withdrawal.findMany({ where: { thesisId } }),
    prisma.note.findMany({ where: { thesisId } }),
  ]);
  // THE ONE ABSENCE THAT IS AN ANSWER. Wave 1 is issued before the thesis is known to exist, which costs seven
  // reads that answer nothing on a bad id — against a wave of serial round trips on every good one. A refusal
  // is the rare path and the read is the common one.
  if (thesis === null) return null;

  const versionIds = versions.map((v) => v.id);
  const framingIds = framings.map((f) => f.id);
  const debateIds = debates.map((d) => d.id);

  // WAVE 2 — five reads, each keyed on wave 1's ids. An empty `in` is not asked at all: Prisma would issue the
  // round trip and the answer is known.
  const [mentions, rounds, debateEvents, analyses, framingNotes] = await Promise.all([
    versionIds.length === 0
      ? Promise.resolve([])
      : prisma.thesisMention.findMany({ where: { versionId: { in: versionIds } }, select: MENTION_SELECT }),
    framingIds.length === 0
      ? Promise.resolve([])
      : prisma.framingRound.findMany({ where: { framingId: { in: framingIds } }, select: ROUND_SELECT }),
    debateIds.length === 0
      ? Promise.resolve([])
      : prisma.debateEvent.findMany({ where: { sessionId: { in: debateIds } }, orderBy: { createdAt: 'asc' }, select: DEBATE_EVENT_SELECT }),
    versionIds.length === 0
      ? Promise.resolve([])
      : prisma.thesisAnalysis.findMany({ where: { versionId: { in: versionIds } } }),
    framingIds.length === 0 ? Promise.resolve([]) : prisma.note.findMany({ where: { framingId: { in: framingIds } } }),
  ]);

  const notes = [...thesisNotes, ...framingNotes];

  // WAVE 3 — one read: every researcher any row above names, resolved to a handle in one query. `handlesOf`
  // throws on a row whose author does not exist rather than reading as an anonymous author (R47 §6-R8).
  const handles = await handlesOf([
    thesis.createdById,
    ...framings.map((f) => f.researcherId),
    ...rounds.map((r) => r.researcherId),
    ...versions.map((v) => v.createdById),
    ...debates.map((d) => d.researcherId),
    ...analyses.map((a) => a.researcherId),
    ...decisions.map((d) => d.researcherId),
    ...attempts.map((a) => a.researcherId),
    ...withdrawals.map((w) => w.researcherId),
    ...notes.map((n) => n.researcherId),
  ]);

  return {
    thesis,
    versions,
    mentions,
    framings,
    rounds,
    debates,
    debateEvents,
    analyses,
    decisions,
    attempts,
    withdrawals,
    notes,
    handles,
  };
}

/**
 * ONE VERSION OF THE ROWS — a lookup, never a read. `null` is "this thesis has no such version", which every
 * caller treats as the malformed state it is and reports with its own loud guard.
 */
export function versionOf(rows: ThesisRows, versionId: string): VersionRow | null {
  return rows.versions.find((v) => v.id === versionId) ?? null;
}

/** One version's mention rows — the filter that replaced a `thesisMention.findMany` per version. */
export function mentionsOf(rows: ThesisRows, versionId: string): MentionRow[] {
  return rows.mentions.filter((m) => m.versionId === versionId);
}
