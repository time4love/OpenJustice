import { ethers } from 'ethers';
import { Web3Service } from '../src/services/Web3Service';

// ---------------------------------------------------------------------------
// findRegisteringTxHash — recovering the transaction that originally anchored a
// hash, after the contract rejects a re-registration with DuplicateEvidence.
//
// The bug this suite exists to prevent: the method used to call queryFilter
// with NO block range, i.e. genesis-to-head. Public RPC endpoints do not serve
// that — they cap eth_getLogs spans and reject anything wider. Verified against
// Base Sepolia (GF staging's own chain, 45.7M blocks): an unbounded query
// throws, ±5,000 blocks succeeds, ±10,000 throws.
//
// It survived review because every existing test mocks findRegisteringTxHash
// itself, and a hand-written provider mock answers any range you ask it for.
// So the fake provider below MODELS THE CAP: ask for too wide a span and it
// throws, exactly as the real endpoint does. A permissive mock would pass
// against the broken implementation and prove nothing.
// ---------------------------------------------------------------------------

/** Mirrors the ~10k-block eth_getLogs cap on Base's public endpoints. */
const RPC_MAX_BLOCK_SPAN = 10_000;

// Head and anchor are the real Base Sepolia values observed while diagnosing
// this bug, so the synthetic chain is the same size as the one that broke.
const HEAD_BLOCK = 45_764_268;
const ANCHOR_BLOCK = 45_565_973;
const GENESIS_TIMESTAMP = 1_690_000_000;
const BLOCK_TIME_SECONDS = 2;
// Derived, never hand-written: the fake provider below generates timestamps
// from this same formula, and a fixture whose timestamp and block number
// disagree would test the search against a chain that cannot exist.
const ANCHOR_TIMESTAMP = GENESIS_TIMESTAMP + ANCHOR_BLOCK * BLOCK_TIME_SECONDS;

const FILE_HASH = '0x56a466efa6c36d1a787c980534b0a43a9cd083cdecd42782e0214257242963d6';
const EXPECTED_TX = '0x0311c0f50f4a22a4f05bc4473e1766c635933b985fc97973c3ae7c27e5b53023';

interface Harness {
  service: Web3Service;
  queryFilter: jest.Mock;
  getBlock: jest.Mock;
}

/**
 * Builds a Web3Service wired to a provider/contract pair that behaves like a
 * real capped endpoint over a synthetic chain of uniform 2-second blocks.
 * Constructed via Object.create so the real constructor's env-var requirements
 * (RPC_URL, REGISTRAR_PRIVATE_KEY, EVIDENCE_REGISTRY_ADDRESS) stay out of a
 * unit test — the logic under test is the block-range arithmetic, not wiring.
 */
function buildHarness(
  options: {
    registered?: boolean;
    logAtBlock?: number | null;
    timestampAt?: (blockNumber: number) => number;
    anchorTimestamp?: number;
  } = {},
): Harness {
  const {
    registered = true,
    logAtBlock = ANCHOR_BLOCK,
    timestampAt = (n: number) => GENESIS_TIMESTAMP + n * BLOCK_TIME_SECONDS,
    anchorTimestamp = ANCHOR_TIMESTAMP,
  } = options;

  const getBlock = jest.fn(async (blockNumber: number) => ({
    number: blockNumber,
    timestamp: timestampAt(blockNumber),
  }));

  const queryFilter = jest.fn(async (_filter: unknown, from: number, to: number) => {
    if (from === undefined || to === undefined) {
      throw new Error('could not coalesce error');
    }
    if (to - from > RPC_MAX_BLOCK_SPAN) {
      throw new Error('could not coalesce error');
    }
    if (logAtBlock === null || logAtBlock < from || logAtBlock > to) return [];
    return [{ transactionHash: EXPECTED_TX, blockNumber: logAtBlock }];
  });

  const contract = {
    filters: { EvidenceSubmitted: (hash: string) => ({ topic: hash }) },
    queryFilter,
    getEvidence: jest.fn(async () => ({ timestamp: BigInt(anchorTimestamp) })),
    isRegistered: jest.fn(async () => [registered, 0n] as [boolean, bigint]),
  };

  const provider = {
    // Web3Service now refuses to touch a registry address that holds no code, so
    // the fake provider must answer getCode. Returning bytecode is the honest
    // stand-in here: this suite is about block-range arithmetic, and a codeless
    // registry is a separate concern covered by web3RegistryGuard.test.ts.
    getCode: jest.fn(async () => '0x60806040'),
    getNetwork: jest.fn(async () => ({ chainId: 84532n })),
    getBlockNumber: jest.fn(async () => HEAD_BLOCK),
    getBlock,
  };

  const service = Object.create(Web3Service.prototype) as Web3Service;
  Object.defineProperty(service, 'contract', { value: contract, writable: false });
  Object.defineProperty(service, 'provider', { value: provider, writable: false });

  return { service, queryFilter, getBlock };
}

