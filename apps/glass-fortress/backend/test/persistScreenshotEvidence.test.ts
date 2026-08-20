jest.mock('../src/services/Web3Service', () => ({
  Web3Service: { hashFile: jest.fn() },
}));

const mockUploadEvidenceFile = jest.fn();
jest.mock('../src/services/StorageService', () => ({
  StorageService: jest.fn().mockImplementation(() => ({
    uploadEvidenceFile: mockUploadEvidenceFile,
  })),
}));

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

import { prisma } from '../src/lib/prisma';
import { Web3Service } from '../src/services/Web3Service';
import { persistScreenshotEvidence } from '../src/lib/persistScreenshotEvidence';
import type { IntakeOutput } from '../src/services/IntakeAgent';

const mockHashFile = Web3Service.hashFile as jest.Mock;
const mockFindUnique = prisma.evidence.findUnique as jest.Mock;
const mockCreate = prisma.evidence.create as jest.Mock;
const mockCreateManyKeyFigures = prisma.keyFigure.createMany as jest.Mock;

const ANALYSIS: IntakeOutput = {
  evidenceRole: 'Incriminating',
  isRelevant: true,
  investigativeCategories: ['WITHHOLDING_INFORMATION'],
  summary: 'סיכום ראייתי.',
  missingInformation: [],
  targetEntity: 'Ministry of Health',
  evidencePerspective: 'Internal Knowledge',
  tierReasoning: 'נימוק דרגה.',
  evidenceTier: 'Tier 1: Smoking Gun',
  evidenceDate: '2021-03-10',
  keyFigures: ['ד"ר שרון אלרוי-פריס'],
  medicalConditions: [],
  statisticalClaims: [],
  regulatoryMentions: [],
  euaOmissionStatus: 'Not Applicable',
};

