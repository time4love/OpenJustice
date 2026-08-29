// ---------------------------------------------------------------------------
// Confirming what each anchoring transaction actually registered.
//
// The question this pass asks is the one `auditOnChainAnchors` cannot: not "is
// this row's hash registered?" — which passes whenever SOME transaction
// registered it — but "did THIS transaction register it?". A row pointing at a
// transaction that anchored something else is invisible to the audit, and that
// is the fake-CONFIRMED shape the platform exists to make impossible.
//
// So the cases that matter here are the ones where the two answers DIVERGE.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    urlSnapshot: { findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
    evidence: { findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
  },
}));
const mockWeb3 = { readRegisteredHashes: jest.fn() };
jest.mock('../src/services/Web3Service', () => ({
  Web3Service: jest.fn().mockImplementation(() => mockWeb3),
}));

import { prisma } from '../src/lib/prisma';
import { confirmAnchors } from '../src/services/confirmAnchors';

const HASH = `0x${'a'.repeat(64)}`;
const OTHER = `0x${'b'.repeat(64)}`;

/** One unconfirmed capture claiming an anchor. `contentHash` is stored bare. */
function capture(contentHash = HASH.slice(2)) {
  return { id: 'snap-1', onChainTxHash: '0xtx', contentHash };
}

function setup(opts: { snapshots?: unknown[]; evidence?: unknown[] } = {}) {
  (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue(opts.snapshots ?? []);
  (prisma.evidence.findMany as jest.Mock).mockResolvedValue(opts.evidence ?? []);
  (prisma.urlSnapshot.count as jest.Mock).mockResolvedValue(0);
  (prisma.evidence.count as jest.Mock).mockResolvedValue(0);
}

beforeEach(() => jest.clearAllMocks());

describe('what the transaction says, not what the row expects', () => {
  it('CONFIRMS a row whose transaction registered exactly its hash', async () => {
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({
      kind: 'REGISTERED',
      hashes: [HASH],
      registryAddress: '0xreg',
    });

    const r = await confirmAnchors({ dryRun: false });

    expect(r.confirmed).toBe(1);
    expect(r.misanchored).toBe(0);
    expect(prisma.urlSnapshot.update).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
      data: { anchoredHash: HASH },
    });
  });

  it('compares across the 0x boundary — the stored forms genuinely differ', async () => {
    // `contentHash` is bare hex and the contract speaks bytes32. Comparing raw
    // is the same mismatch that made 83 anchorings silently no-op, and here it
    // would report every correct row as MISANCHORED.
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({
      kind: 'REGISTERED',
      hashes: [`0x${'A'.repeat(64)}`],
      registryAddress: '0xreg',
    });

    const r = await confirmAnchors({ dryRun: true });
    expect(r.confirmed).toBe(1);
  });

  it('finds a MISANCHORED row — the case the anchor audit cannot see', async () => {
    // The row carries HASH; its transaction registered OTHER. `isHashRegistered`
    // would answer "yes, HASH is registered" if any other transaction anchored
    // it, and the audit would report VERIFIED.
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({
      kind: 'REGISTERED',
      hashes: [OTHER],
      registryAddress: '0xreg',
    });

    const r = await confirmAnchors({ dryRun: false });

    expect(r.misanchored).toBe(1);
    expect(r.confirmed).toBe(0);
    // The OBSERVED hash is written, not suppressed. The column records what the
    // transaction registered; leaving it null would make an anchor that was
    // examined and found wrong look merely unexamined.
    expect(prisma.urlSnapshot.update).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
      data: { anchoredHash: OTHER },
    });
  });

  it('reports ANCHORED NOTHING and writes nothing — a real tx attesting to nothing', async () => {
    // What a transaction to a codeless address produces: a valid hash, a
    // successful transfer, no registration. There is no hash to record.
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({ kind: 'ANCHORED_NOTHING' });

    const r = await confirmAnchors({ dryRun: false });

    expect(r.anchoredNothing).toBe(1);
    expect(prisma.urlSnapshot.update).not.toHaveBeenCalled();
  });

  it('keeps NO RECEIPT separate from ANCHORED NOTHING', async () => {
    // One says the chain gave an answer; the other says it could not be asked.
    // Collapsing them would let an RPC outage read as a fabricated anchor, and
    // the reverse.
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({ kind: 'NO_RECEIPT' });

    const r = await confirmAnchors({ dryRun: false });

    expect(r.noReceipt).toBe(1);
    expect(r.anchoredNothing).toBe(0);
    expect(prisma.urlSnapshot.update).not.toHaveBeenCalled();
  });

  it('refuses to guess when several were registered and none is the row\u2019s', async () => {
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({
      kind: 'REGISTERED',
      hashes: [OTHER, `0x${'c'.repeat(64)}`],
      registryAddress: '0xreg',
    });

    const r = await confirmAnchors({ dryRun: false });

    expect(r.ambiguous).toBe(1);
    expect(prisma.urlSnapshot.update).not.toHaveBeenCalled();
  });

  it('picks the matching hash when a transaction registered several', async () => {
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({
      kind: 'REGISTERED',
      hashes: [OTHER, HASH],
      registryAddress: '0xreg',
    });

    const r = await confirmAnchors({ dryRun: true });
    expect(r.confirmed).toBe(1);
    expect(r.ambiguous).toBe(0);
  });
});

