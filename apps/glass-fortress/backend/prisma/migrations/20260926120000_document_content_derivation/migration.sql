-- ---------------------------------------------------------------------------
-- DOCUMENT REFACTOR STEP 34 (chunk 5-0) — ONE ROW PER DERIVATION.
--
-- `docs/gf-document-flows.md` A2 :1300 and A3 :1368–:1369 as CONFORMED 2026-09-26 (the researcher,
-- R86 Q-R1): "one row per derivation, (versionId, extractorVersion, at), at null only for rows
-- derived before the table; derivedUnder dropped in the same migration". The `derivedUnder TEXT[]`
-- column (step 29b, 20260923120000) held the SET of extractor versions that produced or
-- reproduced a version's text and kept no moment, so a re-derivation that re-reached an OLDER
-- text (A→B→A) had no record of when CURRENT(d) moved. `DocumentContentDerivation` keeps the
-- same membership as rows, each with the moment of its derivation.
--
-- THE BACKFILL NEVER INVENTS A MOMENT. The list's FIRST member is the extractor that created the
-- version (`derivedUnder[1] = extractorVersion` — the writer wrote it so, and the refusal below
-- holds it), so its row takes the version's own `derivedAt`. A LATER member was appended by a
-- re-derivation whose moment nobody kept: its `at` is NULL, "not recorded". Measured read-only on
-- staging before this file (R86-review-state Entries 3–4): 5 versions, one with two members →
-- 6 rows, ONE of them NULL. Production holds 0 documents.
--
-- THE REFUSAL, BEFORE ANYTHING DROPS. The DO block counts what the backfill wrote against what the
-- column held and RAISES unless: every member became a row; every list's first member is its
-- version's `extractorVersion`; every version has at least one row (a version with a NULL or empty
-- list would otherwise leave CURRENT(d) with nothing to read). A RAISE rolls the whole file back,
-- the pre-deploy step fails, and the previous version keeps serving (the R45-B precedent,
-- 20260914120000).
--
-- THE COLUMN DROP IS LAST — the generator emits it FIRST, and the backfill reads it. Otherwise
-- every statement below is the offline generator's (`prisma migrate diff --from-schema-datamodel
-- <committed> --to-schema-datamodel <this> --script`, run against no database), in its order.
--
-- IDS: a row the application writes takes Prisma's `cuid()`; a backfilled row takes
-- `gen_random_uuid()` (core Postgres since 13). Both are TEXT; nothing reads an id's shape.
-- `at` is TIMESTAMP(3) — Prisma's `DateTime`, the type of the `derivedAt` it is copied from.
--
-- ONE TRANSACTION: no BEGIN/COMMIT here (Prisma 5.22.0 sends the file as one simple query;
-- `test/migrationsOneTransaction.test.ts` strips the DO block's dollar-quoted body before it looks).
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "DocumentContentDerivation" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "at" TIMESTAMP(3),

    CONSTRAINT "DocumentContentDerivation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentContentDerivation_versionId_extractorVersion_key" ON "DocumentContentDerivation"("versionId", "extractorVersion");

-- AddForeignKey
ALTER TABLE "DocumentContentDerivation" ADD CONSTRAINT "DocumentContentDerivation_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one row per member of every version's list, in its order. The FIRST member's moment
-- is the version's `derivedAt`; a later member's was never recorded.
INSERT INTO "DocumentContentDerivation" ("id", "versionId", "extractorVersion", "at")
SELECT gen_random_uuid()::text,
       v."id",
       member.extractor,
       CASE WHEN member.ordinal = 1 THEN v."derivedAt" ELSE NULL END
FROM "DocumentContentVersion" v
CROSS JOIN LATERAL unnest(v."derivedUnder") WITH ORDINALITY AS member(extractor, ordinal);

-- The refusal — before the column drops.
DO $$
DECLARE
  written      bigint;
  held         bigint;
  first_wrong  bigint;
  without_row  bigint;
BEGIN
  SELECT count(*) INTO written FROM "DocumentContentDerivation";
  SELECT coalesce(sum(cardinality("derivedUnder")), 0) INTO held FROM "DocumentContentVersion";
  SELECT count(*) INTO first_wrong FROM "DocumentContentVersion" WHERE "derivedUnder"[1] IS DISTINCT FROM "extractorVersion";
  SELECT count(*) INTO without_row FROM "DocumentContentVersion" v
    WHERE NOT EXISTS (SELECT 1 FROM "DocumentContentDerivation" d WHERE d."versionId" = v."id");
  IF written <> held OR first_wrong > 0 OR without_row > 0 THEN
    RAISE EXCEPTION 'document_content_derivation refuses: % rows written for % list members; % versions whose first member is not their extractorVersion; % versions with no row. Nothing was changed.',
      written, held, first_wrong, without_row;
  END IF;
END $$;

-- AlterTable — LAST
ALTER TABLE "DocumentContentVersion" DROP COLUMN "derivedUnder";
