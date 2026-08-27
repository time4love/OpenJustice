jest.mock('../src/lib/prisma', () => ({
  prisma: {
    urlSnapshot: { count: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  },
}));

jest.mock('../src/lib/archiveHttp', () => ({
  fetchCaptureBytes: jest.fn(),
}));

import { prisma } from '../src/lib/prisma';
import { fetchCaptureBytes } from '../src/lib/archiveHttp';
import {
  backfillDocumentBytes,
  countSnapshotsWithoutDocument,
} from '../src/services/backfillDocumentBytes';
import { deriveText, sha256Bytes } from '../src/lib/captureDocument';

const count = prisma.urlSnapshot.count as jest.Mock;
const findMany = prisma.urlSnapshot.findMany as jest.Mock;
const updateMany = prisma.urlSnapshot.updateMany as jest.Mock;
const fetchBytes = fetchCaptureBytes as jest.Mock;

const URL_ = 'https://corona.health.gov.il/vaccine-for-covid/';
const CT = 'text/html; charset=utf-8';
const PAYLOAD = Buffer.from('<p>the article</p><a href="/report">דיווח</a>', 'utf8');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'snap-1',
    waybackTimestamp: '20220306141507',
    text: deriveText(PAYLOAD, CT).text,
    trackedUrl: { url: URL_ },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  count.mockResolvedValue(1);
  findMany.mockResolvedValue([row()]);
  updateMany.mockResolvedValue({ count: 1 });
  fetchBytes.mockResolvedValue({ bytes: PAYLOAD, contentType: CT });
});

describe('countSnapshotsWithoutDocument', () => {
  it('counts on documentHash being null, not on the payload column', async () => {
    // documentHash is the cheap discriminator; selecting a BYTEA column to ask
    // whether it is null would pull every payload into memory to answer a
    // question a hash already answers.
    await countSnapshotsWithoutDocument(URL_);
    const where = count.mock.calls[0][0].where as Record<string, unknown>;
    expect(where['documentHash']).toBeNull();
    expect(where).not.toHaveProperty('document');
  });
});

describe('backfillDocumentBytes', () => {
  it('writes NOTHING on a dry run, which is the default', async () => {
    const report = await backfillDocumentBytes({ dryRun: true, url: URL_ });
    expect(fetchBytes).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(report.rows).toHaveLength(1);
  });

  it('stores the payload, its charset, and the recomputed text', async () => {
    await backfillDocumentBytes({ dryRun: false, url: URL_ });

    const data = updateMany.mock.calls[0][0].data as Record<string, unknown>;
    expect(data['document']).toEqual(PAYLOAD);
    expect(data['documentHash']).toBe(sha256Bytes(PAYLOAD));
    expect(data['documentContentType']).toBe(CT);
    expect(data['textHash']).toBe(deriveText(PAYLOAD, CT).textHash);
    expect(data['textExtractionVersion']).toBe(deriveText(PAYLOAD, CT).textExtractionVersion);
  });

  it('guards every write with documentHash IS NULL — fills, never overwrites', async () => {
    // Enforced by the database rather than by having checked a moment earlier.
    // A refetch that disagrees with a payload already stored is a finding; it
    // must never quietly replace one.
    await backfillDocumentBytes({ dryRun: false, url: URL_ });
    const where = updateMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where['documentHash']).toBeNull();
    expect(where['id']).toBe('snap-1');
  });

  it('REPORTS a recomputed text that differs from the stored one', async () => {
    // The decoded-string path and the bytes path disagreeing about a capture is
    // worth knowing, because the stored text was the only thing this platform
    // held until now. Reported, never silently resolved.
    findMany.mockResolvedValue([row({ text: 'something else entirely' })]);

    const report = await backfillDocumentBytes({ dryRun: false, url: URL_ });

    expect(report.textChanged).toBe(1);
    expect(report.rows[0].textChanged).toBe(true);
  });

  it('does not report a change when the recomputation agrees', async () => {
    const report = await backfillDocumentBytes({ dryRun: false, url: URL_ });
    expect(report.textChanged).toBe(0);
    expect(report.rows[0].textChanged).toBe(false);
  });

  it('refuses an empty payload rather than storing one', async () => {
    fetchBytes.mockResolvedValue({ bytes: Buffer.alloc(0), contentType: CT });

    const report = await backfillDocumentBytes({ dryRun: false, url: URL_ });

    expect(updateMany).not.toHaveBeenCalled();
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0].error).toMatch(/empty payload/);
  });

  it('reports a non-archived capture instead of skipping it silently', async () => {
    // A DIRECT or ASSERTED capture cannot be refetched from the Archive. That is
    // a different problem, and a silent skip would leave it looking backfilled.
    findMany.mockResolvedValue([row({ waybackTimestamp: null })]);

    const report = await backfillDocumentBytes({ dryRun: false, url: URL_ });

    expect(fetchBytes).not.toHaveBeenCalled();
    expect(report.failures[0].error).toMatch(/not an archived capture/);
  });

  it('one unreachable capture does not abandon the rest', async () => {
    findMany.mockResolvedValue([row({ id: 'a' }), row({ id: 'b' })]);
    fetchBytes
      .mockRejectedValueOnce(new Error('archive offline'))
      .mockResolvedValue({ bytes: PAYLOAD, contentType: CT });

    const report = await backfillDocumentBytes({ dryRun: false, url: URL_ });

    expect(report.failures).toHaveLength(1);
    expect(report.filled).toBe(1);
  });

  it('counts a row another writer filled first as filled, not as an error', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const report = await backfillDocumentBytes({ dryRun: false, url: URL_ });
    expect(report.failures).toHaveLength(0);
    expect(report.filled).toBe(0);
  });
});
