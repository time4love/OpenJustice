import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

// ---------------------------------------------------------------------------
// copy-only: the run must be INCAPABLE of spending, not merely disinclined.
//
// Production holds 71 rows whose text is anchored under an earlier twin. Filling
// those pointers is safe; publishing a text anchored nowhere costs real money on
// Base mainnet and is a decision for a person. The guarantee has to be
// structural, because "it will not encounter one" is a claim about today's data,
// and the tool must not depend on today's data being what someone measured.
// ---------------------------------------------------------------------------
describe('copy-only', () => {
  it('copies a twin pointer without touching the chain at all', async () => {
    setup([snap('s1')]);
    (prisma.urlSnapshot.findFirst as jest.Mock).mockResolvedValue({ onChainTxHash: '0xtwin' });

    const r = await anchorSnapshots({ dryRun: false, copyOnly: true });

    expect(r.copiedFromTwin).toBe(1);
    expect(mockWeb3.registerEvidenceHash).not.toHaveBeenCalled();
    // Not even a read: a twin copy is pure database work.
    expect(mockWeb3.isHashRegistered).not.toHaveBeenCalled();
  });

  it('REFUSES to register a text anchored nowhere, and reports it instead', async () => {
    setup([snap('s1', 'lonely')]);

    const r = await anchorSnapshots({ dryRun: false, copyOnly: true });

    expect(mockWeb3.registerEvidenceHash).not.toHaveBeenCalled();
    expect(r.anchored).toBe(0);
    expect(r.needsRegistration).toEqual([{ snapshotId: 's1', contentHash: 'lonely' }]);
    // Not a failure. The run promised not to spend, and did not spend.
    expect(r.failed).toBe(0);
  });

  it('the SAME input registers with copy-only off — proving the flag is what stops it', async () => {
    // Without this pair the refusal above could pass because the fixture never
    // reached the register branch at all.
    setup([snap('s1', 'lonely')]);

    const r = await anchorSnapshots({ dryRun: false });

    expect(mockWeb3.registerEvidenceHash).toHaveBeenCalledTimes(1);
    expect(r.anchored).toBe(1);
    expect(r.needsRegistration).toEqual([]);
  });

  it('still recovers a pointer for a hash the registry already holds — that spends nothing', async () => {
    setup([snap('s1')]);
    (mockWeb3.isHashRegistered as jest.Mock).mockResolvedValue({ registered: true, evidenceId: 4n });
    (mockWeb3.findRegisteringTxHash as jest.Mock).mockResolvedValue('0xfound');

    const r = await anchorSnapshots({ dryRun: false, copyOnly: true });

    expect(r.recovered).toBe(1);
    expect(mockWeb3.registerEvidenceHash).not.toHaveBeenCalled();
  });

  it('repairs twins with no chain configured at all, instead of aborting', async () => {
    // The measured production case: every null has an anchored twin, so the whole
    // repair completes with no RPC endpoint. Aborting would demand a credential
    // the work does not need.
    setup([snap('s1')]);
    (prisma.urlSnapshot.findFirst as jest.Mock).mockResolvedValue({ onChainTxHash: '0xtwin' });
    (Web3Service as unknown as jest.Mock).mockImplementationOnce(() => {
      throw new Error('RPC_URL missing');
    });

    const r = await anchorSnapshots({ dryRun: false, copyOnly: true });

    expect(r.chainAvailable).toBe(false);
    expect(r.copiedFromTwin).toBe(1);
    expect(r.failed).toBe(0);
  });

  it('without a chain and without a twin, says UNKNOWN rather than "needs registration"', async () => {
    // Collapsing the two would report "this costs money" for a row that may
    // already be anchored — an unnecessary spend, the mirror of the unnecessary
    // repair FINDING 95 warned about.
    setup([snap('s1')]);
    (Web3Service as unknown as jest.Mock).mockImplementationOnce(() => {
      throw new Error('RPC_URL missing');
    });

    const r = await anchorSnapshots({ dryRun: false, copyOnly: true });

    expect(r.chainNotConsulted).toBe(1);
    expect(r.needsRegistration).toEqual([]);
    expect(r.failed).toBe(0);
  });

  it('a chainless run WITHOUT copy-only still aborts, as it always did', async () => {
    setup([snap('s1')]);
    (Web3Service as unknown as jest.Mock).mockImplementationOnce(() => {
      throw new Error('RPC_URL missing');
    });

    const r = await anchorSnapshots({ dryRun: false });

    expect(r.chainAvailable).toBe(false);
    expect(r.copiedFromTwin).toBe(0);
    expect(r.failures).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The scan and the repair must not drift apart again.
//
// registerSnapshotOnChain in WaybackScraper called registerEvidenceHash
// unconditionally. For a capture whose text a twin had already anchored, the
// registry rejected the duplicate, the rejection was logged as a failure, and
// the row kept its null forever — while the fact was on-chain the whole time.
// Production still holds 71 rows in that state, and every one of them made
// check_on_chain_status report a broken chain of custody.
//
// The repair path had the twin check from the start. Only the scan lacked it:
// one rule, two implementations, and the copies drifted. That is this
// repository's most-repeated defect — the evidence-visibility rule reached five
// copies, the MCP tool classification three.
//
// A behavioural test cannot catch the re-inlining, because a re-inlined copy
// would pass every behavioural test the day it was written and rot afterwards.
// So this reads the source.
// ---------------------------------------------------------------------------
describe('the scanner anchors through the shared path', () => {
  const scraper = readFileSync(
    join(__dirname, '..', 'src', 'services', 'WaybackScraper.ts'),
    'utf8',
  );
  // The anchoring call moved when recordCapture became the single write path
  // (Level 1). It used to live in WaybackScraper as a private function, which is
  // precisely why the URL-tracking path could not have reused it — a second
  // caller would have reimplemented anchoring or, more likely, omitted it. The
  // invariant is unchanged and now easier to hold: ONE implementation, in
  // anchorSnapshots, called from the one place captures are created.
  const writePath = readFileSync(
    join(__dirname, '..', 'src', 'services', 'recordCapture.ts'),
    'utf8',
  );

  it('neither the scanner nor the write path registers hashes on its own', () => {
    // Matches a CALL, not the identifier: the comment at the anchoring site
    // names registerEvidenceHash to explain what it used to do wrong, and that
    // history is worth keeping next to the fix.
    expect(scraper).not.toMatch(/registerEvidenceHash\s*\(/);
    expect(writePath).not.toMatch(/registerEvidenceHash\s*\(/);
  });

  it('the write path anchors via the shared registerSnapshotOnChain', () => {
    expect(writePath).toMatch(/registerSnapshotOnChain\s*\(/);
    expect(writePath).toMatch(
      /import \{ registerSnapshotOnChain \} from '\.\/anchorSnapshots'/,
    );
  });

  it('registerSnapshotOnChain reaches the chain only through anchorOneSnapshot', () => {
    // The twin check lives in anchorOneSnapshot. Bypassing it is what left 71
    // production rows with a null onChainTxHash for text that was already
    // anchored, so the shared entry point must keep delegating rather than
    // growing its own registration call.
    const anchors = readFileSync(
      join(__dirname, '..', 'src', 'services', 'anchorSnapshots.ts'),
      'utf8',
    );
    expect(anchors).toMatch(/await anchorOneSnapshot\(web3, snapshotId, contentHash\)/);
  });

  it('the scanner no longer anchors directly — the write path owns it', () => {
    // Guards the consolidation itself. If anchoring is ever re-added to the
    // scanner, that is a second implementation returning, which is the exact
    // drift this whole describe block exists to prevent.
    expect(scraper).not.toMatch(/anchorOneSnapshot\s*\(/);
  });

  it('DETECTS a re-inlined registration — proven against a decoy', () => {
    // Without this, a pattern that silently stopped matching would report a
    // clean codebase forever.
    const decoy = `
      const txHash = await web3.registerEvidenceHash(toBytes32(contentHash), ZERO, 'Wayback Snapshot');
      await prisma.urlSnapshot.update({ where: { id }, data: { onChainTxHash: txHash } });
    `;
    expect(decoy).toMatch(/registerEvidenceHash\s*\(/);
  });
});
