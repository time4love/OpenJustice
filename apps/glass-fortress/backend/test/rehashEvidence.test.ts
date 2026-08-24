// ---------------------------------------------------------------------------
// Moving forensic evidence onto the snapshot-derived identity.
//
// The previous fileHash hashed url + afterDate + deletedText + addedText, where
// the latter two are JSON of the classifier's extracted items — mostly model
// prose. Reclassification rewrites them, so five of seven anchored records could
// no longer be recomputed from the database. A content address you cannot
// recompute is a random database key with extra steps, which is exactly what
// hashing the diff UUID was rejected for.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    evidence: { findMany: jest.fn(), update: jest.fn() },
    thesisMention: { updateMany: jest.fn() },
  },
}));
const mockWeb3 = {
  isHashRegistered: jest.fn(),
  findRegisteringTxHash: jest.fn(),
  registerEvidenceHash: jest.fn(),
};
jest.mock('../src/services/Web3Service', () => ({
  Web3Service: jest.fn().mockImplementation(() => mockWeb3),
}));
jest.mock('../src/services/VectorStoreService', () => ({
  VectorStoreService: { create: jest.fn() },
}));

import { prisma } from '../src/lib/prisma';
import { Web3Service } from '../src/services/Web3Service';
import { VectorStoreService } from '../src/services/VectorStoreService';
import { rehashEvidence } from '../src/services/rehashEvidence';

const OLD = '0xold';

function record(over: Record<string, unknown> = {}) {
  return {
    id: 'ev-1',
    fileHash: OLD,
    summary: 'סיכום',
    status: 'CONFIRMED',
    onChainTxHash: '0xoldtx',
    urlVersionDiff: {
      trackedUrl: { url: 'https://corona.health.gov.il/vaccine-for-covid/' },
      beforeSnapshot: { waybackTimestamp: '20220805093544', contentHash: 'b' },
      afterSnapshot: { waybackTimestamp: '20220906232435', contentHash: 'a' },
    },
    ...over,
  };
}

function setup(rows: ReturnType<typeof record>[]) {
  (prisma.evidence.findMany as jest.Mock).mockResolvedValue(rows);
  (prisma.thesisMention.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockWeb3.isHashRegistered as jest.Mock).mockResolvedValue({ registered: false, evidenceId: 0n });
  (mockWeb3.registerEvidenceHash as jest.Mock).mockResolvedValue('0xnewtx');
  (VectorStoreService.create as jest.Mock).mockResolvedValue({ upsertEvidence: jest.fn() });
}

describe('rehashEvidence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes nothing and sends nothing on a dry run', async () => {
    setup([record()]);

    const r = await rehashEvidence({ dryRun: true });

    expect(r.rows).toHaveLength(1);
    expect(r.rehashed).toBe(0);
    expect(prisma.evidence.update).not.toHaveBeenCalled();
    expect(mockWeb3.registerEvidenceHash).not.toHaveBeenCalled();
  });

  it('anchors the new identity BEFORE writing it', async () => {
    // A failure must leave the row on its old hash with its old anchor — a stale
    // but consistent state — rather than on a new hash with nothing behind it,
    // which is the UNANCHORED_CONFIRMED condition this platform exists not to
    // produce.
    setup([record()]);
    (mockWeb3.registerEvidenceHash as jest.Mock).mockRejectedValue(new Error('gas'));

    const r = await rehashEvidence({ dryRun: false });

    expect(prisma.evidence.update).not.toHaveBeenCalled();
    expect(r.failed).toBe(1);
    expect(r.failures[0]?.reason).toBe('gas');
  });

  it('records the superseded identity and its anchor on the row', async () => {
    // The old anchor stays on-chain matching nothing derivable. An orphan with a
    // stated cause is a migration; one without is indistinguishable from
    // tampering.
    setup([record()]);

    await rehashEvidence({ dryRun: false });

    const data = (prisma.evidence.update as jest.Mock).mock.calls[0][0].data;
    expect(data.previousFileHash).toBe(OLD);
    expect(data.previousOnChainTxHash).toBe('0xoldtx');
    expect(data.onChainTxHash).toBe('0xnewtx');
    expect(data.fileHash).not.toBe(OLD);
  });

  it('moves thesis citations to the new hash', async () => {
    // Zero rows today. Done anyway: a migration that is only correct while a
    // table happens to be empty is a trap for whoever fills it.
    setup([record()]);

    await rehashEvidence({ dryRun: false });

    expect(prisma.thesisMention.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { type: 'EVIDENCE', refId: OLD } }),
    );
  });

  it('skips a record already on the snapshot-derived identity', async () => {
    // Re-running must be safe. The first pass computes the hash; the second finds
    // it already stored and does nothing.
    setup([record()]);
    const first = await rehashEvidence({ dryRun: true });
    setup([record({ fileHash: first.rows[0].newFileHash })]);

    const second = await rehashEvidence({ dryRun: false });

    expect(second.alreadyCurrent).toBe(1);
    expect(second.rehashed).toBe(0);
    expect(mockWeb3.registerEvidenceHash).not.toHaveBeenCalled();
  });

  it('recovers the tx when an interrupted run already registered the new hash', async () => {
    setup([record()]);
    (mockWeb3.isHashRegistered as jest.Mock).mockResolvedValue({ registered: true, evidenceId: 9n });
    (mockWeb3.findRegisteringTxHash as jest.Mock).mockResolvedValue('0xfound');

    const r = await rehashEvidence({ dryRun: false });

    expect(mockWeb3.registerEvidenceHash).not.toHaveBeenCalled();
    expect(r.rows[0].newTxHash).toBe('0xfound');
  });

  it('reports an unreachable chain as its own state, never as a clean run', async () => {
    setup([record()]);
    (Web3Service as unknown as jest.Mock).mockImplementationOnce(() => {
      throw new Error('RPC_URL not configured');
    });

    const r = await rehashEvidence({ dryRun: false });

    expect(r.chainAvailable).toBe(false);
    expect(r.rehashed).toBe(0);
  });
});
