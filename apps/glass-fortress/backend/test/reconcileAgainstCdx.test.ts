jest.mock('../src/lib/prisma', () => ({
  prisma: { $executeRaw: jest.fn(), urlSnapshot: { findMany: jest.fn() } },
}));

jest.mock('../src/lib/archiveHttp', () => ({ fetchCaptureBytes: jest.fn() }));

jest.mock('../src/services/verifyAgainstCdx', () => {
  const actual = jest.requireActual('../src/services/verifyAgainstCdx');
  return { ...actual, verifyAgainstCdx: jest.fn() };
});

import { prisma } from '../src/lib/prisma';
import { fetchCaptureBytes } from '../src/lib/archiveHttp';
import { verifyAgainstCdx, cdxDigestOf } from '../src/services/verifyAgainstCdx';
import { reconcileAgainstCdx } from '../src/services/reconcileAgainstCdx';
import { deriveText, sha256Bytes } from '../src/lib/captureDocument';
import { writtenColumns } from './helpers/writtenColumns';

const executeRaw = prisma.$executeRaw as unknown as jest.Mock;
const findMany = prisma.urlSnapshot.findMany as jest.Mock;
const fetchBytes = fetchCaptureBytes as jest.Mock;
const verify = verifyAgainstCdx as jest.Mock;

const URL_ = 'https://corona.health.gov.il/vaccine-for-covid/';
const CT = 'text/html; charset=utf-8';
const V2 = 'v2-inflate-decode-htmltotext-normalised';

const SERVED = Buffer.from('<p>as served</p>', 'utf8');
const CDX = cdxDigestOf(SERVED);
const WRONG = Buffer.from('<p>inflated, not what was served</p>', 'utf8');

function verdict(o: Record<string, unknown> = {}) {
  return {
    snapshotId: 'snap-1',
    waybackTimestamp: '20220403152841',
    verdict: 'VERIFIED',
    cdxDigest: CDX,
    ourDigest: CDX,
    bytes: SERVED.length,
    contentEncoding: null,
    ...o,
  };
}
function verification(verdicts: unknown[]) {
  return { url: URL_, captures: verdicts.length, verified: 0, contradicted: 0, unavailable: 0, verdicts, levelOneComplete: false };
}
/** A stored row already consistent with SERVED under v2. */
function storedRow(o: Record<string, unknown> = {}) {
  return {
    id: 'snap-1',
    document: SERVED,
    text: deriveText(SERVED, CT, null).text,
    textExtractionVersion: V2,
    ...o,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  verify.mockResolvedValue(verification([verdict()]));
  findMany.mockResolvedValue([storedRow()]);
  fetchBytes.mockResolvedValue({ bytes: SERVED, contentType: CT, contentEncoding: null });
  executeRaw.mockResolvedValue(1);
});

