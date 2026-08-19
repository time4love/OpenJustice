jest.mock('../src/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    thesis: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    thesisVersion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    evidence: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    thesisGapResolution: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    researchSession: {
      findFirst: jest.fn().mockResolvedValue(null), // no active session by default
    },
    researchSessionEvent: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../src/services/DevilsAdvocateAgent', () => ({
  DevilsAdvocateAgent: jest.fn().mockImplementation(() => ({
    analyze: jest.fn().mockResolvedValue({
      counterArguments: [],
      evidenceGaps: [],
      alternativeInterpretations: [],
      overallStrengthAssessment: 'MODERATE',
      summaryHe: 'ניתוח.',
    }),
  })),
}));

import { prisma } from '../src/lib/prisma';
import { Request, Response } from 'express';
import { thesisRouter } from '../src/routes/thesisRoutes';

const mockThesisFindMany = prisma.thesis.findMany as jest.Mock;
const mockThesisFindUnique = prisma.thesis.findUnique as jest.Mock;
const mockVersionFindMany = prisma.thesisVersion.findMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockEvidenceFindUnique = (prisma.evidence as unknown as { findUnique: jest.Mock }).findUnique as jest.Mock;
const mockGapResolutionUpsert = (prisma as unknown as { thesisGapResolution: { upsert: jest.Mock } }).thesisGapResolution.upsert as jest.Mock;
const mockGapResolutionDeleteMany = (prisma as unknown as { thesisGapResolution: { deleteMany: jest.Mock } }).thesisGapResolution.deleteMany as jest.Mock;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type RouterStack = Array<{
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
}>;

function getHandler(path: string, method: 'post' | 'get' | 'delete') {
  const layer = (thesisRouter as unknown as { stack: RouterStack }).stack.find(
    (l) => l.route?.path === path && l.route.methods[method],
  );
  if (!layer?.route) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  // The actual handler is always last in the chain — routes may have
  // middleware (e.g. rate limiters) mounted ahead of it.
  const { stack } = layer.route;
  return stack[stack.length - 1].handle as (req: Request, res: Response) => Promise<void>;
}

function mockReq(params: Record<string, string> = {}, body: unknown = {}, query: Record<string, string> = {}): Request {
  return { params, body, query } as unknown as Request;
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TIPTAP_DOC = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Officials knew about cardiac risks but denied it publicly.' }],
    },
  ],
};

const TIPTAP_DOC_WITH_MENTIONS = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'keyFigureMention', attrs: { id: 'Fauci', label: 'Fauci' } },
        { type: 'text', text: ' cited in ' },
        { type: 'evidenceMention', attrs: { id: 'hash-001', label: 'doc.pdf' } },
      ],
    },
  ],
};

const NOW = new Date('2026-01-15T00:00:00.000Z');

const THESIS_FIXTURE = { id: 'thesis-1', headVersionId: 'version-1', createdAt: NOW };

const VERSION_FIXTURE = {
  id: 'version-1',
  thesisId: 'thesis-1',
  parentVersionId: null,
  userContent: TIPTAP_DOC,
  aiAnalysis: null,
  contentHash: 'deadbeef',
  status: 'PENDING_AI',
  createdAt: NOW,
  mentions: [],
  _count: { mentions: 0 },
};

function setupTransaction(overrides: {
  thesisCreate?: object;
  versionCreate?: object;
  thesisUpdate?: object;
} = {}) {
  const mockTx = {
    thesis: {
      create: jest.fn().mockResolvedValue(overrides.thesisCreate ?? { id: 'thesis-1', createdAt: NOW }),
      update: jest.fn().mockResolvedValue(overrides.thesisUpdate ?? THESIS_FIXTURE),
    },
    thesisVersion: {
      create: jest.fn().mockResolvedValue(overrides.versionCreate ?? VERSION_FIXTURE),
    },
  };
  mockTransaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx));
  return mockTx;
}

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

