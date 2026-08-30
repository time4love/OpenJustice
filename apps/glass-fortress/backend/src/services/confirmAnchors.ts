import { AnchorCheckOutcome } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  Web3Service,
  type RegisteredByTransaction,
  type RegisteringTxLookup,
} from './Web3Service';
import { toBytes32 } from '../lib/bytes32';
import {
  CAPTURE_HASHES_SELECT,
  anchoredCaptureHash,
  capturesKnownHashes,
  storedAnchorHash,
  type StoredAnchorHash,
} from '../lib/anchoredCaptureHash';

// ---------------------------------------------------------------------------
// CONFIRM WHAT EACH ANCHORING TRANSACTION ACTUALLY REGISTERED, AND RECORD IT.
//
// `anchoredHash` is added nullable and is never backfilled from the column the
// code happens to anchor today. Writing `anchoredHash = contentHash` would be
// one UPDATE and would stamp a BELIEF — and this repository has already paid the
// full price for that: on 2026-08-29 ninety-one integrity verdicts were written
// carrying a chain they had never been reached against, and afterwards nothing
// distinguished them from correct ones. A believed value destroys the evidence
// that it was believed.
//
// So the value is OBSERVED. For every row asserting an anchor this reads the
// receipt of the transaction THE ROW POINTS AT and takes the hash that
// transaction's own EvidenceSubmitted log carries.
//
// WHY THE DIRECTION MATTERS, and why the existing audit does not already do
// this. `auditOnChainAnchors` asks "is this row's hash registered?" — which a
// row passes whenever the hash it carries was registered by SOME transaction,
// not necessarily its own. A row pointing at a transaction that registered
// something else is invisible to it. This asks the question that can fail:
// which hash did THIS transaction register?
//
// It therefore doubles as the measurement. A pass that finds every row's
// transaction registering exactly the hash the row carries has proven the
// corpus sound; one that does not has found the fake-CONFIRMED family, which is
// the condition this platform exists to make impossible.
//
// DRY RUN IS THE DEFAULT, and a dry run is a complete measurement — it performs
// every chain read and writes nothing. That is what makes "count production
// first" and "confirm and write in one pass" the same operation rather than two.
// ---------------------------------------------------------------------------

/** What one row's anchoring claim turned out to be. */
export type AnchorConfirmation =
  /** The transaction registered exactly the hash this row carries. */
  | { kind: 'CONFIRMED'; anchoredHash: string }
  /**
   * The transaction registered a DIFFERENT hash. The row's anchor is real and
   * attests to something else — recorded as observed, never discarded, because
   * the observation is the finding.
   */
  | { kind: 'MISANCHORED'; anchoredHash: string; expected: string }
  /**
   * A real transaction that registered nothing with this registry. The
   * fake-CONFIRMED shape: a valid hash attesting to nothing, which is what a
   * transaction to a codeless address produces. Nothing is written — there is
   * no hash to record.
   */
  | { kind: 'ANCHORED_NOTHING' }
  /**
   * The RPC has no receipt for the transaction, but the registry DOES hold the
   * hash the row expects. The fact is anchored on this chain; only the
   * transaction that did it is unreadable, so which transaction anchored it
   * cannot be recorded — but the row is not fabricated.
   *
   * Split from the arm below because they are not the same news. This one is a
   * limit of the RPC we are reading through; the other is a claim about a chain
   * that has no record of it.
   */
  | {
      kind: 'NO_RECEIPT_HASH_REGISTERED';
      expected: string;
      /**
       * WHY the registry's log named no transaction — the step and the message,
       * never a bare null.
       *
       * The first version of this swallowed the reason in a bare `catch`, and
       * that cost a whole diagnostic run: 0 of 91 resolved and nothing could
       * distinguish "the log holds no such transaction" from "the endpoint
       * refused the query". The same defect `anchorSnapshots` documents having
       * made and repaired, reproduced inside the pass built not to lose
       * information.
       */
      logLookup: string;
    }
  /**
   * No receipt AND the registry does not hold the expected hash. The row asserts
   * an anchor that this chain has no trace of, by either route.
   *
   * The most serious verdict this pass can reach, and it must never be reported
   * alongside a benign one. It is either a transaction from a chain we no longer
   * read, or an anchor that never existed.
   */
  | { kind: 'NO_RECEIPT_HASH_ABSENT'; expected: string }
  /**
   * The receipt was unreadable, but the registry's own log names THIS
   * transaction as the one that registered the row's hash. The same fact the
   * receipt would have given, reached from the other direction.
   */
  | { kind: 'CONFIRMED_BY_LOG'; anchoredHash: string }
  /**
   * The registry names a DIFFERENT transaction for this row's hash.
   *
   * Should be unreachable: the contract reverts a duplicate registration, so one
   * hash has one registering transaction. Given its own arm rather than folded
   * into MISANCHORED because a state that cannot happen, happening, is worth a
   * human reading both transaction hashes rather than a counter incrementing.
   */
  | { kind: 'REGISTERED_BY_ANOTHER_TX'; expected: string; txHashFromLog: string }
  /**
   * The receipt could not be read and neither could the registry be asked. A
   * verdict about the CHECK, never about the data (§3) — an RPC that answers
   * nothing must not be reported as a chain that holds nothing.
   */
  | { kind: 'UNREACHABLE' }
  /**
   * The transaction registered several hashes and none is this row's. Which one
   * the row means cannot be decided from the chain, so it is reported rather
   * than guessed.
   */
  | { kind: 'AMBIGUOUS'; candidates: string[]; expected: string };

