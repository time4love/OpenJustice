jest.mock('../src/lib/prisma', () => ({
  prisma: {
    evidence: { findUnique: jest.fn() },
  },
}));

const mockDeleteEvidence = jest.fn();
jest.mock('../src/services/deleteEvidence', () => ({
  deleteEvidence: (...args: unknown[]) => mockDeleteEvidence(...args),
}));

import { prisma } from '../src/lib/prisma';
import { deleteEvidenceHandler } from '../src/mcp/tools/deleteEvidence';

const mockFindUnique = prisma.evidence.findUnique as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('deleteEvidenceHandler', () => {
  it('returns an error when no evidence exists for the given id', async () => {
    mockFindUnique.mockResolvedValue(null);

    const raw = await deleteEvidenceHandler({ evidenceId: 'missing-id' });
    const result = JSON.parse(raw);

    expect(result.error).toContain('missing-id');
    expect(mockDeleteEvidence).not.toHaveBeenCalled();
  });

  it('looks up by id and delegates to the shared deleteEvidence service', async () => {
    const record = { id: 'ev-1', fileHash: '0xabc', status: 'PENDING_REVIEW' };
    mockFindUnique.mockResolvedValue(record);
    mockDeleteEvidence.mockResolvedValue({ deleted: true, evidenceId: 'ev-1', fileHash: '0xabc', message: 'Evidence permanently deleted.' });

    const raw = await deleteEvidenceHandler({ evidenceId: 'ev-1' });
    const result = JSON.parse(raw);

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'ev-1' } });
    expect(mockDeleteEvidence).toHaveBeenCalledWith(record);
    expect(result.deleted).toBe(true);
  });

  it('passes through a refusal result from the shared service unchanged', async () => {
    const record = { id: 'ev-1', fileHash: '0xabc', status: 'CONFIRMED' };
    mockFindUnique.mockResolvedValue(record);
    mockDeleteEvidence.mockResolvedValue({
      deleted: false,
      evidenceId: 'ev-1',
      fileHash: '0xabc',
      message: 'Refusing to delete: status is CONFIRMED, not PENDING_REVIEW.',
    });

    const raw = await deleteEvidenceHandler({ evidenceId: 'ev-1' });
    const result = JSON.parse(raw);

    expect(result.deleted).toBe(false);
    expect(result.message).toContain('CONFIRMED');
  });
});
