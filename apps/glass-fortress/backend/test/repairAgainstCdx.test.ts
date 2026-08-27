jest.mock('../src/lib/prisma', () => ({
  prisma: { $executeRaw: jest.fn() },
}));

jest.mock('../src/lib/archiveHttp', () => ({
  fetchCaptureBytes: jest.fn(),
}));

jest.mock('../src/services/verifyAgainstCdx', () => {
  const actual = jest.requireActual('../src/services/verifyAgainstCdx');
  return { ...actual, verifyAgainstCdx: jest.fn() };
});

import { prisma } from '../src/lib/prisma';
import { fetchCaptureBytes } from '../src/lib/archiveHttp';
import { verifyAgainstCdx, cdxDigestOf } from '../src/services/verifyAgainstCdx';
import { repairAgainstCdx } from '../src/services/repairAgainstCdx';

const executeRaw = prisma.$executeRaw as unknown as jest.Mock;
const fetchBytes = fetchCaptureBytes as jest.Mock;
const verify = verifyAgainstCdx as jest.Mock;

const URL_ = 'https://corona.health.gov.il/vaccine-for-covid/';
const CT = 'text/html; charset=utf-8';
/** What the Archive actually served, and what CDX therefore published. */
const SERVED = Buffer.from('<p>as served</p>', 'utf8');
const CDX_DIGEST = cdxDigestOf(SERVED);
/** What we wrongly stored — axios's inflated form, a different byte string. */
const STORED_WRONG = Buffer.from('<p>inflated, and not what was served</p>', 'utf8');

function contradicted(overrides: Record<string, unknown> = {}) {
  return {
    snapshotId: 'snap-1',
    waybackTimestamp: '20220403152841',
    verdict: 'CONTRADICTED',
    cdxDigest: CDX_DIGEST,
    ourDigest: cdxDigestOf(STORED_WRONG),
    bytes: STORED_WRONG.length,
    contentEncoding: null,
    ...overrides,
  };
}

function verification(verdicts: unknown[]) {
  return { url: URL_, captures: verdicts.length, verified: 0, contradicted: 1, unavailable: 0, verdicts, levelOneComplete: false };
}

beforeEach(() => {
  jest.clearAllMocks();
  verify.mockResolvedValue(verification([contradicted()]));
  fetchBytes.mockResolvedValue({ bytes: SERVED, contentType: CT, contentEncoding: 'gzip' });
  executeRaw.mockResolvedValue(1);
});

describe('repairAgainstCdx targets by verification failure', () => {
  it('repairs only rows the check contradicts, never a verified one', async () => {
    // Self-targeting: a VERIFIED row is not in the target set at all, which the
    // `documentHash IS NULL` guard could never promise once the column was full.
    verify.mockResolvedValue({
      ...verification([contradicted(), { ...contradicted({ snapshotId: 'snap-2' }), verdict: 'VERIFIED' }]),
    });

    const report = await repairAgainstCdx({ url: URL_, dryRun: false });

    expect(report.contradictedBefore).toBe(1);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('writes NOTHING on a dry run, which is the default', async () => {
    const report = await repairAgainstCdx({ url: URL_, dryRun: true });
    expect(fetchBytes).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
    expect(report.outcomes).toHaveLength(1);
  });

  it('is idempotent: with nothing contradicted it does nothing at all', async () => {
    verify.mockResolvedValue({ ...verification([]), contradicted: 0 });
    const report = await repairAgainstCdx({ url: URL_, dryRun: false });
    expect(report.repaired).toBe(0);
    expect(fetchBytes).not.toHaveBeenCalled();
  });
});

describe('repairAgainstCdx discriminates between the two reasons a payload disagrees', () => {
  it('REPAIRS when a fresh identity fetch reproduces the Archive digest', async () => {
    const report = await repairAgainstCdx({ url: URL_, dryRun: false });

    expect(report.repaired).toBe(1);
    expect(report.outcomes[0].action).toBe('REPAIRED');

    const params = executeRaw.mock.calls[0].slice(1);
    expect(params).toContain(SERVED); // the bytes as served, not the inflated form
    expect(params).toContain(CDX_DIGEST);
    expect(params).toContain('gzip'); // the encoding that makes them interpretable
  });

  it('DOES NOT OVERWRITE when the fresh fetch also disagrees with the index', async () => {
    // The Archive's replay contradicting its own record. Our bytes are not
    // demonstrably wrong, so overwriting would replace one unverifiable payload
    // with another and destroy the evidence of the disagreement.
    const somethingElse = Buffer.from('<p>a third answer</p>', 'utf8');
    fetchBytes.mockResolvedValue({ bytes: somethingElse, contentType: CT, contentEncoding: null });

    const report = await repairAgainstCdx({ url: URL_, dryRun: false });

    expect(report.outcomes[0].action).toBe('ARCHIVE_CONTRADICTED');
    expect(report.archiveContradicted).toBe(1);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('guards the write on the WRONG hash it set out to replace', async () => {
    // Optimistic concurrency: if anything changed the row since verification
    // read it, this writes nothing rather than overwriting work it never saw.
    await repairAgainstCdx({ url: URL_, dryRun: false });
    const sql = (executeRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('"documentHash" = ');
    expect(executeRaw.mock.calls[0].slice(1)).toContain(cdxDigestOf(STORED_WRONG));
  });

  it('reports FAILED, not REPAIRED, when the guarded update matches no row', async () => {
    executeRaw.mockResolvedValue(0);
    const report = await repairAgainstCdx({ url: URL_, dryRun: false });
    expect(report.outcomes[0].action).toBe('FAILED');
    expect(report.repaired).toBe(0);
  });

  it('one unreachable capture does not abandon the rest', async () => {
    verify.mockResolvedValue(
      verification([contradicted(), contradicted({ snapshotId: 'snap-2', waybackTimestamp: '20220407202405' })]),
    );
    fetchBytes
      .mockRejectedValueOnce(new Error('archive offline'))
      .mockResolvedValue({ bytes: SERVED, contentType: CT, contentEncoding: 'gzip' });

    const report = await repairAgainstCdx({ url: URL_, dryRun: false });

    expect(report.failed).toBe(1);
    expect(report.repaired).toBe(1);
  });
});
