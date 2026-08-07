import { WaybackScraper } from '../src/services/WaybackScraper';
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

// Readability mock — returns the document's body.textContent so each call
// returns the content of the specific HTML that was fetched (enabling real diffs)
jest.mock('@mozilla/readability', () => ({
  Readability: jest
    .fn()
    .mockImplementation((doc: { body: { textContent: string } }) => ({
      parse: jest.fn().mockReturnValue({
        title: 'Mock Title',
        textContent: doc.body?.textContent ?? '',
      }),
    })),
}));
jest.mock('../src/services/ForensicAgent');
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    evidence: {
      findMany: jest.fn(),
    },
    trackedUrl: {
      create: jest.fn().mockResolvedValue({ id: 'tracked-url-id-123' }),
    },
    urlVersionDiff: {
      create: jest.fn().mockResolvedValue({ id: 'diff-id-456' }),
    },
  },
}));

import axios from 'axios';
import { prisma } from '../src/lib/prisma';

const mockAxiosGet = axios.get as jest.Mock;
const mockPrismaFindMany = prisma.evidence.findMany as jest.Mock;
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

/** A CDX response where every row has the same digest — should yield 0 snapshots after dedup */
const CDX_RESPONSE_ALL_SAME_DIGEST = [
  ['timestamp', 'digest'],
  ['20210101120000', 'SAMESAME'],
  ['20210601130000', 'SAMESAME'],
  ['20220101140000', 'SAMESAME'],
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
  deletedClaims: ['הובטח כי תופעות הלוואי קלות וזמניות בלבד'],
  addedClaims: [],
  legalSignificance: 'האזהרה בדבר תופעות לוואי נמחקה, וניסוח אישור החירום שונה לאישור מלא ממה שהוא בפועל.',
};

const COSMETIC_FORENSIC_OUTPUT = {
  isLegallySignificant: false,
  deletedClaims: [],
  addedClaims: [],
  legalSignificance: '',
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
    const snapshots = await scraper.getSnapshotsList('https://health.gov.il/page');
    expect(snapshots).toHaveLength(3);
    expect(snapshots[0].timestamp).toBe('20210101120000');
    expect(snapshots[2].timestamp).toBe('20220101140000');
  });

  it('deduplicates snapshots with the same digest', async () => {
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE_ALL_SAME_DIGEST));
    const scraper = new WaybackScraper();
    const snapshots = await scraper.getSnapshotsList('https://health.gov.il/page');
    // Only the first occurrence per digest is kept
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].digest).toBe('SAMESAME');
  });

  it('returns an empty array when CDX returns no data rows', async () => {
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse([['timestamp', 'digest']]));
    const scraper = new WaybackScraper();
    const result = await scraper.getSnapshotsList('https://health.gov.il/page');
    expect(result).toEqual([]);
  });

  it('returns an empty array when CDX returns an empty array', async () => {
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse([]));
    const scraper = new WaybackScraper();
    const result = await scraper.getSnapshotsList('https://health.gov.il/page');
    expect(result).toEqual([]);
  });

  it('throws on non-http/https protocol', async () => {
    const scraper = new WaybackScraper();
    await expect(scraper.getSnapshotsList('ftp://health.gov.il/page')).rejects.toThrow(
      'http or https',
    );
  });

  it('encodes the URL in the CDX query', async () => {
    mockAxiosGet.mockResolvedValueOnce(makeAxiosResponse([['timestamp', 'digest']]));
    const scraper = new WaybackScraper();
    await scraper.getSnapshotsList('https://health.gov.il/page?id=1&lang=he');
    const calledUrl: string = mockAxiosGet.mock.calls[0][0] as string;
    expect(calledUrl).toContain('web.archive.org/cdx/search/cdx');
    expect(calledUrl).toContain('collapse=digest');
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
        category: 'Side Effect Withholding',
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
      category: 'Side Effect Withholding',
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
    // deletedClaims now contains raw text chunks, not AI-reformulated claims
    expect(diffs[0].deletedClaims).toHaveLength(1);
    expect(diffs[0].deletedClaims[0]).toContain('Side effects are mild and temporary');
    expect(diffs[0].legalSignificance).toContain('האזהרה');
  }, TEST_TIMEOUT);

  it('skips a snapshot pair when text extraction fails for one', async () => {
    mockAxiosGet
      .mockResolvedValueOnce(makeAxiosResponse(CDX_RESPONSE))
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { isAxiosError: true, response: { status: 504 } }))
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
