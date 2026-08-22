-- CreateEnum
CREATE TYPE "PromotionAssessmentVerdict" AS ENUM ('SUPPORTS', 'DISPUTES');

-- CreateEnum
CREATE TYPE "DiffDebateStatus" AS ENUM ('OPEN', 'PROMOTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "DiffDebateEventType" AS ENUM ('DEBATE_OPENED', 'RATIONALE_SUBMITTED', 'ASSESSMENT_RETURNED', 'RESPONSE_SUBMITTED', 'PROMOTED', 'ABANDONED');

-- CreateTable
CREATE TABLE "DiffDebateSession" (
    "id" TEXT NOT NULL,
    "urlVersionDiffId" TEXT NOT NULL,
    "status" "DiffDebateStatus" NOT NULL DEFAULT 'OPEN',
    "verdict" "PromotionAssessmentVerdict",
    "hasSubstance" BOOLEAN NOT NULL DEFAULT false,
    "evidenceId" TEXT,
    "promotedOverObjection" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "DiffDebateSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiffDebateEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "DiffDebateEventType" NOT NULL,
    "content" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiffDebateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiffDebateSession_evidenceId_key" ON "DiffDebateSession"("evidenceId");

-- AddForeignKey
ALTER TABLE "DiffDebateSession" ADD CONSTRAINT "DiffDebateSession_urlVersionDiffId_fkey" FOREIGN KEY ("urlVersionDiffId") REFERENCES "UrlVersionDiff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiffDebateSession" ADD CONSTRAINT "DiffDebateSession_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiffDebateEvent" ADD CONSTRAINT "DiffDebateEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiffDebateSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

