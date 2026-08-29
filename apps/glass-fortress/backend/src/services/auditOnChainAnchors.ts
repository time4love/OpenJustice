import {
  IntegrityCheckSubject,
  IntegrityCheckType,
  IntegrityCheckVerdict,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ON_CHAIN_CHECK_VERSION, onChainSourceStateHash } from '../lib/onChainVerdict';
import { readOnChainClaim } from './onChainVerification';

/**
 * LEVEL 3a's MEASUREMENT — is every anchoring claim in this corpus CHECKED, and
 * is the check still good?
 *
 * The coverage report the plan promised would fall out of a check table for
 * free. It answers three separate questions that the counts on `get_environment`
 * cannot, and that are routinely conflated:
 *
 *   1. Is there a verdict at all?      — UNCHECKED is not a pass
 *   2. Was the verdict a pass?         — UNAVAILABLE is not a pass either
 *   3. Is the verdict still current?   — a claim that moved makes it STALE
 *
 * READ-ONLY, AND IT NEVER TOUCHES THE CHAIN. Every state here is derived from
 * stored rows, so the audit is cheap, deterministic, and safe to run against
 * production. Re-CHECKING is `recordOnChainCheck`'s job and costs an RPC call
 * per subject; this reports which subjects need one.
 *
 * MODELLED ON `auditDiffSurvival`, deliberately: the two levels ask the same
 * question about different subjects, and answering it in two different shapes
 * is how one of them ends up missing a state.
 */

/** What a subject's anchoring claim currently stands at. */
export type AnchorCheckState =
  /** A stored verdict, at the current rule, against the claim as it stands. */
  | 'VERIFIED'
  /** A stored verdict that the chain and the database disagree. */
  | 'CONTRADICTED'
  /** The chain could not be reached. NOT a pass — nothing is known. */
  | 'UNAVAILABLE'
  /** No check has ever been recorded for this subject. NOT a pass. */
  | 'UNCHECKED'
  /**
   * A verdict exists but no longer describes this subject: the claim moved
   * (`sourceStateHash`) or the rule did (`verifierVersion`).
   *
   * BOTH AXES, and that is the lesson from one level up. A hash over the inputs
   * is structurally blind to a change in the RULE that read them — when the
   * survival rule changed, 88 stored verdicts became wrong while every hash
   * still matched and the audit read every one of them current.
   */
  | 'STALE';

export interface AnchorSubjectRow extends AnchorClaimingSubject {
  state: AnchorCheckState;
  /** Present for every state except UNCHECKED. */
  checkedAt: string | null;
  /** The specific on-chain verdict behind a stored check, when it recorded one. */
  onChainVerdict: string | null;
  /** Why the state is STALE — which axis moved. Empty otherwise. */
  staleReason: string | null;
}

export interface AnchorAuditReport {
  subjects: number;
  byState: Record<AnchorCheckState, number>;
  /** Every subject whose state is not VERIFIED — the entire actionable set. */
  unverified: AnchorSubjectRow[];
  currentVerifierVersion: string;
  /**
   * Checks whose subject no longer exists. The cost of a polymorphic table
   * without a foreign key, REPORTED rather than skipped: Level 10 forbids
   * deleting a subject, so a row here is a rule violation somewhere else and
   * must not be silently swallowed by a query that joins them away.
   */
  danglingChecks: { subjectType: IntegrityCheckSubject; subjectId: string }[];
}

const EMPTY_STATES: Record<AnchorCheckState, number> = {
  VERIFIED: 0,
  CONTRADICTED: 0,
  UNAVAILABLE: 0,
  UNCHECKED: 0,
  STALE: 0,
};

/** A subject that asserts an anchor, and the hash the assertion is about. */
export interface AnchorClaimingSubject {
  subjectType: IntegrityCheckSubject;
  subjectId: string;
  fileHash: string;
}

/**
 * Which subjects make an anchoring claim at all.
 *
 * EVIDENCE: only CONFIRMED rows. A PENDING_REVIEW row claims nothing about the
 * chain, so demanding a verdict for it would manufacture a backlog out of rows
 * that are behaving correctly.
 *
 * URL_SNAPSHOT: only rows carrying a transaction hash, for the same reason —
 * `onChainTxHash: null` is a capture that says it is not anchored, which is an
 * honest state and a different problem (`countUnanchoredSnapshots`).
 */
