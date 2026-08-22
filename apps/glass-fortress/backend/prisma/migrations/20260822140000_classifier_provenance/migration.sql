-- AlterTable
ALTER TABLE "UrlVersionDiff" ADD COLUMN     "classifierPromptHash" TEXT,
ADD COLUMN     "classifierVersion" TEXT;

-- CreateTable
CREATE TABLE "ReclassificationRun" (
    "id" TEXT NOT NULL,
    "trackedUrlId" TEXT,
    "classifierVersion" TEXT NOT NULL,
    "diffsExamined" INTEGER NOT NULL DEFAULT 0,
    "diffsReclassified" INTEGER NOT NULL DEFAULT 0,
    "flipsToSignificant" INTEGER NOT NULL DEFAULT 0,
    "flipsToRoutine" INTEGER NOT NULL DEFAULT 0,
    "flipsWithEvidence" INTEGER NOT NULL DEFAULT 0,
    "flips" TEXT NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ReclassificationRun_pkey" PRIMARY KEY ("id")
);

