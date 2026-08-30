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
const mockWeb3 = {
  readRegisteredHashes: jest.fn(),
  isHashRegistered: jest.fn(),
  lookupRegisteringTx: jest.fn(),
};
jest.mock('../src/services/Web3Service', () => ({
  Web3Service: jest.fn().mockImplementation(() => mockWeb3),
}));

import { prisma } from '../src/lib/prisma';
import {
  confirmAnchors,
  confirmAnchorsExitCode,
  formatConfirmAnchorsSummary,
  wrongClaims,
  type ConfirmAnchorsReport,
} from '../src/services/confirmAnchors';

const HASH = `0x${'a'.repeat(64)}`;
const OTHER = `0x${'b'.repeat(64)}`;
/** The hash the anchor USED to be about — a superseded rule, still a real hash of the row. */
const LEGACY = `0x${'d'.repeat(64)}`;

/**
 * One unconfirmed capture claiming an anchor. Hash columns are stored bare.
 *
 * It carries BOTH hashes because that is what the database holds and what the
 * 2026-08-30 incident turned on: a capture's `contentHash` anchor stays real
 * after the rule moves to `documentHash`.
 */
function capture(documentHash = HASH.slice(2), contentHash = LEGACY.slice(2)) {
  return { id: 'snap-1', onChainTxHash: '0xtx', documentHash, contentHash };
}

/**
 * The spelling `anchoredHash` is STORED in — bare, lower-case, no `0x`.
 *
 * Re-implemented here rather than imported from `storedAnchorHash`, deliberately:
 * a test that asserts a writer's output by calling the writer's own normaliser
 * proves only that the function is deterministic. This is an INDEPENDENT oracle,
 * and it is the one place in the repository where a second implementation of a
 * rule is the point rather than the defect.
 *
 * Four assertions in this file used to expect the `0x` form, and one — the
 * CONFIRMED_BY_LOG case at the bottom — expected the bare form. That was the
 * defect written down as a requirement: the same script stored two spellings
 * depending on which route confirmed the row, and a row confirmed by receipt
 * became invisible to `capturesAnchoredBy`. See
 * `docs/gf-positive-control-2026-08-30.md`.
 */
const stored = (h: string): string => h.replace(/^0x/i, '').toLowerCase();

/** The registry holds exactly these hashes and nothing else. */
function registryHolds(...hashes: string[]) {
  const held = new Set(hashes.map((h) => h.replace(/^0x/, '').toLowerCase()));
  mockWeb3.isHashRegistered.mockImplementation((h: string) =>
    Promise.resolve({ registered: held.has(h.replace(/^0x/, '').toLowerCase()), evidenceId: 1n }),
  );
}

