import { createHash } from 'crypto';
import { deriveText } from '../src/lib/captureDocument';
import { WaybackScraper } from '../src/services/WaybackScraper';
import {
  WaybackFetchError,
  isWaybackOffline,
  isTransientWaybackError,
  withRetry,
} from '../src/lib/archiveHttp';
import { ForensicAgent } from '../src/services/ForensicAgent';

// ---------------------------------------------------------------------------
// Mock dependencies — no real HTTP, DB, or AI calls
// ---------------------------------------------------------------------------

jest.mock('axios');
// JSDOM mock — sets body.textContent to the raw HTML so Readability can read it
jest.mock('jsdom', () => ({
  JSDOM: jest.fn().mockImplementation((html: string, _opts: unknown) => ({
    window: {
      document: {
        body: { textContent: html },
      },
    },
  })),
}));

// Readability mock — returns both content (HTML) and textContent so each call
// reflects the specific HTML that was fetched, enabling real diffs in tests.
// content is returned as a <p>-wrapped version so htmlToText exercises the
// block-element newline insertion path.
jest.mock('@mozilla/readability', () => ({
  Readability: jest
    .fn()
    .mockImplementation((doc: { body: { textContent: string } }) => ({
      parse: jest.fn().mockReturnValue({
        title: 'Mock Title',
        textContent: doc.body?.textContent ?? '',
        content: `<p>${doc.body?.textContent ?? ''}</p>`,
      }),
    })),
}));
jest.mock('../src/services/ForensicAgent');
jest.mock('../src/services/VectorStoreService', () => ({
  VectorStoreService: {
    create: jest.fn().mockResolvedValue({
      upsertEvidence: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

// analyzePageHistory now ADMITS rather than upserting a TrackedUrl directly —

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    // Recording a capture now looks up which era governs it. These fixtures
    // describe an UNCALIBRATED url, so the lookup finds no runs and the
    // derivation is the ruleset-free one.
    calibrationRun: { findMany: jest.fn().mockResolvedValue([]) },
    calibrationDecision: { findMany: jest.fn().mockResolvedValue([]) },
    // The CDX observation store. A scan records what the Archive told us — the
    // query itself (so a zero-row answer is distinguishable from never asking)
    // and one entry per indexed capture.
    cdxQuery: {
      create: jest.fn().mockResolvedValue({ id: 'cdx-query-1' }),
    },
    cdxIndexEntry: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    evidence: {
      findMany: jest.fn(),
      upsert: jest.fn().mockResolvedValue({ id: 'evidence-id-xyz', fileHash: '0xabc' }),
    },
    trackedUrl: {
      create: jest.fn().mockResolvedValue({ id: 'tracked-url-id-123' }),
      upsert: jest.fn().mockResolvedValue({ id: 'tracked-url-id-123' }),
    },
    urlVersionDiff: {
      // recordDiff UPSERTS on the capture pair, so a rescan converges instead of
      // duplicating every diff it re-derives.
      upsert: jest.fn().mockResolvedValue({ id: 'diff-id-456' }),
    },
    urlSnapshot: {
      // recordDiff reads the two captures' STORED text to compute the Level 5
      // survival verdict — the verdict must be re-derivable from stored state, so
      // it is computed against stored state rather than from text held in memory.
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        text: 'stored capture text',
        textHash: 'a'.repeat(64),
        textExtractionVersion: 'v2-inflate-decode-htmltotext-normalised',
      }),
      // The write path is recordCapture, which asks three questions in order:
      // does this capture already exist (findUnique on the capturedAt key), is
      // it identical to the one before it (findFirst), and if neither, create.
      //
      // findUnique -> null and findFirst -> null is the "new capture" path, so
      // these defaults exercise creation. A test wanting the UNCHANGED or EXISTS
      // branch overrides the relevant one.
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      // A DISTINCT ID PER CAPTURE, which the constant `snapshot-id-abc` was not.
      //
      // Every capture resolving to one id meant every diff these tests produced
      // was a capture paired with ITSELF — the exact shape a real scan later hit
      // and `recordDiff` now refuses. The fixture was modelling a state the
      // database cannot hold, so it could not have caught it.
      create: jest.fn().mockImplementation(({ data }: { data: { waybackTimestamp: string } }) =>
        Promise.resolve({
          id: `snapshot-${data.waybackTimestamp}`,
          waybackTimestamp: data.waybackTimestamp,
        }),
      ),
      // Retained solely so the "issues no repair update" test can assert it is
      // NEVER called. Nothing in the service reaches it any more.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    waybackScrapeJob: {
      findUnique: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'job-id-789', ...data })),
    },
  },
}));

