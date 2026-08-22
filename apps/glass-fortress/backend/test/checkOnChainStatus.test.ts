// ---------------------------------------------------------------------------
// check_on_chain_status — verdict logic.
//
// The verdicts this tool returns are the only automated way to detect a record
// asserting CONFIRMED without a real anchor. A 2026-08-20 audit found 5 such
// rows on staging. Every verdict therefore gets a test: an unasserted branch
// here is a class of silent evidentiary failure that nothing else catches.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: { evidence: { findUnique: jest.fn() } },
}));

const mockIsHashRegistered = jest.fn();
const mockFindRegisteringTxHash = jest.fn();
const mockConstructor = jest.fn();

jest.mock('../src/services/Web3Service', () => ({
  Web3Service: class {
    constructor() {
      mockConstructor();
    }
    isHashRegistered = mockIsHashRegistered;
    findRegisteringTxHash = mockFindRegisteringTxHash;
  },
}));

import { prisma } from '../src/lib/prisma';
import { checkOnChainStatusHandler } from '../src/mcp/tools/checkOnChainStatus';

const HASH = `0x${'a'.repeat(64)}`;
const TX = `0x${'b'.repeat(64)}`;

const findUnique = prisma.evidence.findUnique as jest.Mock;

interface Verdict {
  verdict: string;
  safeToPromote: boolean;
  consistent: boolean;
  database: { inVault: boolean; status: string | null; onChainTxHash: string | null };
  chain: {
    registered: boolean;
    registryEvidenceId: string | null;
    recoveredTxHash?: string | null;
    recoveryError?: string;
  };
  explanation: string;
  error?: string;
}

async function run(
  record: { id: string; status: string; onChainTxHash: string | null } | null,
  registered: boolean,
  opts?: { recoverTxHash?: boolean },
): Promise<Verdict> {
  findUnique.mockResolvedValue(record);
  mockIsHashRegistered.mockResolvedValue({ registered, evidenceId: BigInt(7) });
  return JSON.parse(await checkOnChainStatusHandler({ fileHash: HASH, ...opts })) as Verdict;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConstructor.mockReturnValue(undefined);
});

