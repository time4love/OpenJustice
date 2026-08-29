// ---------------------------------------------------------------------------
// check_on_chain_status — verdict logic.
//
// The verdicts this tool returns are the only automated way to detect a record
// asserting CONFIRMED without a real anchor. A 2026-08-20 audit found 5 such
// rows on staging. Every verdict therefore gets a test: an unasserted branch
// here is a class of silent evidentiary failure that nothing else catches.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    evidence: { findUnique: jest.fn() },
    // `count` and `findMany` are two different questions, and Level 3a split
    // them deliberately: the VERDICT needs only how many captures hold this
    // text, so `readOnChainClaim` counts; only this tool's human-facing summary
    // needs the rows. Both are mocked from one fixture list below, so a test
    // cannot set up a count that disagrees with the captures it provides.
    urlSnapshot: { findMany: jest.fn(), count: jest.fn() },
  },
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
const PAGE = 'https://corona.health.gov.il/vaccine-for-covid/';

const findUnique = prisma.evidence.findUnique as jest.Mock;
const findSnapshots = prisma.urlSnapshot.findMany as jest.Mock;
const countSnapshots = prisma.urlSnapshot.count as jest.Mock;

/** One fixture list drives both queries, so they can never disagree. */
function stubSnapshots(rows: ReturnType<typeof capture>[]): void {
  findSnapshots.mockResolvedValue(rows);
  countSnapshots.mockResolvedValue(rows.length);
}

/**
 * One archived capture holding the queried text.
 *
 * Takes the Archive timestamp because that is how these captures are identified
 * when reading the corpus, but yields `capturedAt` — the column the tool now
 * selects and orders by. capturedAt is NOT NULL for every provenance, whereas
 * waybackTimestamp is null for a capture the Archive does not hold, and ordering
 * by a nullable column would sort direct captures to the end regardless of when
 * they were taken (Postgres ASC is NULLS LAST).
 *
 * The ISO string is built here rather than by calling the production converter:
 * a fixture that reuses the code under test cannot disagree with it.
 */
function capture(timestamp: string, txHash: string | null) {
  const iso =
    `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}` +
    `T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}.000Z`;
  return { capturedAt: new Date(iso), onChainTxHash: txHash, trackedUrl: { url: PAGE } };
}

