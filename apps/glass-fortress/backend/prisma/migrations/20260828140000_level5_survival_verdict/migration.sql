-- LEVEL 5: the check runs at write, and its verdict is stored.
--
-- A check that runs and is not recorded has not been performed, as far as
-- anything downstream can tell (§3). The verdict is the deliverable, not the
-- check.
--
-- A CONTRADICTED diff is WRITTEN, NOT REFUSED. Refusing it would delete the
-- evidence that the pipeline is wrong — which is how this was found in the first
-- place. It is simply never promotable.
--
-- WHY THE PROVENANCE COLUMNS ARE NOT OPTIONAL TO THE DESIGN. This runs Level 5
-- ahead of Levels 3 and 4, which are unenforced. Level 4 will change what counts
-- as chrome and therefore what text a diff compares. Without
-- `survivalSourceStateHash` and `survivalTextVersion` on the verdict, that change
-- silently invalidates every Level 5 result while all the counts stay green —
-- the exact shape this plan descends from.
--
-- Purely additive: six nullable columns and one enum. No data precondition, so
-- nothing here can abort a deploy on the corpus's contents. Nullable because rows
-- written before this level exist, and a row without a verdict is UNCHECKED —
-- which is not the same as passing.
-- CreateEnum
CREATE TYPE "SurvivalVerdict" AS ENUM ('SURVIVES', 'CONTRADICTED', 'UNCHECKABLE');

-- AlterTable
ALTER TABLE "UrlVersionDiff" ADD COLUMN     "survivalCheckedAt" TIMESTAMP(3),
ADD COLUMN     "survivalChunksChecked" INTEGER,
ADD COLUMN     "survivalContradicted" JSONB,
ADD COLUMN     "survivalSourceStateHash" TEXT,
ADD COLUMN     "survivalTextVersion" TEXT,
ADD COLUMN     "survivalVerdict" "SurvivalVerdict";

