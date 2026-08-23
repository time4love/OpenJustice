// ---------------------------------------------------------------------------
// The unavailable states.
//
// The recurring defect this codebase has paid for repeatedly is reporting
// "could not check" as "checked and found nothing". Every assertion here is
// about that: a capture the archive does not hold, a fetch that failed, a URL
// nobody tracks, and a capture list cut short must each be a distinct, named
// outcome — never a `false` that reads as a finding.
//
// jsdom and Readability are mocked away here, as in every other unit test in
// this suite. What the extractor really does is measured in
// test/extraction/, against a frozen real capture.
// ---------------------------------------------------------------------------

jest.mock('axios');
jest.mock('jsdom', () => ({
  JSDOM: jest.fn().mockImplementation((html: string) => ({
    window: { document: { body: { innerHTML: html } } },
  })),
}));
jest.mock('@mozilla/readability', () => ({
  Readability: jest.fn().mockImplementation(() => ({ parse: () => null })),
}));
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findFirst: jest.fn() },
    urlSnapshot: { findMany: jest.fn() },
  },
}));

import axios from 'axios';
import { prisma } from '../src/lib/prisma';
import {
  fetchCaptureIndex,
  listCaptures,
  verifyClaimText,
} from '../src/services/archiveVerification';
import { WaybackFetchError } from '../src/lib/archiveHttp';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const findTracked = prisma.trackedUrl.findFirst as jest.Mock;
const findSnapshots = prisma.urlSnapshot.findMany as jest.Mock;

const URL = 'https://corona.health.gov.il/vaccine-for-covid/';

/** A CDX response body: header row plus one row per capture. */
function cdxRows(rows: Array<[string, string, string]>): unknown[][] {
  return [['timestamp', 'digest', 'statuscode'], ...rows];
}

function axiosError(status?: number): Error & { isAxiosError: true; response?: { status: number } } {
  const err = new Error(`HTTP ${status ?? 'none'}`) as Error & {
    isAxiosError: true;
    response?: { status: number };
  };
  err.isAxiosError = true;
  if (status !== undefined) err.response = { status };
  return err;
}

beforeEach(() => {
  (mockedAxios as unknown as { isAxiosError: (e: unknown) => boolean }).isAxiosError = ((
    e: unknown,
  ) => Boolean((e as { isAxiosError?: boolean })?.isAxiosError)) as never;
  findTracked.mockResolvedValue({ id: 'tracked-1' });
  findSnapshots.mockResolvedValue([]);
});

describe('fetchCaptureIndex', () => {
  it('does NOT collapse by digest — an unchanged capture is evidence the page had not changed', async () => {
    mockedAxios.get.mockResolvedValue({ data: cdxRows([['20220805010101', 'AAA', '200']]) });

    await fetchCaptureIndex(URL);

    const requested = mockedAxios.get.mock.calls[0][0] as string;
    expect(requested).not.toContain('collapse');
  });

  it('reports truncation instead of silently shortening the history', async () => {
    mockedAxios.get.mockResolvedValue({
      data: cdxRows([
        ['20220805010101', 'AAA', '200'],
        ['20220806010101', 'BBB', '200'],
        ['20220807010101', 'CCC', '200'],
      ]),
    });

    const index = await fetchCaptureIndex(URL, { limit: 2 });

    expect(index.available).toBe(true);
    if (!index.available) throw new Error('unreachable');
    expect(index.captures).toHaveLength(2);
    expect(index.truncated).toBe(true);
  });

  it('sorts ascending rather than trusting CDX ordering — every interval answer depends on it', async () => {
    mockedAxios.get.mockResolvedValue({
      data: cdxRows([
        ['20220907010101', 'CCC', '200'],
        ['20220805010101', 'AAA', '200'],
      ]),
    });

    const index = await fetchCaptureIndex(URL);

    if (!index.available) throw new Error('unreachable');
    expect(index.captures.map((c) => c.waybackTimestamp)).toEqual([
      '20220805010101',
      '20220907010101',
    ]);
  });

  it('treats an empty CDX body as "no captures", which is a real answer', async () => {
    mockedAxios.get.mockResolvedValue({ data: [] });

    const index = await fetchCaptureIndex(URL);

    expect(index.available).toBe(true);
    if (!index.available) throw new Error('unreachable');
    expect(index.captures).toEqual([]);
  });

  it('treats a CDX failure as unavailable, never as "no captures"', async () => {
    mockedAxios.get.mockRejectedValue(axiosError(503));

    const index = await fetchCaptureIndex(URL);

    expect(index.available).toBe(false);
    if (index.available) throw new Error('unreachable');
    expect(index.offline).toBe(true);
  });
});

