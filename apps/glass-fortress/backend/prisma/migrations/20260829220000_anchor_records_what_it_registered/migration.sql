-- An anchoring claim records WHAT it registered, not only THAT it registered.
--
-- `onChainTxHash` has never said which hash its transaction anchored. That was
-- inferred from whichever column the code anchored at the time, so the moment
-- the rule moves -- Level 3 clause 1 moves it from the Readability extraction to
-- the document -- every legacy row starts being audited against a hash nothing
-- registered. `auditOnChainAnchors` would report SNAPSHOT_UNANCHORED for 105
-- correctly anchored staging captures and `check_on_chain_status` would report
-- ORPHANED_ANCHOR for the same rows: the false alarm fixed on 2026-08-25,
-- returning on every capture.
--
-- ADDITIVE AND NULLABLE, AND DELIBERATELY NOT BACKFILLED.
--
-- Setting `anchoredHash = "contentHash"` here would be one statement and would
-- be wrong in the way this repository has already paid for: it stamps what we
-- BELIEVE was registered. On 2026-08-29 ninety-one integrity verdicts were
-- written carrying a chain they had never been reached against, and afterwards
-- nothing distinguished them from correct ones. A believed value is not
-- recoverable once written, because the evidence that it was believed is gone.
--
-- The value is therefore OBSERVED instead: `forensics:confirm-anchors` reads
-- each transaction's own EvidenceSubmitted log and writes the hash that
-- transaction actually registered. A row whose transaction registered something
-- else is DISCOVERED by that pass rather than papered over by this one.
--
-- NULL is an honest state -- "not yet confirmed against the chain" -- and it is
-- why the paired-null CHECK constraint is NOT added here. Every anchored row
-- would violate it on the day this applies. The constraint belongs in a second
-- migration, after both environments are confirmed, which is the same two-step
-- `documentHash` needed (20260827180000) and for the same reason: the value
-- cannot be derived in SQL from anything already stored.

-- AlterTable
ALTER TABLE "UrlSnapshot" ADD COLUMN     "anchoredHash" TEXT;

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "anchoredHash" TEXT;
