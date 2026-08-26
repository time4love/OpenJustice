const getNetwork = jest.fn();
const getCode = jest.fn();

jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: class {
      getNetwork = getNetwork;
      getCode = getCode;
    },
  },
}));

import { readChainIdentity, EXPECTED_CHAIN_ID } from '../src/lib/chainIdentity';

const REGISTRY = '0x0000000000000000000000000000000000000abc';
const env = (extra: Record<string, string | undefined> = {}) => ({
  RPC_URL: 'https://rpc.example/',
  EVIDENCE_REGISTRY_ADDRESS: REGISTRY,
  ...extra,
});

beforeEach(() => {
  getNetwork.mockReset();
  getCode.mockReset();
});

describe('EXPECTED_CHAIN_ID', () => {
  // Asserted by value so that redeploying the registry to a different chain is a
  // deliberate edit here with a failing test to explain, never a silent change
  // that makes get_environment report CONFLICT against reality.
  it('pins production to Base mainnet and staging to Base Sepolia', () => {
    expect(EXPECTED_CHAIN_ID.production).toBe(8453);
    expect(EXPECTED_CHAIN_ID.staging).toBe(84532);
  });

  it('never maps two environments to the same chain', () => {
    expect(EXPECTED_CHAIN_ID.production).not.toBe(EXPECTED_CHAIN_ID.staging);
  });
});

describe('readChainIdentity', () => {
  it('reports the chain and that the registry holds code', async () => {
    getNetwork.mockResolvedValue({ chainId: 8453n });
    getCode.mockResolvedValue('0x60806040');

    expect(await readChainIdentity(env())).toEqual({
      reachable: true,
      chainId: 8453,
      registryAddress: REGISTRY,
      registryDeployed: true,
    });
  });

  it('reports a codeless registry address rather than throwing', async () => {
    // The most dangerous configuration this platform has had: a transaction to a
    // codeless address SUCCEEDS and returns a valid hash while anchoring nothing.
    // It must surface as a finding a caller can read, not as a tool error.
    getNetwork.mockResolvedValue({ chainId: 8453n });
    getCode.mockResolvedValue('0x');

    const result = await readChainIdentity(env());

    expect(result).toMatchObject({ reachable: true, registryDeployed: false });
  });

  it('degrades to unreachable when the RPC fails, and never throws', async () => {
    getNetwork.mockRejectedValue(new Error('ECONNREFUSED'));
    getCode.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await readChainIdentity(env());

    expect(result.reachable).toBe(false);
    expect(result).toMatchObject({ registryAddress: REGISTRY });
  });

  it('reports missing configuration as unreachable, not as a crash', async () => {
    await expect(readChainIdentity(env({ RPC_URL: undefined }))).resolves.toMatchObject({
      reachable: false,
    });
    await expect(
      readChainIdentity(env({ EVIDENCE_REGISTRY_ADDRESS: undefined })),
    ).resolves.toMatchObject({ reachable: false, registryAddress: null });
  });
});