describe('check_on_chain_status', () => {
  it('CONSISTENT — confirmed, registered, tx recorded', async () => {
    const r = await run({ id: 'e1', status: 'CONFIRMED', onChainTxHash: TX }, true);

    expect(r.verdict).toBe('CONSISTENT');
    expect(r.consistent).toBe(true);
    expect(r.safeToPromote).toBe(false);
    expect(r.chain.registryEvidenceId).toBe('7');
  });

  it('UNANCHORED_CONFIRMED — the fake-CONFIRMED class the audit found', async () => {
    const r = await run({ id: 'e2', status: 'CONFIRMED', onChainTxHash: TX }, false);

    expect(r.verdict).toBe('UNANCHORED_CONFIRMED');
    expect(r.consistent).toBe(false);
    expect(r.safeToPromote).toBe(false);
  });

  it('UNANCHORED_CONFIRMED even when the row records no tx hash at all', async () => {
    const r = await run({ id: 'e3', status: 'CONFIRMED', onChainTxHash: null }, false);

    expect(r.verdict).toBe('UNANCHORED_CONFIRMED');
  });

  it('MISSING_TX_HASH — anchored on-chain but the anchor cannot be cited', async () => {
    const r = await run({ id: 'e4', status: 'CONFIRMED', onChainTxHash: null }, true);

    expect(r.verdict).toBe('MISSING_TX_HASH');
    expect(r.consistent).toBe(false);
  });

  it('PENDING_UNREGISTERED — the only state that is safe to promote', async () => {
    const r = await run({ id: 'e5', status: 'PENDING_REVIEW', onChainTxHash: null }, false);

    expect(r.verdict).toBe('PENDING_UNREGISTERED');
    expect(r.safeToPromote).toBe(true);
    expect(r.consistent).toBe(true);
  });

  it('PENDING_BUT_ANCHORED — promotion would revert as a duplicate', async () => {
    const r = await run({ id: 'e6', status: 'PENDING_REVIEW', onChainTxHash: null }, true);

    expect(r.verdict).toBe('PENDING_BUT_ANCHORED');
    expect(r.safeToPromote).toBe(false);
    expect(r.consistent).toBe(false);
  });

  it('NOT_IN_VAULT — reports the chain answer for an orphaned anchor', async () => {
    const r = await run(null, true);

    expect(r.verdict).toBe('NOT_IN_VAULT');
    expect(r.database.inVault).toBe(false);
    expect(r.chain.registered).toBe(true);
  });

  it('recovers the tx hash only when asked, and only when one is missing', async () => {
    mockFindRegisteringTxHash.mockResolvedValue(TX);
    const r = await run({ id: 'e7', status: 'CONFIRMED', onChainTxHash: null }, true, {
      recoverTxHash: true,
    });

    expect(r.chain.recoveredTxHash).toBe(TX);
    expect(mockFindRegisteringTxHash).toHaveBeenCalledWith(HASH);
  });

  it('does not scan logs when the row already records a tx hash', async () => {
    await run({ id: 'e8', status: 'CONFIRMED', onChainTxHash: TX }, true, { recoverTxHash: true });

    expect(mockFindRegisteringTxHash).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Regression: a CONFIGURED but unreachable chain.
  //
  // The first real call against a real endpoint returned an ethers
  // CALL_EXCEPTION ("missing revert data") because the public RPC answered
  // "no backend is currently healthy". The constructor succeeded, so the
  // original constructor-only guard did not catch it and the raw exception
  // escaped from a tool that promises a verdict.
  // -------------------------------------------------------------------------
  it('a reachable-but-failing contract call is CHAIN_UNAVAILABLE, not a verdict', async () => {
    findUnique.mockResolvedValue({ id: 'e10', status: 'PENDING_REVIEW', onChainTxHash: null });
    mockIsHashRegistered.mockRejectedValue(
      new Error('missing revert data (action="call", code=CALL_EXCEPTION)'),
    );

    const r = JSON.parse(await checkOnChainStatusHandler({ fileHash: HASH })) as Verdict;

    expect(r.error).toBe('CHAIN_UNAVAILABLE');
    expect(r.verdict).toBeUndefined();
    // The trap: this row IS pending and unregistered in the database, so a
    // naive implementation would happily call it safe to promote on no
    // evidence at all.
    expect(r.safeToPromote).toBeUndefined();
  });

  it('a failed tx-hash recovery is annotated, never reported as "none found"', async () => {
    mockFindRegisteringTxHash.mockRejectedValue(new Error('eth_getLogs range rejected'));
    const r = await run({ id: 'e11', status: 'CONFIRMED', onChainTxHash: null }, true, {
      recoverTxHash: true,
    });

    // The verdict stands — only the convenience lookup failed.
    expect(r.verdict).toBe('MISSING_TX_HASH');
    expect(r.chain.recoveredTxHash).toBeNull();
    expect(r.chain.recoveryError).toContain('eth_getLogs');
  });

  it('an unreachable chain is an error, never a "not registered" verdict', async () => {
    // Reporting CHAIN_UNAVAILABLE as unregistered would read as a definitive
    // negative and license a duplicate promotion.
    mockConstructor.mockImplementation(() => {
      throw new Error('RPC_URL environment variable is not set.');
    });
    findUnique.mockResolvedValue({ id: 'e9', status: 'CONFIRMED', onChainTxHash: TX });

    const r = JSON.parse(await checkOnChainStatusHandler({ fileHash: HASH })) as Verdict;

    expect(r.error).toBe('CHAIN_UNAVAILABLE');
    expect(r.verdict).toBeUndefined();
  });
});
