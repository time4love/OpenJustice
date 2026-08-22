// ---------------------------------------------------------------------------
// MCP tool handler tests
// All handlers are tested directly (no HTTP/transport layer).
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    evidence: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    keyFigure: {
      findFirst: jest.fn(),
      createMany: jest.fn(),
    },
    trackedUrl: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    urlSnapshot: {
      count: jest.fn(),
    },
    thesis: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    thesisVersion: {
      create: jest.fn(),
    },
    researchSession: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    researchSessionEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../src/services/IntakeAgent', () => ({
  IntakeAgent: jest.fn().mockImplementation(() => ({
    analyzeText: jest.fn(),
  })),
}));

jest.mock('../src/services/WaybackScraper', () => ({
  WaybackScraper: jest.fn().mockImplementation(() => ({
    runFullScan: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../src/services/VectorStoreService', () => ({
  VectorStoreService: {
    create: jest.fn(),
  },
}));

jest.mock('../src/services/ThesisSynthesisAgent', () => ({
  ...jest.requireActual('../src/services/ThesisSynthesisAgent'),
  ThesisSynthesisAgent: jest.fn().mockImplementation(() => ({
    synthesize: jest.fn(),
  })),
}));

jest.mock('../src/services/GapRevisionAgent', () => ({
  GapRevisionAgent: jest.fn().mockImplementation(() => ({
    suggest: jest.fn(),
  })),
}));

import { prisma } from '../src/lib/prisma';
import { VectorStoreService } from '../src/services/VectorStoreService';
import { IntakeAgent } from '../src/services/IntakeAgent';
import { WaybackScraper } from '../src/services/WaybackScraper';

// Re-import handlers AFTER mocks are in place
import { searchEvidenceHandler } from '../src/mcp/tools/searchEvidence';
import { getForensicTimelineHandler } from '../src/mcp/tools/getForensicTimeline';
import { getFigureDossierHandler } from '../src/mcp/tools/getFigureDossier';
import { getThesisContextHandler } from '../src/mcp/tools/getThesisContext';
import { createEvidenceFromUrlHandler } from '../src/mcp/tools/createEvidenceFromUrl';
import { startForensicScanHandler } from '../src/mcp/tools/startForensicScan';
import { enrichEvidenceWithHistoryHandler } from '../src/mcp/tools/enrichEvidenceWithHistory';
import { createThesisDraftHandler } from '../src/mcp/tools/createThesisDraft';
import { addThesisVersionHandler } from '../src/mcp/tools/addThesisVersion';
import { getResearchAgendaHandler } from '../src/mcp/tools/getResearchAgenda';
import { runAiAnalysisHandler } from '../src/mcp/tools/runAiAnalysis';

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------

const mockEvidenceFindMany = prisma.evidence.findMany as jest.Mock;
const mockEvidenceFindUnique = prisma.evidence.findUnique as jest.Mock;
const mockEvidenceCreate = prisma.evidence.create as jest.Mock;
const mockKeyFigureFindFirst = prisma.keyFigure.findFirst as jest.Mock;
const mockKeyFigureCreateMany = prisma.keyFigure.createMany as jest.Mock;
const mockTrackedUrlFindFirst = prisma.trackedUrl.findFirst as jest.Mock;
const mockTrackedUrlUpsert = prisma.trackedUrl.upsert as jest.Mock;
const mockThesisFindUnique = prisma.thesis.findUnique as jest.Mock;
const mockVectorStoreCreate = VectorStoreService.create as jest.Mock;
const MockIntakeAgent = IntakeAgent as jest.MockedClass<typeof IntakeAgent>;
const MockWaybackScraper = WaybackScraper as jest.MockedClass<typeof WaybackScraper>;
const mockThesisCreate = prisma.thesis.create as jest.Mock;
const mockThesisUpdate = prisma.thesis.update as jest.Mock;
const mockThesisVersionCreate = prisma.thesisVersion.create as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const evidenceFixture = {
  fileHash: 'abc123',
  evidenceDate: '2022-06-01',
  summary: 'Health ministry removed adverse event data',
  evidenceTier: 'Tier 1',
  evidenceRole: 'Incriminating',
  investigativeCategories: ['WITHHOLDING_INFORMATION'],
  targetEntity: 'משרד הבריאות',
  figures: [{ name: 'שרון אלרועי-פרייס' }],
  medicalConditions: '["myocarditis"]',   // should NOT appear in output
  sourceUrl: 'https://gov.il/evidence',
  submitterAddress: '0xDEADBEEF',         // should NOT appear in output
  fileUrl: '/uploads/secret.pdf',         // should NOT appear in output
};

const mockSearchEvidence = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();

  // Default VectorStore mock — returns one ranked hash
  mockVectorStoreCreate.mockResolvedValue({
    searchSimilarEvidence: mockSearchEvidence,
  });
  mockSearchEvidence.mockResolvedValue([{ fileHash: 'abc123', content: 'test', score: 0.9 }]);
});

// ===========================================================================
// search_evidence
// ===========================================================================

describe('searchEvidenceHandler', () => {
  it('returns correctly shaped evidence records', async () => {
    mockEvidenceFindMany.mockResolvedValue([evidenceFixture]);

    const raw = await searchEvidenceHandler({ query: 'adverse events removed' });
    const result = JSON.parse(raw);

    expect(result.total).toBe(1);
    expect(result.results[0]).toMatchObject({
      fileHash: 'abc123',
      evidenceDate: '2022-06-01',
      summary: 'Health ministry removed adverse event data',
      evidenceTier: 'Tier 1',
      evidenceRole: 'Incriminating',
      investigativeCategories: ['WITHHOLDING_INFORMATION'],
      targetEntity: 'משרד הבריאות',
      keyFigures: ['שרון אלרועי-פרייס'],
      sourceUrl: 'https://gov.il/evidence',
    });
  });

  it('excludes PII fields from output', async () => {
    mockEvidenceFindMany.mockResolvedValue([evidenceFixture]);

    const raw = await searchEvidenceHandler({ query: 'test' });
    const result = JSON.parse(raw);
    const record = result.results[0];

    expect(record).not.toHaveProperty('submitterAddress');
    expect(record).not.toHaveProperty('fileUrl');
    expect(record).not.toHaveProperty('medicalConditions');
  });

  it('passes targetEntity filter to Prisma query', async () => {
    mockEvidenceFindMany.mockResolvedValue([evidenceFixture]);

    await searchEvidenceHandler({ query: 'test', targetEntity: 'משרד הבריאות' });

    const callArgs = mockEvidenceFindMany.mock.calls[0][0];
    expect(callArgs.where.targetEntity).toEqual({ contains: 'משרד הבריאות' });
  });

  it('passes tier filter to Prisma query as "Tier N" string', async () => {
    mockEvidenceFindMany.mockResolvedValue([evidenceFixture]);

    await searchEvidenceHandler({ query: 'test', tier: 1 });

    const callArgs = mockEvidenceFindMany.mock.calls[0][0];
    expect(callArgs.where.evidenceTier).toBe('Tier 1');
  });

  it('respects custom limit', async () => {
    mockEvidenceFindMany.mockResolvedValue([]);
    mockSearchEvidence.mockResolvedValue([]);

    await searchEvidenceHandler({ query: 'test', limit: 3 });

    // VectorStore should be called with limit * 2 for over-fetching
    expect(mockSearchEvidence).toHaveBeenCalledWith('test', 6);
  });

  it('returns empty results when Pinecone finds nothing', async () => {
    mockSearchEvidence.mockResolvedValue([]);

    const raw = await searchEvidenceHandler({ query: 'nothing matches' });
    const result = JSON.parse(raw);

    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
    // Prisma should not be called
    expect(mockEvidenceFindMany).not.toHaveBeenCalled();
  });

  it('preserves Pinecone semantic ranking order', async () => {
    mockSearchEvidence.mockResolvedValue([
      { fileHash: 'hash_b', score: 0.95 },
      { fileHash: 'hash_a', score: 0.80 },
    ]);
    mockEvidenceFindMany.mockResolvedValue([
      { ...evidenceFixture, fileHash: 'hash_a' },
      { ...evidenceFixture, fileHash: 'hash_b' },
    ]);

    const raw = await searchEvidenceHandler({ query: 'test' });
    const result = JSON.parse(raw);

    expect(result.results[0].fileHash).toBe('hash_b');
    expect(result.results[1].fileHash).toBe('hash_a');
  });

  it('handles null sourceUrl gracefully', async () => {
    mockEvidenceFindMany.mockResolvedValue([{ ...evidenceFixture, sourceUrl: null }]);

    const raw = await searchEvidenceHandler({ query: 'test' });
    const result = JSON.parse(raw);

    expect(result.results[0].sourceUrl).toBeNull();
  });
});

// ===========================================================================
// get_forensic_timeline
// ===========================================================================

describe('getForensicTimelineHandler', () => {
  const trackedUrlFixture = {
    url: 'https://health.gov.il/corona',
    title: 'Corona page',
    status: 'COMPLETED',
    diffs: [
      {
        id: 'diff-1',
        beforeDate: '20220501',
        afterDate: '20220601',
        snapshotUrl: 'https://web.archive.org/web/20220601/...',
        deletedText: JSON.stringify([{ summary: 'Removed efficacy claim', exactQuote: 'original text' }]),
        addedText: '[]',
        aiSignificance: 'מחיקה של טענת יעילות',
        isLegallySignificant: true,
        createdAt: new Date('2022-06-15'),
      },
      {
        id: 'diff-2',
        beforeDate: '20220601',
        afterDate: '20220701',
        snapshotUrl: 'https://web.archive.org/web/20220701/...',
        deletedText: '[]',
        addedText: '[]',
        aiSignificance: '',
        isLegallySignificant: false,
        createdAt: new Date('2022-07-15'),
      },
    ],
  };

  it('returns full timeline with diff count and significance stats', async () => {
    mockTrackedUrlFindFirst.mockResolvedValue(trackedUrlFixture);

    const raw = await getForensicTimelineHandler({ url: 'https://health.gov.il/corona' });
    const result = JSON.parse(raw);

    expect(result.url).toBe('https://health.gov.il/corona');
    expect(result.status).toBe('COMPLETED');
    expect(result.totalDiffs).toBe(2);
    expect(result.significantDiffs).toBe(1);
    expect(result.timeline).toHaveLength(2);
  });

  it('reports unanchored snapshots, with a warning when any exist', async () => {
    // Snapshot anchoring is fire-and-forget with a swallowed rejection, so a scan
    // that ran while the RPC was down stored 83 snapshots, anchored none, and
    // reported success. Nothing asked afterwards. This is the asking.
    mockTrackedUrlFindFirst.mockResolvedValue(trackedUrlFixture);
    (prisma.urlSnapshot.count as jest.Mock).mockResolvedValueOnce(83).mockResolvedValueOnce(83);

    const result = JSON.parse(await getForensicTimelineHandler({ url: 'https://health.gov.il/corona' }));

    expect(result.snapshotsStored).toBe(83);
    expect(result.unanchoredSnapshots).toBe(83);
    expect(result.anchoringWarning).toMatch(/not registered on-chain/);
    expect(result.anchoringWarning).toMatch(/forensics:anchor-snapshots/);
  });

  it('omits the anchoring warning when every snapshot is anchored', async () => {
    // A field that is always present stops being read. Absence is the signal.
    mockTrackedUrlFindFirst.mockResolvedValue(trackedUrlFixture);
    (prisma.urlSnapshot.count as jest.Mock).mockResolvedValueOnce(83).mockResolvedValueOnce(0);

    const result = JSON.parse(await getForensicTimelineHandler({ url: 'https://health.gov.il/corona' }));

    expect(result.unanchoredSnapshots).toBe(0);
    expect(result.anchoringWarning).toBeUndefined();
  });

  it('parses deletedItems and addedItems from JSON strings', async () => {
    mockTrackedUrlFindFirst.mockResolvedValue(trackedUrlFixture);

    const raw = await getForensicTimelineHandler({ url: 'https://health.gov.il/corona' });
    const result = JSON.parse(raw);

    expect(result.timeline[0].deletedItems).toEqual([
      { summary: 'Removed efficacy claim', exactQuote: 'original text' },
    ]);
    expect(result.timeline[0].addedItems).toEqual([]);
  });

  it('returns error object for unknown URL', async () => {
    mockTrackedUrlFindFirst.mockResolvedValue(null);

    const raw = await getForensicTimelineHandler({ url: 'https://unknown.gov' });
    const result = JSON.parse(raw);

    expect(result.error).toContain('https://unknown.gov');
  });

  it('returns empty timeline array when no diffs exist', async () => {
    mockTrackedUrlFindFirst.mockResolvedValue({ ...trackedUrlFixture, diffs: [] });

    const raw = await getForensicTimelineHandler({ url: 'https://health.gov.il/corona' });
    const result = JSON.parse(raw);

    expect(result.totalDiffs).toBe(0);
    expect(result.significantDiffs).toBe(0);
    expect(result.timeline).toEqual([]);
  });

  it('handles malformed JSON in deletedText gracefully', async () => {
    const badDiff = { ...trackedUrlFixture.diffs[0], deletedText: 'not-json', addedText: 'also-bad' };
    mockTrackedUrlFindFirst.mockResolvedValue({ ...trackedUrlFixture, diffs: [badDiff] });

    const raw = await getForensicTimelineHandler({ url: 'https://health.gov.il/corona' });
    const result = JSON.parse(raw);

    expect(result.timeline[0].deletedItems).toEqual([]);
    expect(result.timeline[0].addedItems).toEqual([]);
  });
});

// ===========================================================================
// get_figure_dossier
// ===========================================================================

describe('getFigureDossierHandler', () => {
  const keyFigureFixture = {
    name: 'שרון אלרועי-פרייס',
    evidence: [
      {
        fileHash: 'abc123',
        summary: 'Director statement on vaccines',
        evidenceTier: 'Tier 1',
        evidenceRole: 'Incriminating',
        investigativeCategories: ['WITHHOLDING_INFORMATION'],
        evidenceDate: '2022-01-15',
        targetEntity: 'משרד הבריאות',
        sourceUrl: 'https://gov.il/statement',
      },
    ],
  };

  it('returns figure dossier with evidence list', async () => {
    mockKeyFigureFindFirst.mockResolvedValue(keyFigureFixture);

    const raw = await getFigureDossierHandler({ name: 'אלרועי' });
    const result = JSON.parse(raw);

    expect(result.figure).toBe('שרון אלרועי-פרייס');
    expect(result.evidenceCount).toBe(1);
    expect(result.evidence[0].fileHash).toBe('abc123');
    expect(result.evidence[0].summary).toBe('Director statement on vaccines');
  });

  it('passes partial name as insensitive contains query', async () => {
    mockKeyFigureFindFirst.mockResolvedValue(keyFigureFixture);

    await getFigureDossierHandler({ name: 'אלרועי' });

    const callArgs = mockKeyFigureFindFirst.mock.calls[0][0];
    expect(callArgs.where.name).toEqual({ contains: 'אלרועי', mode: 'insensitive' });
  });

  it('returns error object when figure not found', async () => {
    mockKeyFigureFindFirst.mockResolvedValue(null);

    const raw = await getFigureDossierHandler({ name: 'Unknown Person' });
    const result = JSON.parse(raw);

    expect(result.error).toContain('Unknown Person');
  });

  it('handles figure with no linked evidence', async () => {
    mockKeyFigureFindFirst.mockResolvedValue({ ...keyFigureFixture, evidence: [] });

    const raw = await getFigureDossierHandler({ name: 'אלרועי' });
    const result = JSON.parse(raw);

    expect(result.evidenceCount).toBe(0);
    expect(result.evidence).toEqual([]);
  });

  it('maps null sourceUrl to null in output', async () => {
    const noSource = { ...keyFigureFixture.evidence[0], sourceUrl: null };
    mockKeyFigureFindFirst.mockResolvedValue({ ...keyFigureFixture, evidence: [noSource] });

    const raw = await getFigureDossierHandler({ name: 'אלרועי' });
    const result = JSON.parse(raw);

    expect(result.evidence[0].sourceUrl).toBeNull();
  });
});

// ===========================================================================
// get_thesis_context
// ===========================================================================

describe('getThesisContextHandler', () => {
  const mentionFixture = [
    { id: 'm1', type: 'EVIDENCE', refId: 'abc123', thesisVersionId: 'v1' },
    { id: 'm2', type: 'KEY_FIGURE', refId: 'שרון אלרועי-פרייס', thesisVersionId: 'v1' },
    { id: 'm3', type: 'TRACKED_URL', refId: 'url-uuid-1', thesisVersionId: 'v1' },
  ];

  const headVersionFixture = {
    id: 'v1',
    status: 'COMPLETE',
    userContent: { type: 'doc', content: [] },
    aiAnalysis: { counterArguments: [], overallStrengthAssessment: 'STRONG' },
    mentions: mentionFixture,
    gapResolutions: [],
  };

  const thesisFixture = {
    id: 'thesis-1',
    headVersionId: 'v1',
    headVersion: headVersionFixture,
    versions: [
      { id: 'v1', status: 'COMPLETE', createdAt: new Date('2023-01-01'), aiAnalysis: {} },
    ],
  };

  beforeEach(() => {
    mockEvidenceFindMany.mockResolvedValue([
      {
        fileHash: 'abc123',
        summary: 'Key evidence',
        evidenceTier: 'Tier 1',
        evidenceDate: '2022-06-01',
        targetEntity: 'משרד הבריאות',
        sourceUrl: 'https://gov.il/evidence',
      },
    ]);
    mockResearchSession.findFirst.mockResolvedValue(null);
  });

  it('returns thesis with head version content and critique', async () => {
    mockThesisFindUnique.mockResolvedValue(thesisFixture);

    const raw = await getThesisContextHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.thesisId).toBe('thesis-1');
    expect(result.headVersionId).toBe('v1');
    expect(result.status).toBe('COMPLETE');
    expect(result.content).toEqual({ type: 'doc', content: [] });
    expect(result.devilsAdvocateCritique).toEqual({ counterArguments: [], overallStrengthAssessment: 'STRONG' });
  });

  it('returns cited evidence summaries enriched from Prisma', async () => {
    mockThesisFindUnique.mockResolvedValue(thesisFixture);

    const raw = await getThesisContextHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.evidenceCited).toHaveLength(1);
    expect(result.evidenceCited[0].fileHash).toBe('abc123');
    expect(result.evidenceCited[0].summary).toBe('Key evidence');
  });

  it('extracts only KEY_FIGURE mentions into keyFiguresMentioned', async () => {
    mockThesisFindUnique.mockResolvedValue(thesisFixture);

    const raw = await getThesisContextHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.keyFiguresMentioned).toEqual(['שרון אלרועי-פרייס']);
  });

  it('returns version history summary', async () => {
    mockThesisFindUnique.mockResolvedValue(thesisFixture);

    const raw = await getThesisContextHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.versionCount).toBe(1);
    expect(result.versions[0]).toMatchObject({ id: 'v1', status: 'COMPLETE', hasCritique: true });
  });

  it('returns null devilsAdvocateCritique when aiAnalysis is null', async () => {
    const pendingHead = { ...headVersionFixture, aiAnalysis: null };
    mockThesisFindUnique.mockResolvedValue({ ...thesisFixture, headVersion: pendingHead });

    const raw = await getThesisContextHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.devilsAdvocateCritique).toBeNull();
  });

  it('returns error for unknown thesis ID', async () => {
    mockThesisFindUnique.mockResolvedValue(null);

    const raw = await getThesisContextHandler({ thesisId: 'nonexistent' });
    const result = JSON.parse(raw);

    expect(result.error).toContain('nonexistent');
  });

  it('returns error when thesis has no head version', async () => {
    mockThesisFindUnique.mockResolvedValue({ ...thesisFixture, headVersion: null });

    const raw = await getThesisContextHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.error).toContain('no published version');
  });

  it('skips Prisma evidence query when thesis has no EVIDENCE mentions', async () => {
    const noEvidenceMentions = mentionFixture.filter((m) => m.type !== 'EVIDENCE');
    const headNoEvidence = { ...headVersionFixture, mentions: noEvidenceMentions };
    mockThesisFindUnique.mockResolvedValue({ ...thesisFixture, headVersion: headNoEvidence });

    const raw = await getThesisContextHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.evidenceCited).toEqual([]);
    expect(mockEvidenceFindMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// create_evidence_from_url
// ===========================================================================

describe('createEvidenceFromUrlHandler', () => {
  const testUrl = 'https://example.gov/article';

  const analysisFixture = {
    isRelevant: true,
    evidenceRole: 'Incriminating',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
    targetEntity: 'Ministry of Health',
    evidenceTier: 'Tier 2: Material',
    evidencePerspective: 'Internal Knowledge',
    tierReasoning: 'Contains leaked internal data.',
    summary: 'Ministry suppressed side effect data.',
    evidenceDate: '2022-08-01',
    keyFigures: ['Prof. Barkovitz'],
    medicalConditions: ['myocarditis'],
    statisticalClaims: ['65% of neurological cases unresolved'],
    regulatoryMentions: [],
    euaOmissionStatus: 'Omits EUA (Misleading)' as const,
    missingInformation: '',
    rejectionReason: undefined,
  };

  const createdRecordFixture = {
    id: 'ev-uuid-1',
    fileHash: '0xabc',
    status: 'PENDING_REVIEW',
    evidenceRole: 'Incriminating',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
    targetEntity: 'Ministry of Health',
    evidenceTier: 'Tier 2: Material',
    summary: 'Ministry suppressed side effect data.',
    evidenceDate: '2022-08-01',
    figures: [{ name: 'Prof. Barkovitz' }],
    sourceUrl: testUrl,
  };

  let mockAnalyzeText: jest.Mock;
  let mockAnalyzeEvidence: jest.Mock;

  beforeEach(() => {
    mockAnalyzeText = jest.fn().mockResolvedValue(analysisFixture);
    mockAnalyzeEvidence = jest.fn().mockResolvedValue(analysisFixture);
    MockIntakeAgent.mockImplementation(
      () => ({ analyzeText: mockAnalyzeText, analyzeEvidence: mockAnalyzeEvidence }) as unknown as IntakeAgent,
    );

    // Default: no existing record
    mockEvidenceFindUnique.mockResolvedValue(null);
    mockKeyFigureCreateMany.mockResolvedValue({ count: 1 });
    mockEvidenceCreate.mockResolvedValue(createdRecordFixture);

    // Mock global fetch — default HTML response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: jest.fn().mockReturnValue('text/html; charset=utf-8') },
      text: jest.fn().mockResolvedValue('<html><body><p>Health ministry leaked recording shows serious side effects were hidden from the public. Prof. Barkovitz presented findings.</p></body></html>'),
    } as unknown as Response);
  });

  it('returns PENDING_REVIEW record with analysis summary', async () => {
    const raw = await createEvidenceFromUrlHandler({ url: testUrl });
    const result = JSON.parse(raw);

    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.evidenceId).toBe('ev-uuid-1');
    expect(result.summary).toBe('Ministry suppressed side effect data.');
    expect(result.sourceUrl).toBe(testUrl);
  });

  it('calls IntakeAgent.analyzeText with stripped text and URL', async () => {
    await createEvidenceFromUrlHandler({ url: testUrl });

    expect(mockAnalyzeText).toHaveBeenCalledWith(
      expect.stringContaining('Health ministry leaked recording'),
      testUrl,
    );
    // HTML tags should be stripped
    expect(mockAnalyzeText.mock.calls[0][0]).not.toContain('<html>');
  });

  it('saves to Prisma with status PENDING_REVIEW', async () => {
    await createEvidenceFromUrlHandler({ url: testUrl });

    expect(mockEvidenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_REVIEW', sourceUrl: testUrl }),
      }),
    );
  });

  it('does NOT call VectorStore or Web3 (staging gate)', async () => {
    await createEvidenceFromUrlHandler({ url: testUrl });

    expect(mockVectorStoreCreate).not.toHaveBeenCalled();
  });

  it('upserts KeyFigure records for extracted figures', async () => {
    await createEvidenceFromUrlHandler({ url: testUrl });

    expect(mockKeyFigureCreateMany).toHaveBeenCalledWith({
      data: [{ name: 'Prof. Barkovitz' }],
      skipDuplicates: true,
    });
  });

  it('skips KeyFigure createMany when no figures extracted', async () => {
    mockAnalyzeText.mockResolvedValue({ ...analysisFixture, keyFigures: [] });
    mockEvidenceCreate.mockResolvedValue({ ...createdRecordFixture, figures: [] });

    await createEvidenceFromUrlHandler({ url: testUrl });

    expect(mockKeyFigureCreateMany).not.toHaveBeenCalled();
  });

  it('returns existing record without creating duplicate', async () => {
    mockEvidenceFindUnique.mockResolvedValue({
      ...createdRecordFixture,
      status: 'PENDING_REVIEW',
    });

    const raw = await createEvidenceFromUrlHandler({ url: testUrl });
    const result = JSON.parse(raw);

    expect(result.evidenceId).toBe('ev-uuid-1');
    expect(result.message).toContain('already exists');
    expect(mockEvidenceCreate).not.toHaveBeenCalled();
  });

  it('throws when fetch returns non-ok status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 } as Response);

    await expect(createEvidenceFromUrlHandler({ url: testUrl }))
      .rejects.toThrow('HTTP 403');
  });

  it('throws when fetched content is too short to analyse', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: jest.fn().mockReturnValue('text/html') },
      text: jest.fn().mockResolvedValue('<html><body>Hi</body></html>'),
    } as unknown as Response);

    await expect(createEvidenceFromUrlHandler({ url: testUrl }))
      .rejects.toThrow('too short');
  });

  it('includes message reminding reviewer that on-chain registration is required', async () => {
    const raw = await createEvidenceFromUrlHandler({ url: testUrl });
    const result = JSON.parse(raw);

    expect(result.message).toContain('PENDING_REVIEW');
    expect(result.message).toContain('on-chain');
  });

  // ── PDF branch ─────────────────────────────────────────────────────────────

  it('PDF: calls analyzeEvidence with buffer when Content-Type is application/pdf', async () => {
    const pdfUrl = 'https://example.gov/report.pdf';
    const fakePdfBuffer = Buffer.alloc(500, 0x25); // 500 bytes of '%'

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: jest.fn().mockReturnValue('application/pdf') },
      arrayBuffer: jest.fn().mockResolvedValue(fakePdfBuffer.buffer),
    } as unknown as Response);

    await createEvidenceFromUrlHandler({ url: pdfUrl });

    expect(mockAnalyzeEvidence).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf');
    expect(mockAnalyzeText).not.toHaveBeenCalled();
  });

  it('PDF: does not call analyzeText for PDF URLs', async () => {
    const pdfUrl = 'https://example.gov/report.pdf';
    const fakePdfBuffer = Buffer.alloc(500, 0x25);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: jest.fn().mockReturnValue('application/pdf; name=report.pdf') },
      arrayBuffer: jest.fn().mockResolvedValue(fakePdfBuffer.buffer),
    } as unknown as Response);

    await createEvidenceFromUrlHandler({ url: pdfUrl });

    expect(mockAnalyzeText).not.toHaveBeenCalled();
  });

  it('PDF: throws when PDF buffer is too small', async () => {
    const pdfUrl = 'https://example.gov/tiny.pdf';
    const tinyBuffer = Buffer.alloc(10, 0x25); // only 10 bytes

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: jest.fn().mockReturnValue('application/pdf') },
      arrayBuffer: jest.fn().mockResolvedValue(tinyBuffer.buffer),
    } as unknown as Response);

    await expect(createEvidenceFromUrlHandler({ url: pdfUrl })).rejects.toThrow('too small');
  });

  it('PDF: saves record with PENDING_REVIEW status and no Web3/Pinecone calls', async () => {
    const pdfUrl = 'https://example.gov/report.pdf';
    const fakePdfBuffer = Buffer.alloc(500, 0x25);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: jest.fn().mockReturnValue('application/pdf') },
      arrayBuffer: jest.fn().mockResolvedValue(fakePdfBuffer.buffer),
    } as unknown as Response);

    await createEvidenceFromUrlHandler({ url: pdfUrl });

    expect(mockEvidenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_REVIEW' }),
      }),
    );
    expect(mockVectorStoreCreate).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// start_forensic_scan