describe('listCaptures', () => {
  it('refuses to answer for an untracked URL rather than implying an empty archive', async () => {
    findTracked.mockResolvedValue(null);

    const result = await listCaptures(URL);

    expect(result.status).toBe('NOT_TRACKED');
    if (result.status !== 'NOT_TRACKED') throw new Error('unreachable');
    expect(result.message).toContain('NOT a statement');
  });

  it('distinguishes stored captures from archive-only ones', async () => {
    mockedAxios.get.mockResolvedValue({
      data: cdxRows([
        ['20220805010101', 'AAA', '200'],
        ['20220806010101', 'BBB', '200'],
      ]),
    });
    findSnapshots.mockResolvedValue([
      {
        waybackTimestamp: '20220805010101',
        snapshotDate: '2022-08-05',
        snapshotUrl: 'https://web.archive.org/web/20220805010101/x',
        contentHash: 'hash-a',
        onChainTxHash: '0xabc',
      },
    ]);

    const result = await listCaptures(URL);

    if (result.status !== 'OK') throw new Error('unreachable');
    expect(result.counts).toEqual({
      inArchive: 2,
      storedLocally: 1,
      storedNotInArchiveIndex: 0,
    });
    expect(result.captures.map((c) => c.storedLocally)).toEqual([true, false]);
    expect(result.captures[0].storedOnChainTxHash).toBe('0xabc');
  });

  it('reports a stored capture the archive index did not return — the two sources disagreeing is itself a finding', async () => {
    mockedAxios.get.mockResolvedValue({ data: cdxRows([['20220805010101', 'AAA', '200']]) });
    findSnapshots.mockResolvedValue([
      {
        waybackTimestamp: '20220901010101',
        snapshotDate: '2022-09-01',
        snapshotUrl: 'https://web.archive.org/web/20220901010101/x',
        contentHash: 'hash-z',
        onChainTxHash: null,
      },
    ]);

    const result = await listCaptures(URL);

    if (result.status !== 'OK') throw new Error('unreachable');
    expect(result.counts.storedNotInArchiveIndex).toBe(1);
    expect(result.captures.map((c) => c.waybackTimestamp)).toEqual([
      '20220805010101',
      '20220901010101',
    ]);
  });

  it('returns stored captures with an explicit warning when the archive is unreachable', async () => {
    mockedAxios.get.mockRejectedValue(axiosError(503));
    findSnapshots.mockResolvedValue([
      {
        waybackTimestamp: '20220805010101',
        snapshotDate: '2022-08-05',
        snapshotUrl: 'https://web.archive.org/web/20220805010101/x',
        contentHash: 'hash-a',
        onChainTxHash: null,
      },
    ]);

    const result = await listCaptures(URL);

    expect(result.status).toBe('ARCHIVE_UNAVAILABLE');
    if (result.status !== 'ARCHIVE_UNAVAILABLE') throw new Error('unreachable');
    expect(result.storedCaptures).toHaveLength(1);
    expect(result.message).toContain('wider than the truth');
  });
});

