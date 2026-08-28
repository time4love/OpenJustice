import { SurvivalVerdict } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { survivalSourceStateHash } from '../lib/diffSurvival';

/**
 * IS EVERY DIFF'S VERDICT PRESENT, AND IS IT STILL ABOUT THIS DIFF?
 *
 * Level 5 stores a verdict. Storing one is not the same as HAVING one, and this
 * is the module that can tell the difference — for the whole corpus, in either
 * environment, without the Archive, a model or a network.
 *
 * THREE STATES, AND THE FIRST TWO ARE THE POINT.
 *
 *   UNCHECKED  no verdict at all. `survivalVerdict` is nullable because rows
 *              written before the check existed do exist — and NULL MEANS NEVER
 *              CHECKED, WHICH IS NOT THE SAME AS PASSING. Without something that
 *              names this state, a diff that was never checked is indistinguish-
 *              able from one that passed, which is the exact failure §3 exists to
 *              prevent: an unavailable check counting as a result.
 *
 *   STALE      a verdict computed against inputs the row no longer holds. Made
 *              COMPUTABLE rather than assumed by recomputing the source-state
 *              hash and comparing — see `survivalSourceStateHash`, which commits
 *              to all four of the checker's inputs precisely so this comparison
 *              can be made.
 *
 *   CURRENT    a verdict, computed against what the row holds now. Only these
 *              are counted into the SURVIVES / CONTRADICTED / UNCHECKABLE
 *              distribution, because only these are answers to the question
 *              being asked today.
 *
 * READ-ONLY, AND THAT IS LOAD-BEARING. It writes nothing, so it can be re-run to
 * check the backfill that acts on it. A measurement that repairs as it goes
 * cannot be used to verify its own repair.
 */

export type SurvivalState = 'UNCHECKED' | 'STALE' | 'CURRENT';

export interface DiffSurvivalState {
  diffId: string;
  beforeDate: string;
  afterDate: string;
  state: SurvivalState;
  /** Null exactly when the state is UNCHECKED. */
  verdict: SurvivalVerdict | null;
  /** Why it is STALE — populated for that state alone. */
  reason?: string;
}

export interface SurvivalAuditReport {
  diffs: DiffSurvivalState[];
  summary: {
    total: number;
    unchecked: number;
    stale: number;
    current: number;
    /** Among CURRENT only: a stale or absent verdict is not a result. */
    survives: number;
    contradicted: number;
    uncheckable: number;
  };
}

/**
 * The inputs a stored verdict must still match.
 *
 * Exported so the backfill computes its work list from the same definition of
 * "needs checking" that the audit reports — one rule, not two.
 */
export function survivalStateOf(diff: {
  survivalVerdict: SurvivalVerdict | null;
  survivalSourceStateHash: string | null;
  survivalTextVersion: string | null;
  rawDeletedText: string;
  rawAddedText: string;
  beforeSnapshot: { textHash: string; textExtractionVersion: string };
  afterSnapshot: { textHash: string; textExtractionVersion: string };
}): { state: SurvivalState; reason?: string } {
  // A verdict without the provenance to check it is not a verdict that can be
  // trusted, so an absent hash is UNCHECKED rather than CURRENT — the same
  // reasoning that makes NULL mean never-checked.
  if (diff.survivalVerdict === null || diff.survivalSourceStateHash === null) {
    return { state: 'UNCHECKED' };
  }

  const expected = survivalSourceStateHash({
    beforeTextHash: diff.beforeSnapshot.textHash,
    afterTextHash: diff.afterSnapshot.textHash,
    rawDeletedText: diff.rawDeletedText,
    rawAddedText: diff.rawAddedText,
  });
  if (expected !== diff.survivalSourceStateHash) {
    return {
      state: 'STALE',
      reason:
        'The verdict was computed against different inputs than this row now holds — ' +
        'either the captures were re-derived or the diff’s own chunks were rewritten.',
    };
  }

  // Checked separately from the hash, and deliberately: an extraction rule can be
  // revised without changing what it produces for THIS page, leaving the hash
  // equal while the verdict was decided under a rule no longer in force. Flagging
  // it costs a recomputation of a pure function; not flagging it costs the
  // ability to answer "re-check everything decided under v2" as a query.
  if (diff.survivalTextVersion !== diff.beforeSnapshot.textExtractionVersion) {
    return {
      state: 'STALE',
      reason:
        `The verdict was decided under extraction rule ${String(diff.survivalTextVersion)}, ` +
        `and the before capture now reads ${diff.beforeSnapshot.textExtractionVersion}.`,
    };
  }

  return { state: 'CURRENT' };
}

