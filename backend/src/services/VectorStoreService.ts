import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { PineconeStore } from '@langchain/pinecone';
import { Document } from '@langchain/core/documents';

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
// VectorStoreService
// ---------------------------------------------------------------------------

export class VectorStoreService {
  private constructor(private readonly store: PineconeStore) {}

  /**
   * Async factory — initialises the Pinecone client and connects to the
   * existing index. Call once and reuse the instance.
   */
  static async create(): Promise<VectorStoreService> {
    const apiKey = process.env['PINECONE_API_KEY'];
    const indexName = process.env['PINECONE_INDEX'];

    if (!apiKey) throw new Error('PINECONE_API_KEY environment variable is not set.');
    if (!indexName) throw new Error('PINECONE_INDEX environment variable is not set.');

    const pinecone = new Pinecone({ apiKey });
    const pineconeIndex = pinecone.Index(indexName);

    const embeddings = new GoogleGenerativeAIEmbeddings({
      model: process.env['GOOGLE_EMBEDDING_MODEL'] ?? 'gemini-embedding-001',
      apiKey: process.env['GEMINI_API_KEY'],
    });

    const store = await PineconeStore.fromExistingIndex(embeddings, { pineconeIndex });

    return new VectorStoreService(store);
  }

  /**
   * Embed the evidence summary and upsert it into Pinecone.
   * Stores ONLY the fileHash in metadata — all structured fields live in Prisma.
   * Uses `fileHash` as the vector ID for idempotent upserts.
   *
   * @param text      Summary text to embed.
   * @param fileHash  SHA-256 hex hash — used as both vector ID and the only metadata field.
   */
  async upsertEvidence(text: string, fileHash: string): Promise<void> {
    const doc = new Document({
      pageContent: text,
      metadata: { fileHash },
    });

    await this.store.addDocuments([doc], { ids: [fileHash] });

    console.log(`[VectorStoreService] Upserted embedding | hash: ${fileHash}`);
  }

  /**
   * Embed the query and retrieve the most semantically similar evidence records.
   * Returns only fileHash + content — callers must enrich from Prisma for full metadata.
   *
   * @param query  Natural language search query.
   * @param limit  Maximum number of results to return (default: 5).
   */
  async searchSimilarEvidence(
    query: string,
    limit: number = 5,
  ): Promise<VectorSearchResult[]> {
    try {
      const results = await this.store.similaritySearchWithScore(query, limit);
      return results.map(([doc, score]) => ({
        fileHash: (doc.metadata as { fileHash: string }).fileHash,
        content: doc.pageContent,
        score,
      }));
    } catch (err) {
      console.error('[VectorStoreService] searchSimilarEvidence error:', err instanceof Error ? err.message : err);
      return [];
    }
  }
}
