import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { prisma } from '../lib/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a single semantic search result returned to callers. */
export interface VectorSearchResult {
  fileHash: string;
  content: string;
  score?: number;
}

// ---------------------------------------------------------------------------
// VectorStoreService — backed by Supabase pgvector via Prisma raw queries
// ---------------------------------------------------------------------------

export class VectorStoreService {
  private constructor(private readonly embeddings: GoogleGenerativeAIEmbeddings) {}

  /**
   * Async factory — initialises the embedding model.
   * Uses the existing Prisma connection for all DB access (no extra credentials needed).
   */
  static async create(): Promise<VectorStoreService> {
    const embeddings = new GoogleGenerativeAIEmbeddings({
      model: process.env['GOOGLE_EMBEDDING_MODEL'] ?? 'gemini-embedding-001',
      apiKey: process.env['GEMINI_API_KEY'],
    });
    return new VectorStoreService(embeddings);
  }

  /**
   * Embed the text and upsert into evidence_embeddings.
   * Idempotent — uses fileHash as primary key.
   */
  async upsertEvidence(text: string, fileHash: string): Promise<void> {
    const [vector] = await this.embeddings.embedDocuments([text]);
    const vectorLiteral = `[${vector.join(',')}]`;

    await prisma.$executeRaw`
      INSERT INTO evidence_embeddings (id, content, embedding)
      VALUES (${fileHash}, ${text}, ${vectorLiteral}::vector)
      ON CONFLICT (id) DO UPDATE
        SET content   = EXCLUDED.content,
            embedding = EXCLUDED.embedding
    `;

    console.log(`[VectorStoreService] Upserted embedding | hash: ${fileHash}`);
  }

  /**
   * Embed the query and return the most semantically similar evidence records.
   * Returns only fileHash + content — callers enrich from Prisma for full metadata.
   */
  async searchSimilarEvidence(query: string, limit = 5): Promise<VectorSearchResult[]> {
    try {
      const [vector] = await this.embeddings.embedDocuments([query]);
      const vectorLiteral = `[${vector.join(',')}]`;

      const rows = await prisma.$queryRaw<Array<{ id: string; content: string; similarity: number }>>`
        SELECT id, content, similarity
        FROM match_evidence(${vectorLiteral}::vector, ${limit}::int)
      `;

      return rows.map((r) => ({ fileHash: r.id, content: r.content, score: r.similarity }));
    } catch (err) {
      console.error('[VectorStoreService] searchSimilarEvidence error:', err instanceof Error ? err.message : err);
      return [];
    }
  }
}
