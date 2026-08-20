-- CreateEnum
CREATE TYPE "MedicalCareEngagement" AS ENUM ('NOT_SOUGHT', 'SOUGHT_UNCONFIRMED', 'SOUGHT_CONFIRMED', 'UNKNOWN');

-- AlterEnum
BEGIN;
CREATE TYPE "ReportStatus_new" AS ENUM ('PENDING_REVIEW', 'PUBLISHED', 'REJECTED_DUPLICATE', 'REJECTED_SPAM');
ALTER TABLE "Report" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Report" ALTER COLUMN "status" TYPE "ReportStatus_new" USING ("status"::text::"ReportStatus_new");
ALTER TYPE "ReportStatus" RENAME TO "ReportStatus_old";
ALTER TYPE "ReportStatus_new" RENAME TO "ReportStatus";
DROP TYPE "ReportStatus_old";
ALTER TABLE "Report" ALTER COLUMN "status" SET DEFAULT 'PENDING_REVIEW';
COMMIT;

-- AlterTable
ALTER TABLE "Report" DROP COLUMN "flagReasons";

-- AlterTable
ALTER TABLE "MedicalAdverseEventReport" DROP COLUMN "diagnosisConfirmedByProvider",
DROP COLUMN "medicalAttentionSought",
ADD COLUMN     "medicalCareEngagement" "MedicalCareEngagement" NOT NULL DEFAULT 'UNKNOWN';

-- DropEnum
DROP TYPE "PlausibilityFlagReason";

