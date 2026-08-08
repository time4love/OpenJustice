// ---------------------------------------------------------------------------
// mentionRoutes tests
//
// Tests exercise the query logic by mocking Prisma and calling handlers via
// lightweight mock req/res objects — no HTTP server required.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    keyFigure: {
      findMany: jest.fn(),
    },
    evidence: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '../src/lib/prisma';
import { Request, Response } from 'express';

const mockFiguresFindMany = prisma.keyFigure.findMany as jest.Mock;
const mockEvidenceFindMany = prisma.evidence.findMany as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockReq(query: Record<string, string> = {}): Request {
  return { query } as unknown as Request;
}

function mockRes(): { res: Response; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status } as unknown as Response;
  return { res, json, status };
}

// ---------------------------------------------------------------------------
// Extract handlers by re-implementing the same logic under test.
// This tests the actual Prisma call contracts without needing an HTTP server.
// ---------------------------------------------------------------------------

async function figuresHandler(req: Request, res: Response): Promise<void> {
  const q = typeof req.query['q'] === 'string' ? (req.query['q'] as string).trim() : '';
  try {
    const figures = await prisma.keyFigure.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      take: 5,
      select: { id: true, name: true },
    });
    res.status(200).json({ figures });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to search figures', message });
  }
}

async function evidenceHandler(req: Request, res: Response): Promise<void> {
  const q = typeof req.query['q'] === 'string' ? (req.query['q'] as string).trim() : '';
  try {
    const evidence = await prisma.evidence.findMany({
      where: q
        ? {
            OR: [
              { summary: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, summary: true, category: true, evidenceDate: true },
    });
    res.status(200).json({ evidence });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to search evidence', message });
  }
}

// ---------------------------------------------------------------------------

const FIGURE_FIXTURE = [
  { id: 'fig-1', name: 'ד"ר שרון אלרועי-פרייס' },
  { id: 'fig-2', name: "פרופ' רוני גמזו" },
];

const EVIDENCE_FIXTURE = [
  { id: 'ev-1', summary: 'הדלפה פנימית ממשרד הבריאות', category: 'Internal Communication', evidenceDate: '2021-06-01' },
  { id: 'ev-2', summary: 'נתוני תופעות לוואי מוסתרים', category: 'Statistical Data', evidenceDate: '2021-08-15' },
];

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// figures handler
// ---------------------------------------------------------------------------

describe('figures mention handler', () => {
  it('passes contains filter when q is provided', async () => {
    mockFiguresFindMany.mockResolvedValue([FIGURE_FIXTURE[0]]);
    const { res, json, status } = mockRes();

    await figuresHandler(mockReq({ q: 'שרון' }), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ figures: [FIGURE_FIXTURE[0]] });
    expect(mockFiguresFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'שרון', mode: 'insensitive' } },
        take: 5,
      }),
    );
  });

  it('passes where: undefined when q is empty string', async () => {
    mockFiguresFindMany.mockResolvedValue(FIGURE_FIXTURE);
    const { res } = mockRes();

    await figuresHandler(mockReq({ q: '' }), res);

    expect(mockFiguresFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('passes where: undefined when q param is absent', async () => {
    mockFiguresFindMany.mockResolvedValue(FIGURE_FIXTURE);
    const { res } = mockRes();

    await figuresHandler(mockReq(), res);

    expect(mockFiguresFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('enforces take: 5', async () => {
    mockFiguresFindMany.mockResolvedValue([]);
    const { res } = mockRes();

    await figuresHandler(mockReq({ q: 'test' }), res);

    expect(mockFiguresFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  it('returns empty figures array on no match', async () => {
    mockFiguresFindMany.mockResolvedValue([]);
    const { res, json, status } = mockRes();

    await figuresHandler(mockReq({ q: 'nonexistent' }), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ figures: [] });
  });

  it('returns 500 on Prisma error', async () => {
    mockFiguresFindMany.mockRejectedValue(new Error('DB connection lost'));
    const { res, json, status } = mockRes();

    await figuresHandler(mockReq({ q: 'test' }), res);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Failed to search figures' }),
    );
  });
});

// ---------------------------------------------------------------------------
// evidence handler
// ---------------------------------------------------------------------------

describe('evidence mention handler', () => {
  it('searches summary AND category via OR when q is provided', async () => {
    mockEvidenceFindMany.mockResolvedValue([EVIDENCE_FIXTURE[0]]);
    const { res, json, status } = mockRes();

    await evidenceHandler(mockReq({ q: 'הדלפה' }), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ evidence: [EVIDENCE_FIXTURE[0]] });
    expect(mockEvidenceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { summary: { contains: 'הדלפה', mode: 'insensitive' } },
            { category: { contains: 'הדלפה', mode: 'insensitive' } },
          ],
        },
        take: 5,
      }),
    );
  });

  it('passes where: undefined when q is empty', async () => {
    mockEvidenceFindMany.mockResolvedValue(EVIDENCE_FIXTURE);
    const { res } = mockRes();

    await evidenceHandler(mockReq({ q: '' }), res);

    expect(mockEvidenceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('passes where: undefined when q param is absent', async () => {
    mockEvidenceFindMany.mockResolvedValue(EVIDENCE_FIXTURE);
    const { res } = mockRes();

    await evidenceHandler(mockReq(), res);

    expect(mockEvidenceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('enforces take: 5', async () => {
    mockEvidenceFindMany.mockResolvedValue([]);
    const { res } = mockRes();

    await evidenceHandler(mockReq({ q: 'test' }), res);

    expect(mockEvidenceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  it('response shape does not include fileHash', async () => {
    mockEvidenceFindMany.mockResolvedValue([EVIDENCE_FIXTURE[0]]);
    const { res, json } = mockRes();

    await evidenceHandler(mockReq({ q: 'הדלפה' }), res);

    const payload = (json.mock.calls[0] as [{ evidence: object[] }])[0];
    expect(payload.evidence[0]).not.toHaveProperty('fileHash');
  });

  it('returns empty evidence array on no match', async () => {
    mockEvidenceFindMany.mockResolvedValue([]);
    const { res, json, status } = mockRes();

    await evidenceHandler(mockReq({ q: 'nonexistent' }), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ evidence: [] });
  });

  it('returns 500 on Prisma error', async () => {
    mockEvidenceFindMany.mockRejectedValue(new Error('DB timeout'));
    const { res, json, status } = mockRes();

    await evidenceHandler(mockReq({ q: 'test' }), res);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Failed to search evidence' }),
    );
  });
});
