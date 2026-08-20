-- AlterEnum
BEGIN;
CREATE TYPE "PlausibilityFlagReason_new" AS ENUM ('DIAGNOSIS_WITHOUT_MEDICAL_ATTENTION', 'IMPLAUSIBLE_CANCER_DIAGNOSIS_TIMING');
ALTER TABLE "Report" ALTER COLUMN "flagReasons" DROP DEFAULT;
ALTER TABLE "Report" ALTER COLUMN "flagReasons" TYPE "PlausibilityFlagReason_new"[] USING ("flagReasons"::text::"PlausibilityFlagReason_new"[]);
ALTER TYPE "PlausibilityFlagReason" RENAME TO "PlausibilityFlagReason_old";
ALTER TYPE "PlausibilityFlagReason_new" RENAME TO "PlausibilityFlagReason";
DROP TYPE "PlausibilityFlagReason_old";
ALTER TABLE "Report" ALTER COLUMN "flagReasons" SET DEFAULT ARRAY[]::"PlausibilityFlagReason"[];
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "MedicalSymptomCategory_new" AS ENUM ('CARDIOVASCULAR', 'NEUROLOGICAL', 'NEUROCOGNITIVE_PVS', 'AUTOIMMUNE_IMMUNE', 'HEMATOLOGIC', 'ONCOLOGIC', 'REPRODUCTIVE_MENSTRUAL', 'MUSCULOSKELETAL', 'DERMATOLOGIC', 'GENERAL_SYSTEMIC', 'OTHER');
ALTER TABLE "MedicalAdverseEventReport" ALTER COLUMN "symptomCategory" TYPE "MedicalSymptomCategory_new" USING ("symptomCategory"::text::"MedicalSymptomCategory_new");
ALTER TYPE "MedicalSymptomCategory" RENAME TO "MedicalSymptomCategory_old";
ALTER TYPE "MedicalSymptomCategory_new" RENAME TO "MedicalSymptomCategory";
DROP TYPE "MedicalSymptomCategory_old";
COMMIT;

