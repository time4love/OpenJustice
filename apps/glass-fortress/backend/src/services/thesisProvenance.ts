import { prisma } from '../lib/prisma';
import {
  ThesisFramingAssessmentSchema,
  type ThesisFramingAssessment,
} from './ThesisFramingAssessorAgent';
import {
  ThesisPublicationAssessmentSchema,
  type ThesisPublicationAssessment,
} from './ThesisPublicationAssessorAgent';

// ---------------------------------------------------------------------------
// How this thesis came to say what it says.
//
// docs/gf-thesis-provenance-ui-dev-plan.md. Every consequential act on a thesis
// was already recorded as a ResearchSessionEvent, and none of it was reachable
// outside MCP: no REST route exposed session events and no frontend file
// referenced sessions at all. The record existed and only a researcher driving
// tools could read it — on a platform whose whole claim is that assertions
// trace to checkable proof.
//
// Two rules shape everything below.
//
//   Assessments are parsed HERE, never handed to the client as a string.
//   FRAMING_ASSESSED and PUBLICATION_ASSESSED store JSON in `description`. A
//   client that parses prose is a client that breaks when the prose changes.
//
//   A malformed stored assessment is reported AS malformed. Not omitted, not
//   rendered as empty. "No contradictions were found" and "the record is
//   broken" are opposite facts, and the same rule governs NO_SOURCE_TEXT
//   elsewhere in this codebase.
//
// Scope is `where: { thesisId }` and nothing more. attachThesisToFraming sets
// thesisId on the framing session at attach time, so a framing session that
// produced a thesis is found by the same query as any other. One that produced
// none keeps thesisId: null and is deliberately invisible here — an abandoned
// framing is not a thesis's provenance.
// ---------------------------------------------------------------------------

/**
 * A stored assessment, in one of three states — and they are three, not two.
 *
 * `absent` is for an event that carries no assessment at all. `malformed` is a
 * record that exists and cannot be read, which is a defect worth seeing rather
 * than a quiet empty section.
 */
export type ParsedAssessment<T> =
  | { state: 'ok'; value: T }
  | { state: 'malformed'; reason: string; raw: string }
  | { state: 'absent' };

/**
 * Parse a stored assessment into one of the three states.
 *
 * Exported because `getThesisFraming` needs it too: it used a bare JSON.parse,
 * so a malformed row did not read as malformed — it threw, and took the whole
 * `get_thesis_framing` tool down with it.
 */

/** How much of a malformed record to hand back. Enough to diagnose, not a dump. */
const MALFORMED_RAW_LIMIT = 2_000;

export function parseAssessment<T>(
  raw: string,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: { message: string } } },
): ParsedAssessment<T> {
  if (raw.trim().length === 0) return { state: 'absent' };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return {
      state: 'malformed',
      reason: `Stored assessment is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      raw: raw.slice(0, MALFORMED_RAW_LIMIT),
    };
  }

  // Validated, not merely parsed. Valid JSON of the wrong shape would otherwise
  // render as an assessment with no contradictions — indistinguishable from a
  // real assessment that found none.
  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      state: 'malformed',
      reason: `Stored assessment does not match the expected shape: ${result.error?.message ?? 'unknown validation error'}`,
      raw: raw.slice(0, MALFORMED_RAW_LIMIT),
    };
  }
  return { state: 'ok', value: result.data as T };
}

// ---------------------------------------------------------------------------
// Result types
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

export interface ProvenanceEvent {
  id: string;
  type: ProvenanceEventType;
  createdAt: string;
  refId: string | null;
  /**
   * The event's text. Null for the two assessment types, whose content is in
   * `framingAssessment` / `publicationAssessment` — returning the JSON string
   * beside its parsed form invites a client to read the string.
   */
  description: string | null;
  framingAssessment?: ParsedAssessment<ThesisFramingAssessment>;
  publicationAssessment?: ParsedAssessment<ThesisPublicationAssessment>;
}

export interface ProvenanceSession {
  id: string;
  name: string;
  question: string | null;
  status: string;
  createdAt: string;
  closedAt: string | null;
  /**
   * Who opened it. Null on sessions predating ownership — render as unknown,
   * never as an empty name: a blank actor reads as "nobody", and these were
   * opened by someone the record simply does not name.
   */
  researcherId: string | null;
  researcherHandle: string | null;
  events: ProvenanceEvent[];
}

export interface ThesisProvenance {
  thesisId: string;
  sessions: ProvenanceSession[];
  counts: {
    sessions: number;
    events: number;
    /** Assessments that could not be read. Non-zero is a defect, not a finding. */
    malformedAssessments: number;
  };
  /** True when no session was ever attached — a state, not a blank. */
  empty: boolean;
  /**
   * Present when a publication assessment recorded DISPUTES. Surfaced at the
   * top level because a thesis published over a recorded objection is the most
   * important thing in this record, and the "published" badge hides it.
   */
  recordedDissent: {
    sessionId: string;
    eventId: string;
    createdAt: string;
    objection: string;
  }[];
}

export type ThesisProvenanceResult =
  | { error: 'THESIS_NOT_FOUND'; thesisId: string }
  | ThesisProvenance;

// ---------------------------------------------------------------------------

const ASSESSMENT_TYPES = new Set(['FRAMING_ASSESSED', 'PUBLICATION_ASSESSED']);

export async function getThesisProvenance(thesisId: string): Promise<ThesisProvenanceResult> {
  const thesis = await prisma.thesis.findUnique({ where: { id: thesisId }, select: { id: true } });
  if (!thesis) return { error: 'THESIS_NOT_FOUND', thesisId };

  const sessions = await prisma.researchSession.findMany({
    where: { thesisId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      question: true,
      status: true,
      createdAt: true,
      closedAt: true,
      researcherId: true,
      researcher: { select: { handle: true } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  });

  let malformedAssessments = 0;
  const recordedDissent: ThesisProvenance['recordedDissent'] = [];

  const mapped: ProvenanceSession[] = sessions.map((session) => ({
    id: session.id,
    name: session.name,
    question: session.question,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    researcherId: session.researcherId,
    researcherHandle: session.researcher?.handle ?? null,
    events: session.events.map((event) => {
      const base: ProvenanceEvent = {
        id: event.id,
        type: event.type,
        createdAt: event.createdAt.toISOString(),
        refId: event.refId,
        description: ASSESSMENT_TYPES.has(event.type) ? null : event.description,
      };

      if (event.type === 'FRAMING_ASSESSED') {
        const parsed = parseAssessment<ThesisFramingAssessment>(
          event.description,
          ThesisFramingAssessmentSchema,
        );
        if (parsed.state === 'malformed') malformedAssessments += 1;
        return { ...base, framingAssessment: parsed };
      }

      if (event.type === 'PUBLICATION_ASSESSED') {
        const parsed = parseAssessment<ThesisPublicationAssessment>(
          event.description,
          ThesisPublicationAssessmentSchema,
        );
        if (parsed.state === 'malformed') malformedAssessments += 1;
        if (parsed.state === 'ok' && parsed.value.verdict === 'DISPUTES') {
          recordedDissent.push({
            sessionId: session.id,
            eventId: event.id,
            createdAt: event.createdAt.toISOString(),
            objection: parsed.value.objection,
          });
        }
        return { ...base, publicationAssessment: parsed };
      }

      return base;
    }),
  }));

  return {
    thesisId,
    sessions: mapped,
    counts: {
      sessions: mapped.length,
      events: mapped.reduce((sum, s) => sum + s.events.length, 0),
      malformedAssessments,
    },
    empty: mapped.length === 0,
    recordedDissent,
  };
}