function setup(opts: { snapshots?: unknown[]; evidence?: unknown[] } = {}) {
  (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue(opts.snapshots ?? []);
  (prisma.evidence.findMany as jest.Mock).mockResolvedValue(opts.evidence ?? []);
  (prisma.urlSnapshot.count as jest.Mock).mockResolvedValue(0);
  (prisma.evidence.count as jest.Mock).mockResolvedValue(0);
  // Default: the registry holds the hash and no log sits in the window — a
  // DEFINITE answer, not a failure. A test that wants the second route to
  // succeed says so explicitly, so no test confirms by accident.
  mockWeb3.lookupRegisteringTx.mockResolvedValue({
    kind: 'NO_LOG_IN_WINDOW',
    anchorBlock: 1000,
    searchedFrom: 872,
    searchedTo: 1128,
  });
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
      data: { anchoredHash: stored(HASH), anchorCheck: 'CONFIRMED_BY_RECEIPT' },
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
      data: { anchoredHash: stored(OTHER), anchorCheck: 'MISANCHORED_BY_RECEIPT' },
    });
  });

  it('reports ANCHORED NOTHING and writes nothing — a real tx attesting to nothing', async () => {
    // What a transaction to a codeless address produces: a valid hash, a
    // successful transfer, no registration. There is no hash to record.
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({ kind: 'ANCHORED_NOTHING' });

    const r = await confirmAnchors({ dryRun: false });

    expect(r.anchoredNothing).toBe(1);
    // A terminal verdict with NO hash: there is no hash to record, and saying so
    // is a finished answer rather than an absence.
    expect(prisma.urlSnapshot.update).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
      data: { anchoredHash: null, anchorCheck: 'ANCHORED_NOTHING' },
    });
  });

  it('keeps NO RECEIPT separate from ANCHORED NOTHING', async () => {
    // One says the chain gave an answer; the other says it could not be asked.
    // Collapsing them would let an RPC outage read as a fabricated anchor, and
    // the reverse.
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({ kind: 'NO_RECEIPT' });
    registryHolds(HASH);

    const r = await confirmAnchors({ dryRun: false });

    expect(r.noReceiptHashRegistered).toBe(1);
    expect(r.anchoredNothing).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Splitting NO RECEIPT. Measured on staging 2026-08-29: 91 of 113 subjects
  // returned no receipt, all of them stored on one date and none of the 22
  // stored six days later. An unreadable transaction is not yet a finding —
  // whether this chain holds the fact AT ALL is what decides that, and the two
  // answers are worlds apart in consequence.
  // -------------------------------------------------------------------------

  it('an unreadable transaction whose hash IS registered is unresolved, not wrong', async () => {
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({ kind: 'NO_RECEIPT' });
    registryHolds(HASH);

    const r = await confirmAnchors({ dryRun: false });

    expect(r.noReceiptHashRegistered).toBe(1);
    expect(r.noReceiptHashAbsent).toBe(0);
    // No HASH is written — which transaction anchored it is exactly what could
    // not be observed, and that is what the hash column means. The VERDICT is,
    // because "real and unattributable" is a terminal answer.
    expect(prisma.urlSnapshot.update).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
      data: { anchoredHash: null, anchorCheck: 'TX_UNREADABLE' },
    });
  });

  it('an unreadable transaction whose hash is ABSENT is the serious finding', async () => {
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({ kind: 'NO_RECEIPT' });
    registryHolds();

    const r = await confirmAnchors({ dryRun: false });

    expect(r.noReceiptHashAbsent).toBe(1);
    expect(r.noReceiptHashRegistered).toBe(0);
  });

  it('an RPC that answers NEITHER question concludes nothing at all', async () => {
    // The distinction §3 insists on: a verdict about the CHECK is never a
    // verdict about the data. A registry that cannot be asked must not be
    // reported as a chain that holds nothing.
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({ kind: 'NO_RECEIPT' });
    mockWeb3.isHashRegistered.mockRejectedValue(new Error('no healthy backend'));

    const r = await confirmAnchors({ dryRun: false });

    expect(r.unreachable).toBe(1);
    expect(r.noReceiptHashAbsent).toBe(0);
    expect(r.failed).toBe(0);
  });

  it('asks the registry ONLY when the receipt could not be read', async () => {
    // One extra round trip, on exactly the rows that need it — not on all 113.
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({
      kind: 'REGISTERED',
      hashes: [HASH],
      registryAddress: '0xreg',
    });

    await confirmAnchors({ dryRun: true });

    expect(mockWeb3.isHashRegistered).not.toHaveBeenCalled();
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
    expect(prisma.urlSnapshot.update).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
      data: { anchoredHash: null, anchorCheck: 'TX_UNREADABLE' },
    });
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
    setup({
      evidence: [{ id: 'ev-1', onChainTxHash: '0xevtx', fileHash: HASH, previousFileHash: null }],
    });
    mockWeb3.readRegisteredHashes.mockResolvedValue({
      kind: 'REGISTERED',
      hashes: [HASH],
      registryAddress: '0xreg',
    });

    const r = await confirmAnchors({ dryRun: false });

    expect(r.confirmed).toBe(1);
    expect(prisma.evidence.update).toHaveBeenCalledWith({
      where: { id: 'ev-1' },
      data: { anchoredHash: stored(HASH), anchorCheck: 'CONFIRMED_BY_RECEIPT' },
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

// ---------------------------------------------------------------------------
// UNRESOLVED IS NOT A PASS.
//
// The first version of this rule counted only the arms meaning "wrong" and let
// every arm meaning "could not tell" fall through to 0. The first real run
// answered 22 of 113 questions and exited 0 — the rule this level exists to
// enforce, broken by the code written to apply it. It lived inline in a script,
// where nothing exercised it.
// ---------------------------------------------------------------------------
describe('what a run means, as an exit code', () => {
  function report(over: Partial<ConfirmAnchorsReport> = {}): ConfirmAnchorsReport {
    return {
      dryRun: true,
      examined: 1,
      confirmed: 0,
      confirmedByLog: 0,
      misanchored: 0,
      registeredByAnotherTx: 0,
      anchoredNothing: 0,
      noReceiptHashRegistered: 0,
      noReceiptHashAbsent: 0,
      unreachable: 0,
      ambiguous: 0,
      alreadyConfirmed: 0,
      failed: 0,
      failures: [],
      rows: [],
      ...over,
    };
  }

  it('THE REGRESSION: a run that could not answer is not a pass', () => {
    // Exactly the staging shape — 22 confirmed, 91 unreadable, nothing wrong.
    expect(
      confirmAnchorsExitCode(
        report({ examined: 113, confirmed: 22, noReceiptHashRegistered: 91 }),
      ),
    ).toBe(3);
  });

  it('passes only when every claim was checked and every one held', () => {
    expect(confirmAnchorsExitCode(report({ examined: 113, confirmed: 113 }))).toBe(0);
  });

  it('reports WRONG above UNRESOLVED — the worse news wins', () => {
    // A corpus with both must never report merely "could not confirm".
    expect(
      confirmAnchorsExitCode(report({ misanchored: 1, noReceiptHashRegistered: 90 })),
    ).toBe(2);
  });

  it.each([
    ['misanchored', { misanchored: 1 }],
    ['a transaction that registered nothing', { anchoredNothing: 1 }],
    ['a claim this chain has no trace of', { noReceiptHashAbsent: 1 }],
  ])('%s is WRONG, not merely unresolved', (_label, over) => {
    expect(confirmAnchorsExitCode(report(over))).toBe(2);
  });

  it.each([
    ['an unreadable transaction whose hash is registered', { noReceiptHashRegistered: 1 }],
    ['an RPC that answered neither question', { unreachable: 1 }],
    ['several hashes and none the row’s', { ambiguous: 1 }],
  ])('%s is unresolved, not wrong', (_label, over) => {
    expect(confirmAnchorsExitCode(report(over))).toBe(3);
  });

  it('a run that errored on a subject reports the run, not the corpus', () => {
    // A pass that crashed halfway has measured nothing, whatever the counters
    // it managed to increment say.
    expect(confirmAnchorsExitCode(report({ failed: 1, confirmed: 100 }))).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// THE SECOND ROUTE, and the terminal verdict.
//
// Measured on staging 2026-08-30: 91 of 113 transactions are beyond the RPC's
// receipt horizon while their hashes ARE registered. Receipts are pruned by AGE;
// `eth_getLogs` is capped by RANGE, and the range is derived from the registry's
// own stored timestamp — contract state, which never expires. So the log route
// reaches where the receipt route does not.
// ---------------------------------------------------------------------------
describe('the registry log confirms what the receipt could not', () => {
  function unreadableReceipt(registered = true) {
    mockWeb3.readRegisteredHashes.mockResolvedValue({ kind: 'NO_RECEIPT' });
    if (registered) registryHolds(HASH);
    else registryHolds();
  }

  it('CONFIRMS when the registry names THIS row’s transaction', async () => {
    // A statement about the hash becomes a statement about the transaction the
    // moment it is compared to the one the row claims. That is the whole reason
    // this route counts as a confirmation rather than corroboration.
    setup({ snapshots: [capture()] });
    unreadableReceipt();
    mockWeb3.lookupRegisteringTx.mockResolvedValue({
      kind: 'FOUND',
      txHash: '0xTX',
      anchorBlock: 1000,
      searchedFrom: 872,
      searchedTo: 1128,
    });

    const r = await confirmAnchors({ dryRun: false });

    expect(r.confirmedByLog).toBe(1);
    expect(r.noReceiptHashRegistered).toBe(0);
    expect(prisma.urlSnapshot.update).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
      data: { anchoredHash: stored(HASH), anchorCheck: 'CONFIRMED_BY_LOG' },
    });
  });

  it('flags a hash the registry attributes to a DIFFERENT transaction', async () => {
    // Should be impossible — the contract reverts duplicate registration — which
    // is why it gets its own arm rather than being counted as MISANCHORED.
    setup({ snapshots: [capture()] });
    unreadableReceipt();
    mockWeb3.lookupRegisteringTx.mockResolvedValue({
      kind: 'FOUND',
      txHash: '0xsomeoneelse',
      anchorBlock: 1000,
      searchedFrom: 872,
      searchedTo: 1128,
    });

    const r = await confirmAnchors({ dryRun: false });

    expect(r.registeredByAnotherTx).toBe(1);
    expect(r.confirmedByLog).toBe(0);
    // Recorded as found BY LOG, so anyone re-opening it knows the transaction was
    // inferred from a bounded window rather than read from a receipt.
    expect(prisma.urlSnapshot.update).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
      data: { anchoredHash: null, anchorCheck: 'MISANCHORED_BY_LOG' },
    });
  });

  it('stays unresolved when the log names nothing', async () => {
    setup({ snapshots: [capture()] });
    unreadableReceipt();

    const r = await confirmAnchors({ dryRun: false });

    expect(r.noReceiptHashRegistered).toBe(1);
    expect(prisma.urlSnapshot.update).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
      // A TERMINAL verdict with NO hash. That pairing is the honest one: the
      // anchor is real and unattributable, which is a finished answer.
      data: { anchoredHash: null, anchorCheck: 'TX_UNREADABLE' },
    });
  });

  it('does NOT consult the log when the chain has no trace of the hash', async () => {
    // The expensive search runs only where the fact is known to be on chain.
    setup({ snapshots: [capture()] });
    unreadableReceipt(false);

    const r = await confirmAnchors({ dryRun: false });

    expect(r.noReceiptHashAbsent).toBe(1);
    expect(mockWeb3.lookupRegisteringTx).not.toHaveBeenCalled();
  });
});

