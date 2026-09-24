import { IntegrityCheckSubject } from '@prisma/client';
import { ethers } from 'ethers';
import { prisma } from '../lib/prisma';
import { Web3Service } from './Web3Service';
import type { RegistryReader } from './registryState';
import { recordOnChainCheckNeverThrowing } from './onChainVerification';
import { toBytes32 } from '../lib/bytes32';
import { inADeployment } from '../lib/inADeployment';
import {
  ANCHOR_SCHEME,
  DOCUMENT_COMMITMENT,
  anchoredCaptureHash,
  storedAnchorHash,
  type AnchorableCapture,
  type StoredAnchorHash,
} from '../lib/anchoredCaptureHash';

// ---------------------------------------------------------------------------
// THE ANCHORING MODULE — the registry's submit has ONE caller, and it is here.
//
// A capture is anchored AS IT IS STORED, and the anchor is AWAITED
// (docs/gf-interaction-flows.md Phase 2, ruled 2026-09-02; architecture §5).
// The fire-and-forget path this replaces stored 83 captures, anchored none, and
// reported success while the RPC answered "no backend is currently healthy" —
// then grew a twin copy, a log recovery, a copy-only mode and a repair pass to
// find out afterwards what it had done. On a registry that starts at zero
// (evidence flows §8) there is nothing to recover and nothing to copy: every
// entry is ours, every acquired capture is one entry, and a duplicate is a walk
// defect. So the module keeps one function that writes, and a chain failure
// throws with its reason. The walk halts having changed only its row; the
// snapshot row stays; the next call retries the anchor through the store's
// existing-row path.
//
// WRITES_ALLOWED IS EVALUATED HERE (evidence A7, architecture §9.8), once per
// walk call before the first anchor (flows A5), through the window the walk
// opens. A registry accepts writes only while it is empty or its index 0
// carries the anchoring scheme — derived from the chain, with no flag to set
// and no old address in code. On the old contracts index 0 carries a
// classifier's category list, so every write refuses, and the clean cut a
// fresh registry gives a verifier stays clean whatever the configuration says.
//
// A DOCUMENT IS THIS MODULE'S SECOND CALLER (document flows §4; plan §4 :408),
// by addition: `anchorDocumentCommitment` registers a document's COMMITMENT under
// DOCUMENT_COMMITMENT, through the same one write, behind the same
// WRITES_ALLOWED. It writes no row — ANCHORED(d) is read from chain state and
// never stored (A3 :1366, :1389). Its one caller is `anchorDocuments.ts`, whose
// callers open their window with `openDocumentRegistryWindow`.
//
// A CHAIN WRITE IS SENT ONLY FROM INSIDE A DEPLOYMENT (document step 31, Q8 as
// ruled 2026-09-24). The window this module builds FROM THE ENVIRONMENT refuses
// the write anywhere else — a laptop's backend holds a registrar key and would
// otherwise write a public chain from outside the environment that names it.
// Reads stay open. `maySend` has NO DEFAULT: every window states its guard, so a
// second window over the real client cannot be built by omission (REVIEW, chunk 2).
// ---------------------------------------------------------------------------

/**
 * How many snapshots claim no anchor. Derived from state, never tracked through
 * a transition — a counter incremented at write time would have reported zero
 * failures for a run whose every attempt was swallowed.
 */
export async function countUnanchoredSnapshots(trackedUrlId?: string): Promise<number> {
  return prisma.urlSnapshot.count({
    where: { onChainTxHash: null, ...(trackedUrlId ? { trackedUrlId } : {}) },
  });
}

/** The chain as this module needs it: the registry read from state, and its one write. */
export type CaptureRegistrar = RegistryReader & Pick<Web3Service, 'registerEvidenceHash'>;

/** WRITES_ALLOWED, with what index 0 carries when it refuses — the message names it. */
export type RegistryWritability = { allowed: true } | { allowed: false; indexZeroCategory: string };

