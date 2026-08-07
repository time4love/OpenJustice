import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { PineconeStore } from '@langchain/pinecone';
import { Document } from '@langchain/core/documents';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvidenceMetadata {
  fileHash: string;
  category: string;
  tier: string;
  summary: string;
  targetEntity: string;
  evidenceDate: string;
  keyFigures: string[];
  medicalConditions: string[];
  submitterAddress?: string;
  timestamp: number;
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
      model: 'text-embedding-004',
      apiKey: process.env['GEMINI_API_KEY'],
    });

    const store = await PineconeStore.fromExistingIndex(embeddings, { pineconeIndex });

    return new VectorStoreService(store);
  }

  /**
   * Embed the evidence text and upsert it into the vector store.
   * Uses `fileHash` as the document ID so re-submitting the same evidence
   * is idempotent (Pinecone will overwrite, matching on-chain dedup logic).
   *
   * @param text      Full text content to embed.
   * @param metadata  Structured metadata stored alongside the vector.
   */
  async upsertEvidence(text: string, metadata: EvidenceMetadata): Promise<void> {
    const doc = new Document({
      pageContent: text,
      metadata,
    });

    // Use fileHash as the Pinecone vector ID for idempotent upserts
    await this.store.addDocuments([doc], { ids: [metadata.fileHash] });

    console.log(
      `[VectorStoreService] Upserted evidence | hash: ${metadata.fileHash} | tier: ${metadata.tier}`,
    );
  }

  /**
   * Retrieve evidence sorted chronologically by evidenceDate (ascending).
   *
   * Pinecone's free tier does not support server-side ordering by metadata,
   * so we fetch up to 100 records with a broad query and sort in-memory.
   * Records with evidenceDate "Unknown" are placed at the end.
   *
   * @param targetEntity  Optional filter — only return evidence for this entity.
   */
  async getTimeline(
    targetEntity?: string,
  ): Promise<Array<{ content: string; metadata: EvidenceMetadata; score?: number }>> {
    const filter: Record<string, unknown> | undefined = targetEntity
      ? { targetEntity: { $eq: targetEntity } }
      : undefined;

    // Broad semantic query to retrieve a representative corpus
    const results = await this.store.similaritySearchWithScore(
      'Covid-19 policy evidence legal timeline',
      100,
      filter,
    );

    const docs = results.map(([doc, score]) => ({
      content: doc.pageContent,
      metadata: doc.metadata as EvidenceMetadata,
      score,
    }));

    // Sort chronologically ascending; "Unknown" dates sort to the end
    docs.sort((a, b) => {
      const dateA = a.metadata.evidenceDate;
      const dateB = b.metadata.evidenceDate;
      if (dateA === 'Unknown' && dateB === 'Unknown') return 0;
      if (dateA === 'Unknown') return 1;
      if (dateB === 'Unknown') return -1;
      return dateA.localeCompare(dateB);
    });

    return docs;
  }

  /**
   * Embed the query and retrieve the most semantically similar evidence records.
   *
   * @param query  Natural language search query.
   * @param limit  Maximum number of results to return (default: 5).
   * @returns      Array of matched documents with their metadata.
   */
  async searchSimilarEvidence(
    query: string,
    limit: number = 5,
    filter?: Record<string, unknown>,
  ): Promise<Array<{ content: string; metadata: EvidenceMetadata; score?: number }>> {
    const results = await this.store.similaritySearchWithScore(query, limit, filter);

    return results.map(([doc, score]) => ({
      content: doc.pageContent,
      metadata: doc.metadata as EvidenceMetadata,
      score,
    }));
  }
}