import axios from 'axios';
import { prisma } from '../src/lib/prisma';

const mockAxiosGet = axios.get as jest.Mock;
const mockPrismaFindMany = prisma.evidence.findMany as jest.Mock;
const mockJobFindUnique = prisma.waybackScrapeJob.findUnique as jest.Mock;
const mockJobUpdate = prisma.waybackScrapeJob.update as jest.Mock;
const MockForensicAgent = ForensicAgent as jest.MockedClass<typeof ForensicAgent>;

// ---------------------------------------------------------------------------
// CDX API response fixture
// ---------------------------------------------------------------------------

/** Minimal CDX API response: header row + 3 unique-digest snapshots */
const CDX_RESPONSE = [
  ['timestamp', 'digest'],
  ['20210101120000', 'AAABBBCCC111'],
  ['20210601130000', 'DDDEEEFFF222'],
  ['20220101140000', 'GGGHHH333444'],
];

/**
 * A CDX response whose rows revert to an earlier digest.
 *
 * CDX is queried with `collapse=digest`, which removes CONSECUTIVE duplicates
 * server-side. Rows that still repeat a digest are therefore reverts: the page
 * changed and came back. Every one of them must survive this function.
 */
const CDX_RESPONSE_REVERTING = [
  ['timestamp', 'digest'],
  ['20210101120000', 'STATE_A'],
  ['20210601130000', 'STATE_B'],
  ['20220101140000', 'STATE_A'],
];

/**
 * CDX response with MAX_SNAPSHOTS+1 data rows (51 rows) — signals hasMore=true.
 * Built dynamically so it stays in sync if MAX_SNAPSHOTS changes.
 */
const CDX_RESPONSE_FULL_PAGE: string[][] = [
  ['timestamp', 'digest'],
  // 51 rows with unique digests → hasMore=true
  ...Array.from({ length: 51 }, (_, i) => [
    `202201${String(i + 1).padStart(2, '0')}120000`,
    `DIGEST${String(i).padStart(3, '0')}`,
  ]),
];

// ---------------------------------------------------------------------------
// HTML fixture for scrapeSnapshot
// ---------------------------------------------------------------------------

const MOCK_HTML = `
<!DOCTYPE html>
<html>
  <head><title>Ministry of Health</title></head>
  <body>
    <article>
      <h1>Covid-19 Vaccine Safety Page</h1>
      <p>The mRNA vaccine is safe and effective. Side effects are mild and temporary.</p>
      <p>Emergency Use Authorization approved on January 5, 2021.</p>
    </article>
  </body>
</html>`;

const MOCK_HTML_CHANGED = `
<!DOCTYPE html>
<html>
  <head><title>Ministry of Health</title></head>
  <body>
    <article>
      <h1>Covid-19 Vaccine Safety Page</h1>
      <p>The vaccine is safe and effective.</p>
      <p>Full FDA approval granted.</p>
    </article>
  </body>
</html>`;

// ---------------------------------------------------------------------------
// Forensic agent fixture
// ---------------------------------------------------------------------------