describe('Web3Service.findRegisteringTxHash', () => {
  it('recovers the registering transaction hash from a capped endpoint', async () => {
    const { service } = buildHarness();

    await expect(service.findRegisteringTxHash(FILE_HASH)).resolves.toBe(EXPECTED_TX);
  });

  it('never asks for a block span the endpoint would reject', async () => {
    const { service, queryFilter } = buildHarness();

    await service.findRegisteringTxHash(FILE_HASH);

    expect(queryFilter).toHaveBeenCalled();
    for (const call of queryFilter.mock.calls) {
      const [, from, to] = call as [unknown, number, number];
      expect(typeof from).toBe('number');
      expect(typeof to).toBe('number');
      expect(to - from).toBeLessThanOrEqual(RPC_MAX_BLOCK_SPAN);
    }
  });

  it('locates the anchor block by timestamp rather than scanning from genesis', async () => {
    const { service, queryFilter, getBlock } = buildHarness();

    await service.findRegisteringTxHash(FILE_HASH);

    // Binary search over ~45.7M blocks is ~26 header reads; a linear or
    // chunked walk from genesis would be four orders of magnitude more.
    expect(getBlock.mock.calls.length).toBeLessThan(64);

    const [, from, to] = queryFilter.mock.calls[0] as [unknown, number, number];
    expect(from).toBeLessThanOrEqual(ANCHOR_BLOCK);
    expect(to).toBeGreaterThanOrEqual(ANCHOR_BLOCK);
  });

  it('still finds the anchor on an irregular chain where interpolation guesses badly', async () => {
    // The bracket is seeded by assuming a uniform mean block time. Here that
    // assumption is deliberately false — the first 90% of the chain ticks 20x
    // faster than the last 10% — so the interpolated estimate lands nowhere
    // near the anchor and the geometric widening has to rescue it. The search
    // must remain exact: a bad estimate may cost extra reads, never a wrong
    // answer, or this optimisation would have traded correctness for latency.
    const KNEE = Math.floor(HEAD_BLOCK * 0.9);
    const timestampAt = (n: number) =>
      n <= KNEE ? GENESIS_TIMESTAMP + n : GENESIS_TIMESTAMP + KNEE + (n - KNEE) * 20;

    const { service, queryFilter } = buildHarness({
      timestampAt,
      anchorTimestamp: timestampAt(ANCHOR_BLOCK),
    });

    await expect(service.findRegisteringTxHash(FILE_HASH)).resolves.toBe(EXPECTED_TX);

    for (const call of queryFilter.mock.calls) {
      const [, from, to] = call as [unknown, number, number];
      expect(to - from).toBeLessThanOrEqual(RPC_MAX_BLOCK_SPAN);
    }
  });

  it('returns null without querying logs when the hash is not registered', async () => {
    const { service, queryFilter } = buildHarness({ registered: false });

    await expect(service.findRegisteringTxHash(FILE_HASH)).resolves.toBeNull();
    expect(queryFilter).not.toHaveBeenCalled();
  });

  it('returns null when the hash is registered but no event is found', async () => {
    // Defensive branch: callers must treat null as "cannot be confirmed" and
    // must never mark a record CONFIRMED without a real transaction hash.
    const { service } = buildHarness({ logAtBlock: null });

    await expect(service.findRegisteringTxHash(FILE_HASH)).resolves.toBeNull();
  });

  it('clamps the window at the genesis block for a very early anchor', async () => {
    const { service, queryFilter } = buildHarness({ logAtBlock: 3 });
    const early = Object.create(Web3Service.prototype) as Web3Service;
    Object.defineProperty(early, 'provider', {
      value: {
        getCode: async () => '0x60806040',
        getNetwork: async () => ({ chainId: 84532n }),
        getBlockNumber: async () => HEAD_BLOCK,
        getBlock: async (n: number) => ({ number: n, timestamp: GENESIS_TIMESTAMP + n * BLOCK_TIME_SECONDS }),
      },
    });
    Object.defineProperty(early, 'contract', {
      value: {
        filters: { EvidenceSubmitted: (hash: string) => ({ topic: hash }) },
        queryFilter,
        getEvidence: async () => ({ timestamp: BigInt(GENESIS_TIMESTAMP + 6) }),
        isRegistered: async () => [true, 0n] as [boolean, bigint],
      },
    });

    await expect(early.findRegisteringTxHash(FILE_HASH)).resolves.toBe(EXPECTED_TX);

    const [, from] = queryFilter.mock.calls[0] as [unknown, number, number];
    expect(from).toBe(0);
  });

  it('pads the bytes32 hash before filtering, matching the contract topic', async () => {
    const shortHash = '0xabcd';
    const { service, queryFilter } = buildHarness();

    await service.findRegisteringTxHash(shortHash);

    const [filter] = queryFilter.mock.calls[0] as [{ topic: string }];
    expect(filter.topic).toBe(ethers.zeroPadValue(shortHash, 32));
  });
});