// ===========================================================================

describe('startForensicScanHandler', () => {
  const testUrl = 'https://corona.health.gov.il/vaccine-for-covid/';
  const trackedUrlFixture = { id: 'tu-uuid-1', url: testUrl, status: 'SCANNING' };

  let mockRunFullScan: jest.Mock;

  beforeEach(() => {
    mockRunFullScan = jest.fn().mockResolvedValue(undefined);
    MockWaybackScraper.mockImplementation(
      () => ({ runFullScan: mockRunFullScan }) as unknown as WaybackScraper,
    );
    mockTrackedUrlUpsert.mockResolvedValue(trackedUrlFixture);
  });

  it('returns trackedUrlId, url, and SCANNING status', async () => {
    const raw = await startForensicScanHandler({ url: testUrl });
    const result = JSON.parse(raw);

    expect(result.trackedUrlId).toBe('tu-uuid-1');
    expect(result.url).toBe(testUrl);
    expect(result.status).toBe('SCANNING');
  });

  it('upserts TrackedUrl with status SCANNING', async () => {
    await startForensicScanHandler({ url: testUrl });

    expect(mockTrackedUrlUpsert).toHaveBeenCalledWith({
      where: { url: testUrl },
      update: { status: 'SCANNING' },
      create: { url: testUrl, status: 'SCANNING' },
    });
  });

  it('fires runFullScan as fire-and-forget', async () => {
    await startForensicScanHandler({ url: testUrl });

    // Allow microtask queue to flush the void promise
    await Promise.resolve();

    expect(mockRunFullScan).toHaveBeenCalledWith('tu-uuid-1', testUrl);
  });

  it('returns the trackedUrlId and points at a tool the caller can actually reach', async () => {
    const raw = await startForensicScanHandler({ url: testUrl });
    const result = JSON.parse(raw);

    expect(result.trackedUrlId).toBe('tu-uuid-1');
    // FINDING 7: the REST status endpoint sits behind the staging access gate, so a
    // researcher working through MCP cannot reach it. Guidance must name the MCP tool.
    expect(result.message).toContain('get_forensic_timeline');
    expect(result.message).not.toContain('/api/forensics/');
  });

  it('returns without throwing even when runFullScan rejects', async () => {
    mockRunFullScan.mockRejectedValue(new Error('CDX unreachable'));

    // Should not throw — fire-and-forget swallows the error
    await expect(startForensicScanHandler({ url: testUrl })).resolves.toBeDefined();
  });

  it('is idempotent — upsert update sets SCANNING for already-tracked URLs', async () => {
    // Simulate URL already exists as PAUSED
    mockTrackedUrlUpsert.mockResolvedValue({ ...trackedUrlFixture, status: 'SCANNING' });

    const raw = await startForensicScanHandler({ url: testUrl });
    const result = JSON.parse(raw);

    expect(result.status).toBe('SCANNING');
    expect(mockTrackedUrlUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { status: 'SCANNING' } }),
    );
  });
});

