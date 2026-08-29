// ---------------------------------------------------------------------------
// LEVEL 3a's MEASUREMENT — the states that must never read as a pass.
//
// Three of them, and this repository has been burned by each: a claim with no
// verdict behind it (UNCHECKED), a verdict that says the check could not be
// made (UNAVAILABLE), and a verdict about a subject that has since moved
// (STALE). The last one is the expensive one: when the survival rule changed,
// 88 stored verdicts became wrong while every hash still matched and every
// count stayed green.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    evidence: { findMany: jest.fn(), findUnique: jest.fn() },
    urlSnapshot: { findMany: jest.fn(), count: jest.fn() },
    integrityCheck: { findMany: jest.fn() },
  },
}));

import { IntegrityCheckSubject, IntegrityCheckVerdict } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { ON_CHAIN_CHECK_VERSION, onChainSourceStateHash } from '../src/lib/onChainVerdict';
import { auditOnChainAnchors } from '../src/services/auditOnChainAnchors';

const HASH = `0x${'a'.repeat(64)}`;
const TX = `0x${'b'.repeat(64)}`;

const evidenceMany = prisma.evidence.findMany as jest.Mock;
const evidenceUnique = prisma.evidence.findUnique as jest.Mock;
const snapshotMany = prisma.urlSnapshot.findMany as jest.Mock;
const snapshotCount = prisma.urlSnapshot.count as jest.Mock;
const checkMany = prisma.integrityCheck.findMany as jest.Mock;

/** The claim the audit will recompute for the one CONFIRMED evidence row below. */
const CURRENT_CLAIM = { inVault: true, status: 'CONFIRMED', txHash: TX, snapshots: 0 };
const CURRENT_HASH = onChainSourceStateHash({ fileHash: HASH, claim: CURRENT_CLAIM });

function check(over: Partial<Record<string, unknown>> = {}) {
  return {
    subjectType: IntegrityCheckSubject.EVIDENCE,
    subjectId: 'ev-1',
    verdict: IntegrityCheckVerdict.VERIFIED,
    checkedAt: new Date('2026-08-29T10:00:00Z'),
    verifierVersion: ON_CHAIN_CHECK_VERSION,
    sourceStateHash: CURRENT_HASH,
    detail: { onChainVerdict: 'CONSISTENT' },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // One CONFIRMED evidence row claiming an anchor, and nothing else.
  evidenceMany.mockResolvedValue([{ id: 'ev-1', fileHash: HASH }]);
  snapshotMany.mockResolvedValue([]);
  // What `readOnChainClaim` sees when the audit recomputes the source state.
  evidenceUnique.mockResolvedValue({ status: 'CONFIRMED', onChainTxHash: TX });
  snapshotCount.mockResolvedValue(0);
  checkMany.mockResolvedValue([]);
});