describe('a transient failure records NOTHING — that is what keeps the null single-meaning', () => {
  it('writes no verdict when the RPC answered neither question', async () => {
    // `anchorCheck IS NULL` must mean exactly "no terminal verdict yet". If an
    // RPC outage wrote a verdict, the column would carry the same conflation the
    // bare `anchoredHash` null carried, one level up.
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({ kind: 'NO_RECEIPT' });
    mockWeb3.isHashRegistered.mockRejectedValue(new Error('no healthy backend'));

    const r = await confirmAnchors({ dryRun: false });

    expect(r.unreachable).toBe(1);
    expect(prisma.urlSnapshot.update).not.toHaveBeenCalled();
  });

  it('records a verdict for every OTHER outcome', async () => {
    // The complement of the test above, and the reason it is here: a rule with
    // one exception is a rule someone will add a second exception to.
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({ kind: 'ANCHORED_NOTHING' });

    await confirmAnchors({ dryRun: false });

    expect(prisma.urlSnapshot.update).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
      data: { anchoredHash: null, anchorCheck: 'ANCHORED_NOTHING' },
    });
  });
});

// ---------------------------------------------------------------------------
// WHY THE LOG NAMED NOTHING — the distinction a bare catch destroyed.
//
// The first version swallowed the lookup's failure into `null`. A staging run
// then resolved 0 of 91 subjects and nothing in the output could tell "the
// registry's log holds no such transaction" from "the endpoint refused the
// query" — conclusions that are worlds apart, collapsed into one number. Same
// defect `anchorSnapshots` documents having made and repaired.
// ---------------------------------------------------------------------------
describe('a lookup that names no transaction says why', () => {
  function unreadableReceiptRegistered() {
    mockWeb3.readRegisteredHashes.mockResolvedValue({ kind: 'NO_RECEIPT' });
    registryHolds(HASH);
  }

  it('records a DEFINITE empty window, naming the blocks it searched', async () => {
    setup({ snapshots: [capture()] });
    unreadableReceiptRegistered();
    mockWeb3.lookupRegisteringTx.mockResolvedValue({
      kind: 'NO_LOG_IN_WINDOW',
      anchorBlock: 1000,
      searchedFrom: 872,
      searchedTo: 1128,
    });

    const r = await confirmAnchors({ dryRun: true });
    const row = r.rows[0]?.confirmation;

    expect(row?.kind).toBe('NO_RECEIPT_HASH_REGISTERED');
    // The blocks are in the message because the obvious next question is whether
    // the window was wide enough, and an answer that omits where it looked
    // cannot be argued with.
    expect(row).toMatchObject({ logLookup: expect.stringContaining('872–1128') });
  });

  it('records a FAILED step and its reason, never as an empty answer', async () => {
    setup({ snapshots: [capture()] });
    unreadableReceiptRegistered();
    mockWeb3.lookupRegisteringTx.mockResolvedValue({
      kind: 'LOOKUP_FAILED',
      step: 'LOG_QUERY',
      reason: 'query exceeds max block range',
    });

    const r = await confirmAnchors({ dryRun: true });
    const row = r.rows[0]?.confirmation;

    expect(row).toMatchObject({
      logLookup: expect.stringContaining('LOG_QUERY step failed: query exceeds max block range'),
    });
  });

  it('DISTINGUISHES the two — proven against each other, not asserted', async () => {
    // Without this the two could produce the same string and the whole fix would
    // be decorative. The verdict is identical (TX_UNREADABLE, terminal); only the
    // reason differs, and the reason is the entire deliverable.
    setup({ snapshots: [capture()] });
    unreadableReceiptRegistered();

    mockWeb3.lookupRegisteringTx.mockResolvedValue({
      kind: 'NO_LOG_IN_WINDOW',
      anchorBlock: 1,
      searchedFrom: 0,
      searchedTo: 129,
    });
    const empty = (await confirmAnchors({ dryRun: true })).rows[0]?.confirmation;

    mockWeb3.lookupRegisteringTx.mockResolvedValue({
      kind: 'LOOKUP_FAILED',
      step: 'BLOCK_SEARCH',
      reason: 'timeout',
    });
    const failed = (await confirmAnchors({ dryRun: true })).rows[0]?.confirmation;

    expect(empty).toMatchObject({ kind: 'NO_RECEIPT_HASH_REGISTERED' });
    expect(failed).toMatchObject({ kind: 'NO_RECEIPT_HASH_REGISTERED' });
    expect((empty as { logLookup: string }).logLookup).not.toBe(
      (failed as { logLookup: string }).logLookup,
    );
  });
});

