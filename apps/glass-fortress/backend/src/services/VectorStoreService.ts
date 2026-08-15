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

/** Outcome of the startup self-check — see VectorStoreService.healthCheck. */
export interface VectorStoreHealth {
  ok: boolean;
  /** Database objects this service needs but could not find. Empty when ok. */
  missing: string[];
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
   * Verifies that the database objects this service depends on actually exist.
   *
   * `evidence_embeddings` and `match_evidence` are reachable only from raw SQL —
   * neither is a Prisma model, so a database created with `prisma db push` will
   * not have them. searchSimilarEvidence swallows the resulting error and returns
   * an empty array, which is indistinguishable from "no similar evidence found".
   * That is how semantic search stayed broken in production unnoticed. This check
   * makes the failure loud at startup instead of silent forever.
   *
   * Static — deliberately needs no embedding model, so it costs no API call and
   * runs even when GEMINI_API_KEY is absent.
   */
  static async healthCheck(): Promise<VectorStoreHealth> {
    try {
      const [row] = await prisma.$queryRaw<Array<{ table_ok: boolean; function_ok: boolean }>>`
        SELECT
          to_regclass('evidence_embeddings') IS NOT NULL AS table_ok,
          EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'match_evidence') AS function_ok
      `;

      const missing: string[] = [];
      if (!row?.table_ok) missing.push('table evidence_embeddings');
      if (!row?.function_ok) missing.push('function match_evidence');

      return { ok: missing.length === 0, missing };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, missing: [`health query failed: ${message}`] };
    }
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
