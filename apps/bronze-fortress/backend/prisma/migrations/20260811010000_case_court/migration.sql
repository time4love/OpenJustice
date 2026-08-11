-- Court on Case: add courtId FK to cases table.
-- Court is now a Case-level attribute — all commitments from a case share the same court.
ALTER TABLE "cases" ADD COLUMN "courtId" TEXT REFERENCES "Court"("id");