interface Verdict {
  verdict: string;
  safeToPromote: boolean;
  consistent: boolean;
  database: { inVault: boolean; status: string | null; onChainTxHash: string | null };
  snapshot?: {
    captures: number;
    url: string;
    firstCapture: string;
    lastCapture: string;
    onChainTxHash: string | null;
  };
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
  opts?: { recoverTxHash?: boolean; snapshots?: ReturnType<typeof capture>[] },
): Promise<Verdict> {
  findUnique.mockResolvedValue(record);
  stubSnapshots(opts?.snapshots ?? []);
  mockIsHashRegistered.mockResolvedValue({ registered, evidenceId: BigInt(7) });
  return JSON.parse(await checkOnChainStatusHandler({ fileHash: HASH, ...opts })) as Verdict;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConstructor.mockReturnValue(undefined);
  stubSnapshots([]);
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

  it('NOT_IN_VAULT — no record and no registration, nothing to reconcile', async () => {
    const r = await run(null, false);

    expect(r.verdict).toBe('NOT_IN_VAULT');
    expect(r.database.inVault).toBe(false);
    expect(r.consistent).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Regression: an anchor with no record behind it is NOT consistent.
  //
  // `consistent` was derived by excluding a few named verdicts, so
  // NOT_IN_VAULT fell through as consistent:true even when the contract held
  // the hash — an orphaned anchor, exactly the condition the 2026-08-20 audit
  // found twice and this tool exists to surface. The verdict string was right;
  // the boolean summarising it, which is what a caller actually gates on, said
  // the opposite.
  // ---------------------------------------------------------------------------
  it('ORPHANED_ANCHOR — registered with no record AND no capture behind it, never consistent', async () => {
    // The genuine orphan: nothing in either table can produce what was anchored.
    // Distinct from a snapshot hash, which also has no Evidence row.
    const r = await run(null, true, { snapshots: [] });

    expect(r.verdict).toBe('ORPHANED_ANCHOR');
    expect(r.database.inVault).toBe(false);
    expect(r.chain.registered).toBe(true);
    expect(r.consistent).toBe(false);
    expect(r.safeToPromote).toBe(false);
  });

  it('reports consistency correctly for every verdict, not just the detailed fields', async () => {
    const cases: [string, Parameters<typeof run>[0], boolean, boolean][] = [
      ['CONSISTENT', { id: 'a', status: 'CONFIRMED', onChainTxHash: TX }, true, true],
      ['UNANCHORED_CONFIRMED', { id: 'b', status: 'CONFIRMED', onChainTxHash: TX }, false, false],
      ['MISSING_TX_HASH', { id: 'c', status: 'CONFIRMED', onChainTxHash: null }, true, false],
      ['PENDING_UNREGISTERED', { id: 'd', status: 'PENDING_REVIEW', onChainTxHash: null }, false, true],
      ['PENDING_BUT_ANCHORED', { id: 'e', status: 'PENDING_REVIEW', onChainTxHash: null }, true, false],
      ['NOT_IN_VAULT', null, false, true],
      ['ORPHANED_ANCHOR', null, true, false],
    ];

    for (const [expectedVerdict, record, registered, expectedConsistent] of cases) {
      const r = await run(record, registered);
      expect(r.verdict).toBe(expectedVerdict);
      expect(r.consistent).toBe(expectedConsistent);
    }
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
  // -------------------------------------------------------------------------
  // Archived captures are not orphans.
  //
  // The verdict branched on `inVault`, which means an Evidence row and nothing
  // else — so every correctly-anchored capture was reported as a data integrity
  // incident telling the operator to "investigate before registering anything
  // else against this hash". On production that was 12 of 19 registrations, all
  // of them working exactly as designed.
  //
  // Found on 2026-08-25 by a researcher running the tutorial, who asked this
  // tool about a snapshot hash and was told their chain of custody was broken.
  // 1473 tests passed while it was true.
  // -------------------------------------------------------------------------
  describe('snapshot hashes', () => {
    it('SNAPSHOT_ANCHOR — an anchored capture is consistent, not an orphan', async () => {
      const r = await run(null, true, {
        snapshots: [capture('20220306141507', TX), capture('20220529034526', null)],
      });

      expect(r.verdict).toBe('SNAPSHOT_ANCHOR');
      expect(r.consistent).toBe(true);
      expect(r.safeToPromote).toBe(false);
      // The wording is the whole defect: the previous explanation instructed the
      // reader to investigate an incident that had not happened.
      expect(r.explanation).not.toMatch(/investigate/i);
      expect(r.explanation).toMatch(/nothing is wrong/i);
    });

    it('surfaces the transaction the Evidence lookup cannot see', async () => {
      // `database.onChainTxHash: null` beside a `list_captures` row showing a
      // transaction reads as one system contradicting itself. It is two tables
      // being asked one question.
      const r = await run(null, true, {
        snapshots: [capture('20220306141507', TX), capture('20220529034526', null)],
      });

      expect(r.database.onChainTxHash).toBeNull();
      expect(r.snapshot?.onChainTxHash).toBe(TX);
      expect(r.snapshot?.captures).toBe(2);
      expect(r.snapshot?.url).toBe(PAGE);
      // ISO-8601 now, not the Archive's YYYYMMDDHHMMSS: this reports WHEN the
      // capture was taken, which a non-archived capture also has.
      expect(r.snapshot?.firstCapture).toBe('2022-03-06T14:15:07.000Z');
      expect(r.snapshot?.lastCapture).toBe('2022-05-29T03:45:26.000Z');
    });

    it('finds the twin transaction whichever capture spent it', async () => {
      // Only the FIRST sighting of a text spends a transaction; later captures of
      // the same text record null. Reading only the first row would report null
      // for a text that is anchored.
      const r = await run(null, true, {
        snapshots: [capture('20220524070111', null), capture('20220529034526', TX)],
      });

      expect(r.snapshot?.onChainTxHash).toBe(TX);
      expect(r.verdict).toBe('SNAPSHOT_ANCHOR');
    });

    it('does NOT call a capture anchored when the chain has never seen its text', async () => {
      // A real gap, and it must not be dressed up by any verdict.
      //
      // THIS ASSERTION USED TO NAME `NOT_IN_VAULT`, and that was the defect its
      // own comment warned about. NOT_IN_VAULT explains itself as "there is
      // nothing to reconcile" and sits in CONSISTENT_VERDICTS, so a capture
      // whose text the registry has never held reported `consistent: true` —
      // the chain-of-custody gap dressed up as agreement, which is the precise
      // shape Level 3a exists to end. The verdict now distinguishes a hash
      // nobody meant to anchor from captures that assert one.
      //
      // `consistent` is asserted alongside the verdict deliberately: the verdict
      // is a label and consistency is what a caller ACTS on, and the old test
      // constrained only the label. A rename would have satisfied it while the
      // false reassurance survived untouched.
      const r = await run(null, false, {
        snapshots: [capture('20220524070111', null)],
      });

      expect(r.verdict).toBe('SNAPSHOT_UNANCHORED');
      expect(r.consistent).toBe(false);
      expect(r.chain.registered).toBe(false);
      expect(r.snapshot?.onChainTxHash).toBeNull();
      expect(r.snapshot?.captures).toBe(1);
    });

    it('reports nothing to reconcile only when NOTHING holds the hash', async () => {
      // The other side of the split above, so the two cannot collapse back into
      // one verdict without a test failing: no evidence row, no captures, no
      // registration is genuinely nothing to reconcile — and consistent.
      const r = await run(null, false, { snapshots: [] });

      expect(r.verdict).toBe('NOT_IN_VAULT');
      expect(r.consistent).toBe(true);
      expect(r.snapshot).toBeUndefined();
    });

    it('an evidence record is never treated as a snapshot, and costs no extra query', async () => {
      const r = await run({ id: 'e1', status: 'CONFIRMED', onChainTxHash: TX }, true);

      expect(r.verdict).toBe('CONSISTENT');
      expect(r.snapshot).toBeUndefined();
      // Skipped in the common path so the tool costs what it did before.
      expect(findSnapshots).not.toHaveBeenCalled();
    });

    it('matches on bare hex, because contentHash is stored without the 0x prefix', async () => {
      // The same prefix mismatch that made snapshot anchoring silently fail for
      // 83 snapshots by passing bare hex where bytes32 was required.
      await run(null, true, { snapshots: [capture('20220306141507', TX)] });

      expect(findSnapshots).toHaveBeenCalledWith(
        // Recorded answer first, current rule only as a fallback — a capture
        // anchored under a superseded rule must still resolve to itself.
        expect.objectContaining({
          where: {
            OR: [
              { anchoredHash: 'a'.repeat(64) },
              { anchoredHash: null, contentHash: 'a'.repeat(64) },
            ],
          },
        }),
      );
    });
  });
});
