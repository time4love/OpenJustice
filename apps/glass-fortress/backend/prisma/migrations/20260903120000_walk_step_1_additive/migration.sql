-- THE WALK, STEP 1 OF docs/gf-refactor-plan.md — ADDITIVE ONLY.
--
-- The article-rules refactor builds the new walk BESIDE the old scan
-- (plan §1). This migration gives it its tables and columns without touching
-- what the old path uses: every statement below is a CREATE, an ADD VALUE, an
-- ADD COLUMN or an ADD CONSTRAINT — 29 statements, checked by script before
-- commit — and no table, column, constraint or index is dropped, renamed or
-- narrowed. The old path keeps serving until step 8 switches; step 9 rebuilds
-- the database from the archive on a fresh registry (docs/gf-evidence-flows.md
-- §8), so nothing here is ever converted.
--
-- Written from docs/gf-interaction-flows.md A2, as amended by PRs #340 and
-- #342, and generated OFFLINE with `prisma migrate diff` between the committed
-- schema and the new one — no database was consulted. `db:check-drift`
-- reported "No difference detected" on staging before the schema was edited.
--
-- What it adds:
--   CdxEntryStatus      the walk's five outcomes: IDENTICAL, DUPLICATE, ACQUIRED,
--                       PENDING_JUDGEMENT, SKIPPED (UNFETCHED and UNSERVABLE are
--                       shared; STORED and UNCHANGED stay for the old path)
--   PageDecisionType    the page log's eight types, RULE_EXTENDED included
--   TrackedUrl          createdById (nullable: the pages admitted before the
--                       survey existed have no one to attribute them to) and
--                       the draft, trust named by selector
--   CdxIndexEntry       the work-list row: fetch facts, digestVerified, the
--                       extractor version, comparedTo as a timestamp, rulesetId,
--                       textHash, heldBody, stop (JSONB), reason; and the
--                       walk's key on (trackedUrlId, waybackTimestamp) beside
--                       the old three-column one — zero rows on staging share a
--                       page and timestamp
--   Rule, PageDecision, RuleMatch, TextVersion
--                       new tables; the compare-and-set is the unique index on
--                       PageDecision (trackedUrlId, sequence)
--
-- ON DELETE is chosen, not defaulted: every reference between a decision and a
-- rule, and to a researcher, is RESTRICT — attribution is never blanked
-- silently; children of a page and of a snapshot CASCADE, as every sibling
-- table does today.
--
-- ALTER TYPE … ADD VALUE inside Prisma's per-migration transaction is safe on
-- PostgreSQL 12+ (Supabase runs 17) so long as the new value is not USED in the
-- same transaction; nothing below uses one. Seven landed migrations do the same.

-- CreateEnum
CREATE TYPE "PageDecisionType" AS ENUM ('RULESET_CORRECTED', 'CAPTURE_ACCEPTED', 'CAPTURE_SKIPPED', 'RULE_TRUSTED', 'RULE_ENDED', 'RULE_RETIRED', 'RULE_EXTENDED', 'RESET');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CdxEntryStatus" ADD VALUE 'IDENTICAL';
ALTER TYPE "CdxEntryStatus" ADD VALUE 'DUPLICATE';
ALTER TYPE "CdxEntryStatus" ADD VALUE 'ACQUIRED';
ALTER TYPE "CdxEntryStatus" ADD VALUE 'PENDING_JUDGEMENT';
ALTER TYPE "CdxEntryStatus" ADD VALUE 'SKIPPED';

-- AlterTable
ALTER TABLE "TrackedUrl" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "draftCapture" TEXT,
ADD COLUMN     "draftReturnedAt" TIMESTAMP(3),
ADD COLUMN     "draftSelectors" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "draftTrusted" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "CdxIndexEntry" ADD COLUMN     "comparedTo" TEXT,
ADD COLUMN     "contentEncoding" TEXT,
ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "digestVerified" BOOLEAN,
ADD COLUMN     "fetchedAt" TIMESTAMP(3),
ADD COLUMN     "heldBody" BYTEA,
ADD COLUMN     "rawBytesHash" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "rulesetId" TEXT,
ADD COLUMN     "stop" JSONB,
ADD COLUMN     "textExtractionVersion" TEXT,
ADD COLUMN     "textHash" TEXT;

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "trackedUrlId" TEXT NOT NULL,
    "selector" TEXT NOT NULL,
    "validFrom" TEXT NOT NULL,
    "validTo" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByDecisionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageDecision" (
    "id" TEXT NOT NULL,
    "trackedUrlId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "PageDecisionType" NOT NULL,
    "researcherId" TEXT NOT NULL,
    "waybackTimestamp" TEXT,
    "ruleId" TEXT,
    "reason" TEXT,
    "rulesetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleMatch" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "waybackTimestamp" TEXT NOT NULL,
    "matchedNodes" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextVersion" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "textExtractionVersion" TEXT NOT NULL,
    "rulesetId" TEXT NOT NULL,
    "derivedAt" TIMESTAMP(3) NOT NULL,
    "supersededAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededByDecisionId" TEXT NOT NULL,

    CONSTRAINT "TextVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rule_trackedUrlId_selector_idx" ON "Rule"("trackedUrlId", "selector");

-- CreateIndex
CREATE INDEX "Rule_trackedUrlId_validFrom_idx" ON "Rule"("trackedUrlId", "validFrom");

-- CreateIndex
CREATE INDEX "PageDecision_trackedUrlId_waybackTimestamp_idx" ON "PageDecision"("trackedUrlId", "waybackTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "PageDecision_trackedUrlId_sequence_key" ON "PageDecision"("trackedUrlId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "RuleMatch_ruleId_waybackTimestamp_key" ON "RuleMatch"("ruleId", "waybackTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "TextVersion_snapshotId_textHash_key" ON "TextVersion"("snapshotId", "textHash");

-- CreateIndex
CREATE UNIQUE INDEX "CdxIndexEntry_trackedUrlId_waybackTimestamp_key" ON "CdxIndexEntry"("trackedUrlId", "waybackTimestamp");

-- AddForeignKey
ALTER TABLE "TrackedUrl" ADD CONSTRAINT "TrackedUrl_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_trackedUrlId_fkey" FOREIGN KEY ("trackedUrlId") REFERENCES "TrackedUrl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_createdByDecisionId_fkey" FOREIGN KEY ("createdByDecisionId") REFERENCES "PageDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageDecision" ADD CONSTRAINT "PageDecision_trackedUrlId_fkey" FOREIGN KEY ("trackedUrlId") REFERENCES "TrackedUrl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageDecision" ADD CONSTRAINT "PageDecision_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageDecision" ADD CONSTRAINT "PageDecision_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleMatch" ADD CONSTRAINT "RuleMatch_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextVersion" ADD CONSTRAINT "TextVersion_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "UrlSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextVersion" ADD CONSTRAINT "TextVersion_supersededByDecisionId_fkey" FOREIGN KEY ("supersededByDecisionId") REFERENCES "PageDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