// ---------------------------------------------------------------------------
// THE 2026-08-30 INCIDENT, as three tests that would have stopped it.
//
// Level 3 clause 1 moved the anchoring rule from `contentHash` to
// `documentHash`. This pass tested the observed hash against the CURRENT rule's
// hash alone, so on the first --apply after the flip:
//
//   83 captures  → NO_TRACE_ON_CHAIN  (the most serious verdict this check has)
//   22 captures  → MISANCHORED
//
// Every one of them was anchored, correctly, under the superseded rule. The
// audit already had the three-way answer and this pass did not: one rule, two
// implementations, disagreeing the instant the rule moved.
//
// The fix is a SEPARATION, not a copy: this pass observes WHAT the transaction
// registered; whether that is the hash the rule now names is the audit's
// question, answered from `anchoredHash` by `attestationOf`.
// ---------------------------------------------------------------------------
describe('an anchor made under a superseded rule is still an anchor', () => {
  it('CONFIRMS a transaction that registered the row’s legacy hash', async () => {
    // The 22. The receipt names contentHash; the rule now names documentHash.
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({
      kind: 'REGISTERED',
      hashes: [LEGACY],
      registryAddress: '0xreg',
    });

    const r = await confirmAnchors({ dryRun: false });

    expect(r.confirmed).toBe(1);
    expect(r.misanchored).toBe(0);
    // The OBSERVED hash is recorded. `attestationOf` reads it later and reports
    // ATTESTS_SUPERSEDED, which is what makes the audit say MISATTESTING —
    // explainable, not passing, and Level 10's to supersede.
    expect(prisma.urlSnapshot.update).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
      data: { anchoredHash: stored(LEGACY), anchorCheck: 'CONFIRMED_BY_RECEIPT' },
    });
  });

  it('an unreadable transaction whose LEGACY hash is registered is unresolved, not "no trace"', async () => {
    // The 83. Asking only about the current rule's hash reported the most serious
    // verdict this check can reach, about anchors that were entirely intact.
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({ kind: 'NO_RECEIPT' });
    registryHolds(LEGACY);

    const r = await confirmAnchors({ dryRun: false });

    expect(r.noReceiptHashAbsent).toBe(0);
    expect(r.noReceiptHashRegistered).toBe(1);
    expect(prisma.urlSnapshot.update).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
      data: { anchoredHash: null, anchorCheck: 'TX_UNREADABLE' },
    });
  });

  it('NO TRACE still fires when NONE of the row’s hashes is registered', async () => {
    // The guard is not vacuous: the serious verdict must survive the fix, or the
    // repair would have removed the only thing that detects a fabricated anchor.
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({ kind: 'NO_RECEIPT' });
    registryHolds();

    const r = await confirmAnchors({ dryRun: false });

    expect(r.noReceiptHashAbsent).toBe(1);
  });

  it('asks the registry about EVERY hash the row is known by', async () => {
    setup({ snapshots: [capture()] });
    mockWeb3.readRegisteredHashes.mockResolvedValue({ kind: 'NO_RECEIPT' });
    registryHolds();

    await confirmAnchors({ dryRun: true });

    const asked = mockWeb3.isHashRegistered.mock.calls.map((c: string[]) =>
      String(c[0]).replace(/^0x/, '').toLowerCase(),
    );
    expect(asked).toEqual(expect.arrayContaining([LEGACY.slice(2), HASH.slice(2)]));
  });
});

