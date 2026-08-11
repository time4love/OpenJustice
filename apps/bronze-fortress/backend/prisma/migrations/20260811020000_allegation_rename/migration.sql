-- BF-8: Rename Commitment → Allegation throughout.
-- "Allegation" is the correct legal term for a petitioner's formal claim;
-- "Commitment" is a cryptographic mechanism term and not domain language.
--
-- Data is disposable (no production users yet) so we drop and recreate
-- constraints rather than using the non-portable RENAME CONSTRAINT.

-- ─── Rename table ────────────────────────────────────────────────────────────

ALTER TABLE "Commitment" RENAME TO "allegations";

-- ─── Rename commitmentHash → allegationHash ──────────────────────────────────

ALTER TABLE "allegations" RENAME COLUMN "commitmentHash" TO "allegationHash";

-- ─── Rebuild indexes under new names ─────────────────────────────────────────

DROP INDEX IF EXISTS "Commitment_commitmentHash_key";
DROP INDEX IF EXISTS "Commitment_caseId_figureId_patternCategory_courtId_key";

CREATE UNIQUE INDEX "allegations_allegationHash_key" ON "allegations"("allegationHash");
CREATE UNIQUE INDEX "allegations_caseId_figureId_patternCategory_courtId_key"
    ON "allegations"("caseId", "figureId", "patternCategory", "courtId");

-- ─── Evidence parent table ───────────────────────────────────────────────────
--
-- Thin pointer from one intake document to the allegations it generated.
-- Closes provenance gap: allegation → intake record, without polymorphic coupling.
-- evidenceId on allegations is nullable — existing rows remain valid.

CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "criminalComplaintId" TEXT,
    "nzakutOrderId" TEXT,
    "welfareReportId" TEXT,
    "evaluatorSessionId" TEXT,
    "guardianContactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evidence_criminalComplaintId_key" ON "evidence"("criminalComplaintId");
CREATE UNIQUE INDEX "evidence_nzakutOrderId_key" ON "evidence"("nzakutOrderId");
CREATE UNIQUE INDEX "evidence_welfareReportId_key" ON "evidence"("welfareReportId");
CREATE UNIQUE INDEX "evidence_evaluatorSessionId_key" ON "evidence"("evaluatorSessionId");
CREATE UNIQUE INDEX "evidence_guardianContactId_key" ON "evidence"("guardianContactId");

ALTER TABLE "evidence" ADD CONSTRAINT "evidence_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence" ADD CONSTRAINT "evidence_criminalComplaintId_fkey"
    FOREIGN KEY ("criminalComplaintId") REFERENCES "CriminalComplaint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evidence" ADD CONSTRAINT "evidence_nzakutOrderId_fkey"
    FOREIGN KEY ("nzakutOrderId") REFERENCES "NzakutOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evidence" ADD CONSTRAINT "evidence_welfareReportId_fkey"
    FOREIGN KEY ("welfareReportId") REFERENCES "welfare_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evidence" ADD CONSTRAINT "evidence_evaluatorSessionId_fkey"
    FOREIGN KEY ("evaluatorSessionId") REFERENCES "evaluator_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evidence" ADD CONSTRAINT "evidence_guardianContactId_fkey"
    FOREIGN KEY ("guardianContactId") REFERENCES "guardian_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Add evidenceId FK to allegations ────────────────────────────────────────

ALTER TABLE "allegations" ADD COLUMN "evidenceId" TEXT;

ALTER TABLE "allegations" ADD CONSTRAINT "allegations_evidenceId_fkey"
    FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