describe('states that are not a pass', () => {
  it('a CONFIRMED record with no check is UNCHECKED, not VERIFIED', async () => {
    const report = await auditOnChainAnchors();

    expect(report.subjects).toBe(1);
    expect(report.byState.UNCHECKED).toBe(1);
    expect(report.byState.VERIFIED).toBe(0);
    expect(report.unverified).toHaveLength(1);
  });

  it('an UNAVAILABLE verdict stays UNAVAILABLE — it is neither a pass nor a failure', async () => {
    checkMany.mockResolvedValue([
      check({ verdict: IntegrityCheckVerdict.UNAVAILABLE, detail: { onChainVerdict: null } }),
    ]);
    const report = await auditOnChainAnchors();

    expect(report.byState.UNAVAILABLE).toBe(1);
    expect(report.byState.VERIFIED).toBe(0);
    expect(report.byState.CONTRADICTED).toBe(0);
    expect(report.unverified[0].state).toBe('UNAVAILABLE');
  });

  it('a verdict reached under an older RULE is STALE, however well its hash matches', async () => {
    // The 88-verdict failure, one level down. `sourceStateHash` is unchanged and
    // correct; only the rule that read it moved, and a hash over inputs is
    // structurally blind to that.
    checkMany.mockResolvedValue([check({ verifierVersion: 'v0-something-older' })]);
    const report = await auditOnChainAnchors();

    expect(report.byState.STALE).toBe(1);
    expect(report.byState.VERIFIED).toBe(0);
    expect(report.unverified[0].staleReason).toContain('the rule moved');
  });

  it('a verdict about a CLAIM that has since moved is STALE', async () => {
    // Same verdict, same rule — but the record it judged now records a
    // different transaction, so the verdict is an answer about something else.
    checkMany.mockResolvedValue([check()]);
    evidenceUnique.mockResolvedValue({ status: 'CONFIRMED', onChainTxHash: `0x${'c'.repeat(64)}` });
    const report = await auditOnChainAnchors();

    expect(report.byState.STALE).toBe(1);
    expect(report.unverified[0].staleReason).toContain('database claim');
  });

  it('only a current verdict at the current rule counts as VERIFIED', async () => {
    checkMany.mockResolvedValue([check()]);
    const report = await auditOnChainAnchors();

    expect(report.byState.VERIFIED).toBe(1);
    expect(report.unverified).toHaveLength(0);
  });
});

describe('which subjects are asked for a verdict at all', () => {
  it('a PENDING_REVIEW record is not a subject — it claims no anchor', async () => {
    // Demanding a verdict for a row that asserts nothing would manufacture a
    // backlog out of rows behaving correctly, and bury the ones that are not.
    evidenceMany.mockResolvedValue([]);
    const report = await auditOnChainAnchors();
    expect(report.subjects).toBe(0);
  });

  it('an anchored capture is a subject, with its hash normalised to 0x', async () => {
    // `contentHash` is stored bare hex and the contract speaks bytes32. The
    // mismatch between the two is what made 83 anchorings silently no-op, and a
    // verification repeating it would confirm the wrong hash.
    evidenceMany.mockResolvedValue([]);
    snapshotMany.mockResolvedValue([{ id: 'snap-1', contentHash: 'a'.repeat(64) }]);
    evidenceUnique.mockResolvedValue(null);
    snapshotCount.mockResolvedValue(1);

    const report = await auditOnChainAnchors();

    expect(report.subjects).toBe(1);
    expect(report.unverified[0].fileHash).toBe(HASH);
    expect(report.unverified[0].subjectType).toBe(IntegrityCheckSubject.URL_SNAPSHOT);
  });
});

describe('the cost of a polymorphic table without a foreign key', () => {
  it('reports a check whose subject no longer exists rather than joining it away', async () => {
    checkMany.mockResolvedValue([check(), check({ subjectId: 'ev-deleted' })]);
    const report = await auditOnChainAnchors();

    expect(report.danglingChecks).toEqual([
      { subjectType: IntegrityCheckSubject.EVIDENCE, subjectId: 'ev-deleted' },
    ]);
  });
});

describe('the newest check wins', () => {
  it('an older VERIFIED does not rescue a newer CONTRADICTED', async () => {
    // The table is append-only, so "the current verdict" is a read. Reading the
    // wrong row would let a stale pass outlive the failure that superseded it.
    checkMany.mockResolvedValue([
      check({
        verdict: IntegrityCheckVerdict.CONTRADICTED,
        checkedAt: new Date('2026-08-29T12:00:00Z'),
        detail: { onChainVerdict: 'UNANCHORED_CONFIRMED' },
      }),
      check({ checkedAt: new Date('2026-08-29T10:00:00Z') }),
    ]);
    const report = await auditOnChainAnchors();

    expect(report.byState.CONTRADICTED).toBe(1);
    expect(report.byState.VERIFIED).toBe(0);
    expect(report.unverified[0].onChainVerdict).toBe('UNANCHORED_CONFIRMED');
  });
});
