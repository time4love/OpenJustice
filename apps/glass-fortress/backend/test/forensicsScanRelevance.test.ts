jest.mock('../src/lib/prisma', () => ({
  prisma: {
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
    getSnapshotsList: mockGetSnapshotsList,
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
