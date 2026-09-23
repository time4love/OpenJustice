-- ---------------------------------------------------------------------------
-- DOCUMENT REFACTOR STEP 30 — THE OPINION REGISTER BECOMES A TABLE.
--
-- `docs/gf-document-flows.md` A2 :1302-:1303, RULED 2026-09-23 (the researcher): the single
-- `opinion Json` column on `DocumentContentVersion` is REPLACED by `DocumentOpinion`, one
-- APPEND-ONLY row per paid reading of a version — model · promptVersion · the researcher who
-- spent it · when · the body — so A4 :1438's "appended" is true. Under the column a second
-- paid reading OVERWROTE the first.
--
-- IT MODELS BOTH WRITERS THE PLAN NAMES (:160-:162), as `Arrival` models its two doors
-- (`Arrival_fields_by_door`, step 28): `by = RESEARCHER` for `describe_document` (step 30)
-- and `by = RECEIPT` for the receipt's one read of a sealed document (step 32). The CHECK
-- below says both directions, because A2 :1303 writes "iff" — step 32 then writes into a
-- schema that already admits it, never a later migration loosening a constraint.
--
-- THE COLUMN LEAVES. It has NO WRITER in any deployed code: `recordOpinion`, its one write
-- path, had no caller (its two callers are steps 30 and 32 — the step-29 record §12). The
-- REVIEW seat read staging's column read-only and found 0 non-null values; the statement is
-- simulated in the container (`db:simulate`) before the PR, and a count other than zero
-- stops it.
--
-- WRITTEN BY HAND, THEN CHECKED against the offline generator
-- (`prisma migrate diff --from-schema-datamodel <before> --to-schema-datamodel <after>
-- --script`): every statement below is the generator's, in its order, plus the CHECK it
-- cannot express. No BEGIN/COMMIT — the file is one implicit transaction
-- (`test/migrationsOneTransaction.test.ts`).
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "OpinionWriter" AS ENUM ('RESEARCHER', 'RECEIPT');

-- AlterTable
ALTER TABLE "DocumentContentVersion" DROP COLUMN "opinion";

-- CreateTable
CREATE TABLE "DocumentOpinion" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "by" "OpinionWriter" NOT NULL,
    "researcherId" TEXT,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "body" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentOpinion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentOpinion_versionId_idx" ON "DocumentOpinion"("versionId");

-- AddForeignKey
ALTER TABLE "DocumentOpinion" ADD CONSTRAINT "DocumentOpinion_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentOpinion" ADD CONSTRAINT "DocumentOpinion_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A2 :1303 as ruled 2026-09-23. One arm per writer, `Arrival_fields_by_door`'s shape. A CHECK
-- is invisible to Prisma and to `db:check-drift`; `test/documentGuards.test.ts` (the UNIT
-- project, which gates a merge) holds it across the whole migration history, and LAND reads it
-- back from `pg_constraint`.
ALTER TABLE "DocumentOpinion" ADD CONSTRAINT "DocumentOpinion_by_writer" CHECK (
     ("by" = 'RESEARCHER' AND "researcherId" IS NOT NULL)
  OR ("by" = 'RECEIPT'    AND "researcherId" IS NULL)
);
