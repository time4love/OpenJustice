jest.mock('../src/lib/prisma', () => ({
  prisma: {
    // The gate now RECORDS its verdict — both directions — before acting on it.
    urlAssessment: { create: jest.fn().mockResolvedValue({ id: 'a1' }) },
    trackedUrl: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

jest.mock('../src/utils/webScraper', () => ({
  scrapeUrl: jest.fn(),
}));

const mockGetSnapshotsList = jest.fn();
const mockScrapeSnapshot = jest.fn();
const mockRunFullScan = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/services/WaybackScraper', () => ({
  WaybackScraper: jest.fn().mockImplementation(() => ({
    probeSnapshotsList: mockGetSnapshotsList,
    scrapeSnapshot: mockScrapeSnapshot,
    runFullScan: mockRunFullScan,
  })),
}));

const mockCheckRelevance = jest.fn();

jest.mock('../src/services/ScanRelevanceAgent', () => ({
  ScanRelevanceAgent: jest.fn().mockImplementation(() => ({
    checkRelevance: mockCheckRelevance,
  })),
}));

jest.mock('../src/services/Web3Service', () => ({ Web3Service: jest.fn() }));

import { prisma } from '../src/lib/prisma';
import { Request, Response } from 'express';
import { forensicsRouter } from '../src/routes/forensicsRoutes';
import { scrapeUrl } from '../src/utils/webScraper';

const mockFindUnique = (prisma.trackedUrl as unknown as { findUnique: jest.Mock }).findUnique;
const mockUpsert = (prisma.trackedUrl as unknown as { upsert: jest.Mock }).upsert;
const mockScrapeUrl = scrapeUrl as jest.Mock;

type RouterStack = Array<{
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
}>;

function getHandler(path: string, method: 'post' | 'get') {
  const layer = (forensicsRouter as unknown as { stack: RouterStack }).stack.find(
    (l) => l.route?.path === path && l.route.methods[method],
  );
  if (!layer?.route) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  const { stack } = layer.route;
  return stack[stack.length - 1].handle as (req: Request, res: Response) => Promise<void>;
}

function mockReq(body: unknown = {}): Request {
  return { body, params: {}, query: {} } as unknown as Request;
}

function mockRes() {
  let statusCode = 0;
  let jsonBody: unknown;
  const res = {
    status: jest.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: jest.fn((body: unknown) => {
      jsonBody = body;
      return res;
    }),
  } as unknown as Response;
  return { res, getStatus: () => statusCode, getJson: () => jsonBody };
}

describe('POST /api/forensics/scan — relevance gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsert.mockResolvedValue({ id: 'tracked-1', url: 'https://gov.example/page' });
  });

  it('skips the relevance check and starts the scan when the URL is already tracked', async () => {
    mockFindUnique.mockResolvedValue({ id: 'tracked-1', url: 'https://gov.example/page' });
    const handle = getHandler('/scan', 'post');
    const { res, getStatus, getJson } = mockRes();

    await handle(mockReq({ url: 'https://gov.example/page' }), res);

    expect(mockScrapeUrl).not.toHaveBeenCalled();
    expect(mockCheckRelevance).not.toHaveBeenCalled();
    expect(getStatus()).toBe(201);
    expect(getJson()).toEqual({ trackedUrlId: 'tracked-1' });
    expect(mockRunFullScan).toHaveBeenCalledWith('tracked-1', 'https://gov.example/page');
  });

  it('starts the scan when the live page is approved as relevant', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockScrapeUrl.mockResolvedValue({ title: 't', textContent: 'Ministry of Health vaccine policy update', url: 'x' });
    mockCheckRelevance.mockResolvedValue({ isRelevant: true, reason: 'קשור למדיניות הבריאות.' });

    const handle = getHandler('/scan', 'post');
    const { res, getStatus, getJson } = mockRes();
    await handle(mockReq({ url: 'https://gov.example/page' }), res);

    expect(getStatus()).toBe(201);
    expect(getJson()).toEqual({ trackedUrlId: 'tracked-1' });
    expect(mockRunFullScan).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // THE VERDICT IS RECORDED IN BOTH DIRECTIONS.
  //
  // Written after the "record rejections only" mutation SURVIVED 25 tests: the
  // unit tests exercise recordMissionAssessment directly, so nothing asserted
  // that the ROUTE calls it for an ADMIT. Recording only rejections makes the
  // rejection RATE incomputable — a filter turning away 1% is indistinguishable
  // from one turning away 90% — which is a selection-bias record with selection
  // bias in it, in the one place this platform filters its own inputs.
  // -------------------------------------------------------------------------
  it('records an ON_MISSION assessment when the page is APPROVED', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockScrapeUrl.mockResolvedValue({ title: 't', textContent: 'Ministry of Health vaccine policy update', url: 'x' });
    mockCheckRelevance.mockResolvedValue({
      isRelevant: true,
      reason: 'קשור למדיניות הבריאות.',
      contentChars: 41,
      contentTruncated: false,
    });

    const handle = getHandler('/scan', 'post');
    const { res } = mockRes();
    await handle(mockReq({ url: 'https://gov.example/page' }), res);

    const create = prisma.urlAssessment.create as unknown as jest.Mock;
    expect(create).toHaveBeenCalledTimes(1);
    const { data } = create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data['verdict']).toBe('ON_MISSION');
    expect(data['checkType']).toBe('MISSION');
    expect(data['author']).toBe('MODEL');
    expect(data['promptHash']).toBeTruthy();
    expect(data['contentTruncated']).toBe(false);
  });

  it('records an OFF_MISSION assessment when the page is REJECTED', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockScrapeUrl.mockResolvedValue({ title: 't', textContent: 'football scores', url: 'x' });
    mockCheckRelevance.mockResolvedValue({
      isRelevant: false,
      reason: 'העמוד עוסק בספורט ואינו קשור לחקירה.',
      contentChars: 15,
      contentTruncated: false,
    });

    const handle = getHandler('/scan', 'post');
    const { res, getStatus } = mockRes();
    await handle(mockReq({ url: 'https://sport.example/page' }), res);

    expect(getStatus()).toBe(422);
    const create = prisma.urlAssessment.create as unknown as jest.Mock;
    expect(create).toHaveBeenCalledTimes(1);
    const { data } = create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data['verdict']).toBe('OFF_MISSION');
    expect(data['checkType']).toBe('MISSION');
    // The reason is kept, not just returned: a rejection has to be explicable to
    // the person rejected, months later.
    expect(data['reason']).toBe('העמוד עוסק בספורט ואינו קשור לחקירה.');
  });

  it('rejects with 422 and a reason when the page is not relevant', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockScrapeUrl.mockResolvedValue({ title: 't', textContent: 'Buy shoes online, free shipping', url: 'x' });
    mockCheckRelevance.mockResolvedValue({ isRelevant: false, reason: 'אתר מסחרי שאינו קשור לחקירה.' });

    const handle = getHandler('/scan', 'post');
    const { res, getStatus, getJson } = mockRes();
    await handle(mockReq({ url: 'https://shoes.example/' }), res);

    expect(getStatus()).toBe(422);
    expect(getJson()).toEqual({
      error: 'URL not relevant to this investigation',
      reason: 'אתר מסחרי שאינו קשור לחקירה.',
      // The verdict is now returned as well as the reason, so a caller learns
      // WHICH judgement refused it rather than only why — and OFF_MISSION is
      // distinguishable from UNREADABLE, which is a verdict about the CHECK.
      verdict: 'OFF_MISSION',
    });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockRunFullScan).not.toHaveBeenCalled();
  });

  it('falls back to the earliest Wayback snapshot when the live page fetch fails', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockScrapeUrl.mockRejectedValue(new Error('403'));
    mockGetSnapshotsList.mockResolvedValue({ snapshots: [{ timestamp: '20200101000000', digest: 'd' }], hasMore: false });
    mockScrapeSnapshot.mockResolvedValue('Archived Ministry of Health guidance page');
    mockCheckRelevance.mockResolvedValue({ isRelevant: true, reason: 'קשור.' });

    const handle = getHandler('/scan', 'post');
    const { res, getStatus } = mockRes();
    await handle(mockReq({ url: 'https://gov.example/removed-page' }), res);

    expect(mockScrapeSnapshot).toHaveBeenCalledWith('https://gov.example/removed-page', '20200101000000');
    expect(getStatus()).toBe(201);
  });

  it('returns 502 when neither the live page nor any archived snapshot is available', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockScrapeUrl.mockRejectedValue(new Error('404'));
    mockGetSnapshotsList.mockResolvedValue({ snapshots: [], hasMore: false });

    const handle = getHandler('/scan', 'post');
    const { res, getStatus } = mockRes();
    await handle(mockReq({ url: 'https://nowhere.example/' }), res);

    expect(getStatus()).toBe(502);
    expect(mockCheckRelevance).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
