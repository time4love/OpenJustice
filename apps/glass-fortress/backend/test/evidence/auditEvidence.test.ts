jest.mock('../../src/lib/prisma', () => ({
  prisma: { evidence: { findMany: jest.fn() } },
}));

import { prisma } from '../../src/lib/prisma';
import { auditEvidence, formatEvidenceAudit } from '../../src/services/auditEvidence';
import { captureId, recordId } from '../../src/lib/evidenceIdentity';

// ---------------------------------------------------------------------------
// `evidence-recomputable` — A7, AND THE CASES THAT PROVE IT CAN FAIL.
//
// A7: "None is proven until it has been observed to FAIL." Every planted row
// below was run against a DELIBERATELY BROKEN checker first — one that returned
// `{ rows, malformed: [] }` unconditionally — and each case named here went red
// before the real one turned it green. That is the whole reason these are
// separate cases with separate reasons rather than one "the audit works": an
// instrument that reports nothing wrong is indistinguishable from one that looks
// for nothing, and the difference is exactly what this file measures.
//
// MOCKED AT THE PRISMA BOUNDARY. The audit is one query and a fold; what is
// under test is the fold, and pointing it at a database would test the database.
// ---------------------------------------------------------------------------

const URL = 'https://news.walla.co.il/item/3403847';
const TS = '20201209134003';
const DOC = '3b1f0a9c2e4d5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c';
const TS2 = '20210612183110';
const DOC2 = '9f8e7d6c5b4a39281706f5e4d3c2b1a09182736455463728190a1b2c3d4e5f60';

const CAPTURE_HASH = captureId(URL, TS, DOC);
const PAIR_HASH = recordId({
  kind: 'DIFF',
  url: URL,
  before: { waybackTimestamp: TS, documentHash: DOC },
  after: { waybackTimestamp: TS2, documentHash: DOC2 },
});

const capture = { waybackTimestamp: TS, documentHash: DOC, trackedUrl: { url: URL } };
const after = { waybackTimestamp: TS2, documentHash: DOC2, trackedUrl: { url: URL } };

/** A well-formed CAPTURE row — the control every planted defect is a mutation of. */
function soundCapture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fileHash: CAPTURE_HASH,
    kind: 'CAPTURE',
    snapshotId: 'snap-1',
    urlVersionDiffId: null,
    documentCommitment: null,
    affirmedContentVersionHash: 'aa'.repeat(32),
    snapshot: capture,
    urlVersionDiff: null,
    debateSession: null,
    ...over,
  };
}

/** A well-formed DIFF row, whose affirmed version exists on the pair. */
function soundDiff(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fileHash: PAIR_HASH,
    kind: 'DIFF',
    snapshotId: null,
    urlVersionDiffId: 'diff-1',
    documentCommitment: null,
    affirmedContentVersionHash: 'bb'.repeat(32),
    snapshot: null,
    urlVersionDiff: {
      beforeSnapshot: capture,
      afterSnapshot: after,
      contentVersions: [{ contentVersionHash: 'bb'.repeat(32) }],
    },
    debateSession: null,
    ...over,
  };
}

const findMany = prisma.evidence.findMany as jest.Mock;
const given = (rows: Record<string, unknown>[]): void => {
  findMany.mockResolvedValue(rows);
};

describe('a sound corpus passes, and says how much it looked at', () => {
  it('reports every row and nothing malformed', async () => {
    given([soundCapture(), soundDiff()]);
    const report = await auditEvidence();
    expect(report.rows).toBe(2);
    expect(report.malformed).toEqual([]);
  });

  it('ZERO ROWS IS A PASS, and the count is the report\'s FIRST line', async () => {
    // Elsewhere an empty subject set is a refusal, because "does every claim
    // carry a check?" is vacuous with no claims. "Is any stored row malformed?"
    // is not: it has a true answer at zero. What makes that honest rather than
    // reassuring is that the number is stated before any verdict.
    given([]);
    const report = await auditEvidence();
    expect(report.rows).toBe(0);
    expect(report.malformed).toEqual([]);
    expect(formatEvidenceAudit(report).split('\n').at(0)).toBe('Evidence rows: 0');
    expect(formatEvidenceAudit(report)).toContain('this is a true answer about the rows');
  });
});

