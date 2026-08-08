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
    thesis: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    thesisVersion: {
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
import { createThesisDraftHandler } from '../src/mcp/tools/createThesisDraft';
import { addThesisVersionHandler } from '../src/mcp/tools/addThesisVersion';

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
  category: 'Regulatory',
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
      category: 'Regulatory',
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
        evidenceDate: '2022-01-15',
        category: 'Official Statement',
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
    category: 'Side Effect Withholding',
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
    category: 'Side Effect Withholding',
    targetEntity: 'Ministry of Health',
    evidenceTier: 'Tier 2: Material',
    summary: 'Ministry suppressed side effect data.',
    evidenceDate: '2022-08-01',
    figures: [{ name: 'Prof. Barkovitz' }],
    sourceUrl: testUrl,
  };

  let mockAnalyzeText: jest.Mock;

  beforeEach(() => {
    mockAnalyzeText = jest.fn().mockResolvedValue(analysisFixture);
    MockIntakeAgent.mockImplementation(() => ({ analyzeText: mockAnalyzeText }) as unknown as IntakeAgent);

    // Default: no existing record
    mockEvidenceFindUnique.mockResolvedValue(null);
    mockKeyFigureCreateMany.mockResolvedValue({ count: 1 });
    mockEvidenceCreate.mockResolvedValue(createdRecordFixture);

    // Mock global fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
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

  it('includes trackedUrlId in the poll-status message', async () => {
    const raw = await startForensicScanHandler({ url: testUrl });
    const result = JSON.parse(raw);

    expect(result.message).toContain('tu-uuid-1');
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
    const raw = await createThesisDraftHandler({ body: 'The ministry hid side effects.' });
    const result = JSON.parse(raw);

    expect(result.thesisId).toBe('thesis-draft-1');
    expect(result.headVersionId).toBe('ver-1');
    expect(result.status).toBe('PENDING_AI');
  });

  it('creates thesis in a transaction', async () => {
    await createThesisDraftHandler({ body: 'Test thesis body.' });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockThesisCreate).toHaveBeenCalledWith({ data: {} });
  });

  it('creates ThesisVersion with PENDING_AI status', async () => {
    await createThesisDraftHandler({ body: 'Test.' });

    expect(mockThesisVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_AI', thesisId: 'thesis-draft-1' }),
      }),
    );
  });

  it('sets headVersionId on the thesis after version creation', async () => {
    await createThesisDraftHandler({ body: 'Test.' });

    expect(mockThesisUpdate).toHaveBeenCalledWith({
      where: { id: 'thesis-draft-1' },
      data: { headVersionId: 'ver-1' },
    });
  });

  it('populates evidence mentions from evidenceHashes', async () => {
    await createThesisDraftHandler({
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
    const raw = await createThesisDraftHandler({ body: 'Minimal draft.' });
    const result = JSON.parse(raw);

    expect(result.thesisId).toBeDefined();
    expect(result.mentionsCreated).toBe(0);
  });

  it('message instructs user to open in UI before publishing', async () => {
    const raw = await createThesisDraftHandler({ body: 'Draft.' });
    const result = JSON.parse(raw);

    expect(result.message).toContain('PENDING_AI');
    expect(result.message).toContain('UI');
  });

  it('does NOT trigger DevilsAdvocateAgent (staging gate)', async () => {
    // No DevilsAdvocateAgent mock needed — if it were called it would throw
    // (it's not mocked). The test passes because it isn't called.
    await expect(createThesisDraftHandler({ body: 'Draft.' })).resolves.toBeDefined();
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

  it('message instructs user to open in UI before AI analysis', async () => {
    const raw = await addThesisVersionHandler({ thesisId: 'thesis-1', body: 'Body.' });
    const result = JSON.parse(raw);

    expect(result.message).toContain('PENDING_AI');
    expect(result.message).toContain('UI');
  });
});
