-- CreateEnum
CREATE TYPE "ReportDomain" AS ENUM ('MEDICAL', 'SOCIAL_ECONOMIC');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING_REVIEW', 'PUBLISHED', 'FLAGGED_IMPLAUSIBLE', 'REJECTED_DUPLICATE', 'REJECTED_SPAM');

-- CreateEnum
CREATE TYPE "ReportTimingWindow" AS ENUM ('WITHIN_24H', 'WITHIN_1_WEEK', 'WITHIN_1_MONTH', 'WITHIN_6_MONTHS', 'OVER_6_MONTHS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MedicalSymptomCategory" AS ENUM ('CARDIOVASCULAR', 'NEUROLOGICAL', 'NEUROCOGNITIVE_PVS', 'AUTOIMMUNE_IMMUNE', 'HEMATOLOGIC', 'ONCOLOGIC', 'REPRODUCTIVE_MENSTRUAL', 'MUSCULOSKELETAL', 'DERMATOLOGIC', 'GENERAL_SYSTEMIC', 'DEATH', 'OTHER');

-- CreateEnum
CREATE TYPE "CognitiveSymptomType" AS ENUM ('BRAIN_FOG', 'MEMORY_IMPAIRMENT', 'CONCENTRATION_DIFFICULTY', 'MULTIPLE', 'OTHER');

-- CreateEnum
CREATE TYPE "SymptomPersistence" AS ENUM ('RESOLVED', 'ONGOING_PERSISTENT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MedicalSeriousness" AS ENUM ('HOSPITALIZATION', 'LIFE_THREATENING', 'PERMANENT_DISABILITY', 'DEATH', 'CONGENITAL_ANOMALY', 'NONE');

-- CreateEnum
CREATE TYPE "CancerPresentationType" AS ENUM ('NEW_DIAGNOSIS', 'RECURRENCE_OR_PROGRESSION', 'OTHER');

-- CreateEnum
CREATE TYPE "CancerCourse" AS ENUM ('TYPICAL_PACE', 'UNUSUALLY_RAPID_PROGRESSION');

-- CreateEnum
CREATE TYPE "CancerType" AS ENUM ('LYMPHOMA_LEUKEMIA', 'BREAST', 'LUNG', 'MELANOMA_SKIN', 'PANCREATIC', 'BRAIN_CNS', 'OTHER_SOLID', 'OTHER_BLOOD', 'NOT_YET_TYPED');

-- CreateEnum
CREATE TYPE "VaccineManufacturer" AS ENUM ('PFIZER', 'MODERNA', 'ASTRAZENECA', 'JOHNSON_JOHNSON', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SocialEconomicImpactCategory" AS ENUM ('EMPLOYMENT_TERMINATION', 'MILITARY_DISCHARGE', 'DEMOTION_REASSIGNMENT', 'DENIED_HIRE', 'ACCESS_DENIAL_SERVICES', 'ACCESS_DENIAL_HEALTHCARE', 'EDUCATION_ACCESS_DENIAL', 'FAMILY_RELATIONSHIP_RUPTURE', 'SOCIAL_OSTRACIZATION', 'OTHER');

-- CreateEnum
CREATE TYPE "FormalBasisAsserted" AS ENUM ('RELIGIOUS_ACCOMMODATION_DENIED', 'MEDICAL_DISABILITY_ACCOMMODATION_DENIED', 'NO_FORMAL_BASIS_STATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ConsequenceSeverity" AS ENUM ('INCOME_LOSS', 'BENEFITS_LOSS', 'CAREER_TRAJECTORY_IMPACT', 'RELATIONSHIP_LOSS', 'HOUSING_FINANCIAL_HARDSHIP', 'NONE');

-- CreateEnum
CREATE TYPE "SocialOutcomeStatus" AS ENUM ('ONGOING', 'RESOLVED_REVERSED', 'RESOLVED_UNCHANGED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "domain" "ReportDomain" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "medicalReportId" TEXT,
    "socialEconomicReportId" TEXT,
    "reporterFingerprintHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalAdverseEventReport" (
    "id" TEXT NOT NULL,
    "symptomCategory" "MedicalSymptomCategory" NOT NULL,
    "seriousness" "MedicalSeriousness" NOT NULL DEFAULT 'NONE',
    "cancerPresentationType" "CancerPresentationType",
    "cancerCourse" "CancerCourse",
    "cancerAtypicalFeatures" BOOLEAN,
    "cancerType" "CancerType",
    "cognitiveSymptomType" "CognitiveSymptomType",
    "postExertionalMalaise" BOOLEAN,
    "symptomPersistence" "SymptomPersistence" NOT NULL DEFAULT 'UNKNOWN',
    "vaccineManufacturer" "VaccineManufacturer" NOT NULL DEFAULT 'UNKNOWN',
    "doseNumber" INTEGER,
    "onsetWindow" "ReportTimingWindow" NOT NULL DEFAULT 'UNKNOWN',
    "medicalAttentionSought" BOOLEAN,
    "diagnosisConfirmedByProvider" BOOLEAN,
    "preExistingCondition" BOOLEAN,
    "freeTextElaboration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalAdverseEventReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialEconomicImpactReport" (
    "id" TEXT NOT NULL,
    "impactCategory" "SocialEconomicImpactCategory" NOT NULL,
    "formalBasisAsserted" "FormalBasisAsserted" NOT NULL DEFAULT 'UNKNOWN',
    "consequenceSeverity" "ConsequenceSeverity" NOT NULL DEFAULT 'NONE',
    "outcomeStatus" "SocialOutcomeStatus" NOT NULL DEFAULT 'UNKNOWN',
    "documentationAvailable" BOOLEAN,
    "timingRelativeToEvent" "ReportTimingWindow" NOT NULL DEFAULT 'UNKNOWN',
    "freeTextElaboration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialEconomicImpactReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Report_medicalReportId_key" ON "Report"("medicalReportId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_socialEconomicReportId_key" ON "Report"("socialEconomicReportId");

-- CreateIndex
CREATE INDEX "Report_reporterFingerprintHash_idx" ON "Report"("reporterFingerprintHash");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_medicalReportId_fkey" FOREIGN KEY ("medicalReportId") REFERENCES "MedicalAdverseEventReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_socialEconomicReportId_fkey" FOREIGN KEY ("socialEconomicReportId") REFERENCES "SocialEconomicImpactReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