const IMG_A = { buffer: Buffer.from('page-part-1'), mimeType: 'image/jpeg' };
const IMG_B = { buffer: Buffer.from('page-part-2'), mimeType: 'image/png' };
const SOURCE_URL = 'https://example.gov/blocked';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('persistScreenshotEvidence', () => {
  it('throws if called with zero images', async () => {
    await expect(
      persistScreenshotEvidence({ images: [], analysis: ANALYSIS, sourceUrl: SOURCE_URL, createdById: null }),
    ).rejects.toThrow('requires at least one image');
  });

  it('hashes the ordered concatenation of every image buffer — order-dependent', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockUploadEvidenceFile.mockResolvedValue('https://storage.example/x.jpg');
    mockCreate.mockResolvedValue({
      id: 'ev-1',
      fileHash: 'hash-ab',
      summary: ANALYSIS.summary,
      evidenceTier: ANALYSIS.evidenceTier,
      evidenceRole: ANALYSIS.evidenceRole,
      investigativeCategories: ANALYSIS.investigativeCategories,
      targetEntity: ANALYSIS.targetEntity,
      evidenceDate: ANALYSIS.evidenceDate,
      fileUrl: 'https://storage.example/x.jpg',
      additionalScreenshotUrls: [],
      figures: [],
    });

    await persistScreenshotEvidence({
      images: [IMG_A, IMG_B],
      analysis: ANALYSIS,
      sourceUrl: SOURCE_URL,
      createdById: null,
    });

    const forwardOrderArg = mockHashFile.mock.calls[0][0] as Buffer;
    mockHashFile.mockClear();

    await persistScreenshotEvidence({
      images: [IMG_B, IMG_A],
      analysis: ANALYSIS,
      sourceUrl: SOURCE_URL,
      createdById: null,
    });

    const reverseOrderArg = mockHashFile.mock.calls[0][0] as Buffer;

    expect(forwardOrderArg.equals(reverseOrderArg)).toBe(false);
    expect(forwardOrderArg.equals(Buffer.concat([IMG_A.buffer, IMG_B.buffer]))).toBe(true);
    expect(reverseOrderArg.equals(Buffer.concat([IMG_B.buffer, IMG_A.buffer]))).toBe(true);
  });

  it('short-circuits on a duplicate hash without uploading or creating anything', async () => {
    mockHashFile.mockReturnValue('existing-hash');
    mockFindUnique.mockResolvedValue({
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
      additionalScreenshotUrls: ['https://storage.example/existing-2.jpg'],
    });

    const result = await persistScreenshotEvidence({
      images: [IMG_A],
      analysis: ANALYSIS,
      sourceUrl: SOURCE_URL,
      createdById: null,
    });

    expect(result.evidenceId).toBe('ev-existing');
    expect(result.message).toContain('already exists');
    expect(mockUploadEvidenceFile).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCreateManyKeyFigures).not.toHaveBeenCalled();
  });

  it('aborts the whole persist if any image upload fails — no Evidence row is created', async () => {
    mockHashFile.mockReturnValue('new-hash');
    mockFindUnique.mockResolvedValue(null);
    mockUploadEvidenceFile
      .mockResolvedValueOnce('https://storage.example/first.jpg')
      .mockRejectedValueOnce(new Error('Supabase Storage upload failed'));

    await expect(
      persistScreenshotEvidence({
        images: [IMG_A, IMG_B],
        analysis: ANALYSIS,
        sourceUrl: SOURCE_URL,
        createdById: null,
      }),
    ).rejects.toThrow('Supabase Storage upload failed');

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('sets the first image as fileUrl and the rest as additionalScreenshotUrls, in order', async () => {
    mockHashFile.mockReturnValue('new-hash');
    mockFindUnique.mockResolvedValue(null);
    mockUploadEvidenceFile
      .mockResolvedValueOnce('https://storage.example/first.jpg')
      .mockResolvedValueOnce('https://storage.example/second.png');
    mockCreate.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'ev-new',
        fileHash: data.fileHash,
        summary: ANALYSIS.summary,
        evidenceTier: ANALYSIS.evidenceTier,
        evidenceRole: ANALYSIS.evidenceRole,
        investigativeCategories: ANALYSIS.investigativeCategories,
        targetEntity: ANALYSIS.targetEntity,
        evidenceDate: ANALYSIS.evidenceDate,
        fileUrl: data.fileUrl,
        additionalScreenshotUrls: data.additionalScreenshotUrls,
        figures: ANALYSIS.keyFigures.map((name) => ({ name })),
      }),
    );

    const result = await persistScreenshotEvidence({
      images: [IMG_A, IMG_B],
      analysis: ANALYSIS,
      sourceUrl: SOURCE_URL,
      createdById: null,
    });

    expect(result.fileUrl).toBe('https://storage.example/first.jpg');
    expect(result.additionalScreenshotUrls).toEqual(['https://storage.example/second.png']);
    expect(mockCreate.mock.calls[0][0].data.status).toBe('PENDING_REVIEW');
    expect(mockCreate.mock.calls[0][0].data.sourceUrl).toBe(SOURCE_URL);
  });

  it('stamps createdById when provided, omits it when null', async () => {
    mockHashFile.mockReturnValue('new-hash');
    mockFindUnique.mockResolvedValue(null);
    mockUploadEvidenceFile.mockResolvedValue('https://storage.example/x.jpg');
    mockCreate.mockResolvedValue({
      id: 'ev-new',
      fileHash: 'new-hash',
      summary: ANALYSIS.summary,
      evidenceTier: ANALYSIS.evidenceTier,
      evidenceRole: ANALYSIS.evidenceRole,
      investigativeCategories: ANALYSIS.investigativeCategories,
      targetEntity: ANALYSIS.targetEntity,
      evidenceDate: ANALYSIS.evidenceDate,
      fileUrl: 'https://storage.example/x.jpg',
      additionalScreenshotUrls: [],
      figures: [],
    });

    await persistScreenshotEvidence({
      images: [IMG_A],
      analysis: ANALYSIS,
      sourceUrl: SOURCE_URL,
      createdById: 'researcher-1',
    });
    expect(mockCreate.mock.calls[0][0].data.createdById).toBe('researcher-1');

    await persistScreenshotEvidence({
      images: [IMG_A],
      analysis: ANALYSIS,
      sourceUrl: SOURCE_URL,
      createdById: null,
    });
    expect(mockCreate.mock.calls[1][0].data.createdById).toBeUndefined();
  });

  it('upserts KeyFigure records extracted from the analysis before creating Evidence', async () => {
    mockHashFile.mockReturnValue('new-hash');
    mockFindUnique.mockResolvedValue(null);
    mockUploadEvidenceFile.mockResolvedValue('https://storage.example/x.jpg');
    mockCreate.mockResolvedValue({
      id: 'ev-new',
      fileHash: 'new-hash',
      summary: ANALYSIS.summary,
      evidenceTier: ANALYSIS.evidenceTier,
      evidenceRole: ANALYSIS.evidenceRole,
      investigativeCategories: ANALYSIS.investigativeCategories,
      targetEntity: ANALYSIS.targetEntity,
      evidenceDate: ANALYSIS.evidenceDate,
      fileUrl: 'https://storage.example/x.jpg',
      additionalScreenshotUrls: [],
      figures: ANALYSIS.keyFigures.map((name) => ({ name })),
    });

    await persistScreenshotEvidence({
      images: [IMG_A],
      analysis: ANALYSIS,
      sourceUrl: SOURCE_URL,
      createdById: null,
    });

    expect(mockCreateManyKeyFigures).toHaveBeenCalledWith({
      data: [{ name: 'ד"ר שרון אלרוי-פריס' }],
      skipDuplicates: true,
    });
  });
});