// ===========================================================================
// create_thesis_draft
// ===========================================================================

describe('createThesisDraftHandler', () => {
  const thesisFixture = { id: 'thesis-draft-1', headVersionId: 'ver-1', createdAt: new Date() };
  const versionFixture = {
    id: 'ver-1',
    thesisId: 'thesis-draft-1',
    status: 'PENDING_AI',
    contentHash: 'abc',
    createdAt: new Date(),
  };

  beforeEach(() => {
    // $transaction runs the callback with a fake tx object
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        thesis: { create: mockThesisCreate, update: mockThesisUpdate },
        thesisVersion: { create: mockThesisVersionCreate },
      };
      return fn(tx);
    });

    mockThesisCreate.mockResolvedValue({ id: 'thesis-draft-1', createdAt: new Date() });
    mockThesisVersionCreate.mockResolvedValue(versionFixture);
    mockThesisUpdate.mockResolvedValue(thesisFixture);
  });

  it('returns thesisId, headVersionId, and PENDING_AI status', async () => {
    const raw = await createThesisDraftHandler({ title: 'Test Thesis', body: 'The ministry hid side effects.' });
    const result = JSON.parse(raw);

    expect(result.thesisId).toBe('thesis-draft-1');
    expect(result.headVersionId).toBe('ver-1');
    expect(result.status).toBe('PENDING_AI');
  });

  it('creates thesis in a transaction', async () => {
    await createThesisDraftHandler({ title: 'Test Thesis', body: 'Test thesis body.' });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockThesisCreate).toHaveBeenCalledWith({ data: { title: 'Test Thesis' } });
  });

  it('creates ThesisVersion with PENDING_AI status', async () => {
    await createThesisDraftHandler({ title: 'Test', body: 'Test.' });

    expect(mockThesisVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_AI', thesisId: 'thesis-draft-1' }),
      }),
    );
  });

  it('sets headVersionId on the thesis after version creation', async () => {
    await createThesisDraftHandler({ title: 'Test', body: 'Test.' });

    expect(mockThesisUpdate).toHaveBeenCalledWith({
      where: { id: 'thesis-draft-1' },
      data: { headVersionId: 'ver-1' },
    });
  });

  it('populates evidence mentions from evidenceHashes', async () => {
    await createThesisDraftHandler({
      title: 'Evidence Test',
      body: 'Side effects were hidden.',
      evidenceHashes: ['0xabc123', '0xdef456'],
    });

    const versionData = mockThesisVersionCreate.mock.calls[0][0].data;
    const mentionData = versionData.mentions.createMany.data as Array<{ type: string; refId: string }>;
    const evidenceMentions = mentionData.filter((m) => m.type === 'EVIDENCE');

    expect(evidenceMentions).toHaveLength(2);
    expect(evidenceMentions.map((m) => m.refId)).toEqual(
      expect.arrayContaining(['0xabc123', '0xdef456']),
    );
  });

  it('populates key figure mentions from keyFigures', async () => {
    await createThesisDraftHandler({
      title: 'Figures Test',
      body: 'Officials suppressed data.',
      keyFigures: ['פרופ מתי ברקוביץ', 'Sharon Alroy-Preis'],
    });

    const versionData = mockThesisVersionCreate.mock.calls[0][0].data;
    const mentionData = versionData.mentions.createMany.data as Array<{ type: string; refId: string }>;
    const figureMentions = mentionData.filter((m) => m.type === 'KEY_FIGURE');

    expect(figureMentions).toHaveLength(2);
    expect(figureMentions.map((m) => m.refId)).toEqual(
      expect.arrayContaining(['פרופ מתי ברקוביץ', 'Sharon Alroy-Preis']),
    );
  });

  it('reports correct mention counts in the response', async () => {
    const raw = await createThesisDraftHandler({
      title: 'Count Test',
      body: 'Test.',
      evidenceHashes: ['0xabc'],
      keyFigures: ['Alice', 'Bob'],
    });
    const result = JSON.parse(raw);

    expect(result.evidenceLinked).toBe(1);
    expect(result.keyFiguresLinked).toBe(2);
    expect(result.mentionsCreated).toBe(3);
  });

  it('works with body only (no hashes or figures)', async () => {
    const raw = await createThesisDraftHandler({ title: 'Minimal', body: 'Minimal draft.' });
    const result = JSON.parse(raw);

    expect(result.thesisId).toBeDefined();
    expect(result.mentionsCreated).toBe(0);
  });

  it('message instructs user to open in UI before publishing', async () => {
    const raw = await createThesisDraftHandler({ title: 'Draft', body: 'Draft.' });
    const result = JSON.parse(raw);

    expect(result.message).toContain('PENDING_AI');
    expect(result.message).toContain('UI');
  });

  it('does NOT trigger DevilsAdvocateAgent (staging gate)', async () => {
    // No DevilsAdvocateAgent mock needed — if it were called it would throw
    // (it's not mocked). The test passes because it isn't called.
    await expect(createThesisDraftHandler({ title: 'Draft', body: 'Draft.' })).resolves.toBeDefined();
  });

  it('renders a [^n] marker as an inline evidence mention via citations, not a trailing chip', async () => {
    const raw = await createThesisDraftHandler({
      title: 'Cited Draft',
      body: 'The ministry hid data[^1].',
      citations: [{ id: 1, fileHashes: ['0xabc'] }],
    });
    const result = JSON.parse(raw);
    const versionData = mockThesisVersionCreate.mock.calls[0][0].data;
    const userContent = versionData.userContent;

    const paragraph = userContent.content[0];
    expect(paragraph.content).toContainEqual({
      type: 'evidenceMention',
      attrs: expect.objectContaining({ id: '0xabc' }),
    });
    // Exactly one paragraph — no separate trailing chip block duplicating the inline chip.
    expect(userContent.content.filter((n: { type: string }) => n.type === 'paragraph')).toHaveLength(1);
    expect(result.evidenceLinked).toBe(1);
  });

  it('links a citation hash even when it is absent from evidenceHashes', async () => {
    const raw = await createThesisDraftHandler({
      title: 'Citation Only',
      body: 'Claim[^1].',
      citations: [{ id: 1, fileHashes: ['0xonlyincitation'] }],
    });
    const result = JSON.parse(raw);

    expect(result.evidenceLinked).toBe(1);
    expect(result.warning).toBeUndefined();

    const versionData = mockThesisVersionCreate.mock.calls[0][0].data;
    const mentionData = versionData.mentions.createMany.data as Array<{ type: string; refId: string }>;
    expect(mentionData).toContainEqual({ type: 'EVIDENCE', refId: '0xonlyincitation' });
  });

  it('omitting citations behaves exactly as before (backward compatibility)', async () => {
    const raw = await createThesisDraftHandler({
      title: 'Legacy',
      body: 'Body with no markers.',
      evidenceHashes: ['0xabc'],
    });
    const result = JSON.parse(raw);
    const versionData = mockThesisVersionCreate.mock.calls[0][0].data;
    const userContent = versionData.userContent;

    // Trailing chip paragraph still present for the legacy flat-hashes path.
    const paragraphs = userContent.content.filter((n: { type: string }) => n.type === 'paragraph');
    expect(paragraphs).toHaveLength(2);
    expect(result.evidenceLinked).toBe(1);
  });
});

