-- Bronze Fortress — Initial Schema
-- BF-1.1: Family vault, key figure registry, cryptographic commitments

-- CreateEnum
CREATE TYPE "FamilyMemberRole" AS ENUM ('PRIMARY_CONTACT', 'CO_PARENT', 'LAWYER');

-- CreateEnum
CREATE TYPE "KeyFigureType" AS ENUM ('JUDGE', 'SOCIAL_WORKER', 'EVALUATOR', 'GUARDIAN_AD_LITEM', 'YOUTH_PROBATION', 'OTHER');

-- CreateEnum
CREATE TYPE "KeyFigureStatus" AS ENUM ('PENDING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "CooperationLevel" AS ENUM ('NONE', 'ANONYMOUS_TIMELINE', 'ANONYMOUS_MESSAGING', 'MUTUAL_INTRODUCTION', 'SHARED_EVIDENCE_ROOM');

-- CreateEnum
CREATE TYPE "PatternCategory" AS ENUM (
  -- Domain A: Criminal-to-Family Interface
  'CRIMINAL_EXONERATION_IGNORED',
  -- Domain B: חוק הנוער Procedural Violations
  'EMERGENCY_ORDER_NO_HEARING_30_DAYS',
  'NZAKUT_NO_EVIDENTIARY_HEARING',
  'CHILD_REMOVED_OVER_YEAR_NO_HEARING',
  -- Domain C: Welfare Professional Violations
  'WELFARE_REFERRAL_AT_FIRST_HEARING',
  'WELFARE_REPORT_ONE_SIDED_INTERVIEW',
  'WELFARE_REPORT_NO_HOME_VISIT',
  'WELFARE_REPORT_CITES_DROPPED_ALLEGATIONS',
  'WELFARE_RECOMMENDATION_CHANGED_UNEXPLAINED',
  -- Domain D: Evaluator Violations
  'EVALUATOR_SINGLE_SESSION_UNDER_90_MIN',
  'EVALUATOR_SINGLE_PARENT_ONLY',
  'EVALUATOR_NO_FEEDBACK_SESSION',
  'JUDGE_RUBBER_STAMPS_EVALUATOR',
  -- Domain E: Guardian Ad Litem
  'GUARDIAN_MINIMAL_CHILD_CONTACT',
  'GUARDIAN_REPEATEDLY_BY_SAME_JUDGE',
  'GUARDIAN_CONTRADICTS_CHILD_WISHES',
  -- Domain F: Judicial Conduct
  'EX_PARTE_HEARING',
  'RECUSAL_DENIED_CONFLICT',
  'SYSTEMIC_HEARING_DELAYS',
  'MULTIPLE_JUDGE_HANDOFFS',
  -- Domain G: ניכור הורי (Parental Alienation)
  'ALIENATION_CHILD_WISHES_AS_RULING_BASIS',
  'ALIENATION_RAISED_IGNORED',
  'EVALUATOR_NO_ALIENATION_ASSESSMENT',
  'CONNECTED_PARENT_SYSTEM_TIES',
  'SEPARATION_WINDOW_USED_FOR_ALIENATION'
);

-- CreateEnum
CREATE TYPE "NzakutOrderType" AS ENUM ('STANDARD', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "PoliceCaseStatus" AS ENUM ('OPEN', 'CLOSED_LACK_OF_EVIDENCE', 'CLOSED_CLEARED', 'CLOSED_OTHER', 'UNKNOWN');

-- CreateTable: Israeli family courts (reference data, seeded separately)
CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Family vault — encrypted content, public key for E2E
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "encryptedIntakeData" TEXT,        -- questionnaire responses, encrypted client-side
    "publicKeyHex" TEXT NOT NULL,      -- family's public key; server cannot decrypt content
    "cooperationLevel" "CooperationLevel" NOT NULL DEFAULT 'NONE',

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Family members (each has their own Supabase auth identity)
CREATE TABLE "FamilyMember" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "role" "FamilyMemberRole" NOT NULL,
    "supabaseUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Explicit, per-tier, revocable consent
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tier" "CooperationLevel" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Domain A — Criminal complaints against a parent
CREATE TABLE "CriminalComplaint" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "policeStatus" "PoliceCaseStatus" NOT NULL,
    "closureConsideredByCourt" BOOLEAN,
    "custodyChangedAfterClosure" TEXT,
    "welfareReportCitedAfterClose" BOOLEAN,
    "complaintDate" TIMESTAMP(3),
    "closureDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CriminalComplaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Domain B — צו נזקקות issuance and hearing compliance
CREATE TABLE "NzakutOrder" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "orderType" "NzakutOrderType" NOT NULL,
    "evidentiaryHearingHeld" BOOLEAN NOT NULL,
    "daysToFullHearing" INTEGER,
    "childrenLocation" TEXT,
    "daysWithoutMeritsHearing" INTEGER,
    "orderDate" TIMESTAMP(3),
    "hearingDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NzakutOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Proposed key figures — invisible until activation threshold met
CREATE TABLE "PendingKeyFigure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "KeyFigureType" NOT NULL,
    "organization" TEXT,
    "courtId" TEXT,
    "nominatingFamilyIds" TEXT[],
    "nominationCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingKeyFigure_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Active key figures (threshold met + legal review approved)
CREATE TABLE "KeyFigure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "KeyFigureType" NOT NULL,
    "organization" TEXT,
    "status" "KeyFigureStatus" NOT NULL DEFAULT 'PENDING',
    "courtId" TEXT,
    "registryVerified" BOOLEAN NOT NULL DEFAULT false,
    "registrySource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "KeyFigure_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Cryptographic commitments — the core pattern proof
-- hash(keyFigureId + "|" + patternCategory + "|" + courtId)
-- Registered on-chain BEFORE families are connected to each other.
-- The timestamp proves independence — it precedes any cooperation.
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "figureId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "patternCategory" "PatternCategory" NOT NULL,
    "commitmentHash" TEXT NOT NULL,
    "eventStartDate" TIMESTAMP(3),
    "eventEndDate" TIMESTAMP(3),
    "onChainTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FamilyMember_supabaseUserId_key" ON "FamilyMember"("supabaseUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Commitment_commitmentHash_key" ON "Commitment"("commitmentHash");

-- CreateIndex: Prevents double-counting: one commitment per family × figure × pattern × court
CREATE UNIQUE INDEX "Commitment_familyId_figureId_patternCategory_courtId_key" ON "Commitment"("familyId", "figureId", "patternCategory", "courtId");

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriminalComplaint" ADD CONSTRAINT "CriminalComplaint_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NzakutOrder" ADD CONSTRAINT "NzakutOrder_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyFigure" ADD CONSTRAINT "KeyFigure_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_figureId_fkey" FOREIGN KEY ("figureId") REFERENCES "KeyFigure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
