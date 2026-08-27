jest.mock('axios');

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn() },
    urlSnapshot: { findMany: jest.fn(), count: jest.fn() },
  },
}));

jest.mock('../src/lib/archiveHttp', () => {
  const actual = jest.requireActual('../src/lib/archiveHttp');
  return {
    ...actual,
    fetchCaptureBytes: jest.fn(),
    sleep: jest.fn().mockResolvedValue(undefined),
    withRetry: (fn: () => Promise<unknown>) => fn(),
  };
});

jest.mock('../src/lib/archiveText', () => ({
  extractArticleText: jest.fn((html: string) => `ARTICLE:${html}`),
}));

jest.mock('../src/services/recordCapture', () => {
  const actual = jest.requireActual('../src/services/recordCapture');
  return { ...actual, recordCapture: jest.fn() };
});

import axios from 'axios';
import { prisma } from '../src/lib/prisma';
import { fetchCaptureBytes } from '../src/lib/archiveHttp';
import { recordCapture } from '../src/services/recordCapture';
import { recoverMissingCaptures, fetchAllCdxRows } from '../src/services/recoverMissingCaptures';

const mockGet = axios.get as jest.Mock;
const trackedFind = prisma.trackedUrl.findUnique as jest.Mock;
const snapFindMany = prisma.urlSnapshot.findMany as jest.Mock;
const snapCount = prisma.urlSnapshot.count as jest.Mock;
const mockFetchBytes = fetchCaptureBytes as jest.Mock;
const mockRecord = recordCapture as jest.Mock;

const URL_ = 'https://corona.health.gov.il/vaccine-for-covid/';

/** CDX rows where STATE_A recurs — a revert, not a duplicate. */
const CDX = [
  ['timestamp', 'digest'],
  ['20220613113551', 'STATE_A'],
  ['20220620061146', 'STATE_B'],
  ['20220622054435', 'STATE_A'],
  ['20220622115810', 'STATE_A'],
];

function cdxResponse(rows: string[][]) {
  return { data: rows, status: 200, statusText: 'OK', headers: {}, config: {} };
}

beforeEach(() => {
  jest.clearAllMocks();
  trackedFind.mockResolvedValue({ id: 'tracked-1' });
  mockGet.mockResolvedValue(cdxResponse(CDX));
  mockFetchBytes.mockResolvedValue({ bytes: Buffer.from('<html>page</html>'), contentType: 'text/html; charset=utf-8' });
  snapCount.mockResolvedValue(4);
  mockRecord.mockResolvedValue({
    id: 'new-id',
    waybackTimestamp: '20220622054435',
    capturedAt: new Date(),
    contentHash: 'c'.repeat(64),
    documentHash: 'd'.repeat(64),
    documentComparison: 'MATCHES',
    outcome: 'CREATED',
    anchoring: Promise.resolve({ kind: 'COPIED_FROM_TWIN', txHash: '0xabc' }),
  });
});

describe('fetchAllCdxRows', () => {
  it('keeps every row, reverts included, and does not paginate', async () => {
    // Deliberately NOT reusing WaybackScraper.getSnapshotsList: that paginates
    // at MAX_SNAPSHOTS, and pagination is the mechanism that made the old rule's
    // answer depend on where a batch boundary fell.
    const rows = await fetchAllCdxRows(URL_);
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.digest === 'STATE_A')).toHaveLength(3);

    const calledUrl = mockGet.mock.calls[0][0] as string;
    expect(calledUrl).toContain('collapse=digest'); // consecutive-only, server-side
    expect(calledUrl).not.toContain('limit='); // no pagination
  });

  it('drops rows whose timestamp is not 14 digits rather than passing them on', async () => {
    mockGet.mockResolvedValue(
      cdxResponse([
        ['timestamp', 'digest'],
        ['2022061311355', 'SHORT'],
        ['20220620061146', 'GOOD'],
      ]),
    );
    const rows = await fetchAllCdxRows(URL_);
    expect(rows.map((r) => r.digest)).toEqual(['GOOD']);
  });

  it('refuses a non-http protocol', async () => {
    await expect(fetchAllCdxRows('ftp://health.gov.il/page')).rejects.toThrow('http or https');
  });
});

