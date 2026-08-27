const findMany = jest.fn();
const count = jest.fn();
const updateMany = jest.fn();
const fetchCaptureHtml = jest.fn();

// jsdom and Readability are stubbed away as in every other unit test here — the
// service imports archiveText, whose ESM dependency chain ts-jest cannot parse
// untransformed. extractRawText itself is pure string work and never consults
// either, so it still runs for real below. What the EXTRACTOR really does is
// measured in test/extraction/ against frozen real captures.
jest.mock('jsdom', () => ({
  JSDOM: jest.fn().mockImplementation((html: string) => ({
    window: { document: { body: { innerHTML: html } } },
  })),
}));
jest.mock('@mozilla/readability', () => ({
  Readability: jest.fn().mockImplementation(() => ({ parse: () => null })),
}));
jest.mock('../src/lib/prisma', () => ({
  prisma: { urlSnapshot: { findMany, count, updateMany } },
}));
jest.mock('../src/lib/archiveHttp', () => ({
  ...jest.requireActual('../src/lib/archiveHttp'),
  fetchCaptureHtml: (...args: unknown[]) => fetchCaptureHtml(...args),
}));

import {
  backfillSnapshotRawText,
  countSnapshotsWithoutRawText,
} from '../src/services/backfillSnapshotRawText';
import { WaybackFetchError } from '../src/lib/archiveHttp';

const URL = 'https://corona.health.gov.il/vaccine-for-covid/';
const PAGE_HTML = '<html><body><p>תופעות הלוואי השכיחות</p><p>נמצאו יעילים ובטוחים לשימוש</p></body></html>';

const row = (id: string, ts: string) => ({
  id,
  waybackTimestamp: ts,
  trackedUrl: { url: URL },
});

beforeEach(() => {
  findMany.mockReset();
  count.mockReset();
  updateMany.mockReset();
  fetchCaptureHtml.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
});

describe('backfillSnapshotRawText', () => {
  it('fills a snapshot that holds no document, and stores the hash beside it', async () => {
    findMany.mockResolvedValue([row('s1', '20220805053301')]);
    count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    fetchCaptureHtml.mockResolvedValue(PAGE_HTML);

    const result = await backfillSnapshotRawText({ dryRun: false });

    expect(result.filled).toBe(1);
    expect(result.failures).toEqual([]);
    expect(result.missingAtEnd).toBe(0);

    const [call] = updateMany.mock.calls as [[{ where: unknown; data: Record<string, string> }]];
    expect(call[0].data.rawText).toContain('נמצאו יעילים ובטוחים לשימוש');
    // 64 hex characters — a checksum stored so a later recomputation can DISAGREE
    // with it. Derived instead of stored, it would reproduce any corruption of
    // the text and call the row consistent.
    expect(call[0].data.rawContentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('guards every write with rawText: null — it fills, it never overwrites', async () => {
    // A refetch that disagrees with a stored document means the Internet Archive's
    // own copy changed. That is a finding to surface, never something this script
    // may paper over, so the guard is in the WHERE clause rather than in a comment.
    findMany.mockResolvedValue([row('s1', '20220805053301')]);
    count.mockResolvedValue(1);
    fetchCaptureHtml.mockResolvedValue(PAGE_HTML);

    await backfillSnapshotRawText({ dryRun: false });

    const [call] = updateMany.mock.calls as [[{ where: Record<string, unknown> }]];
    expect(call[0].where).toEqual({ id: 's1', rawText: null });
  });

  it('writes nothing on a dry run, and reports what it would have filled', async () => {
    findMany.mockResolvedValue([row('s1', '20220805053301')]);
    count.mockResolvedValue(3);
    fetchCaptureHtml.mockResolvedValue(PAGE_HTML);

    const result = await backfillSnapshotRawText({ dryRun: true });

    expect(updateMany).not.toHaveBeenCalled();
    expect(result.filled).toBe(1);
    // The dry run must not claim the shortfall closed: it reports the count it
    // began with, because nothing changed.
    expect(result.missingAtEnd).toBe(3);
  });

  it('refuses to store an empty document rather than satisfy the column dishonestly', async () => {
    // An empty string would satisfy a NOT NULL constraint while meaning the
    // opposite of what the column exists to mean. The row must stay visibly
    // missing so the next run retries it.
    findMany.mockResolvedValue([row('s1', '20220805053301')]);
    count.mockResolvedValue(1);
    fetchCaptureHtml.mockResolvedValue('<html><body>   </body></html>');

    const result = await backfillSnapshotRawText({ dryRun: false });

    expect(updateMany).not.toHaveBeenCalled();
    expect(result.filled).toBe(0);
    expect(result.failures[0]).toMatchObject({ reason: 'EMPTY_DOCUMENT', snapshotId: 's1' });
  });

  it('distinguishes an unreachable archive from a capture it does not hold', async () => {
    findMany.mockResolvedValue([row('s1', '20220805053301'), row('s2', '20220906232435')]);
    count.mockResolvedValue(2);
    fetchCaptureHtml
      .mockRejectedValueOnce(new WaybackFetchError('archive did not answer', true))
      .mockRejectedValueOnce(new WaybackFetchError('no such capture', false));

    const result = await backfillSnapshotRawText({ dryRun: false });

    expect(result.filled).toBe(0);
    expect(result.failures.map((f) => f.reason)).toEqual(['OFFLINE', 'FETCH_FAILED']);
  });

  it('does not count a row another run filled first', async () => {
    // updateMany matching nothing means the rawText: null guard rejected the
    // write — the row was filled concurrently. Counting it would overstate what
    // this run achieved.
    findMany.mockResolvedValue([row('s1', '20220805053301')]);
    count.mockResolvedValue(1);
    fetchCaptureHtml.mockResolvedValue(PAGE_HTML);
    updateMany.mockResolvedValue({ count: 0 });

    const result = await backfillSnapshotRawText({ dryRun: false });

    expect(result.filled).toBe(0);
  });

  it('scopes the shortfall count to one page when asked', async () => {
    count.mockResolvedValue(7);
    await expect(countSnapshotsWithoutRawText(URL)).resolves.toBe(7);
    expect(count).toHaveBeenCalledWith({ where: { rawText: null, trackedUrl: { url: URL } } });
  });
});