describe('a terminal verdict is what marks a subject done', () => {
  it('skips subjects that already carry one', async () => {
    // The default. Filtering on `anchoredHash` instead re-examined TX_UNREADABLE
    // rows forever while making rows that DID record a hash unreachable — which
    // is what put 22 wrong verdicts beyond the reach of a re-run.
    setup();
    await confirmAnchors({ dryRun: true });
    const where = (prisma.urlSnapshot.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where).toMatchObject({ anchorCheck: null });
  });

  it('--recheck re-examines them, which is the only way to correct a wrong rule', async () => {
    setup();
    await confirmAnchors({ dryRun: true, recheck: true });
    const where = (prisma.urlSnapshot.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.anchorCheck).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// THE SUMMARY IS THE DELIVERABLE, so it gets a test.
//
// It was printed line by line inside a script — untested, and on a stream the
// per-row detail could interleave with. A staging run printed
// `confirmed (log):` followed by another row's text, and the count was
// recoverable only by counting rows in the log.
// ---------------------------------------------------------------------------
describe('the summary', () => {
  function report(over: Partial<ConfirmAnchorsReport> = {}): ConfirmAnchorsReport {
    return {
      dryRun: true,
      examined: 0,
      confirmed: 0,
      confirmedByLog: 0,
      misanchored: 0,
      registeredByAnotherTx: 0,
      anchoredNothing: 0,
      noReceiptHashRegistered: 0,
      noReceiptHashAbsent: 0,
      unreachable: 0,
      ambiguous: 0,
      alreadyConfirmed: 0,
      failed: 0,
      failures: [],
      rows: [],
      ...over,
    };
  }

  it('is ONE string, so nothing can split it mid-line', () => {
    // The property the incident turned on. A caller that writes this in one call
    // cannot have another stream corrupt a line of it.
    const out = formatConfirmAnchorsSummary(report({ examined: 113, confirmed: 113 }));
    expect(typeof out).toBe('string');
    expect(out).toContain('confirmed (receipt):         113');
  });

  it('reports the real staging shape faithfully', () => {
    const out = formatConfirmAnchorsSummary(
      report({ examined: 113, confirmed: 22, noReceiptHashRegistered: 91, alreadyConfirmed: 22 }),
    );
    expect(out).toContain('examined:                    113');
    expect(out).toContain('no receipt, hash registered: 91');
    expect(out).toContain('NO TRACE ON CHAIN:           0');
  });

  it('SAYS SO when the outcomes do not add up to the subjects', () => {
    // A run whose parts do not sum to its whole has lost a subject, and a silent
    // loss is how a partial pass reads as a complete one. Nothing else in the
    // report would show it.
    const out = formatConfirmAnchorsSummary(report({ examined: 113, confirmed: 22 }));
    expect(out).toContain('Some subject reached no outcome at all');
  });

  it('stays quiet when they do add up — the warning is not vacuous', () => {
    const out = formatConfirmAnchorsSummary(
      report({ examined: 113, confirmed: 22, noReceiptHashRegistered: 91 }),
    );
    expect(out).not.toContain('Some subject reached no outcome');
  });

  it('lists failures with their reasons, never just a count', () => {
    const out = formatConfirmAnchorsSummary(
      report({ examined: 1, failed: 1, failures: [{ id: 'snap-1', reason: 'RPC down' }] }),
    );
    expect(out).toContain('snap-1: RPC down');
  });
});

describe('the message and the exit code cannot disagree', () => {
  it('counts REGISTERED BY ANOTHER TX as wrong, as the exit rule does', () => {
    // They already disagreed: the script tallied findings without this arm while
    // the exit rule counted it, so a run could exit 2 and print a number one
    // short of the truth. One rule, two implementations, in miniature.
    const r = {
      dryRun: true, examined: 1, confirmed: 0, confirmedByLog: 0, misanchored: 0,
      registeredByAnotherTx: 1, anchoredNothing: 0, noReceiptHashRegistered: 0,
      noReceiptHashAbsent: 0, unreachable: 0, ambiguous: 0, alreadyConfirmed: 0,
      failed: 0, failures: [], rows: [],
    } satisfies ConfirmAnchorsReport;
    expect(wrongClaims(r)).toBe(1);
    expect(confirmAnchorsExitCode(r)).toBe(2);
  });
});
