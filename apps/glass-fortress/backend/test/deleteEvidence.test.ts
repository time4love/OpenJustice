const mockDeleteEvidenceFiles = jest.fn();
jest.mock('../src/services/StorageService', () => ({
  StorageService: jest.fn().mockImplementation(() => ({
    deleteEvidenceFiles: mockDeleteEvidenceFiles,
  })),
}));

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    evidence: {
      delete: jest.fn(),
    },
    thesisMention: {
      count: jest.fn(),
    },
  },
}));

import type { Evidence } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { deleteEvidence } from '../src/services/deleteEvidence';

const mockEvidenceDelete = prisma.evidence.delete as jest.Mock;
const mockThesisMentionCount = prisma.thesisMention.count as jest.Mock;

function makeRecord(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 'ev-1',
    fileHash: '0xabc',
    status: 'PENDING_REVIEW',
    fileUrl: 'https://storage.example/evidence/a.jpg',
    additionalScreenshotUrls: ['https://storage.example/evidence/b.jpg'],
    ipfsCid: null,
    // Fields below are irrelevant to deleteEvidence's logic — present only
    // to satisfy the Evidence type.
    evidenceType: 'DOCUMENT',
    evidenceRole: 'Incriminating',
    investigativeCategories: [],
    targetEntity: 'Unknown',
    evidenceTier: 'Tier 4: Anecdotal',
    evidencePerspective: null,
    tierReasoning: null,
    summary: 'summary',
    evidenceDate: 'Unknown',
    medicalConditions: '[]',
    statisticalClaims: '[]',
    regulatoryMentions: '[]',
    euaOmissionStatus: 'Not Applicable',
    sourceUrl: null,
    urlVersionDiffId: null,
    onChainTxHash: null,
    createdById: null,
    createdAt: new Date(),
    ...overrides,
  } as Evidence;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockThesisMentionCount.mockResolvedValue(0);
});

describe('deleteEvidence', () => {
  it('deletes storage files then the Prisma row for a clean PENDING_REVIEW record', async () => {
    const record = makeRecord();
    mockDeleteEvidenceFiles.mockResolvedValue(undefined);
    mockEvidenceDelete.mockResolvedValue(record);

    const result = await deleteEvidence(record);

    expect(result.deleted).toBe(true);
    expect(mockDeleteEvidenceFiles).toHaveBeenCalledWith([
      'https://storage.example/evidence/a.jpg',
      'https://storage.example/evidence/b.jpg',
    ]);
    expect(mockEvidenceDelete).toHaveBeenCalledWith({ where: { id: 'ev-1' } });
  });

  it('deletes the Prisma row without calling StorageService when there are no files', async () => {
    const record = makeRecord({ fileUrl: null, additionalScreenshotUrls: [] });
    mockEvidenceDelete.mockResolvedValue(record);

    const result = await deleteEvidence(record);

    expect(result.deleted).toBe(true);
    expect(mockDeleteEvidenceFiles).not.toHaveBeenCalled();
  });

  it('refuses to delete a CONFIRMED record without touching storage or the DB', async () => {
    const record = makeRecord({ status: 'CONFIRMED' });

    const result = await deleteEvidence(record);

    expect(result.deleted).toBe(false);
    expect(result.message).toContain('CONFIRMED');
    expect(mockDeleteEvidenceFiles).not.toHaveBeenCalled();
    expect(mockEvidenceDelete).not.toHaveBeenCalled();
  });

  it('refuses to delete a record with a non-null ipfsCid', async () => {
    const record = makeRecord({ ipfsCid: 'bafy-some-real-looking-cid' });

    const result = await deleteEvidence(record);

    expect(result.deleted).toBe(false);
    expect(result.message).toContain('IPFS pin');
    expect(result.message).toContain('bafy-some-real-looking-cid');
    expect(mockDeleteEvidenceFiles).not.toHaveBeenCalled();
    expect(mockEvidenceDelete).not.toHaveBeenCalled();
  });

  it('refuses to delete a record still cited by a thesis', async () => {
    const record = makeRecord();
    mockThesisMentionCount.mockResolvedValue(2);

    const result = await deleteEvidence(record);

    expect(result.deleted).toBe(false);
    expect(result.message).toContain('cited by 2 thesis mention');
    expect(mockDeleteEvidenceFiles).not.toHaveBeenCalled();
    expect(mockEvidenceDelete).not.toHaveBeenCalled();
  });

  it('checks citations by fileHash, scoped to EVIDENCE-type mentions', async () => {
    const record = makeRecord({ fileHash: '0xdeadbeef' });
    mockEvidenceDelete.mockResolvedValue(record);

    await deleteEvidence(record);

    expect(mockThesisMentionCount).toHaveBeenCalledWith({
      where: { type: 'EVIDENCE', refId: '0xdeadbeef' },
    });
  });

  it('propagates a StorageService deletion failure without deleting the Prisma row', async () => {
    const record = makeRecord();
    mockDeleteEvidenceFiles.mockRejectedValue(new Error('Supabase Storage delete failed'));

    await expect(deleteEvidence(record)).rejects.toThrow('Supabase Storage delete failed');
    expect(mockEvidenceDelete).not.toHaveBeenCalled();
  });
});
