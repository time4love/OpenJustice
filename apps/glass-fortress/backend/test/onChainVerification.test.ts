// ---------------------------------------------------------------------------
// LEVEL 3a — the check runs on the write path, and its verdict is STORED.
//
// The single property under test is the one §3 exists to protect: a check that
// could not be made must never be indistinguishable from a check that passed.
// This corpus already contains what the other outcome looks like — 5 of 7
// staging rows marked CONFIRMED with no anchor, unnoticed for two months,
// because nothing on the write path ever asked and nothing recorded that it
// had not.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    evidence: { findUnique: jest.fn() },
    urlSnapshot: { count: jest.fn() },
    integrityCheck: { create: jest.fn(), findFirst: jest.fn() },
  },
}));

const mockIsHashRegistered = jest.fn();
const mockConstructor = jest.fn();

jest.mock('../src/services/Web3Service', () => ({
  Web3Service: class {
    constructor() {
      mockConstructor();
    }
    isHashRegistered = mockIsHashRegistered;
  },
}));

import { IntegrityCheckSubject, IntegrityCheckVerdict } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { ON_CHAIN_CHECK_VERSION, ON_CHAIN_VERDICTS } from '../src/lib/onChainVerdict';
import {
  observeOnChainStatus,
  recordOnChainCheck,
  recordOnChainCheckNeverThrowing,
} from '../src/services/onChainVerification';

const HASH = `0x${'a'.repeat(64)}`;
const TX = `0x${'b'.repeat(64)}`;

const findUnique = prisma.evidence.findUnique as jest.Mock;
const countSnapshots = prisma.urlSnapshot.count as jest.Mock;
const createCheck = prisma.integrityCheck.create as jest.Mock;

/** The row the create call was handed. Fails loudly rather than returning undefined. */
function writtenRow(): {
  verdict: IntegrityCheckVerdict;
  verifierVersion: string;
  sourceStateHash: string;
  subjectType: IntegrityCheckSubject;
  subjectId: string;
  detail: Record<string, unknown>;
} {
  expect(createCheck).toHaveBeenCalledTimes(1);
  return (createCheck.mock.calls[0][0] as { data: ReturnType<typeof writtenRow> }).data;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConstructor.mockReturnValue(undefined);
  findUnique.mockResolvedValue(null);
  countSnapshots.mockResolvedValue(0);
  createCheck.mockResolvedValue({ id: 'check-1' });
});

const subject = {
  subjectType: IntegrityCheckSubject.EVIDENCE,
  subjectId: 'ev-1',
  fileHash: HASH,
};

describe('an unreachable chain is a verdict about the CHECK', () => {
  it('records UNAVAILABLE — never VERIFIED — when the RPC call fails', async () => {
    findUnique.mockResolvedValue({ status: 'CONFIRMED', onChainTxHash: TX });
    mockIsHashRegistered.mockRejectedValue(new Error('no backend is currently healthy'));

    const result = await recordOnChainCheck(subject);

    expect(result.verdict).toBe(IntegrityCheckVerdict.UNAVAILABLE);
    expect(result.onChainVerdict).toBeNull();
    expect(writtenRow().verdict).toBe(IntegrityCheckVerdict.UNAVAILABLE);
  });

  it('records UNAVAILABLE when the chain is not configured at all', async () => {
    // A misconfiguration and an unhealthy endpoint license the same decision —
    // decide nothing — and collapsing either into `registered: false` would let
    // a fake-CONFIRMED record read as verified against a chain nobody asked.
    mockConstructor.mockImplementation(() => {
      throw new Error('EVIDENCE_REGISTRY_ADDRESS is not set');
    });
    findUnique.mockResolvedValue({ status: 'CONFIRMED', onChainTxHash: TX });

    expect((await recordOnChainCheck(subject)).verdict).toBe(IntegrityCheckVerdict.UNAVAILABLE);
    expect(mockIsHashRegistered).not.toHaveBeenCalled();
  });

  it('says so in the explanation, rather than reporting the hash unregistered', async () => {
    mockIsHashRegistered.mockRejectedValue(new Error('boom'));
    const result = await recordOnChainCheck(subject);
    expect(result.explanation).toContain('not evidence that the hash is unregistered');
  });

  it('the observation carries no verdict field to misread', async () => {
    // The compiler enforces this; the test states it, because the property is
    // the reason the union exists rather than a nullable verdict.
    mockIsHashRegistered.mockRejectedValue(new Error('boom'));
    const observation = await observeOnChainStatus(HASH);
    expect(observation.reachable).toBe(false);
    expect('verdict' in observation).toBe(false);
  });
});

describe('what the stored row commits to', () => {
  beforeEach(() => {
    findUnique.mockResolvedValue({ status: 'CONFIRMED', onChainTxHash: TX });
    mockIsHashRegistered.mockResolvedValue({ registered: true, evidenceId: BigInt(7) });
  });

  it('stores the verifier version, so a rule change can find its own stale verdicts', async () => {
    await recordOnChainCheck(subject);
    expect(writtenRow().verifierVersion).toBe(ON_CHAIN_CHECK_VERSION);
  });

  it('stores a source-state hash of the claim it actually judged', async () => {
    await recordOnChainCheck(subject);
    expect(writtenRow().sourceStateHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('names the specific on-chain verdict in the detail, not just the coarse one', async () => {
    // §3: for a contradiction the detail IS the deliverable. A coarse
    // CONTRADICTED tells an operator something is wrong; only this says what.
    const result = await recordOnChainCheck(subject);
    expect(result.verdict).toBe(IntegrityCheckVerdict.VERIFIED);
    expect(writtenRow().detail.onChainVerdict).toBe(ON_CHAIN_VERDICTS.CONSISTENT);
  });

  it('records CONTRADICTED for a CONFIRMED record the registry has never seen', async () => {
    // The fake-CONFIRMED class, which is the reason this level exists.
    mockIsHashRegistered.mockResolvedValue({ registered: false, evidenceId: BigInt(0) });
    const result = await recordOnChainCheck(subject);

    expect(result.verdict).toBe(IntegrityCheckVerdict.CONTRADICTED);
    expect(result.onChainVerdict).toBe(ON_CHAIN_VERDICTS.UNANCHORED_CONFIRMED);
    expect(writtenRow().verdict).toBe(IntegrityCheckVerdict.CONTRADICTED);
  });
});

describe('the write path is never failed by its own verification', () => {
  it('returns null rather than throwing when the verdict cannot be stored', async () => {
    // The transaction is already spent when this runs. Throwing would report a
    // completed promotion as an error and invite a retry that reverts as a
    // duplicate — so the failure is surfaced as "not verified", never as a pass
    // and never as a rollback.
    findUnique.mockResolvedValue({ status: 'CONFIRMED', onChainTxHash: TX });
    mockIsHashRegistered.mockResolvedValue({ registered: true, evidenceId: BigInt(7) });
    createCheck.mockRejectedValue(new Error('database is down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(recordOnChainCheckNeverThrowing(subject)).resolves.toBeNull();
  });

  it('recordOnChainCheck itself DOES throw on a database failure', async () => {
    // The distinction matters: a check that cannot be stored has not been
    // performed, so the backfill and the audit — which have no spent
    // transaction to protect — must see the error rather than a quiet skip.
    findUnique.mockResolvedValue({ status: 'CONFIRMED', onChainTxHash: TX });
    mockIsHashRegistered.mockResolvedValue({ registered: true, evidenceId: BigInt(7) });
    createCheck.mockRejectedValue(new Error('database is down'));

    await expect(recordOnChainCheck(subject)).rejects.toThrow('database is down');
  });
});
