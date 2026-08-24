// ---------------------------------------------------------------------------
// Anchoring archived snapshots that were never anchored.
//
// UrlSnapshot.contentHash is the factual layer the forensic model argues from —
// "this page held exactly this text on this date" — and FINDING 9 justified
// removing auto-promotion partly on it: "nothing evidential is lost by waiting,
// because the snapshot anchor already froze the underlying fact at scan time."
//
// None of the 83 snapshots were anchored. The scan ran while the RPC answered
// "no backend is currently healthy", registerSnapshotOnChain is fire-and-forget
// with a swallowed rejection, and nothing ever asked afterwards.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: { urlSnapshot: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), count: jest.fn() } },
}));
const mockWeb3 = {
  isHashRegistered: jest.fn(),
  findRegisteringTxHash: jest.fn(),
  registerEvidenceHash: jest.fn(),
};
jest.mock('../src/services/Web3Service', () => ({
  Web3Service: jest.fn().mockImplementation(() => mockWeb3),
}));

import { prisma } from '../src/lib/prisma';
import { Web3Service } from '../src/services/Web3Service';
import { anchorSnapshots, countUnanchoredSnapshots } from '../src/services/anchorSnapshots';

function snap(id: string, contentHash = '0xaaa') {
  return { id, contentHash, snapshotDate: '2022-05-25' };
}

function setup(rows: ReturnType<typeof snap>[]) {
  (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue(rows);
  (prisma.urlSnapshot.findFirst as jest.Mock).mockResolvedValue(null);
  (mockWeb3.isHashRegistered as jest.Mock).mockResolvedValue({ registered: false, evidenceId: 0n });
  (mockWeb3.registerEvidenceHash as jest.Mock).mockResolvedValue('0xtx');
}

describe('anchorSnapshots', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends nothing on a dry run', async () => {
    setup([snap('s1')]);

    const r = await anchorSnapshots({ dryRun: true });

    expect(r.examined).toBe(1);
    expect(r.anchored).toBe(0);
    expect(mockWeb3.registerEvidenceHash).not.toHaveBeenCalled();
  });

  it('reports an unreachable chain as its own state, never as a clean run', async () => {
    // THE condition that produced the finding. A scan reported success while
    // every anchor attempt failed, because an unconfigured chain looked exactly
    // like nothing to do.
    setup([snap('s1')]);
    (Web3Service as unknown as jest.Mock).mockImplementationOnce(() => {
      throw new Error('RPC_URL not configured');
    });

    const r = await anchorSnapshots({ dryRun: false });

    expect(r.chainAvailable).toBe(false);
    expect(r.anchored).toBe(0);
  });

  it('anchors an unregistered snapshot', async () => {
    setup([snap('s1')]);

    const r = await anchorSnapshots({ dryRun: false });

    expect(mockWeb3.registerEvidenceHash).toHaveBeenCalledWith('0xaaa', expect.any(String), 'Wayback Snapshot');
    expect(prisma.urlSnapshot.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { onChainTxHash: '0xtx' } }),
    );
    expect(r.anchored).toBe(1);
  });

  it('0x-prefixes the contentHash for every chain call', async () => {
    // UrlSnapshot.contentHash is stored BARE (createHash(...).digest('hex')),
    // while Evidence.fileHash comes from ethers and carries the prefix. Passing
    // the bare form to a bytes32 argument throws INVALID_ARGUMENT — which is what
    // every snapshot anchoring attempt did, in every environment, from the first
    // scan onward. Nobody saw it because the call site swallowed the rejection,
    // so a permanent bug was indistinguishable from a chain that was down.
    setup([snap('s-bare', 'abc123def456')]);

    await anchorSnapshots({ dryRun: false });

    expect(mockWeb3.isHashRegistered).toHaveBeenCalledWith('0xabc123def456');
    expect(mockWeb3.registerEvidenceHash).toHaveBeenCalledWith(
      '0xabc123def456',
      expect.any(String),
      'Wayback Snapshot',
    );
  });

  it('records WHY each failure happened, not just how many', async () => {
    // The first version of this counted failures and discarded the reason — the
    // same defect it was written to repair. A count says something is wrong; only
    // the message says what, and without it the operator is where the scan was.
    setup([snap('s1')]);
    (mockWeb3.registerEvidenceHash as jest.Mock).mockRejectedValue(new Error('invalid BytesLike value'));

    const r = await anchorSnapshots({ dryRun: false });

    expect(r.failed).toBe(1);
    expect(r.failures).toEqual([{ snapshotId: 's1', reason: 'invalid BytesLike value' }]);
  });

  it('copies the tx from a byte-identical twin instead of re-registering', async () => {
    // Two captures with identical text share a contentHash and the registry
    // rejects a duplicate. The fact is already on-chain; only this row's pointer
    // is missing.
    setup([snap('s1')]);
    (prisma.urlSnapshot.findFirst as jest.Mock).mockResolvedValue({ onChainTxHash: '0xtwin' });

    const r = await anchorSnapshots({ dryRun: false });

    expect(mockWeb3.registerEvidenceHash).not.toHaveBeenCalled();
    expect(r.copiedFromTwin).toBe(1);
  });

  it('recovers the tx when an interrupted run already registered the hash', async () => {
    setup([snap('s1')]);
    (mockWeb3.isHashRegistered as jest.Mock).mockResolvedValue({ registered: true, evidenceId: 5n });
    (mockWeb3.findRegisteringTxHash as jest.Mock).mockResolvedValue('0xfound');

    const r = await anchorSnapshots({ dryRun: false });

    expect(mockWeb3.registerEvidenceHash).not.toHaveBeenCalled();
    expect(r.recovered).toBe(1);
  });

  it('counts a registered hash whose tx cannot be located as FAILED, not anchored', async () => {
    // Writing null would read as "never anchored" and invite a duplicate
    // registration, which reverts. Staying visible is the safe direction.
    setup([snap('s1')]);
    (mockWeb3.isHashRegistered as jest.Mock).mockResolvedValue({ registered: true, evidenceId: 5n });
    (mockWeb3.findRegisteringTxHash as jest.Mock).mockResolvedValue(null);

    const r = await anchorSnapshots({ dryRun: false });

    expect(r.failed).toBe(1);
    expect(prisma.urlSnapshot.update).not.toHaveBeenCalled();
  });

  it('keeps going when one snapshot fails, and counts it', async () => {
    setup([snap('s1'), snap('s2', '0xbbb')]);
    (mockWeb3.registerEvidenceHash as jest.Mock)
      .mockRejectedValueOnce(new Error('gas'))
      .mockResolvedValue('0xtx');

    const r = await anchorSnapshots({ dryRun: false });

    expect(r.failed).toBe(1);
    expect(r.anchored).toBe(1);
  });

  it('counts unanchored snapshots from state, not from a write-time tally', async () => {
    // A counter incremented where the write happens reports zero failures for a
    // run whose every attempt was swallowed. This asks the database instead.
    (prisma.urlSnapshot.count as jest.Mock).mockResolvedValue(83);

    expect(await countUnanchoredSnapshots()).toBe(83);
    expect((prisma.urlSnapshot.count as jest.Mock).mock.calls[0][0].where).toMatchObject({
      onChainTxHash: null,
    });
  });
});