const SIGNIFICANT_FORENSIC_OUTPUT = {
  isLegallySignificant: true,
  investigativeCategories: ['WITHHOLDING_INFORMATION', 'EXPERIMENTAL_STATUS_CONCEALMENT'],
  deletedItems: [
    { summary: 'הובטח כי תופעות הלוואי קלות וזמניות בלבד', exactQuote: 'Side effects are mild and temporary.' },
  ],
  addedItems: [],
  legalSignificance: 'האזהרה בדבר תופעות לוואי נמחקה, וניסוח אישור החירום שונה לאישור מלא ממה שהוא בפועל.',
};

const COSMETIC_FORENSIC_OUTPUT = {
  isLegallySignificant: false,
  investigativeCategories: [],
  deletedItems: [],
  addedItems: [],
  legalSignificance: 'עדכון קישורי ניווט בלבד ללא שינוי בתוכן הרפואי או הרגולטורי.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAxiosResponse<T>(data: T) {
  return Promise.resolve({ data, status: 200, headers: {}, config: {}, statusText: 'OK' });
}

// ---------------------------------------------------------------------------
// Tests: getSnapshotsList
// ---------------------------------------------------------------------------

describe('WaybackScraper.getSnapshotsList', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns deduplicated snapshots in chronological order', async () => {
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE));
    const scraper = new WaybackScraper();
    const { snapshots, hasMore } = await scraper.probeSnapshotsList('https://health.gov.il/page');
    expect(snapshots).toHaveLength(3);
    expect(snapshots[0].timestamp).toBe('20210101120000');
    expect(snapshots[2].timestamp).toBe('20220101140000');
    expect(hasMore).toBe(false); // CDX returned fewer than MAX_SNAPSHOTS+1 rows
  });

  it('KEEPS a capture that reverts to an earlier digest', async () => {
    // This test asserts the exact opposite of the one it replaces, which
    // required a `seenDigests` Set to skip any digest seen before and was named
    // "deduplicates snapshots with the same digest".
    //
    // A page returning to a former state is not a duplicate. It is the
    // whole-page form of what claim trajectories detect, and discarding it
    // deleted real observations: measured against the live CDX index on
    // 2026-08-27, the tracked MOH page has 95 captures of which 12 revert to an
    // earlier state, and ELEVEN of those were never stored. The page returned to
    // one earlier state twice within six hours on 2022-06-22.
    //
    // The old test did not merely miss the defect — it pinned it in place, which
    // is why removing the Set had to remove this assertion with it.
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE_REVERTING));
    const scraper = new WaybackScraper();
    const { snapshots } = await scraper.probeSnapshotsList('https://health.gov.il/page');

    expect(snapshots).toHaveLength(3);
    expect(snapshots.map((s) => s.digest)).toEqual(['STATE_A', 'STATE_B', 'STATE_A']);
    // And the revert keeps its OWN timestamp rather than collapsing onto the
    // first occurrence — it is a distinct observation at a distinct moment.
    expect(snapshots[2].timestamp).toBe('20220101140000');
  });

  it('returns empty snapshots when CDX returns no data rows', async () => {
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse([['timestamp', 'digest']]));
    const scraper = new WaybackScraper();
    const { snapshots, hasMore } = await scraper.probeSnapshotsList('https://health.gov.il/page');
    expect(snapshots).toEqual([]);
    expect(hasMore).toBe(false);
  });

  it('returns empty snapshots when CDX returns an empty array', async () => {
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse([]));
    const scraper = new WaybackScraper();
    const { snapshots, hasMore } = await scraper.probeSnapshotsList('https://health.gov.il/page');
    expect(snapshots).toEqual([]);
    expect(hasMore).toBe(false);
  });

  it('throws on non-http/https protocol', async () => {
    const scraper = new WaybackScraper();
    await expect(scraper.probeSnapshotsList('ftp://health.gov.il/page')).rejects.toThrow(
      'http or https',
    );
  });

  it('encodes the URL in the CDX query', async () => {
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse([['timestamp', 'digest']]));
    const scraper = new WaybackScraper();
    await scraper.probeSnapshotsList('https://health.gov.il/page?id=1&lang=he');
    const calledUrl: string = mockAxiosGet.mock.calls[0][0] as string;
    expect(calledUrl).toContain('web.archive.org/cdx/search/cdx');
    expect(calledUrl).toContain('collapse=digest');
  });

  it('returns hasMore=true when CDX returns MAX_SNAPSHOTS+1 rows', async () => {
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE_FULL_PAGE));
    const scraper = new WaybackScraper();
    const { snapshots, hasMore } = await scraper.probeSnapshotsList('https://health.gov.il/page');
    // Returns MAX_SNAPSHOTS (50) snapshots — the 51st row is the sentinel that triggers hasMore
    expect(snapshots).toHaveLength(50);
    expect(hasMore).toBe(true);
  });

  it('returns every row up to MAX_SNAPSHOTS, reverts included, and still signals hasMore', async () => {
    // 51 rows, 11 of them reverting to an earlier digest. The predecessor of
    // this test asserted `snapshots.length` fell BELOW 50 because dedup removed
    // the reverts; the reverts are now kept, so the batch fills to MAX_SNAPSHOTS
    // and the eleven observations survive into the write path.
    const cdxWithReverts: string[][] = [
      ['timestamp', 'digest'],
      ...Array.from({ length: 40 }, (_, i) => [
        `20220101${String(i).padStart(6, '0')}`,
        `UNIQUE${i}`,
      ]),
      ...Array.from({ length: 11 }, (_, i) => [
        `20220201${String(i).padStart(6, '0')}`,
        `UNIQUE${i % 5}`,
      ]),
    ];
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse(cdxWithReverts));
    const scraper = new WaybackScraper();
    const { snapshots, hasMore } = await scraper.probeSnapshotsList('https://health.gov.il/page');

    // Capped at MAX_SNAPSHOTS (50) — the cap is a batch size, not a filter.
    expect(snapshots).toHaveLength(50);
    // hasMore comes from CDX returning MAX_SNAPSHOTS+1 rows, independently of
    // anything this function does to them.
    expect(hasMore).toBe(true);
    // The reverting digests are present rather than collapsed away.
    expect(snapshots.filter((s) => s.digest === 'UNIQUE0').length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: scrapeSnapshot
// ---------------------------------------------------------------------------

describe('WaybackScraper.scrapeSnapshot', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches a snapshot and returns extracted text', async () => {
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse(MOCK_HTML));
    const scraper = new WaybackScraper();
    const text = await scraper.scrapeSnapshot('https://health.gov.il/page', '20210101120000');
    // Readability mock returns this fixed string — just confirm we got non-empty text back
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('uses the id_ modifier to suppress the Wayback toolbar', async () => {
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse(MOCK_HTML));
    const scraper = new WaybackScraper();
    await scraper.scrapeSnapshot('https://health.gov.il/page', '20210101120000');
    const calledUrl: string = mockAxiosGet.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/20210101120000id_/');
  });

  it('throws a descriptive error when the archive returns 404', async () => {
    const axiosErr = Object.assign(new Error('Not Found'), {
      isAxiosError: true,
      response: { status: 404 },
    });
    (axios as unknown as Record<string, jest.Mock>)['isAxiosError'] = jest.fn().mockReturnValue(true);
    mockAxiosGet.mockRejectedValueOnce(axiosErr);

    const scraper = new WaybackScraper();
    await expect(
      scraper.scrapeSnapshot('https://health.gov.il/page', '20210101120000'),
    ).rejects.toThrow('HTTP 404');
  });

  it('tags the thrown error as non-offline for a 404 (no retry involved)', async () => {
    const axiosErr = Object.assign(new Error('Not Found'), {
      isAxiosError: true,
      response: { status: 404 },
    });
    (axios as unknown as Record<string, jest.Mock>)['isAxiosError'] = jest.fn().mockReturnValue(true);
    mockAxiosGet.mockRejectedValueOnce(axiosErr);

    const scraper = new WaybackScraper();
    let caught: unknown;
    try {
      await scraper.scrapeSnapshot('https://health.gov.il/page', '20210101120000');
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ offline: false });
  });
});

