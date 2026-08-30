// ---------------------------------------------------------------------------
// LEVEL 3a's MEASUREMENT — the states that must never read as a pass.
//
// Four of them now, and this repository has been burned by each: a claim with no
// verdict behind it (UNCHECKED), a verdict that says the check could not be made
// (UNAVAILABLE), a verdict about a subject that has since moved (STALE), and a
// verdict that does not say WHICH CHAIN it asked.
//
// The last two are the expensive ones. When the survival rule changed, 88 stored
// verdicts became wrong while every hash still matched and every count stayed
// green. Then on 2026-08-29 a local run read production's database against Base
// Sepolia's registry and wrote 91 verdicts into production — where the rule had
// not moved and the claims had not moved, so every existing axis reported all 91
// of them current. Those rows are KEPT, because they are the evidence that the
// pipeline was wrong; what changes is that they can no longer read as a pass.
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
import type { AnchoringTarget } from '../src/lib/anchoringTarget';
import {
  auditOnChainAnchors,
  formatAnchorAuditSummary,
  type AnchorAuditReport,
} from '../src/services/auditOnChainAnchors';

const HASH = `0x${'a'.repeat(64)}`;
const TX = `0x${'b'.repeat(64)}`;

/**
 * The registry this "deployment" anchors to. STATED, never inherited from the
 * environment: `test/setupEnv.ts` deletes EVIDENCE_REGISTRY_ADDRESS so no test
 * can reach a real chain, and a suite that silently read whatever was left over
 * would be asserting about a registry it never named.
 */
const MAINNET: AnchoringTarget = {
  chainId: 8453,
  registryAddress: '0x0e21561bbfbb8716713bd60cd21ec5730a4d0d22',
};

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
    chainId: MAINNET.chainId,
    registryAddress: MAINNET.registryAddress,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // One CONFIRMED evidence row claiming an anchor, and nothing else.
  // `anchoredHash: null` is the real state of every row until
  // forensics:confirm-anchors has observed its transaction. Stating it rather
  // than omitting it: a fixture that leaves the column out is a fixture asserting
  // a shape the database cannot produce.
  // `previousFileHash` stated too: a fixture that omits a selected column is a
  // fixture asserting a shape the database cannot produce, and this one would
  // throw the moment a test gave the row a recorded anchor.
  // ATTRIBUTED by default. These tests are about the states of the CHECK, and a
  // subject whose anchor has never been observed short-circuits to UNATTRIBUTED
  // before any check is consulted — deliberately, since judging it against the
  // current rule's hash is the guess that was removed.
  evidenceMany.mockResolvedValue([
    { id: 'ev-1', fileHash: HASH, previousFileHash: null, anchoredHash: HASH },
  ]);
  snapshotMany.mockResolvedValue([]);
  // What `readOnChainClaim` sees when the audit recomputes the source state.
  evidenceUnique.mockResolvedValue({ status: 'CONFIRMED', onChainTxHash: TX });
  snapshotCount.mockResolvedValue(0);
  checkMany.mockResolvedValue([]);
});

