-- An append-only record of corrections to evidence summaries.
--
-- Purely additive: one new table and its two foreign keys. No column is dropped,
-- no constraint on an existing table changes, so this cannot fail on data.
--
-- The correction path it supports rewrites UrlVersionDiff.aiSignificance (the
-- source) and the Evidence.summary derived from it. Neither is part of the
-- evidence fileHash, which covers url + date + deletedText + addedText — the
-- change itself, deliberately not the prose. On-chain claims are untouched.

-- AlterTable
ALTER TABLE "UrlVersionDiff" ADD COLUMN     "summaryVersion" TEXT;

-- CreateTable
CREATE TABLE "SummaryCorrection" (
    "id" TEXT NOT NULL,
    "urlVersionDiffId" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "previousText" TEXT NOT NULL,
    "correctedText" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "correctedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SummaryCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SummaryCorrection_urlVersionDiffId_createdAt_idx" ON "SummaryCorrection"("urlVersionDiffId", "createdAt");

-- CreateIndex
CREATE INDEX "SummaryCorrection_fileHash_idx" ON "SummaryCorrection"("fileHash");

-- AddForeignKey
ALTER TABLE "SummaryCorrection" ADD CONSTRAINT "SummaryCorrection_urlVersionDiffId_fkey" FOREIGN KEY ("urlVersionDiffId") REFERENCES "UrlVersionDiff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SummaryCorrection" ADD CONSTRAINT "SummaryCorrection_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "Researcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

