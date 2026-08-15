import { VectorStoreService } from '../src/services/VectorStoreService';
import { prisma } from '../src/lib/prisma';

// ---------------------------------------------------------------------------
// Mock dependencies — no real DB or embedding API calls
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

const mockEmbedDocuments = jest.fn();
jest.mock('@langchain/google-genai', () => ({
  GoogleGenerativeAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedDocuments: mockEmbedDocuments,
  })),
}));

const queryRaw = prisma.$queryRaw as unknown as jest.Mock;
const executeRaw = prisma.$executeRaw as unknown as jest.Mock;

describe('VectorStoreService', () => {
  beforeEach(() => {
    mockEmbedDocuments.mockResolvedValue([[0.1, 0.2, 0.3]]);
  });

  // -------------------------------------------------------------------------
  // healthCheck — the guard against the failure mode that hid in production:
  // match_evidence existed, evidence_embeddings did not, and every search
  // silently returned []. Neither object is a Prisma model, so `db push`
  // never creates them.
  // -------------------------------------------------------------------------
  describe('healthCheck', () => {
    it('reports ok when both the table and the function exist', async () => {
      queryRaw.mockResolvedValue([{ table_ok: true, function_ok: true }]);

      await expect(VectorStoreService.healthCheck()).resolves.toEqual({
        ok: true,
        missing: [],
      });
    });

    it('reports the missing table — the exact production failure', async () => {
      queryRaw.mockResolvedValue([{ table_ok: false, function_ok: true }]);

      const health = await VectorStoreService.healthCheck();

      expect(health.ok).toBe(false);
      expect(health.missing).toEqual(['table evidence_embeddings']);
    });

    it('reports the missing function', async () => {
      queryRaw.mockResolvedValue([{ table_ok: true, function_ok: false }]);

      const health = await VectorStoreService.healthCheck();

      expect(health.ok).toBe(false);
      expect(health.missing).toEqual(['function match_evidence']);
    });

    it('reports both when the database is entirely unmigrated', async () => {
      queryRaw.mockResolvedValue([{ table_ok: false, function_ok: false }]);

      const health = await VectorStoreService.healthCheck();

      expect(health.ok).toBe(false);
      expect(health.missing).toHaveLength(2);
    });

    it('fails closed when the health query itself throws', async () => {
      queryRaw.mockRejectedValue(new Error('connection refused'));

      const health = await VectorStoreService.healthCheck();

      expect(health.ok).toBe(false);
      expect(health.missing[0]).toContain('connection refused');
    });

    it('fails closed when the query returns no rows', async () => {
      queryRaw.mockResolvedValue([]);

      const health = await VectorStoreService.healthCheck();

      expect(health.ok).toBe(false);
      expect(health.missing).toHaveLength(2);
    });

    it('costs no embedding API call', async () => {
      queryRaw.mockResolvedValue([{ table_ok: true, function_ok: true }]);

      await VectorStoreService.healthCheck();

      expect(mockEmbedDocuments).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // upsertEvidence
  // -------------------------------------------------------------------------
  describe('upsertEvidence', () => {
    it('embeds the text and writes it keyed by fileHash', async () => {
      executeRaw.mockResolvedValue(1);
      const service = await VectorStoreService.create();

      await service.upsertEvidence('some evidence text', 'hash-abc');

      expect(mockEmbedDocuments).toHaveBeenCalledWith(['some evidence text']);
      expect(executeRaw).toHaveBeenCalledTimes(1);

      // Prisma tagged-template call: values follow the template strings array.
      const values = executeRaw.mock.calls[0].slice(1);
      expect(values).toContain('hash-abc');
      expect(values).toContain('some evidence text');
      expect(values).toContain('[0.1,0.2,0.3]');
    });

    it('propagates write failures rather than swallowing them', async () => {
      executeRaw.mockRejectedValue(new Error('relation "evidence_embeddings" does not exist'));
      const service = await VectorStoreService.create();

      await expect(service.upsertEvidence('text', 'hash')).rejects.toThrow(
        'relation "evidence_embeddings" does not exist',
      );
    });
  });

  // -------------------------------------------------------------------------
  // searchSimilarEvidence
  // -------------------------------------------------------------------------
  describe('searchSimilarEvidence', () => {
    it('maps match_evidence rows onto VectorSearchResult', async () => {
      queryRaw.mockResolvedValue([
        { id: 'hash-1', content: 'first', similarity: 0.91 },
        { id: 'hash-2', content: 'second', similarity: 0.72 },
      ]);
      const service = await VectorStoreService.create();

      const results = await service.searchSimilarEvidence('query text');

      expect(results).toEqual([
        { fileHash: 'hash-1', content: 'first', score: 0.91 },
        { fileHash: 'hash-2', content: 'second', score: 0.72 },
      ]);
    });

    it('degrades to an empty array when the query fails', async () => {
      queryRaw.mockRejectedValue(new Error('function match_evidence does not exist'));
      const service = await VectorStoreService.create();

      // Graceful degradation is intentional — callers treat the vector store as
      // optional. healthCheck is what stops this being invisible; asserted here
      // so the swallow stays deliberate rather than accidental.
      await expect(service.searchSimilarEvidence('query text')).resolves.toEqual([]);
    });

    it('passes the caller limit through to match_evidence', async () => {
      queryRaw.mockResolvedValue([]);
      const service = await VectorStoreService.create();

      await service.searchSimilarEvidence('query text', 12);

      expect(queryRaw.mock.calls[0].slice(1)).toContain(12);
    });
  });
});
