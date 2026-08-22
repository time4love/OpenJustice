-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ResearchSessionEventType" ADD VALUE 'FRAMING_PROPOSED';
ALTER TYPE "ResearchSessionEventType" ADD VALUE 'FRAMING_ASSESSED';
ALTER TYPE "ResearchSessionEventType" ADD VALUE 'THESIS_ATTACHED';

-- AlterTable
ALTER TABLE "ResearchSession" ADD COLUMN     "question" TEXT,
ALTER COLUMN "thesisId" DROP NOT NULL;

