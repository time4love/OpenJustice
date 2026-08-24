-- ClaimTrajectory.patternHash — the identity of a movement, stored.
--
-- Additive: one column, one index, one backfill. No drops, no rewrites of
-- existing values.
--
-- WHY: answering "how many claims moved as one unit" meant loading every
-- sibling row's observations blob — 58 rows of ~10 KB on the first real thesis —
-- on every page load, purely to recompute a hash of each presence vector. The
-- vector is fixed for the life of a row (a computation is never updated in
-- place), so it is computed once at write time from now on.
--
-- THE BACKFILL IS THE SAME HASH THE APPLICATION COMPUTES, verified before this
-- migration was written: SHA-256 of the presence vector rendered as '1'/'0' in
-- capture order. All 116 existing staging rows produced byte-identical values
-- under both paths. COALESCE keeps an empty observations array hashing the empty
-- string, which is what the application's `[].join('')` produces — a row that
-- cannot compute a value would otherwise fail SET NOT NULL and abort the deploy.
--
-- Transactional: the ADD, the UPDATE and the SET NOT NULL succeed together or
-- none of them do. A row this cannot compute becomes a failed deploy, never a
-- half-migrated table.

-- digest() comes from pgcrypto, which Supabase installs in `extensions` rather
-- than `public`. Migrations run over DIRECT_URL, which need not share the
-- application connection's search_path, so both schemas are named explicitly
-- instead of trusting the one that happened to work when this was probed.
SET LOCAL search_path = public, extensions;

-- AlterTable
ALTER TABLE "ClaimTrajectory" ADD COLUMN "patternHash" TEXT;

-- Backfill
UPDATE "ClaimTrajectory" t
SET "patternHash" = encode(
  digest(
    COALESCE(
      (SELECT string_agg(CASE WHEN (o->>'present')::boolean THEN '1' ELSE '0' END, '' ORDER BY ord)
         FROM jsonb_array_elements(t."observations"::jsonb) WITH ORDINALITY AS e(o, ord)),
      ''
    ),
    'sha256'
  ),
  'hex'
);

-- AlterTable
ALTER TABLE "ClaimTrajectory" ALTER COLUMN "patternHash" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ClaimTrajectory_computationId_patternHash_idx" ON "ClaimTrajectory"("computationId", "patternHash");
