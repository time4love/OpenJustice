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

jest.mock('../src/lib/prisma', () => ({
  prisma: {
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
      create: jest.fn().mockResolvedValue({ id: 'diff-id-456' }),
    },
    urlSnapshot: {
      // The write path is recordCapture, which asks three questions in order:
      // does this capture already exist (findUnique on the capturedAt key), is
      // it identical to the one before it (findFirst), and if neither, create.
      //
      // findUnique -> null and findFirst -> null is the "new capture" path, so
      // these defaults exercise creation. A test wanting the UNCHANGED or EXISTS
      // branch overrides the relevant one.
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'snapshot-id-abc', waybackTimestamp: '20220101120000' }),
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
// Tests: processJob — total-failure classification
//
// scrapeSnapshotReadings is stubbed directly (rather than mocking axios + letting
// withRetry run) so these tests aren't at the mercy of the real exponential
// backoff a sustained 503 would trigger — that behavior is covered by the
// isWaybackOffline and scrapeSnapshot suites above.
//
// Stub the method processJob ACTUALLY CALLS. These stubbed scrapeSnapshot while
// the job path moved to scrapeSnapshotReadings, so the spy was bypassed entirely
// and the real fetch ran against an exhausted axios mock. Two of the three failed
// loudly; the third PASSED, because a real non-503 failure happens to produce the
// ALL_FETCHES_FAILED it was asserting. A stub on the wrong method is not a
// neutral mistake — it can leave a test green while testing nothing.
// ---------------------------------------------------------------------------

describe('WaybackScraper.processJob', () => {
  const BASE_JOB = {
    id: 'job-id-789',
    status: 'PENDING',
    url: 'https://health.gov.il/page',
    fromDate: null,
    snapshotsList: '[]',
    totalSnapshots: 0,
    processedSnapshots: 0,
    trackedUrlId: 'tracked-url-id-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaFindMany.mockResolvedValue([]);
  });

  it('marks the job FAILED with WAYBACK_OFFLINE when every snapshot fetch is an outage', async () => {
    mockJobFindUnique.mockResolvedValueOnce(BASE_JOB);
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE)); // 3 snapshots

    const scraper = new WaybackScraper();
    jest
      .spyOn(scraper, 'scrapeSnapshotReadings')
      .mockRejectedValue(new WaybackFetchError('Failed to fetch snapshot: HTTP 503', true));

    const result = await scraper.processJob('job-id-789');
    expect(result).toMatchObject({ status: 'FAILED', failureReason: 'WAYBACK_OFFLINE' });
  }, 15_000);

  it('marks the job FAILED with ALL_FETCHES_FAILED when every fetch fails for a non-outage reason', async () => {
    mockJobFindUnique.mockResolvedValueOnce(BASE_JOB);
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE));

    const scraper = new WaybackScraper();
    jest
      .spyOn(scraper, 'scrapeSnapshotReadings')
      .mockRejectedValue(new WaybackFetchError('Failed to fetch snapshot: HTTP 404', false));

    const result = await scraper.processJob('job-id-789');
    expect(result).toMatchObject({ status: 'FAILED', failureReason: 'ALL_FETCHES_FAILED' });
  }, 15_000);

  // -------------------------------------------------------------------------
  // AN UNCHANGED CAPTURE MUST NOT LINK THE INDEX ENTRY TO A SNAPSHOT.
  //
  // recordCapture returns the PRECEDING capture's id on an UNCHANGED outcome —
  // that is what UNCHANGED means. Marking the entry STORED with that id would
  // attach it to a capture it did not produce, so "which capture came from this
  // index entry" would be wrong for exactly the eleven rows on this corpus that
  // the UNCHANGED status exists to describe.
  //
  // Written after a mutation SURVIVED: forcing the STORED branch on an UNCHANGED
  // outcome passed all 45 tests, and it compiled cleanly, so it had genuinely hit
  // the code. The hazard was identified while building the branch and covered by
  // nothing.
  // -------------------------------------------------------------------------
  it('marks an UNCHANGED capture UNCHANGED, and never links it to the predecessor', async () => {
    const bytes = Buffer.from('<p>identical to what came before</p>');
    const predecessorTextHash = deriveText(bytes, 'text/html; charset=utf-8', null).textHash;

    mockJobFindUnique.mockResolvedValueOnce(BASE_JOB);
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE));
    // A preceding capture whose text hashes identically -> recordCapture returns
    // UNCHANGED, carrying the PREDECESSOR's id.
    (prisma.urlSnapshot.findFirst as jest.Mock).mockResolvedValue({
      id: 'predecessor-snapshot-id',
      waybackTimestamp: '20211231235959',
      capturedAt: new Date('2021-12-31T23:59:59Z'),
      contentHash: 'prev-content-hash',
      textHash: predecessorTextHash,
    });

    const scraper = new WaybackScraper();
    jest.spyOn(scraper, 'scrapeSnapshotReadings').mockResolvedValue({
      extracted: 'identical',
      bytes,
      contentType: 'text/html; charset=utf-8',
      contentEncoding: null,
    });

    await scraper.processJob('job-id-789');

    const updates = (prisma.cdxIndexEntry.updateMany as jest.Mock).mock.calls as [
      { data: Record<string, unknown> },
    ][];
    expect(updates.length).toBeGreaterThan(0); // vacuity guard
    for (const [call] of updates) {
      expect(call.data['status']).toBe('UNCHANGED');
      expect(call.data['snapshotId']).toBeUndefined();
      // THE VERDICT NAMES WHAT IT WAS COMPUTED AGAINST, and it must be the
      // predecessor actually compared — not merely some id. Asserting only that
      // the field is populated let a mutation passing the WRONG id survive.
      expect(call.data['comparedToSnapshotId']).toBe('predecessor-snapshot-id');
    }
    // No capture was created, so nothing may claim one was stored.
    expect(updates.some(([c]) => c.data['status'] === 'STORED')).toBe(false);
  });

  it('stores the document on the CREATE path, so a capture cannot exist without one', async () => {
    // Level 1's invariant, asserted where it is actually established. `document`
    // is a required parameter of recordCapture and `rawText` a NOT NULL column,
    // so the document is written in the same statement that creates the row —
    // there is no window in which a capture exists without the document it was
    // extracted from, and no second write that could fail and leave one.
    mockJobFindUnique.mockResolvedValueOnce(BASE_JOB);
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE));

    const scraper = new WaybackScraper();
    jest
      .spyOn(scraper, 'scrapeSnapshotReadings')
      .mockResolvedValue({ extracted: 'the article', bytes: Buffer.from('the article and the chrome around it'), contentType: 'text/html; charset=utf-8', contentEncoding: null });

    await scraper.processJob('job-id-789');

    const calls = (prisma.urlSnapshot.create as jest.Mock).mock.calls as [
      { data: Record<string, string> },
    ][];
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0].data.document).toEqual(Buffer.from('the article and the chrome around it'));

    // Pinned to the hash OF THE STORED DOCUMENT, not merely to the shape of a
    // hash. A shape assertion (64 hex chars, different from contentHash) passes
    // for sha256('') too — verified by mutation: replacing the digest input with
    // '' left all 36 tests in this file green. A checksum exists to DISAGREE
    // with a recomputation, so the test has to recompute it.
    const expectedDocHash = createHash('sha256')
      .update(Buffer.from('the article and the chrome around it'))
      .digest('hex');
    expect(calls[0][0].data.documentHash).toBe(expectedDocHash);
    // The two hashes are of DIFFERENT strings and must not be conflated:
    // contentHash covers the extraction, documentHash covers the payload.
    expect(calls[0][0].data.contentHash).toBe(
      createHash('sha256').update('the article', 'utf8').digest('hex'),
    );
  }, 15_000);

  it('issues no repair update — the constraint makes a document-less row impossible', async () => {
    // Until 20260827120000_snapshot_document_required this path carried a
    // legacy-fill branch guarded by `rawText: null`. The constraint makes that
    // row unrepresentable, so the branch was removed rather than left as
    // unreachable code that reads as though the hazard is still handled here.
    mockJobFindUnique.mockResolvedValueOnce(BASE_JOB);
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE));

    const scraper = new WaybackScraper();
    jest
      .spyOn(scraper, 'scrapeSnapshotReadings')
      .mockResolvedValue({ extracted: 'the article', bytes: Buffer.from('the whole document'), contentType: 'text/html; charset=utf-8', contentEncoding: null });

    await scraper.processJob('job-id-789');

    expect(prisma.urlSnapshot.updateMany).not.toHaveBeenCalled();
  }, 15_000);

  it('marks the job COMPLETED with no failureReason once at least one snapshot succeeds', async () => {
    mockJobFindUnique.mockResolvedValueOnce(BASE_JOB);
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE));

    const scraper = new WaybackScraper();
    jest
      .spyOn(scraper, 'scrapeSnapshotReadings')
      .mockResolvedValueOnce({ extracted: 'some page text', bytes: Buffer.from('some page text and more'), contentType: 'text/html; charset=utf-8', contentEncoding: null })
      .mockRejectedValue(new WaybackFetchError('Failed to fetch snapshot: HTTP 503', true));

    const result = await scraper.processJob('job-id-789');
    expect(result).toMatchObject({ status: 'COMPLETED', failureReason: null });
  }, 15_000);
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
// Tests: analyzePageHistory (full pipeline)
// ---------------------------------------------------------------------------