/**
 * WRITES_ALLOWED(registry) = totalEvidence() = 0 OR getEvidence(0).category = ANCHOR_SCHEME.
 *
 * Evidence flows §8, verbatim. Read from STATE — `totalEvidence()` and the
 * entry at index 0 are readable forever, where a receipt is readable only inside
 * the RPC's retention horizon. An empty registry is written to without reading
 * an entry it does not have; the first write stamps the scheme, and from then
 * on index 0 says what the contract means.
 */
export async function writesAllowed(reader: RegistryReader): Promise<RegistryWritability> {
  const total = await reader.getTotalEvidence();
  if (total === BigInt(0)) return { allowed: true };
  const first = await reader.readEvidenceRecord(BigInt(0));
  return first.category === ANCHOR_SCHEME
    ? { allowed: true }
    : { allowed: false, indexZeroCategory: first.category };
}

/**
 * The refusal that holds the registry window shut. Thrown by the anchoring path
 * before its chain write; the walk answers `REGISTRY_FROZEN` naming index 0's
 * category, and acquires nothing.
 */
export class RegistryFrozenError extends Error {
  constructor(
    public readonly registryAddress: string,
    public readonly indexZeroCategory: string,
  ) {
    super(
      `Registry ${registryAddress} is frozen: index 0 carries the category ` +
        `"${indexZeroCategory}", not ${ANCHOR_SCHEME}. It holds another meaning, and this ` +
        'module will not add a second one to it. Nothing was anchored.',
    );
    this.name = 'RegistryFrozenError';
  }
}

/**
 * The chain could not be asked — as distinct from the chain having ANSWERED.
 *
 * Three ways, and the walk answers all three with one refusal, CHAIN_UNAVAILABLE
 * (ruled 2026-09-06, Q8): the registrar cannot be constructed (a variable the
 * deployment did not supply), the registry cannot be read (the RPC is down, or
 * the configured address holds no contract), or the transaction cannot be sent
 * (a network failure on the write). Every one is an outage or a configuration,
 * never a fact about the capture; the row stays where it was and the next call
 * asks again. A chain that DID answer — a duplicate, a revert, a rejected
 * argument — is not this error: that is a defect to surface, and it propagates
 * as itself.
 */
export class ChainUnavailableError extends Error {
  constructor(
    public readonly phase: 'CONNECT' | 'READ' | 'WRITE',
    public readonly cause: unknown,
  ) {
    super(
      `The chain could not be ${phase === 'CONNECT' ? 'reached' : phase === 'READ' ? 'read' : 'written'}: ` +
        `${cause instanceof Error ? cause.message : String(cause)}. Nothing was anchored; the walk stops here ` +
        'and the next call asks the chain again.',
    );
    this.name = 'ChainUnavailableError';
  }
}

/**
 * The registry as ONE walk call sees it.
 *
 * The registrar is CONNECTED on first need, never at the call's start: a walk
 * call that acquires nothing — every row IDENTICAL, or a stop on the first
 * capture — never touches the chain's configuration, and a test that stores
 * nothing constructs no provider.
 *
 * WRITES_ALLOWED is memoised for the window's lifetime: the walk opens a window
 * per call, the store asks it before the first row it creates, and every anchor
 * of that call asks it again for free. Index 0 cannot change under a call — an
 * entry is forever, and a registry that was empty gains our own scheme at index
 * 0 on the first write — so one read per call is one read too many only in the
 * sense that zero would be a guess.
 *
 * The REJECTION is memoised too, and it is a ChainUnavailableError whichever
 * step failed: a registry that could not be reached or read refuses every
 * anchor of the call with the same reason rather than asking the chain once per
 * capture; the next call opens a new window and asks again.
 */
export interface RegistryWindow {
  registrar(): Promise<CaptureRegistrar>;
  writable(): Promise<RegistryWritability>;
  /** Whether a write may leave from this process — asked at the moment of the write, never at opening. */
  maySend(): boolean;
}