// ===========================================================================
// add_thesis_version
// ===========================================================================

describe('addThesisVersionHandler', () => {
  const existingThesis = { id: 'thesis-1', headVersionId: 'ver-1', createdAt: new Date() };
  const newVersionFixture = {
    id: 'ver-2',
    thesisId: 'thesis-1',
    parentVersionId: 'ver-1',
    status: 'PENDING_AI',
    contentHash: 'def',
    createdAt: new Date(),
  };
  const updatedThesisFixture = { id: 'thesis-1', headVersionId: 'ver-2', createdAt: new Date() };

  beforeEach(() => {
    mockThesisFindUnique.mockResolvedValue(existingThesis);
    mockThesisVersionCreate.mockResolvedValue(newVersionFixture);
    mockThesisUpdate.mockResolvedValue(updatedThesisFixture);

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        thesis: { update: mockThesisUpdate },
        thesisVersion: { create: mockThesisVersionCreate },
      };
      return fn(tx);
    });
  });

  it('returns thesisId, new headVersionId, parentVersionId, and PENDING_AI status', async () => {
    const raw = await addThesisVersionHandler({
      thesisId: 'thesis-1',
      body: 'Updated thesis narrative.',
    });
    const result = JSON.parse(raw);

    expect(result.thesisId).toBe('thesis-1');
    expect(result.headVersionId).toBe('ver-2');
    expect(result.parentVersionId).toBe('ver-1');
    expect(result.status).toBe('PENDING_AI');
  });

  it('sets parentVersionId to the previous headVersionId', async () => {
    await addThesisVersionHandler({ thesisId: 'thesis-1', body: 'Updated.' });

    expect(mockThesisVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentVersionId: 'ver-1' }),
      }),
    );
  });

  it('updates thesis headVersionId to the new version', async () => {
    await addThesisVersionHandler({ thesisId: 'thesis-1', body: 'Updated.' });

    expect(mockThesisUpdate).toHaveBeenCalledWith({
      where: { id: 'thesis-1' },
      data: { headVersionId: 'ver-2' },
    });
  });

  it('returns error object for unknown thesis ID', async () => {
    mockThesisFindUnique.mockResolvedValue(null);

    const raw = await addThesisVersionHandler({ thesisId: 'nonexistent', body: 'Body.' });
    const result = JSON.parse(raw);

    expect(result.error).toContain('nonexistent');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('populates evidence mentions from evidenceHashes', async () => {
    await addThesisVersionHandler({
      thesisId: 'thesis-1',
      body: 'Body.',
      evidenceHashes: ['0xabc', '0xdef'],
    });

    const mentionData = mockThesisVersionCreate.mock.calls[0][0].data.mentions.createMany
      .data as Array<{ type: string; refId: string }>;
    const evidenceMentions = mentionData.filter((m) => m.type === 'EVIDENCE');

    expect(evidenceMentions).toHaveLength(2);
    expect(evidenceMentions.map((m) => m.refId)).toEqual(
      expect.arrayContaining(['0xabc', '0xdef']),
    );
  });

  it('populates key figure mentions from keyFigures', async () => {
    await addThesisVersionHandler({
      thesisId: 'thesis-1',
      body: 'Body.',
      keyFigures: ['פרופ ברקוביץ'],
    });

    const mentionData = mockThesisVersionCreate.mock.calls[0][0].data.mentions.createMany
      .data as Array<{ type: string; refId: string }>;
    const figureMentions = mentionData.filter((m) => m.type === 'KEY_FIGURE');

    expect(figureMentions).toHaveLength(1);
    expect(figureMentions[0].refId).toBe('פרופ ברקוביץ');
  });

  it('reports correct mention and link counts', async () => {
    const raw = await addThesisVersionHandler({
      thesisId: 'thesis-1',
      body: 'Body.',
      evidenceHashes: ['0xabc'],
      keyFigures: ['Alice'],
    });
    const result = JSON.parse(raw);

    expect(result.mentionsCreated).toBe(2);
    expect(result.evidenceLinked).toBe(1);
    expect(result.keyFiguresLinked).toBe(1);
  });

  it('does NOT trigger DevilsAdvocateAgent (staging gate)', async () => {
    await expect(
      addThesisVersionHandler({ thesisId: 'thesis-1', body: 'Body.' }),
    ).resolves.toBeDefined();
  });

  it('message instructs caller to run_ai_analysis after saving', async () => {
    const raw = await addThesisVersionHandler({ thesisId: 'thesis-1', body: 'Body.' });
    const result = JSON.parse(raw);

    expect(result.message).toContain('PENDING_AI');
    expect(result.message).toContain('run_ai_analysis');
  });

  it('renders a [^n] marker as an inline evidence mention via citations, not a trailing chip', async () => {
    const raw = await addThesisVersionHandler({
      thesisId: 'thesis-1',
      body: 'Revised claim[^1].',
      citations: [{ id: 1, fileHashes: ['0xabc'] }],
    });
    const result = JSON.parse(raw);
    const versionData = mockThesisVersionCreate.mock.calls[0][0].data;
    const userContent = versionData.userContent;

    const paragraph = userContent.content[0];
    expect(paragraph.content).toContainEqual({
      type: 'evidenceMention',
      attrs: expect.objectContaining({ id: '0xabc' }),
    });
    expect(userContent.content.filter((n: { type: string }) => n.type === 'paragraph')).toHaveLength(1);
    expect(result.evidenceLinked).toBe(1);
  });

  it('links a citation hash even when it is absent from evidenceHashes', async () => {
    const raw = await addThesisVersionHandler({
      thesisId: 'thesis-1',
      body: 'Claim[^1].',
      citations: [{ id: 1, fileHashes: ['0xonlyincitation'] }],
    });
    const result = JSON.parse(raw);

    expect(result.evidenceLinked).toBe(1);

    const mentionData = mockThesisVersionCreate.mock.calls[0][0].data.mentions.createMany
      .data as Array<{ type: string; refId: string }>;
    expect(mentionData).toContainEqual({ type: 'EVIDENCE', refId: '0xonlyincitation' });
  });

  it('omitting citations behaves exactly as before (backward compatibility)', async () => {
    const raw = await addThesisVersionHandler({
      thesisId: 'thesis-1',
      body: 'Body with no markers.',
      evidenceHashes: ['0xabc'],
    });
    const result = JSON.parse(raw);
    const versionData = mockThesisVersionCreate.mock.calls[0][0].data;
    const userContent = versionData.userContent;

    const paragraphs = userContent.content.filter((n: { type: string }) => n.type === 'paragraph');
    expect(paragraphs).toHaveLength(2);
    expect(result.evidenceLinked).toBe(1);
  });
});