export interface AnchorConfirmationRow {
  subject: 'URL_SNAPSHOT' | 'EVIDENCE';
  id: string;
  txHash: string;
  confirmation: AnchorConfirmation;
  written: boolean;
}

export interface ConfirmAnchorsReport {
  dryRun: boolean;
  examined: number;
  /** Confirmed from the transaction's own receipt. */
  confirmed: number;
  /** Confirmed from the registry's log, where the receipt was unreadable. */
  confirmedByLog: number;
  misanchored: number;
  /** The registry names a different transaction for this hash. Should be impossible. */
  registeredByAnotherTx: number;
  anchoredNothing: number;
  /** No receipt, but the registry holds the hash — the fact is here, the tx is not. */
  noReceiptHashRegistered: number;
  /** No receipt and no registration. This chain has no trace of the claim. */
  noReceiptHashAbsent: number;
  /** Neither the receipt nor the registry could be read. Nothing concluded. */
  unreachable: number;
  ambiguous: number;
  /** Already carried an observed `anchoredHash`; not re-read. */
  alreadyConfirmed: number;
  failed: number;
  failures: { id: string; reason: string }[];
  rows: AnchorConfirmationRow[];
}

/** One subject to confirm, reduced to what the question needs. */
interface AnchorClaimant {
  subject: 'URL_SNAPSHOT' | 'EVIDENCE';
  id: string;
  txHash: string;
  /** The hash the CURRENT rule names. Reporting only — never the test. */
  current: string;
  /**
   * EVERY hash this subject is known by. A transaction registering ANY of them
   * anchors this subject.
   *
   * This is the fix for the incident of 2026-08-30. The test used to be the
   * current rule's hash alone, so the moment Level 3 moved the anchor to the
   * document, 83 staging captures whose real, registered `contentHash` anchors
   * were perfectly intact came back NO_TRACE_ON_CHAIN — the most serious verdict
   * this check has — and 22 more came back MISANCHORED.
   *
   * The audit already had the three-way answer (`attestationOf`: current,
   * superseded, unrecognised) and this pass did not: one rule, two
   * implementations, and they disagreed the instant the rule moved.
   *
   * THE SEPARATION THAT REMOVES THE DUPLICATION, rather than copying the audit's
   * logic here: this pass OBSERVES what the transaction registered, and records
   * it. Whether that hash is the one the current rule names is a question about
   * the RULE, answered at read time by `attestationOf` from `anchoredHash`. So
   * "confirmed" here means "the transaction registered a hash this subject
   * genuinely has" — and a superseded-rule anchor is confirmed AND reported
   * MISATTESTING by the audit, which is exactly right.
   *
   * It is also why this fix needed no new enum value. A verdict that has to name
   * the rule it was judged against is a verdict doing the audit's job.
   */
  known: string[];
}

