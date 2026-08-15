-- CreateEnum
CREATE TYPE "ResearcherRole" AS ENUM ('RESEARCHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "WaybackJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TrackedUrlStatus" AS ENUM ('IDLE', 'SCANNING', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('DOCUMENT', 'FORENSIC_DIFF');

-- CreateEnum
CREATE TYPE "ThesisVersionStatus" AS ENUM ('PENDING_AI', 'COMPLETE');

-- CreateEnum
CREATE TYPE "MentionType" AS ENUM ('KEY_FIGURE', 'EVIDENCE', 'TRACKED_URL');

-- CreateEnum
CREATE TYPE "ResearchSessionStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ResearchSessionEventType" AS ENUM ('SESSION_STARTED', 'VERSION_CREATED', 'GAP_RESOLVED', 'AI_ANALYSIS_RUN', 'NOTE', 'SESSION_CLOSED');

-- CreateTable
CREATE TABLE "Researcher" (
    "id" TEXT NOT NULL,
    "supabaseUserId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "role" "ResearcherRole" NOT NULL DEFAULT 'RESEARCHER',
    "mcpTokenHash" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Researcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedUrl" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "status" "TrackedUrlStatus" NOT NULL DEFAULT 'IDLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedUrl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrlSnapshot" (
    "id" TEXT NOT NULL,
    "trackedUrlId" TEXT NOT NULL,
    "waybackTimestamp" TEXT NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "snapshotUrl" TEXT NOT NULL,
    "fullText" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "onChainTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UrlSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaybackScrapeJob" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "WaybackJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalSnapshots" INTEGER NOT NULL DEFAULT 0,
    "processedSnapshots" INTEGER NOT NULL DEFAULT 0,
    "snapshotsList" TEXT NOT NULL DEFAULT '[]',
    "trackedUrlId" TEXT NOT NULL,
    "fromDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaybackScrapeJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrlVersionDiff" (
    "id" TEXT NOT NULL,
    "trackedUrlId" TEXT NOT NULL,
    "beforeDate" TEXT NOT NULL,
    "afterDate" TEXT NOT NULL,
    "snapshotUrl" TEXT NOT NULL,
    "deletedText" TEXT NOT NULL DEFAULT '[]',
    "addedText" TEXT NOT NULL DEFAULT '[]',
    "rawDeletedText" TEXT NOT NULL DEFAULT '[]',
    "rawAddedText" TEXT NOT NULL DEFAULT '[]',
    "aiSignificance" TEXT NOT NULL DEFAULT '',
    "isLegallySignificant" BOOLEAN NOT NULL DEFAULT false,
    "beforeSnapshotId" TEXT,
    "afterSnapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UrlVersionDiff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyFigure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeyFigure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Whistleblower" (
    "id" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "encryptedContact" TEXT NOT NULL,
    "consentGiven" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Whistleblower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'CONFIRMED',
    "evidenceType" "EvidenceType" NOT NULL DEFAULT 'DOCUMENT',
    "evidenceRole" TEXT NOT NULL DEFAULT 'Incriminating',
    "category" TEXT NOT NULL,
    "targetEntity" TEXT NOT NULL,
    "evidenceTier" TEXT NOT NULL,
    "evidencePerspective" TEXT,
    "tierReasoning" TEXT,
    "summary" TEXT NOT NULL,
    "evidenceDate" TEXT NOT NULL,
    "medicalConditions" TEXT NOT NULL,
    "statisticalClaims" TEXT NOT NULL DEFAULT '[]',
    "regulatoryMentions" TEXT NOT NULL DEFAULT '[]',
    "euaOmissionStatus" TEXT NOT NULL DEFAULT 'Not Applicable',
    "sourceUrl" TEXT,
    "fileUrl" TEXT,
    "ipfsCid" TEXT,
    "urlVersionDiffId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thesis" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "headVersionId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisVersion" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "userContent" JSONB NOT NULL,
    "aiAnalysis" JSONB,
    "contentHash" TEXT NOT NULL,
    "status" "ThesisVersionStatus" NOT NULL DEFAULT 'PENDING_AI',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThesisVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisGapResolution" (
    "id" TEXT NOT NULL,
    "thesisVersionId" TEXT NOT NULL,
    "gapIndex" INTEGER NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThesisGapResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisMention" (
    "id" TEXT NOT NULL,
    "thesisVersionId" TEXT NOT NULL,
    "type" "MentionType" NOT NULL,
    "refId" TEXT NOT NULL,

    CONSTRAINT "ThesisMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSession" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ResearchSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ResearchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSessionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "ResearchSessionEventType" NOT NULL,
    "description" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchSessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_EvidenceToKeyFigure" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Researcher_supabaseUserId_key" ON "Researcher"("supabaseUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Researcher_handle_key" ON "Researcher"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedUrl_url_key" ON "TrackedUrl"("url");

-- CreateIndex
CREATE UNIQUE INDEX "UrlSnapshot_trackedUrlId_waybackTimestamp_key" ON "UrlSnapshot"("trackedUrlId", "waybackTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "WaybackScrapeJob_trackedUrlId_key" ON "WaybackScrapeJob"("trackedUrlId");

-- CreateIndex
CREATE UNIQUE INDEX "KeyFigure_name_key" ON "KeyFigure"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Whistleblower_fileHash_key" ON "Whistleblower"("fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_fileHash_key" ON "Evidence"("fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "Thesis_headVersionId_key" ON "Thesis"("headVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ThesisGapResolution_thesisVersionId_gapIndex_key" ON "ThesisGapResolution"("thesisVersionId", "gapIndex");

-- CreateIndex
CREATE UNIQUE INDEX "_EvidenceToKeyFigure_AB_unique" ON "_EvidenceToKeyFigure"("A", "B");

-- CreateIndex
CREATE INDEX "_EvidenceToKeyFigure_B_index" ON "_EvidenceToKeyFigure"("B");

-- AddForeignKey
ALTER TABLE "UrlSnapshot" ADD CONSTRAINT "UrlSnapshot_trackedUrlId_fkey" FOREIGN KEY ("trackedUrlId") REFERENCES "TrackedUrl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaybackScrapeJob" ADD CONSTRAINT "WaybackScrapeJob_trackedUrlId_fkey" FOREIGN KEY ("trackedUrlId") REFERENCES "TrackedUrl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UrlVersionDiff" ADD CONSTRAINT "UrlVersionDiff_trackedUrlId_fkey" FOREIGN KEY ("trackedUrlId") REFERENCES "TrackedUrl"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UrlVersionDiff" ADD CONSTRAINT "UrlVersionDiff_beforeSnapshotId_fkey" FOREIGN KEY ("beforeSnapshotId") REFERENCES "UrlSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UrlVersionDiff" ADD CONSTRAINT "UrlVersionDiff_afterSnapshotId_fkey" FOREIGN KEY ("afterSnapshotId") REFERENCES "UrlSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_urlVersionDiffId_fkey" FOREIGN KEY ("urlVersionDiffId") REFERENCES "UrlVersionDiff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Researcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_headVersionId_fkey" FOREIGN KEY ("headVersionId") REFERENCES "ThesisVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Researcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisVersion" ADD CONSTRAINT "ThesisVersion_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisVersion" ADD CONSTRAINT "ThesisVersion_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "ThesisVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisVersion" ADD CONSTRAINT "ThesisVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Researcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisGapResolution" ADD CONSTRAINT "ThesisGapResolution_thesisVersionId_fkey" FOREIGN KEY ("thesisVersionId") REFERENCES "ThesisVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisGapResolution" ADD CONSTRAINT "ThesisGapResolution_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("fileHash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisMention" ADD CONSTRAINT "ThesisMention_thesisVersionId_fkey" FOREIGN KEY ("thesisVersionId") REFERENCES "ThesisVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSession" ADD CONSTRAINT "ResearchSession_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSessionEvent" ADD CONSTRAINT "ResearchSessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ResearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EvidenceToKeyFigure" ADD CONSTRAINT "_EvidenceToKeyFigure_A_fkey" FOREIGN KEY ("A") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EvidenceToKeyFigure" ADD CONSTRAINT "_EvidenceToKeyFigure_B_fkey" FOREIGN KEY ("B") REFERENCES "KeyFigure"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- pgvector semantic search.
--
-- Not expressible in schema.prisma: `evidence_embeddings` is reached only via
-- raw SQL from VectorStoreService, so `prisma db push` never created it. This
-- is why semantic search silently returned no results — `match_evidence`
-- existed but its backing table did not, and searchSimilarEvidence swallows
-- the resulting error.
--
-- Dimension is 3072: the output width of gemini-embedding-001 at its default
-- outputDimensionality. That is above pgvector's 2000-dimension limit for
-- ivfflat/hnsw, so there is deliberately no ANN index here — lookups are exact
-- sequential scans, which is both faster and more accurate at this corpus
-- size. Adding an index later requires reducing outputDimensionality in
-- VectorStoreService and re-embedding every row.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS evidence_embeddings (
    "id"        TEXT NOT NULL,
    "content"   TEXT NOT NULL,
    "embedding" vector(3072) NOT NULL,

    CONSTRAINT "evidence_embeddings_pkey" PRIMARY KEY ("id")
);

CREATE OR REPLACE FUNCTION match_evidence(query_embedding vector, match_count integer DEFAULT 5)
RETURNS TABLE(id text, content text, similarity double precision)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    e.id,
    e.content,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM evidence_embeddings e
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$function$;
