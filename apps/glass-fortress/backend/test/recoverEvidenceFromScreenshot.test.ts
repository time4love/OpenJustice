// ---------------------------------------------------------------------------
// recover_evidence_from_screenshot MCP tool handler
// Tested directly (no HTTP/transport layer), same convention as mcpTools.test.ts.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    evidence: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    keyFigure: {
      createMany: jest.fn(),
    },
  },
}));

jest.mock('../src/services/IntakeAgent', () => {
  const actual = jest.requireActual('../src/services/IntakeAgent');
  return {
    ...actual,
    IntakeAgent: jest.fn().mockImplementation(() => ({
      analyzeMultiImageEvidence: jest.fn(),
    })),
  };
});

const mockUploadEvidenceFile = jest.fn();
jest.mock('../src/services/StorageService', () => ({
  StorageService: jest.fn().mockImplementation(() => ({
    uploadEvidenceFile: mockUploadEvidenceFile,
  })),
}));

import { prisma } from '../src/lib/prisma';
import { IntakeAgent } from '../src/services/IntakeAgent';
import { researcherContext } from '../src/context/researcherContext';
import { recoverEvidenceFromScreenshotHandler } from '../src/mcp/tools/recoverEvidenceFromScreenshot';

const MockIntakeAgent = IntakeAgent as unknown as jest.Mock;
const mockEvidenceFindUnique = prisma.evidence.findUnique as jest.Mock;
const mockEvidenceCreate = prisma.evidence.create as jest.Mock;
const mockKeyFigureCreateMany = prisma.keyFigure.createMany as jest.Mock;

const ANALYSIS_FIXTURE = {
  evidenceRole: 'Incriminating',
  isRelevant: true,
  investigativeCategories: ['WITHHOLDING_INFORMATION'],
  summary: 'הדף שנתפס מציג הנחיה פנימית להסתרת נתונים.',
  missingInformation: [],
  targetEntity: 'Ministry of Health',
  evidencePerspective: 'Internal Knowledge',
  tierReasoning: 'מסמך פנימי דלוף.',
  evidenceTier: 'Tier 1: Smoking Gun',
  evidenceDate: '2021-03-10',
  keyFigures: ['ד"ר שרון אלרוי-פריס'],
  medicalConditions: [],
  statisticalClaims: [],
  regulatoryMentions: [],
  euaOmissionStatus: 'Not Applicable',
};

const CREATED_RECORD_FIXTURE = {
  id: 'ev-recovered-1',
  fileHash: '0xrecovered',
  summary: ANALYSIS_FIXTURE.summary,
  evidenceTier: ANALYSIS_FIXTURE.evidenceTier,
  evidenceRole: ANALYSIS_FIXTURE.evidenceRole,
  investigativeCategories: ANALYSIS_FIXTURE.investigativeCategories,
  targetEntity: ANALYSIS_FIXTURE.targetEntity,
  evidenceDate: ANALYSIS_FIXTURE.evidenceDate,
  fileUrl: 'https://storage.example/first.jpg',
  additionalScreenshotUrls: ['https://storage.example/second.jpg'],
  figures: ANALYSIS_FIXTURE.keyFigures.map((name) => ({ name })),
};

const FAILED_URL = 'https://example.gov/blocked-page';
const SCREENSHOT_A = { base64: Buffer.from('page-1').toString('base64'), mimeType: 'image/jpeg' as const };
const SCREENSHOT_B = { base64: Buffer.from('page-2').toString('base64'), mimeType: 'image/png' as const };

let mockAnalyzeMultiImageEvidence: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockAnalyzeMultiImageEvidence = jest.fn().mockResolvedValue(ANALYSIS_FIXTURE);
  MockIntakeAgent.mockImplementation(() => ({ analyzeMultiImageEvidence: mockAnalyzeMultiImageEvidence }));

  mockEvidenceFindUnique.mockResolvedValue(null);
  mockKeyFigureCreateMany.mockResolvedValue({ count: 1 });
  mockEvidenceCreate.mockImplementation(({ data }: { data: { fileHash: string } }) =>
    Promise.resolve({ ...CREATED_RECORD_FIXTURE, fileHash: data.fileHash }),
  );
  // mockResolvedValueOnce queues survive mockClear()/clearAllMocks() (they
  // only clear call history, not queued implementations) — reset first so a
  // single-screenshot test's unconsumed second queued value can't leak into
  // the next test's first call.
  mockUploadEvidenceFile
    .mockReset()
    .mockResolvedValueOnce('https://storage.example/first.jpg')
    .mockResolvedValueOnce('https://storage.example/second.jpg');
});