// ---------------------------------------------------------------------------
// Tests: isWaybackOffline — the 503-outage predicate, tested directly to
// avoid exercising withRetry's real exponential backoff (503 triggers retries).
// ---------------------------------------------------------------------------

describe('isWaybackOffline', () => {
  it('is true for a 503 (Internet Archive "Temporarily Offline")', () => {
    (axios as unknown as Record<string, jest.Mock>)['isAxiosError'] = jest.fn().mockReturnValue(true);
    const err = Object.assign(new Error('Service Unavailable'), { response: { status: 503 } });
    expect(isWaybackOffline(err)).toBe(true);
  });

  it('is false for other HTTP statuses and non-axios errors', () => {
    (axios as unknown as Record<string, jest.Mock>)['isAxiosError'] = jest.fn().mockReturnValue(true);
    expect(isWaybackOffline(Object.assign(new Error('Not Found'), { response: { status: 404 } }))).toBe(false);

    (axios as unknown as Record<string, jest.Mock>)['isAxiosError'] = jest.fn().mockReturnValue(false);
    expect(isWaybackOffline(new Error('some other failure'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: fetchCorrelatedEvidence
// ---------------------------------------------------------------------------

describe('WaybackScraper.fetchCorrelatedEvidence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries Prisma with the correct ±60-day window', async () => {
    mockPrismaFindMany.mockResolvedValueOnce([]);
    const scraper = new WaybackScraper();
    await scraper.fetchCorrelatedEvidence('2021-06-01');

    expect(mockPrismaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { evidenceDate: { gte: '2021-04-02' } },
            { evidenceDate: { lte: '2021-07-31' } },
          ]),
        }),
        take: 5,
      }),
    );
  });

  it('maps Prisma rows to RelatedEvidenceContext shape', async () => {
    mockPrismaFindMany.mockResolvedValueOnce([
      {
        evidenceDate: '2021-05-15',
        summary: 'דו"ח פנימי',
        investigativeCategories: ['WITHHOLDING_INFORMATION'],
        targetEntity: 'Ministry of Health',
        evidenceRole: 'Incriminating',
      },
    ]);
    const scraper = new WaybackScraper();
    const result = await scraper.fetchCorrelatedEvidence('2021-06-01');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: '2021-05-15',
      summary: 'דו"ח פנימי',
      investigativeCategories: ['WITHHOLDING_INFORMATION'],
      targetEntity: 'Ministry of Health',
      evidenceRole: 'Incriminating',
    });
  });
});

