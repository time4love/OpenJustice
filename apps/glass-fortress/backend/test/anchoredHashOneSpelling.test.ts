// ---------------------------------------------------------------------------
// THE SEAM BETWEEN THE TWO WRITERS OF `anchoredHash`.
//
// `anchorSnapshots` writes the column when a capture is anchored.
// `confirmAnchors` writes it again when the transaction's log is read. A third
// piece of code — `capturesAnchoredBy` — joins them by SQL equality.
//
// Until 2026-08-30 the two writers disagreed: bare hex from the write path,
// `0x`-prefixed from the log via ethers. EVERY EXISTING TEST PASSED, because
// each writer is internally consistent and each suite exercises one writer. The
// defect lived only in the seam, and only a real execution crossed it — the
// Level 3 clause 1 positive control, which anchored seven captures correctly and
// then watched all seven audit STALE with `VERIFIED` unreachable for every
// snapshot that has ever existed. `docs/gf-positive-control-2026-08-30.md`.
//
// So this file tests neither writer. It tests that WHAT ONE WRITER STORES, THE
// LOOKUP FINDS — for both writers, and for every spelling the chain can hand us.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    urlSnapshot: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
    evidence: { findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
  },
}));
const mockWeb3 = {
  readRegisteredHashes: jest.fn(),
  isHashRegistered: jest.fn(),
  lookupRegisteringTx: jest.fn(),
  findRegisteringTxHash: jest.fn(),
  registerEvidenceHash: jest.fn(),
};
jest.mock('../src/services/Web3Service', () => ({
  Web3Service: jest.fn().mockImplementation(() => mockWeb3),
}));
jest.mock('../src/services/onChainVerification', () => ({
  recordOnChainCheckNeverThrowing: jest.fn().mockResolvedValue(undefined),
}));

import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { anchorOneSnapshot } from '../src/services/anchorSnapshots';
import { confirmAnchors } from '../src/services/confirmAnchors';
import { capturesAnchoredBy } from '../src/lib/anchoredCaptureHash';

/** The document hash a capture carries, as the database stores it: bare hex. */
const DOCUMENT = 'a'.repeat(64);

beforeEach(() => jest.clearAllMocks());

/**
 * Does the `where` fragment `capturesAnchoredBy` builds match a row holding
 * `value` in `anchoredHash`?
 *
 * Evaluated here rather than by hitting Postgres, because the fragment is
 * data — and reading it is exactly what nobody did. The first arm is the one
 * that matters: it is the only arm a CONFIRMED row can satisfy, since the second
 * requires `anchoredHash: null`.
 */
function lookupMatches(where: Prisma.UrlSnapshotWhereInput, value: string): boolean {
  const arms = (where.OR ?? []) as { anchoredHash?: string | null; documentHash?: string }[];
  return arms.some((arm) => arm.anchoredHash === value);
}

/** What `anchorOneSnapshot` actually wrote to `anchoredHash`. */
async function whatTheWritePathStored(): Promise<string> {
  (prisma.urlSnapshot.findFirst as jest.Mock).mockResolvedValue(null); // no twin
  mockWeb3.isHashRegistered.mockResolvedValue({ registered: false });
  mockWeb3.registerEvidenceHash.mockResolvedValue('0xtx');

  await anchorOneSnapshot(mockWeb3 as never, 'snap-1', { documentHash: DOCUMENT });

  const call = (prisma.urlSnapshot.update as jest.Mock).mock.calls.at(0) as
    | [{ data: { anchoredHash: string } }]
    | undefined;
  if (!call) throw new Error('the write path stored nothing — the fixture is wrong, not the code');
  return call[0].data.anchoredHash;
}

/** What `confirmAnchors` wrote to `anchoredHash`, given the chain returned `observed`. */
async function whatConfirmStored(observed: string): Promise<string> {
  (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue([
    { id: 'snap-1', onChainTxHash: '0xtx', documentHash: DOCUMENT, contentHash: 'c'.repeat(64) },
  ]);
  (prisma.evidence.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.urlSnapshot.count as jest.Mock).mockResolvedValue(0);
  (prisma.evidence.count as jest.Mock).mockResolvedValue(0);
  mockWeb3.readRegisteredHashes.mockResolvedValue({
    kind: 'REGISTERED',
    hashes: [observed],
    registryAddress: '0xreg',
  });

  await confirmAnchors({ dryRun: false });

  const call = (prisma.urlSnapshot.update as jest.Mock).mock.calls.at(0) as
    | [{ data: { anchoredHash: string } }]
    | undefined;
  if (!call) throw new Error('confirmAnchors stored nothing — the fixture is wrong, not the code');
  return call[0].data.anchoredHash;
}

describe('one spelling for anchoredHash, across both writers', () => {
  it('the write path stores a value its own lookup finds', async () => {
    const storedValue = await whatTheWritePathStored();
    expect(lookupMatches(capturesAnchoredBy(DOCUMENT), storedValue)).toBe(true);
  });

  it('confirmAnchors stores a value the lookup finds — THE CASE THAT WAS BROKEN', async () => {
    // `0x`-prefixed is exactly what ethers returns from the EvidenceSubmitted
    // log, so this is the real production input rather than a contrived one.
    const storedValue = await whatConfirmStored(`0x${DOCUMENT}`);
    expect(lookupMatches(capturesAnchoredBy(DOCUMENT), storedValue)).toBe(true);
  });

  it('BOTH WRITERS STORE THE SAME VALUE for the same fact', async () => {
    // The seam itself. A capture anchored under `documentHash` and then confirmed
    // against a transaction that registered `documentHash` is ONE fact, and the
    // column must not hold two spellings of it — a lookup cannot normalise the
    // column side of a SQL comparison.
    const fromWritePath = await whatTheWritePathStored();
    jest.clearAllMocks();
    const fromConfirm = await whatConfirmStored(`0x${DOCUMENT}`);
    expect(fromConfirm).toBe(fromWritePath);
  });

  it('normalises every spelling the chain can hand us, including upper case', async () => {
    // `capturesAnchoredBy` did not lower-case while `attestationOf` did, so the
    // module built to end duplicate implementations held two that disagreed.
    const storedValue = await whatConfirmStored(`0X${DOCUMENT.toUpperCase()}`);
    expect(storedValue).toBe(DOCUMENT);
    expect(lookupMatches(capturesAnchoredBy(DOCUMENT), storedValue)).toBe(true);
  });

  it('DETECTS the defect it was written for — proven against the old behaviour', async () => {
    // Without this, the three assertions above could all pass against a lookup
    // that matched anything, and report a fixed codebase forever. This pins that
    // the OLD stored form — `0x`-prefixed, as confirmAnchors used to write it —
    // genuinely does NOT match, so the checks are load-bearing.
    expect(lookupMatches(capturesAnchoredBy(DOCUMENT), `0x${DOCUMENT}`)).toBe(false);
  });
});
