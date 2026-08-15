-- Standing investigative concerns each evidence record advances.
--
-- Populated by ForensicAgent classification (see INVESTIGATIVE_CATEGORIES) and
-- used to gate auto-promotion of forensic diffs: a page change becomes evidence
-- only when it materially advances at least one concern of this investigation.
--
-- Intrinsic to the evidence and fixed at creation. Deliberately NOT a foreign
-- key to Thesis: evidence normally predates the theses that cite it, and one
-- record may support several. Thesis support is a relation computed per
-- (evidence, thesis) pair, not a property frozen here.

ALTER TABLE "Evidence" ADD COLUMN "investigativeCategories" TEXT[] DEFAULT ARRAY[]::TEXT[];
