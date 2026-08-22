-- Trajectory detection becomes stored, versioned state.
--
-- ClaimTrajectory has never held a row: the table was added ready for a
-- justification ("a stable identity for theses to cite") that had not arrived,
-- and computeClaimTrajectories deliberately recomputed from raw snapshot text
-- on every call. Two justifications have since arrived — a ~4s full-text
-- rescan per call on an anonymous endpoint, and reasoning tools that could not
-- see trajectories at all — so the rows are now written and read.
--
-- ADD COLUMN "computationId" NOT NULL has no default and DROP COLUMN
-- "computedAt" discards data; both are safe here ONLY because the table is
-- empty. Verified by measurement before writing this file:
--   claimTrajectory = 0, against trackedUrl = 1 and urlSnapshot = 83 in the
--   same query, so the zero is a real zero and not a failed read.
-- If this migration is ever applied to an environment where ClaimTrajectory is
-- populated, the ADD COLUMN will fail and abort the deploy. That is the correct
-- outcome, not a bug to work around.

-- DropIndex
DROP INDEX "ClaimTrajectory_trackedUrlId_claimHash_key";

-- AlterTable
ALTER TABLE "ClaimTrajectory" DROP COLUMN "computedAt",
ADD COLUMN     "computationId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ClaimTrajectoryComputation" (
    "id" TEXT NOT NULL,
    "trackedUrlId" TEXT NOT NULL,
    "sourceStateHash" TEXT NOT NULL,
    "detectionVersion" TEXT NOT NULL,
    "snapshotsExamined" INTEGER NOT NULL,
    "candidatesConsidered" INTEGER NOT NULL,
    "candidatesUnmatched" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimTrajectoryComputation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaimTrajectoryComputation_trackedUrlId_computedAt_idx" ON "ClaimTrajectoryComputation"("trackedUrlId", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimTrajectoryComputation_trackedUrlId_sourceStateHash_key" ON "ClaimTrajectoryComputation"("trackedUrlId", "sourceStateHash");

-- CreateIndex
CREATE INDEX "ClaimTrajectory_trackedUrlId_claimHash_idx" ON "ClaimTrajectory"("trackedUrlId", "claimHash");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimTrajectory_computationId_claimHash_key" ON "ClaimTrajectory"("computationId", "claimHash");

-- AddForeignKey
ALTER TABLE "ClaimTrajectoryComputation" ADD CONSTRAINT "ClaimTrajectoryComputation_trackedUrlId_fkey" FOREIGN KEY ("trackedUrlId") REFERENCES "TrackedUrl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimTrajectory" ADD CONSTRAINT "ClaimTrajectory_computationId_fkey" FOREIGN KEY ("computationId") REFERENCES "ClaimTrajectoryComputation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

