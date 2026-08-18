-- Evidence on-chain integrity fix.
--
-- Previously `Evidence.status` was the only signal for on-chain state, with no
-- column to hold proof (unlike UrlSnapshot.onChainTxHash), and defaulted to
-- CONFIRMED — failing open, not closed. A background auto-promote path was
-- found writing CONFIRMED without ever registering on-chain. Separately,
-- Evidence<->UrlVersionDiff was an unenforced to-many relation (only an
-- application-level check in POST /forensics/promote prevented duplicates).
-- Full incident + plan: docs/gf-evidence-integrity-dev-plan.md.
--
-- Hand-written (not `prisma migrate dev --create-only`): this project's
-- pgvector table (`evidence_embeddings`, created raw-SQL in the baseline
-- migration) isn't modeled in schema.prisma, so Prisma's auto-diff proposes
-- dropping it. Written by hand to touch only the Evidence table.

ALTER TABLE "Evidence" ADD COLUMN "onChainTxHash" TEXT;

ALTER TABLE "Evidence" ALTER COLUMN "status" SET DEFAULT 'PENDING_REVIEW';

-- Unique index (not a NOT NULL constraint) — most Evidence rows have no
-- urlVersionDiffId at all (DOCUMENT-type), and Postgres unique indexes permit
-- multiple NULLs, which is exactly the semantics needed here.
CREATE UNIQUE INDEX "Evidence_urlVersionDiffId_key" ON "Evidence"("urlVersionDiffId");
