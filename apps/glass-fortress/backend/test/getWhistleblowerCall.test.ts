// ---------------------------------------------------------------------------
// get_whistleblower_call
//
// The call is a DERIVED view — there is no stored record. These tests pin that
// derivation: which conditions make it live, that a malformed stored analysis
// surfaces as an error rather than as an empty call, and — since publication
// became a pinned version — WHICH version it derives from: the published one
// for an anonymous caller, the head for a researcher, who is also told when
// the public call is behind.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: { thesis: { findUnique: jest.fn() }, thesisVersion: { findUnique: jest.fn() } },
}));

import { prisma } from '../src/lib/prisma';
import { researcherContext } from '../src/context/researcherContext';
import { getWhistleblowerCallHandler } from '../src/mcp/tools/getWhistleblowerCall';

const findThesis = prisma.thesis.findUnique as jest.Mock;
const findVersion = prisma.thesisVersion.findUnique as jest.Mock;

const ANALYSIS = {
  counterArguments: [],
  evidenceGaps: [
    { description: 'The internal minutes themselves', suggestedSearch: 'protocol minutes 2022' },
    { description: 'The unredacted dataset', suggestedSearch: 'raw safety dataset' },
  ],
  alternativeInterpretations: [],
  overallStrengthAssessment: 'MODERATE',
  summaryHe: 'תקציר',
};

interface CallResult {
  viewer: 'PUBLIC' | 'RESEARCHER';
  versionId?: string;
  isLive: boolean;
  reason?: string;
  error?: string;
  urls: { canonical: string; he: string; en: string };
  totalGaps?: number;
  openGaps?: number;
  currentStrength?: string;
  gaps?: { gapIndex: number; resolved: boolean; resolvedByFileHash: string | null }[];
  publication?: { isPublished: boolean; headIsPublished: boolean; versionsAhead: number };
  publicCallNote?: string;
}

interface VersionFixture {
  id: string;
  status: string;
  aiAnalysis: unknown;
  gapResolutions: { gapIndex: number; evidenceId: string }[];
  createdAt?: Date;
}

/** A thesis whose versions are given; head is the last, published is `publishedVersionId`. */
function thesis(versions: VersionFixture[], publishedVersionId: string | null = null) {
  const withDates = versions.map((v, i) => ({ ...v, createdAt: v.createdAt ?? new Date(2026, 0, i + 1) }));
  findThesis.mockResolvedValue({
    id: 't1',
    title: 'A thesis',
    headVersionId: withDates.at(-1)?.id ?? null,
    publishedVersionId,
    publishedAt: publishedVersionId ? new Date(2026, 1, 1) : null,
    publishedBy: publishedVersionId ? { handle: 'dana' } : null,
    versions: withDates.map((v) => ({ id: v.id, createdAt: v.createdAt })),
  });
  findVersion.mockImplementation(async ({ where }: { where: { id: string } }) =>
    withDates.find((v) => v.id === where.id) ?? null,
  );
}

async function asPublic(): Promise<CallResult> {
  return JSON.parse(await getWhistleblowerCallHandler({ thesisId: 't1' })) as CallResult;
}

async function asResearcher(): Promise<CallResult> {
  return researcherContext.run({ researcherId: 'r1' }, async () =>
    JSON.parse(await getWhistleblowerCallHandler({ thesisId: 't1' })) as CallResult,
  );
}

const complete = (id: string, analysis: unknown = ANALYSIS, gapResolutions: VersionFixture['gapResolutions'] = []) => ({
  id,
  status: 'COMPLETE',
  aiAnalysis: analysis,
  gapResolutions,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env['FRONTEND_URL'] = 'https://example.org';
});