/**
 * Compare on the 0x-prefixed, lower-cased form.
 *
 * The stored formats genuinely disagree — `Evidence.fileHash` carries the prefix
 * and the capture columns do not — and comparing them raw is the same mismatch
 * that made 83 anchorings silently no-op. Normalising at the comparison rather
 * than at rest keeps the stored forms load-bearing where they already are.
 */
function sameHash(a: string, b: string): boolean {
  return toBytes32(a).toLowerCase() === toBytes32(b).toLowerCase();
}

/**
 * The transaction a row claims, or a loud failure.
 *
 * Unreachable while the queries below filter on `onChainTxHash`, and a THROW
 * rather than a silent skip precisely because of that: a subject quietly dropped
 * from a confirmation pass is a subject reported as nothing to confirm, which is
 * how a corpus with an unexamined anchor reads as a clean one. Same shape as
 * `requireSnapshotIdentity` — a fallback here would invent a fact.
 */
function requireAnchorTx(txHash: string | null, id: string): string {
  if (txHash === null) {
    throw new Error(`Subject ${id} was selected as claiming an anchor but records no transaction.`);
  }
  return txHash;
}

/**
 * Transaction hashes compared case-insensitively.
 *
 * Separate from `sameHash` on purpose: that one normalises the 0x prefix because
 * the two hash columns genuinely disagree about it. Transaction hashes always
 * carry it, so folding them into the same helper would hide a real difference
 * between the two kinds of value behind one name.
 */
