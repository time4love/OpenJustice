-- The TERMINAL verdict of asking the chain what a row's anchoring transaction
-- registered.
--
-- WHY A BARE NULL WAS NOT ENOUGH. Measured in-container on staging 2026-08-30,
-- `forensics:confirm-anchors` dry run: 113 examined, 22 confirmed, 0 misanchored,
-- 0 with no trace on chain -- and 91 whose transaction could not be read while
-- the registry DOES hold their hash. The split is a clean date boundary: every
-- row stored 2026-08-22 is unreadable, every row stored 2026-08-28 readable. The
-- RPC prunes receipts by age.
--
-- So `anchoredHash IS NULL` had come to mean three different things at once:
-- never examined; examined while the RPC was down; and examined, with the answer
-- being that this route does not reach that far. Only the third is terminal, and
-- neither a CHECK constraint nor a gate on moving the anchor can be written
-- without telling them apart.
--
-- That conflation is this repository's most repeated defect shape and has been
-- unpicked four times already -- IntegrityCheck.chainId NULL, classifiedInputVersion
-- NULL versus STALE, UNAVAILABLE versus UNCHECKED, UNRECORDED versus stale. Each
-- time the fix was identical: never let one NULL carry more than one meaning.
--
-- A TRANSIENT FAILURE RECORDS NOTHING HERE. That is what keeps the null
-- single-meaning: null means no terminal verdict has been reached, and nothing
-- else. An RPC that answered nothing leaves the row exactly as it found it.
--
-- HOW a claim was confirmed lives in the VALUE -- CONFIRMED_BY_RECEIPT versus
-- CONFIRMED_BY_LOG -- rather than in a companion provenance column. The two
-- routes fail for different reasons (receipts pruned by AGE, logs capped by
-- RANGE), so which one answered is part of the verdict, not metadata about it.
--
-- ADDITIVE AND NULLABLE. No backfill: the value is an observation of the chain
-- and `forensics:confirm-anchors` is what makes it. The paired CHECK constraint
-- -- an anchored row must carry a terminal verdict, and a verdict naming a hash
-- must have one -- belongs in a later migration, once both environments have run
-- the pass. Every anchored row would violate it today.

-- CreateEnum
CREATE TYPE "AnchorCheckOutcome" AS ENUM ('CONFIRMED_BY_RECEIPT', 'CONFIRMED_BY_LOG', 'MISANCHORED', 'ANCHORED_NOTHING', 'TX_UNREADABLE', 'NO_TRACE_ON_CHAIN');

-- AlterTable
ALTER TABLE "UrlSnapshot" ADD COLUMN     "anchorCheck" "AnchorCheckOutcome";

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "anchorCheck" "AnchorCheckOutcome";