export function openRegistryWindow(
  connect: () => CaptureRegistrar,
  maySend: () => boolean,
): RegistryWindow {
  let registrar: Promise<CaptureRegistrar> | null = null;
  let verdict: Promise<RegistryWritability> | null = null;
  const connected = (): Promise<CaptureRegistrar> =>
    (registrar ??= new Promise<CaptureRegistrar>((resolve, reject) => {
      try {
        resolve(connect());
      } catch (err) {
        reject(new ChainUnavailableError('CONNECT', err));
      }
    }));
  return {
    registrar: connected,
    maySend,
    writable: () =>
      (verdict ??= connected().then((reader) =>
        writesAllowed(reader).catch((err: unknown) => {
          throw new ChainUnavailableError('READ', err);
        }),
      )),
  };
}

/**
 * The registry window a walk call opens: the deployment's registrar, connected
 * on first need. The one place the walk's path names the chain's client, so
 * the walk itself imports nothing of it — the chain is this module's.
 */
export function openWalkRegistryWindow(): RegistryWindow {
  return openEnvironmentWindow();
}

/**
 * The window a document's anchoring and its reads open: the same client, built
 * the same way, through the one factory below — so the deployment guard cannot
 * be on the walk's path and missing from the document's.
 */
export function openDocumentRegistryWindow(): RegistryWindow {
  return openEnvironmentWindow();
}

/**
 * THE WINDOW BUILT FROM THE ENVIRONMENT — the deployment's registrar, and the
 * deployment guard (Q8 as ruled 2026-09-24): a write leaves only while
 * `inADeployment(process.env)`, read at the moment of the write. Every window
 * this module builds from the environment comes from here, so the guard cannot
 * be on one caller's path and missing from the other's.
 *
 * THE GUARD SITS ON THE WINDOW, NOT IN A WRAPPER AROUND THE CLIENT'S WRITE, and
 * the reason is this module's own invariant: the registry's `submit` is spelled
 * ONCE, in `registerOnce`, after WRITES_ALLOWED (`test/anchorSnapshots.test.ts`,
 * "calls it once" and "before its one chain write"). A wrapper would be a second
 * spelling of the write; the window's answer is asked by that one spelling.
 */
function openEnvironmentWindow(): RegistryWindow {
  return openRegistryWindow(() => new Web3Service(), () => inADeployment(process.env));
}

/** Why a chain write was refused on a machine that is not a running deployment. */
export class NotInADeploymentError extends Error {
  constructor() {
    super(
      'Chain writes run only inside a deployment (RAILWAY_DEPLOYMENT_ID is not set). ' +
        'Reads are answered; nothing is written from here.',
    );
    this.name = 'NotInADeploymentError';
  }
}

/**
 * WRITES_ALLOWED, or the refusal. The one place the frozen registry becomes an
 * error: the store asks it before the row it is about to create (flows A5,
 * "nothing is acquired"), and the anchoring path asks it before its one chain
 * write — the same memoised answer, so the second ask costs nothing.
 */
export async function requireWritable(window: RegistryWindow): Promise<void> {
  const writability = await window.writable();
  if (!writability.allowed) {
    const { registryAddress } = await window.registrar();
    throw new RegistryFrozenError(registryAddress, writability.indexZeroCategory);
  }
}

/**
 * The write-phase failures that mean the chain did not answer. ethers names
 * them; everything else — a duplicate, a revert, a rejected argument — is the
 * chain's answer and propagates as the defect it is.
 */
function chainDidNotAnswer(err: unknown): boolean {
  return ethers.isError(err, 'NETWORK_ERROR') || ethers.isError(err, 'TIMEOUT') || ethers.isError(err, 'SERVER_ERROR');
}

/**
 * THE MODULE'S ONE WRITE — WRITES_ALLOWED, then the registration, awaited.
 * Both callers come through here, so the registry's `submit` is spelled once and
 * the refusal before it cannot be skipped by one of them (evidence A7 :1297–:1301;
 * plan §4 :408). A chain that did not answer is CHAIN_UNAVAILABLE; a chain that
 * answered — a duplicate, a revert — propagates as itself.
 *
 * OUTSIDE A DEPLOYMENT the environment's window refuses here, after the reads and
 * before the write: a ChainUnavailableError, phase WRITE, its cause
 * NotInADeploymentError — a CONFIGURATION, "never a fact about the capture"
 * (ChainUnavailableError, above). The walk halts CHAIN_UNAVAILABLE with the row
 * kept; a document's receipt completes owed. Each caller's existing outage path.
 */
