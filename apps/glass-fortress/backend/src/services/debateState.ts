import { prisma } from '../lib/prisma';
import type { NamedRecord } from './evidenceReviews';
import type { BlockerCode } from '../mcp/tools/evidenceRefusals';
import { handlesOf } from './publishedThesis';
import { debateTurns, orderTurns, voicesOf, type Turn } from './thesisTranscript';

// ---------------------------------------------------------------------------
// ONE PROJECTION OF A DEBATE, FOR ALL FOUR TOOLS — docs/gf-evidence-flows.md A4.
//
// A4 gives `open_debate` a return "the debate state: { sessionId, fileHash,
// hasSubstance, verdict, canPromote, blockedBy, events }", and the other three
// answer with the same thing. Composed HERE and nowhere else, so four tools
// cannot each grow their own idea of what a debate is — which is how
// `get_forensic_timeline` came to describe a diff differently from the tool that
// wrote it.
//
// THE EVENTS ARE VERBATIM. The table's own schema comment says it: "content is
// stored verbatim — this is the record, not a log". The assessor's Hebrew, the
// researcher's rationale and their responses are returned as written; nothing
// here re-words a model's output or a researcher's.
//
// AND SINCE 2026-09-20 THEY ARE TURNS, NOT ROWS — evidence A4 :1123, RULED by the researcher (R66 „Q2 amend”):
// "ONE `DebateState` for every debate tool, the shape get_debate answers at :1144 … `events` as raw rows is
// RETIRED from every debate tool's answer (open_debate · respond_in_debate · promote_from_debate · get_debate)."
// `turns` comes from `debateTurns`, the SAME builder the thesis transcript uses (thesis A4 :1476), so a debate
// read from its own tool and the same debate read inside `get_thesis_context` are the same five kinds with the
// same bodies. `record` is named here too, as A1 names it — `projectDebate` had dropped it, and a sheet cannot
// say which record an argument is about from a fileHash.
//
// VERBATIM SURVIVES THE CHANGE: a RATIONALE turn's body is `{ text }` and the text is the stored content,
// untouched; an ASSESSMENT's JSON is PARSED and a parse failure is reported as `malformed`, never smoothed.
// ---------------------------------------------------------------------------

/** A session and everything the four tools read of it, loaded once. */
export interface LoadedDebate {
  id: string;
  thesisId: string;
  recordFileHash: string;
  status: string;
  hasSubstance: boolean;
  verdict: string | null;
  promotedOverObjection: boolean;
  evidenceId: string | null;
  evidenceFileHash: string | null;
  recordSnapshotId: string | null;
  recordDiffId: string | null;
  /** The document's commitment, for a debate on a document (document A2 :1339–:1341); null otherwise. */
  recordCommitment: string | null;
  /**
   * The record as A1 names it, rebuilt from the session's own key — so
   * `promote_from_debate` re-runs the SAME checks `open_debate` ran without the
   * caller naming the record again. Null only for a session whose key resolves to
   * nothing, which is a malformed row the checks then refuse on. The ANSWER's
   * form (R81 QB): a document is `{ commitment, title }`, turned back into the
   * input by `openDebate.debateInputOf`.
   */
  record: NamedRecord | null;
  /** The thesis's author and head — what NOT_AUTHOR and NOT_CITED are decided from. */
  thesis: { createdById: string | null; headVersionId: string | null };
  /** Who opened the argument — HISTORY attributes it (evidence T3 :371); the DEBATE_OPENED turn's voice. */
  researcherId: string;
  createdAt: Date;
  closedAt: Date | null;
  /** The pinned content version the citation carried — the DEBATE_OPENED turn's `pin`. */
  pin: string | null;
  events: { id: string; type: string; content: string; at: Date }[];
}

/** The debate as every tool returns it. */
export interface DebateState {
  sessionId: string;
  thesisId: string;
  fileHash: string;
  status: string;
  hasSubstance: boolean;
  verdict: string | null;
  canPromote: boolean;
  blockedBy: BlockerCode[];
  promotedOverObjection: boolean;
  evidenceFileHash: string | null;
  /** The record this argument is about, as A1 names it — never a fileHash alone (:1144). */
  record: NamedRecord | null;
  /** The thread's turns, from the transcript's own builder, oldest first (:1123). */
  turns: Turn[];
}

export async function loadDebate(sessionId: string): Promise<LoadedDebate | null> {
  const row = await prisma.debateSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      thesisId: true,
      recordFileHash: true,
      status: true,
      hasSubstance: true,
      verdict: true,
      promotedOverObjection: true,
      evidenceId: true,
      recordSnapshotId: true,
      recordDiffId: true,
      recordCommitment: true,
      recordSnapshot: { select: { waybackTimestamp: true, trackedUrl: { select: { url: true } } } },
      recordDocument: { select: { commitment: true, title: true } },
      recordDiff: {
        select: {
          trackedUrl: { select: { url: true } },
          beforeSnapshot: { select: { waybackTimestamp: true } },
          afterSnapshot: { select: { waybackTimestamp: true } },
        },
      },
      evidence: { select: { fileHash: true } },
      thesis: { select: { createdById: true, headVersionId: true } },
      researcherId: true,
      createdAt: true,
      closedAt: true,
      events: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, type: true, content: true, createdAt: true },
      },
    },
  });
  if (row === null) return null;
  return {
    id: row.id,
    thesisId: row.thesisId,
    recordFileHash: row.recordFileHash,
    status: row.status,
    hasSubstance: row.hasSubstance,
    verdict: row.verdict,
    promotedOverObjection: row.promotedOverObjection,
    evidenceId: row.evidenceId,
    evidenceFileHash: row.evidence?.fileHash ?? null,
    recordSnapshotId: row.recordSnapshotId,
    recordDiffId: row.recordDiffId,
    // `?? null`: a store-seeded session in the evidence double (which answers whatever the select) predates the key.
    recordCommitment: row.recordCommitment ?? null,
    record: namedRecordOf(row),
    thesis: row.thesis,
    researcherId: row.researcherId,
    createdAt: row.createdAt,
    closedAt: row.closedAt,
    // THE PIN IN ITS OWN QUERY, as the transcript reads it: the double serves no nested relation here, and a
    // session's citation is a row of another table rather than a shape this one carries.
    pin:
      (
        await prisma.thesisMention.findMany({
          where: { debateSessionId: row.id },
          select: { contentVersionHash: true },
        })
      ).at(0)?.contentVersionHash ?? null,
    events: row.events.map((e) => ({ id: e.id, type: e.type, content: e.content, at: e.createdAt })),
  };
}

