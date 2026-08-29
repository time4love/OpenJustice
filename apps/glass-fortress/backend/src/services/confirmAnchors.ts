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
  /** The RPC has no receipt. The question could not be asked; nothing concluded. */
  | { kind: 'NO_RECEIPT' }
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
  confirmed: number;
  misanchored: number;
  anchoredNothing: number;
  noReceipt: number;
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
function decide(observed: RegisteredByTransaction, expected: string): AnchorConfirmation {
  if (observed.kind === 'NO_RECEIPT') return { kind: 'NO_RECEIPT' };
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
  if (confirmation.kind === 'CONFIRMED' || confirmation.kind === 'MISANCHORED') {
    return confirmation.anchoredHash;
  }
  return null;
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
    misanchored: 0,
    anchoredNothing: 0,
    noReceipt: 0,
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
      const confirmation = decide(
        await web3.readRegisteredHashes(claimant.txHash),
        claimant.expected,
      );

      const hash = writableHash(confirmation);
      let written = false;
      if (hash !== null && !opts.dryRun) {
        if (claimant.subject === 'URL_SNAPSHOT') {
          await prisma.urlSnapshot.update({
            where: { id: claimant.id },
            data: { anchoredHash: hash },
          });
        } else {
          await prisma.evidence.update({
            where: { id: claimant.id },
            data: { anchoredHash: hash },
          });
        }
        written = true;
      }

      switch (confirmation.kind) {
        case 'CONFIRMED':
          report.confirmed++;
          break;
        case 'MISANCHORED':
          report.misanchored++;
          break;
        case 'ANCHORED_NOTHING':
          report.anchoredNothing++;
          break;
        case 'NO_RECEIPT':
          report.noReceipt++;
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
