import { ethers } from 'ethers';
import { EVIDENCE_REGISTRY_ABI } from '../abi/EvidenceRegistry';

// ---------------------------------------------------------------------------
// Typed contract errors
// ---------------------------------------------------------------------------

export class DuplicateEvidenceError extends Error {
  constructor(public readonly fileHash: string) {
    super(`Evidence with hash ${fileHash} is already registered on-chain.`);
    this.name = 'DuplicateEvidenceError';
  }
}

export class ContractRevertError extends Error {
  constructor(
    public readonly reason: string,
    public readonly originalError: unknown,
  ) {
    super(`Contract reverted: ${reason}`);
    this.name = 'ContractRevertError';
  }
}

// ---------------------------------------------------------------------------
// Web3Service
// ---------------------------------------------------------------------------

/**
 * What one transaction registered with THIS registry, as observed from its
 * receipt. A discriminated union so a caller cannot read "could not ask" as
 * "anchored nothing" — the two license opposite decisions about a stored claim.
 */
export type RegisteredByTransaction =
  | { kind: 'REGISTERED'; hashes: string[]; registryAddress: string }
  /** The RPC has no receipt for this transaction. Nothing may be concluded. */
  | { kind: 'NO_RECEIPT' }
  /** A real transaction that emitted no registration. The fake-CONFIRMED shape. */
  | { kind: 'ANCHORED_NOTHING' };

/** Which network step a registering-transaction lookup reached, and what it said. */
export type RegisteringTxLookup =
  | ({ kind: 'FOUND'; txHash: string } & LogSearchWindow)
  /** The registry does not hold the hash. A definite answer, not a failure. */
  | { kind: 'NOT_REGISTERED' }
  /**
   * The registry holds the hash and the window around its recorded block carries
   * no matching log. Also a definite answer — and a surprising one, since the
   * window is derived from the contract's own timestamp for that registration.
   * The window is reported so the next question can be about its width.
   */
  | ({ kind: 'NO_LOG_IN_WINDOW' } & LogSearchWindow)
  /**
   * A step failed. NEVER collapsed into "no transaction found": an endpoint that
   * refused the query and a chain that holds no such log license opposite
   * conclusions about a stored anchoring claim.
   */
  | ({ kind: 'LOOKUP_FAILED'; step: RegisteringTxLookupStep; reason: string } & Partial<LogSearchWindow>);

export type RegisteringTxLookupStep = 'REGISTRY' | 'RECORD' | 'BLOCK_SEARCH' | 'LOG_QUERY';

/** Where the log query looked. Reported on every outcome that got far enough to have one. */
export interface LogSearchWindow {
  anchorBlock: number;
  searchedFrom: number;
  searchedTo: number;
}