// ===========================================================================
// run_ai_analysis
// ===========================================================================

describe('runAiAnalysisHandler', () => {
  const mockAnalysis = {
    summaryHe: 'ניתוח מחדש.',
    overallStrengthAssessment: 'MODERATE',
    counterArguments: [],
    evidenceGaps: [],
    alternativeInterpretations: [],
  };

  it('returns cached result when version is already COMPLETE', async () => {
    (prisma.thesis.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'thesis-1',
      headVersion: {
        id: 'version-1',
        status: 'COMPLETE',
        aiAnalysis: mockAnalysis,
        userContent: { type: 'doc', content: [] },
      },
    });

    const raw = await runAiAnalysisHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.cached).toBe(true);
    expect(result.status).toBe('COMPLETE');
    expect(result.aiAnalysis).toEqual(mockAnalysis);
  });

  it('returns error when thesis not found', async () => {
    (prisma.thesis.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const raw = await runAiAnalysisHandler({ thesisId: 'missing-thesis' });
    const result = JSON.parse(raw);

    expect(result.error).toContain('missing-thesis');
  });

  it('returns error when head version is missing', async () => {
    (prisma.thesis.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'thesis-1',
      headVersion: null,
    });

    const raw = await runAiAnalysisHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.error).toContain('thesis-1');
  });
});

// ===========================================================================
// get_research_agenda
// ===========================================================================

const completedAnalysis = {
  counterArguments: [
    { claim: 'Coordination claim', rebuttal: 'No direct evidence of coordination', strength: 'STRONG' },
  ],
  evidenceGaps: [
    { description: 'Missing MOH directives to media', suggestedSearch: 'MOH press directives COVID vaccine EUA' },
    { description: 'Missing consent forms', suggestedSearch: 'vaccination consent form December 2020' },
  ],
  alternativeInterpretations: ['Public health messaging simplified EUA jargon intentionally'],
  overallStrengthAssessment: 'WEAK',
  summaryHe: 'הטיעון סובל מפערים ראייתיים משמעותיים.',
};

const thesisWithAnalysisFixture = {
  id: 'thesis-1',
  title: 'Test Thesis Title',
  headVersionId: 'version-1',
  headVersion: {
    id: 'version-1',
    status: 'COMPLETE',
    aiAnalysis: completedAnalysis,
    userContent: { type: 'doc', content: [] },
    mentions: [
      { id: 'm1', type: 'EVIDENCE', refId: '0xcited' },
    ],
    gapResolutions: [],
  },
};

