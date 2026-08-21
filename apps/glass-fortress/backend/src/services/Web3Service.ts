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
  async findRegisteringTxHash(fileHash: string): Promise<string | null> {
    const { registered, evidenceId } = await this.isHashRegistered(fileHash);
    if (!registered) return null;

    // The contract stores the block timestamp of the registering transaction,
    // which is the only pointer back to its block — so locate that block by
    // timestamp, then query a narrow window around it.
    const record = await this.getEvidenceRecord(evidenceId);
    const anchorBlock = await this.findBlockAtTimestamp(Number(record.timestamp));

    const bytes32Hash = ethers.zeroPadValue(fileHash, 32);
    const filterFn = this.contract.filters.EvidenceSubmitted as (
      fileHash: string,
    ) => ethers.DeferredTopicFilter;
    const logs = await this.contract.queryFilter(
      filterFn(bytes32Hash),
      Math.max(0, anchorBlock - Web3Service.LOG_WINDOW_BLOCKS),
      anchorBlock + Web3Service.LOG_WINDOW_BLOCKS,
    );
    return logs[0]?.transactionHash ?? null;
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
