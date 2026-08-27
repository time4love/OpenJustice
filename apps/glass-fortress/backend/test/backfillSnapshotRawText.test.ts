const queryRaw = jest.fn();
const executeRaw = jest.fn();
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
// $queryRaw / $executeRaw rather than the typed model API, because the service
// deliberately uses raw SQL: it repairs environments whose schema LAGS HEAD, and
// HEAD declares rawText NOT NULL, so `rawText: null` no longer type-checks as a
// Prisma filter. See the rationale block in the service itself.
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $executeRaw: (...args: unknown[]) => executeRaw(...args),
  },
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

const row = (id: string, ts: string) => ({ id, waybackTimestamp: ts, url: URL });

/** The SQL a tagged-template call carried, with `?` where each value was bound. */
const sqlOf = (call: unknown[]): string => (call[0] as readonly string[]).join('?');
/** The values bound into a tagged-template call — everything after the strings. */
const paramsOf = (call: unknown[]): unknown[] => call.slice(1);

/** Rows the pending-snapshots query should return. */
let pendingRows: ReturnType<typeof row>[] = [];
/** Successive shortfall counts. One value is reused; several are consumed in order. */
let countValues: number[] = [];

beforeEach(() => {
  queryRaw.mockReset();
  executeRaw.mockReset();
  fetchCaptureHtml.mockReset();
  pendingRows = [];
  countValues = [0];

  // Both reads go through $queryRaw, so they are told apart by their SQL rather
  // than by call order — the service is free to reorder them without silently
  // changing what this test believes it is asserting.
  queryRaw.mockImplementation((strings: readonly string[]) => {
    if (strings.join('?').includes('count(*)')) {
      const n = countValues.length > 1 ? (countValues.shift() as number) : (countValues[0] ?? 0);
      return Promise.resolve([{ n: BigInt(n) }]);
    }
    return Promise.resolve(pendingRows);
  });
  executeRaw.mockResolvedValue(1);
});

const updateCalls = (): unknown[][] =>
  executeRaw.mock.calls.filter((c) => sqlOf(c as unknown[]).includes('UPDATE')) as unknown[][];

describe('backfillSnapshotRawText', () => {
  it('fills a snapshot that holds no document, and stores the hash beside it', async () => {
    pendingRows = [row('s1', '20220805053301')];
    countValues = [1, 0];
    fetchCaptureHtml.mockResolvedValue(PAGE_HTML);

    const result = await backfillSnapshotRawText({ dryRun: false });

    expect(result.filled).toBe(1);
    expect(result.failures).toEqual([]);
    expect(result.missingAtEnd).toBe(0);

    const [rawText, rawContentHash, id] = paramsOf(updateCalls()[0] as unknown[]) as string[];
    expect(rawText).toContain('נמצאו יעילים ובטוחים לשימוש');
    // 64 hex characters — a checksum stored so a later recomputation can DISAGREE
    // with it. Derived instead of stored, it would reproduce any corruption of
    // the text and call the row consistent.
    expect(rawContentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(id).toBe('s1');
  });

  it('guards every write with rawText IS NULL — it fills, it never overwrites', async () => {
    // A refetch that disagrees with a stored document means the Internet Archive's
    // own copy changed. That is a finding to surface, never something this script
    // may paper over, so the guard is in the WHERE clause rather than in a comment.
    pendingRows = [row('s1', '20220805053301')];
    countValues = [1];
    fetchCaptureHtml.mockResolvedValue(PAGE_HTML);

    await backfillSnapshotRawText({ dryRun: false });

    const sql = sqlOf(updateCalls()[0] as unknown[]);
    expect(sql).toMatch(/WHERE\s+"id"\s*=\s*\?\s+AND\s+"rawText"\s+IS\s+NULL/u);
  });

  it('writes nothing on a dry run, and reports what it would have filled', async () => {
    pendingRows = [row('s1', '20220805053301')];
    countValues = [3];
    fetchCaptureHtml.mockResolvedValue(PAGE_HTML);

    const result = await backfillSnapshotRawText({ dryRun: true });

    expect(updateCalls()).toHaveLength(0);
    expect(result.filled).toBe(1);
    // The dry run must not claim the shortfall closed: it reports the count it
    // began with, because nothing changed.
    expect(result.missingAtEnd).toBe(3);
  });

  it('refuses to store an empty document rather than satisfy the column dishonestly', async () => {
    // An empty string would satisfy a NOT NULL constraint while meaning the
    // opposite of what the column exists to mean. The row must stay visibly
    // missing so the next run retries it.
    pendingRows = [row('s1', '20220805053301')];
    countValues = [1];
    fetchCaptureHtml.mockResolvedValue('<html><body>   </body></html>');

    const result = await backfillSnapshotRawText({ dryRun: false });

    expect(updateCalls()).toHaveLength(0);
    expect(result.filled).toBe(0);
    expect(result.failures[0]).toMatchObject({ reason: 'EMPTY_DOCUMENT', snapshotId: 's1' });
  });

  it('distinguishes an unreachable archive from a capture it does not hold', async () => {
    pendingRows = [row('s1', '20220805053301'), row('s2', '20220906232435')];
    countValues = [2];
    fetchCaptureHtml
      .mockRejectedValueOnce(new WaybackFetchError('archive did not answer', true))
      .mockRejectedValueOnce(new WaybackFetchError('no such capture', false));

    const result = await backfillSnapshotRawText({ dryRun: false });

    expect(result.filled).toBe(0);
    expect(result.failures.map((f) => f.reason)).toEqual(['OFFLINE', 'FETCH_FAILED']);
  });

  it('does not count a row another run filled first', async () => {
    // An UPDATE matching nothing means the `rawText IS NULL` guard rejected the
    // write — the row was filled concurrently. Counting it would overstate what
    // this run achieved.
    pendingRows = [row('s1', '20220805053301')];
    countValues = [1];
    fetchCaptureHtml.mockResolvedValue(PAGE_HTML);
    executeRaw.mockResolvedValue(0);

    const result = await backfillSnapshotRawText({ dryRun: false });

    expect(result.filled).toBe(0);
  });

  it('scopes the shortfall count to one page when asked', async () => {
    countValues = [7];

    await expect(countSnapshotsWithoutRawText(URL)).resolves.toBe(7);

    const call = queryRaw.mock.calls.find((c) =>
      sqlOf(c as unknown[]).includes('count(*)'),
    ) as unknown[];
    expect(sqlOf(call)).toContain('"rawText" IS NULL');
    expect(paramsOf(call)).toContain(URL);
  });

  it('counts every page when no URL is given, binding null rather than a URL', async () => {
    // The unscoped call must not silently become a scoped one: the `IS NULL`
    // branch in the predicate is what makes one query serve both, and binding a
    // stray value here would quietly count a single page as though it were all.
    countValues = [83];

    await expect(countSnapshotsWithoutRawText()).resolves.toBe(83);

    const call = queryRaw.mock.calls.find((c) =>
      sqlOf(c as unknown[]).includes('count(*)'),
    ) as unknown[];
    expect(paramsOf(call).every((p) => p === null)).toBe(true);
  });
});