function sameTx(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

async function anchorClaimants(recheck: boolean): Promise<AnchorClaimant[]> {
  const [snapshots, evidence] = await Promise.all([
    prisma.urlSnapshot.findMany({
      // A TERMINAL VERDICT is what marks a subject done, not a recorded hash.
      // TX_UNREADABLE and ANCHORED_NOTHING are finished answers that record no
      // hash, and filtering on `anchoredHash` re-examined them on every run
      // forever while skipping rows that had one — the exact combination that
      // left 22 wrong verdicts unreachable by a re-run.
      where: { NOT: { onChainTxHash: null }, ...(recheck ? {} : { anchorCheck: null }) },
      select: { id: true, onChainTxHash: true, ...CAPTURE_HASHES_SELECT },
      orderBy: { capturedAt: 'asc' },
    }),
    prisma.evidence.findMany({
      where: { NOT: { onChainTxHash: null }, ...(recheck ? {} : { anchorCheck: null }) },
      select: { id: true, onChainTxHash: true, fileHash: true, previousFileHash: true },
      orderBy: { evidenceDate: 'asc' },
    }),
  ]);

  return [
    ...snapshots.map((s) => ({
      subject: 'URL_SNAPSHOT' as const,
      id: s.id,
      txHash: requireAnchorTx(s.onChainTxHash, s.id),
      current: anchoredCaptureHash(s),
      known: capturesKnownHashes(s),
    })),
    ...evidence.map((e) => ({
      subject: 'EVIDENCE' as const,
      id: e.id,
      txHash: requireAnchorTx(e.onChainTxHash, e.id),
      current: e.fileHash,
      // `previousFileHash` is a superseded identity this record really had. A
      // transaction still registering it anchors this record, under a rule that
      // has moved — explainable, and the audit says so.
      known: e.previousFileHash === null ? [e.fileHash] : [e.fileHash, e.previousFileHash],
    })),
  ];
}

/**
 * The observation, paired with what the row expected, becomes a verdict.
 *
 * Takes the union whole rather than a value plus a discriminator: splitting them
 * would let a caller hand over `NO_RECEIPT` alongside a list of hashes, which is
 * a state the chain cannot produce and this function would have to decide about.
 */
/**
 * WHY a lookup named no transaction, in one line a human can act on.
 *
 * The window is included wherever the lookup got far enough to have one, because
 * the obvious next question about NO_LOG_IN_WINDOW is whether the window was
 * wide enough — and an answer that omits where it looked cannot be argued with.
 */
function describeLookup(lookup: RegisteringTxLookup): string {
  switch (lookup.kind) {
    case 'FOUND':
      return `named ${lookup.txHash}`;
    case 'NOT_REGISTERED':
      return 'the registry does not hold this hash';
    case 'NO_LOG_IN_WINDOW':
      return (
        'the registry holds the hash but no EvidenceSubmitted log sits in blocks ' +
        `${String(lookup.searchedFrom)}–${String(lookup.searchedTo)} around block ` +
        String(lookup.anchorBlock)
      );
    case 'LOOKUP_FAILED':
      return (
        `the ${lookup.step} step failed: ${lookup.reason}` +
        (lookup.anchorBlock === undefined
          ? ''
          : ` (blocks ${String(lookup.searchedFrom)}–${String(lookup.searchedTo)})`)
      );
  }
}

function decide(
  observed: RegisteredByTransaction,
  /** What the row claims: the hash it carries and the transaction it points at. */
  claim: { current: string; known: readonly string[]; txHash: string },
  /**
   * The answers to the two fallback questions, asked ONLY when the receipt could
   * not be read — on exactly the rows that need them, never on all of them.
   *
   * `hashRegistered: null` means the registry could not be asked either, which is
   * a third thing again and must not read as "this chain does not hold it".
   */
  fallback: {
    /**
     * WHICH of the subject's known hashes the registry holds, `null` if none, and
     * `undefined` if the registry could not be asked at all.
     *
     * Three values, not two. A registry that answered "no" and one that could not
     * answer license opposite conclusions about a stored anchoring claim, and the
     * old boolean|null could not carry the difference once "which hash" mattered.
     */
    registeredHash: string | null | undefined;
    lookup: RegisteringTxLookup | null;
  },
): AnchorConfirmation {
  const { current, known, txHash } = claim;
  const { registeredHash, lookup } = fallback;
  if (observed.kind === 'NO_RECEIPT') {
    if (registeredHash === undefined) return { kind: 'UNREACHABLE' };
    // NONE of the subject's hashes is on this registry, by any rule. Only now is
    // "no trace" true — asking about the current rule's hash alone reported it
    // for 83 captures whose superseded-rule anchors were entirely intact.
    if (registeredHash === null) return { kind: 'NO_RECEIPT_HASH_ABSENT', expected: current };

    // THE SECOND ROUTE. `txHashFromLog` is the registry's own EvidenceSubmitted
    // log answering "which transaction registered this hash?" — and comparing it
    // to the transaction THIS ROW claims turns a statement about the hash into a
    // statement about the transaction, which is the only kind that can confirm a
    // row. Dismissed in an earlier draft as "the weaker form"; standalone it is,
    // and against the row it is not.
    //
    // It reaches where receipts do not because the constraints differ: receipts
    // are pruned by AGE, `eth_getLogs` is capped by RANGE — and the range is
    // found from the registry's own stored timestamp, which is contract state and
    // never expires.
    if (lookup === null) {
      return {
        kind: 'NO_RECEIPT_HASH_REGISTERED',
        expected: registeredHash,
        logLookup: 'the log was not consulted',
      };
    }
    if (lookup.kind === 'FOUND') {
      return sameTx(lookup.txHash, txHash)
        ? { kind: 'CONFIRMED_BY_LOG', anchoredHash: registeredHash }
        : // The registry names a DIFFERENT transaction for this hash. Its own arm
          // rather than folded into a misanchor: the contract reverts a duplicate
          // registration, so this should be impossible, and a state that cannot
          // happen — happening — deserves a human reading both transaction hashes
          // rather than a counter incrementing.
          { kind: 'REGISTERED_BY_ANOTHER_TX', expected: registeredHash, txHashFromLog: lookup.txHash };
    }
    return {
      kind: 'NO_RECEIPT_HASH_REGISTERED',
      expected: registeredHash,
      logLookup: describeLookup(lookup),
    };
  }
  if (observed.kind === 'ANCHORED_NOTHING') return { kind: 'ANCHORED_NOTHING' };

  // Matched against EVERY hash this subject is known by, not against the current
  // rule's alone. A transaction registering a superseded-rule hash DID anchor this
  // subject; whether that is the hash the rule now names is the audit's question,
  // answered from `anchoredHash` by `attestationOf`.
  const match = observed.hashes.find((h) => known.some((k) => sameHash(h, k)));
  if (match) return { kind: 'CONFIRMED', anchoredHash: match };
  // `.at()`, not `[0]` and not a destructure. Both debt ratchets have an opinion
  // and between them they rule out the obvious spellings: `hashes[0]` is an
  // unchecked indexed access, and a `!== undefined` guard on it is a condition
  // the types say can never be false. `.at()` is honestly typed as optional, so
  // the guard is real and neither ratchet has to be argued with.
  const sole = observed.hashes.length === 1 ? observed.hashes.at(0) : undefined;
  if (sole !== undefined) return { kind: 'MISANCHORED', anchoredHash: sole, expected: current };
  return { kind: 'AMBIGUOUS', candidates: observed.hashes, expected: current };
}

/** The hash a confirmation licenses writing, or null when it licenses none. */
function writableHash(confirmation: AnchorConfirmation): StoredAnchorHash | null {
  // MISANCHORED writes too, deliberately. The column records what the
  // transaction registered, and a divergence is exactly the fact worth having on
  // the row — suppressing it would leave the anchor looking unexamined rather
  // than examined and wrong.
  if (
    confirmation.kind === 'CONFIRMED' ||
    confirmation.kind === 'CONFIRMED_BY_LOG' ||
    confirmation.kind === 'MISANCHORED'
  ) {
    // NORMALISED, and this is the whole defect the positive control found. The
    // observed value comes from the transaction log via ethers, which returns
    // bytes32 `0x`-prefixed; the write path stores the same fact bare. Two
    // spellings in one column made every confirmed row invisible to
    // `capturesAnchoredBy`, so `VERIFIED` was unreachable for every snapshot.
    return storedAnchorHash(confirmation.anchoredHash);
  }
  return null;
}

/**
 * THE TERMINAL VERDICT a confirmation licenses recording, or null where it
 * licenses none.
 *
 * `null` is returned for exactly one arm — UNREACHABLE — and that is the
 * property the column depends on. A transient RPC failure must leave the row
 * untouched, so that `anchorCheck IS NULL` keeps one meaning: no terminal
 * verdict yet. Every other arm is an answer, including the ones that say the
 * chain cannot tell us more.
 */
function terminalVerdict(confirmation: AnchorConfirmation): AnchorCheckOutcome | null {
  switch (confirmation.kind) {
    case 'CONFIRMED':
      return AnchorCheckOutcome.CONFIRMED_BY_RECEIPT;
    case 'CONFIRMED_BY_LOG':
      return AnchorCheckOutcome.CONFIRMED_BY_LOG;
    case 'MISANCHORED':
      // Found from the transaction's own receipt — the stronger observation.
      return AnchorCheckOutcome.MISANCHORED_BY_RECEIPT;
    case 'REGISTERED_BY_ANOTHER_TX':
      // Found from the registry's log, which infers the transaction from a
      // stored timestamp and a bounded window. Recorded distinctly so anyone
      // re-opening it knows to widen that window before concluding anything.
      return AnchorCheckOutcome.MISANCHORED_BY_LOG;
    case 'ANCHORED_NOTHING':
      return AnchorCheckOutcome.ANCHORED_NOTHING;
    case 'NO_RECEIPT_HASH_REGISTERED':
      return AnchorCheckOutcome.TX_UNREADABLE;
    case 'NO_RECEIPT_HASH_ABSENT':
      return AnchorCheckOutcome.NO_TRACE_ON_CHAIN;
    case 'AMBIGUOUS':
      // The transaction registered several hashes and none is this row's. The
      // chain answered; we cannot attribute the answer. Terminal, and not a pass.
      return AnchorCheckOutcome.TX_UNREADABLE;
    case 'UNREACHABLE':
      return null;
  }
}

/**
 * WHAT A RUN'S OUTCOME MEANS, AS AN EXIT CODE. One rule, one home, testable.
 *
 * This lived inline in the script and was WRONG: it counted only the arms
 * meaning "wrong" and let every arm meaning "could not tell" fall through to 0.
 * The first real run answered 22 of 113 questions and reported success — the
 * rule this level exists to enforce, broken by the code written to apply it.
 * Extracted here so the rule has a test rather than a reader.
 *
 *   1  the run itself failed on a subject
 *   2  a claim is WRONG — anchored elsewhere, anchoring nothing, or no trace
 *   3  a claim could not be CONFIRMED — not wrong, and not proven either
 *   0  every claim was checked and every one held
 */
/**
 * THE SUMMARY, AS ONE STRING.
 *
 * Built here rather than printed line by line in the script, for two reasons that
 * turned out to matter on the same day.
 *
 * IT CANNOT BE SPLIT. The per-row detail goes to stderr and the summary used to
 * go to stdout; redirecting both into one file interleaved them MID-LINE, and a
 * staging run printed `confirmed (log):` followed by another row's text. The
 * count was recoverable only by counting rows in the log. A summary block is
 * what an operator reads to decide, so one that another stream can corrupt is
 * one that can mislead — and this session has twice mistaken a damaged local log
 * for a fact about the run. One string, one write, one stream.
 *
 * IT IS TESTABLE. Printed inline in a script it had no test at all, which is how
 * the exit rule next door came to be wrong and unexercised.
 */
export function formatConfirmAnchorsSummary(report: ConfirmAnchorsReport): string {
  const dry = report.dryRun ? ' (dry run — none written)' : '';
  const lines = [
    '',
    '---',
    `examined:                    ${String(report.examined)}`,
    `confirmed (receipt):         ${String(report.confirmed)}${dry}`,
    `confirmed (log):             ${String(report.confirmedByLog)}${dry}`,
    `already carried a verdict:   ${String(report.alreadyConfirmed)}`,
    `MISANCHORED:                 ${String(report.misanchored)}`,
    `REGISTERED BY ANOTHER TX:    ${String(report.registeredByAnotherTx)}`,
    `ANCHORED NOTHING:            ${String(report.anchoredNothing)}`,
    `NO TRACE ON CHAIN:           ${String(report.noReceiptHashAbsent)}`,
    `no receipt, hash registered: ${String(report.noReceiptHashRegistered)}`,
    `unreachable:                 ${String(report.unreachable)}`,
    `ambiguous:                   ${String(report.ambiguous)}`,
    `failed:                      ${String(report.failed)}`,
  ];

  if (report.failures.length > 0) {
    lines.push('', 'failures:');
    for (const f of report.failures) lines.push(`  ${f.id}: ${f.reason}`);
  }

  // EVERY SUBJECT IS ACCOUNTED FOR, or the summary says so rather than letting a
  // reader add the columns up and assume. A run whose parts do not sum to its
  // whole has lost a subject somewhere, and a silent loss is how a partial pass
  // reads as a complete one.
  const counted =
    report.confirmed +
    report.confirmedByLog +
    report.misanchored +
    report.registeredByAnotherTx +
    report.anchoredNothing +
    report.noReceiptHashAbsent +
    report.noReceiptHashRegistered +
    report.unreachable +
    report.ambiguous +
    report.failed;
  if (counted !== report.examined) {
    lines.push(
      '',
      `⚠️  ${String(counted)} outcomes for ${String(report.examined)} subjects — they must be equal. ` +
        'Some subject reached no outcome at all.',
    );
  }

  return lines.join('\n');
}

/**
 * Claims that are WRONG: anchored elsewhere, anchoring nothing, or with no trace
 * on this chain by either route.
 *
 * Exported so the exit code and the message that explains it cannot disagree.
 * They already had: the script's own tally omitted `registeredByAnotherTx` while
 * the exit rule counted it, so a run could exit 2 and print a number one short.
 * One rule, two implementations, in miniature.
 */
export function wrongClaims(report: ConfirmAnchorsReport): number {
  return (
    report.misanchored +
    report.anchoredNothing +
    report.noReceiptHashAbsent +
    report.registeredByAnotherTx
  );
}

/** Claims that could not be CONFIRMED — not wrong, and not proven either. */
export function unresolvedClaims(report: ConfirmAnchorsReport): number {
  return report.noReceiptHashRegistered + report.unreachable + report.ambiguous;
}

export function confirmAnchorsExitCode(report: ConfirmAnchorsReport): number {
  // EXAMINED NOTHING IS NOT A PASS, and this is the arm that was missing.
  //
  // The default filter selects `anchorCheck: null`, so once every subject carries a
  // terminal verdict this pass has nothing to look at — and with every counter at
  // zero it fell through to `return 0`. A run that checked an empty set therefore
  // reported success, and the public integrity board scored the level 100 on it.
  //
  // `auditOnChainAnchors` and `auditDiffSurvival` both already refuse a vacuous run
  // ("No diffs found. This report says nothing; it is not a pass."). This was the
  // one check of the three without that arm.
  //
  // It is not a failure either: nothing is wrong, nothing was proven. Its own code
  // says exactly that, and `--recheck` is what makes the pass non-empty again.
  if (report.examined === 0) return 4;
  if (report.failed > 0) return 1;
  if (wrongClaims(report) > 0) return 2;
  // TX_UNREADABLE is TERMINAL but it is not a confirmation, so it stays here
  // rather than folding into the pass. A corpus whose anchors are real and
  // unattributable is a different thing from one whose anchors were checked and
  // held, and only the second may gate moving the anchor.
  if (report.noReceiptHashRegistered + report.unreachable + report.ambiguous > 0) return 3;
  return 0;
}

export async function confirmAnchors(opts: {
  dryRun: boolean;
  limit?: number;
  /**
   * Re-examine subjects that already carry a terminal verdict.
   *
   * Needed because a verdict recorded by a wrong rule is unreachable otherwise —
   * on 2026-08-30 105 staging rows took a verdict computed against the current
   * rule's hash alone, and the default filter would have skipped every one of
   * them forever.
   */
  recheck?: boolean;
}): Promise<ConfirmAnchorsReport> {
  const [snapshotsDone, evidenceDone] = await Promise.all([
    prisma.urlSnapshot.count({ where: { NOT: { anchoredHash: null } } }),
    prisma.evidence.count({ where: { NOT: { anchoredHash: null } } }),
  ]);

  const all = await anchorClaimants(opts.recheck === true);
  const claimants = opts.limit ? all.slice(0, opts.limit) : all;

  const report: ConfirmAnchorsReport = {
    dryRun: opts.dryRun,
    examined: claimants.length,
    confirmed: 0,
    confirmedByLog: 0,
    misanchored: 0,
    registeredByAnotherTx: 0,
    anchoredNothing: 0,
    noReceiptHashRegistered: 0,
    noReceiptHashAbsent: 0,
    unreachable: 0,
    ambiguous: 0,
    alreadyConfirmed: snapshotsDone + evidenceDone,
    failed: 0,
    failures: [],
    rows: [],
  };

  if (claimants.length === 0) return report;

  // Constructed once, and its failure is fatal rather than survivable: every
  // outcome here is an observation of the chain, so a run without one would
  // report "nothing to confirm" about a corpus it never asked about.
  const web3 = new Web3Service();

  for (const claimant of claimants) {
    try {
      const observed = await web3.readRegisteredHashes(claimant.txHash);
      // Asked only when the transaction itself could not be read. A row whose
      // receipt is unreadable is not yet a finding — whether this chain holds
      // the fact at all is what decides that, and it is a different question
      // from the one the receipt answers.
      // undefined = the registry could not be asked; null = asked, holds none of
      // this subject's hashes; a string = the one it holds.
      let registeredHash: string | null | undefined;
      let lookup: RegisteringTxLookup | null = null;
      if (observed.kind === 'NO_RECEIPT') {
        try {
          registeredHash = null;
          // EVERY known hash, not just the current rule's. Two reads for a capture
          // and at most two for an evidence record, on rows whose receipt already
          // failed — and the difference between this and asking about one hash is
          // the difference between TX_UNREADABLE and a false NO_TRACE_ON_CHAIN.
          for (const candidate of claimant.known) {
            if ((await web3.isHashRegistered(toBytes32(candidate))).registered) {
              registeredHash = candidate;
              break;
            }
          }
        } catch {
          // The registry could not be asked. Left undefined so the verdict is
          // UNREACHABLE rather than "this chain does not hold it" — an RPC
          // failure and a negative answer license opposite conclusions.
          registeredHash = undefined;
        }
        if (registeredHash !== null && registeredHash !== undefined) {
          // Costly — a block-range binary search per subject — so it runs only
          // where the cheap route already failed AND the fact is known to be on
          // chain. Never on a row whose receipt was readable.
          //
          // `lookupRegisteringTx` REPORTS its failures rather than throwing them,
          // so there is no catch here to swallow one. That is deliberate: the
          // bare catch this replaced turned every distinct cause into the same
          // null and made a 91-row result undiagnosable.
          lookup = await web3.lookupRegisteringTx(toBytes32(registeredHash));
        }
      }
      const confirmation = decide(
        observed,
        { current: claimant.current, known: claimant.known, txHash: claimant.txHash },
        { registeredHash, lookup },
      );

      // The hash and the verdict are written TOGETHER, or neither is. A verdict
      // naming a hash that the row does not carry, or a hash with no verdict
      // behind it, would put the two columns back into the state this change
      // exists to leave: a claim whose provenance has to be inferred.
      //
      // A row can carry a verdict and NO hash — TX_UNREADABLE and
      // ANCHORED_NOTHING are exactly that, and they are honest terminal answers.
      // What it can never carry is a hash with no verdict.
      const hash = writableHash(confirmation);
      const verdict = terminalVerdict(confirmation);
      let written = false;
      if (verdict !== null && !opts.dryRun) {
        const data = { anchoredHash: hash, anchorCheck: verdict };
        if (claimant.subject === 'URL_SNAPSHOT') {
          await prisma.urlSnapshot.update({ where: { id: claimant.id }, data });
        } else {
          await prisma.evidence.update({ where: { id: claimant.id }, data });
        }
        written = true;
      }

      switch (confirmation.kind) {
        case 'CONFIRMED':
          report.confirmed++;
          break;
        case 'CONFIRMED_BY_LOG':
          report.confirmedByLog++;
          break;
        case 'REGISTERED_BY_ANOTHER_TX':
          report.registeredByAnotherTx++;
          break;
        case 'MISANCHORED':
          report.misanchored++;
          break;
        case 'ANCHORED_NOTHING':
          report.anchoredNothing++;
          break;
        case 'NO_RECEIPT_HASH_REGISTERED':
          report.noReceiptHashRegistered++;
          break;
        case 'NO_RECEIPT_HASH_ABSENT':
          report.noReceiptHashAbsent++;
          break;
        case 'UNREACHABLE':
          report.unreachable++;
          break;
        case 'AMBIGUOUS':
          report.ambiguous++;
          break;
      }

      report.rows.push({
        subject: claimant.subject,
        id: claimant.id,
        txHash: claimant.txHash,
        confirmation,
        written,
      });
    } catch (err) {
      // One subject must not abort the pass, and the reason is kept. A count
      // tells you something is wrong; only the message tells you what.
      report.failed++;
      report.failures.push({
        id: claimant.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}