async function registerOnce(window: RegistryWindow, hash: string, category: string): Promise<string> {
  await requireWritable(window);
  const registrar = await window.registrar();
  if (!window.maySend()) throw new ChainUnavailableError('WRITE', new NotInADeploymentError());
  try {
    return await registrar.registerEvidenceHash(toBytes32(hash), NO_SUBMITTER, category);
  } catch (err) {
    if (chainDidNotAnswer(err)) throw new ChainUnavailableError('WRITE', err);
    throw err;
  }
}

/**
 * Anchor a document's COMMITMENT — the module's second caller, by addition
 * (document flows §4 :410–:427). The commitment is the document's public name,
 * `sha256(DOC_ID ‖ salt)`; the DOC_ID never reaches the chain. Nothing is
 * written to a row: ANCHORED(d) is read from chain state on every read (A3
 * :1366), so this returns the transaction hash for its caller's log alone.
 */
export async function anchorDocumentCommitment(window: RegistryWindow, commitment: string): Promise<string> {
  return registerOnce(window, commitment, DOCUMENT_COMMITMENT);
}

/**
 * Off-chain submitter, informational: the on-chain `msg.sender` is always the
 * registrar wallet, and a capture has no citizen behind it.
 */
const NO_SUBMITTER = '0x0000000000000000000000000000000000000000';

/**
 * Write an anchoring claim — the transaction AND the hash it registered,
 * together or not at all. The one writer of both columns (walk invariant I2).
 *
 * The hash is OBSERVED here in the only sense available at write time: it is the
 * value this code just registered. The verdict recorded after it reads the
 * receipt back, which is the stronger observation and the one that can disagree.
 */
async function claimAnchor(
  snapshotId: string,
  txHash: string,
  anchoredHash: StoredAnchorHash,
): Promise<void> {
  await prisma.urlSnapshot.update({
    where: { id: snapshotId },
    data: { onChainTxHash: txHash, anchoredHash },
  });
}

/**
 * Anchor an acquired capture: WRITES_ALLOWED, then the registration, awaited,
 * then the claim, then the verdict. Throws on every failure, with its reason.
 *
 * The CAPTURE is the parameter, never the hash. Which of a capture's hashes the
 * chain attests to is one rule with one home (`anchoredCaptureHash`), and a
 * caller that picks the hash itself is a caller that keeps its own answer when
 * the rule moves. Normalised once here so the value that reaches the chain and
 * the value that reaches the column are the same object; the brand makes a
 * second write site impossible to spell without passing through this line.
 *
 * `toBytes32` at the chain boundary, not the bare hex: passing bare hex where
 * bytes32 was required is what made 83 snapshot anchorings silently no-op, and
 * a verification that repeated the mistake would confirm the wrong hash.
 *
 * A `DuplicateEvidenceError` propagates. On a registry that starts at zero it
 * means the walk registered the same bytes twice — a defect to surface, never a
 * pointer to recover — and recovering it would be the log scan this module
 * retired, wearing a new name.
 */
export async function anchorAcquiredCapture(
  window: RegistryWindow,
  snapshotId: string,
  capture: AnchorableCapture,
): Promise<void> {
  const anchoredHash = storedAnchorHash(anchoredCaptureHash(capture));
  const txHash = await registerOnce(window, anchoredHash, ANCHOR_SCHEME);
  await claimAnchor(snapshotId, txHash, anchoredHash);

  // LEVEL 3a — a write that leaves a row asserting an anchor is checked against
  // the chain and the verdict stored, seconds after the write: the receipt is
  // inside the RPC's horizon by construction, which is the property the
  // receipt-horizon lesson wanted. Never throws — the anchor is already true.
  await recordOnChainCheckNeverThrowing({
    subjectType: IntegrityCheckSubject.URL_SNAPSHOT,
    subjectId: snapshotId,
    fileHash: toBytes32(anchoredHash),
  });
}
