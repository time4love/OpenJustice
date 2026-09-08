// ---------------------------------------------------------------------------
// MCP tool handler tests
// All handlers are tested directly (no HTTP/transport layer).
// ---------------------------------------------------------------------------

// jsdom + @mozilla/readability are ESM-only and ts-jest cannot load them here.
// Needed since the URL intake path moved onto the shared extractor: this suite
// imports the tool registry, so it now pulls archiveText transitively. Nothing
// here exercises extraction — the real extractor is measured in test/extraction/.
jest.mock('jsdom', () => ({
  JSDOM: jest.fn().mockImplementation((html: string) => ({
    window: { document: { body: { innerHTML: html ?? '' } } },
  })),
}));
jest.mock('@mozilla/readability', () => ({
  Readability: jest.fn().mockImplementation(() => ({ parse: () => null })),
}));

jest.mock('../src/services/thesisAnalysis', () => {
  const actual = jest.requireActual('../src/services/thesisAnalysis');
  return { ...actual, triggerAIAnalysis: jest.fn() };
});

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
      findUniqueOrThrow: jest.fn(),
    },
    claimTrajectory: {
      findMany: jest.fn(),
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

jest.mock('../src/services/VectorStoreService', () => ({
  VectorStoreService: {
    create: jest.fn(),
  },
}));

jest.mock('../src/services/GapRevisionAgent', () => ({
  GapRevisionAgent: jest.fn().mockImplementation(() => ({
    suggest: jest.fn(),
  })),
}));

import { prisma } from '../src/lib/prisma';
import { survivalFixture, TEXT_VERSION } from './helpers/survivalFixture';
import { SURVIVAL_CHECK_VERSION, survivalSourceStateHash } from '../src/lib/diffSurvival';
import { triggerAIAnalysis } from '../src/services/thesisAnalysis';
import { VectorStoreService } from '../src/services/VectorStoreService';
import { IntakeAgent } from '../src/services/IntakeAgent';

// Re-import handlers AFTER mocks are in place

import { getFigureDossierHandler } from '../src/mcp/tools/getFigureDossier';
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

// ===========================================================================
// get_forensic_timeline
// ===========================================================================

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
// create_evidence_from_url
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
    // SET HERE FROM EVIDENCE STEP 11a, AND IT IS A DEFECT THE DELETION EXPOSED.
    // These cases passed on a value set by the `searchEvidenceHandler` group's
    // beforeEach: jest's `clearMocks` clears CALLS, not IMPLEMENTATIONS, so a
    // `mockResolvedValue` set in any earlier test stood for every later one. When
    // that group went with its tool the handler received `undefined` and threw.
    // The dependency was always there and was always invisible; it is stated now.
    mockEvidenceFindMany.mockResolvedValue([evidenceFixture]);
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

  // -------------------------------------------------------------------------
  // Citing a claim trajectory (docs/gf-trajectory-citation-dev-plan.md).
  //
  // A trajectory is a deterministic string search across every archived capture
  // of a page. Before this it could not be cited at all, so the two most
  // rigorously verified claims in the first real thesis were the two with no
  // citation behind them, while every model-written summary cited cleanly.
  // -------------------------------------------------------------------------
  it('resolves ONE footnote citing an evidence hash and a trajectory into both mention types', async () => {
    (prisma.claimTrajectory.findMany as jest.Mock).mockResolvedValue([
      { id: 'traj-1', claimText: 'טענה שהוסרה ולא הוחזרה' },
    ]);

    const raw = await createThesisDraftHandler({
      title: 'Mixed citation',
      body: 'The claim was removed and stayed absent[^1].',
      citations: [{ id: 1, fileHashes: ['0xabc'], trajectoryIds: ['traj-1'] }],
    });

    const versionData = mockThesisVersionCreate.mock.calls[0][0].data;
    const mentionData = versionData.mentions.createMany.data as Array<{ type: string; refId: string }>;
    expect(mentionData).toContainEqual({ type: 'EVIDENCE', refId: '0xabc' });
    expect(mentionData).toContainEqual({ type: 'CLAIM_TRAJECTORY', refId: 'traj-1' });
    expect(JSON.parse(raw).trajectoriesLinked).toBe(1);
  });

  it('links trajectories passed flat, outside any footnote', async () => {
    (prisma.claimTrajectory.findMany as jest.Mock).mockResolvedValue([
      { id: 'traj-1', claimText: 'טענה אחת' },
      { id: 'traj-2', claimText: 'טענה שנייה' },
    ]);

    await createThesisDraftHandler({
      title: 'Flat trajectories',
      body: 'Eight claims moved as one unit.',
      trajectoryIds: ['traj-1', 'traj-2'],
    });

    const versionData = mockThesisVersionCreate.mock.calls[0][0].data;
    const mentionData = versionData.mentions.createMany.data as Array<{ type: string; refId: string }>;
    expect(mentionData.filter((m) => m.type === 'CLAIM_TRAJECTORY').map((m) => m.refId)).toEqual([
      'traj-1',
      'traj-2',
    ]);
  });

  it('refuses an id that matches no row, and writes NOTHING', async () => {
    // Caught here rather than at the publication gate: a citation naming a row
    // that was never there is a typo, and finding it at publication time means
    // finding it long after the paragraph that made it was written.
    (prisma.claimTrajectory.findMany as jest.Mock).mockResolvedValue([]);

    const raw = await createThesisDraftHandler({
      title: 'Typo',
      body: 'A claim[^1].',
      citations: [{ id: 1, trajectoryIds: ['claimhash-not-an-id'] }],
    });
    const result = JSON.parse(raw);

    expect(result.error).toBe('UNKNOWN_TRAJECTORY_ID');
    expect(result.unknownIds).toEqual(['claimhash-not-an-id']);
    expect(mockThesisCreate).not.toHaveBeenCalled();
    expect(mockThesisVersionCreate).not.toHaveBeenCalled();
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

  // Whether a stored critique is still current is decided by comparing the
  // fingerprint of the critic's input, in triggerAIAnalysis — see
  // thesisAnalysisCitations.test.ts. This handler only reports that decision.
  // It used to make the call itself, with `status === COMPLETE`, which is a
  // property of the VERSION and cannot see whether the analysis is still an
  // answer to the facts.
  function headVersion() {
    (prisma.thesis.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'thesis-1',
      headVersion: {
        id: 'version-1',
        status: 'COMPLETE',
        aiAnalysis: mockAnalysis,
        userContent: { type: 'doc', content: [] },
      },
    });
    (prisma.thesisVersion.findUniqueOrThrow as jest.Mock).mockResolvedValueOnce({
      id: 'version-1',
      status: 'COMPLETE',
      aiAnalysis: mockAnalysis,
    });
  }

  it('reports cached when the service found the stored analysis still current', async () => {
    headVersion();
    (triggerAIAnalysis as jest.Mock).mockResolvedValueOnce({ ran: false });

    const result = JSON.parse(await runAiAnalysisHandler({ thesisId: 'thesis-1' }));

    expect(result.cached).toBe(true);
    expect(result.status).toBe('COMPLETE');
    expect(result.aiAnalysis).toEqual(mockAnalysis);
  });

  it('reports NOT cached when the service re-ran a stale analysis', async () => {
    // The case the old contract could not express: a version that is COMPLETE and
    // has an analysis, whose analysis no longer answers the current input.
    headVersion();
    (triggerAIAnalysis as jest.Mock).mockResolvedValueOnce({ ran: true });

    const result = JSON.parse(await runAiAnalysisHandler({ thesisId: 'thesis-1' }));

    expect(result.cached).toBe(false);
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
    // `create_evidence_from_url` left the description at evidence step 11a with
    // the tool (evidence A4: a selection with nothing to select). The assertion
    // is that the instructions NAME A ROUTE THE CALLER CAN TAKE, so it moves to
    // the one that is still there rather than being dropped.
    expect(result.instructions).toContain('create_evidence_from_text');
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

jest.mock('../src/services/researchSessions', () => ({
  openExclusiveSession: jest.fn(),
}));
import { openExclusiveSession } from '../src/services/researchSessions';
const mockOpenExclusiveSession = openExclusiveSession as jest.Mock;

describe('createResearchSessionHandler', () => {
  // The one-active-session rule itself is tested in researchSessions.test.ts;
  // here only the handler's translation of the service's answer.
  beforeEach(() => {
    (prisma.thesis.findUnique as jest.Mock).mockResolvedValue({ id: 'thesis-1', headVersionId: 'v1' });
    mockOpenExclusiveSession.mockResolvedValue({
      opened: true,
      session: { id: 'session-1', name: 'My Session', status: 'ACTIVE', createdAt: new Date() },
      closed: null,
    });
  });

  it('returns error when thesis not found', async () => {
    (prisma.thesis.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const result = JSON.parse(await createResearchSessionHandler({ thesisId: 'bad-id' }));
    expect(result.error).toMatch(/not found/);
    expect(mockOpenExclusiveSession).not.toHaveBeenCalled();
  });

  it('opens the session on the thesis and passes consent through', async () => {
    const result = JSON.parse(
      await createResearchSessionHandler({ thesisId: 'thesis-1', name: 'My Session', closeActiveSession: true }),
    );
    expect(result.sessionId).toBe('session-1');
    expect(result.status).toBe('ACTIVE');
    expect(mockOpenExclusiveSession).toHaveBeenCalledWith(
      null,
      { thesisId: 'thesis-1', question: null, name: 'My Session' },
      { closeActiveSession: true, closeOtherResearchersSession: undefined, closeReason: undefined },
    );
  });

  it('surfaces a refusal verbatim so the caller sees whose session is open', async () => {
    mockOpenExclusiveSession.mockResolvedValueOnce({
      opened: false,
      error: 'SESSION_ACTIVE_OTHER_RESEARCHER',
      activeSession: { id: 'old', ownerHandle: 'dana' },
      howToProceed: 'pass closeOtherResearchersSession',
    });
    const result = JSON.parse(await createResearchSessionHandler({ thesisId: 'thesis-1' }));
    expect(result.error).toBe('SESSION_ACTIVE_OTHER_RESEARCHER');
    expect(result.activeSession.ownerHandle).toBe('dana');
    expect(result.sessionId).toBeUndefined();
  });
});

describe('addSessionNoteHandler', () => {
  it('returns error when no active session', async () => {
    mockResearchSession.findFirst.mockResolvedValueOnce(null);
    const result = JSON.parse(await addSessionNoteHandler({ thesisId: 'thesis-1', note: 'test' }));
    expect(result.error).toMatch(/You have no active session on thesis/);
    // A note is a provenance event, so the refusal says plainly that another
    // researcher's session is not somewhere you may write.
    expect(result.error).toMatch(/not one you can write into/);
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
    expect(result.error).toMatch(/You have no active session/);
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

// THREE GROUPS LEFT THIS FILE AT EVIDENCE STEP 11a, WITH THEIR TOOLS:
// `searchEvidenceHandler`, `getForensicTimelineHandler` and
// `createEvidenceFromUrlHandler` — retired by evidence flows A4 (an evidence
// surface ranked by an embedding of prose; opinion beside fact with no linkage,
// replaced by `list_findings` at step 12; a selection with nothing to select).
// Deleted with the concept, never weakened to pass — refactor plan §4 rule 1.