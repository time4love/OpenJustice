// ---------------------------------------------------------------------------
// get_thesis_context is viewer-dependent.
//
// An anonymous caller sees the PUBLISHED version or an UNPUBLISHED answer; a
// researcher sees the head and is told how far the public is behind it. The
// test that carries the design: publish v1, move the head to v2, and the
// public still reads v1.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    thesis: { findUnique: jest.fn() },
    thesisVersion: { findUnique: jest.fn() },
    evidence: { findMany: jest.fn() },
    researchSession: { findFirst: jest.fn() },
  },
}));

import { prisma } from '../src/lib/prisma';
import { researcherContext } from '../src/context/researcherContext';
import { getThesisContextHandler } from '../src/mcp/tools/getThesisContext';

const findThesis = prisma.thesis.findUnique as jest.Mock;
const findVersion = prisma.thesisVersion.findUnique as jest.Mock;
const findEvidence = prisma.evidence.findMany as jest.Mock;
const findSession = prisma.researchSession.findFirst as jest.Mock;

interface ContextResult {
  viewer: 'PUBLIC' | 'RESEARCHER';
  status?: string;
  versionId?: string;
  headVersionId?: string;
  content?: unknown;
  devilsAdvocateCritique?: unknown;
  keyFiguresMentioned?: string[];
  evidenceCited?: { fileHash: string }[];
  publicInterestStatement?: string | null;
  publication?: { isPublished: boolean; headIsPublished: boolean; versionsAhead: number; publishedBy?: string | null };
  publicationNote?: string;
  versions?: { id: string; isPublished: boolean }[];
  lastSession?: unknown;
  error?: string;
}

const mentions = [
  { id: 'm1', type: 'EVIDENCE', refId: 'abc123' },
  { id: 'm2', type: 'KEY_FIGURE', refId: 'שרון אלרועי-פרייס' },
  { id: 'm3', type: 'TRACKED_URL', refId: 'url-1' },
];

function version(id: string, text: string) {
  return {
    id,
    status: 'COMPLETE',
    userContent: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    aiAnalysis: { evidenceGaps: [{ description: `gap of ${id}`, suggestedSearch: 's' }], overallStrengthAssessment: 'STRONG' },
    contentHash: `hash-${id}`,
    createdAt: new Date(2026, 0, Number(id.slice(1))),
    mentions,
    gapResolutions: [],
  };
}

function thesis(versions: ReturnType<typeof version>[], publishedVersionId: string | null) {
  findThesis.mockResolvedValue({
    id: 'thesis-1',
    title: 'T',
    headVersionId: versions.at(-1)?.id ?? null,
    publishedVersionId,
    publishedAt: publishedVersionId ? new Date(2026, 1, 1) : null,
    publishedBy: publishedVersionId ? { handle: 'dana' } : null,
    publicInterestStatement: 'why the public needs this',
    versions: versions.map((v) => ({
      id: v.id,
      status: v.status,
      contentHash: v.contentHash,
      createdAt: v.createdAt,
      aiAnalysis: v.aiAnalysis,
    })),
  });
  findVersion.mockImplementation(async ({ where }: { where: { id: string } }) =>
    versions.find((v) => v.id === where.id) ?? null,
  );
}

const asPublic = async () => JSON.parse(await getThesisContextHandler({ thesisId: 'thesis-1' })) as ContextResult;
const asResearcher = () =>
  researcherContext.run({ researcherId: 'r1' }, async () =>
    JSON.parse(await getThesisContextHandler({ thesisId: 'thesis-1' })) as ContextResult,
  );

beforeEach(() => {
  jest.clearAllMocks();
  findEvidence.mockResolvedValue([{ fileHash: 'abc123', summary: 'Key evidence', evidenceTier: 'Tier 2: Material' }]);
  findSession.mockResolvedValue(null);
});

describe('get_thesis_context — the public', () => {
  it('gets UNPUBLISHED for a draft, and nothing of its content', async () => {
    thesis([version('v1', 'draft text')], null);
    const r = await asPublic();

    expect(r.viewer).toBe('PUBLIC');
    expect(r.status).toBe('UNPUBLISHED');
    expect(r.content).toBeUndefined();
    expect(findVersion).not.toHaveBeenCalled();
  });

  it('reads the PUBLISHED version after the head moves — publishing pins, editing changes nothing public', async () => {
    thesis([version('v1', 'published text'), version('v2', 'newer head text')], 'v1');
    const r = await asPublic();

    expect(r.versionId).toBe('v1');
    expect(JSON.stringify(r.content)).toContain('published text');
    expect(JSON.stringify(r.content)).not.toContain('newer head text');
    expect(r.devilsAdvocateCritique).toMatchObject({ evidenceGaps: [{ description: 'gap of v1' }] });
    expect(r.publicInterestStatement).toBe('why the public needs this');
    // Research-internal context is not served to the public.
    expect(r.lastSession).toBeUndefined();
    expect(r.versions).toBeUndefined();
    expect(findSession).not.toHaveBeenCalled();
  });
});

describe('get_thesis_context — a researcher', () => {
  it('sees the head and is told the public is behind it', async () => {
    thesis([version('v1', 'published text'), version('v2', 'newer head text')], 'v1');
    const r = await asResearcher();

    expect(r.viewer).toBe('RESEARCHER');
    expect(r.versionId).toBe('v2');
    expect(r.headVersionId).toBe('v2');
    expect(JSON.stringify(r.content)).toContain('newer head text');
    expect(r.publication).toMatchObject({ isPublished: true, headIsPublished: false, versionsAhead: 1, publishedBy: 'dana' });
    expect(r.publicationNote).toContain('1 version(s) behind');
    expect(r.versions?.map((v) => [v.id, v.isPublished])).toEqual([
      ['v1', true],
      ['v2', false],
    ]);
  });

  it('sees a draft as DRAFT', async () => {
    thesis([version('v1', 'draft text')], null);
    const r = await asResearcher();

    expect(r.versionId).toBe('v1');
    expect(r.publication?.isPublished).toBe(false);
    expect(r.publicationNote).toContain('DRAFT');
  });

  it('is told when the head is what the public sees', async () => {
    thesis([version('v1', 'text')], 'v1');
    const r = await asResearcher();
    expect(r.publication?.headIsPublished).toBe(true);
  });

  it('gets the cited evidence, key figures, and session context', async () => {
    thesis([version('v1', 'text')], 'v1');
    findSession.mockResolvedValue({
      id: 's1',
      name: 'S',
      status: 'ACTIVE',
      createdAt: new Date(),
      closedAt: null,
      events: [{ type: 'NOTE', description: 'a note', createdAt: new Date() }],
    });
    const r = await asResearcher();

    expect(r.evidenceCited?.[0].fileHash).toBe('abc123');
    expect(r.keyFiguresMentioned).toEqual(['שרון אלרועי-פרייס']);
    expect(r.lastSession).toMatchObject({ id: 's1', lastNote: 'a note' });
  });

  it('reports no version yet', async () => {
    thesis([], null);
    const r = await asResearcher();
    expect(r.status).toBe('NO_VERSION');
  });
});

it('reports an unknown thesis', async () => {
  findThesis.mockResolvedValue(null);
  const r = await asPublic();
  expect(r.error).toContain('thesis-1');
});