describe('verifyClaimText — unavailable states', () => {
  it('refuses to answer for an untracked URL', async () => {
    findTracked.mockResolvedValue(null);

    const result = await verifyClaimText({ url: URL, capture: '20220805010101', phrase: 'anything' });

    expect(result.status).toBe('NOT_TRACKED');
  });

  it('reports a capture the archive does not hold as unavailable, never as "phrase absent"', async () => {
    mockedAxios.get.mockRejectedValue(axiosError(404));

    const result = await verifyClaimText({ url: URL, capture: '20220805010101', phrase: 'anything' });

    if (result.status !== 'OK') throw new Error('unreachable');
    expect(result.checks[0].outcome).toBe('CAPTURE_NOT_IN_ARCHIVE');
    expect(result.checks[0].presentInRawArchive).toBeUndefined();
    expect(result.capturesChecked).toBe(0);
    expect(result.anyExtractionDivergence).toBe(false);
  });

  it('reports a fetch failure as unavailable, never as "phrase absent"', async () => {
    mockedAxios.get.mockRejectedValue(axiosError(500));

    const result = await verifyClaimText({ url: URL, capture: '20220805010101', phrase: 'anything' });

    if (result.status !== 'OK') throw new Error('unreachable');
    expect(result.checks[0].outcome).toBe('FETCH_FAILED');
    expect(result.checks[0].presentInRawArchive).toBeUndefined();
    expect(result.capturesChecked).toBe(0);
  });

  it('distinguishes a 404 from every other failure — they are different facts', async () => {
    const notFound = new WaybackFetchError('gone', false, 404);
    const outage = new WaybackFetchError('down', true, 503);

    expect(notFound.status).toBe(404);
    expect(outage.offline).toBe(true);
  });

  it('reports a date with no captures as NO_CAPTURE_FOR_DATE with the bracketing captures', async () => {
    mockedAxios.get
      // captures on the date itself: none
      .mockResolvedValueOnce({ data: [] })
      // nearest before
      .mockResolvedValueOnce({ data: cdxRows([['20220805010101', 'AAA', '200']]) })
      // nearest after
      .mockResolvedValueOnce({ data: cdxRows([['20220906232435', 'BBB', '200']]) });

    const result = await verifyClaimText({ url: URL, capture: '2022-08-20', phrase: 'anything' });

    expect(result.status).toBe('NO_CAPTURE_FOR_DATE');
    if (result.status !== 'NO_CAPTURE_FOR_DATE') throw new Error('unreachable');
    expect(result.nearestBefore?.date).toBe('2022-08-05');
    expect(result.nearestAfter?.date).toBe('2022-09-06');
  });

  it('reports an archive outage while resolving a date as unavailable, not as "no captures"', async () => {
    mockedAxios.get.mockRejectedValue(axiosError(503));

    const result = await verifyClaimText({ url: URL, capture: '2022-08-20', phrase: 'anything' });

    expect(result.status).toBe('ARCHIVE_UNAVAILABLE');
    if (result.status !== 'ARCHIVE_UNAVAILABLE') throw new Error('unreachable');
    expect(result.message).toContain('Nothing was checked');
  });
});

describe('verifyClaimText — bounding a date with many captures', () => {
  it('caps the captures it downloads for one date and says how many it left', async () => {
    const many = Array.from({ length: 13 }, (_, i) =>
      [`202208051${String(i).padStart(5, '0')}`, `D${String(i)}`, '200'] as [string, string, string],
    );
    mockedAxios.get.mockImplementation(async (requested: unknown) =>
      String(requested).includes('/cdx/')
        ? { data: cdxRows(many) }
        : { data: '<html><body><p>nothing here</p></body></html>' },
    );

    const result = await verifyClaimText({ url: URL, capture: '2022-08-05', phrase: 'anything' });

    if (result.status !== 'OK') throw new Error('unreachable');
    expect(result.checks).toHaveLength(10);
    expect(result.capturesNotChecked).toBe(3);
  });
});
