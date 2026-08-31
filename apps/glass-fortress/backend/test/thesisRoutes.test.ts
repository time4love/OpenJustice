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

jest.mock('../src/services/thesisPublication', () => ({
  assessPublication: jest.fn(),
  publishThesis: jest.fn(),
  unpublishThesis: jest.fn(),
}));

jest.mock('../src/services/thesisProvenance', () => ({
  getThesisProvenance: jest.fn(),
}));

jest.mock('../src/services/thesisFraming', () => ({
  repairFramingLink: jest.fn(),
}));

import { prisma } from '../src/lib/prisma';
import { Request, Response } from 'express';
import { thesisRouter } from '../src/routes/thesisRoutes';
import { requireResearcher } from '../src/middleware/researcherIdentity';
import { assessPublication, publishThesis, unpublishThesis } from '../src/services/thesisPublication';
import { getThesisProvenance } from '../src/services/thesisProvenance';
import { repairFramingLink } from '../src/services/thesisFraming';

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

function middlewareOf(path: string, method: 'post' | 'get' | 'delete'): unknown[] {
  const layer = (thesisRouter as unknown as { stack: RouterStack }).stack.find(
    (l) => l.route?.path === path && l.route.methods[method],
  );
  if (!layer?.route) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack.map((l) => l.handle);
}

