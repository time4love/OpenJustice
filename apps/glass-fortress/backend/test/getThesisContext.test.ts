// ---------------------------------------------------------------------------
// get_thesis_context is viewer-dependent.
//
// An anonymous caller sees the PUBLISHED version or an UNPUBLISHED answer; a
// researcher sees the head and is told how far the public is behind it. The
// test that carries the design: publish v1, move the head to v2, and the
// public still reads v1.
// ---------------------------------------------------------------------------

// The resolver has its own suite. Here the question is narrower and specific:
// does the caller receive a trajectory citation STRUCTURED, or a bare id it
// would then have to render as a bare id?
const mockResolveTrajectories = jest.fn();
jest.mock('../src/services/trajectoryCitation', () => ({
  resolveTrajectoryCitations: (ids: readonly string[]) => mockResolveTrajectories(ids) as unknown,
}));

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
  trajectoriesCited?: {
    detailLevel: 'FULL' | 'SUMMARY';
    citedMovements: number;
    citedTrajectories: number;
    supersededMovements: number;
    movements: {
      trajectoryIds: string[];
      claimCount: number;
      citedCount: number;
      transitions: number;
      finalState: string;
      // FULL only.
      claims?: string[];
      changes?: { snapshotDate: string; present: boolean; snapshotUrl: string }[];
      currency?: unknown;
      observations?: unknown;
      // SUMMARY only.
      claimPreview?: string;
    }[];
    caveat?: string;
    reduced?: { why: string; omitted: string; callInstead: string; warning: string };
  };
  trajectoryCitationsMissing?: string[];
  trajectoryCitationWarning?: string;
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
  { id: 'm4', type: 'CLAIM_TRAJECTORY', refId: 'traj-1' },
];

const RESOLVED_TRAJECTORY = {
  id: 'traj-1',
  claimHash: 'c1',
  claimText: 'טענה שנעקבה על פני כל ההעתקים',
  url: 'https://corona.health.gov.il/x',
  trackedUrlId: 'tracked-1',
  observations: [
    { snapshotDate: '2022-07-24', waybackTimestamp: '20220724000000', snapshotUrl: 'https://web.archive.org/a', present: true },
    { snapshotDate: '2022-08-05', waybackTimestamp: '20220805000000', snapshotUrl: 'https://web.archive.org/b', present: false },
  ],
  changes: [
    { snapshotDate: '2022-07-24', waybackTimestamp: '20220724000000', snapshotUrl: 'https://web.archive.org/a', present: true },
    { snapshotDate: '2022-08-05', waybackTimestamp: '20220805000000', snapshotUrl: 'https://web.archive.org/b', present: false },
  ],
  transitions: 1,
  firstSeen: '2022-07-24',
  lastSeen: '2022-07-24',
  finalState: 'REMOVED' as const,
  computation: {
    id: 'comp-1',
    sourceStateHash: 'state-1',
    detectionVersion: 'v1',
    computedAt: '2026-08-23T10:00:00.000Z',
    snapshotsExamined: 2,
  },
  coMovement: {
    patternHash: 'p1',
    claimCount: 8,
    members: [
      { id: 'traj-1', claimText: 'טענה שנעקבה על פני כל ההעתקים', cited: true },
      ...Array.from({ length: 7 }, (_, i) => ({ id: `traj-${String(i + 2)}`, claimText: 'x', cited: false })),
    ],
  },
  currency: { state: 'PINNED_IS_LATEST' as const, computedAt: '2026-08-23T10:00:00.000Z' },
  caveat: 'computed over the archived text extraction of each capture',
};

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
  mockResolveTrajectories.mockResolvedValue({ resolved: [RESOLVED_TRAJECTORY], missing: [] });
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