describe('reconcileAgainstCdx passes over EVERY capture', () => {
  it('examines verified captures too, so no partial state is left behind', async () => {
    // Touching only failures would leave textExtractionVersion split across
    // versions and documentContentEncoding NULL on rows where it is observable.
    verify.mockResolvedValue(
      verification([verdict(), verdict({ snapshotId: 'snap-2', waybackTimestamp: '20220407202405' })]),
    );
    findMany.mockResolvedValue([storedRow(), storedRow({ id: 'snap-2' })]);

    const report = await reconcileAgainstCdx({ url: URL_, dryRun: false });

    expect(report.captures).toBe(2);
    expect(fetchBytes).toHaveBeenCalledTimes(2);
  });

  it('writes NOTHING when a verified row is already complete', async () => {
    // Fill-and-repair, not blanket overwrite.
    const report = await reconcileAgainstCdx({ url: URL_, dryRun: false });
    expect(report.unchanged).toBe(1);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('writes NOTHING on a dry run, which is the default', async () => {
    const report = await reconcileAgainstCdx({ url: URL_, dryRun: true });
    expect(fetchBytes).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
    expect(report.captures).toBe(1);
  });
});

describe('reconcileAgainstCdx fills what is missing without touching what is right', () => {
  it('fills a missing content-encoding on a verified row', async () => {
    verify.mockResolvedValue(verification([verdict({ contentEncoding: null })]));
    fetchBytes.mockResolvedValue({ bytes: SERVED, contentType: CT, contentEncoding: 'identity' });

    const report = await reconcileAgainstCdx({ url: URL_, dryRun: false });

    expect(report.encodingFilled).toBe(1);
    expect(writtenColumns(executeRaw.mock.calls[0])['documentContentEncoding']).toBe('identity');
  });

  it('re-derives text when the stored version is behind', async () => {
    findMany.mockResolvedValue([storedRow({ textExtractionVersion: 'v1-htmltotext-normalised' })]);
    const report = await reconcileAgainstCdx({ url: URL_, dryRun: false });
    expect(report.textRederived).toBe(1);
    expect(writtenColumns(executeRaw.mock.calls[0])['textExtractionVersion']).toBe(V2);
  });

  // -------------------------------------------------------------------------
  // THE FAST PATH SKIPS ONLY WHEN ALL THREE INPUTS HOLD.
  //
  // Written after a mutation SURVIVED: dropping the textExtractionVersion check
  // from the skip condition passed all 31 tests. The existing "re-derives when
  // the version is behind" case does not catch it, because its verdict carries a
  // NULL encoding — so the skip was already blocked for a different reason, and
  // the version conjunct was never the thing under test.
  //
  // The consequence is not cosmetic: after a textExtractionVersion bump, a
  // VERIFIED row with its encoding already stored would be skipped and left at
  // the old version — leaving the corpus in the two-partial-states condition this
  // tool's own header exists to prevent.
  // -------------------------------------------------------------------------
  it('does NOT skip a verified row whose text version is behind, even with the encoding stored', async () => {
    verify.mockResolvedValue(
      verification([verdict({ verdict: 'VERIFIED', contentEncoding: 'identity' })]),
    );
    findMany.mockResolvedValue([storedRow({ textExtractionVersion: 'v1-htmltotext-normalised' })]);

    const report = await reconcileAgainstCdx({ url: URL_, dryRun: false });

    expect(report.textRederived).toBe(1);
    expect(report.unchanged).toBe(0);
    expect(fetchBytes).toHaveBeenCalled();
    expect(writtenColumns(executeRaw.mock.calls[0])['textExtractionVersion']).toBe(V2);
  });

  it('DOES skip a verified row that is already complete — the fast path working', async () => {
    verify.mockResolvedValue(
      verification([verdict({ verdict: 'VERIFIED', contentEncoding: 'identity' })]),
    );
    findMany.mockResolvedValue([storedRow()]);

    const report = await reconcileAgainstCdx({ url: URL_, dryRun: false });

    expect(report.unchanged).toBe(1);
    // The point of the fast path: no Archive request for a capture that cannot
    // change.
    expect(fetchBytes).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('keeps the STORED bytes when only the version moved — it re-derives, never re-fetches into place', async () => {
    findMany.mockResolvedValue([storedRow({ textExtractionVersion: 'v1-htmltotext-normalised' })]);
    await reconcileAgainstCdx({ url: URL_, dryRun: false });
    const cols = writtenColumns(executeRaw.mock.calls[0]);
    expect(cols['document']).toEqual(SERVED);
    // SHA-256 of the payload, per schema.prisma and recordCapture — never the
    // CDX digest, which is base32(SHA-1) and belongs to the verifier alone.
    expect(cols['documentHash']).toBe(sha256Bytes(SERVED));
    expect(cols['documentHash']).not.toBe(CDX);
  });
});

describe('reconcileAgainstCdx discriminates which side is wrong', () => {
  it('REPAIRS when stored disagrees and a fresh fetch reproduces the index', async () => {
    verify.mockResolvedValue(verification([verdict({ verdict: 'CONTRADICTED', ourDigest: cdxDigestOf(WRONG) })]));
    findMany.mockResolvedValue([storedRow({ document: WRONG })]);
    fetchBytes.mockResolvedValue({ bytes: SERVED, contentType: CT, contentEncoding: 'gzip' });

    const report = await reconcileAgainstCdx({ url: URL_, dryRun: false });

    expect(report.repaired).toBe(1);
    const cols = writtenColumns(executeRaw.mock.calls[0]);
    expect(cols['document']).toEqual(SERVED);
    expect(cols['documentHash']).toBe(sha256Bytes(SERVED));
    expect(cols['documentHash']).not.toBe(CDX);
    expect(cols['documentContentEncoding']).toBe('gzip');
  });

  it('DOES NOT overwrite when the fresh fetch also disagrees with the index', async () => {
    verify.mockResolvedValue(verification([verdict({ verdict: 'CONTRADICTED', ourDigest: cdxDigestOf(WRONG) })]));
    findMany.mockResolvedValue([storedRow({ document: WRONG })]);
    fetchBytes.mockResolvedValue({
      bytes: Buffer.from('<p>a third answer</p>', 'utf8'),
      contentType: CT,
      contentEncoding: 'gzip',
    });

    const report = await reconcileAgainstCdx({ url: URL_, dryRun: false });

    expect(report.archiveContradicted).toBe(1);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('does not write an encoding describing bytes it did not keep', async () => {
    // The encoding observed belongs to the fetched payload. Storing it beside
    // bytes we declined to replace would describe the wrong thing.
    verify.mockResolvedValue(verification([verdict({ verdict: 'CONTRADICTED', ourDigest: cdxDigestOf(WRONG) })]));
    findMany.mockResolvedValue([storedRow({ document: WRONG })]);
    fetchBytes.mockResolvedValue({ bytes: Buffer.from('other', 'utf8'), contentType: CT, contentEncoding: 'gzip' });

    const report = await reconcileAgainstCdx({ url: URL_, dryRun: false });

    expect(report.outcomes[0].contentEncoding).toBeUndefined();
  });
});

describe('the superset check', () => {
  it('flags text moving while the bytes did not — v2 is then NOT a superset of v1', async () => {
    // inflateDocument must be a no-op on uncompressed input. If re-deriving
    // moves the text of a row whose bytes are unchanged, that assumption is
    // wrong and this is a stop condition, not a rounding error.
    findMany.mockResolvedValue([storedRow({ text: 'something the derivation does not produce' })]);

    const report = await reconcileAgainstCdx({ url: URL_, dryRun: false });

    expect(report.textChangedWithoutByteChange).toBe(1);
  });

  it('does not flag text changing when the BYTES changed — that is the repair working', async () => {
    verify.mockResolvedValue(verification([verdict({ verdict: 'CONTRADICTED', ourDigest: cdxDigestOf(WRONG) })]));
    findMany.mockResolvedValue([storedRow({ document: WRONG, text: deriveText(WRONG, CT, null).text })]);
    fetchBytes.mockResolvedValue({ bytes: SERVED, contentType: CT, contentEncoding: 'gzip' });

    const report = await reconcileAgainstCdx({ url: URL_, dryRun: false });

    expect(report.repaired).toBe(1);
    expect(report.textChangedWithoutByteChange).toBe(0);
  });

  it('reports FAILED, not success, when the update matches no row', async () => {
    findMany.mockResolvedValue([storedRow({ textExtractionVersion: 'v1-htmltotext-normalised' })]);
    executeRaw.mockResolvedValue(0);
    const report = await reconcileAgainstCdx({ url: URL_, dryRun: false });
    expect(report.failed).toBe(1);
    expect(report.textRederived).toBe(0);
  });

  it('one unreachable capture does not abandon the rest', async () => {
    verify.mockResolvedValue(
      verification([verdict(), verdict({ snapshotId: 'snap-2', waybackTimestamp: '20220407202405' })]),
    );
    findMany.mockResolvedValue([storedRow(), storedRow({ id: 'snap-2' })]);
    fetchBytes
      .mockRejectedValueOnce(new Error('archive offline'))
      .mockResolvedValue({ bytes: SERVED, contentType: CT, contentEncoding: null });

    const report = await reconcileAgainstCdx({ url: URL_, dryRun: false });

    expect(report.failed).toBe(1);
    expect(report.unchanged).toBe(1);
  });
});
