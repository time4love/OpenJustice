// ---------------------------------------------------------------------------
// Refusing to touch an address that holds no contract.
//
// The failure being guarded does not look like a failure: a transaction to a
// codeless address SUCCEEDS, returns a valid txHash, and the promotion path then
// marks the evidence CONFIRMED with that hash as proof of anchoring. A real
// transaction, a real hash, anchoring nothing.
//
// Found live on 2026-08-26: the local production env file held the Hardhat
// default address 0x5FbDB231… with no contract at it on Base mainnet.
// ---------------------------------------------------------------------------

const mockGetCode = jest.fn();
const mockGetNetwork = jest.fn().mockResolvedValue({ chainId: 8453n });
const mockSubmit = jest.fn();
const mockIsRegistered = jest.fn();

jest.mock('ethers', () => {
  const actual = jest.requireActual<typeof import('ethers')>('ethers');
  return {
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: jest.fn().mockImplementation(() => ({
        getCode: mockGetCode,
        getNetwork: mockGetNetwork,
      })),
      Wallet: jest.fn().mockImplementation(() => ({ address: '0xwallet' })),
      Contract: jest.fn().mockImplementation(() => ({
        submit: mockSubmit,
        isRegistered: mockIsRegistered,
      })),
      zeroPadValue: actual.ethers.zeroPadValue,
      ZeroAddress: actual.ethers.ZeroAddress,
    },
  };
});

const HASH = `0x${'ab'.repeat(32)}`;

function loadService(): typeof import('../src/services/Web3Service') {
  return jest.requireActual<typeof import('../src/services/Web3Service')>(
    '../src/services/Web3Service',
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env['RPC_URL'] = 'https://rpc.test';
  process.env['REGISTRAR_PRIVATE_KEY'] = `0x${'11'.repeat(32)}`;
  process.env['EVIDENCE_REGISTRY_ADDRESS'] = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  mockGetNetwork.mockResolvedValue({ chainId: 8453n });
});

describe('Web3Service refuses a codeless registry', () => {
  it('does NOT send a transaction when the address holds no contract', async () => {
    mockGetCode.mockResolvedValue('0x');
    const { Web3Service } = loadService();

    await expect(
      new Web3Service().registerEvidenceHash(HASH, '0x0', 'cat'),
    ).rejects.toThrow(/No contract at EVIDENCE_REGISTRY_ADDRESS/u);

    // The whole point: a tx to a codeless address would have SUCCEEDED.
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('names the address and the chain, so the misconfiguration is actionable', async () => {
    mockGetCode.mockResolvedValue('0x');
    const { Web3Service } = loadService();

    await expect(
      new Web3Service().registerEvidenceHash(HASH, '0x0', 'cat'),
    ).rejects.toThrow(/0x5FbDB2315678afecb367f032d93F642f64180aa3.*8453/su);
  });

  it('guards READS too — a codeless address reports "not registered"', async () => {
    // Which would tell check_on_chain_status the hash is safe to promote,
    // feeding the same disaster from the other end.
    mockGetCode.mockResolvedValue('0x');
    const { Web3Service } = loadService();

    await expect(new Web3Service().isHashRegistered(HASH)).rejects.toThrow(
      /No contract at EVIDENCE_REGISTRY_ADDRESS/u,
    );
    expect(mockIsRegistered).not.toHaveBeenCalled();
  });

  it('proceeds normally when a contract is present', async () => {
    mockGetCode.mockResolvedValue('0x60806040');
    mockIsRegistered.mockResolvedValue([true, 19n]);
    const { Web3Service } = loadService();

    await expect(new Web3Service().isHashRegistered(HASH)).resolves.toEqual({
      registered: true,
      evidenceId: 19n,
    });
  });

  it('checks once per instance, not once per call', async () => {
    mockGetCode.mockResolvedValue('0x60806040');
    mockIsRegistered.mockResolvedValue([false, 0n]);
    const { Web3Service } = loadService();
    const svc = new Web3Service();

    await svc.isHashRegistered(HASH);
    await svc.isHashRegistered(HASH);
    await svc.isHashRegistered(HASH);

    // A per-call eth_getCode would add a round trip to every anchor check.
    expect(mockGetCode).toHaveBeenCalledTimes(1);
  });

  it('does not cache a transient RPC error as a permanent refusal', async () => {
    mockGetCode.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValue('0x60806040');
    mockIsRegistered.mockResolvedValue([true, 1n]);
    const { Web3Service } = loadService();
    const svc = new Web3Service();

    await expect(svc.isHashRegistered(HASH)).rejects.toThrow(/ECONNRESET/u);
    // A cached failure would wedge the process into refusing every later call.
    await expect(svc.isHashRegistered(HASH)).resolves.toEqual({ registered: true, evidenceId: 1n });
  });
});