describe('getResearchAgendaHandler', () => {
  beforeEach(() => {
    mockThesisFindUnique.mockResolvedValue(thesisWithAnalysisFixture);
    mockEvidenceFindMany.mockResolvedValue([
      { ...evidenceFixture, fileHash: '0xnew', status: 'CONFIRMED', figures: [{ name: 'Alice' }] },
    ]);
    mockSearchEvidence.mockResolvedValue([{ fileHash: '0xnew', score: 0.92 }]);
  });

  it('returns thesisId, headVersionId, and overallStrength', async () => {
    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.thesisId).toBe('thesis-1');
    expect(result.headVersionId).toBe('version-1');
    expect(result.overallStrength).toBe('WEAK');
  });

  it('returns one gap entry per evidenceGap in the AI analysis', async () => {
    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.gaps).toHaveLength(2);
    expect(result.gaps[0]).toMatchObject({
      index: 0,
      description: 'Missing MOH directives to media',
      suggestedSearch: 'MOH press directives COVID vaccine EUA',
    });
  });

  it('marks vault hits as alreadyCited=false when not in mentioned hashes', async () => {
    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    const hit = result.gaps[0].vaultHits[0];
    expect(hit.fileHash).toBe('0xnew');
    expect(hit.alreadyCited).toBe(false);
  });

  it('marks vault hits as alreadyCited=true when already mentioned in thesis', async () => {
    mockEvidenceFindMany.mockResolvedValue([
      { ...evidenceFixture, fileHash: '0xcited', status: 'CONFIRMED', figures: [] },
    ]);
    mockSearchEvidence.mockResolvedValue([{ fileHash: '0xcited', score: 0.88 }]);

    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.gaps[0].vaultHits[0].alreadyCited).toBe(true);
  });

  it('reports newHits count (only non-cited hits)', async () => {
    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.gaps[0].newHits).toBe(1);
  });

  it('returns error when thesis not found', async () => {
    mockThesisFindUnique.mockResolvedValue(null);

    const raw = await getResearchAgendaHandler({ thesisId: 'missing' });
    const result = JSON.parse(raw);

    expect(result.error).toMatch(/No thesis found/);
  });

  it('returns error when head version has no AI analysis (PENDING_AI)', async () => {
    mockThesisFindUnique.mockResolvedValue({
      ...thesisWithAnalysisFixture,
      headVersion: { ...thesisWithAnalysisFixture.headVersion, status: 'PENDING_AI', aiAnalysis: null },
    });

    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.error).toMatch(/not been analysed/);
  });

  it('degrades gracefully when vault search fails', async () => {
    // Simulate Pinecone search failure (per-gap catch handles this non-fatally)
    mockSearchEvidence.mockRejectedValue(new Error('Pinecone timeout'));

    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    // Should still return gaps, just with empty vaultHits
    expect(result.gaps).toHaveLength(2);
    result.gaps.forEach((gap: { vaultHits: unknown[] }) => {
      expect(gap.vaultHits).toEqual([]);
    });
  });

  it('includes instructions for next action in the response', async () => {
    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.instructions).toContain('add_thesis_version');
    expect(result.instructions).toContain('create_evidence_from_url');
  });

  it('includes counterArguments and alternativeInterpretations', async () => {
    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.counterArguments).toHaveLength(1);
    expect(result.counterArguments[0].strength).toBe('STRONG');
    expect(result.alternativeInterpretations).toHaveLength(1);
  });

  it('respects maxHitsPerGap parameter', async () => {
    // searchSimilarEvidence called with limit * 2 over-fetch
    await getResearchAgendaHandler({ thesisId: 'thesis-1', maxHitsPerGap: 1 });

    // called once per gap (2 gaps), each with limit*2 = 2
    expect(mockSearchEvidence).toHaveBeenCalledTimes(2);
    expect(mockSearchEvidence).toHaveBeenCalledWith(expect.any(String), 2);
  });

  it('returns resolved=false and null resolvedAt/resolvedBy for unresolved gaps', async () => {
    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    result.gaps.forEach((gap: { resolved: boolean; resolvedAt: unknown; resolvedBy: unknown }) => {
      expect(gap.resolved).toBe(false);
      expect(gap.resolvedAt).toBeNull();
      expect(gap.resolvedBy).toBeNull();
    });
  });

  it('marks a gap as resolved when a ThesisGapResolution exists for its index', async () => {
    const resolvedAt = new Date('2026-06-01T10:00:00Z');
    mockThesisFindUnique.mockResolvedValueOnce({
      ...thesisWithAnalysisFixture,
      headVersion: {
        ...thesisWithAnalysisFixture.headVersion,
        gapResolutions: [
          {
            gapIndex: 0,
            evidenceId: '0xresolver',
            createdAt: resolvedAt,
            evidence: { summary: 'MOH directive found in archive.' },
          },
        ],
      },
    });

    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.gaps[0].resolved).toBe(true);
    expect(result.gaps[0].resolvedAt).toBe(resolvedAt.toISOString());
    expect(result.gaps[0].resolvedBy).toBe('0xresolver');
    expect(result.gaps[0].resolutionSummary).toBe('MOH directive found in archive.');
  });

  it('leaves other gaps unresolved when only one gap has a resolution', async () => {
    mockThesisFindUnique.mockResolvedValueOnce({
      ...thesisWithAnalysisFixture,
      headVersion: {
        ...thesisWithAnalysisFixture.headVersion,
        gapResolutions: [
          {
            gapIndex: 0,
            evidenceId: '0xresolver',
            createdAt: new Date(),
            evidence: { summary: 'Resolved.' },
          },
        ],
      },
    });

    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.gaps[0].resolved).toBe(true);
    expect(result.gaps[1].resolved).toBe(false);
    expect(result.gaps[1].resolvedBy).toBeNull();
  });

  it('includes title in the response', async () => {
    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.title).toBe('Test Thesis Title');
  });

  it('instructions mention resolved=false filter', async () => {
    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    expect(result.instructions).toContain('resolved=false');
  });

  it('returns suggestedVersionBody=null for all gaps when includeSuggestions is false (default)', async () => {
    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1' });
    const result = JSON.parse(raw);

    result.gaps.forEach((gap: { suggestedVersionBody: unknown }) => {
      expect(gap.suggestedVersionBody).toBeNull();
    });
  });

  it('calls GapRevisionAgent for each open gap with new hits when includeSuggestions=true', async () => {
    const { GapRevisionAgent: MockGapRevision } = jest.requireMock('../src/services/GapRevisionAgent');
    MockGapRevision.mockImplementation(() => ({
      suggest: jest.fn().mockResolvedValue({ suggestedBody: '## revised body' }),
    }));

    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1', includeSuggestions: true });
    const result = JSON.parse(raw);

    // Both gaps have new hits — both should get a suggestedVersionBody
    const withSuggestion = result.gaps.filter(
      (g: { suggestedVersionBody: string | null }) => g.suggestedVersionBody !== null,
    );
    expect(withSuggestion.length).toBeGreaterThan(0);
    expect(withSuggestion[0].suggestedVersionBody).toBe('## revised body');
  });

  it('does not call GapRevisionAgent for resolved gaps even when includeSuggestions=true', async () => {
    const { GapRevisionAgent: MockGapRevision } = jest.requireMock('../src/services/GapRevisionAgent');
    const mockSuggest = jest.fn().mockResolvedValue({ suggestedBody: '## revised' });
    MockGapRevision.mockImplementation(() => ({ suggest: mockSuggest }));

    // Mark gap 0 as resolved
    mockThesisFindUnique.mockResolvedValueOnce({
      ...thesisWithAnalysisFixture,
      headVersion: {
        ...thesisWithAnalysisFixture.headVersion,
        gapResolutions: [
          {
            gapIndex: 0,
            evidenceId: '0xresolver',
            createdAt: new Date(),
            evidence: { summary: 'Already resolved.' },
          },
        ],
      },
    });

    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1', includeSuggestions: true });
    const result = JSON.parse(raw);

    expect(result.gaps[0].resolved).toBe(true);
    expect(result.gaps[0].suggestedVersionBody).toBeNull();
    // Gap 1 is open — should have a suggestion
    expect(result.gaps[1].resolved).toBe(false);
    expect(result.gaps[1].suggestedVersionBody).toBe('## revised');
  });

  it('returns suggestedVersionBody=null when GapRevisionAgent throws', async () => {
    const { GapRevisionAgent: MockGapRevision } = jest.requireMock('../src/services/GapRevisionAgent');
    MockGapRevision.mockImplementation(() => ({
      suggest: jest.fn().mockRejectedValue(new Error('LLM timeout')),
    }));

    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1', includeSuggestions: true });
    const result = JSON.parse(raw);

    // Non-fatal: gaps still returned, suggestedVersionBody is null
    expect(result.gaps).toHaveLength(2);
    result.gaps.forEach((gap: { suggestedVersionBody: unknown }) => {
      expect(gap.suggestedVersionBody).toBeNull();
    });
  });

  it('returns suggestedVersionBody=null for gaps where all vault hits are already cited', async () => {
    const { GapRevisionAgent: MockGapRevision } = jest.requireMock('../src/services/GapRevisionAgent');
    const mockSuggest = jest.fn();
    MockGapRevision.mockImplementation(() => ({ suggest: mockSuggest }));

    // All vault hits are already cited
    mockEvidenceFindMany.mockResolvedValue([
      { ...evidenceFixture, fileHash: '0xcited', status: 'CONFIRMED', figures: [] },
    ]);
    mockSearchEvidence.mockResolvedValue([{ fileHash: '0xcited', score: 0.9 }]);

    const raw = await getResearchAgendaHandler({ thesisId: 'thesis-1', includeSuggestions: true });
    const result = JSON.parse(raw);

    expect(mockSuggest).not.toHaveBeenCalled();
    result.gaps.forEach((gap: { suggestedVersionBody: unknown }) => {
      expect(gap.suggestedVersionBody).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// createResearchSession / addSessionNote / closeResearchSession / getSessionSummary
// ---------------------------------------------------------------------------

import { createResearchSessionHandler } from '../src/mcp/tools/createResearchSession';
import { addSessionNoteHandler } from '../src/mcp/tools/addSessionNote';
import { closeResearchSessionHandler } from '../src/mcp/tools/closeResearchSession';
import { getSessionSummaryHandler } from '../src/mcp/tools/getSessionSummary';

const mockResearchSession = (prisma as unknown as {
  researchSession: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
}).researchSession;

const mockResearchSessionEvent = (prisma as unknown as {
  researchSessionEvent: { create: jest.Mock };
}).researchSessionEvent;

describe('createResearchSessionHandler', () => {
  beforeEach(() => {
    (prisma.thesis.findUnique as jest.Mock).mockResolvedValue({ id: 'thesis-1', headVersionId: 'v1' });
    mockResearchSession.findFirst.mockResolvedValue(null);
    mockResearchSession.create.mockResolvedValue({
      id: 'session-1', thesisId: 'thesis-1', name: 'Test Session', status: 'ACTIVE', createdAt: new Date(),
    });
    mockResearchSessionEvent.create.mockResolvedValue({ id: 'evt-1' });
  });

  it('returns error when thesis not found', async () => {
    (prisma.thesis.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const result = JSON.parse(await createResearchSessionHandler({ thesisId: 'bad-id' }));
    expect(result.error).toMatch(/not found/);
  });

  it('creates a new session and logs SESSION_STARTED', async () => {
    const result = JSON.parse(await createResearchSessionHandler({ thesisId: 'thesis-1', name: 'My Session' }));
    expect(result.sessionId).toBe('session-1');
    expect(result.status).toBe('ACTIVE');
    expect(mockResearchSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ thesisId: 'thesis-1', name: 'My Session' }) }),
    );
    expect(mockResearchSessionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'SESSION_STARTED' }) }),
    );
  });

  it('auto-closes existing active session before creating new one', async () => {
    mockResearchSession.findFirst.mockResolvedValueOnce({
      id: 'old-session', _count: { events: 3 },
    });
    mockResearchSession.update.mockResolvedValue({});
    const result = JSON.parse(await createResearchSessionHandler({ thesisId: 'thesis-1' }));
    expect(result.previousSessionClosed).toBe('old-session');
    expect(mockResearchSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'old-session' }, data: expect.objectContaining({ status: 'CLOSED' }) }),
    );
  });
});

