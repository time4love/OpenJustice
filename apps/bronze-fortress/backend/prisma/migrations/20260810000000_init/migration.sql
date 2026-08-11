-- Bronze Fortress (מבצר הנחושת) — Initial Schema
-- Domains A–E structured intake + cryptographic commitment proof layer.

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE "CaseMemberRole" AS ENUM ('PRIMARY_CONTACT', 'CO_PETITIONER', 'LAWYER');

CREATE TYPE "KeyFigureType" AS ENUM ('JUDGE', 'SOCIAL_WORKER', 'EVALUATOR', 'GUARDIAN_AD_LITEM', 'YOUTH_PROBATION', 'OTHER');

CREATE TYPE "KeyFigureStatus" AS ENUM ('PENDING', 'ACTIVE');

CREATE TYPE "CooperationLevel" AS ENUM ('NONE', 'ANONYMOUS_TIMELINE', 'ANONYMOUS_MESSAGING', 'MUTUAL_INTRODUCTION', 'SHARED_EVIDENCE_ROOM');

CREATE TYPE "PatternCategory" AS ENUM (
  'CRIMINAL_EXONERATION_IGNORED',
  'EMERGENCY_ORDER_NO_HEARING_30_DAYS',
  'NZAKUT_NO_EVIDENTIARY_HEARING',
  'CHILD_REMOVED_OVER_YEAR_NO_HEARING',
  'WELFARE_REFERRAL_AT_FIRST_HEARING',
  'WELFARE_REPORT_ONE_SIDED_INTERVIEW',
  'WELFARE_REPORT_NO_HOME_VISIT',
  'WELFARE_REPORT_CITES_DROPPED_ALLEGATIONS',
  'WELFARE_RECOMMENDATION_CHANGED_UNEXPLAINED',
  'EVALUATOR_SINGLE_SESSION_UNDER_90_MIN',
  'EVALUATOR_SINGLE_PARENT_ONLY',
  'EVALUATOR_NO_FEEDBACK_SESSION',
  'JUDGE_RUBBER_STAMPS_EVALUATOR',
  'GUARDIAN_MINIMAL_CHILD_CONTACT',
  'GUARDIAN_REPEATEDLY_BY_SAME_JUDGE',
  'GUARDIAN_CONTRADICTS_CHILD_WISHES',
  'EX_PARTE_HEARING',
  'RECUSAL_DENIED_CONFLICT',
  'SYSTEMIC_HEARING_DELAYS',
  'MULTIPLE_JUDGE_HANDOFFS',
  'ALIENATION_CHILD_WISHES_AS_RULING_BASIS',
  'ALIENATION_RAISED_IGNORED',
  'EVALUATOR_NO_ALIENATION_ASSESSMENT',
  'CONNECTED_PARENT_SYSTEM_TIES',
  'SEPARATION_WINDOW_USED_FOR_ALIENATION'
);

CREATE TYPE "NzakutOrderType" AS ENUM ('STANDARD', 'EMERGENCY');

CREATE TYPE "PoliceCaseStatus" AS ENUM ('OPEN', 'CLOSED_LACK_OF_EVIDENCE', 'CLOSED_CLEARED', 'CLOSED_OTHER', 'UNKNOWN');

-- ─── Reference Data ───────────────────────────────────────────────────────────

CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- ─── Case & Members ───────────────────────────────────────────────────────────

CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "encryptedIntakeData" TEXT,
    "publicKeyHex" TEXT NOT NULL,
    "cooperationLevel" "CooperationLevel" NOT NULL DEFAULT 'NONE',
    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_members" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "role" "CaseMemberRole" NOT NULL,
    "supabaseUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_members_supabaseUserId_key" ON "case_members"("supabaseUserId");

ALTER TABLE "case_members" ADD CONSTRAINT "case_members_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tier" "CooperationLevel" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Structured Intake — Domain A ────────────────────────────────────────────

CREATE TABLE "CriminalComplaint" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "policeStatus" "PoliceCaseStatus" NOT NULL,
    "closureConsideredByCourt" BOOLEAN,
    "custodyChangedAfterClosure" TEXT,
    "welfareReportCitedAfterClose" BOOLEAN,
    "complaintDate" TIMESTAMP(3),
    "closureDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CriminalComplaint_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CriminalComplaint" ADD CONSTRAINT "CriminalComplaint_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Structured Intake — Domain B ────────────────────────────────────────────

CREATE TABLE "NzakutOrder" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
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

ALTER TABLE "NzakutOrder" ADD CONSTRAINT "NzakutOrder_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Structured Intake — Domain C ────────────────────────────────────────────

CREATE TABLE "welfare_reports" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "welfareReferralAtFirstHearing" BOOLEAN NOT NULL,
    "interviewOneSided" BOOLEAN,
    "homeVisitConducted" BOOLEAN,
    "citedDroppedAllegations" BOOLEAN,
    "recommendationChanged" BOOLEAN,
    "reportDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "welfare_reports_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "welfare_reports" ADD CONSTRAINT "welfare_reports_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Structured Intake — Domain D ────────────────────────────────────────────

CREATE TABLE "evaluator_sessions" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "sessionCount" INTEGER NOT NULL,
    "totalDurationMinutes" INTEGER,
    "bothParentsInterviewed" BOOLEAN NOT NULL,
    "feedbackSessionHeld" BOOLEAN NOT NULL,
    "judgeAdoptedWithoutReview" BOOLEAN,
    "evaluationDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evaluator_sessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "evaluator_sessions" ADD CONSTRAINT "evaluator_sessions_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Structured Intake — Domain E ────────────────────────────────────────────

CREATE TABLE "guardian_contacts" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "childMeetingCount" INTEGER NOT NULL,
    "positionContradictsChild" BOOLEAN,
    "appointingJudgeFigureId" TEXT,
    "appointmentDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guardian_contacts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "guardian_contacts" ADD CONSTRAINT "guardian_contacts_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Key Figure Registry ──────────────────────────────────────────────────────

CREATE TABLE "KeyFigure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "KeyFigureType" NOT NULL,
    "organization" TEXT,
    "status" "KeyFigureStatus" NOT NULL DEFAULT 'PENDING',
    "publicSequence" INTEGER,
    "nominatingCaseIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "courtId" TEXT,
    "registryVerified" BOOLEAN NOT NULL DEFAULT false,
    "registrySource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    CONSTRAINT "KeyFigure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KeyFigure_type_publicSequence_key" ON "KeyFigure"("type", "publicSequence");

ALTER TABLE "KeyFigure" ADD CONSTRAINT "KeyFigure_courtId_fkey"
    FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Cryptographic Commitments ────────────────────────────────────────────────

CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
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

CREATE UNIQUE INDEX "Commitment_commitmentHash_key" ON "Commitment"("commitmentHash");
CREATE UNIQUE INDEX "Commitment_caseId_figureId_patternCategory_courtId_key"
    ON "Commitment"("caseId", "figureId", "patternCategory", "courtId");

ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_figureId_fkey"
    FOREIGN KEY ("figureId") REFERENCES "KeyFigure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_courtId_fkey"
    FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
