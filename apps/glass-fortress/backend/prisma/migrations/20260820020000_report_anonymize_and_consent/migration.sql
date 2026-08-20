-- DropIndex
DROP INDEX "Report_reporterFingerprintHash_idx";

-- AlterTable
ALTER TABLE "Report" DROP COLUMN "reporterFingerprintHash",
ADD COLUMN     "consentGiven" BOOLEAN NOT NULL;