/** An error's message, whatever it was thrown as. */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class Web3Service {
  /**
   * Half-width, in blocks, of the window scanned for a registering event.
   *
   * Every log query MUST be bounded: public RPC endpoints cap `eth_getLogs`
   * block ranges, and an unbounded query is rejected outright rather than
   * truncated. Base's public Sepolia endpoint — which GF staging uses —
   * accepts a span of ~10k blocks and fails beyond it, so a ±128 window sits
   * two orders of magnitude inside the limit while still absorbing any skew
   * between the recorded timestamp and its block.
   */
  private static readonly LOG_WINDOW_BLOCKS = 128;

  private readonly provider: ethers.JsonRpcProvider;
  private readonly wallet: ethers.Wallet;
  private readonly contract: ethers.Contract;
  private readonly contractAddress: string;
  /** Memoised deployment check — one eth_getCode per process, not per call. */
  private deploymentCheck: Promise<void> | null = null;

  constructor() {
    const rpcUrl = process.env['RPC_URL'];
    const privateKey = process.env['REGISTRAR_PRIVATE_KEY'];
    const contractAddress = process.env['EVIDENCE_REGISTRY_ADDRESS'];

    if (!rpcUrl) throw new Error('RPC_URL environment variable is not set.');
    if (!privateKey) throw new Error('REGISTRAR_PRIVATE_KEY environment variable is not set.');
    if (!contractAddress)
      throw new Error('EVIDENCE_REGISTRY_ADDRESS environment variable is not set.');

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.contract = new ethers.Contract(contractAddress, EVIDENCE_REGISTRY_ABI, this.wallet);
    this.contractAddress = contractAddress;
  }

  /**
   * Refuse to touch an address that holds no contract.
   *
   * THE FAILURE THIS PREVENTS DOES NOT LOOK LIKE A FAILURE.
   *
   * A transaction sent to an address with no code does not revert. It succeeds
   * as a plain transfer and returns a perfectly valid transaction hash. The
   * promotion path would then mark the evidence CONFIRMED and store that hash as
   * proof of anchoring — a real transaction, a real hash, anchoring nothing.
   * Fabricated chain of custody, indistinguishable from a genuine anchor without
   * querying the contract.
   *
   * This is not hypothetical. On 2026-08-26 the local production env file was
   * found holding 0x5FbDB2315678afecb367f032d93F642f64180aa3 — the Hardhat/Anvil
   * default first-deployment address — with no contract at it on Base mainnet,
   * while the real registry is 0x0e21561bbfbb8716713bd60cd21ec5730a4d0d22. A
   * promotion run with that file loaded was one command away.
   *
   * Guarding READS as well as writes, deliberately. isRegistered against a
   * codeless address reports "not registered", which tells check_on_chain_status
   * that a hash is safe to promote — feeding the same disaster from the other
   * end.
   *
   * A rule saying "use MCP for chain writes" is a rule; this is the mechanism,
   * and it holds in every environment regardless of what any env file says.
   */
  private async assertRegistryDeployed(): Promise<void> {
    this.deploymentCheck ??= (async (): Promise<void> => {
      const code = await this.provider.getCode(this.contractAddress);
      if (code === '0x' || code === '0x0') {
        const network = await this.provider.getNetwork();
        throw new Error(
          `No contract at EVIDENCE_REGISTRY_ADDRESS ${this.contractAddress} on chain ` +
            `${String(network.chainId)}. Refusing to read or write evidence anchors: a ` +
            `transaction to a codeless address SUCCEEDS and returns a valid txHash while ` +
            `anchoring nothing, which would record fabricated chain of custody.`,
        );
      }
    })();

    try {
      await this.deploymentCheck;
    } catch (err) {
      // Not cached as a permanent failure: a transient RPC error must not wedge
      // the process into refusing every subsequent call.
      this.deploymentCheck = null;
      throw err;
    }
  }

  /**
   * Hash a raw file buffer with SHA-256 and return it as a bytes32 hex string
   * suitable for passing directly to the smart contract.
   */
  static hashFile(fileBuffer: Buffer): string {
    return ethers.sha256(fileBuffer);
  }

  /**
   * Register an evidence hash on-chain via the EvidenceRegistry `submit` function.
   *
   * @param fileHash         SHA-256 hash of the evidence file as a 0x-prefixed hex string.
   * @param submitterAddress Off-chain address of the citizen who submitted the evidence
   *                         (informational — the on-chain msg.sender is always the REGISTRAR wallet).
   * @param category         Legal category string (must match the contract's accepted values).
   * @returns                The transaction hash of the confirmed submission.
   * @throws DuplicateEvidenceError  If the hash already exists in the registry.
   * @throws ContractRevertError     For any other contract-level revert.
   */
  async registerEvidenceHash(
    fileHash: string,
    submitterAddress: string,
    category: string,
  ): Promise<string> {
    await this.assertRegistryDeployed();

    // Validate & normalise the hash to bytes32
    const bytes32Hash = ethers.zeroPadValue(fileHash, 32);

    try {
      const tx: ethers.TransactionResponse = await (
        this.contract['submit'] as (
          fileHash: string,
          category: string,
        ) => Promise<ethers.TransactionResponse>
      )(bytes32Hash, category);

      console.log(
        `[Web3Service] Submitted evidence for ${submitterAddress} | tx: ${tx.hash} | category: ${category}`,
      );

      // Wait for one confirmation before returning
      await tx.wait(1);

      return tx.hash;
    } catch (err: unknown) {
      // ethers v6: use the isError type guard to narrow CALL_EXCEPTION errors.
      // NOTE: when the revert occurs during estimateGas, ethers v6 does NOT populate
      // err.revert — it returns null. Fall back to matching the 4-byte selector from
      // err.data so DuplicateEvidence is always detected correctly.
      if (ethers.isError(err, 'CALL_EXCEPTION')) {
        const DUPLICATE_SELECTOR = ethers.id('DuplicateEvidence(bytes32)').slice(0, 10);
        const isDuplicate =
          err.revert?.name === 'DuplicateEvidence' ||
          (typeof err.data === 'string' && err.data.slice(0, 10) === DUPLICATE_SELECTOR);
        if (isDuplicate) {
          throw new DuplicateEvidenceError(fileHash);
        }
        throw new ContractRevertError(err.reason ?? err.message, err);
      }

      // Re-throw unknown errors
      throw err;
    }
  }

  /**
   * Recovers the transaction hash that originally registered `fileHash`, for
   * use after registerEvidenceHash() throws DuplicateEvidenceError. A reverted
   * call never returns a transaction hash (there is nothing to return — the
   * transaction failed), so this is the only way to attach a real, verifiable
   * hash to a record whose content the contract confirms is already
   * registered. Queries the EvidenceSubmitted event log, in which fileHash is
   * an indexed parameter — the contract itself never stores a tx hash (it
   * can't; a contract doesn't know its own transaction hash), so the event log
   * is the sole source of truth for this.
   *
   * Returns null if no matching event is found — should not normally happen
   * for a hash the contract just confirmed is registered; defensive only.
   * Callers must treat null the same as "cannot be confirmed" and must never
   * mark a record CONFIRMED without a real hash from this or a fresh
   * registration.
   *
   * The event is located via a BOUNDED block range. Querying the full chain in
   * one call is not a slower version of this — it is rejected outright by
   * public RPC endpoints (verified against Base Sepolia, GF staging's own
   * chain, where a genesis-to-head query throws), which would turn every
   * duplicate into a failed promotion.
   */
  /**
   * WHAT A TRANSACTION ACTUALLY REGISTERED — the inverse of
   * findRegisteringTxHash, and the only direction that can CONFIRM a stored
   * anchoring claim rather than corroborate it.
   *
   * `findRegisteringTxHash` answers "is this hash registered, and by what?". It
   * cannot check a row, because a row whose transaction registered something
   * else still passes whenever the hash it carries was registered by some OTHER
   * transaction. This reads the receipt the row points at and reports the hash
   * that transaction emitted, so a mismatch is DISCOVERED instead of averaging
   * out.
   *
   * ONLY LOGS FROM THIS REGISTRY COUNT. `EvidenceSubmitted` is an ordinary event
   * signature and any contract may emit one; a log from elsewhere in the same
   * transaction is not this registry speaking. The plan permits exactly one
   * registry, and this is where that is enforced rather than assumed.
   *
   * `ANCHORED_NOTHING` is the important arm and it is named for the hazard, not
   * for the shape of the data. A transaction sent to an address holding no code
   * SUCCEEDS as a plain transfer and returns a perfectly valid hash — see
   * assertRegistryDeployed. A row anchored that way carries a real transaction
   * that attests to nothing, which is the fake-CONFIRMED family. Collapsing it
   * into "no hash found" would report the one condition worth finding as an
   * absence of data.
   */
  async readRegisteredHashes(txHash: string): Promise<RegisteredByTransaction> {
    const receipt = await this.provider.getTransactionReceipt(txHash);
    // Distinct from a receipt that anchors nothing: a transaction the RPC cannot
    // produce is a question we could not ask, and §3 rules that a verdict about
    // the CHECK is never a verdict about the data.
    if (!receipt) return { kind: 'NO_RECEIPT' };

    const mine = this.contractAddress.toLowerCase();
    const hashes: string[] = [];
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== mine) continue;
      // parseLog returns null for a log this ABI does not describe, which is the
      // normal case for role events and anything else the registry emits.
      const parsed = this.contract.interface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      if (parsed?.name !== 'EvidenceSubmitted') continue;
      // getValue by name, not index: the ABI's parameter order is the contract's
      // to change and this must keep meaning `fileHash` if it ever does.
      hashes.push((parsed.args.getValue('fileHash') as string).toLowerCase());
    }

    if (hashes.length === 0) return { kind: 'ANCHORED_NOTHING' };
    return { kind: 'REGISTERED', hashes, registryAddress: mine };
  }

  async findRegisteringTxHash(fileHash: string): Promise<string | null> {
    const lookup = await this.lookupRegisteringTx(fileHash);
    return lookup.kind === 'FOUND' ? lookup.txHash : null;
  }

  /**
   * The same lookup, SAYING WHICH STEP ANSWERED — or which step failed.
   *
   * `findRegisteringTxHash` collapses four distinct outcomes into `null`, and
   * that cost a whole diagnostic run: the log route resolved 0 of 91 staging
   * subjects and nothing in the output could distinguish "the registry's log
   * holds no such transaction" from "the endpoint refused the query" from "the
   * block search threw before any log was ever requested". A count tells you
   * something is wrong; only the step and the message tell you what.
   *
   * Four network steps, each able to fail for its own reason, and they are NOT
   * interchangeable news:
   *   REGISTRY      — is the hash registered at all
   *   RECORD        — the contract's stored timestamp for it
   *   BLOCK_SEARCH  — the block at that timestamp
   *   LOG_QUERY     — EvidenceSubmitted within a window around that block
   *
   * `findRegisteringTxHash` delegates rather than duplicating: one
   * implementation, two shapes, the same move as `anchorOneSnapshot`.
   */
  async lookupRegisteringTx(fileHash: string): Promise<RegisteringTxLookup> {
    let evidenceId: bigint;
    try {
      const registry = await this.isHashRegistered(fileHash);
      if (!registry.registered) return { kind: 'NOT_REGISTERED' };
      evidenceId = registry.evidenceId;
    } catch (err) {
      return { kind: 'LOOKUP_FAILED', step: 'REGISTRY', reason: messageOf(err) };
    }

    // The contract stores the block timestamp of the registering transaction,
    // which is the only pointer back to its block — so locate that block by
    // timestamp, then query a narrow window around it.
    let timestamp: number;
    try {
      timestamp = Number((await this.getEvidenceRecord(evidenceId)).timestamp);
    } catch (err) {
      return { kind: 'LOOKUP_FAILED', step: 'RECORD', reason: messageOf(err) };
    }

    let anchorBlock: number;
    try {
      anchorBlock = await this.findBlockAtTimestamp(timestamp);
    } catch (err) {
      return { kind: 'LOOKUP_FAILED', step: 'BLOCK_SEARCH', reason: messageOf(err) };
    }

    const from = Math.max(0, anchorBlock - Web3Service.LOG_WINDOW_BLOCKS);
    const to = anchorBlock + Web3Service.LOG_WINDOW_BLOCKS;
    const window = { anchorBlock, searchedFrom: from, searchedTo: to };

    try {
      const bytes32Hash = ethers.zeroPadValue(fileHash, 32);
      const filterFn = this.contract.filters.EvidenceSubmitted as (
        fileHash: string,
      ) => ethers.DeferredTopicFilter;
      const logs = await this.contract.queryFilter(filterFn(bytes32Hash), from, to);
      // `.at(0)`, not `logs[0]?.` — the two debt ratchets contradict each other
      // over element access and `.at()` is the house answer: it is typed
      // `T | undefined` unconditionally, so this guard is genuinely necessary.
      const first = logs.at(0);
      return first === undefined
        ? { kind: 'NO_LOG_IN_WINDOW', ...window }
        : { kind: 'FOUND', txHash: first.transactionHash, ...window };
    } catch (err) {
      return { kind: 'LOOKUP_FAILED', step: 'LOG_QUERY', reason: messageOf(err), ...window };
    }
  }

  /**
   * Finds the earliest block whose timestamp is >= `targetTimestamp`, by
   * binary search over block headers.
   *
   * Deliberately derived from the chain rather than from a configured
   * deployment block: a `*_DEPLOY_BLOCK` environment variable would be one
   * more per-environment chain constant to keep in sync, and this codebase has
   * already been burnt once by a stale one (see the note above
   * EVIDENCE_REGISTRY_ADDRESS in .env — a leftover local-Anvil placeholder
   * pointing at no real contract).
   *
   * The bracket is seeded by interpolating against the chain's mean block time
   * before binary searching, because every header read is a sequential network
   * round trip: over Base Sepolia's ~45.7M blocks a cold binary search costs
   * ~26 of them (measured: 15-21s), which is long enough to risk a proxy
   * timeout inside the HTTP promote routes that call this — turning the
   * recovery back into the failed promotion it exists to prevent. Interpolation
   * lands within a few thousand blocks on any chain with regular block times,
   * and the search stays exact regardless: a bad estimate only widens the
   * bracket, it can never move the answer.
   */
  private async findBlockAtTimestamp(targetTimestamp: number): Promise<number> {
    const head = await this.provider.getBlockNumber();
    const headBlock = await this.provider.getBlock(head);
    if (!headBlock || headBlock.timestamp <= targetTimestamp) return head;

    const genesis = await this.provider.getBlock(0);
    let low = 0;
    let high = head;

    if (genesis && headBlock.timestamp > genesis.timestamp) {
      const meanBlockTime = (headBlock.timestamp - genesis.timestamp) / head;
      const estimate = Math.round((targetTimestamp - genesis.timestamp) / meanBlockTime);
      // Expand geometrically until the bracket provably contains the target,
      // then let the binary search below finish the job exactly.
      for (let margin = Web3Service.LOG_WINDOW_BLOCKS; margin <= head; margin *= 8) {
        const lo = Math.max(0, estimate - margin);
        const hi = Math.min(head, estimate + margin);
        const [loBlock, hiBlock] = await Promise.all([
          this.provider.getBlock(lo),
          this.provider.getBlock(hi),
        ]);
        if (loBlock && hiBlock && loBlock.timestamp < targetTimestamp && hiBlock.timestamp >= targetTimestamp) {
          low = lo;
          high = hi;
          break;
        }
      }
    }

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const block = await this.provider.getBlock(mid);
      // A header the node will not serve tells us nothing about the target;
      // stepping past it keeps the search converging rather than stalling.
      if (!block) {
        low = mid + 1;
        continue;
      }
      if (block.timestamp < targetTimestamp) low = mid + 1;
      else high = mid;
    }

    return low;
  }

  /** Reads a single on-chain evidence record by its sequential id. */
  private async getEvidenceRecord(evidenceId: bigint): Promise<{ timestamp: bigint }> {
    return await (
      this.contract.getEvidence as (id: bigint) => Promise<{ timestamp: bigint }>
    )(evidenceId);
  }

  /**
   * Check whether a hash is already registered without sending a transaction.
   */
  async isHashRegistered(fileHash: string): Promise<{ registered: boolean; evidenceId: bigint }> {
    await this.assertRegistryDeployed();

    const bytes32Hash = ethers.zeroPadValue(fileHash, 32);
    const [registered, evidenceId] = (await (
      this.contract['isRegistered'] as (fileHash: string) => Promise<[boolean, bigint]>
    )(bytes32Hash)) as [boolean, bigint];
    return { registered, evidenceId };
  }

  /** Total number of evidence records stored on-chain. */
  async getTotalEvidence(): Promise<bigint> {
    return (await (this.contract['totalEvidence'] as () => Promise<bigint>)()) as bigint;
  }
}