describe('recoverEvidenceFromScreenshotHandler', () => {
  it('returns a PENDING_REVIEW record built from the synthesized analysis', async () => {
    const raw = await recoverEvidenceFromScreenshotHandler({
      failedUrl: FAILED_URL,
      screenshots: [SCREENSHOT_A, SCREENSHOT_B],
    });
    const result = JSON.parse(raw);

    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.evidenceId).toBe('ev-recovered-1');
    expect(result.summary).toBe(ANALYSIS_FIXTURE.summary);
    expect(result.sourceUrl).toBe(FAILED_URL);
    expect(result.fileUrl).toBe('https://storage.example/first.jpg');
    expect(result.additionalScreenshotUrls).toEqual(['https://storage.example/second.jpg']);
  });

  it('calls analyzeMultiImageEvidence once with all screenshots decoded, in order', async () => {
    await recoverEvidenceFromScreenshotHandler({
      failedUrl: FAILED_URL,
      screenshots: [SCREENSHOT_A, SCREENSHOT_B],
    });

    expect(mockAnalyzeMultiImageEvidence).toHaveBeenCalledTimes(1);
    const [images] = mockAnalyzeMultiImageEvidence.mock.calls[0] as [{ buffer: Buffer; mimeType: string }[], string];
    expect(images).toHaveLength(2);
    expect(images[0].buffer.toString()).toBe('page-1');
    expect(images[0].mimeType).toBe('image/jpeg');
    expect(images[1].buffer.toString()).toBe('page-2');
    expect(images[1].mimeType).toBe('image/png');
  });

  it('builds a contextNote carrying failedUrl and failureReason', async () => {
    await recoverEvidenceFromScreenshotHandler({
      failedUrl: FAILED_URL,
      failureReason: 'HTTP 403',
      screenshots: [SCREENSHOT_A],
    });

    const [, contextNote] = mockAnalyzeMultiImageEvidence.mock.calls[0] as [unknown, string];
    expect(contextNote).toContain(FAILED_URL);
    expect(contextNote).toContain('HTTP 403');
  });

  it('omits failureReason from the contextNote when not given', async () => {
    await recoverEvidenceFromScreenshotHandler({
      failedUrl: FAILED_URL,
      screenshots: [SCREENSHOT_A],
    });

    const [, contextNote] = mockAnalyzeMultiImageEvidence.mock.calls[0] as [unknown, string];
    expect(contextNote).toContain(FAILED_URL);
    expect(contextNote).not.toContain('Failure reason');
  });

  it('rejects a screenshot over the shared MAX_EVIDENCE_FILE_BYTES limit before calling the LLM', async () => {
    const oversized = { base64: Buffer.alloc(11 * 1024 * 1024).toString('base64'), mimeType: 'image/jpeg' as const };

    await expect(
      recoverEvidenceFromScreenshotHandler({ failedUrl: FAILED_URL, screenshots: [oversized] }),
    ).rejects.toThrow('exceeds the 10 MB size limit');
    expect(mockAnalyzeMultiImageEvidence).not.toHaveBeenCalled();
  });

  it('stamps createdById from researcher context when present', async () => {
    await researcherContext.run({ researcherId: 'researcher-42' }, () =>
      recoverEvidenceFromScreenshotHandler({ failedUrl: FAILED_URL, screenshots: [SCREENSHOT_A] }),
    );

    expect(mockEvidenceCreate.mock.calls[0][0].data.createdById).toBe('researcher-42');
  });

  it('leaves createdById unset outside any researcher context (anonymous)', async () => {
    await recoverEvidenceFromScreenshotHandler({ failedUrl: FAILED_URL, screenshots: [SCREENSHOT_A] });

    expect(mockEvidenceCreate.mock.calls[0][0].data.createdById).toBeUndefined();
  });

  it('short-circuits on a duplicate hash without calling StorageService or prisma.evidence.create', async () => {
    mockEvidenceFindUnique.mockResolvedValue({
      id: 'ev-existing',
      fileHash: 'existing-hash',
      status: 'CONFIRMED',
      summary: 'existing summary',
      evidenceTier: 'Tier 2: Material',
      evidenceRole: 'Incriminating',
      investigativeCategories: [],
      targetEntity: 'FDA',
      evidenceDate: '2021-01-01',
      fileUrl: 'https://storage.example/existing.jpg',
      additionalScreenshotUrls: [],
    });

    const raw = await recoverEvidenceFromScreenshotHandler({ failedUrl: FAILED_URL, screenshots: [SCREENSHOT_A] });
    const result = JSON.parse(raw);

    expect(result.evidenceId).toBe('ev-existing');
    expect(result.message).toContain('already exists');
    expect(mockUploadEvidenceFile).not.toHaveBeenCalled();
    expect(mockEvidenceCreate).not.toHaveBeenCalled();
  });

  it('propagates errors thrown by IntakeAgent', async () => {
    mockAnalyzeMultiImageEvidence.mockRejectedValueOnce(new Error('API timeout'));

    await expect(
      recoverEvidenceFromScreenshotHandler({ failedUrl: FAILED_URL, screenshots: [SCREENSHOT_A] }),
    ).rejects.toThrow('API timeout');
  });
});
