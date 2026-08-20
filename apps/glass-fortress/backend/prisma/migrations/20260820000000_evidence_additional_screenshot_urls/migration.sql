-- Hand-written (not `prisma migrate dev --create-only`): this project's
-- pgvector table (`evidence_embeddings`, created raw-SQL in the baseline
-- migration) isn't modeled in schema.prisma, so Prisma's auto-diff proposes
-- dropping it. Written by hand to touch only the Evidence table, same
-- convention as 20260818000000_evidence_onchain_integrity and
-- 20260819000000_mcp_oauth_storage.

-- Screenshot 2..N when evidence was recovered from a page that needed
-- multiple captures. `fileUrl` always holds the first/primary capture; this
-- array holds the rest, in reading order. Additive, no backfill needed —
-- every existing row correctly gets the empty-array default.
ALTER TABLE "Evidence" ADD COLUMN "additionalScreenshotUrls" TEXT[] NOT NULL DEFAULT '{}';