describe('recoverMissingCaptures', () => {
  it('fetches only what is missing, and identifies it by Archive timestamp', async () => {
    snapFindMany.mockResolvedValue([
      { waybackTimestamp: '20220613113551' },
      { waybackTimestamp: '20220620061146' },
    ]);

    const report = await recoverMissingCaptures({ url: URL_, dryRun: false });

    expect(report.cdxRows).toBe(4);
    expect(report.storedBefore).toBe(2);
    expect(report.missing).toBe(2);
    expect(mockRecord).toHaveBeenCalledTimes(2);
    const recorded = mockRecord.mock.calls.map(
      (c) => (c[0] as { waybackTimestamp: string }).waybackTimestamp,
    );
    expect(recorded).toEqual(['20220622054435', '20220622115810']);
  });

  it('recovers a REVERT — a capture whose digest is already stored under another timestamp', async () => {
    // The whole point. STATE_A is already stored at 20220613113551, and the two
    // later captures repeat that digest. A rule that deduplicated on digest
    // would recover neither; eleven such observations were lost that way.
    snapFindMany.mockResolvedValue([{ waybackTimestamp: '20220613113551' }]);

    const report = await recoverMissingCaptures({ url: URL_, dryRun: false });

    expect(report.missing).toBe(3);
    const recorded = mockRecord.mock.calls.map(
      (c) => (c[0] as { waybackTimestamp: string }).waybackTimestamp,
    );
    expect(recorded).toContain('20220622054435');
    expect(recorded).toContain('20220622115810');
  });

  it('writes NOTHING on a dry run, which is the default', async () => {
    snapFindMany.mockResolvedValue([]);
    const report = await recoverMissingCaptures({ url: URL_, dryRun: true });

    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockFetchBytes).not.toHaveBeenCalled();
    expect(report.recovered).toHaveLength(4);
    expect(report.recovered[0].outcome).toBeUndefined();
  });

  it('creates no diffs and classifies nothing — the capture layer only', async () => {
    // Level 5 owns re-pairing. A diff created here would be written by the
    // current unverified classifier and re-verified when Level 5 lands, paying
    // for the same classification twice.
    snapFindMany.mockResolvedValue([]);
    await recoverMissingCaptures({ url: URL_, dryRun: false });

    expect(prisma).not.toHaveProperty('urlVersionDiff');
  });

  it('reports the anchoring branch per capture, not as an aggregate "anchored"', async () => {
    snapFindMany.mockResolvedValue([{ waybackTimestamp: '20220613113551' }]);
    const report = await recoverMissingCaptures({ url: URL_, dryRun: false });

    expect(report.recovered.map((r) => r.anchoring)).toEqual([
      'COPIED_FROM_TWIN',
      'COPIED_FROM_TWIN',
      'COPIED_FROM_TWIN',
    ]);
  });

  it('reports ATTEMPT_FAILED distinctly from a concluded outcome', async () => {
    // null means the attempt failed; every SnapshotAnchorOutcome describes an
    // attempt that reached a conclusion. Collapsing them would make a failure
    // read as a decision.
    snapFindMany.mockResolvedValue([]);
    mockRecord.mockResolvedValue({
      id: 'x',
      waybackTimestamp: '20220613113551',
      capturedAt: new Date(),
      contentHash: 'c'.repeat(64),
      documentHash: 'd'.repeat(64),
      documentComparison: 'MATCHES',
      outcome: 'CREATED',
      anchoring: Promise.resolve(null),
    });
    const report = await recoverMissingCaptures({ url: URL_, dryRun: false });
    expect(report.recovered[0].anchoring).toBe('ATTEMPT_FAILED');
  });

  it('reports NOT_ATTEMPTED when the capture was already anchored', async () => {
    snapFindMany.mockResolvedValue([]);
    mockRecord.mockResolvedValue({
      id: 'x',
      waybackTimestamp: '20220613113551',
      capturedAt: new Date(),
      contentHash: 'c'.repeat(64),
      documentHash: 'd'.repeat(64),
      documentComparison: 'MATCHES',
      outcome: 'EXISTS',
      // no `anchoring` — recordCapture omits it when onChainTxHash is set
    });
    const report = await recoverMissingCaptures({ url: URL_, dryRun: false });
    expect(report.recovered[0].anchoring).toBe('NOT_ATTEMPTED');
  });

  it('surfaces the payload comparison rather than folding it into a success', async () => {
    snapFindMany.mockResolvedValue([]);
    mockRecord.mockResolvedValue({
      id: 'x',
      waybackTimestamp: '20220613113551',
      capturedAt: new Date(),
      contentHash: 'c'.repeat(64),
      documentHash: 'd'.repeat(64),
      documentComparison: 'DIVERGED',
      outcome: 'EXISTS',
    });
    const report = await recoverMissingCaptures({ url: URL_, dryRun: false });
    expect(report.recovered[0].documentComparison).toBe('DIVERGED');
  });

  it('one unreachable capture does not abandon the rest', async () => {
    snapFindMany.mockResolvedValue([]);
    mockFetchBytes
      .mockRejectedValueOnce(new Error('archive offline'))
      .mockResolvedValue({ bytes: Buffer.from('<html>page</html>'), contentType: 'text/html' });

    const report = await recoverMissingCaptures({ url: URL_, dryRun: false });

    expect(report.recovered[0].error).toBe('archive offline');
    expect(report.recovered).toHaveLength(4);
    expect(mockRecord).toHaveBeenCalledTimes(3);
  });

  it('honours --limit so a single capture can be tried first', async () => {
    snapFindMany.mockResolvedValue([]);
    const report = await recoverMissingCaptures({ url: URL_, dryRun: false, limit: 1 });

    expect(report.missing).toBe(4); // reports the true total...
    expect(mockRecord).toHaveBeenCalledTimes(1); // ...but writes only one
  });

  it('refuses a URL this platform does not track', async () => {
    trackedFind.mockResolvedValue(null);
    await expect(recoverMissingCaptures({ url: URL_, dryRun: true })).rejects.toThrow(
      'No tracked URL found',
    );
  });
});
