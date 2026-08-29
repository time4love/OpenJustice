-- LEVEL 3a — a check that runs and is not recorded has not been performed.
--
-- §3 of docs/gf-factual-layer-rebuild-dev-plan.md. The on-chain check existed
-- only as an MCP tool, so the platform's claim that a hash is anchored was
-- asserted and verified only when a human remembered to ask. This table is
-- where the write path's verdict lands, with the two provenance columns that
-- make it re-checkable rather than merely present.
--
-- PURELY ADDITIVE: three new enum types, one new table, two indexes. It reads
-- nothing and drops nothing, so it cannot lose a row of any existing table.

-- CreateEnum
CREATE TYPE "IntegrityCheckVerdict" AS ENUM ('VERIFIED', 'CONTRADICTED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "IntegrityCheckSubject" AS ENUM ('EVIDENCE', 'URL_SNAPSHOT');

-- CreateEnum
CREATE TYPE "IntegrityCheckType" AS ENUM ('ON_CHAIN_ANCHOR');

-- CreateTable
CREATE TABLE "IntegrityCheck" (
    "id" TEXT NOT NULL,
    "subjectType" "IntegrityCheckSubject" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "checkType" "IntegrityCheckType" NOT NULL,
    "verdict" "IntegrityCheckVerdict" NOT NULL,
    "detail" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifierVersion" TEXT NOT NULL,
    "sourceStateHash" TEXT NOT NULL,

    CONSTRAINT "IntegrityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrityCheck_subjectType_subjectId_checkType_checkedAt_idx" ON "IntegrityCheck"("subjectType", "subjectId", "checkType", "checkedAt");

-- CreateIndex
CREATE INDEX "IntegrityCheck_checkType_verdict_checkedAt_idx" ON "IntegrityCheck"("checkType", "verdict", "checkedAt");