describe('states that are not a pass', () => {
  it('a CONFIRMED record with no check is UNCHECKED, not VERIFIED', async () => {
    const report = await auditOnChainAnchors(MAINNET);

    expect(report.subjects).toBe(1);
    expect(report.byState.UNCHECKED).toBe(1);
    expect(report.byState.VERIFIED).toBe(0);
    expect(report.unverified).toHaveLength(1);
  });

  it('an UNAVAILABLE verdict stays UNAVAILABLE — it is neither a pass nor a failure', async () => {
    checkMany.mockResolvedValue([
      check({ verdict: IntegrityCheckVerdict.UNAVAILABLE, detail: { onChainVerdict: null } }),
    ]);
    const report = await auditOnChainAnchors(MAINNET);

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
    const report = await auditOnChainAnchors(MAINNET);

    expect(report.byState.STALE).toBe(1);
    expect(report.byState.VERIFIED).toBe(0);
    expect(report.unverified[0].staleReason).toContain('the rule moved');
  });

  it('a verdict about a CLAIM that has since moved is STALE', async () => {
    // Same verdict, same rule — but the record it judged now records a
    // different transaction, so the verdict is an answer about something else.
    checkMany.mockResolvedValue([check()]);
    evidenceUnique.mockResolvedValue({ status: 'CONFIRMED', onChainTxHash: `0x${'c'.repeat(64)}` });
    const report = await auditOnChainAnchors(MAINNET);

    expect(report.byState.STALE).toBe(1);
    expect(report.unverified[0].staleReason).toContain('database claim');
  });

  it('only a current verdict at the current rule counts as VERIFIED', async () => {
    checkMany.mockResolvedValue([check()]);
    const report = await auditOnChainAnchors(MAINNET);

    expect(report.byState.VERIFIED).toBe(1);
    expect(report.unverified).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // THE 2026-08-29 INCIDENT, as the audit must now see it.
  //
  // Every one of these rows is VERIFIED, at the current rule, against a claim
  // that has not moved. Nothing about the verdict itself is wrong. What is wrong
  // is that it is an answer to a question about somewhere else — and before
  // these cases existed, the audit could not tell.
  // -------------------------------------------------------------------------
  it('a verdict that does not record WHICH CHAIN it asked is not a pass', async () => {
    // The exact shape of the 91 production rows: written before the columns
    // existed, so nothing distinguishes the 90 read off Base Sepolia from a
    // correct one. NULL is the state, and NULL may not read as agreement.
    checkMany.mockResolvedValue([check({ chainId: null, registryAddress: null })]);
    const report = await auditOnChainAnchors(MAINNET);

    expect(report.byState.VERIFIED).toBe(0);
    expect(report.byState.STALE).toBe(1);
    expect(report.unverified[0].staleReason).toContain('does not record which chain');
  });

  it('a verdict reached against ANOTHER CHAIN is not a pass, and says which', async () => {
    // Base Sepolia's answer, stored in production. Once the column exists this
    // is no longer indistinguishable — it is self-reporting.
    checkMany.mockResolvedValue([check({ chainId: 84532 })]);
    const report = await auditOnChainAnchors(MAINNET);

    expect(report.byState.VERIFIED).toBe(0);
    expect(report.byState.STALE).toBe(1);
    expect(report.unverified[0].staleReason).toContain('84532');
  });

  it('a verdict reached against another REGISTRY on the right chain is not a pass', async () => {
    // The chain alone is not enough. The address that started this whole rule
    // was a Hardhat first-deployment address: right shape, right chain, no code.
    checkMany.mockResolvedValue([
      check({ registryAddress: '0x5fbdb2315678afecb367f032d93f642f64180aa3' }),
    ]);
    const report = await auditOnChainAnchors(MAINNET);

    expect(report.byState.VERIFIED).toBe(0);
    expect(report.byState.STALE).toBe(1);
    expect(report.unverified[0].staleReason).toContain('0x5fbdb2315678afecb367f032d93f642f64180aa3');
  });

  it('EIP-55 casing is the same registry, not a different one', async () => {
    // A checksum over the same 20 bytes. Comparing the spellings as strings
    // would report every verdict about this very registry as a verdict about
    // somewhere else — a guard that fails on correct data gets switched off.
    checkMany.mockResolvedValue([
      check({ registryAddress: '0x0E21561bBFBB8716713bd60CD21eC5730a4D0D22' }),
    ]);
    const report = await auditOnChainAnchors(MAINNET);

    expect(report.byState.VERIFIED).toBe(1);
    expect(report.unverified).toHaveLength(0);
  });

  it('a deployment that cannot name its own registry confirms nothing', async () => {
    // EVIDENCE_REGISTRY_ADDRESS unset. Fail-safe in the only tolerable
    // direction: loud, and never a pass.
    checkMany.mockResolvedValue([check()]);
    const report = await auditOnChainAnchors({ chainId: 8453, registryAddress: null });

    expect(report.byState.VERIFIED).toBe(0);
    expect(report.byState.STALE).toBe(1);
    expect(report.unverified[0].staleReason).toContain('EVIDENCE_REGISTRY_ADDRESS is not set');
  });
});

// ---------------------------------------------------------------------------
// THE TABLE, NOT JUST ITS TOP ROW.
//
// Every state above reads the NEWEST check per subject, so a corpus whose old
// checks were REPLACED and one whose old checks were SUPERSEDED look identical
// from there. The cleanup after the 2026-08-29 cross-environment write turns on
// the 91 wrong rows being KEPT — refusing to store a wrong verdict would delete
// the evidence that the pipeline was wrong — and until these counts existed,
// "they are still there" rested on the table being append-only. True, and an
// argument rather than a measurement.
// ---------------------------------------------------------------------------
describe('the checks behind the verdicts', () => {
  it('THE CLEANUP SHAPE: a chain-stamped check supersedes an unstamped one, which is kept', async () => {
    // Production after the backfill, in miniature. The subject reads VERIFIED
    // off the new check while the old one remains, visibly not naming a chain.
    checkMany.mockResolvedValue([
      check({ checkedAt: new Date('2026-08-29T16:00:00Z') }),
      check({
        checkedAt: new Date('2026-08-29T10:00:00Z'),
        chainId: null,
        registryAddress: null,
      }),
    ]);
    const report = await auditOnChainAnchors(MAINNET);

    expect(report.byState.VERIFIED).toBe(1);
    expect(report.history).toEqual({
      totalChecks: 2,
      superseded: 1,
      provenanceIncomplete: 1,
    });
  });

  it('counts provenance gaps across the WHOLE table, not the newest row per subject', async () => {
    // The mutation that matters. Counting only `latest` would report zero the
    // moment a backfill superseded the incomplete rows — which is exactly when
    // the count starts to mean something, and exactly when a reader would take
    // the zero as proof the incident had been cleaned away rather than recorded.
    checkMany.mockResolvedValue([
      check({ checkedAt: new Date('2026-08-29T16:00:00Z') }),
      check({ checkedAt: new Date('2026-08-29T12:00:00Z'), chainId: null, registryAddress: null }),
      check({ checkedAt: new Date('2026-08-29T10:00:00Z'), chainId: 84532 }),
    ]);
    const report = await auditOnChainAnchors(MAINNET);

    expect(report.history.provenanceIncomplete).toBe(2);
    expect(report.history.superseded).toBe(2);
  });

  it('a verdict off ANOTHER chain counts as not naming this one', async () => {
    // Base Sepolia's answer stored in production: it names a chain, just not
    // this deployment's. Counting only NULLs would miss the 90 rows that were
    // wrong rather than merely unrecorded.
    checkMany.mockResolvedValue([check({ chainId: 84532 })]);
    const report = await auditOnChainAnchors(MAINNET);

    expect(report.history.provenanceIncomplete).toBe(1);
  });

  it('reports zeroes on an empty table rather than throwing', async () => {
    // A corpus with no checks at all: the subject is UNCHECKED above, and these
    // counts must say nothing rather than invent something.
    const report = await auditOnChainAnchors(MAINNET);

    expect(report.byState.UNCHECKED).toBe(1);
    expect(report.history).toEqual({
      totalChecks: 0,
      superseded: 0,
      provenanceIncomplete: 0,
    });
  });
});

describe('which subjects are asked for a verdict at all', () => {
  it('a PENDING_REVIEW record is not a subject — it claims no anchor', async () => {
    // Demanding a verdict for a row that asserts nothing would manufacture a
    // backlog out of rows behaving correctly, and bury the ones that are not.
    evidenceMany.mockResolvedValue([]);
    const report = await auditOnChainAnchors(MAINNET);
    expect(report.subjects).toBe(0);
  });

  it('an anchored capture is a subject, with its hash normalised to 0x', async () => {
    // `contentHash` is stored bare hex and the contract speaks bytes32. The
    // mismatch between the two is what made 83 anchorings silently no-op, and a
    // verification repeating it would confirm the wrong hash.
    evidenceMany.mockResolvedValue([]);
    snapshotMany.mockResolvedValue([
      {
        id: 'snap-1',
        contentHash: 'a'.repeat(64),
        documentHash: 'a'.repeat(64),
        anchoredHash: 'a'.repeat(64),
      },
    ]);
    evidenceUnique.mockResolvedValue(null);
    snapshotCount.mockResolvedValue(1);

    const report = await auditOnChainAnchors(MAINNET);

    expect(report.subjects).toBe(1);
    expect(report.unverified[0].fileHash).toBe(HASH);
    expect(report.unverified[0].subjectType).toBe(IntegrityCheckSubject.URL_SNAPSHOT);
  });
});

describe('the cost of a polymorphic table without a foreign key', () => {
  it('reports a check whose subject no longer exists rather than joining it away', async () => {
    checkMany.mockResolvedValue([check(), check({ subjectId: 'ev-deleted' })]);
    const report = await auditOnChainAnchors(MAINNET);

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
    const report = await auditOnChainAnchors(MAINNET);

    expect(report.byState.CONTRADICTED).toBe(1);
    expect(report.byState.VERIFIED).toBe(0);
    expect(report.unverified[0].onChainVerdict).toBe('UNANCHORED_CONFIRMED');
  });
});

// ---------------------------------------------------------------------------
// WHAT WAS ANCHORED — the question every state above is silent about.
//
// The plan's own warning: "Do not read a clean anchor audit as Level 3 being
// done. It is silent on WHAT was anchored, and would stay green if the answer
// were a hash of the page title." These are the cases that make it not silent.
// ---------------------------------------------------------------------------
describe('a current, correct verdict about the WRONG hash is not a pass', () => {
  const SUPERSEDED = `0x${'b'.repeat(64)}`;
  const STRANGER = `0x${'c'.repeat(64)}`;

  it('EXPLAINABLE IS NOT PASSING: an anchor on a superseded identity', () => {
    // The exact shape every legacy capture takes the moment Level 3 flips the
    // anchor to the document. If this read VERIFIED the audit would go green on a
    // corpus where clause 1 is false for every row.
    return (async () => {
      evidenceMany.mockResolvedValue([
        { id: 'ev-1', fileHash: HASH, previousFileHash: SUPERSEDED, anchoredHash: SUPERSEDED },
      ]);
      checkMany.mockResolvedValue([check()]);

      const report = await auditOnChainAnchors(MAINNET);

      expect(report.byState.MISATTESTING).toBe(1);
      expect(report.byState.VERIFIED).toBe(0);
      expect(report.unverified[0]?.staleReason).toContain('superseded rule');
    })();
  });

  it('a hash the record does not have by any rule is misanchored, and says so differently', () => {
    return (async () => {
      evidenceMany.mockResolvedValue([
        { id: 'ev-1', fileHash: HASH, previousFileHash: null, anchoredHash: STRANGER },
      ]);
      checkMany.mockResolvedValue([check()]);

      const report = await auditOnChainAnchors(MAINNET);

      expect(report.byState.MISATTESTING).toBe(1);
      // Same state, different remedy — one is Level 10's to supersede, the other
      // is a custody incident. Collapsing the reasons would name the wrong fix.
      expect(report.unverified[0]?.staleReason).toContain('does not have by any rule');
    })();
  });

  it('an anchor on the CURRENT hash still passes — the guard is not vacuous', async () => {
    evidenceMany.mockResolvedValue([
      { id: 'ev-1', fileHash: HASH, previousFileHash: SUPERSEDED, anchoredHash: HASH },
    ]);
    checkMany.mockResolvedValue([check()]);

    const report = await auditOnChainAnchors(MAINNET);

    expect(report.byState.VERIFIED).toBe(1);
    expect(report.byState.MISATTESTING).toBe(0);
  });

  it('a row whose anchor was never observed is UNATTRIBUTED, not misattesting', async () => {
    // And not VERIFIED either. What stood here was a fallback to the current
    // rule's hash, which was sound only until the rule moved — then 91 staging
    // subjects were judged against a hash nothing had registered.
    evidenceMany.mockResolvedValue([
      { id: 'ev-1', fileHash: HASH, previousFileHash: null, anchoredHash: null },
    ]);
    checkMany.mockResolvedValue([check()]);

    const report = await auditOnChainAnchors(MAINNET);

    expect(report.byState.UNATTRIBUTED).toBe(1);
    expect(report.byState.MISATTESTING).toBe(0);
    expect(report.byState.VERIFIED).toBe(0);
    expect(report.anchorsUnconfirmed).toBe(1);
  });

  it('does not GUESS a hash for it — the fallback is gone, not relocated', async () => {
    // The row must not be judged against the current rule's hash at all. If it
    // were, a re-check would mint a confident verdict about a hash nothing
    // registered — a true finding laundered into a durable false pass.
    evidenceMany.mockResolvedValue([
      { id: 'ev-1', fileHash: HASH, previousFileHash: null, anchoredHash: null },
    ]);
    checkMany.mockResolvedValue([check()]);

    const report = await auditOnChainAnchors(MAINNET);

    expect(report.unverified[0]?.state).toBe('UNATTRIBUTED');
    expect(report.unverified[0]?.staleReason).toContain('has never been observed');
  });
});

// ---------------------------------------------------------------------------
// THE SUMMARY MUST ACCOUNT FOR EVERY SUBJECT.
//
// The block hand-listed five states. MISATTESTING was added to the model and to
// the exit code and forgotten here, so a staging run printed 8 VERIFIED and
// 83 STALE against 113 subjects and 22 rows were absent from the only place a
// human reads. The same class of defect the run was reporting.
// ---------------------------------------------------------------------------
describe('the coverage summary', () => {
  function report(byState: Partial<Record<string, number>>, subjects: number): AnchorAuditReport {
    return {
      subjects,
      byState: {
        VERIFIED: 0, CONTRADICTED: 0, UNAVAILABLE: 0, UNCHECKED: 0,
        STALE: 0, MISATTESTING: 0, UNATTRIBUTED: 0, ...byState,
      } as AnchorAuditReport['byState'],
      unverified: [],
      currentVerifierVersion: 'v1',
      history: { totalChecks: 0, superseded: 0, provenanceIncomplete: 0 },
      danglingChecks: [],
      anchorsUnconfirmed: 0,
    };
  }

  it('prints EVERY state, including the ones added late', () => {
    const out = formatAnchorAuditSummary(report({ MISATTESTING: 22, UNATTRIBUTED: 91 }, 113));
    expect(out).toContain('MISATTESTING');
    expect(out).toContain('UNATTRIBUTED');
  });

  it('SAYS SO when the states do not account for every subject', () => {
    // The exact staging shape that went unnoticed: 8 + 83 printed, 113 claimed.
    const out = formatAnchorAuditSummary(report({ VERIFIED: 8, STALE: 83 }, 113));
    expect(out).toContain('account for 91 of 113');
  });

  it('stays quiet when they do — the warning is not vacuous', () => {
    const out = formatAnchorAuditSummary(report({ VERIFIED: 8, STALE: 83, MISATTESTING: 22 }, 113));
    expect(out).not.toContain('account for');
  });
});
