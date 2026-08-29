import {
  IntegrityCheckSubject,
  IntegrityCheckType,
  IntegrityCheckVerdict,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ON_CHAIN_CHECK_VERSION, onChainSourceStateHash } from '../lib/onChainVerdict';
import { anchoringTarget, chainProvenanceGap, type AnchoringTarget } from '../lib/anchoringTarget';
import { readOnChainClaim } from './onChainVerification';
import {
  ANCHORABLE_CAPTURE_SELECT,
  anchoredCaptureHash,
  hashUnderAudit,
} from '../lib/anchoredCaptureHash';
import { toBytes32 } from '../lib/bytes32';

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
 *   3. Is the verdict still current?   — a claim or rule that moved makes it STALE
 *   4. Is it a verdict about US?       — a verdict that does not name the chain
 *                                        and registry this deployment anchors to
 *                                        is also STALE. Added after 91 verdicts
 *                                        read off Base Sepolia were written into
 *                                        production, where questions 1-3 all
 *                                        reported them current.
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
   * A verdict exists but does not describe this subject: the claim moved
   * (`sourceStateHash`), the rule moved (`verifierVersion`), or the verdict does
   * not name the chain and registry this deployment anchors to (`chainId`,
   * `registryAddress`).
   *
   * THREE AXES, each added after the previous set proved insufficient, and the
   * pattern is the same every time — a commitment that is blind to the thing
   * that actually changed.
   *
   * A hash over the INPUTS is structurally blind to a change in the RULE that
   * read them: when the survival rule changed, 88 stored verdicts became wrong
   * while every hash still matched and the audit read every one of them current.
   *
   * And BOTH of those are blind to WHICH CHAIN was asked. On 2026-08-29 a local
   * run read production's database against Base Sepolia's registry and wrote 91
   * verdicts into production; the rule had not moved and the claims had not
   * moved, so both existing axes reported every one of them current. What was
   * wrong was the question, not the answer.
   */
  | 'STALE';

export interface AnchorSubjectRow extends AnchorClaimingSubject {
  state: AnchorCheckState;
  /** Present for every state except UNCHECKED. */
  checkedAt: string | null;
  /** The specific on-chain verdict behind a stored check, when it recorded one. */
  onChainVerdict: string | null;
  /** Why the state is STALE — which axis moved, or which provenance is missing. */
  staleReason: string | null;
}

export interface AnchorAuditReport {
  subjects: number;
  byState: Record<AnchorCheckState, number>;
  /** Every subject whose state is not VERIFIED — the entire actionable set. */
  unverified: AnchorSubjectRow[];
  currentVerifierVersion: string;
  /**
   * THE CHECKS BEHIND THE VERDICTS ABOVE — the table, not just its top row.
   *
   * Everything else in this report answers "where does each subject stand?",
   * which by construction reads only the NEWEST check per subject. That question
   * cannot see history, and after a backfill history is exactly what matters:
   * a corpus whose old checks were REPLACED and one whose old checks were
   * SUPERSEDED look identical from up there.
   *
   * The distinction is load-bearing. The cleanup after the 2026-08-29
   * cross-environment write turns on the 91 wrong rows being KEPT — the
   * project's argument for storing a contradiction rather than refusing it is
   * that refusing would delete the evidence the pipeline was wrong, and those
   * rows are that evidence. Until this existed, "they are still there" rested on
   * the table being append-only: true, and an argument rather than a
   * measurement. Structure being fine and contents being fine are different
   * questions, and this repository has already paid once for letting one answer
   * stand in for the other.
   */
  history: CheckHistory;
  /**
   * Checks whose subject no longer exists. The cost of a polymorphic table
   * without a foreign key, REPORTED rather than skipped: Level 10 forbids
   * deleting a subject, so a row here is a rule violation somewhere else and
   * must not be silently swallowed by a query that joins them away.
   */
  danglingChecks: { subjectType: IntegrityCheckSubject; subjectId: string }[];
  /**
   * ANCHORING CLAIMS NOT YET CONFIRMED AGAINST THEIR OWN TRANSACTION.
   *
   * A subject counted here is audited against what the CURRENT RULE expects its
   * transaction registered, never against what the transaction says. That is
   * sound only while the rule has not moved, so this number is the gate on
   * moving it: Level 3 clause 1 may not flip the anchor in an environment where
   * it is non-zero, or every legacy row is judged against a hash nothing
   * registered and a perfectly anchored corpus reports SNAPSHOT_UNANCHORED.
   *
   * Reported rather than merely available, because the check that would catch
   * the mistake is the one nobody runs. `forensics:confirm-anchors` drives it to
   * zero by observation.
   */
  anchorsUnconfirmed: number;
}