/**
 * The record this debate argues for, by page and timestamps — never by a row id (A1) — or, for a document, by its
 * commitment and title: `{ commitment, title }`, ONE shape wherever a record is answered (evidence A4 :1123, :1144 as
 * ruled 2026-09-25, R81 QB).
 *
 * EXPORTED 2026-09-20 (R66): the transcript builds a DEBATE_OPENED turn for every debate of a thesis, and it
 * names the record the same way this loader does. A second spelling of "the record as A1 names it" is exactly
 * the drift this module was written to stop.
 *
 * `recordDocument` IS OPTIONAL IN THIS PARAMETER, and only here: both loaders select it, but the evidence double
 * answers a seeded session whatever the select (`test/helpers/evidenceDouble.ts` `defaultSessionLookup`), and the
 * seeds written before document step 33 carry no such key. The capture and pair arms are asked first, unchanged.
 */
export function namedRecordOf(row: {
  recordSnapshot: { waybackTimestamp: string | null; trackedUrl: { url: string } } | null;
  recordDiff: {
    trackedUrl: { url: string };
    beforeSnapshot: { waybackTimestamp: string | null };
    afterSnapshot: { waybackTimestamp: string | null };
  } | null;
  recordDocument?: { commitment: string; title: string | null } | null;
}): NamedRecord | null {
  const capture = row.recordSnapshot?.waybackTimestamp;
  if (row.recordSnapshot !== null && capture != null) {
    return { url: row.recordSnapshot.trackedUrl.url, capture };
  }
  const before = row.recordDiff?.beforeSnapshot.waybackTimestamp;
  const after = row.recordDiff?.afterSnapshot.waybackTimestamp;
  if (row.recordDiff !== null && before != null && after != null) {
    return { url: row.recordDiff.trackedUrl.url, before, after };
  }
  if (row.recordDocument != null) {
    return { commitment: row.recordDocument.commitment, title: row.recordDocument.title };
  }
  return null;
}

/**
 * The state, with the blockers the CALLER computed.
 *
 * `blockedBy` is passed in rather than derived here, and that is what keeps
 * `canPromote` honest: `promote_from_debate` refuses on exactly the list this
 * shows, because both come from one call to `promotionBlockers`. A projection
 * that computed its own would be free to say `canPromote: true` beside a tool
 * that refuses.
 */
export function projectDebate(debate: LoadedDebate, blockedBy: BlockerCode[], turns: Turn[]): DebateState {
  return {
    sessionId: debate.id,
    thesisId: debate.thesisId,
    fileHash: debate.recordFileHash,
    record: debate.record,
    status: debate.status,
    hasSubstance: debate.hasSubstance,
    verdict: debate.verdict,
    canPromote: blockedBy.length === 0,
    blockedBy,
    promotedOverObjection: debate.promotedOverObjection,
    evidenceFileHash: debate.evidenceFileHash,
    turns,
  };
}

/**
 * THE THREAD'S TURNS, from the transcript's own builder (:1123, thesis A4 :1476).
 *
 * It resolves the handles itself — a debate names ONE researcher, its opener — because every tool that answers a
 * `DebateState` must produce the same five kinds without each one learning how a voice is built.
 */
export async function turnsOf(debate: LoadedDebate, callerId: string | null): Promise<Turn[]> {
  const handles = await handlesOf([debate.researcherId]);
  const voices = voicesOf(handles, callerId, debate.thesisId);
  return orderTurns(
    debateTurns(
      {
        id: debate.id,
        researcherId: debate.researcherId,
        createdAt: debate.createdAt,
        closedAt: debate.closedAt,
        status: debate.status,
        promotedOverObjection: debate.promotedOverObjection,
        evidenceFileHash: debate.evidenceFileHash,
        record: debate.record,
        pin: debate.pin,
        events: debate.events.map((e) => ({ id: e.id, type: e.type, content: e.content, createdAt: e.at })),
      },
      voices,
    ),
  );
}

/** The debate so far, as the assessor reads it — oldest first, verbatim (§4). */
export function priorTurns(debate: LoadedDebate): string[] {
  return debate.events
    .filter((e) => e.type === 'RATIONALE_SUBMITTED' || e.type === 'RESPONSE_SUBMITTED' || e.type === 'ASSESSMENT_RETURNED')
    .map((e) => `[${e.type}] ${e.content}`);
}
