import { prisma } from '../lib/prisma';
import type { NamedRecord } from './openDebate';
import type { BlockerCode } from '../mcp/tools/evidenceRefusals';

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
  /**
   * The record as A1 names it, rebuilt from the session's own key — so
   * `promote_from_debate` re-runs the SAME checks `open_debate` ran without the
   * caller naming the record again. Null only for a session whose key resolves to
   * nothing, which is a malformed row the checks then refuse on.
   */
  record: NamedRecord | null;
  /** The thesis's author and head — what NOT_AUTHOR and NOT_CITED are decided from. */
  thesis: { createdById: string | null; headVersionId: string | null };
  events: { type: string; content: string; at: Date }[];
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
  events: { type: string; content: string; at: Date }[];
}

export async function loadDebate(sessionId: string): Promise<LoadedDebate | null> {
  const row = await prisma.diffDebateSession.findUnique({
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
      recordSnapshot: { select: { waybackTimestamp: true, trackedUrl: { select: { url: true } } } },
      recordDiff: {
        select: {
          trackedUrl: { select: { url: true } },
          beforeSnapshot: { select: { waybackTimestamp: true } },
          afterSnapshot: { select: { waybackTimestamp: true } },
        },
      },
      evidence: { select: { fileHash: true } },
      thesis: { select: { createdById: true, headVersionId: true } },
      events: {
        orderBy: { createdAt: 'asc' },
        select: { type: true, content: true, createdAt: true },
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
    record: namedRecordOf(row),
    thesis: row.thesis,
    events: row.events.map((e) => ({ type: e.type, content: e.content, at: e.createdAt })),
  };
}

/** The record this debate argues for, by page and timestamps — never by a row id (A1). */
function namedRecordOf(row: {
  recordSnapshot: { waybackTimestamp: string | null; trackedUrl: { url: string } } | null;
  recordDiff: {
    trackedUrl: { url: string };
    beforeSnapshot: { waybackTimestamp: string | null };
    afterSnapshot: { waybackTimestamp: string | null };
  } | null;
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
export function projectDebate(debate: LoadedDebate, blockedBy: BlockerCode[]): DebateState {
  return {
    sessionId: debate.id,
    thesisId: debate.thesisId,
    fileHash: debate.recordFileHash,
    status: debate.status,
    hasSubstance: debate.hasSubstance,
    verdict: debate.verdict,
    canPromote: blockedBy.length === 0,
    blockedBy,
    promotedOverObjection: debate.promotedOverObjection,
    evidenceFileHash: debate.evidenceFileHash,
    events: debate.events,
  };
}

/** The debate so far, as the assessor reads it — oldest first, verbatim (§4). */
export function priorTurns(debate: LoadedDebate): string[] {
  return debate.events
    .filter((e) => e.type === 'RATIONALE_SUBMITTED' || e.type === 'RESPONSE_SUBMITTED' || e.type === 'ASSESSMENT_RETURNED')
    .map((e) => `[${e.type}] ${e.content}`);
}