function mockReq(
  params: Record<string, string> = {},
  body: unknown = {},
  query: Record<string, string> = {},
  researcherId?: string,
): Request {
  return { params, body, query, researcherId } as unknown as Request;
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

const THESIS_FIXTURE = {
  id: 'thesis-1',
  title: null,
  headVersionId: 'version-1',
  publishedVersionId: null,
  publishedAt: null,
  publishedBy: null,
  publicInterestStatement: null,
  createdAt: NOW,
  versions: [{ id: 'version-1', createdAt: NOW }],
};

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

// `POST /` is gone: creating a thesis is not a UI act, and `create_thesis_draft`
// on MCP covers it while also attaching the framing session. Its tests went with
// it rather than being retargeted — a test for a route that does not exist is a
// test that asserts nothing. See docs/gf-prosecutor-dev-plan.md §11.1.

describe('GET /', () => {
  const handle = getHandler('/', 'get');
  const listed = { ...VERSION_FIXTURE, status: 'COMPLETE', _count: { mentions: 3 } };

  it('returns 200 with an empty list', async () => {
    mockThesisFindMany.mockResolvedValueOnce([]);
    const { res, getStatus, json } = mockRes();
    await handle(mockReq(), res);
    expect(getStatus()).toBe(200);
    expect((json.mock.calls[0] as [{ theses: unknown[] }])[0].theses).toEqual([]);
  });

  it('lists the public only PUBLISHED theses, previewed from the published version', async () => {
    mockThesisFindMany.mockResolvedValueOnce([
      { ...THESIS_FIXTURE, publishedVersionId: 'version-1', headVersion: { ...listed, id: 'version-2' }, publishedVersion: listed },
    ]);
    const { res, getStatus, json } = mockRes();
    await handle(mockReq(), res);
    expect(getStatus()).toBe(200);
    expect(mockThesisFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publishedVersionId: { not: null } } }),
    );
    const body = (json.mock.calls[0] as [{ viewer: string; theses: Record<string, unknown>[] }])[0];
    expect(body.viewer).toBe('PUBLIC');
    const v = body.theses[0].version as Record<string, unknown>;
    expect(v.id).toBe('version-1');
    expect(v.mentionCount).toBe(3);
    expect(v.preview as string).toContain('Officials knew');
  });

  it('lists a researcher every thesis, previewed from the head, with publication state', async () => {
    mockThesisFindMany.mockResolvedValueOnce([
      { ...THESIS_FIXTURE, headVersion: listed, publishedVersion: null },
    ]);
    const { res, json } = mockRes();
    await handle(mockReq({}, {}, {}, 'r1'), res);
    expect(mockThesisFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    const body = (json.mock.calls[0] as [{ viewer: string; theses: Record<string, unknown>[] }])[0];
    expect(body.viewer).toBe('RESEARCHER');
    expect((body.theses[0].version as Record<string, unknown>).id).toBe('version-1');
    expect(body.theses[0].publication).toMatchObject({ isPublished: false, headIsPublished: false });
  });

  it('returns null version for a thesis with no versions yet', async () => {
    mockThesisFindMany.mockResolvedValueOnce([
      { ...THESIS_FIXTURE, id: 'thesis-empty', headVersionId: null, versions: [], headVersion: null, publishedVersion: null },
    ]);
    const { res, json } = mockRes();
    await handle(mockReq({}, {}, {}, 'r1'), res);
    const theses = (json.mock.calls[0] as [{ theses: { version: null }[] }])[0].theses;
    expect(theses[0].version).toBeNull();
  });

  it('applies the evidence filter to the version the viewer is served', async () => {
    mockThesisFindMany.mockResolvedValue([]);
    const { res } = mockRes();
    await handle(mockReq({}, {}, { evidence: 'abc123' }, 'r1'), res);
    expect(mockThesisFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { headVersion: { mentions: { some: { type: 'EVIDENCE', refId: 'abc123' } } } },
      }),
    );
    await handle(mockReq({}, {}, { evidence: 'abc123' }), res);
    expect(mockThesisFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          publishedVersionId: { not: null },
          publishedVersion: { mentions: { some: { type: 'EVIDENCE', refId: 'abc123' } } },
        },
      }),
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
  const mockVersionFindUnique = prisma.thesisVersion.findUnique as jest.Mock;
  const full = { ...VERSION_FIXTURE, mentions: [{ id: 'm1', type: 'KEY_FIGURE', refId: 'Fauci' }], gapResolutions: [] };

  it('returns 404 when thesis does not exist', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(null);
    const { res, getStatus } = mockRes();
    await handle(mockReq({ id: 'thesis-x' }), res);
    expect(getStatus()).toBe(404);
  });

  it('returns 404 to the public while the thesis is unpublished — a draft does not exist publicly', async () => {
    mockThesisFindUnique.mockResolvedValueOnce(THESIS_FIXTURE);
    const { res, getStatus } = mockRes();
    await handle(mockReq({ id: 'thesis-1' }), res);
    expect(getStatus()).toBe(404);
    expect(mockVersionFindUnique).not.toHaveBeenCalled();
  });

  it('serves the public the PUBLISHED version, not the head', async () => {
    mockThesisFindUnique.mockResolvedValueOnce({
      ...THESIS_FIXTURE,
      headVersionId: 'version-2',
      publishedVersionId: 'version-1',
      versions: [{ id: 'version-1', createdAt: NOW }, { id: 'version-2', createdAt: new Date('2026-02-01') }],
    });
    mockVersionFindUnique.mockResolvedValueOnce(full);
    const { res, getStatus, json } = mockRes();
    await handle(mockReq({ id: 'thesis-1' }), res);
    expect(getStatus()).toBe(200);
    expect(mockVersionFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'version-1' } }));
    const thesis = (json.mock.calls[0] as [{ thesis: { viewer: string; version: { id: string } } }])[0].thesis;
    expect(thesis.viewer).toBe('PUBLIC');
    expect(thesis.version.id).toBe('version-1');
  });

  it('serves a researcher the head, with publication state', async () => {
    mockThesisFindUnique.mockResolvedValueOnce({
      ...THESIS_FIXTURE,
      headVersionId: 'version-2',
      publishedVersionId: 'version-1',
      versions: [{ id: 'version-1', createdAt: NOW }, { id: 'version-2', createdAt: new Date('2026-02-01') }],
    });
    mockVersionFindUnique.mockResolvedValueOnce({ ...full, id: 'version-2' });
    const { res, getStatus, json } = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, {}, {}, 'r1'), res);
    expect(getStatus()).toBe(200);
    expect(mockVersionFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'version-2' } }));
    const thesis = (json.mock.calls[0] as [{ thesis: Record<string, unknown> }])[0].thesis;
    expect(thesis.viewer).toBe('RESEARCHER');
    expect(thesis.publication).toMatchObject({ isPublished: true, headIsPublished: false, versionsAhead: 1 });
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

  it('GET /:id/versions/:versionId reports the REAL publication state — never a defaulted zero', async () => {
    const handle = getHandler('/:id/versions/:versionId', 'get');
    mockThesisFindUnique.mockResolvedValueOnce({
      ...THESIS_FIXTURE,
      headVersionId: 'version-3',
      publishedVersionId: 'version-1',
      publishedBy: { handle: 'dana' },
      versions: [
        { id: 'version-1', createdAt: NOW },
        { id: 'version-2', createdAt: new Date('2026-02-01') },
        { id: 'version-3', createdAt: new Date('2026-03-01') },
      ],
    });
    (prisma.thesisVersion.findUnique as jest.Mock).mockResolvedValueOnce({ ...VERSION_FIXTURE, id: 'version-2', createdAt: new Date('2026-02-01') });
    (prisma.thesisVersion as unknown as { count: jest.Mock }).count = jest.fn().mockResolvedValue(1);
    (prisma.evidence.findMany as jest.Mock).mockResolvedValueOnce([]);
    const { res, getStatus, json } = mockRes();
    await handle(mockReq({ id: 'thesis-1', versionId: 'version-2' }, {}, {}, 'r1'), res);
    expect(getStatus()).toBe(200);
    const body = (json.mock.calls[0] as [{ thesis: { publication: Record<string, unknown> }; isPublished: boolean }])[0];
    expect(body.thesis.publication).toMatchObject({ isPublished: true, versionsAhead: 2, publishedBy: 'dana', headIsPublished: false });
    expect(body.isPublished).toBe(false);
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

// ---------------------------------------------------------------------------
// Publication endpoints — the web half of the gate. The checks themselves are
// tested in thesisPublication.test.ts; here: the gate is MOUNTED, and the
// service's answer maps to the right status.
// ---------------------------------------------------------------------------

describe('publication endpoints', () => {
  it('mounts requireResearcher on every publication and version-history route', () => {
    for (const [path, method] of [
      ['/:id/publication-readiness', 'post'],
      ['/:id/publish', 'post'],
      ['/:id/unpublish', 'post'],
      ['/:id/versions', 'get'],
      ['/:id/versions/:versionId', 'get'],
    ] as const) {
      expect(middlewareOf(path, method)).toContain(requireResearcher);
    }
  });

  it('POST /:id/publish — 400 without a rationale, 422 when refused, 200 when published', async () => {
    const handle = getHandler('/:id/publish', 'post');

    let r = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, {}, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(400);
    expect(publishThesis).not.toHaveBeenCalled();

    (publishThesis as jest.Mock).mockResolvedValueOnce({ published: false, refusedBy: ['CALL_LIVE'], sessionId: 's', report: {} });
    r = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, { rationale: 'argued' }, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(422);

    (publishThesis as jest.Mock).mockResolvedValueOnce({ published: true, publishedVersionId: 'v1' });
    r = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, { rationale: 'argued', publicInterestStatement: 'why' }, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(200);
    expect(publishThesis).toHaveBeenLastCalledWith('thesis-1', 'r1', 'argued', 'why');
  });

  it('POST /:id/publish — 409 when no session is active, 404 for an unknown thesis', async () => {
    const handle = getHandler('/:id/publish', 'post');

    (publishThesis as jest.Mock).mockResolvedValueOnce({ published: false, error: 'NO_ACTIVE_SESSION', explanation: 'open one' });
    let r = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, { rationale: 'argued' }, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(409);

    (publishThesis as jest.Mock).mockResolvedValueOnce({ error: 'THESIS_NOT_FOUND', thesisId: 'x' });
    r = mockRes();
    await handle(mockReq({ id: 'x' }, { rationale: 'argued' }, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(404);
  });

  it('POST /:id/unpublish — requires a reason; 409 when not published', async () => {
    const handle = getHandler('/:id/unpublish', 'post');

    let r = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, {}, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(400);

    (unpublishThesis as jest.Mock).mockResolvedValueOnce({ unpublished: false, error: 'NOT_PUBLISHED', thesisId: 'thesis-1' });
    r = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, { reason: 'retract' }, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(409);

    (unpublishThesis as jest.Mock).mockResolvedValueOnce({ unpublished: true });
    r = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, { reason: 'retract' }, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(200);
    expect(unpublishThesis).toHaveBeenLastCalledWith('thesis-1', 'r1', 'retract');
  });

  it('POST /:id/publication-readiness — passes an optional rationale and statement through, writes nothing', async () => {
    const handle = getHandler('/:id/publication-readiness', 'post');
    (assessPublication as jest.Mock).mockResolvedValueOnce({ publishable: false, checks: [] });
    const r = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, { publicInterestStatement: 'why' }, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(200);
    expect(assessPublication).toHaveBeenCalledWith('thesis-1', null, 'why');
    expect(publishThesis).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Provenance — how this thesis came to say what it says.
//
// docs/gf-thesis-provenance-ui-dev-plan.md. The record already existed as
// ResearchSessionEvent rows and nothing outside MCP could read it. These tests
// cover the WEB half: the gate is mounted, and the service's answer maps to a
// status. The reasoning over the record is tested in thesisProvenance.test.ts.
// ---------------------------------------------------------------------------

describe('provenance endpoints', () => {
  it('mounts requireResearcher on both provenance routes', () => {
    // Not a convention: this view concentrates rejected framings, recorded
    // dissent, and an adversary's objections about named living officials —
    // deliberation the platform deliberately does not publish.
    for (const [path, method] of [
      ['/:id/provenance', 'get'],
      ['/:id/provenance/repair', 'post'],
    ] as const) {
      expect(middlewareOf(path, method)).toContain(requireResearcher);
    }
  });

  it('GET /:id/provenance — 404 for an unknown thesis, 200 with the record', async () => {
    const handle = getHandler('/:id/provenance', 'get');

    (getThesisProvenance as jest.Mock).mockResolvedValueOnce({
      error: 'THESIS_NOT_FOUND',
      thesisId: 'nope',
    });
    let r = mockRes();
    await handle(mockReq({ id: 'nope' }, {}, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(404);

    (getThesisProvenance as jest.Mock).mockResolvedValueOnce({
      thesisId: 'thesis-1',
      sessions: [],
      counts: { sessions: 0, events: 0, malformedAssessments: 0 },
      empty: true,
      recordedDissent: [],
    });
    r = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, {}, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(200);
    expect(getThesisProvenance).toHaveBeenLastCalledWith('thesis-1');
  });

  it('POST /:id/provenance/repair — 400 without a sessionId, 409 on refusal, 200 on repair', async () => {
    const handle = getHandler('/:id/provenance/repair', 'post');

    let r = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, {}, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(400);
    expect(repairFramingLink).not.toHaveBeenCalled();

    // A session already bound to another thesis is a CONFLICT, not a missing
    // resource: the record exists and refuses to be rewritten.
    (repairFramingLink as jest.Mock).mockResolvedValueOnce({
      repaired: false,
      reason: 'SESSION_ALREADY_HAS_THESIS',
      boundThesisId: 'thesis-2',
    });
    r = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, { sessionId: 's1' }, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(409);

    (repairFramingLink as jest.Mock).mockResolvedValueOnce({ repaired: false, reason: 'SESSION_NOT_FOUND' });
    r = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, { sessionId: 's1' }, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(404);

    (repairFramingLink as jest.Mock).mockResolvedValueOnce({
      repaired: true,
      sessionId: 's1',
      thesisId: 'thesis-1',
    });
    r = mockRes();
    await handle(mockReq({ id: 'thesis-1' }, { sessionId: 's1' }, {}, 'r1'), r.res);
    expect(r.getStatus()).toBe(200);
    expect(repairFramingLink).toHaveBeenLastCalledWith('s1', 'thesis-1');
  });
});