describe('addSessionNoteHandler', () => {
  it('returns error when no active session', async () => {
    mockResearchSession.findFirst.mockResolvedValueOnce(null);
    const result = JSON.parse(await addSessionNoteHandler({ thesisId: 'thesis-1', note: 'test' }));
    expect(result.error).toMatch(/No active session/);
  });

  it('logs a NOTE event to the active session', async () => {
    mockResearchSession.findFirst.mockResolvedValueOnce({ id: 'session-1', name: 'Test' });
    mockResearchSessionEvent.create.mockResolvedValueOnce({ id: 'evt-2', createdAt: new Date() });
    const result = JSON.parse(await addSessionNoteHandler({ thesisId: 'thesis-1', note: 'Important observation' }));
    expect(result.sessionId).toBe('session-1');
    expect(mockResearchSessionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'NOTE', description: 'Important observation' }) }),
    );
  });
});

describe('closeResearchSessionHandler', () => {
  const mockEvents = [
    { type: 'SESSION_STARTED', description: 'started', createdAt: new Date() },
    { type: 'VERSION_CREATED', description: 'v2', createdAt: new Date() },
    { type: 'AI_ANALYSIS_RUN', description: 'MODERATE', createdAt: new Date() },
    { type: 'GAP_RESOLVED', description: 'gap 0', createdAt: new Date() },
    { type: 'NOTE', description: 'a note', createdAt: new Date() },
  ];

  it('returns error when no active session', async () => {
    mockResearchSession.findFirst.mockResolvedValueOnce(null);
    const result = JSON.parse(await closeResearchSessionHandler({ thesisId: 'thesis-1' }));
    expect(result.error).toMatch(/No active session/);
  });

  it('closes session and returns summary with correct counts', async () => {
    mockResearchSession.findFirst.mockResolvedValueOnce({
      id: 'session-1', name: 'Sprint 1', createdAt: new Date(Date.now() - 60000), events: mockEvents,
    });
    mockResearchSessionEvent.create.mockResolvedValue({});
    mockResearchSession.update.mockResolvedValue({ id: 'session-1', closedAt: new Date(), createdAt: new Date(Date.now() - 60000) });
    const result = JSON.parse(await closeResearchSessionHandler({ thesisId: 'thesis-1' }));
    expect(result.status).toBe('CLOSED');
    expect(result.summary.versionsCreated).toBe(1);
    expect(result.summary.gapsResolved).toBe(1);
    expect(result.summary.aiAnalysesRun).toBe(1);
    expect(result.summary.notes).toBe(1);
    expect(result.events).toHaveLength(5);
  });
});

