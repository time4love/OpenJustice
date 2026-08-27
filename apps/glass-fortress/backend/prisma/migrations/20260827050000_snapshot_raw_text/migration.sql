-- The archived document, stored beside the extraction derived from it.
--
-- Everything this platform computes — chunks, diffs, claim items, trajectories,
-- contentHash and the on-chain anchor — is derived from `fullText`, which is a
-- Readability extraction discarding roughly a third of the page. It discards a
-- DIFFERENT third on different captures, which manufactures removals that never
-- happened: a phrase present in the raw archive on three consecutive captures
-- was reported as removed and restored, and a published thesis asserts it was
-- added. See docs/gf-integrity-at-write-time-dev-plan.md.
--
-- Nullable HERE ONLY. A snapshot without the document it was extracted from is
-- not a valid snapshot, and a later migration sets both NOT NULL once existing
-- rows are backfilled. Reporting a partial state would be an admission that the
-- schema permits invalid rows; the answer is to make it impossible.
--
-- Additive and non-destructive: nothing is dropped, renamed or rewritten.
-- `contentHash` keeps its meaning, so every existing on-chain anchor stays valid.
ALTER TABLE "UrlSnapshot" ADD COLUMN "rawText" TEXT;
ALTER TABLE "UrlSnapshot" ADD COLUMN "rawContentHash" TEXT;
