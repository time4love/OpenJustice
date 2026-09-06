// ---------------------------------------------------------------------------
// Reading an on-chain evidence record WHOLE — hash, submitter, block time and
// category — from the registry's state.
//
// Until the rebuild, the only record read returned the timestamp, because the
// only caller wanted a block to search for a receipt. Evidence flows §8 makes
// state the attribution: the submitter and the category at an index are what
// the ledger explains and what ATTRIBUTED compares against, forever, where a
// receipt is readable only inside the RPC's retention horizon.
//
// Guarded like every other read: a codeless address answers `getEvidence` with
// nothing decodable, and the refusal must come from the deployment check, not
// from a decoding error that reads as an RPC hiccup.
// ---------------------------------------------------------------------------

// A module, not a script: without an import or export this file would share
// the global scope with web3RegistryGuard.test.ts and its identically named mocks.
export {};

const mockGetCode = jest.fn();
const mockGetNetwork = jest.fn().mockResolvedValue({ chainId: 84532n });
const mockGetEvidence = jest.fn();
const mockTotalEvidence = jest.fn();

jest.mock('ethers', () => {
  const actual = jest.requireActual<typeof import('ethers')>('ethers');
  return {
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: jest.fn().mockImplementation(() => ({
        getCode: mockGetCode,
        getNetwork: mockGetNetwork,
      })),
      Wallet: jest.fn().mockImplementation(() => ({ address: '0xAbCdEf0000000000000000000000000000000001' })),
      Contract: jest.fn().mockImplementation(() => ({
        getEvidence: mockGetEvidence,
        totalEvidence: mockTotalEvidence,
      })),
    },
  };
});

function loadService(): typeof import('../src/services/Web3Service') {
  return jest.requireActual<typeof import('../src/services/Web3Service')>(
    '../src/services/Web3Service',
  );
}

const HASH = `0x${'AB'.repeat(32)}`;
const SUBMITTER = '0x9DE2e74b3C5dAc4C3E2a0d18A5b76EEAc8989A28';

beforeEach(() => {
  jest.clearAllMocks();
  process.env['RPC_URL'] = 'https://rpc.test';
  process.env['REGISTRAR_PRIVATE_KEY'] = `0x${'11'.repeat(32)}`;
  process.env['EVIDENCE_REGISTRY_ADDRESS'] = '0x65b9a7acb45Aa05e7Ed207844F93a2b308373853';
  mockGetCode.mockResolvedValue('0x6080');
});

describe('Web3Service.readEvidenceRecord', () => {
  it('returns the whole struct, hash and submitter lower-cased, timestamp as a number', async () => {
    mockGetEvidence.mockResolvedValue({
      fileHash: HASH,
      submitter: SUBMITTER,
      timestamp: 1_756_000_123n,
      category: 'snapshot-anchor',
    });
    const { Web3Service } = loadService();

    const record = await new Web3Service().readEvidenceRecord(7n);

    expect(mockGetEvidence).toHaveBeenCalledWith(7n);
    expect(record).toEqual({
      fileHash: HASH.toLowerCase(),
      submitter: SUBMITTER.toLowerCase(),
      timestamp: 1_756_000_123,
      category: 'snapshot-anchor',
    });
  });

  it('refuses to read from a codeless registry, before any call reaches the contract', async () => {
    mockGetCode.mockResolvedValue('0x');
    const { Web3Service } = loadService();

    await expect(new Web3Service().readEvidenceRecord(0n)).rejects.toThrow(/No contract at/);
    expect(mockGetEvidence).not.toHaveBeenCalled();
  });

  it('names the registry and the registrar it reads as', () => {
    const { Web3Service } = loadService();
    const service = new Web3Service();
    expect(service.registryAddress).toBe('0x65b9a7acb45Aa05e7Ed207844F93a2b308373853');
    expect(service.registrarAddress).toBe('0xAbCdEf0000000000000000000000000000000001');
  });
});
