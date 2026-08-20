-- CreateEnum
CREATE TYPE "ReporterAgeRange" AS ENUM ('UNDER_18', 'AGE_18_29', 'AGE_30_44', 'AGE_45_59', 'AGE_60_74', 'AGE_75_PLUS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReporterGender" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "reporterAgeRange" "ReporterAgeRange" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "reporterGender" "ReporterGender" NOT NULL DEFAULT 'UNKNOWN';

