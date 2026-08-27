-- CreateEnum
CREATE TYPE "MissionVerdict" AS ENUM ('ON_MISSION', 'OFF_MISSION', 'UNCLEAR');

-- CreateEnum
CREATE TYPE "AssessmentAuthor" AS ENUM ('MODEL', 'HUMAN');

-- CreateTable
CREATE TABLE "ScanRelevanceAssessment" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "verdict" "MissionVerdict" NOT NULL,
    "reason" TEXT NOT NULL,
    "author" "AssessmentAuthor" NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL,
    "model" TEXT,
    "agentVersion" TEXT,
    "promptHash" TEXT,
    "contentChars" INTEGER,
    "contentTruncated" BOOLEAN,
    "actorId" TEXT,
    "submitterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanRelevanceAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanRelevanceAssessment_url_assessedAt_idx" ON "ScanRelevanceAssessment"("url", "assessedAt");

-- CreateIndex
CREATE INDEX "ScanRelevanceAssessment_verdict_assessedAt_idx" ON "ScanRelevanceAssessment"("verdict", "assessedAt");


-- Provenance completeness, enforced by the DATABASE rather than by one language.
--
-- The write path takes a discriminated union, so an incomplete MODEL assessment
-- is unconstructable in TypeScript. That is a check in one language guarding a
-- table any other path can write — a script, a console, a future service. The
-- hierarchy this project follows says constraint over check, and it is the same
-- reasoning that put NOT NULL on UrlSnapshot.document instead of a metric
-- counting rows that lacked one.
--
-- Prisma cannot declare a CHECK, so this is hand-written and lives only here.
-- Prisma's introspection does not represent CHECK constraints, so db:check-drift
-- will not see it and cannot propose dropping it.
ALTER TABLE "ScanRelevanceAssessment"
  ADD CONSTRAINT "ScanRelevanceAssessment_provenance_complete" CHECK (
    (
      "author" = 'MODEL'
      AND "model" IS NOT NULL
      AND "agentVersion" IS NOT NULL
      AND "promptHash" IS NOT NULL
      AND "contentChars" IS NOT NULL
      AND "contentTruncated" IS NOT NULL
    )
    OR (
      "author" = 'HUMAN'
      AND "actorId" IS NOT NULL
    )
  );
