import { AnchorCheckOutcome } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Web3Service, type RegisteredByTransaction } from './Web3Service';
import { toBytes32 } from '../lib/bytes32';
import { ANCHORABLE_CAPTURE_SELECT, anchoredCaptureHash } from '../lib/anchoredCaptureHash';

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
  | { kind: 'NO_RECEIPT_HASH_REGISTERED'; expected: string; txHashFromLog: string | null }
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
  /** The hash the row carries — what the transaction is EXPECTED to have registered. */
  expected: string;
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

async function anchorClaimants(): Promise<AnchorClaimant[]> {
  const [snapshots, evidence] = await Promise.all([
    prisma.urlSnapshot.findMany({
      where: { NOT: { onChainTxHash: null }, anchoredHash: null },
      select: { id: true, onChainTxHash: true, ...ANCHORABLE_CAPTURE_SELECT },
      orderBy: { capturedAt: 'asc' },
    }),
    prisma.evidence.findMany({
      where: { NOT: { onChainTxHash: null }, anchoredHash: null },
      select: { id: true, onChainTxHash: true, fileHash: true },
      orderBy: { evidenceDate: 'asc' },
    }),
  ]);

  return [
    ...snapshots.map((s) => ({
      subject: 'URL_SNAPSHOT' as const,
      id: s.id,
      txHash: requireAnchorTx(s.onChainTxHash, s.id),
      // What the CURRENT rule says this capture is anchored by. Only ever the
      // expectation the observation is compared against — never the value
      // written, which is the whole point of this pass.
      expected: anchoredCaptureHash(s),
    })),
    ...evidence.map((e) => ({
      subject: 'EVIDENCE' as const,
      id: e.id,
      txHash: requireAnchorTx(e.onChainTxHash, e.id),
      expected: e.fileHash,
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
function decide(
  observed: RegisteredByTransaction,
  /** What the row claims: the hash it carries and the transaction it points at. */
  claim: { expected: string; txHash: string },
  /**
   * The answers to the two fallback questions, asked ONLY when the receipt could
   * not be read — on exactly the rows that need them, never on all of them.
   *
   * `hashRegistered: null` means the registry could not be asked either, which is
   * a third thing again and must not read as "this chain does not hold it".
   */
  fallback: { hashRegistered: boolean | null; txHashFromLog: string | null },
): AnchorConfirmation {
  const { expected, txHash } = claim;
  const { hashRegistered, txHashFromLog } = fallback;
  if (observed.kind === 'NO_RECEIPT') {
    if (hashRegistered === null) return { kind: 'UNREACHABLE' };
    if (!hashRegistered) return { kind: 'NO_RECEIPT_HASH_ABSENT', expected };

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
    if (txHashFromLog !== null && sameTx(txHashFromLog, txHash)) {
      return { kind: 'CONFIRMED_BY_LOG', anchoredHash: expected };
    }
    if (txHashFromLog !== null) {
      // The registry names a DIFFERENT transaction for this hash. Reported with
      // both transactions rather than collapsed into MISANCHORED: the contract
      // reverts a duplicate registration, so this should be impossible, and a
      // verdict that cannot happen deserves to be read by a human rather than
      // counted. Asserted rather than assumed.
      return { kind: 'REGISTERED_BY_ANOTHER_TX', expected, txHashFromLog };
    }
    return { kind: 'NO_RECEIPT_HASH_REGISTERED', expected, txHashFromLog: null };
  }
  if (observed.kind === 'ANCHORED_NOTHING') return { kind: 'ANCHORED_NOTHING' };

  const match = observed.hashes.find((h) => sameHash(h, expected));
  if (match) return { kind: 'CONFIRMED', anchoredHash: match };
  // `.at()`, not `[0]` and not a destructure. Both debt ratchets have an opinion
  // and between them they rule out the obvious spellings: `hashes[0]` is an
  // unchecked indexed access, and a `!== undefined` guard on it is a condition
  // the types say can never be false. `.at()` is honestly typed as optional, so
  // the guard is real and neither ratchet has to be argued with.
  const sole = observed.hashes.length === 1 ? observed.hashes.at(0) : undefined;
  if (sole !== undefined) return { kind: 'MISANCHORED', anchoredHash: sole, expected };
  return { kind: 'AMBIGUOUS', candidates: observed.hashes, expected };
}

/** The hash a confirmation licenses writing, or null when it licenses none. */
function writableHash(confirmation: AnchorConfirmation): string | null {
  // MISANCHORED writes too, deliberately. The column records what the
  // transaction registered, and a divergence is exactly the fact worth having on
  // the row — suppressing it would leave the anchor looking unexamined rather
  // than examined and wrong.
  if (
    confirmation.kind === 'CONFIRMED' ||
    confirmation.kind === 'CONFIRMED_BY_LOG' ||
    confirmation.kind === 'MISANCHORED'
  ) {
    return confirmation.anchoredHash;
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
    case 'REGISTERED_BY_ANOTHER_TX':
      return AnchorCheckOutcome.MISANCHORED;
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
export function confirmAnchorsExitCode(report: ConfirmAnchorsReport): number {
  if (report.failed > 0) return 1;
  if (
    report.misanchored +
      report.anchoredNothing +
      report.noReceiptHashAbsent +
      report.registeredByAnotherTx >
    0
  ) {
    return 2;
  }
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
}): Promise<ConfirmAnchorsReport> {
  const [snapshotsDone, evidenceDone] = await Promise.all([
    prisma.urlSnapshot.count({ where: { NOT: { anchoredHash: null } } }),
    prisma.evidence.count({ where: { NOT: { anchoredHash: null } } }),
  ]);

  const all = await anchorClaimants();
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
      let hashRegistered: boolean | null = null;
      let txHashFromLog: string | null = null;
      if (observed.kind === 'NO_RECEIPT') {
        try {
          hashRegistered = (await web3.isHashRegistered(toBytes32(claimant.expected))).registered;
        } catch {
          // The registry could not be asked either. Left null so the verdict is
          // UNREACHABLE rather than "this chain does not hold it" — an RPC
          // failure and a negative answer license opposite conclusions.
          hashRegistered = null;
        }
        if (hashRegistered === true) {
          try {
            // Costly — a block-range binary search per subject — so it runs only
            // where the cheap route already failed AND the fact is known to be on
            // chain. Never on a row whose receipt was readable.
            txHashFromLog = await web3.findRegisteringTxHash(toBytes32(claimant.expected));
          } catch {
            // Leaves the row at NO_RECEIPT_HASH_REGISTERED: unresolved rather
            // than wrong, which is exactly what a failed lookup licenses.
            txHashFromLog = null;
          }
        }
      }
      const confirmation = decide(
        observed,
        { expected: claimant.expected, txHash: claimant.txHash },
        { hashRegistered, txHashFromLog },
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
