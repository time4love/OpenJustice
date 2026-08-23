-- Records the identity an evidence record carried before the fileHash moved to
-- being derived from its two archived snapshots.
--
-- Purely additive: two nullable columns, no drops, no constraint changes.
--
-- The previous hash was computed over the classifier's EXTRACTED ITEMS, which
-- reclassification rewrites — so five of seven anchored records could no longer
-- be recomputed from the database at all. The replacement is derived from
-- UrlSnapshot timestamps and content hashes, which are immutable and now
-- anchored in their own right.
--
-- Anchors registered under the old hashes stay on-chain and match nothing
-- derivable. That is deliberate and is why these columns exist: an orphaned
-- anchor with a recorded cause is a migration, and one without is indistinguishable
-- from tampering.

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "previousFileHash" TEXT,
ADD COLUMN     "previousOnChainTxHash" TEXT;