export async function auditDiffSurvival(): Promise<SurvivalAuditReport> {
  const diffs = await prisma.urlVersionDiff.findMany({
    select: {
      id: true,
      beforeDate: true,
      afterDate: true,
      rawDeletedText: true,
      rawAddedText: true,
      survivalVerdict: true,
      survivalSourceStateHash: true,
      survivalTextVersion: true,
      beforeSnapshot: { select: { textHash: true, textExtractionVersion: true } },
      afterSnapshot: { select: { textHash: true, textExtractionVersion: true } },
    },
    orderBy: { beforeDate: 'asc' },
  });

  const states: DiffSurvivalState[] = diffs.map((diff) => {
    const { state, reason } = survivalStateOf(diff);
    return {
      diffId: diff.id,
      beforeDate: diff.beforeDate,
      afterDate: diff.afterDate,
      state,
      verdict: diff.survivalVerdict,
      ...(reason === undefined ? {} : { reason }),
    };
  });

  const current = states.filter((s) => s.state === 'CURRENT');
  const countVerdict = (v: SurvivalVerdict): number =>
    current.filter((s) => s.verdict === v).length;

  return {
    diffs: states,
    summary: {
      total: states.length,
      unchecked: states.filter((s) => s.state === 'UNCHECKED').length,
      stale: states.filter((s) => s.state === 'STALE').length,
      current: current.length,
      survives: countVerdict('SURVIVES'),
      contradicted: countVerdict('CONTRADICTED'),
      uncheckable: countVerdict('UNCHECKABLE'),
    },
  };
}

// ---------------------------------------------------------------------------
// WHAT A READER IS SHOWN.
//
// The API builds diff records in THREE independent places, and the report HTML
// is a fourth reader. Adding a verdict to one of them is exactly how Level 2's
// admission gate came to cover one path out of four — so the mapping from stored
// columns to a display state exists once, here, and every surface calls it.
//
// FIVE STATES, NOT THREE, and the two extra ones are the honest part:
// `UNCHECKED` and `STALE` are the states in which the platform HAS NO CURRENT
// ANSWER. Collapsing either into SURVIVES would be an unavailable check counting
// as a result — and it is the reader, not the script, who acts on what is shown.
// ---------------------------------------------------------------------------

export type SurvivalDisplayState =
  | 'UNCHECKED'
  | 'STALE'
  | 'SURVIVES'
  | 'CONTRADICTED'
  | 'UNCHECKABLE';

export interface DiffSurvivalView {
  state: SurvivalDisplayState;
  /** How many reported chunks the verdict was formed over — a denominator. */
  chunksChecked: number | null;
  /** How many of them the documents refute. */
  contradictedCount: number;
  checkedAt: string | null;
  /** Present for STALE and UNCHECKABLE: why there is no usable answer. */
  reason?: string;
}

/** Everything the display state is derived from, and nothing else. */
export interface SurvivalViewInput {
  survivalVerdict: SurvivalVerdict | null;
  survivalSourceStateHash: string | null;
  survivalTextVersion: string | null;
  survivalCheckedAt: Date | null;
  survivalChunksChecked: number | null;
  survivalContradicted: unknown;
  rawDeletedText: string;
  rawAddedText: string;
  beforeSnapshot: { textHash: string; textExtractionVersion: string };
  afterSnapshot: { textHash: string; textExtractionVersion: string };
}

export function diffSurvivalView(diff: SurvivalViewInput): DiffSurvivalView {
  const { state, reason } = survivalStateOf(diff);
  const contradictedCount = Array.isArray(diff.survivalContradicted)
    ? diff.survivalContradicted.length
    : 0;
  const checkedAt = diff.survivalCheckedAt?.toISOString() ?? null;

  // UNCHECKED and STALE never carry the verdict forward, however reassuring it
  // reads: a diff nobody has checked against what it now holds must not be
  // displayable as one that passed.
  if (state === 'UNCHECKED' || state === 'STALE') {
    return {
      state,
      chunksChecked: null,
      contradictedCount: 0,
      checkedAt: state === 'STALE' ? checkedAt : null,
      ...(reason === undefined ? {} : { reason }),
    };
  }

  // Unreachable while the state is CURRENT — survivalStateOf returns UNCHECKED
  // for a null verdict — and asserted rather than assumed, because a silent
  // fallback here would invent a fifth path to a reassuring label.
  if (diff.survivalVerdict === null) {
    throw new Error('A CURRENT survival state must carry a verdict.');
  }

  return {
    state: diff.survivalVerdict,
    chunksChecked: diff.survivalChunksChecked,
    contradictedCount,
    checkedAt,
  };
}

/**
 * The columns every surface must select to render a verdict honestly.
 *
 * Exported as a Prisma select so a route cannot fetch three of the six and end
 * up rendering UNCHECKED for a row that has been checked — the failure would
 * look exactly like the one this level exists to report.
 */
export const SURVIVAL_VIEW_SELECT = {
  survivalVerdict: true,
  survivalSourceStateHash: true,
  survivalTextVersion: true,
  survivalCheckedAt: true,
  survivalChunksChecked: true,
  survivalContradicted: true,
  rawDeletedText: true,
  rawAddedText: true,
  beforeSnapshot: { select: { textHash: true, textExtractionVersion: true } },
  afterSnapshot: { select: { textHash: true, textExtractionVersion: true } },
} as const;
