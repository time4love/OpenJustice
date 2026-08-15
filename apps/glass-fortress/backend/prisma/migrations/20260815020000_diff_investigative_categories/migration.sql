-- ForensicAgent classification, stored on the diff as well as on the promoted
-- Evidence record.
--
-- Needed because a researcher can promote a diff manually via
-- POST /api/forensics/promote. That path has no ForensicAgent run of its own, so
-- without the classification here it would either write empty categories or pay
-- for a second agent call that could disagree with the stored
-- isLegallySignificant flag (which is derived from this column being non-empty).

ALTER TABLE "UrlVersionDiff" ADD COLUMN "investigativeCategories" TEXT[] DEFAULT ARRAY[]::TEXT[];