describe('a dry run is a complete measurement', () => {
  it('performs every chain read and writes nothing', async () => {
    // This is what makes "count production first" and "confirm and write in one
    // pass" the same operation rather than two.
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({
      kind: 'REGISTERED',
      hashes: [OTHER],
      registryAddress: '0xreg',
    });

    const r = await confirmAnchors({ dryRun: true });

    expect(mockWeb3.readRegisteredHashes).toHaveBeenCalledWith('0xtx');
    expect(r.misanchored).toBe(1);
    expect(r.rows[0]?.written).toBe(false);
    expect(prisma.urlSnapshot.update).not.toHaveBeenCalled();
  });
});

describe('both subject types', () => {
  it('confirms Evidence rows against their own transactions too', async () => {
    // `Evidence.fileHash` asserts identity and is read as though it also
    // asserted registration — true only because rehashEvidence happens to
    // register before it writes, which is a property of one function.
    setup({ evidence: [{ id: 'ev-1', onChainTxHash: '0xevtx', fileHash: HASH }] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({
      kind: 'REGISTERED',
      hashes: [HASH],
      registryAddress: '0xreg',
    });

    const r = await confirmAnchors({ dryRun: false });

    expect(r.confirmed).toBe(1);
    expect(prisma.evidence.update).toHaveBeenCalledWith({
      where: { id: 'ev-1' },
      data: { anchoredHash: HASH },
    });
  });
});

describe('the pass cannot report a clean corpus it never asked about', () => {
  it('constructs no chain client and reports nothing when there is nothing to confirm', async () => {
    setup();
    const r = await confirmAnchors({ dryRun: true });
    expect(r.examined).toBe(0);
    expect(mockWeb3.readRegisteredHashes).not.toHaveBeenCalled();
  });

  it('keeps the reason when one subject throws, and does not abort the pass', async () => {
    setup({ snapshots: [capture(), { ...capture(), id: 'snap-2' }] });
    mockWeb3.readRegisteredHashes
      .mockRejectedValueOnce(new Error('RPC down'))
      .mockResolvedValueOnce({ kind: 'REGISTERED', hashes: [HASH], registryAddress: '0xreg' });

    const r = await confirmAnchors({ dryRun: true });

    expect(r.failed).toBe(1);
    expect(r.failures[0]?.reason).toBe('RPC down');
    expect(r.confirmed).toBe(1);
  });
});