export async function auditOnChainAnchorSubjects(): Promise<AnchorClaimingSubject[]> {
  const [evidence, snapshots] = await Promise.all([
    prisma.evidence.findMany({
      where: { status: 'CONFIRMED' },
      select: { id: true, fileHash: true },
    }),
    prisma.urlSnapshot.findMany({
      where: { NOT: { onChainTxHash: null } },
      select: { id: true, contentHash: true },
    }),
  ]);

  return [
    ...evidence.map((e) => ({
      subjectType: IntegrityCheckSubject.EVIDENCE,
      subjectId: e.id,
      fileHash: e.fileHash,
    })),
    ...snapshots.map((s) => ({
      subjectType: IntegrityCheckSubject.URL_SNAPSHOT,
      subjectId: s.id,
      // Normalised to the form the check stores and the contract speaks.
      // `contentHash` is bare hex, and the mismatch between the two is exactly
      // what made 83 anchorings silently no-op.
      fileHash: s.contentHash.startsWith('0x') ? s.contentHash : `0x${s.contentHash}`,
    })),
  ];
}

export async function auditOnChainAnchors(): Promise<AnchorAuditReport> {
  const subjects = await auditOnChainAnchorSubjects();

  const checks = await prisma.integrityCheck.findMany({
    where: { checkType: IntegrityCheckType.ON_CHAIN_ANCHOR },
    orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
    select: {
      subjectType: true,
      subjectId: true,
      verdict: true,
      checkedAt: true,
      verifierVersion: true,
      sourceStateHash: true,
      detail: true,
    },
  });

  // Newest first, so the first row seen for a key is the current one.
  const latest = new Map<string, (typeof checks)[number]>();
  for (const check of checks) {
    const key = `${check.subjectType}:${check.subjectId}`;
    if (!latest.has(key)) latest.set(key, check);
  }

  const byState = { ...EMPTY_STATES };
  const unverified: AnchorSubjectRow[] = [];
  const seen = new Set<string>();

  for (const subject of subjects) {
    const key = `${subject.subjectType}:${subject.subjectId}`;
    seen.add(key);
    const check = latest.get(key);

    const row = await classify(subject, check);
    byState[row.state] += 1;
    if (row.state !== 'VERIFIED') unverified.push(row);
  }

  const danglingChecks = [...latest.values()]
    .filter((c) => !seen.has(`${c.subjectType}:${c.subjectId}`))
    .map((c) => ({ subjectType: c.subjectType, subjectId: c.subjectId }));

  return {
    subjects: subjects.length,
    byState,
    unverified,
    currentVerifierVersion: ON_CHAIN_CHECK_VERSION,
    danglingChecks,
  };
}

async function classify(
  subject: AnchorClaimingSubject,
  check:
    | {
        verdict: IntegrityCheckVerdict;
        checkedAt: Date;
        verifierVersion: string;
        sourceStateHash: string;
        detail: Prisma.JsonValue;
      }
    | undefined,
): Promise<AnchorSubjectRow> {
  const base = {
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
    fileHash: subject.fileHash,
  };

  if (!check) {
    return {
      ...base,
      state: 'UNCHECKED',
      checkedAt: null,
      onChainVerdict: null,
      staleReason: null,
    };
  }

  // Read defensively rather than cast: `detail` is Json, so its shape is a
  // convention this module writes and reads, not one the database enforces. A
  // row written by an older verifier version may not carry the field at all.
  const rawVerdict =
    check.detail !== null && typeof check.detail === 'object' && 'onChainVerdict' in check.detail
      ? (check.detail as { onChainVerdict: unknown }).onChainVerdict
      : null;
  const onChainVerdict = typeof rawVerdict === 'string' ? rawVerdict : null;

  // STALENESS IS CHECKED BEFORE THE VERDICT IS BELIEVED, both axes.
  //
  // A verdict reached under an older rule, or against a claim that has since
  // moved, is not a pass and not a failure — it is a verdict about something
  // else. Reporting it as VERIFIED is precisely how 88 wrong verdicts read as
  // current one level up.
  const ruleMoved = check.verifierVersion !== ON_CHAIN_CHECK_VERSION;
  const expectedHash = onChainSourceStateHash({
    fileHash: subject.fileHash,
    claim: await readOnChainClaim(subject.fileHash),
  });
  const claimMoved = check.sourceStateHash !== expectedHash;

  if (ruleMoved || claimMoved) {
    const reasons = [
      ruleMoved ? `the rule moved (${check.verifierVersion} -> ${ON_CHAIN_CHECK_VERSION})` : null,
      claimMoved ? 'the database claim it judged has changed' : null,
    ].filter((r): r is string => r !== null);
    return {
      ...base,
      state: 'STALE',
      checkedAt: check.checkedAt.toISOString(),
      onChainVerdict,
      staleReason: `This verdict no longer describes the subject: ${reasons.join(' and ')}.`,
    };
  }

  return {
    ...base,
    // The three stored verdicts map to themselves. UNAVAILABLE stays its own
    // state rather than collapsing into either neighbour: it is a statement
    // about the check, and counting it as a failure would be as wrong as
    // counting it as a pass.
    state: check.verdict,
    checkedAt: check.checkedAt.toISOString(),
    onChainVerdict,
    staleReason: null,
  };
}