// ---------------------------------------------------------------------------
// Transient-failure classification.
//
// The retry loop was never the problem — it retried four times with
// exponential back-off and always had. The PREDICATE was: it inspected
// err.response.status and compared it to 503, so a timeout (which carries no
// response at all) read as `undefined`, matched nothing, and was rethrown on
// the first attempt.
//
// The Internet Archive's dominant failure mode is slowness, not 503. So the
// retry machinery was dead code for exactly the case it existed to handle, and
// a real scan of a government page died on a 30s CDX timeout on 2026-08-22
// having made precisely one attempt.
// ---------------------------------------------------------------------------
describe('isTransientWaybackError', () => {
  const axiosErr = (extra: Record<string, unknown>): unknown =>
    Object.assign(new Error('boom'), { isAxiosError: true, ...extra });

  beforeEach(() => {
    (axios as unknown as Record<string, jest.Mock>)['isAxiosError'] = jest
      .fn()
      .mockImplementation((e: unknown) => Boolean((e as { isAxiosError?: boolean })?.isAxiosError));
  });

  it('retries a timeout — no response, no status, the case that was missed', () => {
    expect(isTransientWaybackError(axiosErr({ code: 'ECONNABORTED' }))).toBe(true);
  });

  it('retries a connection reset and a DNS failure', () => {
    expect(isTransientWaybackError(axiosErr({ code: 'ECONNRESET' }))).toBe(true);
    expect(isTransientWaybackError(axiosErr({ code: 'ENOTFOUND' }))).toBe(true);
  });

  it('retries 503, as it always did', () => {
    expect(isTransientWaybackError(axiosErr({ response: { status: 503 } }))).toBe(true);
  });

  it('retries other 5xx and 429', () => {
    expect(isTransientWaybackError(axiosErr({ response: { status: 500 } }))).toBe(true);
    expect(isTransientWaybackError(axiosErr({ response: { status: 504 } }))).toBe(true);
    expect(isTransientWaybackError(axiosErr({ response: { status: 429 } }))).toBe(true);
  });

  it('does NOT retry a 404 — the archive does not hold the URL, and waiting will not change that', () => {
    expect(isTransientWaybackError(axiosErr({ response: { status: 404 } }))).toBe(false);
  });

  it('does NOT retry other 4xx', () => {
    expect(isTransientWaybackError(axiosErr({ response: { status: 400 } }))).toBe(false);
    expect(isTransientWaybackError(axiosErr({ response: { status: 403 } }))).toBe(false);
  });

  it('does NOT retry a non-axios error', () => {
    expect(isTransientWaybackError(new Error('programmer error'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Retry budgets — the two call sites have different economics.
//
// withRetry is shared by the CDX index query and the per-snapshot fetch, and
// they had one budget between them. That was tolerable while only a 503 was
// treated as transient. Once timeouts were included — the archive's actual
// common failure — every timing-out snapshot inherited CDX's four retries and
// burned 8+16+32+64 = 120s of back-off. A batch fetches up to MAX_SNAPSHOTS
// (50) of them, so a slow archive could leave one job sleeping for well over an
// hour while reporting SCANNING and showing no progress.
//
// CDX runs once per batch and its failure kills the scan, so it keeps the large
// budget. A single snapshot is already skipped gracefully on failure.
// ---------------------------------------------------------------------------
describe('withRetry budgets', () => {
  const timeout = (): unknown =>
    Object.assign(new Error('timeout of 25000ms exceeded'), {
      isAxiosError: true,
      code: 'ECONNABORTED',
    });

  beforeEach(() => {
    (axios as unknown as Record<string, jest.Mock>)['isAxiosError'] = jest
      .fn()
      .mockImplementation((e: unknown) => Boolean((e as { isAxiosError?: boolean })?.isAxiosError));
  });

  it('makes maxRetries + 1 attempts before giving up', async () => {
    const fn = jest.fn().mockRejectedValue(timeout());

    await expect(withRetry(fn, { maxRetries: 1, baseDelayMs: 0 })).rejects.toBeDefined();

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives CDX a far larger budget than a single snapshot', async () => {
    const cdx = jest.fn().mockRejectedValue(timeout());
    const snapshot = jest.fn().mockRejectedValue(timeout());

    await expect(withRetry(cdx, { maxRetries: 4, baseDelayMs: 0 })).rejects.toBeDefined();
    await expect(withRetry(snapshot, { maxRetries: 1, baseDelayMs: 0 })).rejects.toBeDefined();

    expect(cdx.mock.calls.length).toBeGreaterThan(snapshot.mock.calls.length);
  });

  it('stops immediately on a non-transient failure regardless of budget', async () => {
    const fn = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('gone'), { isAxiosError: true, response: { status: 404 } }));

    await expect(withRetry(fn, { maxRetries: 4, baseDelayMs: 0 })).rejects.toBeDefined();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns the value as soon as an attempt succeeds', async () => {
    const fn = jest.fn().mockRejectedValueOnce(timeout()).mockResolvedValueOnce('ok');

    await expect(withRetry(fn, { maxRetries: 4, baseDelayMs: 0 })).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