describe('WaybackScraper.analyzePageHistory', () => {
  // analyzePageHistory has FETCH_DELAY_MS (1500ms) pauses between requests —
  // extend the default 5s timeout to accommodate the realistic sleep calls.
  const TEST_TIMEOUT = 25_000;

  let mockAnalyzeChange: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalyzeChange = jest.fn();
    MockForensicAgent.prototype.analyzeChange = mockAnalyzeChange;
    mockPrismaFindMany.mockResolvedValue([]);
  });

  it('returns an empty diffs array when no archive snapshots exist', async () => {
    // no sleep calls in this path — default timeout is fine
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse([['timestamp', 'digest']]));
    const scraper = new WaybackScraper();
    const { diffs, trackedUrlId } = await scraper.analyzePageHistory('https://health.gov.il/page');
    expect(diffs).toEqual([]);
    expect(trackedUrlId).toBe('tracked-url-id-123');
  });

  // -------------------------------------------------------------------------
  // DIRECTION. The classifier is handed (deletions, additions) in that order,
  // and ADDED-vs-REMOVED is the entire semantic of a forensic diff: reversing it
  // reports every removal as an addition on a page whose central finding is that
  // something was REMOVED.
  //
  // Nothing pinned it. Reversing `diffLines(prev.text, current.text)` to
  // `diffLines(current.text, prev.text)` passed all 41 tests of this file and its
  // diff companion, because every existing test asserts the MOCKED classifier
  // OUTPUT and never what the real diff handed it. Found by mutating the loop
  // after refactoring it — the refactor was safe, the coverage was not.
  // -------------------------------------------------------------------------
  it('hands the classifier deletions from the BEFORE capture and additions from the AFTER one', async () => {
    mockAxiosGet
      .mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE))
      .mockResolvedValueOnce(makeAxiosResponse(MOCK_HTML))
      .mockResolvedValueOnce(makeAxiosResponse(MOCK_HTML_CHANGED))
      .mockResolvedValueOnce(makeAxiosResponse(MOCK_HTML_CHANGED));
    mockAnalyzeChange.mockResolvedValue(COSMETIC_FORENSIC_OUTPUT);

    const scraper = new WaybackScraper();
    await scraper.analyzePageHistory('https://health.gov.il/page');

    const [deletions, additions] = mockAnalyzeChange.mock.calls[0] as [string[], string[]];
    const deleted = deletions.join('\n');
    const added = additions.join('\n');

    // "Emergency Use Authorization" is only in the BEFORE capture.
    expect(deleted).toContain('Emergency Use Authorization');
    expect(added).not.toContain('Emergency Use Authorization');

    // "Full FDA approval" is only in the AFTER capture.
    expect(added).toContain('Full FDA approval');
    expect(deleted).not.toContain('Full FDA approval');
  }, TEST_TIMEOUT);

  it('returns only legally significant diffs', async () => {
    // CDX API returns 3 snapshots
    mockAxiosGet
      .mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE))
      // Snapshot 1 text fetch
      .mockResolvedValueOnce(makeAxiosResponse(MOCK_HTML))
      // Snapshot 2 text fetch — changed content
      .mockResolvedValueOnce(makeAxiosResponse(MOCK_HTML_CHANGED))
      // Snapshot 3 text fetch — same as 2 (no diff)
      .mockResolvedValueOnce(makeAxiosResponse(MOCK_HTML_CHANGED));

    // First diff: legally significant; second diff: cosmetic
    mockAnalyzeChange
      .mockResolvedValueOnce(SIGNIFICANT_FORENSIC_OUTPUT)
      .mockResolvedValueOnce(COSMETIC_FORENSIC_OUTPUT);

    const scraper = new WaybackScraper();
    const { diffs } = await scraper.analyzePageHistory('https://health.gov.il/page');

    expect(diffs).toHaveLength(1);
    expect(diffs[0].deletedItems[0].summary).toBe('הובטח כי תופעות הלוואי קלות וזמניות בלבד');
    expect(diffs[0].legalSignificance).toContain('האזהרה');
  }, TEST_TIMEOUT);

  it('skips a snapshot pair when text extraction fails for one', async () => {
    mockAxiosGet
      .mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE))
      .mockRejectedValueOnce(Object.assign(new Error('not archived'), { isAxiosError: true, response: { status: 404 } }))
      .mockResolvedValueOnce(makeAxiosResponse(MOCK_HTML_CHANGED))
      .mockResolvedValueOnce(makeAxiosResponse(MOCK_HTML_CHANGED));

    (axios as unknown as Record<string, jest.Mock>)['isAxiosError'] = jest.fn().mockReturnValue(true);
    mockAnalyzeChange.mockResolvedValue(COSMETIC_FORENSIC_OUTPUT);

    const scraper = new WaybackScraper();
    const { diffs } = await scraper.analyzePageHistory('https://health.gov.il/page');
    expect(diffs).toEqual([]);
  }, TEST_TIMEOUT);

  it('includes the snapshotUrl pointing to the Wayback viewer', async () => {
    mockAxiosGet
      .mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE))
      .mockResolvedValueOnce(makeAxiosResponse(MOCK_HTML))
      .mockResolvedValueOnce(makeAxiosResponse(MOCK_HTML_CHANGED))
      .mockResolvedValueOnce(makeAxiosResponse(MOCK_HTML_CHANGED));

    mockAnalyzeChange
      .mockResolvedValueOnce(SIGNIFICANT_FORENSIC_OUTPUT)
      .mockResolvedValueOnce(COSMETIC_FORENSIC_OUTPUT);

    const scraper = new WaybackScraper();
    const { diffs } = await scraper.analyzePageHistory('https://health.gov.il/page');
    expect(diffs[0].snapshotUrl).toMatch(/web\.archive\.org\/web\/20210601/);
    expect(diffs[0].snapshotUrl).toContain('health.gov.il');
  }, TEST_TIMEOUT);
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
