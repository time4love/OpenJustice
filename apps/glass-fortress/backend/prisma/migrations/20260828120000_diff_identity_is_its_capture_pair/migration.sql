-- A DIFF IS THE PAIR OF CAPTURES IT SPANS.
--
-- `UrlVersionDiff` carried NO constraint of any kind, and diffs were written from
-- eight `create` call sites. A from-scratch rescan therefore duplicated every
-- diff it re-derived — which is why Level 1's capture recovery needed a bespoke
-- instrument rather than an ordinary scan.
--
-- IDENTITY IS THE CAPTURE PAIR, NOT THE DATE PAIR, and that was decided by
-- measurement. Both environments hold a date pair spanning two DIFFERENT
-- transitions:
--
--   2022-05-03 -> 2022-05-03    20220503051621 -> 20220503102648
--                               20220503102648 -> 20220503165508
--
-- Three captures on one day, two consecutive diffs, one date pair. Keying on
-- dates collapses them and discards a real transition — and it discards precisely
-- the same-day revert material `recordCapture`'s novelty rule exists to preserve.
-- That would be Level 1's defect one layer up.
--
-- SAFE ON THE EXISTING CORPUS, MEASURED BEFORE WRITING THIS:
--   81 of 81 diffs have both snapshot ids populated  — staging AND production
--   0 duplicate groups under (beforeSnapshotId, afterSnapshotId) — both
--
-- `SET NOT NULL` is its own guard: Postgres refuses it if any row holds a null,
-- so a surprise row aborts the deploy with the previous version still serving
-- rather than being silently accommodated.

-- The FKs are dropped and re-added only because Postgres requires it to change a
-- column's nullability. No data is touched by any statement here.
ALTER TABLE "UrlVersionDiff" DROP CONSTRAINT "UrlVersionDiff_beforeSnapshotId_fkey";
ALTER TABLE "UrlVersionDiff" DROP CONSTRAINT "UrlVersionDiff_afterSnapshotId_fkey";

-- NOT NULL because a diff whose captures we do not hold is UNVERIFIABLE BY
-- CONSTRUCTION: Level 5's invariant is that a reported change survives the
-- documents, and there would be none to check it against. Such a row could never
-- be validated and never be promoted, while occupying the corpus as though it had
-- been checked. The gap itself is not lost — it lives at the capture layer, where
-- `CdxIndexEntry` records UNSERVABLE / UNFETCHED as first-class queryable state.
ALTER TABLE "UrlVersionDiff"
  ALTER COLUMN "beforeSnapshotId" SET NOT NULL,
  ALTER COLUMN "afterSnapshotId" SET NOT NULL;

-- THE CONSTRAINT THAT MAKES A RESCAN CONVERGE instead of accumulate. With it,
-- re-deriving a diff for a pair already held updates that row rather than adding
-- a second one — the hazard removed rather than avoided.
CREATE UNIQUE INDEX "UrlVersionDiff_beforeSnapshotId_afterSnapshotId_key"
  ON "UrlVersionDiff"("beforeSnapshotId", "afterSnapshotId");

CREATE INDEX "UrlVersionDiff_trackedUrlId_afterDate_idx"
  ON "UrlVersionDiff"("trackedUrlId", "afterDate");

-- Re-added as RESTRICT rather than the SET NULL an optional relation gets.
--
-- NOT INCIDENTAL, and worth stating rather than passing as generated
-- boilerplate: deleting a capture that a diff depends on is now REFUSED, where
-- before it would have quietly nulled the diff's pair and left a row nothing
-- could check. Nothing in this system is deleted, so the stricter behaviour costs
-- nothing and removes a way for the corpus to acquire unverifiable rows without
-- anyone choosing it.
ALTER TABLE "UrlVersionDiff" ADD CONSTRAINT "UrlVersionDiff_beforeSnapshotId_fkey"
  FOREIGN KEY ("beforeSnapshotId") REFERENCES "UrlSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UrlVersionDiff" ADD CONSTRAINT "UrlVersionDiff_afterSnapshotId_fkey"
  FOREIGN KEY ("afterSnapshotId") REFERENCES "UrlSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