// ---------------------------------------------------------------------------
// Trajectory citations reach the caller as data, not as an id to look up.
//
// The wording around a trajectory is load-bearing — it describes an archived
// text EXTRACTION, not a page — and an opaque id is rendered as an opaque id.
// ---------------------------------------------------------------------------
describe('cited claim trajectories', () => {
  it('returns the citations IN FULL when they fit — claims, flips and the caveat', async () => {
    thesis([version('v1', 'text')], null);
    const r = await asResearcher();

    expect(mockResolveTrajectories).toHaveBeenCalledWith(['traj-1']);
    expect(r.trajectoriesCited).toMatchObject({
      detailLevel: 'FULL',
      citedMovements: 1,
      citedTrajectories: 1,
      supersededMovements: 0,
    });

    const movement = r.trajectoriesCited?.movements[0];
    expect(movement?.trajectoryIds).toEqual(['traj-1']);
    expect(movement?.claimCount).toBe(8);
    expect(movement?.citedCount).toBe(1);
    expect(movement?.finalState).toBe('REMOVED');
    // The material a model reasons from: the claim itself, and the captures it
    // moved on. Dates are the finding — a thesis argues about specific captures.
    expect(movement?.claims).toEqual(['טענה שנעקבה על פני כל ההעתקים']);
    expect(movement?.changes?.map((c) => c.snapshotDate)).toEqual(['2022-07-24', '2022-08-05']);
    expect(r.trajectoriesCited?.caveat).toContain('extraction');
  });

  // -------------------------------------------------------------------------
  // The size of this answer is part of its contract.
  //
  // One entry per cited row, each carrying every capture, made this response
  // 375 KB on the first real thesis and put it over the MCP tool-result limit —
  // the tool a researcher uses to READ a thesis could no longer return one.
  // Over HTTP that payload compresses away, which is why nothing caught it
  // until a model tried to read it.
  //
  // Summarising unconditionally would have fixed the size and introduced a
  // quieter fault: a model reasoning about a thesis from claim previews while
  // believing it held the citations. So the block is full when it fits, reduced
  // only when it must be, and when it is reduced it SAYS SO.
  // -------------------------------------------------------------------------
  it('falls back to a summary when the citations are too large, and says what it dropped', async () => {
    // Enough distinct movements, with long enough claims, to pass the budget.
    const many = Array.from({ length: 60 }, (_, i) => ({
      ...RESOLVED_TRAJECTORY,
      id: `traj-${String(i + 1)}`,
      claimText: `טענה ארוכה מספר ${String(i + 1)} `.repeat(40),
      coMovement: { ...RESOLVED_TRAJECTORY.coMovement, patternHash: `pattern-${String(i + 1)}` },
    }));
    mockResolveTrajectories.mockResolvedValue({ resolved: many, missing: [] });
    thesis([version('v1', 'text')], null);

    const r = await asResearcher();

    expect(r.trajectoriesCited?.detailLevel).toBe('SUMMARY');
    expect(r.trajectoriesCited?.citedMovements).toBe(60);
    expect(r.trajectoriesCited?.citedTrajectories).toBe(60);

    // None of the bulk.
    const movement = r.trajectoriesCited?.movements[0];
    expect(movement?.claims).toBeUndefined();
    expect(movement?.changes).toBeUndefined();
    expect(movement?.observations).toBeUndefined();
    expect(movement?.claimPreview).toBeDefined();

    // And the caller is told, rather than left to infer it from what is absent.
    expect(r.trajectoriesCited?.reduced?.callInstead).toBe('get_thesis_trajectory_citations');
    expect(r.trajectoriesCited?.reduced?.omitted).toContain('capture');
    expect(r.trajectoriesCited?.reduced?.warning).toContain('NOT fully represented');
  });

  it('reaches the public too — a published thesis cites the same way', async () => {
    thesis([version('v1', 'published text')], 'v1');
    const r = await asPublic();

    expect(r.trajectoriesCited?.movements[0].trajectoryIds).toEqual(['traj-1']);
  });

  it('names citations that no longer resolve instead of quietly showing fewer', async () => {
    mockResolveTrajectories.mockResolvedValue({ resolved: [], missing: ['traj-1'] });
    thesis([version('v1', 'text')], null);
    const r = await asResearcher();

    expect(r.trajectoriesCited?.movements).toEqual([]);
    expect(r.trajectoryCitationsMissing).toEqual(['traj-1']);
    expect(r.trajectoryCitationWarning).toContain('nothing behind them');
  });
});