export interface CheckHistory {
  /** Every ON_CHAIN_ANCHOR check ever recorded, superseded ones included. */
  totalChecks: number;
  /** Checks a newer check for the same subject now stands in front of. */
  superseded: number;
  /**
   * Checks that do not name the chain and registry THIS deployment anchors to —
   * counted across the whole table, not only the newest row per subject.
   *
   * These are kept deliberately. A superseded one is a record of what a verdict
   * used to say; a CURRENT one puts its subject in STALE above.
   */
  provenanceIncomplete: number;
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
  /**
   * Whether `fileHash` is what the row's TRANSACTION registered, or only what
   * the current rule expects it to have registered.
   *
   * Carried rather than collapsed because the two are different kinds of answer.
   * An unconfirmed subject is audited against an expectation, and that
   * expectation stops being true the moment the anchoring rule moves — so the
   * count of them is the gate on moving it. `forensics:confirm-anchors` is what
   * turns one into the other.
   */
  anchorConfirmed: boolean;
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
      select: { id: true, fileHash: true, anchoredHash: true },
    }),
    prisma.urlSnapshot.findMany({
      where: { NOT: { onChainTxHash: null } },
      select: { id: true, anchoredHash: true, ...ANCHORABLE_CAPTURE_SELECT },
    }),
  ]);

  // RECORDED FIRST, RULE ONLY AS A STATED FALLBACK — `hashUnderAudit` decides,
  // and it is the same decision for both subject types.
  //
  // An audit that derived the hash from the current rule alone would keep
  // auditing the NEW hash after the anchor moved, against legacy rows anchored
  // under the old one, and report SNAPSHOT_UNANCHORED for a corpus that is
  // perfectly anchored. Normalised to the 0x form the check stores and the
  // contract speaks: the capture columns are bare hex, and that mismatch is what
  // made 83 anchorings silently no-op.
  return [
    ...evidence.map((e) => {
      const { hash, confirmed } = hashUnderAudit(e, e.fileHash);
      return {
        subjectType: IntegrityCheckSubject.EVIDENCE,
        subjectId: e.id,
        fileHash: toBytes32(hash),
        anchorConfirmed: confirmed,
      };
    }),
    ...snapshots.map((s) => {
      const { hash, confirmed } = hashUnderAudit(s, anchoredCaptureHash(s));
      return {
        subjectType: IntegrityCheckSubject.URL_SNAPSHOT,
        subjectId: s.id,
        fileHash: toBytes32(hash),
        anchorConfirmed: confirmed,
      };
    }),
  ];
}

/**
 * `target` is a parameter rather than an ambient read so a test can state the
 * registry it is reasoning about instead of inheriting one. A suite whose
 * verdict depends on which variables a transitive import happened to load is a
 * suite that can change its answer without a line of code changing — the same
 * reasoning that makes `test/setupEnv.ts` delete the chain variables outright.
 */
export async function auditOnChainAnchors(
  target: AnchoringTarget = anchoringTarget(),
): Promise<AnchorAuditReport> {
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
      chainId: true,
      registryAddress: true,
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

    const row = await classify(subject, check, target);
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
    // Counted over EVERY check, not over `latest`. Counting the newest per
    // subject would report zero the moment a backfill superseded the incomplete
    // rows, which is precisely when the count starts to mean something.
    history: {
      totalChecks: checks.length,
      superseded: checks.length - latest.size,
      provenanceIncomplete: checks.filter((c) => chainProvenanceGap(c, target) !== null).length,
    },
    danglingChecks,
    anchorsUnconfirmed: subjects.filter((s) => !s.anchorConfirmed).length,
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
        chainId: number | null;
        registryAddress: string | null;
      }
    | undefined,
  target: AnchoringTarget,
): Promise<AnchorSubjectRow> {
  const base = {
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
    fileHash: subject.fileHash,
    // Carried through every state, including UNCHECKED and STALE. Whether the
    // hash was OBSERVED from the transaction is a fact about the subject, not
    // about the verdict, so a row that has no current verdict still has to say
    // which kind of hash it is being judged on.
    anchorConfirmed: subject.anchorConfirmed,
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
  // Configuration only — this keeps the audit's promise never to touch the chain.
  const provenanceGap = chainProvenanceGap(check, target);

  if (ruleMoved || claimMoved || provenanceGap !== null) {
    const reasons = [
      ruleMoved ? `the rule moved (${check.verifierVersion} -> ${ON_CHAIN_CHECK_VERSION})` : null,
      claimMoved ? 'the database claim it judged has changed' : null,
      provenanceGap,
    ].filter((r): r is string => r !== null);
    return {
      ...base,
      state: 'STALE',
      checkedAt: check.checkedAt.toISOString(),
      onChainVerdict,
      // "does not", not "no longer": a verdict that never recorded which chain it
      // asked did not stop describing this subject, it never did. The wording
      // matters because the two license different next steps — one says something
      // changed under a good verdict, the other says the verdict was never
      // anchored to anything checkable.
      staleReason: `This verdict does not describe the subject: ${reasons.join(' and ')}.`,
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
