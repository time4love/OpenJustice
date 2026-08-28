-- Restructure ScanRelevanceAssessment into the polymorphic UrlAssessment, and add
-- the Save Page Now request record.
--
-- WHY THIS RENAMES RATHER THAN DROPS AND RECREATES.
--
-- `prisma migrate diff` generates `DROP TABLE "ScanRelevanceAssessment"` for this
-- change. The table holds 0 rows on staging (measured 2026-08-28) and does not
-- exist on production at all, so a drop would be harmless TODAY. That is exactly
-- the reasoning worth refusing: a scan between now and the deploy would write a
-- row, and the drop would then destroy it silently while still reporting success.
--
-- The rename cannot lose data, and `ADD COLUMN "checkType" ... NOT NULL` with no
-- DEFAULT is a BUILT-IN EMPTINESS GUARD: Postgres refuses it on a table with rows,
-- so a surprise row aborts the deploy with the previous version still serving,
-- rather than disappearing. A constraint that makes the mistake impossible, in
-- place of a check that the mistake has not happened yet.

-- CreateEnum
CREATE TYPE "UrlAssessmentType" AS ENUM ('MISSION', 'SUBJECT');

-- CreateEnum
CREATE TYPE "SpnOutcome" AS ENUM ('PENDING', 'INDEXED', 'DECLINED', 'FAILED');

-- Rename the table and every object whose name Prisma derives from it. Index and
-- constraint names are NOT rewritten by ALTER TABLE ... RENAME, and drift is
-- computed over names, so each is renamed explicitly.
ALTER TABLE "ScanRelevanceAssessment" RENAME TO "UrlAssessment";
ALTER INDEX "ScanRelevanceAssessment_pkey" RENAME TO "UrlAssessment_pkey";
ALTER INDEX "ScanRelevanceAssessment_url_assessedAt_idx" RENAME TO "UrlAssessment_url_assessedAt_idx";
ALTER TABLE "UrlAssessment"
  RENAME CONSTRAINT "ScanRelevanceAssessment_provenance_complete" TO "UrlAssessment_provenance_complete";

-- The verdict column now serves two vocabularies, so it becomes TEXT and the
-- CHECK below becomes its enum. A constraint on an enumerated set is what an enum
-- is, and this one lives in the database rather than in one language.
ALTER TABLE "UrlAssessment" ALTER COLUMN "verdict" TYPE TEXT USING "verdict"::text;

-- The discriminator. NOT NULL with no DEFAULT, deliberately: a default would
-- silently label existing rows with a check type nobody established, which is the
-- same objection that kept a DEFAULT off `provenance` on UrlSnapshot.
ALTER TABLE "UrlAssessment" ADD COLUMN "checkType" "UrlAssessmentType" NOT NULL;

DROP INDEX "ScanRelevanceAssessment_verdict_assessedAt_idx";
CREATE INDEX "UrlAssessment_checkType_verdict_assessedAt_idx"
  ON "UrlAssessment"("checkType", "verdict", "assessedAt");

-- THE MISATTRIBUTION GUARD.
--
-- The two vocabularies are DISJOINT, so every verdict value implies its own check
-- type and this constraint does more than test membership: a mission verdict
-- written under checkType = 'SUBJECT' violates it, instead of being stored and
-- silently meaning something else.
--
-- They were not always disjoint. Both gates originally used 'UNCLEAR', resolving
-- it in OPPOSITE directions — mission-uncertain permits the scan, subject-
-- uncertain requires a human. Sharing one column, that made a single value mean
-- two opposite things depending on a sibling column, so a query filtering on it
-- would return rows meaning *proceed* beside rows meaning *stop*. Renaming the
-- subject verdict to NEEDS_HUMAN removed the hazard rather than documenting it.
ALTER TABLE "UrlAssessment"
  ADD CONSTRAINT "UrlAssessment_verdict_matches_checkType" CHECK (
    (
      "checkType" = 'MISSION'
      AND "verdict" IN ('ON_MISSION', 'OFF_MISSION', 'UNCLEAR')
    )
    OR (
      "checkType" = 'SUBJECT'
      AND "verdict" IN ('NO_PRIVATE_INDIVIDUAL', 'NAMED_PRIVATE_INDIVIDUAL', 'NEEDS_HUMAN')
    )
  );

DROP TYPE "MissionVerdict";

-- CreateTable
CREATE TABLE "SavePageNowRequest" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "criterionHash" TEXT NOT NULL,
    "subjectVerdict" TEXT NOT NULL,
    "humanConfirmedBy" TEXT,
    "outcome" "SpnOutcome" NOT NULL,
    "archiveResponse" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "waybackTimestamp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavePageNowRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavePageNowRequest_url_requestedAt_idx" ON "SavePageNowRequest"("url", "requestedAt");

-- CreateIndex
CREATE INDEX "SavePageNowRequest_outcome_lastCheckedAt_idx" ON "SavePageNowRequest"("outcome", "lastCheckedAt");

-- The subject verdict is self-describing WITHOUT a discriminator beside it,
-- because the vocabularies are disjoint: 'ON_MISSION' written here would be
-- visibly wrong rather than interpretable by convention.
ALTER TABLE "SavePageNowRequest"
  ADD CONSTRAINT "SavePageNowRequest_subject_verdict_vocabulary" CHECK (
    "subjectVerdict" IN ('NO_PRIVATE_INDIVIDUAL', 'NAMED_PRIVATE_INDIVIDUAL', 'NEEDS_HUMAN')
  );
