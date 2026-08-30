-- A MISANCHORED verdict names the route that found it, as the passing ones do.
--
-- `CONFIRMED_BY_RECEIPT` and `CONFIRMED_BY_LOG` recorded how a claim was
-- confirmed; `MISANCHORED` recorded nothing. That asymmetry is backwards: the
-- bad answers are the ones a human actually re-opens, and the two rest on
-- different observations.
--
--   MISANCHORED_BY_RECEIPT  the transaction's own receipt log carried a hash the
--                           row does not claim. Direct.
--   MISANCHORED_BY_LOG      the registry's log names a different transaction for
--                           this row's hash. The transaction is INFERRED from the
--                           registry's stored timestamp and a bounded block
--                           window, so a re-check should start by widening that
--                           window rather than by believing the verdict.
--
-- WHY THE FULL TYPE SWAP RATHER THAN RENAME VALUE + ADD VALUE. The cheaper form
-- exists and preserves rows, but it appends the new label to the end of the type,
-- leaving the database's enum order different from the one `schema.prisma`
-- declares -- which `db:check-drift` would then report forever. A drift check
-- that always reports drift is a drift check nobody reads, and this repository
-- has already paid for one guard that had stopped meaning anything.
--
-- WHY THAT IS SAFE HERE, AND HOW IT FAILS IF IT IS NOT. The swap casts through
-- text, so a row holding the old `MISANCHORED` label would raise
-- "invalid input value for enum" -- an ERROR, never a silent drop. The deploy
-- would abort with the previous version still serving, which is the pipeline's
-- promise rather than luck.
--
-- No row can hold it today: `anchorCheck` was added hours ago by
-- 20260830010000 and `forensics:confirm-anchors --apply` has never been run in
-- any environment. That is a measured fact, not an assumption about an empty
-- table -- and the loud-failure property above is what makes it safe even if the
-- fact stops being true.

-- AlterEnum
BEGIN;
CREATE TYPE "AnchorCheckOutcome_new" AS ENUM ('CONFIRMED_BY_RECEIPT', 'CONFIRMED_BY_LOG', 'MISANCHORED_BY_RECEIPT', 'MISANCHORED_BY_LOG', 'ANCHORED_NOTHING', 'TX_UNREADABLE', 'NO_TRACE_ON_CHAIN');
ALTER TABLE "UrlSnapshot" ALTER COLUMN "anchorCheck" TYPE "AnchorCheckOutcome_new" USING ("anchorCheck"::text::"AnchorCheckOutcome_new");
ALTER TABLE "Evidence" ALTER COLUMN "anchorCheck" TYPE "AnchorCheckOutcome_new" USING ("anchorCheck"::text::"AnchorCheckOutcome_new");
ALTER TYPE "AnchorCheckOutcome" RENAME TO "AnchorCheckOutcome_old";
ALTER TYPE "AnchorCheckOutcome_new" RENAME TO "AnchorCheckOutcome";
DROP TYPE "AnchorCheckOutcome_old";
COMMIT;
