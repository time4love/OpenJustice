// evidenceRoutes.ts transitively imports webScraper → jsdom (ESM-only).
// Mock these at the boundary so ts-jest can load the module.
jest.mock('../src/utils/webScraper', () => ({ scrapeUrl: jest.fn() }));
jest.mock('../src/services/IntakeAgent', () => ({ IntakeAgent: jest.fn(), IntakeOutputSchema: {} }));
jest.mock('../src/services/VectorStoreService', () => ({ VectorStoreService: { create: jest.fn() } }));
jest.mock('../src/services/Web3Service', () => ({ Web3Service: jest.fn(), DuplicateEvidenceError: class {} }));
jest.mock('../src/services/StorageService', () => ({ StorageService: jest.fn() }));
jest.mock('../src/lib/encrypt', () => ({ encryptContact: jest.fn() }));

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    keyFigure: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '../src/lib/prisma';
import { Request, Response } from 'express';
import { evidenceRouter } from '../src/routes/evidenceRoutes';

const mockFindMany = prisma.keyFigure.findMany as jest.Mock;

type RouterStack = Array<{
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
}>;

function getHandler(path: string, method: 'get') {
  const layer = (evidenceRouter as unknown as { stack: RouterStack }).stack.find(
    (l) => l.route?.path === path && l.route.methods[method],
  );
  if (!layer?.route) throw new Error(`Route not found: GET ${path}`);
  return layer.route.stack[0].handle as (req: Request, res: Response) => Promise<void>;
}

function mockReq(query: Record<string, string> = {}): Request {
  return { query } as unknown as Request;
}

function mockRes() {
  let code = 0;
  const json = jest.fn();
  const status = jest.fn((c: number) => {
    code = c;
    return { json };
  });
  return { res: { status } as unknown as Response, json, getStatus: () => code };
}

const FIGURES_FIXTURE = [
  { id: 'fig-1', name: 'Anthony Fauci', _count: { evidence: 5 } },
  { id: 'fig-2', name: 'Benjamin Netanyahu', _count: { evidence: 12 } },
];

beforeEach(() => jest.clearAllMocks());

describe('GET /api/evidence/key-figures', () => {
  const handle = getHandler('/key-figures', 'get');

  it('returns 200 with empty list when no figures exist', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const { res, getStatus, json } = mockRes();
    await handle(mockReq(), res);
    expect(getStatus()).toBe(200);
    expect((json.mock.calls[0] as [{ keyFigures: unknown[] }])[0].keyFigures).toEqual([]);
  });

  it('returns key figures with id, name, evidenceCount', async () => {
    mockFindMany.mockResolvedValueOnce(FIGURES_FIXTURE);
    const { res, getStatus, json } = mockRes();
    await handle(mockReq(), res);
    expect(getStatus()).toBe(200);
    const { keyFigures } = (json.mock.calls[0] as [{ keyFigures: { id: string; name: string; evidenceCount: number }[] }])[0];
    expect(keyFigures).toHaveLength(2);
    expect(keyFigures[0]).toEqual({ id: 'fig-1', name: 'Anthony Fauci', evidenceCount: 5 });
    expect(keyFigures[1]).toEqual({ id: 'fig-2', name: 'Benjamin Netanyahu', evidenceCount: 12 });
  });

  it('passes q filter to Prisma as a case-insensitive contains', async () => {
    mockFindMany.mockResolvedValueOnce([FIGURES_FIXTURE[0]]);
    const { res } = mockRes();
    await handle(mockReq({ q: 'fauci' }), res);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'fauci', mode: 'insensitive' } },
      }),
    );
  });

  it('passes no where clause when q is empty', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const { res } = mockRes();
    await handle(mockReq({ q: '' }), res);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('applies the limit query parameter', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const { res } = mockRes();
    await handle(mockReq({ limit: '5' }), res);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  it('returns 400 for a non-numeric limit', async () => {
    const { res, getStatus } = mockRes();
    await handle(mockReq({ limit: 'abc' }), res);
    expect(getStatus()).toBe(400);
  });

  it('returns 400 for limit of 0', async () => {
    const { res, getStatus } = mockRes();
    await handle(mockReq({ limit: '0' }), res);
    expect(getStatus()).toBe(400);
  });

  it('returns 500 when Prisma throws', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('DB down'));
    const { res, getStatus } = mockRes();
    await handle(mockReq(), res);
    expect(getStatus()).toBe(500);
  });
});