describe('POST /', () => {
  const handle = getHandler('/', 'post');

  it('returns 400 when userContent is missing', async () => {
    const { res, getStatus } = mockRes();
    await handle(mockReq({}, {}), res);
    expect(getStatus()).toBe(400);
  });

  it('returns 400 when userContent is not a valid TipTap document', async () => {
    const { res, getStatus } = mockRes();
    await handle(mockReq({}, { userContent: { notType: 'invalid' } }), res);
    expect(getStatus()).toBe(400);
  });

  it('returns 201 and creates thesis + version in a transaction', async () => {
    setupTransaction();
    const { res, getStatus, json } = mockRes();
    await handle(mockReq({}, { userContent: TIPTAP_DOC }), res);
    expect(getStatus()).toBe(201);
    const body = (json.mock.calls[0] as [Record<string, unknown>])[0];
    const thesis = body.thesis as Record<string, unknown>;
    expect(thesis.id).toBe('thesis-1');
    expect(thesis.headVersion).toBeDefined();
    const hv = thesis.headVersion as Record<string, unknown>;
    expect(hv.status).toBe('PENDING_AI');
  });

  it('includes a text preview in the response', async () => {
    setupTransaction();
    const { res, json } = mockRes();
    await handle(mockReq({}, { userContent: TIPTAP_DOC }), res);
    const thesis = ((json.mock.calls[0] as [Record<string, unknown>])[0].thesis as Record<string, unknown>);
    const preview = (thesis.headVersion as Record<string, unknown>).preview as string;
    expect(preview).toContain('Officials knew');
  });

  it('resolves mention nodes to readable tokens in preview', async () => {
    setupTransaction();
    const { res, json } = mockRes();
    await handle(mockReq({}, { userContent: TIPTAP_DOC_WITH_MENTIONS }), res);
    const thesis = ((json.mock.calls[0] as [Record<string, unknown>])[0].thesis as Record<string, unknown>);
    const preview = (thesis.headVersion as Record<string, unknown>).preview as string;
    expect(preview).toContain('@Fauci');
    expect(preview).toContain('#ev_hash-001');
  });

  it('calls $transaction once', async () => {
    setupTransaction();
    const { res } = mockRes();
    await handle(mockReq({}, { userContent: TIPTAP_DOC }), res);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when transaction throws', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('DB error'));
    const { res, getStatus } = mockRes();
    await handle(mockReq({}, { userContent: TIPTAP_DOC }), res);
    expect(getStatus()).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

describe('GET /', () => {
  const handle = getHandler('/', 'get');

  it('returns 200 with an empty list', async () => {
    mockThesisFindMany.mockResolvedValueOnce([]);
    const { res, getStatus, json } = mockRes();
    await handle(mockReq(), res);
    expect(getStatus()).toBe(200);
    expect((json.mock.calls[0] as [{ theses: unknown[] }])[0].theses).toEqual([]);
  });

  it('returns theses with headVersion preview and mentionCount', async () => {
    mockThesisFindMany.mockResolvedValueOnce([
      { ...THESIS_FIXTURE, headVersion: { ...VERSION_FIXTURE, _count: { mentions: 3 } } },
    ]);
    const { res, getStatus, json } = mockRes();
    await handle(mockReq(), res);
    expect(getStatus()).toBe(200);
    const theses = (json.mock.calls[0] as [{ theses: Record<string, unknown>[] }])[0].theses;
    expect(theses).toHaveLength(1);
    const hv = theses[0].headVersion as Record<string, unknown>;
    expect(hv.mentionCount).toBe(3);
    expect((hv.preview as string)).toContain('Officials knew');
  });

  it('returns null headVersion for a thesis with no versions yet', async () => {
    mockThesisFindMany.mockResolvedValueOnce([
      { id: 'thesis-empty', headVersionId: null, createdAt: NOW, headVersion: null },
    ]);
    const { res, json } = mockRes();
    await handle(mockReq(), res);
    const theses = (json.mock.calls[0] as [{ theses: { headVersion: null }[] }])[0].theses;
    expect(theses[0].headVersion).toBeNull();
  });

  it('passes evidence filter to Prisma as a nested mention where clause', async () => {
    mockThesisFindMany.mockResolvedValueOnce([]);
    const { res } = mockRes();
    await handle(mockReq({}, {}, { evidence: 'abc123' }), res);
    expect(mockThesisFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { headVersion: { mentions: { some: { type: 'EVIDENCE', refId: 'abc123' } } } },
      }),
    );
  });

  it('passes no where clause when evidence param is absent', async () => {
    mockThesisFindMany.mockResolvedValueOnce([]);
    const { res } = mockRes();
    await handle(mockReq(), res);
    expect(mockThesisFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('returns 500 when Prisma throws', async () => {
    mockThesisFindMany.mockRejectedValueOnce(new Error('DB error'));
    const { res, getStatus } = mockRes();
    await handle(mockReq(), res);
    expect(getStatus()).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /:id
// ---------------------------------------------------------------------------

describe('GET /:id', () => {
  const handle = getHandler('/:id', 'get');

  it('returns 404 when thesis does not exist', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(null);
    const { res, getStatus } = mockRes();
    await handle(mockReq({ id: 'thesis-x' }), res);
    expect(getStatus()).toBe(404);
  });

  it('returns 200 with full thesis + headVersion + mentions', async () => {
    mockThesisFindUnique.mockResolvedValueOnce({
      ...THESIS_FIXTURE,
      headVersion: {
        ...VERSION_FIXTURE,
        mentions: [{ id: 'm1', type: 'KEY_FIGURE', refId: 'Fauci' }],
      },
    });
    const { res, getStatus, json } = mockRes();
    await handle(mockReq({ id: 'thesis-1' }), res);
    expect(getStatus()).toBe(200);
    const thesis = (json.mock.calls[0] as [{ thesis: { id: string } }])[0].thesis;
    expect(thesis.id).toBe('thesis-1');
  });

  it('returns 500 when Prisma throws', async () => {
    mockThesisFindUnique.mockRejectedValueOnce(new Error('DB error'));
    const { res, getStatus } = mockRes();
    await handle(mockReq({ id: 'thesis-1' }), res);
    expect(getStatus()).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /:id/version
// ---------------------------------------------------------------------------

describe('POST /:id/version', () => {
  const handle = getHandler('/:id/version', 'post');

  it('returns 400 when userContent is missing', async () => {
    const { res, getStatus } = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, {}), res);
    expect(getStatus()).toBe(400);
  });

  it('returns 404 when thesis does not exist', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(null);
    const { res, getStatus } = mockRes();
    await handle(mockReq({ id: 'thesis-x' }, { userContent: TIPTAP_DOC }), res);
    expect(getStatus()).toBe(404);
  });

  it('returns 201 with new version and parentVersionId set to previous head', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(THESIS_FIXTURE);
    setupTransaction({
      versionCreate: { ...VERSION_FIXTURE, id: 'version-2', parentVersionId: 'version-1' },
      thesisUpdate: { ...THESIS_FIXTURE, headVersionId: 'version-2' },
    });
    const { res, getStatus, json } = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, { userContent: TIPTAP_DOC }), res);
    expect(getStatus()).toBe(201);
    const thesis = ((json.mock.calls[0] as [Record<string, unknown>])[0].thesis as Record<string, unknown>);
    const hv = thesis.headVersion as Record<string, unknown>;
    expect(hv.id).toBe('version-2');
    expect(hv.parentVersionId).toBe('version-1');
  });

  it('returns 500 when transaction throws', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(THESIS_FIXTURE);
    mockTransaction.mockRejectedValueOnce(new Error('DB error'));
    const { res, getStatus } = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, { userContent: TIPTAP_DOC }), res);
    expect(getStatus()).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /:id/versions
// ---------------------------------------------------------------------------

describe('GET /:id/versions', () => {
  const handle = getHandler('/:id/versions', 'get');

  it('returns 404 when thesis does not exist', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(null);
    const { res, getStatus } = mockRes();
    await handle(mockReq({ id: 'thesis-x' }), res);
    expect(getStatus()).toBe(404);
  });

  it('returns 200 with versions list and correct isHead flags', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(THESIS_FIXTURE);
    mockVersionFindMany.mockResolvedValueOnce([
      { ...VERSION_FIXTURE, id: 'version-1', _count: { mentions: 2 } },
      { ...VERSION_FIXTURE, id: 'version-2', parentVersionId: 'version-1', _count: { mentions: 1 } },
    ]);
    const { res, getStatus, json } = mockRes();
    await handle(mockReq({ id: 'thesis-1' }), res);
    expect(getStatus()).toBe(200);
    const body = (json.mock.calls[0] as [{ versions: { id: string; isHead: boolean }[]; headVersionId: string }])[0];
    expect(body.headVersionId).toBe('version-1');
    expect(body.versions).toHaveLength(2);
    expect(body.versions.find((v) => v.id === 'version-1')?.isHead).toBe(true);
    expect(body.versions.find((v) => v.id === 'version-2')?.isHead).toBe(false);
  });

  it('includes preview and mentionCount per version', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(THESIS_FIXTURE);
    mockVersionFindMany.mockResolvedValueOnce([
      { ...VERSION_FIXTURE, _count: { mentions: 5 } },
    ]);
    const { res, json } = mockRes();
    await handle(mockReq({ id: 'thesis-1' }), res);
    const versions = (json.mock.calls[0] as [{ versions: { preview: string; mentionCount: number }[] }])[0].versions;
    expect(versions[0].preview).toContain('Officials knew');
    expect(versions[0].mentionCount).toBe(5);
  });

  it('returns 500 when Prisma throws on versions query', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(THESIS_FIXTURE);
    mockVersionFindMany.mockRejectedValueOnce(new Error('DB error'));
    const { res, getStatus } = mockRes();
    await handle(mockReq({ id: 'thesis-1' }), res);
    expect(getStatus()).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /:id/gaps/:gapIndex/resolve
// ---------------------------------------------------------------------------

describe('POST /:id/gaps/:gapIndex/resolve', () => {
  const handle = getHandler('/:id/gaps/:gapIndex/resolve', 'post');

  it('returns 400 when gapIndex is not a number', async () => {
    const { res, getStatus } = mockRes();
    await handle(mockReq({ id: 'thesis-1', gapIndex: 'abc' }, { evidenceId: 'hash-001' }), res);
    expect(getStatus()).toBe(400);
  });

  it('returns 400 when evidenceId is missing', async () => {
    const { res, getStatus } = mockRes();
    await handle(mockReq({ id: 'thesis-1', gapIndex: '0' }, {}), res);
    expect(getStatus()).toBe(400);
  });

  it('returns 404 when thesis does not exist', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(null);
    const { res, getStatus } = mockRes();
    await handle(mockReq({ id: 'thesis-x', gapIndex: '0' }, { evidenceId: 'hash-001' }), res);
    expect(getStatus()).toBe(404);
  });

  it('returns 404 when evidence does not exist', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(THESIS_FIXTURE);
    mockEvidenceFindUnique.mockResolvedValueOnce(null);
    const { res, getStatus } = mockRes();
    await handle(mockReq({ id: 'thesis-1', gapIndex: '0' }, { evidenceId: 'no-such-hash' }), res);
    expect(getStatus()).toBe(404);
  });

  it('returns 200 and upserts the resolution', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(THESIS_FIXTURE);
    mockEvidenceFindUnique.mockResolvedValueOnce({ fileHash: 'hash-001', summary: 'Test evidence' });
    mockGapResolutionUpsert.mockResolvedValueOnce({
      id: 'res-1', thesisVersionId: 'version-1', gapIndex: 0, evidenceId: 'hash-001', createdAt: new Date(),
    });
    const { res, getStatus, json } = mockRes();
    await handle(mockReq({ id: 'thesis-1', gapIndex: '0' }, { evidenceId: 'hash-001' }), res);
    expect(getStatus()).toBe(200);
    expect((json.mock.calls[0] as [{ resolution: { gapIndex: number } }])[0].resolution.gapIndex).toBe(0);
    expect(mockGapResolutionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { thesisVersionId_gapIndex: { thesisVersionId: 'version-1', gapIndex: 0 } } }),
    );
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id/gaps/:gapIndex/resolve
// ---------------------------------------------------------------------------

describe('DELETE /:id/gaps/:gapIndex/resolve', () => {
  const handle = getHandler('/:id/gaps/:gapIndex/resolve', 'delete');

  it('returns 404 when thesis does not exist', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(null);
    const { res, getStatus } = mockRes();
    await handle(mockReq({ id: 'thesis-x', gapIndex: '0' }), res);
    expect(getStatus()).toBe(404);
  });

  it('returns 204 and deletes the resolution', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(THESIS_FIXTURE);
    mockGapResolutionDeleteMany.mockResolvedValueOnce({ count: 1 });
    const endMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ end: endMock });
    const res = { status: statusMock } as unknown as Response;
    await handle(mockReq({ id: 'thesis-1', gapIndex: '0' }), res);
    expect(statusMock).toHaveBeenCalledWith(204);
    expect(endMock).toHaveBeenCalled();
    expect(mockGapResolutionDeleteMany).toHaveBeenCalledWith({
      where: { thesisVersionId: 'version-1', gapIndex: 0 },
    });
  });
});