describe('get_whistleblower_call — derivation', () => {
  it('is live once an analysis completes with gaps, and indexes them for FOIA', async () => {
    thesis([complete('v1')], 'v1');
    const r = await asPublic();

    expect(r.isLive).toBe(true);
    expect(r.reason).toBe('LIVE');
    expect(r.totalGaps).toBe(2);
    expect(r.openGaps).toBe(2);
    expect(r.currentStrength).toBe('MODERATE');
    // gapIndex is the contract shared with generate_foia_request.
    expect(r.gaps?.map((g) => g.gapIndex)).toEqual([0, 1]);
  });

  it('marks a gap resolved once evidence is linked to it', async () => {
    thesis([complete('v1', ANALYSIS, [{ gapIndex: 1, evidenceId: '0xdead' }])], 'v1');
    const r = await asPublic();

    expect(r.openGaps).toBe(1);
    expect(r.gaps?.[1]).toMatchObject({ resolved: true, resolvedByFileHash: '0xdead' });
    expect(r.gaps?.[0]).toMatchObject({ resolved: false, resolvedByFileHash: null });
  });

  it('is not live before the analysis completes', async () => {
    thesis([{ id: 'v1', status: 'PENDING_AI', aiAnalysis: null, gapResolutions: [] }]);
    const r = await asResearcher();

    expect(r.isLive).toBe(false);
    expect(r.reason).toBe('ANALYSIS_INCOMPLETE');
  });

  it('distinguishes "no gaps" from "not live"', async () => {
    thesis([complete('v1', { ...ANALYSIS, evidenceGaps: [] })], 'v1');
    const r = await asPublic();

    expect(r.isLive).toBe(false);
    expect(r.reason).toBe('NO_GAPS');
    expect(r.totalGaps).toBe(0);
  });

  it('rejects a malformed stored analysis instead of publishing an empty call', async () => {
    thesis([complete('v1', { evidenceGaps: 'not-an-array' })], 'v1');
    const r = await asPublic();

    expect(r.error).toBe('ANALYSIS_SHAPE_INVALID');
    expect(r.isLive).toBeUndefined();
  });

  it('reports no head version to a researcher', async () => {
    thesis([]);
    const r = await asResearcher();
    expect(r.reason).toBe('NO_HEAD_VERSION');
  });
});

describe('get_whistleblower_call — which version', () => {
  it('renders no call to the public while the thesis is unpublished, even with a live head', async () => {
    thesis([complete('v1')]);
    const r = await asPublic();

    expect(r.viewer).toBe('PUBLIC');
    expect(r.isLive).toBe(false);
    expect(r.reason).toBe('UNPUBLISHED');
    expect(r.gaps).toBeUndefined();
    expect(findVersion).not.toHaveBeenCalled();
  });

  it('derives the public call from the PUBLISHED version, not the head', async () => {
    thesis([complete('v1'), complete('v2', { ...ANALYSIS, evidenceGaps: [] })], 'v1');
    const r = await asPublic();

    expect(r.versionId).toBe('v1');
    expect(r.isLive).toBe(true);
    expect(r.publication).toBeUndefined();
  });

  it('shows a researcher the head, and tells them the public call is behind', async () => {
    thesis([complete('v1'), complete('v2', { ...ANALYSIS, evidenceGaps: [] })], 'v1');
    const r = await asResearcher();

    expect(r.viewer).toBe('RESEARCHER');
    expect(r.versionId).toBe('v2');
    expect(r.reason).toBe('NO_GAPS');
    expect(r.publication).toMatchObject({ isPublished: true, headIsPublished: false, versionsAhead: 1 });
    expect(r.publicCallNote).toContain('v1');
  });

  it('tells a researcher a draft renders no public call', async () => {
    thesis([complete('v1')]);
    const r = await asResearcher();

    expect(r.isLive).toBe(true);
    expect(r.publication).toMatchObject({ isPublished: false });
    expect(r.publicCallNote).toContain('DRAFT');
  });
});

describe('get_whistleblower_call — URLs', () => {
  it('always emits a locale-prefixed URL, never a bare path', async () => {
    thesis([complete('v1')], 'v1');
    const r = await asPublic();

    expect(r.urls.canonical).toBe('https://example.org/he/call/t1');
    expect(r.urls.en).toBe('https://example.org/en/call/t1');
    expect(r.urls.canonical).toBe(r.urls.he);
  });

  it('does not double the locale prefix when FRONTEND_URL has a trailing slash', async () => {
    process.env['FRONTEND_URL'] = 'https://example.org/';
    thesis([complete('v1')], 'v1');
    const r = await asPublic();

    expect(r.urls.canonical).toBe('https://example.org/he/call/t1');
  });

  it('reports a missing thesis rather than throwing', async () => {
    findThesis.mockResolvedValue(null);

    const r = JSON.parse(await getWhistleblowerCallHandler({ thesisId: 'nope' })) as { error: string };

    expect(r.error).toContain('nope');
  });
});
