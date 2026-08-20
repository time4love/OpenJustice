-- CreateEnum
CREATE TYPE "PlausibilityFlagReason" AS ENUM ('DEATH_SERIOUSNESS_MISMATCH', 'DIAGNOSIS_WITHOUT_MEDICAL_ATTENTION', 'IMPLAUSIBLE_CANCER_DIAGNOSIS_TIMING');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "flagReasons" "PlausibilityFlagReason"[] DEFAULT ARRAY[]::"PlausibilityFlagReason"[];

