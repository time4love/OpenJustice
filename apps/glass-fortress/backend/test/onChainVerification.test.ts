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
const mockReadEvidenceRecord = jest.fn();
const mockConstructor = jest.fn();

// THE READ SURFACE GREW AT EVIDENCE STEP 12, and the mock grew with it. The
// check now asks ATTRIBUTED — `isRegistered(hash) AND getEvidence(index).
// submitter = our registrar` — through the one function that spells it
// (`registryState.attributeClaim`), so the double this file stands in for has to
// answer both halves. A mock that answered only the first would make every
// registered hash look unreadable, which is how a test starts asserting the
// stub instead of the rule.
const OUR_REGISTRAR = `0x${'1'.repeat(40)}`;
const A_STRANGER = `0x${'2'.repeat(40)}`;

jest.mock('../src/services/Web3Service', () => ({
  Web3Service: class {
    constructor() {
      mockConstructor();
    }
    isHashRegistered = mockIsHashRegistered;
    readEvidenceRecord = mockReadEvidenceRecord;
    get registryAddress(): string {
      return `0x${'9'.repeat(40)}`;
    }
    get registrarAddress(): string {
      return OUR_REGISTRAR;
    }
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
  // The entry the registry holds at whatever index isRegistered names, submitted
  // by us. Every case that cares overrides it; the default keeps the two reads
  // of one state agreeing, which is the only state that yields a verdict at all.
  mockReadEvidenceRecord.mockResolvedValue({
    fileHash: HASH,
    submitter: OUR_REGISTRAR.toLowerCase(),
    timestamp: 1,
    category: 'DOCUMENT_SHA256',
  });
});

const subject = {
  subjectType: IntegrityCheckSubject.EVIDENCE,
  subjectId: 'ev-1',
  fileHash: HASH,
};

describe('an unreachable chain is a verdict about the CHECK', () => {
  it('records UNAVAILABLE — never VERIFIED — when the RPC call fails', async () => {
    findUnique.mockResolvedValue({ status: 'PROMOTED', onChainTxHash: TX });
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
    findUnique.mockResolvedValue({ status: 'PROMOTED', onChainTxHash: TX });

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
    findUnique.mockResolvedValue({ status: 'PROMOTED', onChainTxHash: TX });
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
    //
    // REBASED AT EVIDENCE STEP 11b. The pair of cases here was CONSISTENT (a
    // CONFIRMED row the registry holds) and UNANCHORED_CONFIRMED (one it does
    // not) — the fake-CONFIRMED class this level was built for. Neither verdict
    // exists any more, because an evidence row is never registered: nothing above
    // the corpus is anchored (evidence §5). A registry that nonetheless holds a
    // hash the corpus explains as nothing is an ORPHANED_ANCHOR, and THAT is the
    // custody question the level still answers.
    mockIsHashRegistered.mockResolvedValue({ registered: true, evidenceId: BigInt(1) });
    const result = await recordOnChainCheck(subject);
    expect(result.verdict).toBe(IntegrityCheckVerdict.CONTRADICTED);
    expect(writtenRow().detail.onChainVerdict).toBe(ON_CHAIN_VERDICTS.ORPHANED_ANCHOR);
  });

  it('a promoted record the registry has never seen is not a defect', async () => {
    // The normal state under the target, and it must not read as an incident:
    // every promoted record is unregistered, by design.
    mockIsHashRegistered.mockResolvedValue({ registered: false, evidenceId: BigInt(0) });
    const result = await recordOnChainCheck(subject);

    expect(result.verdict).toBe(IntegrityCheckVerdict.VERIFIED);
    expect(result.onChainVerdict).toBe(ON_CHAIN_VERDICTS.NOT_IN_VAULT);
  });
});

// ---------------------------------------------------------------------------
// ATTRIBUTION, STORED AT ANCHOR TIME — evidence step 12.
//
// Every later read reports attribution FROM THIS ROW rather than asking the
// chain again: a public timeline that read the chain once per capture would be
// unbounded work for an anonymous caller (evidence A4's PUBLIC reads, and this
// repository's own rule that what a tool SPENDS decides its gate). So the
// submitter comparison has to happen where the anchor happens — seconds after
// the write, when the receipt is inside the RPC's horizon by construction — and
// what it decides has to be on the row.
// ---------------------------------------------------------------------------
describe('the stored row carries ATTRIBUTED, not just registration', () => {
  beforeEach(() => {
    findUnique.mockResolvedValue(null);
    countSnapshots.mockResolvedValue(1);
  });

  it('stores attributed TRUE when our registrar submitted the entry', async () => {
    mockIsHashRegistered.mockResolvedValue({ registered: true, evidenceId: BigInt(3) });

    await recordOnChainCheck(subject);

    expect(writtenRow().detail.attributed).toBe(true);
    expect(writtenRow().detail.attributionVerdict).toBe('ATTRIBUTED');
    expect(writtenRow().detail.submitter).toBe(OUR_REGISTRAR.toLowerCase());
  });

  it('stores attributed FALSE when someone else submitted it — registered is not attributed', async () => {
    // The distinction VERIFIED(e) rests on. A hash the registry holds because a
    // stranger wrote it is not this platform's anchor, and a check that reported
    // only `registered` could never tell the two apart.
    mockIsHashRegistered.mockResolvedValue({ registered: true, evidenceId: BigInt(3) });
    mockReadEvidenceRecord.mockResolvedValue({
      fileHash: HASH,
      submitter: A_STRANGER.toLowerCase(),
      timestamp: 1,
      category: 'DOCUMENT_SHA256',
    });

    await recordOnChainCheck(subject);

    expect(writtenRow().detail.registered).toBe(true);
    expect(writtenRow().detail.attributed).toBe(false);
    expect(writtenRow().detail.attributionVerdict).toBe('FOREIGN_SUBMITTER');
  });

  it('stores attributed FALSE for a hash the registry does not hold', async () => {
    mockIsHashRegistered.mockResolvedValue({ registered: false, evidenceId: BigInt(0) });

    await recordOnChainCheck(subject);

    expect(writtenRow().detail.attributed).toBe(false);
    expect(writtenRow().detail.attributionVerdict).toBe('UNREGISTERED');
    expect(mockReadEvidenceRecord).not.toHaveBeenCalled();
  });

  it('reads the entry ONCE, at the index the registry named — never the whole registry', async () => {
    mockIsHashRegistered.mockResolvedValue({ registered: true, evidenceId: BigInt(5) });

    await recordOnChainCheck(subject);

    expect(mockReadEvidenceRecord).toHaveBeenCalledTimes(1);
    expect(mockReadEvidenceRecord).toHaveBeenCalledWith(BigInt(5));
  });

  it('records UNAVAILABLE when the two reads of one state disagree', async () => {
    // `isRegistered` says the hash sits at an index whose entry holds a different
    // hash. That is not a negative answer and must never be stored as one: two
    // reads of one state that contradict each other are not a verdict.
    mockIsHashRegistered.mockResolvedValue({ registered: true, evidenceId: BigInt(3) });
    mockReadEvidenceRecord.mockResolvedValue({
      fileHash: `0x${'c'.repeat(64)}`,
      submitter: OUR_REGISTRAR.toLowerCase(),
      timestamp: 1,
      category: 'DOCUMENT_SHA256',
    });

    const result = await recordOnChainCheck(subject);

    expect(result.verdict).toBe(IntegrityCheckVerdict.UNAVAILABLE);
    expect(writtenRow().detail.attributed).toBeUndefined();
  });

  it('the version moved with the question, so an older verdict is not read as an answer', async () => {
    // A v1 row asked whether a hash is registered and never who submitted it.
    // Bumping the version is what lets every reader treat those rows as "never
    // asked" — null — rather than as "not attributed".
    mockIsHashRegistered.mockResolvedValue({ registered: true, evidenceId: BigInt(3) });
    await recordOnChainCheck(subject);
    expect(writtenRow().verifierVersion).toBe(ON_CHAIN_CHECK_VERSION);
    expect(ON_CHAIN_CHECK_VERSION).not.toBe('v1-decide-verdict-positive-consistency');
  });
});

describe('the write path is never failed by its own verification', () => {
  it('returns null rather than throwing when the verdict cannot be stored', async () => {
    // The transaction is already spent when this runs. Throwing would report a
    // completed promotion as an error and invite a retry that reverts as a
    // duplicate — so the failure is surfaced as "not verified", never as a pass
    // and never as a rollback.
    findUnique.mockResolvedValue({ status: 'PROMOTED', onChainTxHash: TX });
    mockIsHashRegistered.mockResolvedValue({ registered: true, evidenceId: BigInt(7) });
    createCheck.mockRejectedValue(new Error('database is down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(recordOnChainCheckNeverThrowing(subject)).resolves.toBeNull();
  });

  it('recordOnChainCheck itself DOES throw on a database failure', async () => {
    // The distinction matters: a check that cannot be stored has not been
    // performed, so the backfill and the audit — which have no spent
    // transaction to protect — must see the error rather than a quiet skip.
    findUnique.mockResolvedValue({ status: 'PROMOTED', onChainTxHash: TX });
    mockIsHashRegistered.mockResolvedValue({ registered: true, evidenceId: BigInt(7) });
    createCheck.mockRejectedValue(new Error('database is down'));

    await expect(recordOnChainCheck(subject)).rejects.toThrow('database is down');
  });
});
