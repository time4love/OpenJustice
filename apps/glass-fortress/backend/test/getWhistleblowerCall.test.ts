// ---------------------------------------------------------------------------
// get_whistleblower_call
//
// The call is a DERIVED view — there is no stored record. These tests pin that
// derivation: which conditions make it live, and that a malformed stored
// analysis surfaces as an error rather than as an empty call. The second case
// matters most: an empty call and a broken call look identical to a reader,
// and only one of them means "nothing to ask the public for".
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: { thesis: { findUnique: jest.fn() } },
}));

import { prisma } from '../src/lib/prisma';
import { getWhistleblowerCallHandler } from '../src/mcp/tools/getWhistleblowerCall';

const findUnique = prisma.thesis.findUnique as jest.Mock;

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
  isLive: boolean;
  reason?: string;
  error?: string;
  urls: { canonical: string; he: string; en: string };
  totalGaps?: number;
  openGaps?: number;
  currentStrength?: string;
  gaps?: { gapIndex: number; resolved: boolean; resolvedByFileHash: string | null }[];
}

async function run(thesis: unknown): Promise<CallResult> {
  findUnique.mockResolvedValue(thesis);
  return JSON.parse(await getWhistleblowerCallHandler({ thesisId: 't1' })) as CallResult;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env['FRONTEND_URL'] = 'https://example.org';
});

describe('get_whistleblower_call', () => {
  it('is live once an analysis completes with gaps, and indexes them for FOIA', async () => {
    const r = await run({
      id: 't1',
      title: 'A thesis',
      headVersion: { id: 'v1', status: 'COMPLETE', aiAnalysis: ANALYSIS, gapResolutions: [] },
    });

    expect(r.isLive).toBe(true);
    expect(r.reason).toBe('LIVE');
    expect(r.totalGaps).toBe(2);
    expect(r.openGaps).toBe(2);
    expect(r.currentStrength).toBe('MODERATE');
    // gapIndex is the contract shared with generate_foia_request.
    expect(r.gaps?.map((g) => g.gapIndex)).toEqual([0, 1]);
  });

  it('marks a gap resolved once evidence is linked to it', async () => {
    const r = await run({
      id: 't1',
      title: 'A thesis',
      headVersion: {
        id: 'v1',
        status: 'COMPLETE',
        aiAnalysis: ANALYSIS,
        gapResolutions: [{ gapIndex: 1, evidenceId: '0xdead' }],
      },
    });

    expect(r.openGaps).toBe(1);
    expect(r.gaps?.[1]).toMatchObject({ resolved: true, resolvedByFileHash: '0xdead' });
    expect(r.gaps?.[0]).toMatchObject({ resolved: false, resolvedByFileHash: null });
  });

  it('is not live before the analysis completes', async () => {
    const r = await run({
      id: 't1',
      title: 'A thesis',
      headVersion: { id: 'v1', status: 'PENDING_AI', aiAnalysis: null, gapResolutions: [] },
    });

    expect(r.isLive).toBe(false);
    expect(r.reason).toBe('ANALYSIS_INCOMPLETE');
  });

  it('distinguishes "no gaps" from "not live"', async () => {
    const r = await run({
      id: 't1',
      title: 'A thesis',
      headVersion: {
        id: 'v1',
        status: 'COMPLETE',
        aiAnalysis: { ...ANALYSIS, evidenceGaps: [] },
        gapResolutions: [],
      },
    });

    expect(r.isLive).toBe(false);
    expect(r.reason).toBe('NO_GAPS');
    expect(r.totalGaps).toBe(0);
  });

  it('rejects a malformed stored analysis instead of publishing an empty call', async () => {
    const r = await run({
      id: 't1',
      title: 'A thesis',
      headVersion: {
        id: 'v1',
        status: 'COMPLETE',
        aiAnalysis: { evidenceGaps: 'not-an-array' },
        gapResolutions: [],
      },
    });

    expect(r.error).toBe('ANALYSIS_SHAPE_INVALID');
    expect(r.isLive).toBeUndefined();
  });

  it('always emits a locale-prefixed URL, never a bare path', async () => {
    const r = await run({
      id: 't1',
      title: 'A thesis',
      headVersion: { id: 'v1', status: 'COMPLETE', aiAnalysis: ANALYSIS, gapResolutions: [] },
    });

    expect(r.urls.canonical).toBe('https://example.org/he/call/t1');
    expect(r.urls.en).toBe('https://example.org/en/call/t1');
    expect(r.urls.canonical).toBe(r.urls.he);
  });

  it('does not double the locale prefix when FRONTEND_URL has a trailing slash', async () => {
    process.env['FRONTEND_URL'] = 'https://example.org/';
    const r = await run({
      id: 't1',
      title: 'A thesis',
      headVersion: { id: 'v1', status: 'COMPLETE', aiAnalysis: ANALYSIS, gapResolutions: [] },
    });

    expect(r.urls.canonical).toBe('https://example.org/he/call/t1');
  });

  it('reports a missing thesis rather than throwing', async () => {
    findUnique.mockResolvedValue(null);

    const r = JSON.parse(
      await getWhistleblowerCallHandler({ thesisId: 'nope' }),
    ) as { error: string };

    expect(r.error).toContain('nope');
  });
});
