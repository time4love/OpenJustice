-- THESIS STEP 23 — A PAID ACT RECORDS WHO SPENT IT: ThesisAnalysis.researcherId.
--
-- Design: docs/gf-thesis-flows.md A2 :1317 (amended 2026-09-14 on step 22's live run, Live-5); plan
-- docs/gf-thesis-refactor-plan.md step 23 :197–:199. Ruled by the researcher on R49's first report (Q7): NOT NULL,
-- foreign key RESTRICT, backfilled from the analysed version's thesis's author.
--
-- GENERATED OFFLINE, THEN SPLIT BY HAND. `prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel <new>
-- --script` (Prisma 5.22.0, two schema copies, no database) emits TWO statements: ADD COLUMN ... NOT NULL, and the
-- foreign key. The first refuses any table holding a row, and staging holds one analysis. The four statements below
-- reach the generator's END STATE exactly — the same column, type, nullability and constraint name — so
-- `db:check-drift` agrees with `schema.prisma` after.
--
-- THE BACKFILL RULE, stated: `run_analysis` refuses NOT_AUTHOR (A4 :1485), and a thesis's author never changes (§9
-- :1001), so the one researcher who can have spent an analysis's call is the author of the thesis its version belongs
-- to. Every analysis's version exists (ThesisAnalysis_versionId_fkey, RESTRICT) and every version's thesis exists
-- (ThesisVersion_thesisId_fkey, RESTRICT), so the SET NOT NULL cannot meet a null.
--
-- NO BEGIN/COMMIT (test/migrationsOneTransaction.test.ts): Prisma 5.22 sends the file as one simple query, one implicit
-- transaction (memory: step-18 rulings).

ALTER TABLE "ThesisAnalysis" ADD COLUMN "researcherId" TEXT;

UPDATE "ThesisAnalysis" AS a
SET "researcherId" = t."createdById"
FROM "ThesisVersion" AS v
JOIN "Thesis" AS t ON t."id" = v."thesisId"
WHERE v."id" = a."versionId";

ALTER TABLE "ThesisAnalysis" ALTER COLUMN "researcherId" SET NOT NULL;

ALTER TABLE "ThesisAnalysis" ADD CONSTRAINT "ThesisAnalysis_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