describe('getSessionSummaryHandler', () => {
  it('returns message when no sessions exist', async () => {
    mockResearchSession.findFirst.mockResolvedValueOnce(null);
    const result = JSON.parse(await getSessionSummaryHandler({ thesisId: 'thesis-1' }));
    expect(result.session).toBeNull();
    expect(result.message).toMatch(/create_research_session/);
  });

  it('returns active session with events and summary', async () => {
    mockResearchSession.findFirst.mockResolvedValueOnce({
      id: 'session-1', name: 'Active Sprint', status: 'ACTIVE',
      createdAt: new Date(Date.now() - 120000), closedAt: null,
      events: [
        { type: 'SESSION_STARTED', description: 'started', refId: null, createdAt: new Date() },
        { type: 'VERSION_CREATED', description: 'v2', refId: 'v2', createdAt: new Date() },
      ],
    });
    mockResearchSession.count.mockResolvedValueOnce(1);
    const result = JSON.parse(await getSessionSummaryHandler({ thesisId: 'thesis-1' }));
    expect(result.session.id).toBe('session-1');
    expect(result.session.status).toBe('ACTIVE');
    expect(result.session.events).toHaveLength(2);
    expect(result.session.summary.versionsCreated).toBe(1);
    expect(result.totalSessions).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// suggestThesisHandler
// ---------------------------------------------------------------------------

import { suggestThesisHandler } from '../src/mcp/tools/suggestThesis';
import { ThesisSynthesisAgent } from '../src/services/ThesisSynthesisAgent';

const SYNTHESIS_PROPOSAL = {
  proposedTitle: 'Suppression of Adverse Event Data',
  thesisStatement: 'הראיות מצביעות על כך שמשרד הבריאות ידע ולכאורה הסתיר.',
  narrativeBody: '## עיקרי הטענה\n\nהמשרד הסתיר לכאורה נתונים[^1], לפי ראיון פומבי[^2].',
  citations: [
    { id: 1, fileHashes: ['hash-001'] },
    { id: 2, fileHashes: ['hash-002'] },
  ],
  keyFigures: ['חזי לוי', 'שרון אלרוי-פריס'],
  confidenceLevel: 'MODERATE' as const,
  missingEvidence: ['תכתובות פנימיות'],
  summaryHe: 'הראיות מצביעות על הסתרה לכאורה.',
};

const EVIDENCE_RECORDS = [
  {
    fileHash: 'hash-001',
    summary: 'דוח פנימי על אירועי לב.',
    evidenceTier: 'Tier1',
    evidenceRole: 'Incriminating',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
    evidenceDate: '2021-06-10',
    targetEntity: 'Ministry of Health',
    figures: [{ name: 'חזי לוי' }],
  },
  {
    fileHash: 'hash-002',
    summary: 'ראיון שבו הוכחשו הסיכונים.',
    evidenceTier: 'Tier2',
    evidenceRole: 'Incriminating',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
    evidenceDate: '2021-07-15',
    targetEntity: 'Dr. Sharon Alroy-Preis',
    figures: [{ name: 'שרון אלרוי-פריס' }],
  },
];

describe('suggestThesisHandler', () => {
  // Stable object — the lazy VectorStoreService singleton inside suggestThesis.ts
  // captures this reference on first call, so all tests must use the same object.
  const mockVectorStore = { searchSimilarEvidence: jest.fn() };
  let mockEvidence: { findMany: jest.Mock };

  // Configure ThesisSynthesisAgent to return a specific value on next construction.
  // Must be called BEFORE the handler — uses mockImplementationOnce so the next
  // `new ThesisSynthesisAgent()` returns an instance whose synthesize resolves to value.
  function setupSynthesizeResponse(response: typeof SYNTHESIS_PROPOSAL): void {
    (ThesisSynthesisAgent as jest.Mock).mockImplementationOnce(() => ({
      synthesize: jest.fn().mockResolvedValueOnce(response),
    }));
  }

  // Get the synthesize mock from the most recently constructed instance.
  // Uses mock.results (the returned object) rather than mock.instances (the `this` binding),
  // because mockImplementationOnce(() => obj) returns obj but `this` is the raw mock object.
  // Call AFTER awaiting the handler so the constructor has already run.
  function getLastSynthesize(): jest.Mock {
    const results = (ThesisSynthesisAgent as jest.Mock).mock.results;
    return results[results.length - 1]?.value?.synthesize as jest.Mock;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply after clearAllMocks clears the mockResolvedValue queue
    (VectorStoreService.create as jest.Mock).mockResolvedValue(mockVectorStore);
    mockEvidence = prisma.evidence as unknown as { findMany: jest.Mock };
  });

  it('returns a structured proposal when vault has matching evidence', async () => {
    setupSynthesizeResponse(SYNTHESIS_PROPOSAL);
    mockVectorStore.searchSimilarEvidence.mockResolvedValueOnce([
      { fileHash: 'hash-001' },
      { fileHash: 'hash-002' },
    ]);
    mockEvidence.findMany.mockResolvedValueOnce(EVIDENCE_RECORDS);

    const result = JSON.parse(await suggestThesisHandler({ topic: 'adverse event suppression' }));

    expect(result.proposedTitle).toBe(SYNTHESIS_PROPOSAL.proposedTitle);
    expect(result.confidenceLevel).toBe('MODERATE');
    expect(result.supportingHashes).toEqual(['hash-001', 'hash-002']);
    expect(result.citations).toEqual(SYNTHESIS_PROPOSAL.citations);
    expect(result.keyFigures).toHaveLength(2);
    expect(result.evidenceCorpusSize).toBe(2);
  });

  it('derives supportingHashes from citations in first-footnote-appearance order, not LLM-generated', async () => {
    setupSynthesizeResponse({
      ...SYNTHESIS_PROPOSAL,
      narrativeBody: 'טענה ב[^2] קודמת לטענה א[^1] בטקסט.',
    });
    mockVectorStore.searchSimilarEvidence.mockResolvedValueOnce([
      { fileHash: 'hash-001' },
      { fileHash: 'hash-002' },
    ]);
    mockEvidence.findMany.mockResolvedValueOnce(EVIDENCE_RECORDS);

    const result = JSON.parse(await suggestThesisHandler({ topic: 'test' }));
    // [^2] appears first in the text, so hash-002 (citation id 2) should be first.
    expect(result.supportingHashes).toEqual(['hash-002', 'hash-001']);
  });

  it('includes readyForDraft with body, evidenceHashes, keyFigures, and citations', async () => {
    setupSynthesizeResponse(SYNTHESIS_PROPOSAL);
    mockVectorStore.searchSimilarEvidence.mockResolvedValueOnce([{ fileHash: 'hash-001' }]);
    mockEvidence.findMany.mockResolvedValueOnce([EVIDENCE_RECORDS[0]]);

    const result = JSON.parse(await suggestThesisHandler({ topic: 'test' }));

    expect(result.readyForDraft).toBeDefined();
    expect(result.readyForDraft.body).toBe(SYNTHESIS_PROPOSAL.narrativeBody);
    expect(result.readyForDraft.evidenceHashes).toEqual(['hash-001', 'hash-002']);
    expect(result.readyForDraft.keyFigures).toEqual(SYNTHESIS_PROPOSAL.keyFigures);
    expect(result.readyForDraft.citations).toEqual(SYNTHESIS_PROPOSAL.citations);
  });

  it('returns an error when the vector search throws', async () => {
    // The lazy singleton means VectorStoreService.create() is only called once across the suite.
    // Test the unavailable scenario by making searchSimilarEvidence throw instead.
    mockVectorStore.searchSimilarEvidence.mockRejectedValueOnce(new Error('connection refused'));

    const result = JSON.parse(await suggestThesisHandler({ topic: 'test' }));
    expect(result.error).toContain('Vector store unavailable');
  });

  it('returns an error when no vector results are found', async () => {
    mockVectorStore.searchSimilarEvidence.mockResolvedValueOnce([]);

    const result = JSON.parse(await suggestThesisHandler({ topic: 'unknown topic' }));
    expect(result.error).toContain('No evidence found');
    expect(result.topic).toBe('unknown topic');
  });

  it('returns an error when all vector hits are unconfirmed in Prisma', async () => {
    mockVectorStore.searchSimilarEvidence.mockResolvedValueOnce([{ fileHash: 'hash-001' }]);
    mockEvidence.findMany.mockResolvedValueOnce([]);

    const result = JSON.parse(await suggestThesisHandler({ topic: 'test' }));
    expect(result.error).toContain('none are CONFIRMED');
  });

  it('passes topic to the ThesisSynthesisAgent', async () => {
    setupSynthesizeResponse(SYNTHESIS_PROPOSAL);
    mockVectorStore.searchSimilarEvidence.mockResolvedValueOnce([{ fileHash: 'hash-001' }]);
    mockEvidence.findMany.mockResolvedValueOnce([EVIDENCE_RECORDS[0]]);

    await suggestThesisHandler({ topic: 'EUA suppression' });

    // The fourth argument is the provenance caveat. This fixture's diff carries no
    // summaryVersion, so it predates the self-contained-summary rule and MUST
    // reach the agent — a corpus that silently drops this warning is how a thesis
    // gets corroborated by its own premise.
    expect(getLastSynthesize()).toHaveBeenCalledWith(
      'EUA suppression',
      expect.any(Array),
      expect.any(Object),
      expect.objectContaining({ affected: ['0xcited'], versions: ['pre-self-contained'] }),
    );
  });

  it('maps Prisma figures into keyFigures array for the corpus', async () => {
    setupSynthesizeResponse(SYNTHESIS_PROPOSAL);
    mockVectorStore.searchSimilarEvidence.mockResolvedValueOnce([{ fileHash: 'hash-001' }]);
    mockEvidence.findMany.mockResolvedValueOnce([EVIDENCE_RECORDS[0]]);

    await suggestThesisHandler({ topic: 'test' });

    const corpusArg = getLastSynthesize().mock.calls[0][1] as Array<{ keyFigures: string[] }>;
    expect(corpusArg[0].keyFigures).toEqual(['חזי לוי']);
  });

  it('respects maxEvidence parameter — over-fetches from vector then limits Prisma', async () => {
    setupSynthesizeResponse(SYNTHESIS_PROPOSAL);
    mockVectorStore.searchSimilarEvidence.mockResolvedValueOnce([{ fileHash: 'hash-001' }]);
    mockEvidence.findMany.mockResolvedValueOnce([EVIDENCE_RECORDS[0]]);

    await suggestThesisHandler({ topic: 'test', maxEvidence: 3 });

    expect(mockVectorStore.searchSimilarEvidence).toHaveBeenCalledWith('test', 6);
    expect(mockEvidence.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
  });

  it('preserves semantic ranking order from vector results', async () => {
    setupSynthesizeResponse(SYNTHESIS_PROPOSAL);
    // Vector returns hash-002 first (more relevant), hash-001 second
    mockVectorStore.searchSimilarEvidence.mockResolvedValueOnce([
      { fileHash: 'hash-002' },
      { fileHash: 'hash-001' },
    ]);
    // Prisma returns them in arbitrary order
    mockEvidence.findMany.mockResolvedValueOnce([EVIDENCE_RECORDS[0], EVIDENCE_RECORDS[1]]);

    await suggestThesisHandler({ topic: 'test' });

    const corpusArg = getLastSynthesize().mock.calls[0][1] as Array<{ fileHash: string }>;
    expect(corpusArg[0].fileHash).toBe('hash-002');
    expect(corpusArg[1].fileHash).toBe('hash-001');
  });

  it('includes instructions in the response', async () => {
    setupSynthesizeResponse(SYNTHESIS_PROPOSAL);
    mockVectorStore.searchSimilarEvidence.mockResolvedValueOnce([{ fileHash: 'hash-001' }]);
    mockEvidence.findMany.mockResolvedValueOnce([EVIDENCE_RECORDS[0]]);

    const result = JSON.parse(await suggestThesisHandler({ topic: 'test' }));
    expect(result.instructions).toContain('create_thesis_draft');
  });
});

// ===========================================================================
// enrich_evidence_with_history
// ===========================================================================

describe('enrichEvidenceWithHistoryHandler', () => {
  const fileHash = '0xdeadbeef';
  const sourceUrl = 'https://corona.health.gov.il/vaccine-page/';
  const evidenceFixture = { id: 'ev-1', fileHash, sourceUrl };
  const trackedUrlFixture = { id: 'tu-enrich-1', url: sourceUrl, status: 'SCANNING' };

  let mockRunFullScan: jest.Mock;

  beforeEach(() => {
    mockRunFullScan = jest.fn().mockResolvedValue(undefined);
    MockWaybackScraper.mockImplementation(
      () => ({ runFullScan: mockRunFullScan }) as unknown as WaybackScraper,
    );
    mockEvidenceFindUnique.mockResolvedValue(evidenceFixture);
    mockTrackedUrlUpsert.mockResolvedValue(trackedUrlFixture);
  });

  it('returns trackedUrlId and SCANNING status', async () => {
    const result = JSON.parse(await enrichEvidenceWithHistoryHandler({ fileHash }));
    expect(result.trackedUrlId).toBe('tu-enrich-1');
    expect(result.status).toBe('SCANNING');
    expect(result.url).toBe(sourceUrl);
  });

  it('upserts TrackedUrl with status SCANNING', async () => {
    await enrichEvidenceWithHistoryHandler({ fileHash });
    expect(mockTrackedUrlUpsert).toHaveBeenCalledWith({
      where: { url: sourceUrl },
      update: { status: 'SCANNING' },
      create: { url: sourceUrl, status: 'SCANNING' },
    });
  });

  it('fires runFullScan fire-and-forget', async () => {
    await enrichEvidenceWithHistoryHandler({ fileHash });
    await Promise.resolve();
    expect(mockRunFullScan).toHaveBeenCalledWith('tu-enrich-1', sourceUrl);
  });

  it('returns error when evidence not found', async () => {
    mockEvidenceFindUnique.mockResolvedValue(null);
    const result = JSON.parse(await enrichEvidenceWithHistoryHandler({ fileHash }));
    expect(result.error).toContain(fileHash);
  });

  it('returns error when evidence has no sourceUrl', async () => {
    mockEvidenceFindUnique.mockResolvedValue({ ...evidenceFixture, sourceUrl: null });
    const result = JSON.parse(await enrichEvidenceWithHistoryHandler({ fileHash }));
    expect(result.error).toContain('no sourceUrl');
  });

  it('does not throw when runFullScan rejects', async () => {
    mockRunFullScan.mockRejectedValue(new Error('CDX unreachable'));
    await expect(enrichEvidenceWithHistoryHandler({ fileHash })).resolves.toBeDefined();
  });

  it('returns the trackedUrlId and points at a tool the caller can actually reach', async () => {
    const result = JSON.parse(await enrichEvidenceWithHistoryHandler({ fileHash }));

    expect(result.trackedUrlId).toBe('tu-enrich-1');
    // FINDING 7 — see startForensicScanHandler above.
    expect(result.message).toContain('get_forensic_timeline');
    expect(result.message).not.toContain('/api/forensics/');
  });

  it('does not claim scan findings are auto-promoted', async () => {
    const result = JSON.parse(await enrichEvidenceWithHistoryHandler({ fileHash }));

    // FINDING 9 removed auto-promotion: recordScanFinding writes PENDING_REVIEW and
    // stops. A message promising promotion overstates what the call writes, and the
    // session protocol requires announcing that accurately before every call.
    expect(result.message).toMatch(/PENDING_REVIEW/);
    expect(result.message).not.toMatch(/auto-promot/i);
    expect(result.message).toContain('promote_scan_findings');
  });
});
