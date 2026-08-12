import { ethers } from 'ethers';
import { EVIDENCE_REGISTRY_ABI } from '../abi/EvidenceRegistry';

// ---------------------------------------------------------------------------
// BronzeWeb3Service — registers allegation hashes on-chain.
//
// Uses the same shared EvidenceRegistry contract as Glass Fortress, but with
// a separate BF wallet and contract deployment. Category is always 'ALLEGATION'
// so on-chain records are distinguishable from GF evidence records.
//
// Environment variables (all required to enable on-chain registration):
//   RPC_URL         — JSON-RPC endpoint (Alchemy / Infura / etc.)
//   PRIVATE_KEY     — hex private key of the BF registrar wallet
//   CONTRACT_ADDRESS — deployed EvidenceRegistry contract address
// ---------------------------------------------------------------------------

const CATEGORY = 'ALLEGATION';

export class BronzeWeb3Service {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly wallet: ethers.Wallet;
  private readonly contract: ethers.Contract;

  constructor(rpcUrl: string, privateKey: string, contractAddress: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.contract = new ethers.Contract(contractAddress, EVIDENCE_REGISTRY_ABI, this.wallet);
  }

  /**
   * Register an allegation hash on-chain.
   *
   * @param allegationHash  64-char hex SHA-256 string (without 0x prefix).
   * @returns               Transaction hash of the confirmed submission.
   *
   * If the hash is already registered (duplicate), returns the sentinel
   * string 'already-registered' — the caller should still persist this so
   * the record is not re-attempted on the next backfill run.
   */
  async registerCommitmentHash(allegationHash: string): Promise<string> {
    const hex = allegationHash.startsWith('0x') ? allegationHash : `0x${allegationHash}`;
    const bytes32Hash = ethers.zeroPadValue(hex, 32);

    try {
      const tx = await (
        this.contract['submit'] as (
          fileHash: string,
          category: string,
        ) => Promise<ethers.TransactionResponse>
      )(bytes32Hash, CATEGORY);

      await tx.wait(1);
      console.log(`[BF Web3] Allegation registered on-chain: ${tx.hash}`);
      return tx.hash;
    } catch (err: unknown) {
      if (ethers.isError(err, 'CALL_EXCEPTION')) {
        const DUPLICATE_SELECTOR = ethers.id('DuplicateEvidence(bytes32)').slice(0, 10);
        const isDuplicate =
          err.revert?.name === 'DuplicateEvidence' ||
          (typeof err.data === 'string' && err.data.slice(0, 10) === DUPLICATE_SELECTOR);
        if (isDuplicate) {
          console.warn(`[BF Web3] Allegation already registered on-chain: ${allegationHash}`);
          return 'already-registered';
        }
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Lazy singleton — returns null when env vars are not configured (dev / test).
// ---------------------------------------------------------------------------

let _instance: BronzeWeb3Service | null = null;
let _initialized = false;

export function getWeb3Service(): BronzeWeb3Service | null {
  if (!_initialized) {
    _initialized = true;
    const rpcUrl = process.env['RPC_URL'];
    const privateKey = process.env['PRIVATE_KEY'];
    const contractAddress = process.env['CONTRACT_ADDRESS'];

    if (rpcUrl && privateKey && contractAddress) {
      _instance = new BronzeWeb3Service(rpcUrl, privateKey, contractAddress);
      console.log('[BF Web3] On-chain registration enabled.');
    } else {
      console.warn(
        '[BF Web3] On-chain registration disabled — set RPC_URL, PRIVATE_KEY, ' +
          'CONTRACT_ADDRESS to enable.',
      );
    }
  }
  return _instance;
}

/** Reset the singleton — for testing only. */
export function _resetWeb3ServiceForTest(): void {
  _instance = null;
  _initialized = false;
}
