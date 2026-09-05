import { Prisma, type PageDecision } from '@prisma/client';
import type { Decision, DecisionType } from './derivations';

// ---------------------------------------------------------------------------
// THE PAGE'S LOG WRITER — docs/gf-interaction-flows.md A2 (Decision) and A7.
//
// ONE MECHANISM, ONE MODULE. Every write tool appends its decisions here,
// inside ITS OWN transaction: the writer reads the page's last sequence,
// numbers the entries contiguously after it, and inserts them. The unique
// index on (trackedUrlId, sequence) is the compare-and-set — a write that
// finds the sequence moved is rejected by the index, surfaces here as
// StaleSequenceError, and every tool answers it as STALE_SEQUENCE. Nothing is
// retried: the researcher re-reads, which is A7's whole protocol.
//
// The legacy `sequencedWrite` and `appendCalibrationDecision` re-homed from
// the run to the page (refactor plan §2, TRANSFORM). This is the only module
// under src/walk that creates a PageDecision, and nothing anywhere updates or
// deletes one — invariant I4, held by scan.
//
// A2's REQUIRED fields are LOUD GUARDS, checked over every entry BEFORE the
// first insert: a decision missing what its type requires is a defect in the
// caller, and a row written without it would be read later as a judgement it
// never was.
// ---------------------------------------------------------------------------

/** A decision as a tool states it; the writer supplies the page and the sequence. */
export interface DecisionEntry {
  type: DecisionType;
  researcherId: string;
  waybackTimestamp?: string;
  ruleId?: string;
  reason?: string;
  rulesetId?: string;
}

/** A decision as written: the entry, its sequence, and the id the database gave it. */
export interface WrittenDecision extends DecisionEntry {
  id: string;
  sequence: number;
}

/**
 * What the writer needs of a transaction — the shape, not the client, so the
 * mechanism is testable with a hand-built `tx` and the real
 * `Prisma.TransactionClient` satisfies it structurally.
 */
export interface PageLogClient {
  pageDecision: {
    findFirst(args: {
      where: { trackedUrlId: string };
      orderBy: { sequence: 'desc' };
      select: { sequence: true };
    }): Promise<{ sequence: number } | null>;
    create(args: { data: PageDecisionData }): Promise<{ id: string }>;
  };
}

/**
 * The row as inserted — every A2 column, absent ones written as null — picked
 * from the generated model, so a column renamed in the schema fails to compile
 * here rather than drifting. (A mapped type also carries the implicit index
 * signature a hand-built transaction's `create` parameter expects; an
 * interface would not.)
 */
export type PageDecisionData = Pick<
  PageDecision,
  'trackedUrlId' | 'sequence' | 'type' | 'researcherId' | 'waybackTimestamp' | 'ruleId' | 'reason' | 'rulesetId'
>;

export class StaleSequenceError extends Error {
  constructor(
    readonly trackedUrlId: string,
    readonly sequence: number,
  ) {
    super(
      `The decision log of page ${trackedUrlId} moved under this write: sequence ${String(sequence)} ` +
        'is already taken. Re-read the page and decide again.',
    );
    this.name = 'StaleSequenceError';
  }
}

// A Record over the type: a decision type the union gains without a line here
// fails to compile rather than passing unguarded.
const REQUIRED: Record<DecisionType, readonly (keyof DecisionEntry)[]> = {
  RULESET_CORRECTED: ['researcherId', 'waybackTimestamp'],
  CAPTURE_ACCEPTED: ['researcherId', 'waybackTimestamp', 'rulesetId'],
  CAPTURE_SKIPPED: ['researcherId', 'waybackTimestamp', 'rulesetId', 'reason'],
  RULE_TRUSTED: ['researcherId', 'waybackTimestamp', 'ruleId'],
  RULE_ENDED: ['researcherId', 'waybackTimestamp', 'ruleId'],
  RULE_RETIRED: ['researcherId', 'waybackTimestamp', 'ruleId'],
  RULE_EXTENDED: ['researcherId', 'waybackTimestamp', 'ruleId'],
  RESET: ['researcherId', 'reason'],
};

/** Present and, for a string, not blank — a blank reason is no reason. */
function isSupplied(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

function requireFields(entry: DecisionEntry): void {
  for (const field of REQUIRED[entry.type]) {
    if (!isSupplied(entry[field])) {
      throw new Error(`A ${entry.type} decision requires ${field}; the caller supplied none.`);
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Append decisions to the page's log, in the order given, numbered after the
 * page's last sequence as read inside the caller's transaction.
 *
 * Throws StaleSequenceError when the unique index rejects an insert — the
 * sequence moved under this write. Any other error propagates unchanged.
 */
export async function appendDecisions(
  tx: PageLogClient,
  trackedUrlId: string,
  entries: readonly DecisionEntry[],
): Promise<WrittenDecision[]> {
  for (const entry of entries) requireFields(entry);

  const last = await tx.pageDecision.findFirst({
    where: { trackedUrlId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });
  let sequence = last?.sequence ?? 0;

  const written: WrittenDecision[] = [];
  for (const entry of entries) {
    sequence += 1;
    try {
      // The payload is spelled out here, not built elsewhere and passed in:
      // the I4 scan reads the columns of every `data: { … }` on this delegate,
      // and `researcherId` has to be visible on the create itself.
      const created = await tx.pageDecision.create({
        data: {
          trackedUrlId,
          sequence,
          type: entry.type,
          researcherId: entry.researcherId,
          waybackTimestamp: entry.waybackTimestamp ?? null,
          ruleId: entry.ruleId ?? null,
          reason: entry.reason ?? null,
          rulesetId: entry.rulesetId ?? null,
        },
      });
      written.push({ ...entry, id: created.id, sequence });
    } catch (err) {
      if (isUniqueViolation(err)) throw new StaleSequenceError(trackedUrlId, sequence);
      throw err;
    }
  }
  return written;
}

/** A written decision as the derivations read it — so a tool can extend the log it holds. */
export function asDecision(written: WrittenDecision): Decision {
  return {
    id: written.id,
    sequence: written.sequence,
    type: written.type,
    waybackTimestamp: written.waybackTimestamp ?? null,
    ruleId: written.ruleId ?? null,
    rulesetId: written.rulesetId ?? null,
  };
}
