-- LEVEL 4 — THE VIEW. The rules a human marked, and the loop that produced them.
--
-- Signed off for all three modes before any of it was written; the reasoning is
-- `docs/gf-factual-layer-rebuild-dev-plan.md`, Level 4, `##### THE DATA MODEL`.
--
-- PURELY ADDITIVE. Two enums, four tables, one nullable column on TrackedUrl, and
-- their indexes and foreign keys. Nothing existing is altered in place, nothing is
-- dropped, and no row anywhere changes: every capture already derived stays
-- exactly as it is, comparable to every other, because an EMPTY ruleset derives
-- byte-identically and every page starts with no ruleset at all.
--
-- Generated offline with `prisma migrate diff --from-schema-datamodel <old>
-- --to-schema-datamodel <new> --script`, which needs no database connection and
-- therefore cannot propose dropping a raw-SQL object it does not model. Read
-- before applying, per CLAUDE.md.
--
-- WHAT IS DELIBERATELY NOT HERE:
--
--   `ScanRun` / `ScanDecision`, `TrackedUrl.activeScanRunId` and
--   `UrlSnapshot.scanRunId` are step 2b. They are fully specified in the plan, so
--   this migration cannot force them into a different shape — but a nullable
--   foreign key to a table that does not exist yet is a column nothing can ever
--   set, and speculative columns are how a schema stops describing the system.
--
--   A CHECK constraint asserting that exactly one of `snapshotId` and
--   `waybackTimestamp` is set -- on RulesetObservation, and on the CAPTURE_*
--   decisions of CalibrationDecision, where the rule is conditional on the row's
--   type and a constraint would have to encode that too. Prisma does not model CHECK
--   constraints, and whether one added by raw SQL registers as drift in
--   `db:check-drift` cannot be established without a shadow database to test it
--   against. Breaking that check would cost every future migration, so the
--   invariant is held by `requireObservationSubject` — a loud guard that throws,
--   with a test — which is this repository's named pattern for the case.

-- CreateEnum
CREATE TYPE "CalibrationRunStatus" AS ENUM ('OPEN', 'COMMITTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CalibrationDecisionType" AS ENUM ('RUN_OPENED', 'CAPTURE_SHOWN', 'RULESET_CORRECTED', 'CAPTURE_ACCEPTED', 'CAPTURE_REJECTED', 'CAPTURE_SKIPPED', 'RUN_CLOSED');

-- AlterTable
ALTER TABLE "TrackedUrl" ADD COLUMN     "activeArticleRulesetId" TEXT;

-- CreateTable
CREATE TABLE "ArticleRuleset" (
    "id" TEXT NOT NULL,
    "trackedUrlId" TEXT NOT NULL,
    "rulesetId" TEXT NOT NULL,
    "selectors" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleRuleset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulesetObservation" (
    "id" TEXT NOT NULL,
    "articleRulesetId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "waybackTimestamp" TEXT,
    "matchCounts" JSONB NOT NULL,
    "removalFraction" DOUBLE PRECISION NOT NULL,
    "derivedTextLength" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RulesetObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationRun" (
    "id" TEXT NOT NULL,
    "trackedUrlId" TEXT NOT NULL,
    "researcherId" TEXT NOT NULL,
    "status" "CalibrationRunStatus" NOT NULL DEFAULT 'OPEN',
    "seededFromRulesetId" TEXT,
    "committedRulesetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "CalibrationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationDecision" (
    "id" TEXT NOT NULL,
    "calibrationRunId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "CalibrationDecisionType" NOT NULL,
    "selectors" TEXT[],
    "rulesetId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "waybackTimestamp" TEXT,
    "observationId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalibrationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArticleRuleset_trackedUrlId_createdAt_idx" ON "ArticleRuleset"("trackedUrlId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleRuleset_trackedUrlId_rulesetId_key" ON "ArticleRuleset"("trackedUrlId", "rulesetId");

-- CreateIndex
CREATE INDEX "RulesetObservation_articleRulesetId_removalFraction_idx" ON "RulesetObservation"("articleRulesetId", "removalFraction");

-- CreateIndex
CREATE INDEX "RulesetObservation_articleRulesetId_observedAt_idx" ON "RulesetObservation"("articleRulesetId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RulesetObservation_articleRulesetId_snapshotId_key" ON "RulesetObservation"("articleRulesetId", "snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "RulesetObservation_articleRulesetId_waybackTimestamp_key" ON "RulesetObservation"("articleRulesetId", "waybackTimestamp");

-- CreateIndex
CREATE INDEX "CalibrationRun_trackedUrlId_status_idx" ON "CalibrationRun"("trackedUrlId", "status");

-- CreateIndex
CREATE INDEX "CalibrationDecision_calibrationRunId_type_idx" ON "CalibrationDecision"("calibrationRunId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationDecision_calibrationRunId_sequence_key" ON "CalibrationDecision"("calibrationRunId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedUrl_activeArticleRulesetId_key" ON "TrackedUrl"("activeArticleRulesetId");

-- AddForeignKey
ALTER TABLE "TrackedUrl" ADD CONSTRAINT "TrackedUrl_activeArticleRulesetId_fkey" FOREIGN KEY ("activeArticleRulesetId") REFERENCES "ArticleRuleset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRuleset" ADD CONSTRAINT "ArticleRuleset_trackedUrlId_fkey" FOREIGN KEY ("trackedUrlId") REFERENCES "TrackedUrl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRuleset" ADD CONSTRAINT "ArticleRuleset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RulesetObservation" ADD CONSTRAINT "RulesetObservation_articleRulesetId_fkey" FOREIGN KEY ("articleRulesetId") REFERENCES "ArticleRuleset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RulesetObservation" ADD CONSTRAINT "RulesetObservation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "UrlSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRun" ADD CONSTRAINT "CalibrationRun_trackedUrlId_fkey" FOREIGN KEY ("trackedUrlId") REFERENCES "TrackedUrl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRun" ADD CONSTRAINT "CalibrationRun_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRun" ADD CONSTRAINT "CalibrationRun_seededFromRulesetId_fkey" FOREIGN KEY ("seededFromRulesetId") REFERENCES "ArticleRuleset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRun" ADD CONSTRAINT "CalibrationRun_committedRulesetId_fkey" FOREIGN KEY ("committedRulesetId") REFERENCES "ArticleRuleset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationDecision" ADD CONSTRAINT "CalibrationDecision_calibrationRunId_fkey" FOREIGN KEY ("calibrationRunId") REFERENCES "CalibrationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationDecision" ADD CONSTRAINT "CalibrationDecision_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "UrlSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationDecision" ADD CONSTRAINT "CalibrationDecision_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "RulesetObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

