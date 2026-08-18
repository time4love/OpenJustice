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
   */
  async findRegisteringTxHash(fileHash: string): Promise<string | null> {
    const bytes32Hash = ethers.zeroPadValue(fileHash, 32);
    const filterFn = this.contract.filters.EvidenceSubmitted as (
      fileHash: string,
    ) => ethers.DeferredTopicFilter;
    const logs = await this.contract.queryFilter(filterFn(bytes32Hash));
    return logs[0]?.transactionHash ?? null;
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
