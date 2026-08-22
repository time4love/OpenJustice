-- CreateEnum
CREATE TYPE "ClaimFinalState" AS ENUM ('PRESENT', 'REMOVED');

-- CreateTable
CREATE TABLE "ClaimTrajectory" (
    "id" TEXT NOT NULL,
    "trackedUrlId" TEXT NOT NULL,
    "claimHash" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "observations" TEXT NOT NULL,
    "transitions" INTEGER NOT NULL,
    "firstSeen" TEXT NOT NULL,
    "lastSeen" TEXT NOT NULL,
    "finalState" "ClaimFinalState" NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimTrajectory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimTrajectory_trackedUrlId_claimHash_key" ON "ClaimTrajectory"("trackedUrlId", "claimHash");

-- AddForeignKey
ALTER TABLE "ClaimTrajectory" ADD CONSTRAINT "ClaimTrajectory_trackedUrlId_fkey" FOREIGN KEY ("trackedUrlId") REFERENCES "TrackedUrl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

