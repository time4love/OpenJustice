// ---------------------------------------------------------------------------
// LEVEL 4 — a line drawn under a URL's calibration.
//
// It SUPERSEDES and never deletes, it is an EVENT ON THE URL rather than a
// decision in a run, and it carries a reason because it ends the authority of
// real work.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn() },
    calibrationDecision: { count: jest.fn() },
    calibrationReset: { create: jest.fn() },
  },
}));

const mockResearcherId = jest.fn();
jest.mock('../src/context/researcherContext', () => ({ getResearcherId: mockResearcherId }));

// `articleRuleTools` statically imports a chain reaching jsdom, whose dependency
// chain is ESM-only.
jest.mock('../src/services/fetchContentForRelevanceCheck', () => ({
  fetchContentForRelevanceCheck: jest.fn(),
}));

import { prisma } from '../src/lib/prisma';
import { resetArticleCalibrationHandler } from '../src/mcp/tools/articleRuleTools';

const URL = 'https://news.walla.co.il/item/3403847';
const parse = (json: string) => JSON.parse(json) as Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockResearcherId.mockReturnValue('researcher-1');
  (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue({ id: 'url-1' });
  (prisma.calibrationDecision.count as jest.Mock).mockResolvedValue(41);
  (prisma.calibrationReset.create as jest.Mock).mockResolvedValue({
    id: 'reset-1',
    createdAt: new Date('2026-09-02T12:00:00Z'),
  });
});

describe('reset_article_calibration', () => {
  it('records the line against the URL, attributed and reasoned', async () => {
    const out = parse(
      await resetArticleCalibrationHandler({ url: URL, reason: 'era selectors entangled past repair' }),
    );

    expect(prisma.calibrationReset.create).toHaveBeenCalledWith({
      data: {
        trackedUrlId: 'url-1',
        researcherId: 'researcher-1',
        reason: 'era selectors entangled past repair',
      },
      select: { id: true, createdAt: true },
    });
    expect(out['resetId']).toBe('reset-1');
  });

  // SUPERSEDES, NEVER DELETES — and says so, because a researcher who has just
  // ended the authority of forty-one decisions should be told they still exist.
  it('deletes nothing, and says how much work it superseded', async () => {
    const out = parse(await resetArticleCalibrationHandler({ url: URL, reason: 'starting over' }));
    expect(out['decisionsSuperseded']).toBe(41);
    expect(String(out['kept'])).toContain('Nothing was deleted');
  });

  // A reset is often reached for BECAUSE the era structure is wrong, so the reply
  // must not let a researcher assume their boundaries carried over.
  it('says that era boundaries did not survive', async () => {
    const out = parse(await resetArticleCalibrationHandler({ url: URL, reason: 'starting over' }));
    expect(String(out['next'])).toContain('ERA BOUNDARIES DID NOT SURVIVE');
  });

  it('refuses a blank reason, and writes nothing', async () => {
    const out = parse(await resetArticleCalibrationHandler({ url: URL, reason: '   ' }));
    expect(String(out['error'])).toContain('reason');
    expect(prisma.calibrationReset.create).not.toHaveBeenCalled();
  });

  it('refuses a URL that is not in the corpus', async () => {
    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue(null);
    const out = parse(await resetArticleCalibrationHandler({ url: URL, reason: 'starting over' }));
    expect(String(out['error'])).toContain('not in the corpus');
    expect(prisma.calibrationReset.create).not.toHaveBeenCalled();
  });

  // Every judgement this platform acts on names who made it.
  it('refuses with no researcher in context', async () => {
    mockResearcherId.mockReturnValue(undefined);
    const out = parse(await resetArticleCalibrationHandler({ url: URL, reason: 'starting over' }));
    expect(String(out['error'])).toContain('researcher');
    expect(prisma.calibrationReset.create).not.toHaveBeenCalled();
  });
});