describe('OBSERVED TO FAIL — one planted defect per way a row can be wrong', () => {
  it('a fileHash one byte off is NOT_RECOMPUTABLE, and the report names what the record is', async () => {
    const wrong = `0x0${CAPTURE_HASH.slice(3)}`;
    given([soundCapture({ fileHash: wrong })]);
    const { malformed } = await auditEvidence();
    expect(malformed).toHaveLength(1);
    expect(malformed.at(0)?.reason).toBe('NOT_RECOMPUTABLE');
    expect(malformed.at(0)?.detail).toContain(CAPTURE_HASH);
  });

  it('two record keys set is MULTIPLE_RECORD_KEYS', async () => {
    given([soundCapture({ urlVersionDiffId: 'diff-9' })]);
    const { malformed } = await auditEvidence();
    expect(malformed.at(0)?.reason).toBe('MULTIPLE_RECORD_KEYS');
  });

  it('no record key at all is NO_RECORD_KEY', async () => {
    given([soundCapture({ snapshotId: null })]);
    const { malformed } = await auditEvidence();
    expect(malformed.at(0)?.reason).toBe('NO_RECORD_KEY');
  });

  it('a key that does not match its kind is KEY_DOES_NOT_MATCH_KIND', async () => {
    // The CHECK constraint refuses this at write time. Holding it here too is not
    // duplication: a constraint refuses a WRITE, and this asks whether what is
    // already stored is true — of a database that may have been restored.
    given([soundCapture({ kind: 'DIFF' })]);
    const { malformed } = await auditEvidence();
    expect(malformed.at(0)?.reason).toBe('KEY_DOES_NOT_MATCH_KIND');
  });

  it('an affirmed version absent from the record is AFFIRMED_VERSION_MISSING', async () => {
    given([soundDiff({ affirmedContentVersionHash: 'cc'.repeat(32) })]);
    const { malformed } = await auditEvidence();
    expect(malformed.at(0)?.reason).toBe('AFFIRMED_VERSION_MISSING');
    expect(malformed.at(0)?.detail).toContain('cc'.repeat(32));
  });

  it('a debate that is not PROMOTED is DEBATE_NOT_PROMOTED', async () => {
    given([soundCapture({ debateSession: { status: 'OPEN', recordFileHash: CAPTURE_HASH } })]);
    const { malformed } = await auditEvidence();
    expect(malformed.at(0)?.reason).toBe('DEBATE_NOT_PROMOTED');
  });

  it('a debate PROMOTED for a DIFFERENT record is DEBATE_NOT_PROMOTED, and names which', async () => {
    given([soundCapture({ debateSession: { status: 'PROMOTED', recordFileHash: PAIR_HASH } })]);
    const { malformed } = await auditEvidence();
    expect(malformed.at(0)?.reason).toBe('DEBATE_NOT_PROMOTED');
    expect(malformed.at(0)?.detail).toContain(PAIR_HASH);
  });

  it('a record the row names but the corpus does not hold is RECORD_MISSING', async () => {
    given([soundCapture({ snapshot: null })]);
    const { malformed } = await auditEvidence();
    expect(malformed.at(0)?.reason).toBe('RECORD_MISSING');
  });

  it('a DOCUMENT row whose fileHash is not its commitment is NOT_RECOMPUTABLE', async () => {
    given([
      soundCapture({
        kind: 'DOCUMENT',
        snapshotId: null,
        documentCommitment: `0x${'de'.repeat(32)}`,
        snapshot: null,
      }),
    ]);
    const { malformed } = await auditEvidence();
    expect(malformed.at(0)?.reason).toBe('NOT_RECOMPUTABLE');
  });
});

describe('the report REPAIRS NOTHING, and says so where a reader will see it', () => {
  it('names the defect as a write defect rather than staleness', async () => {
    given([soundCapture({ fileHash: `0x0${CAPTURE_HASH.slice(3)}` })]);
    const text = formatEvidenceAudit(await auditEvidence());
    expect(text).toContain('NOT REPAIRED');
    expect(text).toContain('WRITE DEFECT');
    expect(text).not.toMatch(/stale/i);
  });
});
